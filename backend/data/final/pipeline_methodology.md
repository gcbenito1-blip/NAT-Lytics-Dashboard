# MPS Prediction Pipeline – Methodology Report

## Overview

This document describes the end-to-end machine learning pipeline implemented in `pipeline.py` for predicting **MPS (Mean Proficiency Score)** from Philippine Basic Education cohort data. The pipeline covers data integration, preprocessing, model training, evaluation, and comprehensive collinearity diagnostics — all designed to produce robust, generalizable predictions across multiple school cohorts.

**Pipeline Version**: Full MPS Prediction Pipeline  
**Target Variable**: `MPS` (continuous, 0–100 scale)  
**Primary Use Case**: Predict student cohort performance and generate pass‑probability estimates  
**Key Design Principle**: No data leakage; school‑year generalization for unseen cohorts

---

## 1. Data Sources & Integration

### 1.1 Cohort CSVs
The pipeline accepts multiple cohort CSV files as input. By default it loads:

- `23-24.csv` – Cohort 0 (academic year 2023‑2024)  
- `24-25.csv` – Cohort 1 (academic year 2024‑2025)  
- Additional cohorts via `--extra-csvs`

Each CSV is expected to contain per‑student records with:

- **Demographics**: `learnerID`, `School`, `Section`, `Full Name`, `Name`, `Mother Tongue`, `Age`
- **Subject‑by‑grade columns**: `Filipino 1` … `Filipino 5`, `English 1` … `English 5`, `Math 1` … `Math 5`, `Aral Pan 1` … `Aral Pan 5`, `Science 3` … `Science 5`
- **Target**: `MPS` (mean proficiency score)

### 1.2 Cohort Labeling (No Leakage)
Each loaded dataset is assigned a `school_year` integer (0, 1, 2, …) solely for:

- Within‑cohort z‑scoring (normalization)
- Stratified train/test splitting

This label is **stripped before model training**, ensuring any new cohort can be processed without retraining.

### 1.3 Combining Datasets
All cohorts are concatenated into a single `combined` DataFrame. Display‑only columns (`learnerID`, `School`, etc.) are preserved separately for reporting but excluded from features.

---

## 2. Preprocessing Pipeline

### 2.1 Column Cleaning
Columns in `DROP_COLS` (`learnerID`, `School`, `Section`, `Full Name`, `Name`) are removed from feature sets.

### 2.2 Type Normalization
Numeric coercion is applied to all columns prefixed with:

- `Filipino`, `English`, `Math`, `Aral Pan`, `Science`, `Age`

Non‑numeric values become `NaN`.

### 2.3 Mother‑Tongue Unification
The `Mother Tongue` column is standardized via mapping:

```python
{
    "Filipino": "Tagalog",
    "Iloko":    "Ilocano"
}
```

This reduces cardinality and aligns dialects.

### 2.4 Subject Grade Aggregation
Per‑grade subject columns are averaged into **aggregate subject proficiency scores**:

| Aggregated Column | Source Columns |
|-------------------|---------------|
| `Filipino_avg`    | Filipino 1–5 |
| `English_avg`     | English 1–5  |
| `Math_avg`        | Math 1–5     |
| `AralPan_avg`     | Aral Pan 1–5 |
| `Science_avg`     | Science 3–5  |

The original per‑grade columns are dropped. This reduces dimensionality and captures overall subject mastery.

### 2.5 Distribution Shift Detection
For cohorts 0 and 1, a Welch t‑test (α = 0.05) compares means of each `SUBJECT_AVG_COLS`.

- **If shift detected** (`p < 0.05`) → within‑cohort z‑scoring is recommended (default ON).
- Results are reported in `analysis_report.txt`.

### 2.6 Within‑Cohort Z‑Scoring (Optional)
When enabled (default), each subject average is standardized **per cohort**:

\[ z = \frac{x - \mu_{cohort}}{\sigma_{cohort}} \]

This removes cohort‑level location/scale differences while preserving within‑cohort rankings.

