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
import sys

# Try to import shap, but don't fail if not available
try:
    import shap as _shap
    SHAP_AVAILABLE = True
except ImportError:
    SHAP_AVAILABLE = False
    print("[WARN] SHAP not available - install with: pip install shap")

warnings.filterwarnings('ignore')

app = Flask(__name__)
if os.environ.get('FLASK_ENV') == 'development':
    CORS(app)

# ===========================================================================
# INITIALIZE VARIABLES
# ===========================================================================
model = None
model_name = "Unknown"
residual_std = None
metrics = []
features = []
transformed_features = []
feature_importance = {}
shap_explainer = None
per_model_outputs = {}
school_report_df = None
test_results_df = None
school_test = None
learner_test = None
y_test = None
zscore_params = {}
zscore_applied = False
PROFICIENCY_BANDS = []
PROFICIENCY_LABELS = {}
PROFICIENCY_RANGES = {}
PROFICIENCY_COLORS = {}

def _fallback_bands():
    return [
        (90, float('inf'), 4, "Highly Proficient",  "90–100", "#22c55e"),
        (75, 90,           3, "Proficient",          "75–89",  "#84cc16"),
        (50, 75,           2, "Nearly Proficient",   "50–74",  "#f59e0b"),
        (25, 50,           1, "Low Proficient",      "25–49",  "#f97316"),
        (0,  25,           0, "Not Proficient",      "0–24",   "#ef4444"),
    ]

# Set fallback proficiency bands immediately
PROFICIENCY_BANDS = _fallback_bands()
PROFICIENCY_LABELS = {b[2]: b[3] for b in PROFICIENCY_BANDS}
PROFICIENCY_RANGES = {b[2]: b[4] for b in PROFICIENCY_BANDS}
PROFICIENCY_COLORS = {b[2]: b[5] for b in PROFICIENCY_BANDS}

# Subject aggregation map (must match pipeline)
SUBJECT_AGGREGATE_MAP = {
    "Filipino_avg": ["Filipino 1", "Filipino 2", "Filipino 3", "Filipino 4", "Filipino 5"],
    "English_avg":  ["English 1",  "English 2",  "English 3",  "English 4",  "English 5"],
    "Math_avg":     ["Math 1",     "Math 2",     "Math 3",     "Math 4",     "Math 5"],
    "AralPan_avg":  ["Aral Pan 1", "Aral Pan 2", "Aral Pan 3", "Aral Pan 4", "Aral Pan 5"],
    "Science_avg":  ["Science 3",  "Science 4",  "Science 5"],
}

SUBJECT_AVG_COLS = list(SUBJECT_AGGREGATE_MAP.keys())

# ===========================================================================
# DEBUGGING: GET FILE PATHS
# ===========================================================================
def find_model_file():
    """Search for best_model.joblib in common locations"""
    possible_paths = [
        "best_model.joblib",
        "./best_model.joblib",
        "../best_model.joblib",
        os.path.join(os.path.dirname(__file__), "best_model.joblib"),
        os.path.join(os.getcwd(), "best_model.joblib"),
    ]
    
    for path in possible_paths:
        if os.path.exists(path):
            return os.path.abspath(path)
    return None

