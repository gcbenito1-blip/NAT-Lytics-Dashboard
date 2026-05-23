from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import numpy as np
import pandas as pd
from io import StringIO, BytesIO
from scipy.stats import norm
import os
import math
import warnings
import joblib

warnings.filterwarnings("ignore")

app = Flask(__name__)
CORS(app)

# ---------------------------------------------------------------------------
# CONSTANTS
# ---------------------------------------------------------------------------

SUBJECT_AGGREGATE_MAP = {
    "Filipino_avg": ["Filipino 1", "Filipino 2", "Filipino 3", "Filipino 4", "Filipino 5"],
    "English_avg":  ["English 1",  "English 2",  "English 3",  "English 4",  "English 5"],
    "Math_avg":     ["Math 1",     "Math 2",     "Math 3",     "Math 4",     "Math 5"],
    "AralPan_avg":  ["Aral Pan 1", "Aral Pan 2", "Aral Pan 3", "Aral Pan 4", "Aral Pan 5"],
    "Science_avg":  ["Science 3",  "Science 4",  "Science 5"],
}

SUBJECT_AVG_COLS = list(SUBJECT_AGGREGATE_MAP.keys())

MODEL_KEY_MAP = {
    "linear":           "Linear",
    "lasso":            "Lasso",
    "decisiontree":     "DecisionTree",
    "randomforest":     "RandomForest",
    "gradientboost":    "GradientBoosting",
    "gradientboosting": "GradientBoosting",
}

ARTIFACT_PATH = "best_model.joblib"

def serialize_outputs(data):
    if data is None:
        return None
    return {
        "y_true":     data["y_true"].tolist() if hasattr(data["y_true"], "tolist") else data["y_true"],
        "y_pred":     data["y_pred"].tolist() if hasattr(data["y_pred"], "tolist") else data["y_pred"],
        "y_true_cat": (data.get("y_true_cat").tolist()
                       if data.get("y_true_cat") is not None and hasattr(data.get("y_true_cat"), "tolist")
                       else data.get("y_true_cat")),
        "y_pred_cat": (data.get("y_pred_cat").tolist()
                       if data.get("y_pred_cat") is not None and hasattr(data.get("y_pred_cat"), "tolist")
                       else data.get("y_pred_cat")),
    }


def _fallback_bands():
    return [
        (90, float("inf"), 4, "Highly Proficient",  "90–100", "#22c55e"),
        (75, 90,           3, "Proficient",          "75–89",  "#84cc16"),
        (50, 75,           2, "Nearly Proficient",   "50–74",  "#f59e0b"),
        (25, 50,           1, "Low Proficient",      "25–49",  "#f97316"),
        ( 0, 25,           0, "Not Proficient",      "0–24",   "#ef4444"),
    ]


# ---------------------------------------------------------------------------
# LOAD ARTIFACT
# ---------------------------------------------------------------------------

