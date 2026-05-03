"""
Full MPS Prediction Pipeline
=====================================================================
Covers:
  1. Load & merge 23-24 and 24-25 CSVs
  2. Preprocessing  (dtype normalisation, mother-tongue unification,
                     quarterly -> subject avg aggregation,
                     school_year flag, within-year z-score option,
                     PCA on subject avgs for linear models)
  3. Stratified train/test split (balanced across school years)
  4. Model training  (Linear, Lasso, DecisionTree, RandomForest,
                      GradientBoosting)
  5. Evaluation      (MAE, RMSE, R^2)
  6. Collinearity analysis  (Pearson heatmap + VIF chart)
  7. Feature importance + SHAP explainer
  8. Pass-probability helper  P(MPS >= 75)
  9. Save artifact -> best_model.joblib

Outputs (written to --out directory, default = ./outputs):
  best_model.joblib
  correlation_heatmap.png
  vif_chart.png
  analysis_report.txt
  model_results.csv
  school_report.csv
  test_results.csv

Usage:
  DEFAULT RUN: python pipeline.py
  USE THIS FOR DEFENSE(zscore is applied, use --no-zscore to disable): python pipeline.py --csv1 23-24.csv --csv2 24-25.csv --out ./outputs --no-pca
  USE THIS FOR DEFENSE(PCA applied and zscore applied): python pipeline.py --csv1 23-24.csv --csv2 24-25.csv --out ./pca_output 

Notes on school_year generalization
-------------------------------------
school_year is assigned as an auto-incrementing integer cohort rank
(0, 1, 2, ...) based on load order. It is used ONLY for within-year
z-scoring and is STRIPPED from model features before training.
This means:
  - Any new CSV uploaded for inference works without retraining.
  - No binary 0/1 assumption; N cohorts are supported.
  - No data leakage: model never sees year label at inference time.
  - Z-score still works: new single-cohort upload z-scored as one group.
"""

# -- std lib ------------------------------------------------------------------
import os
import sys
import argparse
import warnings
warnings.filterwarnings("ignore")

# -- third-party --------------------------------------------------------------
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import TwoSlopeNorm
from matplotlib.patches import Patch
import seaborn as sns
import joblib
import shap

from scipy.stats import norm, ttest_ind

from sklearn.decomposition import PCA
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.linear_model import LinearRegression, Lasso
from sklearn.tree import DecisionTreeRegressor
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from statsmodels.stats.outliers_influence import variance_inflation_factor


# ============================================================================
# CONSTANTS
# ============================================================================
TARGET      = "MPS"

# Columns preserved for output display but NEVER used for training.
# All are extracted before any ML step and rejoined to results at the end.
DROP_COLS   = ["learnerID", "School", "Section", "Full Name", "Name"]

# school_year is also excluded from model features (used only for z-scoring).
# Listed separately so the intent is explicit.
COHORT_COL  = "school_year"

TEST_SIZE   = 0.30
RANDOM_SEED = 42

MOTHER_TONGUE_MAP = {
    "Filipino": "Tagalog",
    "Iloko":    "Ilocano",
}

SUBJECT_AGGREGATE_MAP = {
    "Filipino_avg": ["Filipino 1", "Filipino 2", "Filipino 3", "Filipino 4", "Filipino 5"],
    "English_avg":  ["English 1",  "English 2",  "English 3",  "English 4",  "English 5"],
    "Math_avg":     ["Math 1",     "Math 2",     "Math 3",     "Math 4",     "Math 5"],
    "AralPan_avg":  ["Aral Pan 1", "Aral Pan 2", "Aral Pan 3", "Aral Pan 4", "Aral Pan 5"],
    "Science_avg":  ["Science 3",  "Science 4",  "Science 5"],
}

SUBJECT_AVG_COLS = list(SUBJECT_AGGREGATE_MAP.keys())

PROFICIENCY_BINS   = [0, 25, 50, 75, 90, 100]
PROFICIENCY_LABELS = ["Not Proficient", "Low Proficient", "Nearly Proficient",
                      "Proficient", "Highly Proficient"]

MODELS = {
    "Linear":           LinearRegression(),
    "Lasso":            Lasso(alpha=0.01),
    "DecisionTree":     DecisionTreeRegressor(
                            random_state=RANDOM_SEED,
                            ),
    "RandomForest":     RandomForestRegressor(
                            n_estimators=100,
                            random_state=RANDOM_SEED,
                            n_jobs=-1,
                            ),
    "GradientBoosting": GradientBoostingRegressor(
                            random_state=RANDOM_SEED,
                            n_estimators=100,
                            ),
}

# -- plot palette -------------------------------------------------------------
BG      = "#f7f9fc"
PANEL   = "#ffffff"
ACCENT  = "#4da6ff"
ACCENT2 = "#ff6b6b"
C23     = "#4da6ff"
C24     = "#ff6b6b"
TEXT    = "#1f2937"
SUBTEXT = "#6b7280"
GRID    = "#e5e7eb"
PASS_C  = "#34c759"
FAIL_C  = ACCENT2

