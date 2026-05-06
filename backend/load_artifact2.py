"""Test artifact loading - map StringDtype properly."""
import pickle
import sys
import warnings
warnings.filterwarnings('ignore')

class CompatUnpickler(pickle.Unpickler):
    def find_class(self, module, name):
        # sklearn pipeline
        if module == 'Pipeline' and name == 'Pipeline':
            from sklearn.pipeline import Pipeline; return Pipeline
        if module == 'ColumnTransformer' and name == 'ColumnTransformer':
            from sklearn.compose import ColumnTransformer; return ColumnTransformer

        # sklearn estimators
        if module in ('sklearn.linear_model._base', 'sklearn.linear_model'):
            if name in ('LinearRegression', 'Lasso'):
                import sklearn.linear_model; return getattr(sklearn.linear_model, name)
        if module in ('sklearn.tree._classes', 'sklearn.tree'):
            if name == 'DecisionTreeRegressor':
                import sklearn.tree; return getattr(sklearn.tree, name)
        if module in ('sklearn.ensemble._gb', 'sklearn.ensemble'):
            if name in ('RandomForestRegressor', 'GradientBoostingRegressor'):
                import sklearn.ensemble; return getattr(sklearn.ensemble, name)

        # preprocessing
        if module == 'sklearn.impute._base' or module == 'sklearn.impute':
            if name == 'SimpleImputer':
                from sklearn.impute import SimpleImputer; return SimpleImputer
        if module == 'sklearn.preprocessing._data' or module == 'sklearn.preprocessing':
            if name in ('StandardScaler', 'OneHotEncoder'):
                from sklearn.preprocessing import StandardScaler, OneHotEncoder
                return {'StandardScaler': StandardScaler, 'OneHotEncoder': OneHotEncoder}[name]

        # SHAP stub
        if module.startswith('shap'):
            return type(f'_Shap_{name}', (), {})

        # pandas StringDtype - return actual class so it can be instantiated
        if module == 'pandas.core.arrays.string_' and name == 'StringDtype':
            import pandas as pd
            return pd.StringDtype

        # Default
        try:
            __import__(module)
            return getattr(sys.modules[module], name)
        except:
            return type(f'Stub_{name}', (), {})

try:
    with open('best_model.joblib', 'rb') as f:
        artifact = CompatUnpickler(f).load()
    print('[OK] Loaded')
    print('  model_name:', artifact.get('model_name'))
    print('  features:', len(artifact.get('features', [])))
    print('  has_shap:', artifact.get('shap_explainer') is not None)
    print('  residual_std:', artifact.get('residual_std'))
    model = artifact['model']
    features = artifact['features']
except Exception as e:
    print('[FAIL]', e)
    import traceback; traceback.print_exc()
