import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOutletContext } from 'react-router-dom';
import { getMetrics, ModelMetrics, getModelPredict, ModelPredictResponse } from '../services/api';

interface OutletContextType {
  viewMode?: 'teacher' | 'admin';
}

export function ModelReliability() {
  const { user } = useAuth();
  const { viewMode = 'teacher' } = useOutletContext<OutletContextType>();
  const [bestMetrics, setBestMetrics] = useState<ModelMetrics | null>(null);
  const [modelPredict, setModelPredict] = useState<ModelPredictResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError('');
      try {
        const [metricsData, modelPredictData] = await Promise.all([
          getMetrics(),
          getModelPredict(),
        ]);
        setBestMetrics(metricsData);
        setModelPredict(modelPredictData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // Map model name from metrics to the corresponding key in model-predict response
  const getModelPredictKey = (modelName: string): string => {
    const keyMap: Record<string, string> = {
      "Linear": "linear",
      "Lasso": "lasso",
      "DecisionTree": "decisionTree",
      "RandomForest": "randomForest",
      "GradientBoosting": "gradientBoost",
    };
    return keyMap[modelName] || modelName.toLowerCase();
  };

  // Convert numeric MPS score to proficiency code using NAT band thresholds
  const getProficiencyCode = (score: number): number => {
    if (score >= 90) return 4; // Highly Proficient
    if (score >= 75) return 3; // Proficient
    if (score >= 50) return 2; // Nearly Proficient
    if (score >= 25) return 1; // Low Proficient
    return 0; // Not Proficient
  };

  // Calculate star rating based on MAE and R2
  const getStarRating = (mae: number | undefined, r2: number | undefined): number => {
    if (mae === undefined || r2 === undefined) return 3;
    if (mae < 3.0 && r2 > 0.92) return 5;
    if (mae >= 3.0 && mae <= 6.0 && r2 >= 0.85 && r2 <= 0.92) return 4;
    if (mae > 6.0 && mae <= 9.0 && r2 >= 0.75 && r2 <= 0.85) return 3;
    if (mae < 3.0 && r2 <= 0.92) return 3;
    return 2;
  };

  // Get rating description based on star count
  const getRatingDescription = (stars: number): string => {
    switch (stars) {
      case 5: return 'Excellent reliability for high-stakes decisions';
      case 4: return 'Good reliability for educational planning';
      case 3: return 'Fair reliability - use with caution';
      case 2: return 'Needs improvement - review feature importance alongside prediction results';
      default: return 'Reliability rating unavailable';
    }
  };

  // Calculate label (proficiency) accuracy from y_true and y_pred arrays
  const calculateLabelAccuracy = (): number => {
    if (!bestMetrics || !modelPredict) return 0;
    const modelName = bestMetrics.model;
    if (!modelName) return 0;
    const modelKey = getModelPredictKey(modelName);
    const modelOutput = (modelPredict as any)[modelKey];
    if (!modelOutput?.y_true || !modelOutput?.y_pred) return 0;
    const yTrue = modelOutput.y_true;
    const yPred = modelOutput.y_pred;
    if (yTrue.length === 0) return 0;
    let correct = 0;
    for (let i = 0; i < yTrue.length; i++) {
      const trueCode = getProficiencyCode(yTrue[i]);
      const predCode = getProficiencyCode(yPred[i]);
      if (trueCode === predCode) correct++;
    }
    return Math.round((correct / yTrue.length) * 100);
  };

  const starRating = bestMetrics ? getStarRating(bestMetrics.MAE, bestMetrics.R2) : 0;
  const ratingDescription = getRatingDescription(starRating);
  const labelAcc = calculateLabelAccuracy();

  if (isLoading) {
    return (
      <div className="model-reliability">
        <header className="page-header">
          <div className="header-content">
            <h1>Model Reliability Assessment</h1>
            <p>Understanding the accuracy and limitations of NAT score predictions</p>
          </div>
        </header>
        <div className="loading-state">
          <p>Loading model metrics...</p>
        </div>
      </div>
    );
  }

  if (error || !bestMetrics) {
    return (
      <div className="model-reliability">
        <header className="page-header">
          <div className="header-content">
            <h1>Model Reliability Assessment</h1>
            <p>Understanding the accuracy and limitations of NAT score predictions</p>
          </div>
        </header>
        <div className="error-message">
          <p>{error || 'Unable to load metrics'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="model-reliability">
      {/* Header */}
      <header className="page-header">
        <div className="header-content">
          <h1>Model Reliability Assessment</h1>
          <p>Understanding the accuracy and limitations of NAT score predictions</p>
        </div>
      </header>

      {/* Main Content */}
      <div className="content-space">
        {/* Reliability Rating Card */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              Model Reliability Rating
              <div className="star-rating">
                {[1, 2, 3, 4, 5].map((star) => (
                  <span
                    key={star}
                    className={`star ${star <= starRating ? 'filled' : 'empty'}`}
                  >
                    ★
                  </span>
                ))}
              </div>
            </h2>
            <p className="card-description">
              {starRating} out of 5 stars - {ratingDescription}
            </p>
          </div>
          <div className="card-content">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="font-semibold text-blue-900 mb-2">Prediction Accuracy</p>
                <p className="text-sm text-blue-800">
                  Predictions are typically within <span className="font-bold">±{bestMetrics.MAE?.toFixed(4) || 'N/A'} MPS points</span> of actual NAT scores, based from the model's Mean Absolute Error (MAE) metrics.
                  This means if a learner is predicted 72, their actual score is likely between{' '}
                  {bestMetrics.MAE !== undefined
                    ? `${(72 - bestMetrics.MAE).toFixed(0)} and ${(72 + bestMetrics.MAE).toFixed(0)}`
                    : 'N/A'}
                  .
                </p>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="font-semibold text-blue-900 mb-2">Classification Accuracy</p>
                <p className="text-sm text-blue-800">
                  During testing, <span className="font-bold">{labelAcc}%</span> of learners were correctly classified
                  into their proficiency levels (High, Proficient, Nearly Proficient, etc.).
                </p>
              </div>
            </div>

            <div className="alert amber">
              <div className="alert-icon">ⓘ</div>
              <div className="alert-content">
                <p className="font-semibold mb-2">What ±{bestMetrics.MAE?.toFixed(4) || 'N/A'} MPS Points Means in Practice:</p>
                <p className="text-sm">
                  If a learner is predicted at <b>73 (Nearly Proficient)</b>, their actual score could range from{' '}
                  {bestMetrics.MAE !== undefined ? (
                    <>
                      <strong>{(73 - bestMetrics.MAE).toFixed(2)}</strong>
                      {" to "}
                      <strong>{(73 + bestMetrics.MAE).toFixed(2)}</strong>
                    </>
                  ) : (
                    'N/A'
                  )}
                  .
                  This means they might perform slightly below or slightly above the prediction.
                  {viewMode === 'teacher'
                    ? ' Use predictions to identify learners who need support, but remember to also consider your own classroom observations and recent performance.'
                    : ' For school-level planning, this margin of error is acceptable for identifying priority sections and allocating resources.'}
                </p>
              </div>
            </div>

            <div className="card nested">
              <div className="card-header-sm">
                <h3 className="text-sm font-semibold">Star Rating Rubric</h3>
              </div>
              <div className="card-content-sm">
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="stars">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <span key={star} className="star filled">★</span>
                      ))}
                    </div>
                    <span className="text-gray-600">MAE &lt; 3.0, R² &gt; 0.92 - Excellent</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="stars">
                      {[1, 2, 3, 4].map((star) => (
                        <span key={star} className="star filled">★</span>
                      ))}
                      <span className="star empty">★</span>
                    </div>
                    <span className="text-gray-600 font-semibold">
                      MAE 3.0-6.0, R² 0.85-0.92 - Good {starRating === 4 ? '(Current Model)' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="stars">
                      {[1, 2, 3].map((star) => (
                        <span key={star} className="star filled">★</span>
                      ))}
                      {[4, 5].map((star) => (
                        <span key={star} className="star empty">★</span>
                      ))}
                    </div>
                    <span className="text-gray-600">MAE 6.0-9.0, R² 0.75-0.85 - Fair</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Important Reminder Card */}
        <div className="card bg-red-50 border-red-200">
          <div className="card-header">
            <h2 className="card-title text-red-900 flex items-center gap-2">
              <span className="alert-icon-triangle">⚠</span>
              Important Reminder
            </h2>
          </div>
          <div className="card-content text-sm text-red-900 space-y-2">
            <p className="font-semibold">Predictions are a guide, not a verdict</p>
            <p>
              These predictions are based on historical data from SY 2023-2024 and 2024-2025.
              They do <span className="font-bold">not</span> account for:
            </p>
            <ul className="list-disc list-inside ml-2 space-y-1">
              <li>Recent changes in a learner's performance or attendance</li>
              <li>Personal or family circumstances affecting learning</li>
              {viewMode === 'teacher'
                ? <li>Current classroom instructional quality or recent teaching interventions</li>
                : <li>Current instructional quality, recent curriculum changes, or school-level initiatives</li>}
              <li>Learner motivation, effort, or test-taking skills on the actual NAT day</li>
            </ul>
            <p className="mt-3 font-semibold">
              {viewMode === 'teacher'
                ? 'Always use your professional judgment alongside these predictions. You know your students best.'
                : 'Use predictions alongside teacher observations, current school data, and professional judgment when making resource allocation decisions.'}
            </p>
          </div>
        </div>

        {/* Training Data Coverage Card - Only for school_admin */}
        {viewMode === 'admin' && (
          <div className="card bg-blue-50 border-blue-200">
            <div className="card-header">
              <h2 className="card-title text-blue-900">Training Data Coverage</h2>
            </div>
            <div className="card-content text-sm text-blue-900">
              <p>
                This model was trained on learner records from <span className="font-bold">8 schools in Urdaneta City</span> for
                <span className="font-bold"> SY 2023-2024 and 2024-2025</span>. Predictions are most reliable for schools
                whose learner profiles (demographics, academic patterns, contexts) are similar to the training data.
              </p>
              <p className="mt-2">
                If your school population differs significantly from the training schools, interpret predictions with additional caution.
              </p>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .model-reliability {
          padding: 24px;
          max-width: 1400px;
          margin: 0 auto;
          background: #f8f9fa;
          min-height: 100vh;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 32px;
          padding: 24px;
          background: linear-gradient(135deg, #3da6e2 0%, #1480be 100%);
          border-radius: 16px;
          color: #fff;
        }

        .header-content h1 {
          margin: 0 0 8px 0;
          font-size: 28px;
          font-weight: 700;
        }

        .header-content p {
          margin: 0;
          opacity: 0.9;
          font-size: 14px;
        }

        .content-space {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .card {
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 0;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        }

        .card.bg-red-50 {
          background: #fef2f2;
        }

        .card.bg-blue-50 {
          background: #eff6ff;
        }

        .card.bg-red-50.border-red-200 {
          border-color: #fecaca;
        }

        .card.bg-blue-50.border-blue-200 {
          border-color: #bfdbfe;
        }

        .card-header {
          padding: 24px;
          border-bottom: 1px solid #e5e7eb;
        }

        .card-header .card-title {
          font-size: 22px;
          font-weight: 700;
          margin: 0 0 8px 0;
          color: #333;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .card-header .card-title .star-rating {
          display: flex;
          gap: 2px;
        }

        .card-header .card-title .star {
          font-size: 20px;
        }

        .card-header .card-title .star.filled {
          color: #fbbf24;
        }

        .card-header .card-title .star.empty {
          color: #d1d5db;
        }

        .card-header .card-description {
          margin: 0;
          color: #666;
          font-size: 14px;
        }

        .card-content {
          padding: 24px;
        }

        .card-content .grid.md\\:grid-cols-2 {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }

        @media (max-width: 768px) {
          .card-content .grid.md\\:grid-cols-2 {
            grid-template-columns: 1fr;
          }
        }

        .bg-blue-50 {
          background: #eff6ff;
        }

        .bg-blue-50 .font-semibold {
          color: #1e40af;
        }

        .bg-blue-50 .text-blue-800 {
          color: #1e40af;
        }

        .alert {
          display: flex;
          gap: 12px;
          padding: 16px;
          border-radius: 8px;
          margin-top: 16px;
        }

        .alert.amber {
          background: #fffbeb;
          border: 1px solid #fcd34d;
        }

        .alert-icon {
          font-size: 18px;
          color: #92400e;
        }

        .alert-content {
          font-size: 14px;
          color: #92400e;
        }

        .alert-content .font-semibold {
          color: #78350f;
        }

        .nested {
          margin-top: 20px;
        }

        .card-header-sm {
          padding: 12px 16px;
          border-bottom: 1px solid #e5e7eb;
        }

        .card-header-sm .text-sm {
          font-size: 14px;
          font-weight: 600;
          color: #374151;
          margin: 0;
        }

        .card-content-sm {
          padding: 16px;
        }

        .stars {
          display: flex;
          gap: 2px;
        }

        .star.filled {
          color: #fbbf24;
        }

        .star.empty {
          color: #d1d5db;
        }

        .alert-icon-triangle {
          font-size: 20px;
        }

        .text-red-900 {
          color: #991b1b;
        }

        .bg-red-50 {
          background: #fef2f2;
        }

        .border-red-200 {
          border-color: #fecaca;
        }

        .text-blue-900 {
          color: #1e3a8a;
        }

        .bg-blue-50 {
          background: #eff6ff;
        }

        .border-blue-200 {
          border-color: #bfdbfe;
        }

        .list-disc {
          list-style-type: disc;
        }

        .list-inside {
          list-style-position: inside;
        }

        .ml-2 {
          margin-left: 0.5rem;
        }

        .space-y-1 > * + * {
          margin-top: 0.25rem;
        }

        .space-y-2 > * + * {
          margin-top: 0.5rem;
        }

        .font-semibold {
          font-weight: 600;
        }

        .font-bold {
          font-weight: 700;
        }

        .text-sm {
          font-size: 14px;
        }

        .text-xs {
          font-size: 12px;
        }

        .text-gray-600 {
          color: #4b5563;
        }

        .mt-2 {
          margin-top: 0.5rem;
        }

        .mt-3 {
          margin-top: 0.75rem;
        }

        .loading-state {
          text-align: center;
          padding: 40px;
          color: #666;
        }

        .error-message {
          text-align: center;
          padding: 40px;
          color: #dc2626;
        }
      `}</style>
    </div>
  );
}