plt.rcParams.update({
    "figure.facecolor": BG,   "axes.facecolor":  PANEL,
    "axes.edgecolor":   GRID, "axes.labelcolor": TEXT,
    "xtick.color":      SUBTEXT, "ytick.color":  SUBTEXT,
    "text.color":       TEXT, "grid.color":      GRID,
    "font.family":      "monospace",
    "axes.titlesize":   13,   "axes.labelsize":  11,
})


# ============================================================================
# SECTION 1 - PREPROCESSING
# ============================================================================

def extract_display_cols(df: pd.DataFrame) -> pd.DataFrame:
    """
    Extract all DROP_COLS that exist in df into a separate DataFrame.
    Preserves original index for later join.
    Always returns a DataFrame (empty cols if none found).
    """
    present = [c for c in DROP_COLS if c in df.columns]
    return df[present].copy() if present else pd.DataFrame(index=df.index)


def normalize_dtypes(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    prefixes = ("Filipino", "English", "Math", "Aral Pan", "Science", "Age")
    for col in df.columns:
        if any(col.startswith(p) for p in prefixes):
            df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


def apply_mother_tongue_map(df: pd.DataFrame) -> pd.DataFrame:
    if "Mother Tongue" in df.columns:
        df = df.copy()
        df["Mother Tongue"] = df["Mother Tongue"].replace(MOTHER_TONGUE_MAP)
    return df


def aggregate_subject_grades(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    to_drop = []
    for new_col, src_cols in SUBJECT_AGGREGATE_MAP.items():
        present = [c for c in src_cols if c in df.columns]
        if not present:
            continue
        df[new_col] = df[present].apply(pd.to_numeric, errors="coerce").mean(axis=1)
        to_drop.extend(present)
    return df.drop(columns=to_drop, errors="ignore")


def check_distribution_shift(df1: pd.DataFrame, df2: pd.DataFrame,
                              cols: list) -> dict:
    results = {}
    for col in cols:
        if col not in df1.columns or col not in df2.columns:
            continue
        a = df1[col].dropna()
        b = df2[col].dropna()
        t_stat, p_val = ttest_ind(a, b, equal_var=False)
        results[col] = {
            "mean_23_24": round(a.mean(), 3),
            "mean_24_25": round(b.mean(), 3),
            "mean_diff":  round(b.mean() - a.mean(), 3),
            "p_value":    round(p_val, 4),
            "shift_detected": p_val < 0.05,
        }
    return results


def zscore_within_cohort(df: pd.DataFrame, cols: list,
                          cohort_col: str = COHORT_COL) -> pd.DataFrame:
    """
    Z-score each subject avg column within its cohort group.
    Works for any number of cohorts (not just 2).
    Cohort col is auto-assigned integer rank; never seen by the model.
    """
    df = df.copy()
    for col in cols:
        if col not in df.columns:
            continue
        df[col] = df.groupby(cohort_col)[col].transform(
            lambda x: (x - x.mean()) / (x.std(ddof=0) if x.std(ddof=0) > 0 else 1)
        )
    return df


def apply_pca_on_subjects(X_train: pd.DataFrame,
                           X_test:  pd.DataFrame,
                           subject_cols: list,
                           n_components: int = 3):
    present = [c for c in subject_cols if c in X_train.columns]
    if not present:
        return X_train, X_test, None, []

    n_components = min(n_components, len(present))
    pca = PCA(n_components=n_components, random_state=RANDOM_SEED)

    train_pcs = pca.fit_transform(X_train[present].fillna(X_train[present].median()))
    test_pcs  = pca.transform(X_test[present].fillna(X_train[present].median()))

    pc_cols = [f"academic_PC{i+1}" for i in range(n_components)]

    X_train = X_train.drop(columns=present).copy()
    X_test  = X_test.drop(columns=present).copy()

    for i, name in enumerate(pc_cols):
        X_train[name] = train_pcs[:, i]
        X_test[name]  = test_pcs[:, i]

    return X_train, X_test, pca, pca.explained_variance_ratio_.tolist()


# ============================================================================
# SECTION 2 - SKLEARN PIPELINE HELPERS
# ============================================================================

def build_preprocessor(num_cols: list, cat_cols: list) -> ColumnTransformer:
    num_pipe = Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("scale",  StandardScaler()),
    ])
    cat_pipe = Pipeline([
        ("impute", SimpleImputer(strategy="most_frequent")),
        ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
    ])
    return ColumnTransformer([
        ("num", num_pipe, num_cols),
        ("cat", cat_pipe, cat_cols),
    ], verbose_feature_names_out=False)


def get_transformed_feature_names(preprocessor: ColumnTransformer,
                                   num_cols: list, cat_cols: list) -> list:
    try:
        ohe          = preprocessor.named_transformers_["cat"].named_steps["onehot"]
        cat_features = ohe.get_feature_names_out(cat_cols).tolist()
    except Exception:
        cat_features = []
    return num_cols + cat_features


# ============================================================================
# SECTION 3 - EVALUATION & EXPLAINABILITY
# ============================================================================

