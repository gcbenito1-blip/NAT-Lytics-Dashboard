"""
Preprocess → Encode → Stratified Split → Save Train CSV
=========================================================
Steps performed:
  1. Load & merge cohort CSVs  (assigns school_year rank per file)
  2. Non-fitting preprocessing
       - dtype normalisation
       - mother-tongue unification
       - quarterly grades → subject-avg aggregation  (row-wise, no leakage)
       - drop display-only columns (learnerID, School, Section, Full Name, Name)
  3. Stratified train/test split  (stratified by school_year cohort)
  4. Sklearn preprocessing fitted on TRAIN ONLY
       - numeric  : median imputation → StandardScaler
       - categorical : most-frequent imputation → OneHotEncoder
  5. Save train set (encoded) as CSV  — NO z-score standardisation applied

school_year is used only for stratification, then stripped before encoding.

Usage (defaults match original pipeline):
  python preprocess_train_only.py
  python preprocess_train_only.py --csv1 23-24.csv --csv2 24-25.csv --out ./outputs
  python preprocess_train_only.py --csv1 23-24.csv --csv2 24-25.csv --no-scale
"""

import os
import sys
import argparse
import warnings
warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.impute import SimpleImputer

# ============================================================================
# CONSTANTS  (unchanged from original pipeline)
# ============================================================================
TARGET     = "MPS"
DROP_COLS  = ["learnerID", "School", "Section", "Full Name", "Name"]
COHORT_COL = "school_year"
TEST_SIZE  = 0.30
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


# ============================================================================
# STEP 1 HELPERS - Load
# ============================================================================

def load_csv(path: str, label: str, rank: int) -> pd.DataFrame:
    df = pd.read_csv(path)
    df[COHORT_COL] = rank
    print(f"  Cohort {rank} [{label}]: {len(df)} rows x {len(df.columns)} cols  ({path})")
    return df


# ============================================================================
# STEP 2 HELPERS - Non-fitting preprocessing
# ============================================================================

def normalize_dtypes(df: pd.DataFrame) -> pd.DataFrame:
    prefixes = ("Filipino", "English", "Math", "Aral Pan", "Science", "Age")
    df = df.copy()
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
    """Row-wise mean of quarterly grades → subject avg columns. Safe before split."""
    df = df.copy()
    to_drop = []
    for new_col, src_cols in SUBJECT_AGGREGATE_MAP.items():
        present = [c for c in src_cols if c in df.columns]
        if not present:
            continue
        df[new_col] = df[present].apply(pd.to_numeric, errors="coerce").mean(axis=1)
        to_drop.extend(present)
    return df.drop(columns=to_drop, errors="ignore")


def preprocess(df: pd.DataFrame) -> pd.DataFrame:
    df = df.drop(columns=DROP_COLS, errors="ignore")
    df = normalize_dtypes(df)
    df = apply_mother_tongue_map(df)
    df = aggregate_subject_grades(df)
    return df


# ============================================================================
# STEP 4 HELPERS - Sklearn preprocessor
# ============================================================================

def build_preprocessor(num_cols: list, cat_cols: list,
                        scale: bool = True) -> ColumnTransformer:
    num_steps = [("impute", SimpleImputer(strategy="median"))]
    if scale:
        num_steps.append(("scale", StandardScaler()))

    num_pipe = Pipeline(num_steps)
    cat_pipe = Pipeline([
        ("impute", SimpleImputer(strategy="most_frequent")),
        ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
    ])
    return ColumnTransformer([
        ("num", num_pipe, num_cols),
        ("cat", cat_pipe, cat_cols),
    ], verbose_feature_names_out=False)


def get_feature_names(preprocessor: ColumnTransformer,
                      num_cols: list, cat_cols: list) -> list:
    try:
        ohe = preprocessor.named_transformers_["cat"].named_steps["onehot"]
        cat_features = ohe.get_feature_names_out(cat_cols).tolist()
    except Exception:
        cat_features = []
    return num_cols + cat_features


# ============================================================================
# MAIN
# ============================================================================

def parse_args():
    p = argparse.ArgumentParser(description="Preprocess → Encode → Train CSV")
    p.add_argument("--csv1",      default="23-24.csv",  help="First cohort CSV")
    p.add_argument("--csv2",      default="24-25.csv",  help="Second cohort CSV")
    p.add_argument("--extra-csvs", nargs="*", default=[],
                   help="Additional cohort CSVs (ranks 2, 3, ...)")
    p.add_argument("--out",       default="outputs",    help="Output directory")
    p.add_argument("--no-scale",  action="store_true",
                   help="Skip StandardScaler (imputation still applied)")
    return p.parse_args()


