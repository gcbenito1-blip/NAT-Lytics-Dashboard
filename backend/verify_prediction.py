"""Cross-check predictions from Flask app vs direct model call."""
import sys, warnings, pandas as pd, numpy as np
warnings.filterwarnings('ignore')
sys.path.insert(0, '.')
from app import app, model, features, transformed_features, residual_std

# Use a real row from test set, aggregated to subject averages
raw = pd.read_csv('data/final/test_data.csv').iloc[0]
print("Raw row columns:", raw.index.tolist())
# Compute subject averages manually
def avg(cols):
    vals = [raw[col] for col in cols if pd.notna(raw[col])]
    return np.mean(vals) if vals else np.nan

input_dict = {
    "learnerID": raw["learnerID"],
    "Gender": raw["Gender"],
    "Age": int(raw["Age"]),
    "Mother Tongue": raw["Mother Tongue"],
    "Nutritional Status": raw["Nutritional Status"],
    "Filipino_avg": float(avg(["Filipino 1","Filipino 2","Filipino 3","Filipino 4","Filipino 5"])),
    "English_avg":  float(avg(["English 1","English 2","English 3","English 4","English 5"])),
    "Math_avg":     float(avg(["Math 1","Math 2","Math 3","Math 4","Math 5"])),
    "AralPan_avg":  float(avg(["Aral Pan 1","Aral Pan 2","Aral Pan 3","Aral Pan 4","Aral Pan 5"])),
    "Science_avg":  float(avg(["Science 3","Science 4","Science 5"])),
}
print("\nInput dict (aggregated):", {k:v for k,v in input_dict.items() if k not in ('learnerID','School')})

# Direct model prediction
df_input = pd.DataFrame([{k: input_dict.get(k) for k in features}])
direct_pred = float(model.predict(df_input)[0])
print(f"\nDirect model prediction: {direct_pred:.4f}")

# Via Flask test client
with app.test_client() as client:
    resp = client.post('/explain', json=input_dict)
    data = resp.get_json()
    api_pred = data['prediction']
    print(f"API /explain prediction: {api_pred:.4f}")
    print(f"Match: {abs(direct_pred - api_pred) < 1e-6}")
    print(f"Proficiency: {data['proficiency']['label']}")
    print(f"SHAP top 3 drivers:", [x['feature'] for x in data['explanation']['top_drivers']])
    print(f"Pass probability (>=75): {data.get('pass_probability')}")
