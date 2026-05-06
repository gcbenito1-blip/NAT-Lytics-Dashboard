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
6. Feature importance + SHAP explainer
7. Pass-probability helper  P(MPS >= 75)
8. Save artifact -> best_model.joblib
9. Save train_data.csv  (raw non-aggregated subject columns +
                          OHE categorical columns EXCEPT Nutritional Status
                          which is label-encoded; no scaling/z-score)

LEAKAGE-FREE DESIGN (split-first approach):
  - Train/test split is performed IMMEDIATELY after raw cleaning/aggregation,
    before any statistics are computed or transformations are fitted.
  - Z-score parameters (mean, std per cohort×column) are fitted on TRAIN rows
    only, then applied to both train and test.
  - PCA is fitted on TRAIN subject-avg columns only (unchanged from before).
  - sklearn Pipeline (StandardScaler, SimpleImputer, OHE for categoricals)
    is fitted on TRAIN only. Nutritional Status is label-encoded before
    the split and treated as numeric.

Outputs (written to --out directory, default = ./outputs):
   best_model.joblib
   train_data.csv      <- raw subject grades (non-aggregated) + OHE cats
                          (except Nutritional Status → label encoded), no scaling
   model_results.csv
   school_report.csv
   test_results.csv

Usage:
  DEFAULT RUN: python pipeline.py
  USE THIS FOR DEFENSE (zscore applied, use --no-zscore to disable):
    python pipeline.py --csv1 23-24.csv --csv2 24-25.csv --out ./outputs --no-pca
   for recommendation, no need to present kung hindi tinanong(PCA + zscore applied):
    python pipeline.py --csv1 23-24.csv --csv2 24-25.csv --out ./pca_output