try:
    try:
        import shap as _shap
        artifact = joblib.load(ARTIFACT_PATH)
    except ImportError:
        import pickle

        class _ShapStub(pickle.Unpickler):
            def find_class(self, module, name):
                if module.startswith("shap"):
                    return type(f"_Shap_{name}", (), {})
                return super().find_class(module, name)

        with open(ARTIFACT_PATH, "rb") as f:
            artifact = _ShapStub(f).load()

    if not isinstance(artifact, dict):
        raise ValueError("Artifact is not a dict — retrain with the updated pipeline.")

    model                = artifact["model"]
    model_name           = artifact.get("model_name", "Unknown")
    residual_std         = artifact.get("residual_std")
    metrics              = artifact.get("metrics", [])
    features             = artifact.get("features", [])
    transformed_features = artifact.get("transformed_features", [])
    feature_importance   = artifact.get("feature_importance", {})
    shap_explainer       = artifact.get("shap_explainer")
    per_model_outputs    = artifact.get("per_model_outputs", {})
    school_report_df     = artifact.get("school_report")
    test_results_df      = artifact.get("test_results")
    school_test          = artifact.get("school_test")
    learner_test         = artifact.get("learner_test")
    y_test               = artifact.get("y_test")
    zscore_params        = artifact.get("zscore_params", {})
    zscore_applied       = artifact.get("zscore_applied", False)

    PROFICIENCY_BANDS  = artifact.get("proficiency_bands") or _fallback_bands()
    PROFICIENCY_LABELS = artifact.get("proficiency_labels") or {b[2]: b[3] for b in PROFICIENCY_BANDS}
    PROFICIENCY_RANGES = artifact.get("proficiency_ranges") or {b[2]: b[4] for b in PROFICIENCY_BANDS}
    PROFICIENCY_COLORS = artifact.get("proficiency_colors") or {b[2]: b[5] for b in PROFICIENCY_BANDS}

    print(f"[OK] Model loaded: {model_name}")
    print(f"[OK] Z-score applied during training: {zscore_applied}")
    if zscore_applied and zscore_params:
        print(f"[OK] Z-score params loaded: {len(zscore_params)} cohort-column entries")
    if school_report_df is not None:
        print(f"[OK] School report available: {len(school_report_df)} schools")
    if test_results_df is not None:
        if "Pass_Probability" not in test_results_df.columns:
            test_results_df["Pass_Probability"] = test_results_df["Predicted_MPS"].apply(
                lambda s: get_pass_probability(s, residual_std)
            )

except Exception as e:
    print(f"[WARN] Could not load artifact: {e} — running in degraded mode")
    model = shap_explainer = residual_std = None
    model_name           = "Unavailable"
    metrics              = []
    features             = []
    transformed_features = []
    feature_importance   = {}
    per_model_outputs    = {}
    school_report_df     = None
    test_results_df      = None
    school_test          = None
    learner_test         = None
    y_test               = None
    zscore_params        = {}
    zscore_applied       = False
    PROFICIENCY_BANDS    = _fallback_bands()
    PROFICIENCY_LABELS   = {b[2]: b[3] for b in PROFICIENCY_BANDS}
    PROFICIENCY_RANGES   = {b[2]: b[4] for b in PROFICIENCY_BANDS}
    PROFICIENCY_COLORS   = {b[2]: b[5] for b in PROFICIENCY_BANDS}


# ---------------------------------------------------------------------------
# GUARDS
# ---------------------------------------------------------------------------

def _require_model():
    if model is None:
        return jsonify({"error": "Model not loaded. Ensure best_model.joblib exists."}), 503
    return None


def _require_shap():
    if shap_explainer is None:
        return jsonify({"error": "SHAP explainer not available in this artifact."}), 503
    return None


# ---------------------------------------------------------------------------
# INFERENCE HELPERS
# ---------------------------------------------------------------------------

def _build_df(data, feature_list):
    """
    Build a DataFrame ready for model inference:
      1. Aggregate quarterly subject cols → subject avg cols (matches pipeline).
      2. Apply z-score normalisation using train-derived params.
      3. Select only the features the model expects.
    """
    rows = data if isinstance(data, list) else [data]
    df = pd.DataFrame(rows)

    # Step 1: aggregate quarterly grades → subject averages
    for new_col, src_cols in SUBJECT_AGGREGATE_MAP.items():
        present = [c for c in src_cols if c in df.columns]
        if present:
            df[new_col] = df[present].apply(pd.to_numeric, errors="coerce").mean(axis=1)

    # Step 2: z-score using training params (fall back to mean across cohorts)
    if zscore_applied and zscore_params:
        for col in SUBJECT_AVG_COLS:
            if col not in df.columns:
                continue
            all_means = [p["mean"] for k, p in zscore_params.items() if k[1] == col]
            all_stds  = [p["std"]  for k, p in zscore_params.items() if k[1] == col]
            if not all_means:
                continue
            mu = float(np.mean(all_means))
            sd = max(float(np.mean(all_stds)), 1e-9)
            df[col] = (pd.to_numeric(df[col], errors="coerce") - mu) / sd

    # Step 3: keep only model features
    if feature_list:
        model_features = [f for f in feature_list if f not in ("learnerID", "School", "Section")]
        return pd.DataFrame([{k: row.get(k) for k in model_features} for row in df.to_dict("records")])

    return df.drop(columns=["learnerID", "School", "Section"], errors="ignore")


