"""Debug unpickling to identify failing class."""
import pickle
import sys
import warnings
warnings.filterwarnings('ignore')

class DebugUnpickler(pickle.Unpickler):
    def find_class(self, module, name):
        full = f"{module}.{name}"
        print(f"  Loading: {full}")
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
        if 'sklearn.preprocessing' in module:
            from sklearn.preprocessing import StandardScaler, OneHotEncoder
            if name == 'StandardScaler': return StandardScaler
            if name == 'OneHotEncoder': return OneHotEncoder

        # SHAP stub
        if module.startswith('shap'):
            print(f"    -> stubbing SHAP {name}")
            return type(f'_Shap_{name}', (), {})

        # pandas StringDtype
        if 'pandas.core.arrays.string_' in module and name == 'StringDtype':
            import pandas as pd
            print(f"    -> returning pd.StringDtype")
            return pd.StringDtype

        # pandas CategoricalDtype
        if 'pandas.core.dtypes.dtypes' in module and name == 'CategoricalDtype':
            import pandas as pd
            print(f"    -> returning pd.CategoricalDtype")
            return pd.CategoricalDtype

        # Default
        try:
            __import__(module)
            return getattr(sys.modules[module], name)
        except Exception as e:
            print(f"    -> stub fallback for {full} (err: {e})")
            return type(f'Stub_{name}', (), {})

try:
    with open('best_model.joblib', 'rb') as f:
        print('Starting unpickling...')
        artifact = DebugUnpickler(f).load()
    print('[OK] Artifact loaded')
except Exception as e:
    print('[FAIL]', e)
    import traceback; traceback.print_exc()