# ===========================================================================
# LOAD ARTIFACT
# ===========================================================================
def load_model():
    global model, model_name, residual_std, metrics, features, transformed_features
    global feature_importance, shap_explainer, per_model_outputs, school_report_df
    global test_results_df, school_test, learner_test, y_test, zscore_params
    global zscore_applied, PROFICIENCY_BANDS, PROFICIENCY_LABELS, PROFICIENCY_RANGES, PROFICIENCY_COLORS
    
    model_path = find_model_file()
    
    if model_path is None:
        print(f"[ERROR] Could not find best_model.joblib")
        print(f"Current working directory: {os.getcwd()}")
        print(f"Files in current directory: {os.listdir('.')}")
        return False
    
    print(f"[INFO] Loading model from: {model_path}")
    
    try:
        artifact = joblib.load(model_path)
        print(f"[INFO] Artifact loaded successfully. Type: {type(artifact)}")
        
        if not isinstance(artifact, dict):
            print(f"[ERROR] Artifact is not a dict, it's: {type(artifact)}")
            return False
        
        # Load all components
        model = artifact.get("model")
        model_name = artifact.get("model_name", "Unknown")
        residual_std = artifact.get("residual_std")
        metrics = artifact.get("metrics", [])
        features = artifact.get("features", [])
        transformed_features = artifact.get("transformed_features", [])
        feature_importance = artifact.get("feature_importance", {})
        shap_explainer = artifact.get("shap_explainer")
        per_model_outputs = artifact.get("per_model_outputs", {})
        school_report_df = artifact.get("school_report")
        test_results_df = artifact.get("test_results")
        school_test = artifact.get("school_test")
        learner_test = artifact.get("learner_test")
        y_test = artifact.get("y_test")
        zscore_params = artifact.get("zscore_params", {})
        zscore_applied = artifact.get("zscore_applied", False)
        
        # Load proficiency bands if present, otherwise keep fallback
        if artifact.get("proficiency_bands"):
            PROFICIENCY_BANDS = artifact.get("proficiency_bands")
            PROFICIENCY_LABELS = artifact.get("proficiency_labels") or {b[2]: b[3] for b in PROFICIENCY_BANDS}
            PROFICIENCY_RANGES = artifact.get("proficiency_ranges") or {b[2]: b[4] for b in PROFICIENCY_BANDS}
            PROFICIENCY_COLORS = artifact.get("proficiency_colors") or {b[2]: b[5] for b in PROFICIENCY_BANDS}
        
        # Add pass probability if missing and residual_std available
        if test_results_df is not None and "Pass_Probability" not in test_results_df.columns and residual_std is not None:
            test_results_df["Pass_Probability"] = test_results_df["Predicted_MPS"].apply(
                lambda s: get_pass_probability(s, residual_std))
        
        print(f"[SUCCESS] Model loaded: {model_name}")
        print(f"[SUCCESS] Model type: {type(model)}")
        print(f"[SUCCESS] Features: {len(features)}")
        print(f"[SUCCESS] Z-score applied: {zscore_applied}")
        if school_report_df is not None:
            print(f"[SUCCESS] School report available: {len(school_report_df)} schools")
        
        return True
        
    except Exception as e:
        print(f"[ERROR] Failed to load model: {e}")
        import traceback
        traceback.print_exc()
        return False

# Load the model when the app starts
MODEL_LOADED = load_model()

# ===========================================================================
# HELPER FUNCTIONS
# ===========================================================================
def serialize_outputs(data):
    if data is None:
        return None
    return {
        "y_true": data["y_true"].tolist() if hasattr(data["y_true"], 'tolist') else list(data["y_true"]),
        "y_pred": data["y_pred"].tolist() if hasattr(data["y_pred"], 'tolist') else list(data["y_pred"]),
        "y_true_cat": data.get("y_true_cat").tolist() if data.get("y_true_cat") is not None and hasattr(data.get("y_true_cat"), 'tolist') else data.get("y_true_cat"),
        "y_pred_cat": data.get("y_pred_cat").tolist() if data.get("y_pred_cat") is not None and hasattr(data.get("y_pred_cat"), 'tolist') else data.get("y_pred_cat"),
    }

def _require_model():
    if model is None:
        return jsonify({"error": "Model not loaded. Please check server logs for details."}), 503
    return None

def _require_shap():
    if not SHAP_AVAILABLE:
        return jsonify({"error": "SHAP library not installed. Install with: pip install shap"}), 503
    if shap_explainer is None:
        return jsonify({"error": "SHAP explainer not available in this artifact."}), 503
    return None

def encode_proficiency(score):
    if not PROFICIENCY_BANDS:
        return 0
    for lower, upper, code, *_ in PROFICIENCY_BANDS:
        if score >= lower and (upper == float('inf') or score < upper):
            return code
    return 0

def get_proficiency_meta(score):
    code = encode_proficiency(score)
    return {
        "code":  code,
        "label": PROFICIENCY_LABELS.get(code, "Unknown"),
        "range": PROFICIENCY_RANGES.get(code, "Unknown"),
        "color": PROFICIENCY_COLORS.get(code, "#000000"),
    }

def get_proficiency_probabilities(pred_score, std):
    """P(a <= Y < b) per band via normal CDF. Values sum to 1.0."""
    if not PROFICIENCY_BANDS or std is None:
        return None
    
    out = []
    for lower, upper, code, label, rng, color in PROFICIENCY_BANDS:
        p_upper = norm.cdf(upper, loc=pred_score, scale=std) if upper != float('inf') else 1.0
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