# ---------------------------------------------------------------------------
# PROFICIENCY HELPERS
# ---------------------------------------------------------------------------

def encode_proficiency(score):
    for lower, upper, code, *_ in PROFICIENCY_BANDS:
        if score >= lower and (upper == float("inf") or score < upper):
            return code
    return 0


def get_proficiency_meta(score):
    code = encode_proficiency(score)
    return {
        "code":  code,
        "label": PROFICIENCY_LABELS[code],
        "range": PROFICIENCY_RANGES[code],
        "color": PROFICIENCY_COLORS[code],
    }


def get_proficiency_probabilities(pred_score, std):
    """P(a <= Y < b) per band via normal CDF. Values sum to ~1.0."""
    out = []
    for lower, upper, code, label, rng, color in PROFICIENCY_BANDS:
        p_upper = norm.cdf(upper, loc=pred_score, scale=std) if upper != float("inf") else 1.0
        p_lower = norm.cdf(lower, loc=pred_score, scale=std)
        out.append({
            "code":        code,
            "label":       label,
            "range":       rng,
            "color":       color,
            "probability": round(float(p_upper - p_lower), 4),
        })
    return out


def get_pass_probability(pred_score, std, threshold=75):
    """P(Y >= threshold) using normal CDF."""
    if std is None:
        return None
    return round(float(1.0 - norm.cdf(threshold, loc=pred_score, scale=std)), 4)


def _prediction_payload(pred, row_data):
    """Core prediction block shared by all prediction routes."""
    prof      = get_proficiency_meta(pred)
    breakdown = get_proficiency_probabilities(pred, residual_std) if residual_std else None
    top_band  = max(breakdown, key=lambda b: b["probability"]) if breakdown else None
    pass_prob = get_pass_probability(pred, residual_std) if residual_std else None
    return {
        "learnerID":             row_data.get("learnerID"),
        "School":                row_data.get("School"),
        "Section":               row_data.get("Section"),
        "prediction":            round(float(pred), 4),
        "proficiency":           prof,
        "top_probable_band":     top_band,
        "probability_breakdown": breakdown,
        "pass_probability":      pass_prob,
    }


# ---------------------------------------------------------------------------
# SHAP HELPER
# ---------------------------------------------------------------------------

def get_shap_explanation(row_df):
    """
    Per-feature SHAP values for a single preprocessed row.
    Positive = pushed score UP, negative = pushed score DOWN.
    base_value + sum(shap_values) == predicted score exactly.
    """
    X_transformed = model.named_steps["prep"].transform(row_df)
    shap_values   = shap_explainer.shap_values(X_transformed)
    values        = shap_values[0] if hasattr(shap_values[0], "__len__") else shap_values

    named = [
        {
            "feature":    transformed_features[i] if i < len(transformed_features) else f"feature_{i}",
            "shap_value": round(float(values[i]), 4),
            "direction":  "positive" if values[i] >= 0 else "negative",
        }
        for i in range(len(values))
    ]
    named.sort(key=lambda x: abs(x["shap_value"]), reverse=True)

    expected = shap_explainer.expected_value
    return {
        "base_value":  round(float(expected[0] if hasattr(expected, "__len__") else expected), 4),
        "top_drivers": named[:5],
        "features":    named,
    }


# ---------------------------------------------------------------------------
# REPORT GENERATORS
# ---------------------------------------------------------------------------

