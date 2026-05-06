"""
Full MPS Prediction Pipeline
=====================================================================
Covers:
1. Load & merge 23-24 and 24-25 CSVs
2. Preprocessing  (dtype normalisation, mother-tongue unification,
                    grades 1-5 -> subject avg aggregation,
                    school_year flag, within-year z-score option,
                    PCA on subject avgs for linear models)
3. Stratified train/test split (balanced across school years)
4. Model training  (Linear, Lasso, DecisionTree, RandomForest,
                    GradientBoosting)
5. Evaluation      (MAE, RMSE, R^2)
6. Collinearity analysis  (DUAL: numeric + categorical, fully separated)     
    Numeric  : Pearson correlation heatmap + VIF bar chart
    Categorical: Cramér's V association heatmap +
                    Cramér's V vs MPS bar chart (chi-square significance)
    NOTE: Numeric and categorical analyses are kept completely separate.
        No one-hot encoding is used for collinearity charts.
7. Feature importance + SHAP explainer
8. Pass-probability helper  P(MPS >= 75)
9. Save artifact -> best_model.joblib

LEAKAGE-FREE DESIGN (split-first approach):
  - Train/test split is performed IMMEDIATELY after raw cleaning/aggregation,
    before any statistics are computed or transformations are fitted.
  - Z-score parameters (mean, std per cohort×column) are fitted on TRAIN rows
    only, then applied to both train and test.
  - PCA is fitted on TRAIN subject-avg columns only (unchanged from before).
  - sklearn Pipeline (StandardScaler, SimpleImputer, OHE) is fitted on TRAIN
    only (unchanged from before — Pipeline already handles this correctly).
  - Collinearity / VIF / Cramér's V analysis uses X_train only (no test
    information leaks into the diagnostic charts).
  - Distribution-shift test uses the raw pre-split combined data because it is
    purely diagnostic and does not affect any fitted parameters.

Outputs (written to --out directory, default = ./outputs):
  best_model.joblib
  correlation_heatmap_numeric.png      <- Pearson r (numeric, train only)
  vif_chart_numeric.png                <- VIF (numeric, train only)
  cramers_v_heatmap_categorical.png    <- Cramér's V (categorical, train only)
  cramers_v_mps_chart_categorical.png  <- Cramér's V vs MPS (train only)
  analysis_report.txt
  model_results.csv
  school_report.csv
  test_results.csv

Usage:
  DEFAULT RUN: python pipeline.py
  USE THIS FOR DEFENSE (zscore applied, use --no-zscore to disable):
    python pipeline.py --csv1 23-24.csv --csv2 24-25.csv --out ./outputs --no-pca
  USE THIS FOR DEFENSE (PCA + zscore applied):
    python pipeline.py --csv1 23-24.csv --csv2 24-25.csv --out ./pca_output

Notes on school_year generalization
-------------------------------------
school_year is assigned as an auto-incrementing integer cohort rank
(0, 1, 2, ...) based on load order. It is used ONLY for within-year
z-scoring and is STRIPPED from model features before training.
This means:
  - Any new CSV uploaded for inference works without retraining.
  - No binary 0/1 assumption; N cohorts are supported.
  - No data leakage: model never sees year label at inference time.
  - Z-score still works: new single-cohort upload z-scored as one group,
    using parameters fitted on the training partition only.
"""

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

from scipy.stats import norm, ttest_ind, chi2_contingency
from scipy.stats.contingency import association

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
DROP_COLS   = ["learnerID", "School", "Section", "Full Name", "Name"]

