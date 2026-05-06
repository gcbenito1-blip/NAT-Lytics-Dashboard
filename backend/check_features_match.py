import warnings, joblib, pandas as pd, numpy as np
warnings.filterwarnings('ignore')
art = joblib.load('best_model.joblib')
model = art['model']
features = art['features']
prep = model.named_steps['prep']

# Load a few rows from actual test set
test_df = pd.read_csv('data/final/test_data.csv')
# Build input as the model expects (raw subject columns -> aggregated by pipeline's preprocessing)
# But the pipeline expects the raw columns to be present. Let's see: the features list says subject avgs.
# Actually, test_data.csv already contains raw quarterly grades. The pipeline aggregates them.
# Wait: features = ['Gender', 'Age', 'Mother Tongue', 'Nutritional Status', 'Filipino_avg', ...]
# That means the pipeline expects already-aggregated subject averages, NOT quarterly columns.
# Let's verify what columns are actually used.

# Check which columns from test_data.csv match features
test_cols = set(test_df.columns)
feature_cols = set(features)
missing = feature_cols - test_cols
print('Missing features in test_data.csv:', missing)
print('Test columns available:', sorted(test_cols))
