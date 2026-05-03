# transformers.py
import numpy as np
from sklearn.base import BaseEstimator, TransformerMixin

class IQRClipper(BaseEstimator, TransformerMixin):
    def fit(self, X, y=None):
        X = np.asarray(X)
        self.q1_ = np.percentile(X, 25, axis=0)
        self.q3_ = np.percentile(X, 75, axis=0)
        self.iqr_ = self.q3_ - self.q1_
        self.low_ = self.q1_ - 1.5 * self.iqr_
        self.high_ = self.q3_ + 1.5 * self.iqr_
        return self

    def transform(self, X):
        X = np.asarray(X)
        return np.clip(X, self.low_, self.high_)