def generate_school_report(y_true_arr, y_pred_arr, school_arr):
    df = pd.DataFrame({
        "School":        school_arr,
        "Actual_MPS":    y_true_arr,
        "Predicted_MPS": y_pred_arr,
        "Difference":    np.array(y_pred_arr) - np.array(y_true_arr),
    })

    band_labels = [b[3] for b in PROFICIENCY_BANDS]

    def get_band(mps):
        for lower, upper, code, *_ in PROFICIENCY_BANDS:
            if mps >= lower and (upper == float("inf") or mps < upper):
                return code
        return 0

    rows = []
    for school, grp in df.groupby("School"):
        n = len(grp)
        actual_counts = grp["Actual_MPS"].apply(get_band).value_counts()
        pred_counts   = grp["Predicted_MPS"].apply(get_band).value_counts()

        row = {
            "School":            school,
            "Student_Count":     int(n),
            "Avg_Actual_MPS":    float(grp["Actual_MPS"].mean()),
            "Avg_Predicted_MPS": float(grp["Predicted_MPS"].mean()),
            "Avg_Bias":          float(grp["Difference"].mean()),
            "MAE":               float(grp["Difference"].abs().mean()),
        }
        for band in band_labels:
            row[f"Actual_{band}"] = round(actual_counts.get(band, 0) / n * 100, 2) if n else 0.0
            row[f"Pred_{band}"]   = round(pred_counts.get(band, 0)   / n * 100, 2) if n else 0.0
        rows.append(row)

    return pd.DataFrame(rows).sort_values("School").reset_index(drop=True)


def generate_test_results(y_true_arr, y_pred_arr, school_arr, learner_arr):
    y_true = np.array(y_true_arr)
    y_pred = np.array(y_pred_arr)
    df = pd.DataFrame({
        "learnerID":       learner_arr,
        "School":          school_arr,
        "Actual_MPS":      y_true,
        "Predicted_MPS":   y_pred,
        "Difference":      y_pred - y_true,
        "Error_Magnitude": np.abs(y_true - y_pred),
    })
    df["Actual_Proficiency"]    = df["Actual_MPS"].apply(
        lambda s: PROFICIENCY_LABELS.get(encode_proficiency(s), "Unknown"))
    df["Predicted_Proficiency"] = df["Predicted_MPS"].apply(
        lambda s: PROFICIENCY_LABELS.get(encode_proficiency(s), "Unknown"))
    df["Pass_Probability"] = df["Predicted_MPS"].apply(
        lambda s: get_pass_probability(s, residual_std))
    return (
        df[["learnerID", "School", "Actual_MPS", "Predicted_MPS",
            "Difference", "Actual_Proficiency", "Predicted_Proficiency",
            "Pass_Probability", "Error_Magnitude"]]
        .sort_values(["School", "learnerID"])
        .reset_index(drop=True)
    )


# ---------------------------------------------------------------------------
# ROUTES — INFO
# ---------------------------------------------------------------------------

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status":       "ok" if model is not None else "degraded",
        "model":        model_name,
        "model_loaded": model is not None,
        "shap_ready":   shap_explainer is not None,
    })


@app.route("/model-predict", methods=["GET"])
def model_predict():
    return jsonify({
        "linear":        serialize_outputs(per_model_outputs.get("Linear")),
        "lasso":         serialize_outputs(per_model_outputs.get("Lasso")),
        "decisionTree":  serialize_outputs(per_model_outputs.get("DecisionTree")),
        "randomForest":  serialize_outputs(per_model_outputs.get("RandomForest")),
        "gradientBoost": serialize_outputs(per_model_outputs.get("GradientBoosting")),
    })


@app.route("/proficiency-labels", methods=["GET"])
def proficiency_labels_route():
    return jsonify({
        "bands": [
            {"code": b[2], "label": b[3], "range": b[4], "color": b[5]}
            for b in PROFICIENCY_BANDS
        ]
    })


@app.route("/metrics", methods=["GET"])
def get_metrics():
    if isinstance(metrics, list) and metrics:
        return jsonify(max(metrics, key=lambda m: m.get("R2", -float("inf"))))
    return jsonify(metrics)


