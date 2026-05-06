"""Test Flask app loading and /explain endpoint with sample data."""
import sys
import warnings
warnings.filterwarnings('ignore')

# Import app
sys.path.insert(0, '.')
from app import app, features, model, shap_explainer

print('App imported')
print('Model loaded:', model is not None)
print('SHAP ready:', shap_explainer is not None)
print('Features count:', len(features) if features else 0)

# Sample payload matching test_data.csv structure
sample = {
    "learnerID": "TEST-001",
    "School": "Test School",
    "Gender": "M",
    "Age": 12,
    "Mother Tongue": "Tagalog",
    "Nutritional Status": "Normal",
    "Filipino 1": 85.0, "English 1": 82.0, "Math 1": 88.0, "Aral Pan 1": 84.0,
    "Filipino 2": 86.0, "English 2": 83.0, "Math 2": 87.0, "Aral Pan 2": 85.0,
    "Filipino 3": 84.0, "English 3": 81.0, "Math 3": 86.0, "Science 3": 83.0, "Aral Pan 3": 84.0,
    "Filipino 4": 83, "English 4": 80, "Math 4": 85, "Science 4": 82, "Aral Pan 4": 84,
    "Filipino 5": 82.0, "English 5": 79, "Math 5": 84, "Science 5": 81, "Aral Pan 5": 83,
    "MPS": 75.0  # target (not needed for prediction but present)
}

with app.test_client() as client:
    resp = client.post('/explain', json=sample)
    print('\n/explain status:', resp.status_code)
    if resp.status_code == 200:
        data = resp.get_json()
        print('Prediction:', data.get('prediction'))
        print(' Proficiency:', data.get('proficiency', {}).get('label'))
        print('Has SHAP:', 'explanation' in data)
    else:
        print('Error:', resp.get_json())