def evaluate(pipe, X_test, y_test) -> dict:
    preds = pipe.predict(X_test)
    return {
        "MAE":  round(float(mean_absolute_error(y_test, preds)), 4),
        "RMSE": round(float(np.sqrt(mean_squared_error(y_test, preds))), 4),
        "R2":   round(float(r2_score(y_test, preds)), 4),
    }


def get_pass_probability(pred_score: float, residual_std: float,
                          threshold: float = 75) -> float:
    return round(float(1.0 - norm.cdf(threshold, loc=pred_score, scale=residual_std)), 4)


def get_feature_importance(pipe, transformed_feature_names: list) -> dict:
    model = pipe.named_steps["model"]
    if hasattr(model, "feature_importances_"):
        importances = model.feature_importances_
    elif hasattr(model, "coef_"):
        importances = np.abs(model.coef_)
    else:
        return {}
    features = transformed_feature_names[:len(importances)]
    indices  = np.argsort(importances)[::-1].tolist()
    return {
        "features":       features,
        "importances":    importances.tolist(),
        "sorted_indices": indices,
    }

def encode_proficiency(scores: np.ndarray) -> pd.Categorical:
    return pd.cut(scores, bins=PROFICIENCY_BINS, labels=PROFICIENCY_LABELS,
                  include_lowest=True, right=False)

def generate_school_report(y_true: np.ndarray, y_pred: np.ndarray,
                           school_labels: np.ndarray, out_path: str) -> pd.DataFrame:
    df = pd.DataFrame({
        "School":         school_labels,
        "Actual_MPS":     y_true,
        "Predicted_MPS":  y_pred,
        "Absolute_Error": np.abs(y_true - y_pred),
    })

    df["Actual_Proficiency"]    = encode_proficiency(df["Actual_MPS"])
    df["Predicted_Proficiency"] = encode_proficiency(df["Predicted_MPS"])

    summary = df.groupby("School").agg({
        "Actual_MPS":     ["count", "mean"],
        "Predicted_MPS":  ["mean"],
        "Absolute_Error": "mean",
    }).round(4)

    summary.columns = ["Student_Count", "Avg_Actual_MPS", "Avg_Predicted_MPS", "MAE"]
    summary = summary.reset_index()
    summary["Avg_Bias"] = (summary["Avg_Predicted_MPS"] - summary["Avg_Actual_MPS"]).round(4)

    actual_dist = (df.groupby("School")["Actual_Proficiency"]
                     .value_counts(normalize=True).unstack(fill_value=0) * 100)
    actual_dist.columns = [f"Actual_{label}" for label in PROFICIENCY_LABELS]

    pred_dist = (df.groupby("School")["Predicted_Proficiency"]
                   .value_counts(normalize=True).unstack(fill_value=0) * 100)
    pred_dist.columns = [f"Pred_{label}" for label in PROFICIENCY_LABELS]

    result = summary.merge(actual_dist, on="School", how="left")
    result = result.merge(pred_dist, on="School", how="left")

    cols_order = ["School", "Student_Count", "Avg_Actual_MPS",
                  "Avg_Predicted_MPS", "Avg_Bias", "MAE"]
    cols_order += [f"Actual_{l}" for l in PROFICIENCY_LABELS]
    cols_order += [f"Pred_{l}" for l in PROFICIENCY_LABELS]
    result = result[[c for c in cols_order if c in result.columns]]

    pct_cols = [c for c in result.columns if c.startswith("Actual_") or c.startswith("Pred_")]
    result[pct_cols] = result[pct_cols].round(2)

    result.to_csv(out_path, index=False)
    print(f"  OK school_report.csv  ({len(result)} schools)")
    return result


def build_shap_explainer(pipe, X_train: pd.DataFrame):
    model = pipe.named_steps["model"]
    prep  = pipe.named_steps["prep"]
    X_tr  = prep.transform(X_train)
    if hasattr(model, "feature_importances_"):
        return shap.TreeExplainer(model)
    elif hasattr(model, "coef_"):
        return shap.LinearExplainer(model, X_tr)
    else:
        bg = shap.sample(X_tr, min(50, len(X_tr)))
        return shap.KernelExplainer(model.predict, bg)


# ============================================================================
# SECTION 4 - COLLINEARITY ANALYSIS & PLOTS
# ============================================================================

def compute_vif(df: pd.DataFrame) -> pd.DataFrame:
    df = df.select_dtypes(include=np.number).dropna()
    df = df.loc[:, df.std() > 0]
    while True:
        try:
            vifs = [variance_inflation_factor(df.values, i) for i in range(df.shape[1])]
            break
        except np.linalg.LinAlgError:
            df = df.iloc[:, :-1]
            if df.shape[1] == 0:
                return pd.DataFrame(columns=["feature", "VIF"])
    return (pd.DataFrame({"feature": df.columns.tolist(), "VIF": vifs})
              .sort_values("VIF", ascending=False)
              .reset_index(drop=True))


def vif_severity(vif: float):
    if vif >= 10: return "HIGH",   ACCENT2
    if vif >= 5:  return "MEDIUM", "#f5a623"
    return "OK", "#4cd964"