@app.route("/all-metrics", methods=["GET"])
def get_all_metrics():
    return jsonify({"models": metrics})


@app.route("/feature-importance", methods=["GET"])
def get_fi():
    return jsonify(feature_importance)


# ---------------------------------------------------------------------------
# ROUTES — EXPLAIN
# ---------------------------------------------------------------------------

@app.route("/explain", methods=["POST"])
def explain():
    err = _require_model() or _require_shap()
    if err:
        return err

    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Empty input"}), 400

        df      = _build_df(data, features)
        pred    = float(model.predict(df)[0])
        payload = _prediction_payload(pred, data)
        payload["explanation"] = get_shap_explanation(df)
        return jsonify(payload)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/explain-batch", methods=["POST"])
def explain_batch():
    err = _require_model() or _require_shap()
    if err:
        return err

    try:
        data = request.get_json()
        if not isinstance(data, list):
            return jsonify({"error": "Expected a JSON array"}), 400

        df    = _build_df(data, features)
        preds = model.predict(df)

        results       = []
        label_summary = {v: 0 for v in PROFICIENCY_LABELS.values()}

        for i, pred in enumerate(preds):
            payload = _prediction_payload(pred, data[i])
            payload["explanation"] = get_shap_explanation(df.iloc[[i]])
            label_summary[payload["proficiency"]["label"]] += 1
            results.append(payload)

        total = len(results)
        distribution = [
            {
                "code":       b[2],
                "label":      b[3],
                "range":      b[4],
                "color":      b[5],
                "count":      label_summary[b[3]],
                "percentage": round(label_summary[b[3]] / total * 100, 2),
            }
            for b in PROFICIENCY_BANDS
        ]
        return jsonify({"results": results, "total": total, "distribution": distribution})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# ROUTES — UPLOAD / ANALYZE
# ---------------------------------------------------------------------------

@app.route("/api/upload", methods=["POST"])
def upload_file():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "No file selected"}), 400

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in (".csv", ".xlsx"):
        return jsonify({"error": "Only CSV or Excel files are allowed"}, ), 400
    try:
        if ext == ".csv":
            df = pd.read_csv(StringIO(file.read().decode("utf-8")))
        else:
            df = pd.read_excel(BytesIO(file.read()))


        return jsonify({
            "columns":   df.columns.tolist(),
            "row_count": len(df),
            "preview":   df.to_dict(orient="records"),
        })

    except Exception as e:
        return jsonify({"error": f"Failed to parse file: {e}"}), 400


