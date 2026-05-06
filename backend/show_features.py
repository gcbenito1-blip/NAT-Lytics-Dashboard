import warnings, joblib
warnings.filterwarnings('ignore')
art = joblib.load('best_model.joblib')
print('Features (raw input):', art['features'])
print('Transformed features (after prep):', art['transformed_features'])
