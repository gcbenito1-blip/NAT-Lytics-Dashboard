import pickle
import sys
import warnings
warnings.filterwarnings('ignore')

# Module mapper for sklearn version mismatch
class FixedUnpickler(pickle.Unpickler):
    def find_class(self, module, name):
        # Handle bare 'Pipeline' reference
        if module == 'Pipeline' and name == 'Pipeline':
            from sklearn.pipeline import Pipeline
            return Pipeline
        if module == 'ColumnTransformer' and name == 'ColumnTransformer':
            from sklearn.compose import ColumnTransformer
            return ColumnTransformer
        if module == 'SimpleImputer' and name == 'SimpleImputer':
            from sklearn.impute import SimpleImputer
            return SimpleImputer
        if module == 'StandardScaler' and name == 'StandardScaler':
            from sklearn.preprocessing import StandardScaler
            return StandardScaler
        if module == 'OneHotEncoder' and name == 'OneHotEncoder':
            from sklearn.preprocessing import OneHotEncoder
            return OneHotEncoder
        # Linear models
        if module in ('sklearn.linear_model._base', 'sklearn.linear_model'):
            if name in ('LinearRegression', 'Lasso'):
                mod = __import__('sklearn.linear_model', fromlist=[name])
                return getattr(mod, name)
        # Tree models
        if module in ('sklearn.tree._classes', 'sklearn.tree'):
            if name == 'DecisionTreeRegressor':
                mod = __import__('sklearn.tree', fromlist=[name])
                return getattr(mod, name)
        # Ensemble models
        if module in ('sklearn.ensemble._gb', 'sklearn.ensemble'):
            if name in ('RandomForestRegressor', 'GradientBoostingRegressor'):
                mod = __import__('sklearn.ensemble', fromlist=[name])
                return getattr(mod, name)
        # SHAP stub
        if module.startswith('shap'):
            return type(f'_Shap_{name}', (), {})
        # Default
        try:
            __import__(module)
            return getattr(sys.modules[module], name)
        except:
            return type(f'Stub_{name}', (), {})

try:
    with open('best_model.joblib', 'rb') as f:
        artifact = FixedUnpickler(f).load()
    print('[OK] Artifact loaded')
    print('Model:', artifact.get('model_name'))
    print('Features:', len(artifact.get('features', [])))
    print('SHAP:', artifact.get('shap_explainer') is not None)
    print('Residual std:', artifact.get('residual_std'))
    model = artifact['model']
    features = artifact['features']
except Exception as e:
    print('[FAIL]', e)
    import traceback; traceback.print_exc()
