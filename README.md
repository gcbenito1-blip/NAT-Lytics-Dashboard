# NAT-Lytics Dashboard

## Source Files (src/)

| File | Functionality |
|------|---------------|
| main.tsx | Application entry point - renders the React app with StrictMode |
| App.tsx | Root component with AuthProvider wrapper |
| index.css | Global styles and CSS imports |
| router.tsx | React Router v6 configuration with protected/public routes |
| config.ts | Environment configuration (API URL, production/dev helpers) |
| vite-env.d.ts | TypeScript declarations for Vite |

### Services
| File | Functionality |
|------|---------------|
| services/api.ts | API client with typed endpoints for predictions, uploads, and data analysis |

### Contexts
| File | Functionality |
|------|---------------|
| contexts/AuthContext.tsx | Firebase authentication context - manages user sign-in, sign-up, sign-out with Firestore profile storage |

### Layouts
| File | Functionality |
|------|---------------|
| layouts/AppLayout.tsx | Main application layout with sidebar navigation, responsive design, and view mode switching |
| layouts/layoutConfig.tsx | Menu configuration, role-based navigation items, and sample dataset settings |

### Pages
| File | Functionality |
|------|---------------|
| pages/Home.tsx | Role-based landing page with mode selection (Evaluation/Prediction) for researchers |
| pages/Login.tsx | User authentication login page |
| pages/Signup.tsx | User registration page |
| pages/Dashboard.tsx | Main upload interface with data analysis, charts, and prediction trigger |
| pages/ClassSummary.tsx | Displays class-level prediction results with student performance breakdown |
| pages/SchoolSummary.tsx | School-level aggregated prediction results for admins |
| pages/SectionComparison.tsx | Cross-section performance comparison views |
| pages/Results.tsx | Prediction table view with individual results |
| pages/Model_Evaluation.tsx | Model performance metrics and evaluation dashboard |
| pages/ModelReliability.tsx | Model reliability analysis and error visualization |
| pages/Charts.tsx | Data visualization charts for model analysis |
| pages/FeatureImportance.tsx | Feature importance visualization from trained model |
| pages/SchoolComparison.tsx | Cross-school performance comparison |
| pages/StudentTable.tsx | Detailed student-level prediction table |

### Components
| File | Functionality |
|------|---------------|
| components/ProtectedRoute.tsx | Route guard component requiring authentication |

### Utilities
| File | Functionality |
|------|---------------|
| utils/cn.ts | Tailwind CSS class name utility (clsx-style) |

---

## Backend API Endpoints (`backend/app.py`)

### Info Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| /health | GET | Returns model status, loaded state, and SHAP availability |
| /metrics | GET | Returns best model performance metrics (R2, MAE, RMSE) |
| /all-metrics | GET | Returns metrics for all trained models |
| /feature-importance | GET | Returns feature importance values from the model |
| /proficiency-labels | GET | Returns proficiency band definitions with codes, labels, ranges, colors |
| /model-predict | GET | Returns serialized prediction outputs (y_true, y_pred) for all models |

### Prediction Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| /explain | POST | Single prediction with SHAP explanation for uploaded data |
| /explain-batch | POST | Batch predictions with SHAP explanations, distribution summary |

### Data Upload/Analysis
| Endpoint | Method | Description |
|----------|--------|-------------|
| /api/upload | POST | Uploads CSV file, returns columns, row count, and preview data |
| /api/analyze | POST | Analyzes uploaded data - returns stats, correlations, missing values, proficiency distribution |

### Sample Dataset
| Endpoint | Method | Description |
|----------|--------|-------------|
| /api/sample-dataset/download | GET | Downloads sample CSV template (role/viewMode query params control Section column inclusion) |

### School-Level Analytics
| Endpoint | Method | Description |
|----------|--------|-------------|
| /api/school-metrics | GET | Returns school-level metrics (student count, avg MPS, bias, MAE) - optional model query param |
| /api/school-mae | GET | Returns schools ranked by Mean Absolute Error - optional model query param |
| /api/school-proficiency | GET | Returns proficiency band distribution (actual vs predicted) per school |

### Test Results
| Endpoint | Method | Description |
|----------|--------|-------------|
| /api/test-results | GET | Returns detailed test results per learner (actual/predicted MPS, pass probability) - optional model query param |

---

## Data Pipeline Flow (`backend/data/final/short_pipeline.py`)

`
STEP 1: Load CSVs (23-24.csv, 24-25.csv, optional extra CSVs)
|   -> Load year-level data, assign cohort rank (school_year)

STEP 1b: Duplicate Detection
|   -> Detect/remove within-cohort duplicates (keep first)
|   -> Detect/remove cross-cohort duplicates (keep earliest)

STEP 1c: Categorical Field Validation
|   -> Gender: normalize to M/F
|   -> Nutritional Status: validate against 5 allowed values
|   -> Invalid values set to NaN (imputed downstream)

STEP 2: Non-Fitting Preprocessing
|   -> Normalize dtypes (grades -> numeric)
|   -> Unify mother tongue labels
|   -> Aggregate quarterly grades -> subject averages
|      (Filipino_avg, English_avg, Math_avg, etc.)

STEP 3: Distribution Shift Test (diagnostic)
|   -> Compare subject averages across cohorts
|   -> Detect significant shifts (p < 0.05)

STEP 4: Combine & Stratified Split (split-first approach)
|   -> Combine cohorts
|   -> Train/Test split (30% test, stratified by cohort)
|   -> Align raw data splits for CSV exports

STEP 5: Within-Cohort Z-Score (TRAIN stats only)
|   -> Fit mean/std per cohort*column on TRAIN rows
|   -> Apply to both TRAIN and TEST (no leakage)

STEP 5b-5e: Save Training Data CSVs
|   -> train_data.csv - raw quarterly grades + OHE cats
|   -> train_data_aggregated.csv - subject avgs + OHE cats
|   -> train_complete.csv - all columns (quarterly + avgs + cats)

STEP 6: PCA on Subject Averages (optional, --no-pca to skip)
|   -> Fit PCA on TRAIN subject averages only
|   -> Replace with principal components

STEP 7: Build sklearn Preprocessor
|   -> Numeric: median imputation + StandardScaler
|   -> Categorical: most_frequent imputation + OneHotEncoder

STEP 8: Model Training
|   -> Linear, Lasso, DecisionTree, RandomForest, GradientBoost
|   -> Track MAE, RMSE, R2 for each model
|   -> Select best by R2

STEP 9: School-Level Analysis
|   -> Generate school_report.csv
|   -> Compute student count, avg MPS, bias, MAE per school
|   -> Proficiency distribution (actual vs predicted)

STEP 10: Explainability
|   -> Build SHAP explainer (Tree/Linear/Kernel based on model)
|   -> Compute feature importance

STEP 11: Save Artifact
|   -> best_model.joblib with all model, metrics, and metadata
`

**Key Outputs:**
- best_model.joblib - Trained model with preprocessor, SHAP explainer
- train_data.csv - Raw quarterly grades + encoded features (no scaling)
- test_data.csv - Raw test data (no encoding, no scaling)
- model_results.csv - MAE/RMSE/R2 per model
- test_results.csv - Per-student predictions with pass probability

---

## Tech Stack

- **Frontend**: React 18, TypeScript, React Router v6, Tailwind CSS, Recharts, Firebase Auth
- **Backend**: Flask, scikit-learn, pandas, numpy, SHAP
- **Deployment**: Vercel (frontend), compatible with any WSGI server