def _prediction_payload(p, row_data):
    """Core prediction block shared by all routes."""
    prof      = get_proficiency_meta(p)
    breakdown = get_proficiency_probabilities(p, residual_std) if residual_std else None
    top_band  = max(breakdown, key=lambda b: b["probability"]) if breakdown else None
    pass_prob = get_pass_probability(p, residual_std) if residual_std else None
    return {
        "learnerID":             row_data.get("learnerID"),
        "School":                row_data.get("School"),
        "Section":               row_data.get("Section"),
        "prediction":            round(float(p), 4),
        "proficiency":           prof,
        "top_probable_band":     top_band,
        "probability_breakdown": breakdown,
        "pass_probability":      pass_prob,
    }

def _build_df(data, feature_list):
    """Build a DataFrame ready for model inference"""
    rows = data if isinstance(data, list) else [data]
    df = pd.DataFrame(rows)

    # Step 1: aggregate quarterly → subject avgs
    for new_col, src_cols in SUBJECT_AGGREGATE_MAP.items():
        present = [c for c in src_cols if c in df.columns]
        if present:
            df[new_col] = df[present].apply(pd.to_numeric, errors="coerce").mean(axis=1)

    # Step 2: apply z-score with train params
    if zscore_applied and zscore_params:
        for col in SUBJECT_AVG_COLS:
            if col not in df.columns:
                continue
            all_means = [p["mean"] for k, p in zscore_params.items() if k[1] == col]
            all_stds  = [p["std"]  for k, p in zscore_params.items() if k[1] == col]
            if not all_means:
                continue
            mu = float(np.mean(all_means))
            sd = float(np.mean(all_stds)) if float(np.mean(all_stds)) > 0 else 1.0
            df[col] = (pd.to_numeric(df[col], errors="coerce") - mu) / sd

    # Step 3: select only model features
    if feature_list:
        model_features = [f for f in feature_list if f not in ("learnerID", "School", "Section")]
        for feat in model_features:
            if feat not in df.columns:
                df[feat] = np.nan
        return df[model_features]

    return df.drop(columns=["learnerID", "School", "Section"], errors="ignore")

def get_shap_explanation(row_df):
    """Per-feature SHAP values for a single preprocessed row."""
    if shap_explainer is None or not SHAP_AVAILABLE:
        return {"error": "SHAP explainer not available"}
    
    try:
        # Check if model has preprocessing steps
        if hasattr(model, 'named_steps') and 'prep' in model.named_steps:
            prep = model.named_steps['prep']
            X_transformed = prep.transform(row_df)
        else:
            X_transformed = row_df.values
        
        shap_values = shap_explainer.shap_values(X_transformed)
        values = shap_values[0] if hasattr(shap_values, '__len__') and len(shap_values) > 0 else shap_values

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
        base_val = float(expected[0] if hasattr(expected, '__len__') else expected)
        
        return {
            "base_value":  round(base_val, 4),
            "top_drivers": named[:5],
            "features":    named,
        }
    except Exception as e:
        print(f"SHAP explanation error: {e}")
        return {"error": str(e)}

def generate_school_report(y_true_arr, y_pred_arr, school_arr):
    df = pd.DataFrame({
        "School":        school_arr,
        "Actual_MPS":    y_true_arr,
        "Predicted_MPS": y_pred_arr,
    })
    df["Difference"] = df["Predicted_MPS"] - df["Actual_MPS"]

    def get_band(mps):
        for lower, upper, code, *_ in PROFICIENCY_BANDS:
            if mps >= lower and (upper == float('inf') or mps < upper):
                return code
        return 0

    band_labels = [b[3] for b in PROFICIENCY_BANDS]

    rows = []
    for school, grp in df.groupby("School"):
        n           = len(grp)
        avg_actual  = float(grp["Actual_MPS"].mean())
        avg_pred    = float(grp["Predicted_MPS"].mean())
        bias        = float(avg_pred - avg_actual)
        mae         = float(grp["Difference"].abs().mean())

        actual_counts = grp["Actual_MPS"].apply(get_band).value_counts()
        pred_counts   = grp["Predicted_MPS"].apply(get_band).value_counts()

        row = {
            "School":            school,
            "Student_Count":     int(n),
            "Avg_Actual_MPS":    avg_actual,
            "Avg_Predicted_MPS": avg_pred,
            "Avg_Bias":          bias,
            "MAE":               mae,
        }
        for band in band_labels:
            pct = (actual_counts.get(band, 0) / n * 100) if n > 0 else 0.0
            row[f"Actual_{band}"] = round(pct, 2)
        for band in band_labels:
            pct = (pred_counts.get(band, 0) / n * 100) if n > 0 else 0.0
            row[f"Pred_{band}"] = round(pct, 2)

        rows.append(row)

    result_df = pd.DataFrame(rows).sort_values("School").reset_index(drop=True)
    return result_df

