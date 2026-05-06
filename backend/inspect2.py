import warnings, joblib, pandas as pd
warnings.filterwarnings('ignore')
art = joblib.load('data/final/new_out/best_model.joblib')
print('school_report:', art.get('school_report'))
print('test_results:', type(art.get('test_results')))
print('display_test:', art.get('display_test') is not None)
print('y_test shape:', art.get('y_test').shape if art.get('y_test') is not None else None)
print('school_test shape:', art.get('school_test').shape if art.get('school_test') is not None else None)
print('learner_test shape:', art.get('learner_test').shape if art.get('learner_test') is not None else None)