def main():
    args = parse_args()
    os.makedirs(args.out, exist_ok=True)
    sep = "=" * 60

    # ------------------------------------------------------------------
    # STEP 1: Load CSVs
    # ------------------------------------------------------------------
    print(f"\n{sep}\n  STEP 1 - LOADING DATA\n{sep}")

    csv_pairs = [("23-24", args.csv1), ("24-25", args.csv2)]
    for i, extra in enumerate(args.extra_csvs or []):
        label = os.path.splitext(os.path.basename(extra))[0]
        csv_pairs.append((label, extra))

    frames = []
    for rank, (label, path) in enumerate(csv_pairs):
        try:
            frames.append(load_csv(path, label, rank))
        except FileNotFoundError:
            print(f"  !  {path} not found — skipping [{label}]")

    if not frames:
        sys.exit("ERROR: No CSV files loaded. Check --csv1 / --csv2 paths.")

    # ------------------------------------------------------------------
    # STEP 2: Non-fitting preprocessing (safe before split)
    # ------------------------------------------------------------------
    print(f"\n{sep}\n  STEP 2 - PREPROCESSING\n{sep}")

    cleaned = []
    for df in frames:
        df = preprocess(df)
        subj_present = [c for c in SUBJECT_AVG_COLS if c in df.columns]
        print(f"  Cohort rank {df[COHORT_COL].iloc[0]}: "
              f"{df.shape[1]} cols after aggregation | "
              f"subject avgs: {subj_present}")
        cleaned.append(df)

    combined = pd.concat(cleaned, ignore_index=True)
    print(f"\n  Combined: {len(combined)} rows x {combined.shape[1]} cols")

    if TARGET not in combined.columns:
        sys.exit(f"ERROR: Target column '{TARGET}' not found.")

    # ------------------------------------------------------------------
    # STEP 3: Stratified train/test split
    # ------------------------------------------------------------------
    print(f"\n{sep}\n  STEP 3 - STRATIFIED TRAIN/TEST SPLIT\n{sep}")

    X_full = combined.drop(columns=[TARGET])
    y_full = combined[TARGET]

    # Stratify by cohort; strip cohort column before encoding
    stratify_col  = X_full[COHORT_COL]
    X_no_cohort   = X_full.drop(columns=[COHORT_COL])

    X_train, X_test, y_train, y_test = train_test_split(
        X_no_cohort, y_full,
        test_size=TEST_SIZE,
        random_state=RANDOM_SEED,
        stratify=stratify_col,

    )
    # After Step 3 (split), on X_train + y_train
    train_full = X_train.copy()
    train_full[TARGET] = y_train.values

    stats = train_full.describe().T[["count", "min", "max", "mean", "50%", "std"]]
    stats.columns = ["N", "Min", "Max", "Mean", "Median", "SD"]
    stats["Skewness"] = train_full.select_dtypes(include=np.number).skew()
    stats = stats.round(2)
    stats.to_csv(os.path.join(args.out, "descriptive_stats.csv"))

    print(f"  Total  : {len(combined)} rows")
    print(f"  Train  : {len(X_train)} rows  ({100*(1-TEST_SIZE):.0f}%)")
    print(f"  Test   : {len(X_test)} rows   ({100*TEST_SIZE:.0f}%)")

    # ------------------------------------------------------------------
    # STEP 4: Fit preprocessor on TRAIN, transform TRAIN
    # ------------------------------------------------------------------
    print(f"\n{sep}\n  STEP 4 - ENCODING (fit on train only)\n{sep}")

    num_cols = X_train.select_dtypes(include=np.number).columns.tolist()
    cat_cols = X_train.select_dtypes(exclude=np.number).columns.tolist()

    print(f"  Numeric      ({len(num_cols)}): {num_cols}")
    print(f"  Categorical  ({len(cat_cols)}): {cat_cols}")
    print(f"  StandardScaler: {'OFF (--no-scale)' if args.no_scale else 'ON'}")

    preprocessor = build_preprocessor(num_cols, cat_cols, scale=not args.no_scale)
    X_train_enc  = preprocessor.fit_transform(X_train)   # fit ONLY on train
    feat_names   = get_feature_names(preprocessor, num_cols, cat_cols)

    # ------------------------------------------------------------------
    # STEP 5: Save train CSV
    # ------------------------------------------------------------------
    print(f"\n{sep}\n  STEP 5 - SAVING TRAIN CSV\n{sep}")

    train_df = pd.DataFrame(X_train_enc, columns=feat_names)
    train_df[TARGET] = y_train.values

    out_path = os.path.join(args.out, "train_encoded.csv")
    train_df.to_csv(out_path, index=False)

    print(f"  Rows    : {len(train_df)}")
    print(f"  Columns : {len(train_df.columns)}  "
          f"({len(feat_names)} features + 1 target)")
    print(f"  Saved   : {os.path.abspath(out_path)}")
    print(f"\n{sep}\n  DONE\n{sep}\n")

if __name__ == "__main__":
    main()