### 2.7 PCA on Subject Averages (Optional)
If `--no-pca` is not set, PCA replaces the five subject‑average columns with `academic_PC1`, `academic_PC2`, `academic_PC3` (default: 2 components).

- Applied **after** train/test split to avoid leakage.
- Fit on training data only; same transform to test data.
- Explained variance is reported.

---

## 3. Train/Test Splitting

- **Test size**: 30%
- **Random seed**: 42
- **Stratification**: By `school_year` (ensures balanced cohort representation in both splits)

Split indices are aligned with `display_*` DataFrames to preserve student identifiers for reporting.

---

## 4. Feature Preprocessing (Scikit‑Learn Pipeline)

A `ColumnTransformer` processes numeric and categorical features separately:

### 4.1 Numeric Features
Pipeline:

1. `SimpleImputer(strategy="median")`
2. `StandardScaler()`

### 4.2 Categorical Features
Pipeline:

1. `SimpleImputer(strategy="most_frequent")`
2. `OneHotEncoder(handle_unknown="ignore", sparse_output=False)`

The preprocessor is fitted on `X_train` and applied to `X_test`.

---

## 5. Model Training

Five regression models are trained and evaluated in parallel:

| Model | Hyperparameters |
|-------|----------------|
| **LinearRegression** | Default |
| **Lasso** | `alpha=0.01` |
| **DecisionTreeRegressor** | `random_state=42` |
| **RandomForestRegressor** | `n_estimators=100`, `random_state=42`, `n_jobs=-1` |
| **GradientBoostingRegressor** | `n_estimators=100`, `random_state=42` |

All models use the same preprocessing pipeline via:

```python
Pipeline([("prep", preprocessor), ("model", model)])
```

The **best model** is selected by highest **R²** on the test set.

---

## 6. Evaluation Metrics

For each model, the following are computed on the test set:

- **MAE** (Mean Absolute Error)
- **RMSE** (Root Mean Squared Error)
- **R²** (Coefficient of Determination)

Results are saved to `model_results.csv`.

---

## 7. School‑Level Analysis

If `School` labels are available, a per‑school summary is generated:

- Student count
- Average actual vs. predicted MPS
- Mean absolute error (MAE)
- Average bias (predicted − actual)
- Proficiency distribution (% in each level)

Output: `school_report.csv`

Proficiency bins:

| Level | MPS Range |
|-------|-----------|
| Not Proficient | 0–25 |
| Low Proficient | 25–50 |
| Nearly Proficient | 50–75 |
| Proficient | 75–90 |
| Highly Proficient | 90–100 |

---

## 8. Pass‑Probability Estimation

For any predicted MPS score, the probability of exceeding a threshold (default: 75) is estimated as:

\[ P(\text{MPS} \geq 75) = 1 - \Phi\left(\frac{75 - \hat{y}}{\hat{\sigma}_{res}}\right) \]

where:
- \(\hat{y}\) = predicted MPS
- \(\hat{\sigma}_{res}\) = residual standard deviation (test set)
- \(\Phi\) = standard normal CDF

This is reported for the first 3 test rows by default.

---

## 9. Collinearity Analysis

The pipeline performs **two independent** collinearity diagnostic tracks:

### 9.1 Numeric Features: Pearson Correlation + VIF

#### Correlation Heatmap
- **Type**: Pearson *r* (numeric only)
- **Mask**: Upper triangle
- **Annotation**: Values shown if ≤20 features
- **Highlight**: |*r*| ≥ 0.80 pairs flagged

Output: `correlation_heatmap_numeric.png`

#### VIF (Variance Inflation Factor)
- Computed per numeric feature
- Iterative removal on singular matrices
- Severity:
  - **VIF < 5**: OK
  - **5 ≤ VIF < 10**: Moderate
  - **VIF ≥ 10**: High

Output: `vif_chart_numeric.png`

### 9.2 Categorical Features: Cramér’s V

#### Pairwise Association Heatmap
- Cramér’s *V* between all categorical columns
- Bias‑corrected formula (Bergsma & Wicher, 2013)
- **Highlight**: *V* ≥ 0.50 (moderate‑to‑strong association)

Output: `cramers_v_heatmap_categorical.png`

