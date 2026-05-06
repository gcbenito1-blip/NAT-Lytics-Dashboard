"""Test artifact loading with proper stubs for pandas/sklearn version mismatches."""
import pickle
import sys
import warnings
import joblib
warnings.filterwarnings('ignore')

class CompatUnpickler(pickle.Unpickler):
    """Map missing/bare modules and stub SHAP/pandas objects."""
    def find_class(self, module, name):
        # 1. sklearn Pipeline bare reference
        if module == 'Pipeline' and name == 'Pipeline':
            from sklearn.pipeline import Pipeline
            return Pipeline
        if module == 'ColumnTransformer' and name == 'ColumnTransformer':
            from sklearn.compose import ColumnTransformer
            return ColumnTransformer

        # 2. sklearn estimators with module path variations
        if module in ('sklearn.linear_model._base', 'sklearn.linear_model'):
            if name in ('LinearRegression', 'Lasso'):
                import sklearn.linear_model
                return getattr(sklearn.linear_model, name)
        if module in ('sklearn.tree._classes', 'sklearn.tree'):
            if name == 'DecisionTreeRegressor':
                import sklearn.tree
                return getattr(sklearn.tree, name)
        if module in ('sklearn.ensemble._gb', 'sklearn.ensemble'):
            if name in ('RandomForestRegressor', 'GradientBoostingRegressor'):
                import sklearn.ensemble
                return getattr(sklearn.ensemble, name)

        # 3. Preprocessing steps
        if module == 'sklearn.impute._base' or module == 'sklearn.impute':
            if name == 'SimpleImputer':
                from sklearn.impute import SimpleImputer
                return SimpleImputer
        if module == 'sklearn.preprocessing._data' or module == 'sklearn.preprocessing':
            if name in ('StandardScaler', 'OneHotEncoder'):
                from sklearn.preprocessing import StandardScaler, OneHotEncoder
                return {'StandardScaler': StandardScaler, 'OneHotEncoder': OneHotEncoder}[name]

        # 4. SHAP: stub everything
        if module.startswith('shap'):
            return type(f'_Shap_{name}', (), {})

        # 5. pandas StringDtype - stub to object dtype
        if module == 'pandas.core.arrays.string_' and name == 'StringDtype':
            import pandas as pd
            return pd.StringDtype

        # 6. Default: try normal import
        try:
            __import__(module)
            return getattr(sys.modules[module], name)
        except:
            # Last resort: return a generic stub
            return type(f'Stub_{name}', (), {})

def load_artifact(path='best_model.joblib'):
    with open(path, 'rb') as f:
        return CompatUnpickler(f).load()

try:
    artifact = load_artifact()
    print('[OK] Artifact loaded')
    print('  model_name:', artifact.get('model_name'))
    print('  features:', len(artifact.get('features', [])))
    print('  shap:', artifact.get('shap_explainer') is not None)
    print('  residual_std:', artifact.get('residual_std'))
    print('  school_report_df type:', type(artifact.get('school_report_df')))
except Exception as e:
    print('[FAIL]', e)
    import traceback; traceback.print_exc()
