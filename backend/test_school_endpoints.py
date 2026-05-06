import sys, warnings
warnings.filterwarnings('ignore')
sys.path.insert(0, '.')
from app import app

with app.test_client() as client:
    # Test school metrics
    resp = client.get('/api/school-metrics')
    print('School metrics status:', resp.status_code)
    if resp.status_code == 200:
        data = resp.get_json()
        print('Schools count:', data['count'])
        print('First school:', data['schools'][0]['School'])
        print('Avg_Actual_MPS:', data['schools'][0]['Avg_Actual_MPS'])
    
    # Test school proficiency
    resp2 = client.get('/api/school-proficiency')
    print('\nSchool proficiency status:', resp2.status_code)
    if resp2.status_code == 200:
        d = resp2.get_json()
        print('Proficiency bands:', d['proficiency_bands'])
        print('First school actual bands:', d['schools'][0]['Actual'])
    
    # Test school MAE
    resp3 = client.get('/api/school-mae')
    print('\nSchool MAE status:', resp3.status_code)
    if resp3.status_code == 200:
        d3 = resp3.get_json()
        print('First school MAE:', d3['schools'][0]['MAE'])
    
    # Test test results
    resp4 = client.get('/api/test-results')
    print('\nTest results status:', resp4.status_code)
    if resp4.status_code == 200:
        d4 = resp4.get_json()
        print('Results count:', d4['count'])
        print('Columns:', d4['columns'])
