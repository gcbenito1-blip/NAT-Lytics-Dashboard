"""Test batch explanation endpoint."""
import sys, warnings
warnings.filterwarnings('ignore')
sys.path.insert(0, '.')
from app import app

# Load test data to get a few real rows
import pandas as pd
df = pd.read_csv('data/final/test_data.csv').head(5)
# Convert to list of dicts, preserving needed columns
records = df.to_dict(orient='records')

with app.test_client() as client:
    resp = client.post('/explain-batch', json=records)
    print('Status:', resp.status_code)
    if resp.status_code == 200:
        data = resp.get_json()
        print('Total results:', data.get('total'))
        print('Distribution:', data.get('distribution'))
        # Show first result summary
        first = data['results'][0]
        print('First learnerID:', first.get('learnerID'))
        print('  prediction:', first.get('prediction'))
        print('  proficiency:', first.get('proficiency', {}).get('label'))
        print('  has SHAP:', 'explanation' in first)
    else:
        print('Error:', resp.get_json())
