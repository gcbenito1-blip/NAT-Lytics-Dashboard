"""Try loading all best_model.joblib variants."""
import pickle, sys, warnings, joblib
warnings.filterwarnings('ignore')

class CompatUnpickler(pickle.Unpickler):
    def find_class(self, module, name):
        if module == 'Pipeline' and name == 'Pipeline':
            from sklearn.pipeline import Pipeline; return Pipeline
        if module == 'ColumnTransformer' and name == 'ColumnTransformer':
            from sklearn.compose import ColumnTransformer; return ColumnTransformer
        if module in ('sklearn.impute._base','sklearn.impute') and name == 'SimpleImputer':
            from sklearn.impute import SimpleImputer; return SimpleImputer
        if 'sklearn.preprocessing' in module:
            from sklearn.preprocessing import StandardScaler, OneHotEncoder
            if name == 'StandardScaler': return StandardScaler
            if name == 'OneHotEncoder': return OneHotEncoder
        if module.startswith('shap'): return type(f'_S_{name}', (), {})
        if 'pandas.core.arrays.string_' in module and name == 'StringDtype':
            import pandas as pd; return pd.StringDtype
        try:
            __import__(module); return getattr(sys.modules[module], name)
        except: return type(f'Stub_{name}', (), {})

paths = [
    'best_model.joblib',
    'best_model_bak.joblib',
    'data/final/new_out/best_model.joblib',
    'data/final/outputs/best_model.joblib',
]
for p in paths:
    try:
        with open(p, 'rb') as f:
            art = CompatUnpickler(f).load()
        model = art.get('model')
        print(f'[OK] {p}: model={type(model).__name__ if model else None}, features={len(art.get("features",[]))}')
    except Exception as e:
        print(f'[FAIL] {p}: {str(e)[:80]}')