Notes on school_year generalization
-------------------------------------
school_year is assigned as an auto-incrementing integer cohort rank
(0, 1, 2, ...) based on load order. It is used ONLY for within-year
z-scoring and is STRIPPED from model features before training.
"""

import os
import sys
import argparse
import warnings
warnings.filterwarnings("ignore")

# -- third-party --------------------------------------------------------------
import numpy as np
import pandas as pd
import joblib
import shap

from scipy.stats import norm, ttest_ind, chi2_contingency

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

# All individual quarterly grade columns (non-aggregated)
ALL_SUBJECT_COLS = [
    "Filipino 1", "Filipino 2", "Filipino 3", "Filipino 4", "Filipino 5",
    "English 1",  "English 2",  "English 3",  "English 4",  "English 5",
    "Math 1",     "Math 2",     "Math 3",     "Math 4",     "Math 5",
    "Aral Pan 1", "Aral Pan 2", "Aral Pan 3", "Aral Pan 4", "Aral Pan 5",
    "Science 3",  "Science 4",  "Science 5",
]

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

# ============================================================================
# VALIDATION CONSTANTS
# ============================================================================

GENDER_MAP = {
    "Male":   "M",
    "Female": "F",
    "MALE":   "M",
    "FEMALE": "F",
    "male":   "M",
    "female": "F",
    "m":      "M",
    "f":      "F",
    "Boy":    "M",
    "Girl":   "F",
}

VALID_GENDER_VALUES = {"M", "F"}

VALID_NUTRITIONAL_STATUS_VALUES = {
    "Severely Wasted",
    "Wasted",
    "Normal",
    "Overweight",
    "Obese",
}

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


# ============================================================================
# SECTION 0 - DUPLICATE DETECTION
# ============================================================================

_DEDUP_EXCLUDE = {"learnerID", "School"}


def check_duplicates(df: pd.DataFrame, label: str) -> pd.DataFrame:
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

    n_groups = int((~df[dup_mask].duplicated(subset=key_cols, keep="first")).sum())

    print(f"\n  [{label}] *** DUPLICATES DETECTED ***")
    print(f"  Duplicate rows   : {dup_count}")
    print(f"  Duplicate groups : {n_groups}")
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


def build_train_data_aggregated_csv(
    X_train_aggregated: pd.DataFrame,
    y_train: pd.Series,
    display_train: pd.DataFrame,
    out_path: str,
) -> pd.DataFrame:
    """
    Build and save train_data_aggregated.csv with:
      - Aggregated subject averages (Filipino_avg, English_avg, etc.)
      - Categorical columns one-hot encoded (including Nutritional Status)
      - NO z-score or StandardScaler applied
      - Target (MPS) appended as the last column
      - Display columns (learnerID, School, Section, Name, etc.) prepended

    Parameters
    ----------
    X_train_aggregated : DataFrame
        Training features AFTER subject aggregation (has Filipino_avg, English_avg, etc.)
        but BEFORE any scaling/PCA.
    y_train : Series
        Training target (MPS).
    display_train : DataFrame
        Display columns (learnerID, School, Section, Name, etc.)
    out_path : str
        Full path for the output CSV.
    """
    df = X_train_aggregated.copy()
    
    # Drop cohort column if present (not needed for training data export)
    df = df.drop(columns=[COHORT_COL], errors="ignore")
    
    # Identify column types
    cat_cols = df.select_dtypes(exclude=np.number).columns.tolist()
    num_cols = df.select_dtypes(include=np.number).columns.tolist()
    
    # One-hot encode ALL categorical columns (including Nutritional Status)
    ohe_parts = []
    if cat_cols:
        ohe = OneHotEncoder(handle_unknown="ignore", sparse_output=False)
        # Fill NaN with placeholder string for OHE
        ohe_arr = ohe.fit_transform(df[cat_cols].fillna("__MISSING__").astype(str))
        ohe_feature_names = ohe.get_feature_names_out(cat_cols).tolist()
        ohe_df = pd.DataFrame(ohe_arr, columns=ohe_feature_names, index=df.index)
        ohe_parts.append(ohe_df)
    
    # Numeric columns: impute mean (no scaling) — keeps raw aggregated values
    num_df = df[num_cols].copy()
    for col in num_cols:
        num_df[col] = pd.to_numeric(num_df[col], errors="coerce")
        num_df[col] = num_df[col].fillna(num_df[col].mean())
    
    # Combine: numeric (raw aggregated) + OHE categoricals
    parts = [num_df.reset_index(drop=True)]
    for part in ohe_parts:
        parts.append(part.reset_index(drop=True))
    
    feature_df = pd.concat(parts, axis=1)
    
    # Prepend display columns
    disp_reset = display_train.reset_index(drop=True)
    # Keep all display columns including School for reference
    display_subset = disp_reset.copy()
    
    # Append target
    target_series = y_train.reset_index(drop=True)
    
    result = pd.concat([display_subset, feature_df, target_series.rename(TARGET)], axis=1)
    
    result.to_csv(out_path, index=False)
    print(f"  OK train_data_aggregated.csv  ({len(result)} rows x {len(result.columns)} cols)")
    print(f"  Display cols                  : {list(display_subset.columns)}")
    print(f"  Numeric feature cols (aggregated): {len(num_cols)} = {num_cols}")
    print(f"  OHE feature cols (including Nutritional Status): {sum(len(p.columns) for p in ohe_parts)}")
    print(f"  Note: Subject averages (e.g., Filipino_avg), no scaling applied, Nutritional Status OHE.")
    return result

def check_cross_cohort_duplicates(datasets: dict) -> dict:
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
# SECTION 0b - CATEGORICAL FIELD VALIDATION
# ============================================================================

def validate_categorical_fields(df: pd.DataFrame, label: str) -> pd.DataFrame:
    """
    Validate and enforce allowed values for controlled categorical fields.

    Rules
    -----
    Gender
        Allowed : M, F  (case-insensitive; stripped of whitespace)
        Action  : normalise case → if still invalid, set to NaN and warn.

    Nutritional Status
        Allowed : Severely Wasted | Wasted | Normal | Overweight | Obese
                  (title-cased after stripping; exact match required)
        Action  : strip + title-case attempt → if still invalid, set to NaN
                  and warn.

    Invalid rows are NOT dropped; they receive NaN so downstream imputers
    can handle them.  A summary is printed for awareness.

    Parameters
    ----------
    df    : DataFrame to validate (modified in-place copy returned)
    label : cohort label used in print messages

    Returns
    -------
    Cleaned DataFrame with invalid values replaced by NaN.
    """
    df = df.copy()
    issues_found = False

    # ------------------------------------------------------------------
    # Gender
    # ------------------------------------------------------------------
    if "Gender" in df.columns:
        original = df["Gender"].copy()

        # Normalise: strip whitespace, uppercase
        df["Gender"] = (
            df["Gender"]
            .astype(str)
            .str.strip()
            .str.upper()
            .replace({"NAN": np.nan, "NONE": np.nan, "": np.nan})
        )

        invalid_mask = (
            df["Gender"].notna() &
            ~df["Gender"].isin(VALID_GENDER_VALUES)
        )
        n_invalid = int(invalid_mask.sum())

        if n_invalid > 0:
            issues_found = True
            bad_vals = df.loc[invalid_mask, "Gender"].value_counts().to_dict()
            print(f"\n  [{label}] *** GENDER VALIDATION — {n_invalid} invalid value(s) ***")
            print(f"  Allowed values : {sorted(VALID_GENDER_VALUES)}")
            print(f"  Found invalid  : {bad_vals}")

            if "learnerID" in df.columns:
                bad_ids = df.loc[invalid_mask, "learnerID"].tolist()
                shown_ids = bad_ids[:10]
                print(f"  Affected learnerIDs (up to 10): {shown_ids}")
                if len(bad_ids) > 10:
                    print(f"  ... and {len(bad_ids) - 10} more.")

            df.loc[invalid_mask, "Gender"] = np.nan
            print(f"  Action : set {n_invalid} invalid Gender value(s) to NaN.")
        else:
            print(f"  [{label}] Gender validation PASSED  "
                  f"(all values in {sorted(VALID_GENDER_VALUES)}).")

    # ------------------------------------------------------------------
    # Nutritional Status
    # ------------------------------------------------------------------
    if "Nutritional Status" in df.columns:
        # Normalise: strip + title-case
        df["Nutritional Status"] = (
            df["Nutritional Status"]
            .astype(str)
            .str.strip()
            .str.title()
            .replace({"Nan": np.nan, "None": np.nan, "": np.nan})
        )

        # Edge-case fix: "Severely Wasted" may come in as "Severely wasted"
        # after title() → already handled since title() capitalises each word.

        invalid_mask = (
            df["Nutritional Status"].notna() &
            ~df["Nutritional Status"].isin(VALID_NUTRITIONAL_STATUS_VALUES)
        )
        n_invalid = int(invalid_mask.sum())

        if n_invalid > 0:
            issues_found = True
            bad_vals = df.loc[invalid_mask, "Nutritional Status"].value_counts().to_dict()
            print(f"\n  [{label}] *** NUTRITIONAL STATUS VALIDATION — "
                  f"{n_invalid} invalid value(s) ***")
            print(f"  Allowed values : {sorted(VALID_NUTRITIONAL_STATUS_VALUES)}")
            print(f"  Found invalid  : {bad_vals}")

            if "learnerID" in df.columns:
                bad_ids = df.loc[invalid_mask, "learnerID"].tolist()
                shown_ids = bad_ids[:10]
                print(f"  Affected learnerIDs (up to 10): {shown_ids}")
                if len(bad_ids) > 10:
                    print(f"  ... and {len(bad_ids) - 10} more.")

            df.loc[invalid_mask, "Nutritional Status"] = np.nan
            print(f"  Action : set {n_invalid} invalid Nutritional Status value(s) to NaN.")
        else:
            print(f"  [{label}] Nutritional Status validation PASSED  "
                  f"(all values in {sorted(VALID_NUTRITIONAL_STATUS_VALUES)}).")

    if not issues_found:
        print(f"  [{label}] Categorical validation PASSED — no issues found.")

    return df


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

def apply_gender_map(df: pd.DataFrame) -> pd.DataFrame:
    """
    Normalize inconsistent gender labels to 'M' or 'F'.
    
    This is similar to apply_mother_tongue_map() and should be called
    BEFORE validate_categorical_fields() to reduce NaN conversions.
    """
    if "Gender" in df.columns:
        df = df.copy()
        df["Gender"] = df["Gender"].replace(GENDER_MAP)
    return df

def aggregate_subject_grades(df: pd.DataFrame) -> pd.DataFrame:
    """
    Average quarterly grades into subject-level columns.
    Original quarterly columns are RETAINED here; they are only dropped
    for the main model pipeline, not for train_data.csv.
    """
    df = df.copy()
    for new_col, src_cols in SUBJECT_AGGREGATE_MAP.items():
        present = [c for c in src_cols if c in df.columns]
        if not present:
            continue
        df[new_col] = df[present].apply(pd.to_numeric, errors="coerce").mean(axis=1)
    return df

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


# ============================================================================
# SECTION 1b - LEAKAGE-FREE Z-SCORE  (fit on train, apply to both)
# ============================================================================

def fit_zscore_params(df_train: pd.DataFrame, cols: list,
                      cohort_col: str = COHORT_COL) -> dict:
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
    df = df.copy()
    for col in cols:
        if col not in df.columns:
            continue

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
        ("impute", SimpleImputer(strategy="mean")),
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

    train_pcs = pca.fit_transform(X_train[present].fillna(X_train[present].mean()))
    test_pcs  = pca.transform(X_test[present].fillna(X_train[present].mean()))

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

def get_pass_probability(pred_score, residual_std, threshold=75):
    scores = np.asarray(pred_score, dtype=float)
    probs = 1.0 - norm.cdf(threshold, loc=scores, scale=residual_std)
    if scores.ndim == 0:
        return round(float(probs), 4)
    return np.round(probs, 4)

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
# SECTION 4 - TRAIN DATA CSV
#   Raw non-aggregated subject columns + encoded categorical columns
#   (OHE for most, label encoding for Nutritional Status).
#   No scaling, no z-score applied.
# ============================================================================

def build_train_data_csv(
    X_train_raw: pd.DataFrame,
    y_train: pd.Series,
    display_train: pd.DataFrame,
    out_path: str,
) -> pd.DataFrame:
    """
    Build and save train_data.csv with:
      - Raw (non-aggregated) quarterly subject grade columns kept as-is
      - Categorical columns one-hot encoded (no scaling), EXCEPT Nutritional Status
        which is label-encoded with predefined mapping
      - Numeric non-subject columns kept as-is (no scaling)
      - NO z-score or StandardScaler applied
      - Target (MPS) appended as the last column
      - Display columns (learnerID, etc., excl. School) prepended

    Parameters
    ----------
    X_train_raw : DataFrame
        Training features BEFORE aggregation, z-score, and PCA.
        Must contain the original quarterly subject columns.
    y_train : Series
        Training target (MPS).
    display_train : DataFrame
        Display columns (learnerID, School, Section, Name, etc.)
    out_path : str
        Full path for the output CSV.
    """
    df = X_train_raw.copy()

    # Identify column types
    cat_cols = df.select_dtypes(exclude=np.number).columns.tolist()
    num_cols = df.select_dtypes(include=np.number).columns.tolist()

    # One-hot encode categorical columns only (no scaling anywhere)
    ohe_parts = []
    if cat_cols:
        ohe = OneHotEncoder(handle_unknown="ignore", sparse_output=False)
        ohe_arr = ohe.fit_transform(df[cat_cols].fillna("__NA__").astype(str))
        ohe_feature_names = ohe.get_feature_names_out(cat_cols).tolist()
        ohe_df = pd.DataFrame(ohe_arr, columns=ohe_feature_names, index=df.index)
        ohe_parts.append(ohe_df)

    # Numeric columns: impute mean(no scaling) — keeps raw grade values
    num_df = df[num_cols].copy()
    for col in num_cols:
        num_df[col] = pd.to_numeric(num_df[col], errors="coerce")
        num_df[col] = num_df[col].fillna(num_df[col].mean())

    # Combine: numeric (raw) + OHE categoricals
    parts = [num_df.reset_index(drop=True)]
    for part in ohe_parts:
        parts.append(part.reset_index(drop=True))

    feature_df = pd.concat(parts, axis=1)

    # Prepend display columns (exclude School per convention)
    disp_reset = display_train.reset_index(drop=True)
    display_col_names = [c for c in disp_reset.columns if c != "School"]
    disp_subset = disp_reset[display_col_names] if display_col_names else pd.DataFrame()

    # Append target
    target_series = y_train.reset_index(drop=True)

    result = pd.concat([disp_subset, feature_df, target_series.rename(TARGET)], axis=1)

    result.to_csv(out_path, index=False)
    print(f"  OK train_data.csv  ({len(result)} rows x {len(result.columns)} cols)")
    print(f"  Display cols (excl. School): {display_col_names}")
    print(f"  Numeric feature cols       : {len(num_cols)}")
    print(f"  OHE feature cols           : {sum(len(p.columns) for p in ohe_parts)}")
    print(f"  Note: Raw quarterly subject grades included, no scaling applied.")
    return result


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
    print(f"  Rule: duplicates identified by ALL columns EXCEPT learnerID, and Schoool.\n")

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
    # STEP 1c: Categorical field validation
    #   - Gender must be M or F
    #   - Nutritional Status must be one of the 5 allowed values
    #   Runs BEFORE any encoding or feature engineering.
    #   Invalid values are set to NaN (not dropped); downstream imputers
    #   handle them via most_frequent strategy.
    # =========================================================================
    print(f"\n{sep}\n  STEP 1c - CATEGORICAL FIELD VALIDATION\n{sep}")
    print(f"  Gender             : allowed = {sorted(VALID_GENDER_VALUES)}")
    print(f"  Nutritional Status : allowed = {sorted(VALID_NUTRITIONAL_STATUS_VALUES)}\n")

    val_summary = {}
    for label, df in datasets.items():
        df_validated = validate_categorical_fields(df, label)
        datasets[label] = df_validated

        # Collect per-cohort summary counts for the artifact
        gender_invalid = 0
        ns_invalid = 0
        if "Gender" in df_validated.columns:
            gender_invalid = int((
                df_validated["Gender"].notna() &
                ~df_validated["Gender"].isin(VALID_GENDER_VALUES)
            ).sum())
        if "Nutritional Status" in df_validated.columns:
            ns_invalid = int(
                (df_validated["Nutritional Status"].notna() &
                 ~df_validated["Nutritional Status"].isin(VALID_NUTRITIONAL_STATUS_VALUES)).sum()
            )
        val_summary[label] = {
            "gender_invalid_set_to_nan": gender_invalid,
            "nutritional_status_invalid_set_to_nan": ns_invalid,
        }

    # =========================================================================
    # STEP 2: Non-fitting preprocessing (safe before split)
    #   - dtype normalisation
    #   - mother tongue unification
    #   - Nutritional Status label encoding
    #   - quarterly -> subject avg aggregation  (originals KEPT for train_data)
    #   - drop display columns
    # =========================================================================
    print(f"\n{sep}\n  STEP 2 - NON-FITTING PREPROCESSING\n{sep}")
    cleaned     = {}   # for main model pipeline (aggregated, no quarterly cols)
    cleaned_raw = {}   # for train_data.csv (quarterly cols preserved)

    for label, df in datasets.items():
        df = df.drop(columns=DROP_COLS, errors="ignore")
        df = normalize_dtypes(df)
        df = apply_mother_tongue_map(df)
        df = apply_gender_map(df)

        # aggregate_subject_grades now adds avg cols WITHOUT dropping originals
        df = aggregate_subject_grades(df)

        # raw version: keep quarterly + avg cols (drop avg cols from model version)
        df_raw = df.copy()
        cleaned_raw[label] = df_raw

        # model version: drop the original quarterly cols (use avg cols only)
        quarterly_present = [c for c in ALL_SUBJECT_COLS if c in df.columns]
        df_model = df.drop(columns=quarterly_present, errors="ignore")
        cleaned[label] = df_model

        subj_present = [c for c in SUBJECT_AVG_COLS if c in df_model.columns]
        print(f"  [{label}]: model cols={df_model.shape[1]}  "
              f"| subject avgs: {subj_present}")
        quarterly_found = [c for c in ALL_SUBJECT_COLS if c in df_raw.columns]
        print(f"  [{label}]: raw cols={df_raw.shape[1]}  "
              f"| quarterly cols retained: {len(quarterly_found)}")

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
    # =========================================================================
    print(f"\n{sep}\n  STEP 4 - COMBINE & STRATIFIED SPLIT  (split-first)\n{sep}")

    # --- model pipeline data (aggregated) ---
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

    # --- raw data (non-aggregated, for train_data.csv) ---
    raw_reset = {}
    raw_offset = 0
    for label, df in cleaned_raw.items():
        df_r = df.reset_index(drop=True)
        df_r.index = df_r.index + raw_offset
        raw_reset[label] = df_r
        raw_offset += len(df_r)

    combined_raw = pd.concat(list(raw_reset.values()))

    # --- raw data BEFORE any encoding (for test_data.csv Nutritional Status preservation) ---
    raw_no_encode_reset = {}
    raw_no_encode_offset = 0
    for label, df in datasets.items():
        # Only drop display cols, keep everything else in original form
        df_no_enc = df.drop(columns=DROP_COLS, errors="ignore").copy()
        df_no_enc = normalize_dtypes(df_no_enc)
        df_no_enc = apply_mother_tongue_map(df_no_enc)
        df_no_enc = apply_gender_map(df_no_enc)
        # NOTE: Nutritional Status is NOT encoded here — preserved as original strings
        df_no_enc = aggregate_subject_grades(df_no_enc)
        df_no_enc = df_no_enc.reset_index(drop=True)
        df_no_enc.index = df_no_enc.index + raw_no_encode_offset
        raw_no_encode_reset[label] = df_no_enc
        raw_no_encode_offset += len(df_no_enc)

    combined_raw_no_encode = pd.concat(list(raw_no_encode_reset.values()))

    if TARGET not in combined.columns:
        sys.exit(f"ERROR: Target column '{TARGET}' not found in data.")

    X_full = combined.drop(columns=[TARGET])
    y_full = combined[TARGET]

    # For combined_raw, we also need to align index with combined
    # (they should be the same rows in the same order since raw is a superset)
    X_full_raw = combined_raw.drop(columns=[TARGET], errors="ignore")
    X_full_raw_no_encode = combined_raw_no_encode.drop(columns=[TARGET], errors="ignore")

    stratify_col = X_full[COHORT_COL].copy() if COHORT_COL in X_full.columns else None
    X_full_no_cohort = X_full.drop(columns=[COHORT_COL], errors="ignore")

    # Use integer positional indices for alignment between model and raw splits
    all_indices = np.arange(len(X_full_no_cohort))

    (X_train_no_cohort, X_test_no_cohort,
     y_train, y_test,
     cohort_train, cohort_test,
     disp_train, disp_test,
     idx_train, idx_test) = train_test_split(
        X_full_no_cohort,
        y_full,
        stratify_col if stratify_col is not None else pd.Series(np.zeros(len(y_full))),
        all_display,
        all_indices,
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

    # Align raw training rows using the same split indices
    X_train_raw_aligned = X_full_raw.iloc[idx_train].reset_index(drop=True)
    # Strip cohort col from raw (not needed for train_data.csv)
    X_train_raw_aligned = X_train_raw_aligned.drop(columns=[COHORT_COL], errors="ignore")

    print(f"  Total  : {len(combined)} rows")
    print(f"  Train  : {len(X_train_wc)} rows")
    print(f"  Test   : {len(X_test_wc)} rows")
    if stratify_col is not None:
        vc = cohort_train.value_counts().sort_index()
        print(f"  Train cohort split: " +
              "  ".join(f"rank{k}={v}" for k, v in vc.items()))

    # =========================================================================
    # STEP 5: Within-cohort z-scoring  (TRAIN stats only, applied to both)
    #         NOTE: z-scoring is applied to the MODEL pipeline only.
    #               train_data.csv uses the raw, unscaled values.
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
        print(f"  train_data.csv is NOT z-scored (raw values preserved).")
    else:
        zscore_params = {}
        reason = "--no-zscore flag" if args.no_zscore else "no shift detected"
        print(f"\n  STEP 5 - Z-score skipped ({reason})")

    # Now drop COHORT_COL from both splits — model never sees it
    X_train = X_train_wc.drop(columns=[COHORT_COL], errors="ignore")
    X_test  = X_test_wc.drop(columns=[COHORT_COL],  errors="ignore")
    X_test.to_csv('test.csv', index=False)

    # =========================================================================
    # STEP 5b: Save train_data.csv
    #   Uses X_train_raw_aligned (non-aggregated, no scaling, no z-score)
    # =========================================================================
    print(f"\n{sep}\n  STEP 5b - SAVE TRAIN DATA (raw, non-aggregated, no scaling)\n{sep}")

    # Drop subject avg cols from raw — we want only the original quarterly cols
    raw_for_csv = X_train_raw_aligned.drop(columns=SUBJECT_AVG_COLS, errors="ignore")

    train_data_path = os.path.join(args.out, "train_data.csv")
    build_train_data_csv(
        X_train_raw=raw_for_csv,
        y_train=y_train,
        display_train=display_train,
        out_path=train_data_path,
    )

    # =========================================================================
    # STEP 5c: Save test_data.csv (raw, non-aggregated, no scaling, no encoding)
    # =========================================================================
    print(f"\n{sep}\n  STEP 5c - SAVE TEST DATA (raw, non-aggregated, no scaling, no encoding)\n{sep}")

    # Align raw test rows using the same split indices (use non-encoded version to preserve string Nutritional Status)
    X_test_raw_aligned = X_full_raw_no_encode.iloc[idx_test].reset_index(drop=True)
    # Strip cohort col from raw
    X_test_raw_aligned = X_test_raw_aligned.drop(columns=[COHORT_COL], errors="ignore")
    # Drop subject avg cols — keep only original quarterly cols + other raw features
    raw_test_for_csv = X_test_raw_aligned.drop(columns=SUBJECT_AVG_COLS, errors="ignore")

    # Build test data: raw features + display columns (excl. School), WITH target
    df_test = raw_test_for_csv.copy()

    # Prepend display columns (exclude School per convention, but include target)
    disp_test_reset = display_test.reset_index(drop=True)
    display_col_names_test = [c for c in disp_test_reset.columns if c != "School"]
    disp_test_subset = disp_test_reset[display_col_names_test] if display_col_names_test else pd.DataFrame()

    # Append target (MPS)
    target_series_test = y_test.reset_index(drop=True)

    result_test = pd.concat([disp_test_subset.reset_index(drop=True), df_test.reset_index(drop=True), target_series_test.rename(TARGET)], axis=1)

    test_data_path = os.path.join(args.out, "test_data.csv")
    result_test.to_csv(test_data_path, index=False)
    print(f"  OK test_data.csv  ({len(result_test)} rows x {len(result_test.columns)} cols)")
    print(f"  Display cols (excl. School): {display_col_names_test}")
    print(f"  Feature cols (raw, no encoding): {len(df_test.columns)}")
    print(f"  Target column (MPS): included")
    print(f"  Note: Raw quarterly subject grades included, no scaling, no OHE.")

    # =========================================================================
    # STEP 5d: Save train_data_aggregated.csv (aggregated subject averages)
    # =========================================================================
    print(f"\n{sep}\n  STEP 5d - SAVE TRAIN DATA (aggregated subject avgs, no scaling)\n{sep}")

    # Use the same X_train_raw_aligned but keep ONLY aggregated subject avg columns
    # Remove quarterly grade columns, keep aggregated avgs
    train_aggregated = X_train_raw_aligned.copy()
    
    # Keep only subject avg columns + other numeric/categorical columns
    keep_cols = SUBJECT_AVG_COLS.copy()
    # Also keep any other columns that are NOT quarterly grades
    for col in train_aggregated.columns:
        if col not in ALL_SUBJECT_COLS and col not in SUBJECT_AVG_COLS:
            keep_cols.append(col)
    
    # Remove duplicates while preserving order
    keep_cols = list(dict.fromkeys(keep_cols))
    train_aggregated = train_aggregated[keep_cols]
    
    # Also ensure Nutritional Status is preserved (it's in keep_cols if present)
    train_data_agg_path = os.path.join(args.out, "train_data_aggregated.csv")
    build_train_data_aggregated_csv(
        X_train_aggregated=train_aggregated,
        y_train=y_train,
        display_train=display_train,
        out_path=train_data_agg_path,
    )
    # =========================================================================
    # STEP 6: PCA on subject averages  (fit on train only)
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

    residual_std = float(np.std(y_test - best_pipe.predict(X_test)))
    test_results_df = display_test.copy().reset_index(drop=True)
    test_results_df["Actual_MPS"]      = y_test.values
    test_results_df["Predicted_MPS"]   = y_pred_best
    test_results_df["Difference"]      = y_pred_best - y_test.values
    test_results_df["Error_Magnitude"] = np.abs(y_test.values - y_pred_best)
    test_results_df["Actual_Proficiency"]    = encode_proficiency(y_test.values)
    test_results_df["Predicted_Proficiency"] = encode_proficiency(y_pred_best)
    test_results_df["Pass_Probability"] = get_pass_probability(y_pred_best,residual_std, args.threshold)

    result_cols   = ["Actual_MPS", "Predicted_MPS", "Difference",
                     "Error_Magnitude", "Actual_Proficiency", "Predicted_Proficiency", "Pass_Probability"]
    display_found = [c for c in DROP_COLS if c in test_results_df.columns]
    test_results_df = test_results_df[display_found + result_cols]

    test_results_path = os.path.join(args.out, "test_results.csv")
    test_results_df.to_csv(test_results_path, index=False)
    print(f"  OK test_results.csv  ({len(test_results_df)} students)")

    results_df = pd.DataFrame(results)
    results_df.to_csv(os.path.join(args.out, "model_results.csv"), index=False)
    print(f"  OK model_results.csv")

    # =========================================================================
    # STEP 9b: School-level predictions for ALL models
    # =========================================================================
    print(f"\n{sep}\n  STEP 9b - SCHOOL-LEVEL PREDICTIONS (ALL MODELS)\n{sep}")

    school_test = display_test["School"].values if "School" in display_test.columns else None

    if school_test is not None:
        all_models_txt_path = os.path.join(args.out, "school_predictions_all_models.txt")
        lines = []
        lines.append("=" * 70)
        lines.append("  SCHOOL-LEVEL PREDICTIONS — ALL MODELS")
        lines.append("=" * 70)
        lines.append(f"  Total schools: {len(np.unique(school_test))}")
        lines.append(f"  Models evaluated: " + ", ".join(list(per_model_outs.keys())))
        lines.append(f"  Best model: {best_name}  (R^2 = {best_r2:.4f})")
        lines.append("=" * 70)
        lines.append("")

        # Build a DataFrame: rows = students, cols = school, actual, <model>_pred
        df_all = pd.DataFrame({
            "School": school_test,
            "Actual_MPS": y_test.values,
        })
        for mname, mouts in per_model_outs.items():
            df_all[f"{mname}_pred"] = mouts["y_pred"]

        # Group by school and compute averages
        grouped = df_all.groupby("School").agg({
            "Actual_MPS": "mean",
            **{f"{m}_pred": "mean" for m in per_model_outs.keys()}
        }).round(4)
        grouped["Student_Count"] = df_all.groupby("School").size()

        # Reorder columns
        col_order = ["Student_Count", "Actual_MPS"] + [f"{m}_pred" for m in per_model_outs.keys()]
        grouped = grouped[col_order]

        # Write to text file (simple fixed-width columns)
        header = ["School", "N"] + [f"{m:>12}" for m in per_model_outs.keys()]
        sep_line = "-" * 80
        lines.append(f"  {'School':<25} {'N':>5} {'Actual_MPS':>10}  " +
                     "  ".join(f"{m:>12}" for m in per_model_outs.keys()))
        lines.append(sep_line)

        for school, row in grouped.iterrows():
            line = f"  {str(school)[:25]:<25} {int(row['Student_Count']):>5} {row['Actual_MPS']:>10.2f}  "
            line += "  ".join(f"{row[f'{m}_pred']:>12.2f}" for m in per_model_outs.keys())
            lines.append(line)

        lines.append("")
        lines.append("  Legend: model suffix '_pred' indicates predicted MPS for that model.")
        lines.append("  " + "=" * 70)
        lines.append("")

        with open(all_models_txt_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")

        print(f"  OK school_predictions_all_models.txt  ({len(grouped)} schools, {len(per_model_outs)} models)")
        print(f"  Preview (first 5 schools):")
        for line in lines[:min(20, len(lines))]:
            print(f"  {line}")
        if len(lines) > 20:
            print(f"  ... and {len(lines)-20} more lines (saved to file).")
    else:
        print("  School labels not available - skipping all-models school predictions.")

    # =========================================================================
    # STEP 10: Explainability
    # =========================================================================
    print(f"\n{sep}\n  STEP 10 - EXPLAINABILITY\n{sep}")

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
    # STEP 11: Save artifact
    # =========================================================================
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
        "zscore_applied":           apply_zscore,
        "zscore_params":            zscore_params,
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
        # Duplicate removal summary
        "duplicate_summary":        dup_summary,
        # Categorical validation summary
        "validation_summary":       val_summary,
        "valid_gender_values":      sorted(VALID_GENDER_VALUES),
        "valid_nutritional_status_values": sorted(VALID_NUTRITIONAL_STATUS_VALUES),
    }

    joblib_path = os.path.join(args.out, "best_model.joblib")
    joblib.dump(artifact, joblib_path)
    print(f"  OK best_model.joblib")

    print(f"\n{sep}")
    print(f"  DONE - all outputs in: {os.path.abspath(args.out)}")
    print(sep)
    print(f"\n  Outputs:")
    print(f"    best_model.joblib   <- trained model + metadata")
    print(f"    train_data.csv      <- raw quarterly grades + OHE cats (except")
    print(f"                            Nutritional Status -> label encoded), no scaling")
    print(f"    test_data.csv       <- raw quarterly grades, NO encoding, no scaling")
    print(f"    model_results.csv   <- MAE/RMSE/R2 per model")
    print(f"    test_results.csv    <- per-student predictions on test set")
    print(f"    school_report.csv   <- school-level aggregated results")
    print(sep + "\n")


if __name__ == "__main__":
    main()