def plot_correlation_heatmap(df: pd.DataFrame, out_path: str):
    num_df = df.select_dtypes(include=np.number)
    corr   = num_df.corr()
    n      = len(corr)

    fig, ax = plt.subplots(figsize=(max(10, n * 0.6), max(8, n * 0.55)))
    fig.patch.set_facecolor(BG)

    norm_c = TwoSlopeNorm(vmin=-1, vcenter=0, vmax=1)
    cmap   = sns.diverging_palette(250, 10, s=80, l=45, as_cmap=True)
    mask   = np.triu(np.ones_like(corr, dtype=bool), k=1)

    sns.heatmap(corr, ax=ax, mask=mask, cmap=cmap, norm=norm_c,
                annot=(n <= 20), fmt=".2f",
                annot_kws={"size": 7, "color": TEXT},
                linewidths=0.4, linecolor=BG, square=True,
                cbar_kws={"shrink": 0.7, "label": "Pearson r"})

    ax.set_title("Feature Correlation Matrix", color=TEXT, pad=16,
                 fontsize=15, fontweight="bold")
    ax.tick_params(axis="x", rotation=45, labelsize=8)
    ax.tick_params(axis="y", rotation=0,  labelsize=8)

    cbar = ax.collections[0].colorbar
    cbar.ax.yaxis.set_tick_params(color=SUBTEXT, labelcolor=SUBTEXT)
    cbar.outline.set_edgecolor(GRID)

    high_pairs = [
        (corr.columns[i], corr.columns[j], corr.iloc[i, j])
        for i in range(n) for j in range(i)
        if abs(corr.iloc[i, j]) >= 0.8
    ]
    if high_pairs:
        top = sorted(high_pairs, key=lambda x: -abs(x[2]))[:8]
        lines = [f"|r|>=0.8 pairs ({len(high_pairs)}):"] + \
                [f"  {a[:14]} <-> {b[:14]}  r={r:+.2f}" for a, b, r in top]
        fig.text(0.01, 0.01, "\n".join(lines), fontsize=7.5, color=SUBTEXT,
                 va="bottom", family="monospace",
                 bbox=dict(boxstyle="round,pad=0.4", facecolor=PANEL,
                           edgecolor=GRID, alpha=0.9))

    plt.tight_layout()
    fig.savefig(out_path, dpi=150, bbox_inches="tight", facecolor=BG)
    plt.close(fig)
    print(f"  OK correlation_heatmap.png")
    return corr, high_pairs


def plot_vif_chart(vif_df: pd.DataFrame, out_path: str):
    if vif_df.empty:
        print("  ! VIF empty - skipping chart.")
        return

    plot_df = vif_df.head(30).copy().reset_index(drop=True)  # reset index
    plot_df["VIF_plot"] = plot_df["VIF"].replace([np.inf], 999).clip(upper=60)
    colors = [vif_severity(v)[1] for v in plot_df["VIF"]]

    fig, ax = plt.subplots(figsize=(10, max(5, len(plot_df) * 0.5)))  # slightly more breathing room
    fig.patch.set_facecolor(BG)

    bars = ax.barh(plot_df["feature"][::-1], plot_df["VIF_plot"][::-1],
                   color=colors[::-1], height=0.65, edgecolor="none")

    x_max = plot_df["VIF_plot"].max() * 1.4 + 2 
    ax.set_xlim(0, x_max)

    for thresh, label, col in [(5, "Moderate (5)", "#f5a623"),
                            (10, "High (10)", ACCENT2)]:
        if thresh <= x_max:  # only draw if visible
            ax.axvline(thresh, color=col, linewidth=1.2, linestyle="--", alpha=0.7)
            ax.text(thresh + 0.3, -0.6, label, color=col, fontsize=8, va="top")

    # FIX: iterate by index, not value lookup
    for bar, (_, row) in zip(bars[::-1], plot_df.iterrows()):
        label = f"{row['VIF']:.1f}" if np.isfinite(row["VIF"]) else "inf"
        ax.text(bar.get_width() + 0.3,
                bar.get_y() + bar.get_height() / 2,
                label, va="center", ha="left", fontsize=8, color=TEXT)

    ax.set_xlabel("Variance Inflation Factor (VIF)", color=TEXT)
    ax.set_title("Multicollinearity Diagnostic - VIF per Feature",
                 color=TEXT, fontsize=14, fontweight="bold", pad=12)
    ax.set_xlim(0, plot_df["VIF_plot"].max() * 1.18 + 2)
    ax.grid(axis="x", color=GRID, linewidth=0.6)
    ax.set_axisbelow(True)

    legend_handles = [
        Patch(facecolor="#4cd964", label="OK  (VIF < 5)"),
        Patch(facecolor="#f5a623", label="Moderate (5-10)"),
        Patch(facecolor=ACCENT2,   label="High  (VIF >= 10)"),
    ]
    ax.legend(handles=legend_handles, loc="lower right", framealpha=0.25,
              edgecolor=GRID, labelcolor=TEXT, fontsize=9)

    plt.tight_layout()
    fig.savefig(out_path, dpi=150, bbox_inches="tight", facecolor=BG)
    plt.close(fig)
    print(f"  OK vif_chart.png")


