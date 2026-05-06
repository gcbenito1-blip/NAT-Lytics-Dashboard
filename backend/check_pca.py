import warnings, joblib
warnings.filterwarnings('ignore')
art = joblib.load('best_model.joblib')
print('PCA object:', art.get('pca'))
print('PCA explained variance:', art.get('pca_explained_variance'))
print('Z-score applied?', art.get('zscore_applied'))
print('Pass threshold:', art.get('pass_threshold'))
print('Model features:', art['features'])