@app.route("/api/analyze", methods=["POST"])
def analyze_data():
    try:
        records = (request.json or {}).get("data", [])
        if not records:
            return jsonify({"error": "No records provided"}), 400

        df           = pd.DataFrame(records)
        row_count    = len(df)
        column_count = len(df.columns)

        # Proficiency distribution (only when target column is present)
        proficiency_distribution = None
        if "MPS" in df.columns and pd.api.types.is_numeric_dtype(df["MPS"]):
            label_counts = {v: 0 for v in PROFICIENCY_LABELS.values()}
            for score in df["MPS"].dropna():
                label_counts[PROFICIENCY_LABELS[encode_proficiency(score)]] += 1

            valid_total = int(df["MPS"].notna().sum())
            proficiency_distribution = [
                {
                    "code":       b[2],
                    "label":      b[3],
                    "range":      b[4],
                    "color":      b[5],
                    "count":      label_counts[b[3]],
                    "percentage": round(label_counts[b[3]] / valid_total * 100, 2) if valid_total else 0,
                }
                for b in PROFICIENCY_BANDS
            ]

        # Per-column stats
        columns_info = []
        for col in df.columns:
            info = {
                "name":            col,
                "dtype":           str(df[col].dtype),
                "non_null_count":  int(df[col].count()),
                "null_count":      int(df[col].isnull().sum()),
                "null_percentage": round(float(df[col].isnull().mean() * 100), 2),
            }
            if col.lower() == "learnerid":
                info["unique_count"]    = int(df[col].nunique())
                info["duplicate_count"] = len(df) - int(df[col].nunique())
                info["is_id_column"]    = True
            elif pd.api.types.is_numeric_dtype(df[col]) and df[col].notna().any():
                stats = {}
                for stat in ("mean", "std", "min", "max", "median"):
                    val = getattr(df[col], stat)()
                    stats[stat] = round(float(val), 4) if not pd.isna(val) else None
                for q, label in ((0.25, "q25"), (0.75, "q75")):
                    val = df[col].quantile(q)
                    stats[label] = round(float(val), 4) if not pd.isna(val) else None
                info["statistics"] = stats
            else:
                vc = df[col].value_counts().head(10)
                info["value_counts"] = {str(k): int(v) for k, v in vc.items()}
                info["unique_count"] = int(df[col].nunique())
            columns_info.append(info)

        # Correlation matrix
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        correlation_matrix = {}
        if len(numeric_cols) > 1:
            corr_df = df[numeric_cols].corr()
            for c in numeric_cols:
                correlation_matrix[c] = {
                    k: (float(v) if not pd.isna(v) else None)
                    for k, v in corr_df[c].to_dict().items()
                }

        # Missing value summary
        total_cells = row_count * column_count
        missing_values = {
            "total_missing":        int(df.isnull().sum().sum()),
            "total_cells":          total_cells,
            "missing_percentage":   round(float(df.isnull().sum().sum() / total_cells * 100), 2) if total_cells else 0,
            "columns_with_missing": [
                {"column": col, "missing_count": int(df[col].isnull().sum())}
                for col in df.columns if df[col].isnull().any()
            ],
        }

        return jsonify({
            "row_count":                row_count,
            "column_count":             column_count,
            "columns":                  columns_info,
            "preview":                  df.to_dict(orient="records"),
            "correlation_matrix":       correlation_matrix,
            "missing_values":           missing_values,
            "proficiency_distribution": proficiency_distribution,
        })

    except Exception as e:
        return jsonify({"error": f"Analysis failed: {e}"}), 500


# ---------------------------------------------------------------------------
# ROUTES — SAMPLE DATASET
# ---------------------------------------------------------------------------

@app.route("/api/sample-dataset/download", methods=["GET"])
def download_sample_dataset():
    role      = request.args.get("role")
    view_mode = request.args.get("viewMode")

    include_section = (role == "teacher") or (role == "researcher" and view_mode == "teacher")

    base_row = {
        "learnerID": "L001",
        "Gender": "M",
        "Age": 11,
        "Mother Tongue": "Tagalog",
        "Nutritional Status": "Normal",
        "Filipino 1": 90, "English 1": 90, "Math 1": 87, "Aral Pan 1": 91,
        "Filipino 2": 92, "English 2": 90, "Math 2": 90, "Aral Pan 2": 91,
        "Filipino 3": 92, "English 3": 92, "Math 3": 94, "Science 3": 93, "Aral Pan 3": 93,
        "Filipino 4": 91, "English 4": 93, "Math 4": 91, "Science 4": 92, "Aral Pan 4": 91,
        "Filipino 5": 91, "English 5": 92, "Math 5": 88, "Science 5": 93, "Aral Pan 5": 91,
    }

    if include_section:
        base_row = {"Section": "A", **base_row}

    csv_content = pd.DataFrame([base_row]).to_csv(index=False)
    return Response(
        csv_content,
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=sample_dataset.csv"},
    )


# ---------------------------------------------------------------------------
# ROUTES — SCHOOL-LEVEL ANALYTICS
# ---------------------------------------------------------------------------