# school_year is also excluded from model features (used only for z-scoring).
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
    "Lasso":            Lasso(alpha=0.001),
    "DecisionTree":     DecisionTreeRegressor(
                            random_state=RANDOM_SEED,
                            max_depth=5,
                            min_samples_leaf=10
                            ),
    "RandomForest":     RandomForestRegressor(
                            n_estimators=100,
                            random_state=RANDOM_SEED,
                            n_jobs=-1,
                            ),
    "GradientBoosting": GradientBoostingRegressor(
                            random_state=RANDOM_SEED,
                            n_estimators=100,
                            max_depth=2,
                            subsample=0.8,
                            learning_rate=0.05
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
# SECTION 0 - DUPLICATE DETECTION
# ============================================================================

_DEDUP_EXCLUDE = {"learnerID"}


def check_duplicates(df: pd.DataFrame, label: str) -> pd.DataFrame:
    """
    Detect duplicate rows within a single cohort DataFrame.

    Duplicate key = all columns EXCEPT learnerID (and any other column listed
    in _DEDUP_EXCLUDE).  The check is intentionally broad: two rows are
    considered duplicates when every substantive field matches, regardless of
    whether their learnerIDs differ.
    """
    key_cols = [c for c in df.columns if c not in _DEDUP_EXCLUDE]

    if not key_cols:
        print(f"  [{label}] WARNING: No columns left after exclusion — "
              f"duplicate check skipped.")
        return df

    dup_mask  = df.duplicated(subset=key_cols, keep=False)
    dup_count = dup_mask.sum()

    if dup_count == 0:
        print(f"  [{label}] Duplicate check PASSED — no duplicates found "
              f"(key: {len(key_cols)} cols, excl. learnerID).")
        return df

    dup_df       = df[dup_mask].copy()
    n_unique_dup = df[dup_mask].duplicated(subset=key_cols, keep="first").value_counts()
    n_groups     = int((~df[dup_mask].duplicated(subset=key_cols, keep="first")).sum())

    print(f"\n  [{label}] *** DUPLICATES DETECTED ***")
    print(f"  Duplicate rows   : {dup_count}")
    print(f"  Duplicate groups : {n_groups}")
    print(f"  Key columns used : {len(key_cols)} (all cols except learnerID)")
    print(f"  Action           : keeping first occurrence, removing the rest\n")

    shown = 0
    for _, group in df[dup_mask].groupby(key_cols, dropna=False):
        if shown >= 10:
            remaining = n_groups - shown
            if remaining > 0:
                print(f"  ... and {remaining} more duplicate group(s) not shown.")
            break

        if "learnerID" in df.columns:
            ids = df.loc[group.index, "learnerID"].tolist()
            id_str = ", ".join(str(i) for i in ids)
            print(f"  Group (learnerIDs: {id_str}):")
        else:
            print(f"  Group (rows: {list(group.index)}):")

        preview_cols = [c for c in key_cols if c in df.columns][:8]
        for col in preview_cols:
            val = group[col].iloc[0]
            print(f"    {col:<22}: {val}")
        print()
        shown += 1

    before = len(df)
    df_clean = df.drop_duplicates(subset=key_cols, keep="first").reset_index(drop=True)
    after  = len(df_clean)
    print(f"  [{label}] Removed {before - after} duplicate row(s).  "
          f"{after} rows remain.\n")

    return df_clean


def check_cross_cohort_duplicates(datasets: dict) -> dict:
    """
    Detect rows that appear in MORE THAN ONE cohort (cross-cohort duplicates).
    Earlier cohort occurrence is kept; later cohorts lose the duplicate rows.
    """
    if len(datasets) < 2:
        return datasets

    labels = list(datasets.keys())

    frames = []
    for lbl, df in datasets.items():
        tmp = df.copy()
        tmp["__cohort__"] = lbl
        frames.append(tmp)

    combined = pd.concat(frames, ignore_index=True)

    key_cols = [c for c in combined.columns
                if c not in _DEDUP_EXCLUDE and c != "__cohort__"]

    cross_dup_mask = combined.duplicated(subset=key_cols, keep=False)
    cross_dups     = combined[cross_dup_mask]

    if cross_dups.empty:
        print(f"  Cross-cohort duplicate check PASSED — no cross-cohort "
              f"duplicates found.")
        return datasets

    n_cross = int(cross_dup_mask.sum())
    print(f"\n  *** CROSS-COHORT DUPLICATES DETECTED ***")
    print(f"  Affected rows   : {n_cross} (across all cohorts)")
    print(f"  Action          : keeping earliest cohort occurrence\n")

    shown = 0
    for _, group in cross_dups.groupby(key_cols, dropna=False):
        if shown >= 5:
            break
        cohorts_involved = group["__cohort__"].tolist()
        print(f"  Cross-cohort group — appears in: {cohorts_involved}")
        preview_cols = [c for c in key_cols if c in group.columns][:6]
        for col in preview_cols:
            print(f"    {col:<22}: {group[col].iloc[0]}")
        print()
        shown += 1

    combined_deduped = combined.drop_duplicates(subset=key_cols, keep="first")

    cleaned_datasets = {}
    for lbl in labels:
        cohort_rows = combined_deduped[combined_deduped["__cohort__"] == lbl].drop(
            columns=["__cohort__"]
        ).reset_index(drop=True)
        removed = len(datasets[lbl]) - len(cohort_rows)
        if removed:
            print(f"  [{lbl}] Removed {removed} cross-cohort duplicate(s).  "
                  f"{len(cohort_rows)} rows remain.")
        cleaned_datasets[lbl] = cohort_rows

    print()
    return cleaned_datasets


# ============================================================================
# SECTION 1 - PREPROCESSING  (non-fitting steps only)
# ============================================================================

def extract_display_cols(df: pd.DataFrame) -> pd.DataFrame:
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
    """
    Average quarterly grades into subject-level columns.
    NOTE: This operation is purely structural (mean of the same row's columns)
    and does not compute any cross-row statistics, so it is safe to apply
    before the split without introducing leakage.
    """
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
    """
    Diagnostic only — uses full (pre-split) data for both cohorts.
    Result is never used to fit any transformation, so it is safe here.
    """
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


# ============================================================================
# SECTION 1b - LEAKAGE-FREE Z-SCORE  (fit on train, apply to both)
# ============================================================================

def fit_zscore_params(df_train: pd.DataFrame, cols: list,
                      cohort_col: str = COHORT_COL) -> dict:
    """
    Compute per-(cohort, column) mean and std using TRAIN rows only.

    Returns
    -------
    params : dict keyed by (cohort_value, column_name) -> {"mean": ..., "std": ...}
             These are later applied to both train and test splits.
    """
    params = {}
    for col in cols:
        if col not in df_train.columns:
            continue
        for cohort_val, grp in df_train.groupby(cohort_col):
            vals = grp[col].dropna()
            mu   = float(vals.mean())
            sd   = float(vals.std(ddof=0)) if vals.std(ddof=0) > 0 else 1.0
            params[(cohort_val, col)] = {"mean": mu, "std": sd}
    return params


def apply_zscore_params(df: pd.DataFrame, cols: list,
                        params: dict,
                        cohort_col: str = COHORT_COL) -> pd.DataFrame:
    """
    Apply pre-fitted z-score parameters to any DataFrame (train or test).

    For test rows whose cohort is absent in params (e.g. a future cohort),
    the grand-train mean/std across all known cohorts is used as a fallback.
    """
    df = df.copy()
    for col in cols:
        if col not in df.columns:
            continue

        # Build fallback stats from all known params for this column
        all_vals = [p["mean"] for k, p in params.items() if k[1] == col]
        all_stds = [p["std"]  for k, p in params.items() if k[1] == col]
        fallback_mean = float(np.mean(all_vals)) if all_vals else 0.0
        fallback_std  = float(np.mean(all_stds)) if all_stds else 1.0

        def _transform_row(row):
            key = (row[cohort_col], col)
            p   = params.get(key, {"mean": fallback_mean, "std": fallback_std})
            return (row[col] - p["mean"]) / p["std"]

        df[col] = df.apply(_transform_row, axis=1)

    return df


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


def apply_pca_on_subjects(X_train: pd.DataFrame,
                           X_test:  pd.DataFrame,
                           subject_cols: list,
                           n_components: int = 3):
    """PCA is fitted on X_train only, then applied to X_test — no leakage."""
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
# SECTION 4 - NUMERIC COLLINEARITY: PEARSON + VIF
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
    """Pearson correlation heatmap — numeric features only (train set)."""
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

    ax.set_title("Numeric Feature Correlation Matrix — Train Set (Pearson r)",
                 color=TEXT, pad=16, fontsize=15, fontweight="bold")
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
    print(f"  OK {os.path.basename(out_path)}")
    return corr, high_pairs


def plot_vif_chart(vif_df: pd.DataFrame, out_path: str):
    """VIF bar chart — numeric features only (train set)."""
    if vif_df.empty:
        print("  ! VIF empty - skipping chart.")
        return

    plot_df = vif_df.head(30).copy().reset_index(drop=True)
    plot_df["VIF_plot"] = plot_df["VIF"].replace([np.inf], 999).clip(upper=60)
    colors = [vif_severity(v)[1] for v in plot_df["VIF"]]

    fig, ax = plt.subplots(figsize=(10, max(5, len(plot_df) * 0.5)))
    fig.patch.set_facecolor(BG)

    bars = ax.barh(plot_df["feature"][::-1], plot_df["VIF_plot"][::-1],
                   color=colors[::-1], height=0.65, edgecolor="none")

    x_max = plot_df["VIF_plot"].max() * 1.4 + 2
    ax.set_xlim(0, x_max)

    for thresh, label, col in [(5, "Moderate (5)", "#f5a623"),
                            (10, "High (10)", ACCENT2)]:
        if thresh <= x_max:
            ax.axvline(thresh, color=col, linewidth=1.2, linestyle="--", alpha=0.7)
            ax.text(thresh + 0.3, -0.6, label, color=col, fontsize=8, va="top")

    for bar, (_, row) in zip(bars[::-1], plot_df.iterrows()):
        label = f"{row['VIF']:.1f}" if np.isfinite(row["VIF"]) else "inf"
        ax.text(bar.get_width() + 0.3,
                bar.get_y() + bar.get_height() / 2,
                label, va="center", ha="left", fontsize=8, color=TEXT)

    ax.set_xlabel("Variance Inflation Factor (VIF)", color=TEXT)
    ax.set_title("Numeric Features — Multicollinearity Diagnostic, Train Set (VIF)",
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
    print(f"  OK {os.path.basename(out_path)}")


# ============================================================================
# SECTION 4b - CATEGORICAL COLLINEARITY: CRAMÉR'S V
# ============================================================================

def cramers_v(x: pd.Series, y: pd.Series) -> float:
    """
    Compute Cramér's V association between two categorical series.
    Returns a value in [0, 1]. Uses bias-corrected formula.
    """
    x = pd.Series(x).astype(str).fillna("__NA__")
    y = pd.Series(y).astype(str).fillna("__NA__")
    contingency = pd.crosstab(x, y)
    n = contingency.values.sum()
    if n == 0:
        return 0.0
    try:
        chi2, p, dof, _ = chi2_contingency(contingency, correction=False)
    except ValueError:
        return 0.0
    r, k = contingency.shape
    phi2    = max(0.0, chi2 / n - (k - 1) * (r - 1) / (n - 1))
    r_tilde = r - (r - 1) ** 2 / (n - 1)
    k_tilde = k - (k - 1) ** 2 / (n - 1)
    denom   = min(r_tilde - 1, k_tilde - 1)
    if denom <= 0:
        return 0.0
    return round(float(np.sqrt(phi2 / denom)), 4)


def compute_cramers_v_matrix(df: pd.DataFrame) -> pd.DataFrame:
    cat_cols = df.select_dtypes(exclude=np.number).columns.tolist()
    if not cat_cols:
        return pd.DataFrame()

    matrix = pd.DataFrame(np.zeros((len(cat_cols), len(cat_cols))),
                          index=cat_cols, columns=cat_cols)
    for i, col_i in enumerate(cat_cols):
        for j, col_j in enumerate(cat_cols):
            if i == j:
                matrix.loc[col_i, col_j] = 1.0
            elif j > i:
                v = cramers_v(df[col_i], df[col_j])
                matrix.loc[col_i, col_j] = v
                matrix.loc[col_j, col_i] = v
    return matrix


def plot_cramers_v_heatmap(df: pd.DataFrame, out_path: str):
    """Cramér's V heatmap — categorical features only (train set)."""
    cat_cols = df.select_dtypes(exclude=np.number).columns.tolist()
    if not cat_cols:
        print("  ! No categorical features — skipping Cramér's V heatmap.")
        return pd.DataFrame(), []

    if len(cat_cols) < 2:
        print("  ! Only one categorical feature — pairwise heatmap skipped.")
        return pd.DataFrame(), []

    cv_matrix = compute_cramers_v_matrix(df[cat_cols])
    n = len(cv_matrix)

    fig, ax = plt.subplots(figsize=(max(7, n * 1.1), max(5, n * 0.9)))
    fig.patch.set_facecolor(BG)

    cmap = sns.light_palette(ACCENT, as_cmap=True)
    mask = np.triu(np.ones_like(cv_matrix, dtype=bool), k=1)

    sns.heatmap(cv_matrix, ax=ax, mask=mask, cmap=cmap,
                vmin=0, vmax=1,
                annot=True, fmt=".2f",
                annot_kws={"size": 9, "color": TEXT},
                linewidths=0.5, linecolor=BG, square=True,
                cbar_kws={"shrink": 0.7, "label": "Cramér's V"})

    ax.set_title("Categorical Feature Association Matrix — Train Set (Cramér's V)",
                 color=TEXT, pad=16, fontsize=15, fontweight="bold")
    ax.tick_params(axis="x", rotation=45, labelsize=9)
    ax.tick_params(axis="y", rotation=0,  labelsize=9)

    cbar = ax.collections[0].colorbar
    cbar.ax.yaxis.set_tick_params(color=SUBTEXT, labelcolor=SUBTEXT)
    cbar.outline.set_edgecolor(GRID)

    high_pairs = []
    for i in range(n):
        for j in range(i):
            v = cv_matrix.iloc[i, j]
            if v >= 0.5:
                high_pairs.append((cv_matrix.index[i], cv_matrix.columns[j], v))

    if high_pairs:
        top = sorted(high_pairs, key=lambda x: -x[2])[:6]
        lines = [f"V>=0.50 pairs ({len(high_pairs)}):"] + \
                [f"  {a[:14]} <-> {b[:14]}  V={v:.2f}" for a, b, v in top]
        fig.text(0.01, 0.01, "\n".join(lines), fontsize=7.5, color=SUBTEXT,
                 va="bottom", family="monospace",
                 bbox=dict(boxstyle="round,pad=0.4", facecolor=PANEL,
                           edgecolor=GRID, alpha=0.9))

    plt.tight_layout()
    fig.savefig(out_path, dpi=150, bbox_inches="tight", facecolor=BG)
    plt.close(fig)
    print(f"  OK {os.path.basename(out_path)}")
    return cv_matrix, high_pairs


def cramers_v_severity(v: float):
    if v >= 0.7:  return "STRONG",   ACCENT2
    if v >= 0.5:  return "MODERATE", "#f5a623"
    if v >= 0.3:  return "WEAK",     "#f5d623"
    return "NEGLIGIBLE", "#4cd964"


def plot_cramers_v_mps_chart(df: pd.DataFrame, target_col: str,
                              chi_results: dict, out_path: str):
    """Cramér's V vs MPS bar chart — categorical features (train set only)."""
    cat_cols = df.select_dtypes(exclude=np.number).columns.tolist()
    cat_cols = [c for c in cat_cols if c != target_col]

    if not cat_cols:
        print("  ! No categorical features — skipping Cramér's V vs MPS chart.")
        return pd.DataFrame()

    target_binned = encode_proficiency(df[target_col].values).astype(str)

    rows = []
    for col in cat_cols:
        v    = cramers_v(df[col], target_binned)
        chi  = chi_results.get(col)
        sig  = chi["significant"] if chi else False
        p    = chi["p_value"]     if chi else float("nan")
        rows.append({"feature": col, "cramers_v": v, "significant": sig, "p_value": p})

    result_df = pd.DataFrame(rows).sort_values("cramers_v", ascending=False).reset_index(drop=True)

    colors = [cramers_v_severity(v)[1] for v in result_df["cramers_v"]]

    fig, ax = plt.subplots(figsize=(10, max(4, len(result_df) * 0.65)))
    fig.patch.set_facecolor(BG)

    bars = ax.barh(result_df["feature"][::-1],
                   result_df["cramers_v"][::-1],
                   color=colors[::-1], height=0.6, edgecolor="none")

    for thresh, label, col in [(0.3, "Weak (0.3)", "#f5d623"),
                                (0.5, "Moderate (0.5)", "#f5a623"),
                                (0.7, "Strong (0.7)", ACCENT2)]:
        ax.axvline(thresh, color=col, linewidth=1.2, linestyle="--", alpha=0.7)
        ax.text(thresh + 0.01, -0.7, label, color=col, fontsize=8, va="top")

    for bar, (_, row) in zip(bars[::-1], result_df.iterrows()):
        sig_marker = " *" if row["significant"] else ""
        label_text = f"{row['cramers_v']:.3f}{sig_marker}  p={row['p_value']:.3f}"
        ax.text(bar.get_width() + 0.01,
                bar.get_y() + bar.get_height() / 2,
                label_text, va="center", ha="left", fontsize=8, color=TEXT)

    ax.set_xlim(0, 1.15)
    ax.set_xlabel("Cramér's V  (association with MPS proficiency level, train set)", color=TEXT)
    ax.set_title("Categorical Features — Association with MPS, Train Set (Cramér's V)",
                 color=TEXT, fontsize=14, fontweight="bold", pad=12)
    ax.grid(axis="x", color=GRID, linewidth=0.6)
    ax.set_axisbelow(True)

    legend_handles = [
        Patch(facecolor="#4cd964", label="Negligible  (V < 0.3)"),
        Patch(facecolor="#f5d623", label="Weak        (0.3 – 0.5)"),
        Patch(facecolor="#f5a623", label="Moderate    (0.5 – 0.7)"),
        Patch(facecolor=ACCENT2,   label="Strong      (V >= 0.7)"),
    ]
    ax.legend(handles=legend_handles, loc="lower right", framealpha=0.25,
              edgecolor=GRID, labelcolor=TEXT, fontsize=9)

    fig.text(0.01, 0.005, "* chi-square significant (p < 0.05)",
             fontsize=8, color=SUBTEXT, va="bottom", family="monospace")

    plt.tight_layout()
    fig.savefig(out_path, dpi=150, bbox_inches="tight", facecolor=BG)
    plt.close(fig)
    print(f"  OK {os.path.basename(out_path)}")
    return result_df


# ============================================================================
# SECTION 5 - REPORT WRITING
# ============================================================================

def write_analysis_report(corr, high_pairs, vif_df, shift_results,
                           pca_evr, out_path: str, best_name: str,
                           metrics: list, dup_summary: dict):
    W = 67
    lines = ["=" * W,
             "  MPS PREDICTION PIPELINE - FULL ANALYSIS REPORT",
             "=" * W]

    lines += [f"\n{'-'*W}",
              "  DUPLICATE CHECK SUMMARY",
              f"{'-'*W}"]
    for label, info in dup_summary.items():
        if label == "cross_cohort_removed":
            continue
        lines.append(f"  [{label}]  within-cohort removed : {info['within_removed']}")
    lines.append(f"  Cross-cohort removed : {dup_summary.get('cross_cohort_removed', 0)}")

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
                  "  NOTE: Diagnostic only — computed on pre-split data.",
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
                  "  PCA - EXPLAINED VARIANCE (subject avg columns, fitted on train)",
                  f"{'-'*W}"]
        cumulative = 0.0
        for i, evr in enumerate(pca_evr):
            cumulative += evr
            lines.append(f"  PC{i+1}: {evr*100:5.1f}%   cumulative: {cumulative*100:5.1f}%")

    lines += [f"\n{'-'*W}",
              f"  [NUMERIC] HIGH CORRELATION PAIRS  (|Pearson r| >= 0.80)  "
              f"[train set] — {len(high_pairs)} found",
              f"{'-'*W}"]
    if high_pairs:
        lines.append(f"  {'Feature A':<22} {'Feature B':<22} {'r':>6}")
        lines.append(f"  {'-'*22} {'-'*22} {'------':>6}")
        for a, b, r in sorted(high_pairs, key=lambda x: -abs(x[2])):
            lines.append(f"  {a:<22} {b:<22} {r:>+6.3f}")
    else:
        lines.append("  None - no feature pairs exceed |r|=0.80")

    lines += [f"\n{'-'*W}",
              "  [NUMERIC] VARIANCE INFLATION FACTORS  (sorted descending, train set)",
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
              "  |r| > 0.8  High pairwise Pearson correlation (verify with VIF)",
              "  Shift?=YES - cohort means differ; z-score params from train only",
              "  school_year stripped from model features (z-score only)",
              "  All collinearity charts use TRAIN SET only (no test leakage)",
              "  [Numeric charts]  correlation_heatmap_numeric.png",
              "                    vif_chart_numeric.png",
              "  [Categorical charts]  cramers_v_heatmap_categorical.png",
              "                        cramers_v_mps_chart_categorical.png",
              "=" * W]

    text = "\n".join(lines)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"  OK analysis_report.txt")
    print("\n" + text)