#### Cramér’s V vs. MPS (Target Association)
- Bins MPS into proficiency levels (same bins as above)
- Computes Cramér’s *V* between each categorical feature and binned MPS
- Chi‑square significance testing (α = 0.05)
- Severity:
  - *V* < 0.30: Negligible
  - 0.30–0.50: Weak
  - 0.50–0.70: Moderate
  - ≥ 0.70: Strong

Output: `cramers_v_mps_chart_categorical.png`

---

## 10. Explainability

### 10.1 Feature Importance
- Tree models: `feature_importances_`
- Linear models: absolute `coef_`

### 10.2 SHAP Explainer
Fitted based on model type:

- **Tree models**: `shap.TreeExplainer`
- **Linear models**: `shap.LinearExplainer`
- **Others**: `shap.KernelExplainer` (background sample ≤ 50)

---

## 11. Artifact Persistence

All key objects are saved to `best_model.joblib`:

- Best model pipeline
- Residual standard deviation
- Feature names and importances
- SHAP explainer
- PCA object (if used)
- Collinearity matrices (Pearson, Cramér’s *V*)
- Test results and school report

This artifact enables downstream inference without retraining.

---

## 12. Output Files Summary

| File | Description |
|------|-------------|
| `best_model.joblib` | Full model artifact for inference |
| `model_results.csv` | Performance of all 5 models |
| `test_results.csv` | Per‑student predictions & errors |
| `school_report.csv` | Aggregated school‑level metrics |
| `analysis_report.txt` | Full text report (numeric + categorical) |
| `correlation_heatmap_numeric.png` | Pearson correlation matrix |
| `vif_chart_numeric.png` | VIF bar chart |
| `cramers_v_heatmap_categorical.png` | Categorical association matrix |
| `cramers_v_mps_chart_categorical.png` | Categorical → MPS association |

---

## 13. Usage Examples

### Default Run (with z‑score and PCA)
```bash
python pipeline.py --csv1 23-24.csv --csv2 24-25.csv --out ./outputs
```

### Defense Run (z‑score, no PCA)
```bash
python pipeline.py --csv1 23-24.csv --csv2 24-25.csv --out ./outputs --no-pca
```

### Custom Cohorts
```bash
python pipeline.py \
  --csv1 cohort_a.csv \
  --csv2 cohort_b.csv \
  --extra-csvs cohort_c.csv cohort_d.csv \
  --out ./multi_cohort --no-zscore
```

---

## 14. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Per‑cohort z‑scoring** | Removes systemic cohort effects (e.g., grading inflation) without using future data |
| **Strip `school_year` before training** | Ensures model works for new cohorts not seen during training |
| **Separate numeric/categorical collinearity** | Prevents spurious correlations from one‑hot encoded variables |
| **PCA on subject avgs** | Reduces multicollinearity and captures latent academic dimension |
| **Stratify by cohort** | Guarantees both splits represent all enrollment years |
| **Report both Pearson & Cramér’s V** | Provides full collinearity picture across variable types |

---

## 15. Interpretation Guidance

### High VIF / |*r*| ≥ 0.80
- Consider removing one of the correlated features.
- Alternatively, rely on PCA (already applied optionally) or regularization (Lasso).

### High Cramér’s V (≥ 0.70) between categorical features
- One feature may be redundant.
- Check domain logic (e.g., `Section` derived from `School`).

### High Cramér’s V with MPS
- Strong predictive signal.
- Validate with teachers/policymakers for actionable insights.

### Model Selection
- **R²** is primary.
- If similar R², prefer simpler models (Linear/Lasso) for interpretability.

---

## 16. Limitations & Future Work

- **Temporal trends**: No explicit modeling of year‑over‑year drift.
- **Missing data**: Median/mode imputation may bias estimates; consider MICE or deep imputation.
- **Non‑linear interactions**: Tree models capture them, but linear models may miss complex patterns.
- **External data**: Integration of socioeconomic indicators could improve accuracy.

---

**Document generated from**: `backend/data/final/pipeline.py`  
**Date**: 2026‑05‑03