def generate_test_results(y_true_arr, y_pred_arr, school_arr, learner_arr):
    df = pd.DataFrame({
        "learnerID":       learner_arr,
        "School":          school_arr,
        "Actual_MPS":      y_true_arr,
        "Predicted_MPS":   y_pred_arr,
        "Difference":      y_pred_arr - y_true_arr,
        "Error_Magnitude": np.abs(y_true_arr - y_pred_arr),
    })
    df["Actual_Proficiency"] = df["Actual_MPS"].apply(
        lambda s: PROFICIENCY_LABELS.get(encode_proficiency(s), "Unknown"))
    df["Predicted_Proficiency"] = df["Predicted_MPS"].apply(
        lambda s: PROFICIENCY_LABELS.get(encode_proficiency(s), "Unknown"))
    df["Pass_Probability"] = df["Predicted_MPS"].apply(
        lambda s: get_pass_probability(s, residual_std))
    return df[[
        "learnerID", "School", "Actual_MPS", "Predicted_MPS",
        "Difference", "Actual_Proficiency", "Predicted_Proficiency", "Pass_Probability", "Error_Magnitude"
    ]].sort_values(["School", "learnerID"]).reset_index(drop=True)

# ===========================================================================
# ROUTES
# ===========================================================================

@app.route("/debug/model-status", methods=["GET"])
def debug_model_status():
    model_path = find_model_file()
    return jsonify({
        "model_loaded": model is not None,
        "model_name": model_name if model else None,
        "artifact_path": model_path,
        "file_exists": model_path is not None,
        "files_in_directory": os.listdir('.') if os.path.exists('.') else [],
        "current_working_directory": os.getcwd(),
        "has_shap": shap_explainer is not None,
        "has_features": len(features) > 0 if features else False,
        "python_path": sys.path,
    })

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok" if model is not None else "degraded",
        "model": model_name,
        "model_loaded": model is not None,
        "shap_ready": shap_explainer is not None and SHAP_AVAILABLE,
    })

@app.route("/model-predict", methods=["GET"])
def model_predict():
    return jsonify({
        "linear": serialize_outputs(per_model_outputs.get("Linear")),
        "lasso": serialize_outputs(per_model_outputs.get("Lasso")),
        "decisionTree": serialize_outputs(per_model_outputs.get("DecisionTree")),
        "randomForest": serialize_outputs(per_model_outputs.get("RandomForest")),
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

@app.route("/explain", methods=["POST"])
def explain():
    err = _require_model() or _require_shap()
    if err: return err

    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Empty input"}), 400

        df = _build_df(data, features)
        pred = float(model.predict(df)[0])
        payload = _prediction_payload(pred, data)
        payload["explanation"] = get_shap_explanation(df)
        return jsonify(payload)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/explain-batch", methods=["POST"])
def explain_batch():
    err = _require_model() or _require_shap()
    if err: return err

    try:
        data = request.get_json()
        if not isinstance(data, list):
            return jsonify({"error": "Expected a JSON array"}), 400

        df = _build_df(data, features)
        preds = model.predict(df)

        results = []
        label_summary = {v: 0 for v in PROFICIENCY_LABELS.values()}

        for i, p in enumerate(preds):
            payload = _prediction_payload(p, data[i])
            payload["explanation"] = get_shap_explanation(df.iloc[[i]])
            label_summary[payload["proficiency"]["label"]] += 1
            results.append(payload)

        total = len(results)
        distribution = [
            {
                "code": b[2],
                "label": b[3],
                "range": b[4],
                "color": b[5],
                "count": label_summary.get(b[3], 0),
                "percentage": round(label_summary.get(b[3], 0) / total * 100, 2),
            }
            for b in PROFICIENCY_BANDS
        ]

        return jsonify({"results": results, "total": total, "distribution": distribution})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# Keep all your other routes (upload, analyze, school-metrics, etc.) here
# ... (I've omitted them for brevity, but include them from your original code)

# ===========================================================================
# ENTRY POINT
# ===========================================================================
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"\n{'='*60}")
    print(f"Starting Flask server on port {port}")
    print(f"Model loaded: {MODEL_LOADED}")
    print(f"{'='*60}\n")
    app.run(host="0.0.0.0", port=port, debug=True)