# ============================================================================
# SECTION 6 - MAIN PIPELINE
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
    p.add_argument("--keep-duplicates", action="store_true",
                   help="Skip duplicate removal (report only, do not drop rows)")
    return p.parse_args()


def main():
    args = parse_args()
    os.makedirs(args.out, exist_ok=True)

    sep = "=" * 65

    # =========================================================================
    # STEP 1: Load CSVs
    # =========================================================================
    print(f"\n{sep}\n  STEP 1 - LOADING DATA\n{sep}")

    csv_pairs = [("23-24", args.csv1), ("24-25", args.csv2)]
    for i, extra in enumerate(args.extra_csvs or []):
        label = os.path.splitext(os.path.basename(extra))[0]
        csv_pairs.append((label, extra))

    datasets     = {}
    display_cols = {}

    for rank, (label, path) in enumerate(csv_pairs):
        try:
            df = pd.read_csv(path)
            display_cols[label] = extract_display_cols(df)
            display_cols[label].index = df.index
            df[COHORT_COL] = rank
            datasets[label] = df
            print(f"  Cohort {rank} [{label}]: {len(df)} rows x {len(df.columns)} cols  ({path})")
        except FileNotFoundError:
            print(f"  !  {path} not found - skipping [{label}]")

    if not datasets:
        sys.exit("ERROR: No CSV files found. Check --csv1 / --csv2 paths.")

    # =========================================================================
    # STEP 1b: Duplicate detection
    # =========================================================================
    print(f"\n{sep}\n  STEP 1b - DUPLICATE DETECTION\n{sep}")
    print(f"  Rule: duplicates identified by ALL columns EXCEPT learnerID.")
    print(f"  Two rows are duplicates when every substantive field matches,")
    print(f"  regardless of whether their learnerIDs differ.\n")

    dup_summary = {}

    if args.keep_duplicates:
        print("  --keep-duplicates flag set: reporting only, no rows removed.")
        for label, df in datasets.items():
            check_duplicates(df, label)
            dup_summary[label] = {"within_removed": 0}
        dup_summary["cross_cohort_removed"] = 0
    else:
        cleaned_datasets_step1b = {}
        for label, df in datasets.items():
            before = len(df)
            df_clean = check_duplicates(df, label)
            removed  = before - len(df_clean)
            dup_summary[label] = {"within_removed": removed}

            if removed > 0:
                kept_idx = df.duplicated(
                    subset=[c for c in df.columns if c not in _DEDUP_EXCLUDE],
                    keep="first"
                )
                keeper_mask = ~kept_idx
                display_cols[label] = display_cols[label].loc[
                    df.index[keeper_mask]
                ].reset_index(drop=True)
                df_clean[COHORT_COL] = df_clean[COHORT_COL] if COHORT_COL in df_clean.columns \
                                       else datasets[label][COHORT_COL].iloc[0]

            cleaned_datasets_step1b[label] = df_clean

        datasets = cleaned_datasets_step1b

        before_counts = {lbl: len(df) for lbl, df in datasets.items()}
        datasets      = check_cross_cohort_duplicates(datasets)
        cross_removed = sum(
            before_counts[lbl] - len(datasets[lbl]) for lbl in before_counts
        )
        dup_summary["cross_cohort_removed"] = cross_removed

        for rank, label in enumerate(list(datasets.keys())):
            datasets[label][COHORT_COL] = rank

    # =========================================================================
    # STEP 2: Non-fitting preprocessing (safe before split)
    #   - dtype normalisation
    #   - mother tongue unification
    #   - quarterly -> subject avg aggregation  (row-wise mean only, no leakage)
    #   - drop display columns
    # =========================================================================
    print(f"\n{sep}\n  STEP 2 - NON-FITTING PREPROCESSING\n{sep}")
    cleaned = {}
    for label, df in datasets.items():
        df = df.drop(columns=DROP_COLS, errors="ignore")
        df = normalize_dtypes(df)
        df = apply_mother_tongue_map(df)
        df = aggregate_subject_grades(df)
        cleaned[label] = df
        subj_present = [c for c in SUBJECT_AVG_COLS if c in df.columns]
        print(f"  [{label}]: after aggregation -> {df.shape[1]} cols  "
              f"| subject avgs: {subj_present}")

    # =========================================================================
    # STEP 3: Distribution shift test (diagnostic, uses pre-split full data)
    # =========================================================================
    print(f"\n{sep}\n  STEP 3 - DISTRIBUTION SHIFT TEST (diagnostic, pre-split)\n{sep}")
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
            print("\n  -> Distribution shift detected. "
                  "Z-score params will be fitted on TRAIN rows only.")
        elif any_shift and args.no_zscore:
            print("\n  -> Shift detected but --no-zscore set. Skipping z-score.")
        else:
            print("\n  -> No significant shift detected.")
    else:
        print("  (Single cohort loaded - shift test skipped)")

    # =========================================================================
    # STEP 4: Combine, then SPLIT FIRST
    #   school_year is used for stratification and z-scoring only; it is
    #   stripped from features before any model sees the data.
    # =========================================================================
    print(f"\n{sep}\n  STEP 4 - COMBINE & STRATIFIED SPLIT  (split-first)\n{sep}")

    cleaned_reset = {}
    display_reset = {}
    offset = 0
    for label, df in cleaned.items():
        df_r = df.reset_index(drop=True)
        df_r.index = df_r.index + offset
        cleaned_reset[label] = df_r

        dc = display_cols[label].reset_index(drop=True)
        dc.index = dc.index + offset
        display_reset[label] = dc

        offset += len(df_r)

    combined    = pd.concat(list(cleaned_reset.values()))
    all_display = pd.concat(list(display_reset.values()))

    if TARGET not in combined.columns:
        sys.exit(f"ERROR: Target column '{TARGET}' not found in data.")

    X_full = combined.drop(columns=[TARGET])
    y_full = combined[TARGET]

    # Stratify by cohort so each split has representative cohort proportions.
    stratify_col = X_full[COHORT_COL].copy() if COHORT_COL in X_full.columns else None

    # Strip COHORT_COL from features NOW (before any fitting).
    # We retain it temporarily in X_train_with_cohort / X_test_with_cohort
    # solely for z-scoring, then drop it before the sklearn pipeline.
    X_full_no_cohort = X_full.drop(columns=[COHORT_COL], errors="ignore")

    (X_train_no_cohort, X_test_no_cohort,
     y_train, y_test,
     cohort_train, cohort_test,
     disp_train, disp_test) = train_test_split(
        X_full_no_cohort,
        y_full,
        stratify_col if stratify_col is not None else pd.Series(np.zeros(len(y_full))),
        all_display,
        test_size=TEST_SIZE,
        random_state=RANDOM_SEED,
        stratify=stratify_col,
    )

    # Reattach cohort column temporarily (needed for z-scoring step below)
    X_train_wc = X_train_no_cohort.copy()
    X_test_wc  = X_test_no_cohort.copy()
    X_train_wc[COHORT_COL] = cohort_train.values
    X_test_wc[COHORT_COL]  = cohort_test.values

    display_train = disp_train
    display_test  = disp_test

    print(f"  Total  : {len(combined)} rows")
    print(f"  Train  : {len(X_train_wc)} rows")
    print(f"  Test   : {len(X_test_wc)} rows")
    if stratify_col is not None:
        vc = cohort_train.value_counts().sort_index()
        print(f"  Train cohort split: " +
              "  ".join(f"rank{k}={v}" for k, v in vc.items()))

    # =========================================================================
    # STEP 5: Within-cohort z-scoring  (TRAIN stats only, applied to both)
    # =========================================================================
    apply_zscore = (not args.no_zscore) and bool(shift_results)

    if apply_zscore:
        print(f"\n{sep}\n  STEP 5 - WITHIN-COHORT Z-SCORE  "
              f"(fit on train, apply to train+test)\n{sep}")
        zscore_params = fit_zscore_params(X_train_wc, SUBJECT_AVG_COLS)
        X_train_wc    = apply_zscore_params(X_train_wc, SUBJECT_AVG_COLS, zscore_params)
        X_test_wc     = apply_zscore_params(X_test_wc,  SUBJECT_AVG_COLS, zscore_params)
        print(f"  Z-score params fitted on {len(X_train_wc)} train rows.")
        print(f"  Applied to train and test using train-derived mean/std per cohort.")
    else:
        zscore_params = {}
        reason = "--no-zscore flag" if args.no_zscore else "no shift detected"
        print(f"\n  STEP 5 - Z-score skipped ({reason})")

    # Now drop COHORT_COL from both splits — model never sees it
    X_train = X_train_wc.drop(columns=[COHORT_COL], errors="ignore")
    X_test  = X_test_wc.drop(columns=[COHORT_COL],  errors="ignore")

    # =========================================================================
    # STEP 6: PCA on subject averages  (fit on train only — unchanged)
    # =========================================================================
    pca_obj = None
    pca_evr = []

    if not args.no_pca:
        print(f"\n{sep}\n  STEP 6 - PCA ON SUBJECT AVG COLUMNS  "
              f"(fit on train only)\n{sep}")
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
        print(f"\n  STEP 6 - PCA skipped (--no-pca flag set)")

    # =========================================================================
    # STEP 6b - SAVE TRAIN DATA WITH ENCODED VALUES
    # =========================================================================
    print(f"\n{sep}\n  STEP 6b - SAVE TRAIN DATA (encoded)\n{sep}")
    # We need to apply the preprocessor to X_train to get one-hot encoded values.
    # Build the preprocessor first (same as used in Step 7), then transform.
    temp_num_cols = X_train.select_dtypes(include=np.number).columns.tolist()
    temp_cat_cols = X_train.select_dtypes(exclude=np.number).columns.tolist()
    temp_preprocessor = build_preprocessor(temp_num_cols, temp_cat_cols)
    # Fit and transform on X_train
    X_train_transformed = temp_preprocessor.fit_transform(X_train)
    # Get the transformed feature names
    transformed_feature_names = get_transformed_feature_names(temp_preprocessor, temp_num_cols, temp_cat_cols)
    
    # Build the dataframe with encoded features
    train_encoded_df = pd.DataFrame(X_train_transformed, columns=transformed_feature_names)
    # Add target
    train_encoded_df[TARGET] = y_train.values
    # Add display columns (learnerID, School, etc.) if available
    for col in display_train.columns:
        if col not in train_encoded_df.columns and col not in transformed_feature_names:
            train_encoded_df[col] = display_train[col].values
    # Drop the School column from the output as requested
    if 'School' in train_encoded_df.columns:
        train_encoded_df = train_encoded_df.drop(columns=['School'])
    # Also drop any remaining DROP_COLS that might be present
    for dc in DROP_COLS:
        if dc in train_encoded_df.columns and dc != TARGET:
            train_encoded_df = train_encoded_df.drop(columns=[dc])
    # Reorder: display cols (except School) first, then features, then target last
    display_col_names = [c for c in display_train.columns if c in train_encoded_df.columns and c != 'School']
    feature_col_names = [c for c in train_encoded_df.columns if c not in display_col_names and c != TARGET]
    ordered_cols = display_col_names + feature_col_names + [TARGET]
    train_encoded_df = train_encoded_df[ordered_cols]
    train_encoded_path = os.path.join(args.out, "train_encoded.csv")
    train_encoded_df.to_csv(train_encoded_path, index=False)
    print(f"  OK train_encoded.csv  ({len(train_encoded_df)} rows x {len(train_encoded_df.columns)} cols)")
    print(f"  Display columns (excl. School): {display_col_names}")
    print(f"  Feature columns: {len(feature_col_names)}")
    if temp_cat_cols:
        print(f"  Categorical features encoded: {len(transformed_feature_names) - len(temp_num_cols)}")
    if apply_zscore:
        print(f"  Note: Numeric subject columns are z-scored (train stats).")
    if not args.no_pca and pca_evr:
        print(f"  Note: Subject avg columns replaced with PCA components.")

    # =========================================================================
    # STEP 7: Build sklearn preprocessor (fit inside Pipeline on train only)
    # =========================================================================
    print(f"\n{sep}\n  STEP 7 - SKLEARN PREPROCESSOR\n{sep}")
    num_cols = X_train.select_dtypes(include=np.number).columns.tolist()
    cat_cols = X_train.select_dtypes(exclude=np.number).columns.tolist()
    print(f"  Numeric  ({len(num_cols)}): {num_cols}")
    print(f"  Categorical ({len(cat_cols)}): {cat_cols}")
    preprocessor = build_preprocessor(num_cols, cat_cols)

    # =========================================================================
    # STEP 8: Train all models
    # =========================================================================
    print(f"\n{sep}\n  STEP 8 - MODEL TRAINING\n{sep}")

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

    # =========================================================================
    # STEP 9: School-level report
    # =========================================================================
    print(f"\n{sep}\n  STEP 9 - SCHOOL-LEVEL ANALYSIS\n{sep}")

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

    # Generate individual test results
    y_pred_best = best_pipe.predict(X_test)

    test_results_df = display_test.copy().reset_index(drop=True)
    test_results_df["Actual_MPS"]      = y_test.values
    test_results_df["Predicted_MPS"]   = y_pred_best
    test_results_df["Difference"]      = y_pred_best - y_test.values
    test_results_df["Error_Magnitude"] = np.abs(y_test.values - y_pred_best)
    test_results_df["Actual_Proficiency"]    = encode_proficiency(y_test.values)
    test_results_df["Predicted_Proficiency"] = encode_proficiency(y_pred_best)

    result_cols   = ["Actual_MPS", "Predicted_MPS", "Difference",
                     "Error_Magnitude", "Actual_Proficiency", "Predicted_Proficiency"]
    display_found = [c for c in DROP_COLS if c in test_results_df.columns]
    test_results_df = test_results_df[display_found + result_cols]

    test_results_path = os.path.join(args.out, "test_results.csv")
    test_results_df.to_csv(test_results_path, index=False)
    print(f"  OK test_results.csv  ({len(test_results_df)} students)")

    results_df = pd.DataFrame(results)
    results_df.to_csv(os.path.join(args.out, "model_results.csv"), index=False)
    print(f"  OK model_results.csv")

    # =========================================================================
    # STEP 10: Explainability
    # =========================================================================
    print(f"\n{sep}\n  STEP 10 - EXPLAINABILITY\n{sep}")

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

    # =========================================================================
    # STEP 11: Collinearity analysis  (TRAIN SET ONLY — no test leakage)
    # =========================================================================
    print(f"\n{sep}\n  STEP 11 - COLLINEARITY ANALYSIS  "
          f"(train set only, no test leakage)\n{sep}")

    # X_train already has COHORT_COL stripped; y_train aligns with it.
    train_analysis_df = X_train.copy()
    train_analysis_with_target = train_analysis_df.copy()
    train_analysis_with_target[TARGET] = y_train.values

    # ---- A. NUMERIC (train only) -------------------------------------------
    num_train_df = train_analysis_df.select_dtypes(include=np.number)

    print(f"\n  [NUMERIC]  {len(num_train_df.columns)} features (train set):")
    print(f"  {num_train_df.columns.tolist()}")

    corr, high_pairs = plot_correlation_heatmap(
        num_train_df,
        os.path.join(args.out, "correlation_heatmap_numeric.png")
    )

    vif_df = compute_vif(num_train_df)

    plot_vif_chart(
        vif_df,
        os.path.join(args.out, "vif_chart_numeric.png")
    )

    # ---- B. CATEGORICAL (train only) ----------------------------------------
    cat_train_df     = train_analysis_df.select_dtypes(exclude=np.number)
    cat_feature_cols = cat_train_df.columns.tolist()

    print(f"\n  [CATEGORICAL]  {len(cat_feature_cols)} features (train set):")
    print(f"  {cat_feature_cols}")

    chi_results = {}
    cat_summary = {}

    if cat_feature_cols:
        for col in cat_feature_cols:
            freq = (
                train_analysis_df[col]
                .value_counts(normalize=True)
                .mul(100).round(2).to_dict()
            )

            target_mean = (
                train_analysis_with_target.groupby(col)[TARGET]
                .mean().round(3).to_dict()
            )

            try:
                contingency = pd.crosstab(
                    train_analysis_with_target[col],
                    encode_proficiency(train_analysis_with_target[TARGET])
                )
                chi2, p, _, _ = chi2_contingency(contingency)
                chi_results[col] = {
                    "chi2": round(float(chi2), 4),
                    "p_value": round(float(p), 4),
                    "significant": bool(p < 0.05),
                }
            except Exception:
                chi_results[col] = None

            cat_summary[col] = {
                "frequency_pct": freq,
                "target_mean": target_mean,
            }

        cv_matrix, cv_high_pairs = plot_cramers_v_heatmap(
            cat_train_df,
            os.path.join(args.out, "cramers_v_heatmap_categorical.png")
        )

        cramers_mps_df = plot_cramers_v_mps_chart(
            train_analysis_with_target,
            TARGET,
            chi_results,
            os.path.join(args.out, "cramers_v_mps_chart_categorical.png")
        )

        print(f"\n  Categorical analysis summary (train set):")
        if not cramers_mps_df.empty:
            print(f"  {'Feature':<22} {'Cramér V':>10}  {'Sig?':>6}  {'p-value':>9}")
            print(f"  {'-'*22} {'----------':>10}  {'------':>6}  {'---------':>9}")
            for _, row in cramers_mps_df.iterrows():
                sig = "YES" if row["significant"] else "no"
                print(f"  {row['feature']:<22} {row['cramers_v']:>10.4f}  {sig:>6}  "
                      f"{row['p_value']:>9.4f}")
    else:
        cv_matrix       = pd.DataFrame()
        cv_high_pairs   = []
        cramers_mps_df  = pd.DataFrame()
        print("  No categorical features found — categorical charts skipped.")

    # ---- C. Write main analysis report (based on train) --------------------
    report_path = os.path.join(args.out, "analysis_report.txt")

    write_analysis_report(
        corr,
        high_pairs,
        vif_df,
        shift_results,
        pca_evr,
        report_path,
        best_name,
        results,
        dup_summary,
    )

    # ---- D. Append categorical section to report ---------------------------
    with open(report_path, "a", encoding="utf-8") as f:
        W = 67

        f.write("\n" + "-" * W + "\n")
        f.write("  CATEGORICAL FEATURE ANALYSIS  (train set only)\n")
        f.write("-" * W + "\n")

        if cat_summary:
            if cv_high_pairs:
                f.write(f"\n  High inter-feature association (Cramér's V >= 0.50):\n")
                f.write(f"  {'Feature A':<22} {'Feature B':<22} {'V':>6}\n")
                f.write(f"  {'-'*22} {'-'*22} {'------':>6}\n")
                for a, b, v in sorted(cv_high_pairs, key=lambda x: -x[2]):
                    f.write(f"  {a:<22} {b:<22} {v:>6.3f}\n")
            else:
                f.write("\n  No categorical feature pairs exceed V=0.50\n")

            f.write(f"\n  {'Feature':<22} {'Cramér_V_MPS':>13} {'Chi2_sig':>10}\n")
            f.write(f"  {'-'*22} {'-------------':>13} {'----------':>10}\n")
            for col, info in cat_summary.items():
                chi  = chi_results.get(col)
                if chi:
                    sig_str = "YES" if chi["significant"] else "no"
                    target_binned = encode_proficiency(
                        train_analysis_with_target[TARGET].values
                    ).astype(str)
                    v_vs_mps = cramers_v(
                        train_analysis_with_target[col], target_binned
                    )
                    f.write(f"  {col:<22} {v_vs_mps:>13.4f} {sig_str:>10}\n")
                else:
                    f.write(f"  {col:<22} {'N/A':>13} {'N/A':>10}\n")

            f.write("\n")
            for col, info in cat_summary.items():
                f.write(f"\n  [{col}]\n")
                f.write("    Frequency (%) [train]:\n")
                for k, v in info["frequency_pct"].items():
                    f.write(f"      {k}: {v}%\n")
                if info["target_mean"]:
                    f.write("    Avg MPS per category [train]:\n")
                    for k, v in info["target_mean"].items():
                        f.write(f"      {k}: {v}\n")
                chi = chi_results.get(col)
                if chi:
                    sig = "YES" if chi["significant"] else "no"
                    f.write(
                        f"    Chi-square [train]: chi2={chi['chi2']}  "
                        f"p={chi['p_value']}  significant={sig}\n"
                    )
                else:
                    f.write("    Chi-square: not available\n")
        else:
            f.write("  No categorical features available.\n")

        f.write("\n" + "-" * W + "\n")
        f.write("  CATEGORICAL INTERPRETATION GUIDE\n")
        f.write("-" * W + "\n")
        f.write("  Cramér's V (pairwise heatmap): inter-feature association\n")
        f.write("    V < 0.30  Negligible\n")
        f.write("    V 0.30-0.50  Weak\n")
        f.write("    V 0.50-0.70  Moderate — consider reviewing redundancy\n")
        f.write("    V >= 0.70   Strong — one feature may be redundant\n")
        f.write("  Cramér's V (MPS chart): feature-vs-target association\n")
        f.write("    Higher V = stronger predictive relationship with MPS\n")
        f.write("  * in MPS chart = chi-square significant at p < 0.05\n")
        f.write("  All categorical stats computed on TRAIN SET only\n")
        f.write("  [Categorical charts]\n")
        f.write("    cramers_v_heatmap_categorical.png\n")
        f.write("    cramers_v_mps_chart_categorical.png\n")

    print("  OK categorical analysis appended to analysis_report.txt")

    # =========================================================================
    # STEP 12: Save artifact
    # =========================================================================
    print(f"\n{sep}\n  STEP 12 - SAVING ARTIFACT\n{sep}")

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
        "zscore_applied":           apply_zscore,
        "zscore_params":            zscore_params,      # train-fitted params for inference
        "pass_threshold":           args.threshold,
        "school_report":            school_df,
        "test_results":             test_results_df,
        "display_cols":             display_found,
        "cohort_col_stripped":      COHORT_COL,
        "drop_cols":                DROP_COLS,
        "display_test":             display_test.reset_index(drop=True),
        "y_test":                   y_test.values,
        "school_test":              display_test["School"].values
                                    if "School" in display_test.columns else None,
        "learner_test":             display_test["learnerID"].values
                                    if "learnerID" in display_test.columns else None,
        # Collinearity artifacts (train-only)
        "vif_df":                   vif_df,
        "pearson_corr_matrix":      corr,
        "cramers_v_matrix":         cv_matrix,
        "cramers_v_mps":            cramers_mps_df,
        "chi_results":              chi_results,
        # Duplicate removal summary
        "duplicate_summary":        dup_summary,
    }

    joblib_path = os.path.join(args.out, "best_model.joblib")
    joblib.dump(artifact, joblib_path)
    print(f"  OK best_model.joblib")

    print(f"\n{sep}")
    print(f"  DONE - all outputs in: {os.path.abspath(args.out)}")
    print(sep + "\n")
    print(f"  Chart outputs (all computed on TRAIN SET only):")
    print(f"    Numeric   -> correlation_heatmap_numeric.png")
    print(f"              -> vif_chart_numeric.png")
    print(f"    Categorical -> cramers_v_heatmap_categorical.png")
    print(f"                -> cramers_v_mps_chart_categorical.png")
    print(sep + "\n")


if __name__ == "__main__":
    main()