@app.route("/api/school-metrics", methods=["GET"])
def get_school_metrics():
    model_key = request.args.get("model", "").lower()

    if not model_key:
        if school_report_df is None:
            return jsonify({"error": "School report not available. Retrain the model."}), 404
        data = school_report_df.sort_values("School").to_dict(orient="records")
        return jsonify({"schools": data, "count": len(data)})

    mapped = MODEL_KEY_MAP.get(model_key)
    if not mapped or mapped not in (per_model_outputs or {}):
        return jsonify({"error": f"Model '{model_key}' not found in per_model_outputs."}), 404
    if school_test is None or y_test is None:
        return jsonify({"error": "Test metadata not available in artifact."}), 404

    school_df = generate_school_report(y_test, per_model_outputs[mapped]["y_pred"], school_test)
    data = school_df.sort_values("School").to_dict(orient="records")
    return jsonify({"schools": data, "count": len(data), "model": mapped})


@app.route("/api/school-proficiency", methods=["GET"])
def get_school_proficiency():
    if school_report_df is None:
        return jsonify({"error": "School report not available. Retrain the model."}), 404

    bands  = [b[3] for b in PROFICIENCY_BANDS]
    result = [
        {
            "School":    row["School"],
            "Actual":    {band: row.get(f"Actual_{band}", 0) for band in bands},
            "Predicted": {band: row.get(f"Pred_{band}", 0)   for band in bands},
        }
        for _, row in school_report_df.sort_values("School").iterrows()
    ]
    return jsonify({
        "schools":           result,
        "count":             len(result),
        "proficiency_bands": bands,
    })


@app.route("/api/school-mae", methods=["GET"])
def get_school_mae():
    model_key = request.args.get("model", "").lower()

    def _format_mae_rows(df):
        return [
            {
                "School":            row["School"],
                "MAE":               float(row["MAE"]),
                "Student_Count":     int(row["Student_Count"]),
                "Avg_Actual_MPS":    float(row["Avg_Actual_MPS"]),
                "Avg_Predicted_MPS": float(row["Avg_Predicted_MPS"]),
            }
            for _, row in df.sort_values("MAE", ascending=False).iterrows()
        ]

    if not model_key:
        if school_report_df is None:
            return jsonify({"error": "School report not available. Retrain the model."}), 404
        data = _format_mae_rows(school_report_df)
        return jsonify({"schools": data, "count": len(data)})

    mapped = MODEL_KEY_MAP.get(model_key)
    if not mapped or mapped not in (per_model_outputs or {}):
        return jsonify({"error": f"Model '{model_key}' not found."}), 404
    if school_test is None or y_test is None:
        return jsonify({"error": "Test metadata not available in artifact."}), 404

    school_df = generate_school_report(y_test, per_model_outputs[mapped]["y_pred"], school_test)
    data = _format_mae_rows(school_df)
    return jsonify({"schools": data, "count": len(data), "model": mapped})


@app.route("/api/test-results", methods=["GET"])
def get_test_results():
    model_key = request.args.get("model", "").lower()

    RESULT_COLS = [
        "learnerID", "School", "Actual_MPS", "Predicted_MPS",
        "Difference", "Actual_Proficiency", "Predicted_Proficiency",
        "Pass_Probability", "Error_Magnitude",
    ]

    if not model_key:
        if test_results_df is None:
            return jsonify({"error": "Test results not available. Retrain the model with the updated pipeline."}), 404
        data = test_results_df.sort_values(["School", "learnerID"]).to_dict(orient="records")
        return jsonify({"results": data, "count": len(data), "columns": RESULT_COLS})

    mapped = MODEL_KEY_MAP.get(model_key)
    if not mapped or mapped not in (per_model_outputs or {}):
        return jsonify({"error": f"Model '{model_key}' not found."}), 404
    if school_test is None or learner_test is None or y_test is None:
        return jsonify({"error": "Test metadata not available in artifact."}), 404

    result_df = generate_test_results(y_test, per_model_outputs[mapped]["y_pred"], school_test, learner_test)
    data = result_df.sort_values(["School", "learnerID"]).to_dict(orient="records")
    return jsonify({"results": data, "count": len(data), "columns": RESULT_COLS, "model": mapped})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)