import warnings, joblib
warnings.filterwarnings('ignore')
art = joblib.load('data/final/new_out/best_model.joblib')
print('Keys:', list(art.keys()))
print('school_report_df:', type(art.get('school_report_df')))
print('test_results_df:', type(art.get('test_results_df')))
print('per_model_outputs keys:', list(art.get('per_model_outputs', {}).keys()))