def write_analysis_report(corr, high_pairs, vif_df, shift_results,
                           pca_evr, out_path: str, best_name: str,
                           metrics: list):
    W = 67
    lines = ["=" * W,
             "  MPS PREDICTION PIPELINE - FULL ANALYSIS REPORT",
             "=" * W]

    lines += [f"\n  Best Model : {best_name}"]
    for m in metrics:
        if m["model"] == best_name:
            lines.append(f"  Metrics    : MAE={m['MAE']}  "
                         f"RMSE={m['RMSE']}  R^2={m['R2']}")

    lines += [f"\n  All models:"]
    lines.append(f"  {'Model':<20} {'MAE':>7} {'RMSE':>7} {'R2':>7}")
    lines.append(f"  {'-'*20} {'-------':>7} {'-------':>7} {'-------':>7}")
    for m in metrics:
        tag = " <- best" if m["model"] == best_name else ""
        lines.append(f"  {m['model']:<20} {m['MAE']:>7} {m['RMSE']:>7} "
                     f"{m['R2']:>7}{tag}")

    if shift_results:
        lines += [f"\n{'-'*W}",
                  "  DISTRIBUTION SHIFT TEST (Welch t-test, alpha=0.05)",
                  f"{'-'*W}",
                  f"  {'Column':<18} {'Cohort0 mean':>10} {'Cohort1 mean':>10} "
                  f"{'Dmean':>7} {'p-value':>9} {'Shift?'}"]
        lines.append(f"  {'-'*18} {'----------':>10} {'----------':>10} "
                     f"{'-------':>7} {'---------':>9} {'------'}")
        for col, r in shift_results.items():
            flag = "YES !" if r["shift_detected"] else "no"
            lines.append(f"  {col:<18} {r['mean_23_24']:>10} {r['mean_24_25']:>10} "
                         f"{r['mean_diff']:>7} {r['p_value']:>9} {flag}")

    if pca_evr:
        lines += [f"\n{'-'*W}",
                  "  PCA - EXPLAINED VARIANCE (subject avg columns)",
                  f"{'-'*W}"]
        cumulative = 0.0
        for i, evr in enumerate(pca_evr):
            cumulative += evr
            lines.append(f"  PC{i+1}: {evr*100:5.1f}%   cumulative: {cumulative*100:5.1f}%")

    lines += [f"\n{'-'*W}",
              f"  HIGH CORRELATION PAIRS  (|Pearson r| >= 0.80)  - "
              f"{len(high_pairs)} found",
              f"{'-'*W}"]
    if high_pairs:
        lines.append(f"  {'Feature A':<22} {'Feature B':<22} {'r':>6}")
        lines.append(f"  {'-'*22} {'-'*22} {'------':>6}")
        for a, b, r in sorted(high_pairs, key=lambda x: -abs(x[2])):
            lines.append(f"  {a:<22} {b:<22} {r:>+6.3f}")
    else:
        lines.append("  None - no feature pairs exceed |r|=0.80")

    lines += [f"\n{'-'*W}",
              "  VARIANCE INFLATION FACTORS  (sorted descending)",
              f"{'-'*W}",
              f"  {'Feature':<28} {'VIF':>10}  Status"]
    lines.append(f"  {'-'*28} {'----------':>10}  ------")
    for _, row in vif_df.iterrows():
        v      = row["VIF"]
        status = vif_severity(v)[0]
        vstr   = f"{v:.2f}" if np.isfinite(v) else "inf"
        lines.append(f"  {row['feature']:<28} {vstr:>10}  {status}")

    lines += [f"\n{'-'*W}",
              "  INTERPRETATION GUIDE",
              f"{'-'*W}",
              "  VIF < 5    OK       - no significant multicollinearity",
              "  VIF 5-10   MEDIUM   - moderate; consider review",
              "  VIF > 10   HIGH     - strong; consider PCA or feature removal",
              "  |r| > 0.8  High pairwise correlation (verify with VIF)",
              "  Shift?=YES - cohort means differ; within-cohort z-scoring used",
              "  school_year stripped from model features (z-score only)",
              "=" * W]

    text = "\n".join(lines)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"  OK analysis_report.txt")
    print("\n" + text)


# ============================================================================
# SECTION 5 - MAIN PIPELINE
# ============================================================================

def parse_args():
    p = argparse.ArgumentParser(description="MPS Prediction Pipeline")
    p.add_argument("--csv1",      default="23-24.csv",  help="First cohort CSV (cohort rank 0)")
    p.add_argument("--csv2",      default="24-25.csv",  help="Second cohort CSV (cohort rank 1)")
    p.add_argument("--extra-csvs", nargs="*", default=[],
                   help="Additional cohort CSVs (cohort ranks 2, 3, ...)")
    p.add_argument("--out",       default="outputs",    help="Output directory")
    p.add_argument("--no-zscore", action="store_true",  help="Skip within-cohort z-scoring")
    p.add_argument("--no-pca",    action="store_true",  help="Skip PCA on subject avgs")
    p.add_argument("--pca-components", type=int, default=2,
                   help="Number of PCA components for subject avgs (default: 2)")
    p.add_argument("--threshold", type=float, default=75,
                   help="Pass/fail threshold for P(MPS >= threshold) (default: 75)")
    return p.parse_args()


def main():
    args = parse_args()
    os.makedirs(args.out, exist_ok=True)

    sep = "=" * 65

    # -- Step 1: Load CSVs ----------------------------------------------------
    print(f"\n{sep}\n  STEP 1 - LOADING DATA\n{sep}")

    # Build ordered list of (label, path) pairs.
    # Cohort rank = position in list (0, 1, 2, ...).
    # Label is for display only; rank is what gets stored in school_year.
    csv_pairs = [("23-24", args.csv1), ("24-25", args.csv2)]
    for i, extra in enumerate(args.extra_csvs or []):
        label = os.path.splitext(os.path.basename(extra))[0]
        csv_pairs.append((label, extra))

    datasets     = {}   # label -> raw df (with school_year set)
    display_cols = {}   # label -> df of DROP_COLS only (raw, pre-drop)

    for rank, (label, path) in enumerate(csv_pairs):
        try:
            df = pd.read_csv(path)
            # Store display cols BEFORE anything is dropped
            display_cols[label] = extract_display_cols(df)
            display_cols[label].index = df.index          # keep original index
            # Assign cohort rank (integer, not binary 0/1)
            df[COHORT_COL] = rank
            datasets[label] = df
            print(f"  Cohort {rank} [{label}]: {len(df)} rows x {len(df.columns)} cols  ({path})")
        except FileNotFoundError:
            print(f"  !  {path} not found - skipping [{label}]")

    if not datasets:
        sys.exit("ERROR: No CSV files found. Check --csv1 / --csv2 paths.")

    # -- Step 2: Per-dataset preprocessing -----------------------------------
    print(f"\n{sep}\n  STEP 2 - PREPROCESSING\n{sep}")
    cleaned = {}
    for label, df in datasets.items():
        df = df.drop(columns=DROP_COLS, errors="ignore")   # drop display cols now
        df = normalize_dtypes(df)
        df = apply_mother_tongue_map(df)
        df = aggregate_subject_grades(df)
        cleaned[label] = df
        subj_present = [c for c in SUBJECT_AVG_COLS if c in df.columns]
        print(f"  [{label}]: after aggregation -> {df.shape[1]} cols  "
              f"| subject avgs: {subj_present}")

    # -- Step 3: Distribution shift check (first two cohorts only) -----------
    print(f"\n{sep}\n  STEP 3 - DISTRIBUTION SHIFT TEST\n{sep}")
    shift_results = {}
    cohort_list   = list(cleaned.values())
    if len(cohort_list) >= 2:
        df_a, df_b = cohort_list[0], cohort_list[1]
        shift_results = check_distribution_shift(df_a, df_b, SUBJECT_AVG_COLS)
        any_shift = any(v["shift_detected"] for v in shift_results.values())
        for col, r in shift_results.items():
            flag = "!  SHIFT" if r["shift_detected"] else "OK"
            print(f"  {col:<18}  c0 mean={r['mean_23_24']:6.2f}  "
                  f"c1 mean={r['mean_24_25']:6.2f}  "
                  f"D={r['mean_diff']:+6.2f}  p={r['p_value']:.4f}  {flag}")
        if any_shift and not args.no_zscore:
            print("\n  -> Distribution shift detected. Within-cohort z-scoring will apply.")
        elif any_shift and args.no_zscore:
            print("\n  -> Shift detected but --no-zscore set. Skipping z-score.")
        else:
            print("\n  -> No significant shift detected.")
    else:
        print("  (Single cohort loaded - shift test skipped)")

    # -- Step 4: Combine datasets & build global display_df ------------------
    print(f"\n{sep}\n  STEP 4 - COMBINE & STRATIFIED SPLIT\n{sep}")

    # Reset index per dataset before concat so indices are unique after merge
    cleaned_reset   = {}
    display_reset   = {}
    offset = 0
    for label, df in cleaned.items():
        df_r = df.reset_index(drop=True)
        df_r.index = df_r.index + offset
        cleaned_reset[label] = df_r

        dc = display_cols[label].reset_index(drop=True)
        dc.index = dc.index + offset
        display_reset[label] = dc

        offset += len(df_r)

    combined     = pd.concat(list(cleaned_reset.values()))
    all_display  = pd.concat(list(display_reset.values()))   # aligned with combined

    if TARGET not in combined.columns:
        sys.exit(f"ERROR: Target column '{TARGET}' not found in data.")

    # Within-cohort z-score (z-score uses group means only, no global leakage)
    if not args.no_zscore and shift_results:
        combined = zscore_within_cohort(combined, SUBJECT_AVG_COLS)
        print("  Within-cohort z-scoring applied.")

    X_full = combined.drop(columns=[TARGET])
    y_full = combined[TARGET]

    # Strip school_year from features BEFORE train/test split.
    # It was used for z-score grouping above; model never sees it.
    # This is the key change for generalization: model is year-agnostic.
    stratify_col = X_full[COHORT_COL].copy() if COHORT_COL in X_full.columns else None
    X_full = X_full.drop(columns=[COHORT_COL], errors="ignore")

    X_train, X_test, y_train, y_test = train_test_split(
        X_full, y_full,
        test_size=TEST_SIZE,
        random_state=RANDOM_SEED,
        stratify=stratify_col,   # still stratify by cohort rank for balance
    )

    # Align display cols with train/test indices
    display_train = all_display.loc[X_train.index]
    display_test  = all_display.loc[X_test.index]

    print(f"  Total  : {len(combined)} rows")
    print(f"  Train  : {len(X_train)} rows")
    print(f"  Test   : {len(X_test)} rows")
    if stratify_col is not None:
        vc = stratify_col.iloc[X_train.index].value_counts().sort_index()
        print(f"  Train cohort split: " +
              "  ".join(f"rank{k}={v}" for k, v in vc.items()))

    # -- Step 5: PCA on subject averages --------------------------------------
    pca_obj = None
    pca_evr = []

    if not args.no_pca:
        print(f"\n{sep}\n  STEP 5 - PCA ON SUBJECT AVG COLUMNS\n{sep}")
        X_train, X_test, pca_obj, pca_evr = apply_pca_on_subjects(
            X_train, X_test, SUBJECT_AVG_COLS, n_components=args.pca_components
        )
        if pca_evr:
            for i, evr in enumerate(pca_evr):
                print(f"  PC{i+1}: {evr*100:.1f}% variance explained  "
                      f"(cumulative: {sum(pca_evr[:i+1])*100:.1f}%)")
            print(f"  Subject avg cols replaced with: "
                  f"{[c for c in X_train.columns if c.startswith('academic_PC')]}")
        else:
            print("  No subject avg columns found - PCA skipped.")
    else:
        print(f"\n  STEP 5 - PCA skipped (--no-pca flag set)")

    # -- Step 6: Build sklearn preprocessor -----------------------------------
    print(f"\n{sep}\n  STEP 6 - SKLEARN PREPROCESSOR\n{sep}")
    num_cols = X_train.select_dtypes(include=np.number).columns.tolist()
    cat_cols = X_train.select_dtypes(exclude=np.number).columns.tolist()
    print(f"  Numeric  ({len(num_cols)}): {num_cols}")
    print(f"  Categorical ({len(cat_cols)}): {cat_cols}")
    preprocessor = build_preprocessor(num_cols, cat_cols)

    # -- Step 7: Train all models ----------------------------------------------
    print(f"\n{sep}\n  STEP 7 - MODEL TRAINING\n{sep}")

    results        = []
    per_model_outs = {}
    best_pipe, best_r2, best_name = None, -np.inf, None

    for name, model in MODELS.items():
        pipe = Pipeline([("prep", preprocessor), ("model", model)])
        try:
            pipe.fit(X_train, y_train)
            y_pred  = pipe.predict(X_test)
            metrics = evaluate(pipe, X_test, y_test)
            results.append({"model": name, **metrics})
            per_model_outs[name] = {
                "y_true":     y_test.values,
                "y_pred":     y_pred,
                "y_true_cat": encode_proficiency(y_test.values).astype(str),
                "y_pred_cat": encode_proficiency(y_pred).astype(str),
            }
            star = ""
            if metrics["R2"] > best_r2:
                best_r2, best_pipe, best_name = metrics["R2"], pipe, name
                star = "  *"
            print(f"  {name:<20}  MAE={metrics['MAE']:.4f}  "
                  f"RMSE={metrics['RMSE']:.4f}  R^2={metrics['R2']:.4f}{star}")
        except Exception as e:
            print(f"  [ERROR] {name}: {e}")

    print(f"\n  Best model: {best_name}  (R^2 = {best_r2:.4f})")

    # -- Step 8: School-level report -------------------------------------------
    print(f"\n{sep}\n  STEP 8 - SCHOOL-LEVEL ANALYSIS\n{sep}")

    school_test = display_test["School"].values if "School" in display_test.columns else None

    if school_test is not None:
        y_pred_best = best_pipe.predict(X_test)
        school_report_path = os.path.join(args.out, "school_report.csv")
        school_df = generate_school_report(
            y_test.values, y_pred_best, school_test, school_report_path
        )
        print(f"\n  School-level summary ({len(school_df)} schools):")
        print(f"  {'School':<20} {'N':>5} {'Act MPS':>9} {'Pred MPS':>9} {'Bias':>7} {'MAE':>7}")
        print(f"  {'-'*20} {'-----':>5} {'--------':>9} {'--------':>9} {'------':>7} {'-----':>7}")
        for _, row in school_df.head(10).iterrows():
            print(f"  {row['School'][:20]:<20} {row['Student_Count']:>5.0f} "
                  f"{row['Avg_Actual_MPS']:>9.2f} {row['Avg_Predicted_MPS']:>9.2f} "
                  f"{row['Avg_Bias']:>7.2f} {row['MAE']:>7.4f}")
        if len(school_df) > 10:
            print(f"  ... and {len(school_df) - 10} more schools")
    else:
        school_df = None
        print("  School labels not available - skipping school report.")

    # -- Generate individual test results with ALL display cols ---------------
    y_pred_best = best_pipe.predict(X_test)

    test_results_df = display_test.copy().reset_index(drop=True)
    test_results_df["Actual_MPS"]      = y_test.values
    test_results_df["Predicted_MPS"]   = y_pred_best
    test_results_df["Difference"]      = y_pred_best - y_test.values
    test_results_df["Error_Magnitude"] = np.abs(y_test.values - y_pred_best)
    test_results_df["Actual_Proficiency"]     = encode_proficiency(y_test.values)
    test_results_df["Predicted_Proficiency"]  = encode_proficiency(y_pred_best)

    # Reorder: display cols first, then result cols
    result_cols   = ["Actual_MPS", "Predicted_MPS", "Difference",
                     "Error_Magnitude", "Actual_Proficiency", "Predicted_Proficiency"]
    display_found = [c for c in DROP_COLS if c in test_results_df.columns]
    test_results_df = test_results_df[display_found + result_cols]

    test_results_path = os.path.join(args.out, "test_results.csv")
    test_results_df.to_csv(test_results_path, index=False)
    print(f"  OK test_results.csv  ({len(test_results_df)} students)")

    # Save model results CSV
    results_df = pd.DataFrame(results)
    results_df.to_csv(os.path.join(args.out, "model_results.csv"), index=False)
    print(f"  OK model_results.csv")

    # -- Step 9: Explainability -----------------------------------------------
    print(f"\n{sep}\n  STEP 9 - EXPLAINABILITY\n{sep}")

    residual_std = float(np.std(y_test - best_pipe.predict(X_test)))
    tfnames      = get_transformed_feature_names(
                       best_pipe.named_steps["prep"], num_cols, cat_cols)
    feat_imp     = get_feature_importance(best_pipe, tfnames)

    try:
        shap_explainer = build_shap_explainer(best_pipe, X_train)
        print("  SHAP explainer built.")
    except Exception as e:
        shap_explainer = None
        print(f"  SHAP warning: {e}")

    print(f"\n  Sample predictions (first 3 test rows):")
    for i, (_, row) in enumerate(X_test.iloc[:3].iterrows()):
        pred      = float(best_pipe.predict(row.to_frame().T)[0])
        pass_prob = get_pass_probability(pred, residual_std, args.threshold)
        print(f"  Row {i+1}  pred={pred:.2f}  "
              f"P(MPS>={args.threshold:.0f})={pass_prob*100:.1f}%")

    # -- Step 10: Collinearity analysis ----------------------------------------
    print(f"\n{sep}\n  STEP 10 - COLLINEARITY ANALYSIS\n{sep}")

    analysis_df = pd.concat([X_train, X_test], ignore_index=True)

    corr, high_pairs = plot_correlation_heatmap(
        analysis_df, os.path.join(args.out, "correlation_heatmap.png"))

    vif_df = compute_vif(analysis_df)
    plot_vif_chart(vif_df, os.path.join(args.out, "vif_chart.png"))

    write_analysis_report(
        corr, high_pairs, vif_df, shift_results, pca_evr,
        os.path.join(args.out, "analysis_report.txt"),
        best_name, results,
    )

    # -- Step 11: Save artifact ------------------------------------------------
    print(f"\n{sep}\n  STEP 11 - SAVING ARTIFACT\n{sep}")

    artifact = {
        "model":                    best_pipe,
        "model_name":               best_name,
        "residual_std":             residual_std,
        "metrics":                  results,
        "features":                 X_train.columns.tolist(),
        "transformed_features":     tfnames,
        "feature_importance":       feat_imp,
        "shap_explainer":           shap_explainer,
        "per_model_outputs":        per_model_outs,
        "pca":                      pca_obj,
        "pca_explained_variance":   pca_evr,
        "zscore_applied":           (not args.no_zscore and bool(shift_results)),
        "pass_threshold":           args.threshold,
        "school_report":            school_df,
        "test_results":             test_results_df,
        # Metadata for inference: tells downstream tools what display cols exist
        # and that school_year is NOT a model feature (z-score only).
        "display_cols":             display_found,
        "cohort_col_stripped":      COHORT_COL,
        "drop_cols":                DROP_COLS,
        # Raw test-set display data (for dashboards / post-hoc analysis)
        "display_test":             display_test.reset_index(drop=True),
        "y_test":                   y_test.values,
        # Kept for backwards compatibility with downstream consumers
        # that expect flat arrays (e.g. per-model school/student reports)
        "school_test":              display_test["School"].values
                                    if "School" in display_test.columns else None,
        "learner_test":             display_test["learnerID"].values
                                    if "learnerID" in display_test.columns else None,
    }

    joblib_path = os.path.join(args.out, "best_model.joblib")
    joblib.dump(artifact, joblib_path)
    print(f"  OK best_model.joblib")

    print(f"\n{sep}")
    print(f"  DONE - all outputs in: {os.path.abspath(args.out)}")
    print(sep + "\n")


if __name__ == "__main__":
    main()