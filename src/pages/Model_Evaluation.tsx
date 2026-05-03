import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getMetrics, getAllModelMetrics, ModelMetrics } from '../services/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const metricColors = ['#fa456d', '#58b9f1', '#82ca9d', '#bda229', '#caa1ff', '#ff6b6b', '#40b635', '#ffa55c'];

// ============================================================
// FEATURE IMPORTANCE EXPLANATIONS FOR NON-TECHNICAL USERS
// ============================================================

// Map technical column names to user-friendly descriptions
export const featureExplanations: Record<string, {
  friendlyName: string;
  category: string;
  description: string;
  canChange: boolean;
  insight: string;
}> = {
  'Age': {
    friendlyName: 'Age',
    category: 'Student Profile',
    description: 'The student\'s age at the time of assessment',
    canChange: false,
    insight: 'Age can affect cognitive development and learning readiness.'
  },
  'Sex': {
    friendlyName: 'Gender',
    category: 'Student Profile',
    description: 'The student\'s gender',
    canChange: false,
    insight: 'Gender may influence learning styles and academic interests.'
  },
  'Mother Tongue': {
    friendlyName: 'Mother Tongue',
    category: 'Student Profile',
    description: 'The student\'s primary language at home',
    canChange: false,
    insight: 'Language background can affect performance in language-related subjects.'
  },
  'Nutritional Status(BMI)': {
    friendlyName: 'BMI / Nutritional Status',
    category: 'Student Profile',
    description: 'The student\'s body mass index and nutritional condition',
    canChange: false,
    insight: 'Physical health and nutrition can influence concentration and learning ability.'
  },
  // Grade 1 subjects
  'Math 1': {
    friendlyName: 'Grade 1 - Math',
    category: 'Academic History',
    description: 'Final Math grade from Grade 1 (Past Performance)',
    canChange: false,
    insight: 'This is a historical record of the student\'s math performance in Grade 1. Past grades cannot be changed but show the student\'s academic foundation.'
  },
  'English 1': {
    friendlyName: 'Grade 1 - English',
    category: 'Academic History',
    description: 'Final English grade from Grade 1 (Past Performance)',
    canChange: false,
    insight: 'This is a historical record of the student\'s English performance in Grade 1. Past grades cannot be changed but show the student\'s language foundation.'
  },
  'Filipino 1': {
    friendlyName: 'Grade 1 - Filipino',
    category: 'Academic History',
    description: 'Final Filipino grade from Grade 1 (Past Performance)',
    canChange: false,
    insight: 'This is a historical record of the student\'s Filipino performance in Grade 1. Past grades cannot be changed.'
  },
  'Aral Pan 1': {
    friendlyName: 'Grade 1 - Araling Panlipunan',
    category: 'Academic History',
    description: 'Final Araling Panlipunan grade from Grade 1 (Past Performance)',
    canChange: false,
    insight: 'This is a historical record of the student\'s social studies performance in Grade 1. Past grades cannot be changed.'
  },
  // Grade 2 subjects
  'Math 2': {
    friendlyName: 'Grade 2 - Math',
    category: 'Academic History',
    description: 'Final Math grade from Grade 2 (Past Performance)',
    canChange: false,
    insight: 'This is a historical record of the student\'s math performance in Grade 2. Shows progression from Grade 1.'
  },
  'English 2': {
    friendlyName: 'Grade 2 - English',
    category: 'Academic History',
    description: 'Final English grade from Grade 2 (Past Performance)',
    canChange: false,
    insight: 'This is a historical record of the student\'s English performance in Grade 2. Shows progression from Grade 1.'
  },
  'Filipino 2': {
    friendlyName: 'Grade 2 - Filipino',
    category: 'Academic History',
    description: 'Final Filipino grade from Grade 2 (Past Performance)',
    canChange: false,
    insight: 'This is a historical record of the student\'s Filipino performance in Grade 2. Shows progression from Grade 1.'
  },
  'Aral Pan 2': {
    friendlyName: 'Grade 2 - Araling Panlipunan',
    category: 'Academic History',
    description: 'Final Araling Panlipunan grade from Grade 2 (Past Performance)',
    canChange: false,
    insight: 'This is a historical record of the student\'s social studies performance in Grade 2. Shows progression from Grade 1.'
  },
  // Grade 3 subjects
  'Math 3': {
    friendlyName: 'Grade 3 - Math',
    category: 'Academic History',
    description: 'Final Math grade from Grade 3 (Past Performance)',
    canChange: false,
    insight: 'This is a historical record of the student\'s math performance in Grade 3. Shows academic trajectory.'
  },
  'English 3': {
    friendlyName: 'Grade 3 - English',
    category: 'Academic History',
    description: 'Final English grade from Grade 3 (Past Performance)',
    canChange: false,
    insight: 'This is a historical record of the student\'s English performance in Grade 3. Shows academic trajectory.'
  },
  'Science 3': {
    friendlyName: 'Grade 3 - Science',
    category: 'Academic History',
    description: 'Final Science grade from Grade 3 (Past Performance)',
    canChange: false,
    insight: 'This is a historical record of the student\'s science performance in Grade 3. Science was introduced in Grade 3.'
  },
  'Filipino 3': {
    friendlyName: 'Grade 3 - Filipino',
    category: 'Academic History',
    description: 'Final Filipino grade from Grade 3 (Past Performance)',
    canChange: false,
    insight: 'This is a historical record of the student\'s Filipino performance in Grade 3.'
  },
  'Aral Pan 3': {
    friendlyName: 'Grade 3 - Araling Panlipunan',
    category: 'Academic History',
    description: 'Final Araling Panlipunan grade from Grade 3 (Past Performance)',
    canChange: false,
    insight: 'This is a historical record of the student\'s social studies performance in Grade 3.'
  },
  // Grade 4 subjects
  'Math 4': {
    friendlyName: 'Grade 4 - Math',
    category: 'Academic History',
    description: 'Final Math grade from Grade 4 (Past Performance)',
    canChange: false,
    insight: 'This is a historical record of the student\'s math performance in Grade 4. Shows recent academic performance.'
  },
  'English 4': {
    friendlyName: 'Grade 4 - English',
    category: 'Academic History',
    description: 'Final English grade from Grade 4 (Past Performance)',
    canChange: false,
    insight: 'This is a historical record of the student\'s English performance in Grade 4. Shows recent academic performance.'
  },
  'Science 4': {
    friendlyName: 'Grade 4 - Science',
    category: 'Academic History',
    description: 'Final Science grade from Grade 4 (Past Performance)',
    canChange: false,
    insight: 'This is a historical record of the student\'s science performance in Grade 4. Shows recent performance in science.'
  },
  'Filipino 4': {
    friendlyName: 'Grade 4 - Filipino',
    category: 'Academic History',
    description: 'Final Filipino grade from Grade 4 (Past Performance)',
    canChange: false,
    insight: 'This is a historical record of the student\'s Filipino performance in Grade 4. Shows recent performance.'
  },
  'Aral Pan 4': {
    friendlyName: 'Grade 4 - Araling Panlipunan',
    category: 'Academic History',
    description: 'Final Araling Panlipunan grade from Grade 4 (Past Performance)',
    canChange: false,
    insight: 'This is a historical record of the student\'s social studies performance in Grade 4. Shows recent performance.'
  },
  // Grade 5 subjects
  'Math 5': {
    friendlyName: 'Grade 5 - Math',
    category: 'Academic History',
    description: 'Final Math grade from Grade 5 (Most Recent Performance)',
    canChange: false,
    insight: 'This is the most recent academic record (Grade 5). This is typically the strongest predictor as it reflects the student\'s current academic level.'
  },
  'English 5': {
    friendlyName: 'Grade 5 - English',
    category: 'Academic History',
    description: 'Final English grade from Grade 5 (Most Recent Performance)',
    canChange: false,
    insight: 'This is the most recent academic record (Grade 5). This is typically the strongest predictor as it reflects the student\'s current academic level.'
  },
  'Science 5': {
    friendlyName: 'Grade 5 - Science',
    category: 'Academic History',
    description: 'Final Science grade from Grade 5 (Most Recent Performance)',
    canChange: false,
    insight: 'This is the most recent academic record (Grade 5). This is typically the strongest predictor as it reflects the student\'s current academic level.'
  },
  'Filipino 5': {
    friendlyName: 'Grade 5 - Filipino',
    category: 'Academic History',
    description: 'Final Filipino grade from Grade 5 (Most Recent Performance)',
    canChange: false,
    insight: 'This is the most recent academic record (Grade 5). This is typically the strongest predictor as it reflects the student\'s current academic level.'
  },
  'Aral Pan 5': {
    friendlyName: 'Grade 5 - Araling Panlipunan',
    category: 'Academic History',
    description: 'Final Araling Panlipunan grade from Grade 5 (Most Recent Performance)',
    canChange: false,
    insight: 'This is the most recent academic record (Grade 5). This is typically the strongest predictor as it reflects the student\'s current academic level.'
  }
};

// Get a user-friendly name for any feature
export const getFriendlyFeatureName = (featureName: string): string => {
  return featureExplanations[featureName]?.friendlyName || featureName;
};

// Get category color for display - all categories now merged into Student Profile
export const getCategoryColor = (category: string): string => {
  // All categories now use Student Profile color
  return '#8b5cf6';
};

// ============================================================
// HELPER FUNCTIONS & COMPONENTS FOR NON-TECHNICAL USERS
// ============================================================

// Simple explanations for each metric - like telling someone what the metric measures in everyday terms
const metricExplanations = {
  R2: {
    title: "R² Score (R-Squared)",
    simple: "Think of R² as a 'grade' for how well the model does its job. It tells you what percentage of the answer the model gets right.",
    analogy: "Imagine you try to guess how many ice creams a shop sells each day. If you guessed randomly, you'd be way off. R² tells you how much better your guesses are compared to just guessing the average every time. A score of 0.80 means your model is 80% better than random guessing!",
    guide: {
      excellent: { range: "0.9 - 1.0", text: "Excellent! The model explains nearly all the variation." },
      good: { range: "0.7 - 0.89", text: "Good! The model makes reliable predictions." },
      okay: { range: "0.5 - 0.69", text: "Okay. Some patterns captured, but room for improvement." },
      poor: { range: "0 - 0.49", text: "Needs work. The model isn't capturing enough patterns." }
    }
  },
  MAE: {
    title: "Mean Absolute Error (MAE)",
    simple: "MAE is the average amount the model's prediction is 'off by'. It tells you how wrong the predictions typically are.",
    analogy: "If a weather app says it'll be 25°C but it's actually 22°C, the error is 3°. MAE is like calculating all those errors across many days and finding the average. Lower is better!",
    guide: {
      excellent: { range: "0 - 2", text: "Very accurate! Predictions are almost always correct." },
      good: { range: "2 - 5", text: "Good accuracy. Predictions are close to the truth." },
      okay: { range: "5 - 10", text: "Moderate. Some predictions may be noticeably off." },
      poor: { range: "> 10", text: "High error. Predictions often miss the mark significantly." }
    }
  },
  RMSE: {
    title: "Root Mean Squared Error (RMSE)",
    simple: "RMSE is like MAE but 'punishes' big mistakes more. It's useful when huge errors are especially bad.",
    analogy: "If you usually miss by 2 degrees, but once miss by 20 degrees, RMSE makes that big mistake stand out more than MAE would. Think of it as a 'worst case' metric - it shows how bad things can get.",
    guide: {
      excellent: { range: "0 - 2", text: "Very accurate! Very few large errors." },
      good: { range: "2 - 5", text: "Good. Generally reliable predictions." },
      okay: { range: "5 - 10", text: "Moderate. Some significant errors may occur." },
      poor: { range: "> 10", text: "High error. Large mistakes are common." }
    }
  }
};

// Format metric value for display
const formatMetricValue = (value: number | undefined, decimals: number = 4): string => {
  if (value === undefined || value === null) return 'N/A';
  return value.toFixed(decimals);
};

// Metric guide card - helps users understand what "good" looks like
const MetricGuideCard = ({ metricKey }: { metricKey: 'R2' | 'MAE' | 'RMSE' }) => {
  const info = metricExplanations[metricKey];

  return (
    <div className="metric-guide-card">
      <div className="guide-header">
        <span className="guide-icon">💡</span>
        <span>Understanding {info.title}</span>
      </div>
      <div className="guide-simple">{info.simple}</div>
      <div className="guide-analogy">
        <strong>💭 Think of it this way:</strong> {info.analogy}
      </div>
      <div className="guide-scale">
        <div className="scale-title">How to read the score:</div>
        <div className="scale-items">
          {Object.entries(info.guide).map(([key, val]) => (
            <div key={key} className={`scale-item scale-${key}`}>
              <span className="scale-range">{val.range}</span>
              <span className="scale-desc">{val.text}</span>
            </div>
          ))}
        </div>
      </div>
      <style>{`
                .metric-guide-card {
                    background: #fafbfc;
                    border: 1px solid #e5e7eb;
                    border-radius: 12px;
                    padding: 16px;
                    margin-top: 8px;
                }
                .guide-header {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-weight: 600;
                    color: #374151;
                    margin-bottom: 12px;
                    font-size: 14px;
                }
                .guide-icon {
                    font-size: 16px;
                }
                .guide-simple {
                    color: #4b5563;
                    font-size: 13px;
                    line-height: 1.5;
                    margin-bottom: 12px;
                }
                .guide-analogy {
                    background: #fef3c7;
                    border-left: 3px solid #f59e0b;
                    padding: 12px;
                    border-radius: 0 8px 8px 0;
                    font-size: 13px;
                    color: #92400e;
                    margin-bottom: 12px;
                    line-height: 1.5;
                }
                .guide-analogy strong {
                    display: block;
                    margin-bottom: 4px;
                }
                .guide-scale {
                    background: #fff;
                    border: 1px solid #e5e7eb;
                    border-radius: 8px;
                    padding: 12px;
                }
                .scale-title {
                    font-weight: 600;
                    font-size: 12px;
                    color: #6b7280;
                    margin-bottom: 8px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                .scale-items {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .scale-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 12px;
                }
                .scale-range {
                    background: #e5e7eb;
                    padding: 2px 8px;
                    border-radius: 4px;
                    font-family: monospace;
                    font-weight: 600;
                    color: #374151;
                    min-width: 80px;
                    text-align: center;
                }
                .scale-excellent .scale-range { background: #d1fae5; color: #065f46; }
                .scale-good .scale-range { background: #dbeafe; color: #1e40af; }
                .scale-okay .scale-range { background: #fef3c7; color: #92400e; }
                .scale-poor .scale-range { background: #fee2e2; color: #991b1b; }
            `}</style>
    </div>
  );
};

// Expandable metric explanation
const MetricExplanation = ({ metric }: { metric: 'R2' | 'MAE' | 'RMSE' }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="metric-explanation">
      <button
        className="explanation-toggle"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? '🔽 Hide explanation' : '🔍 What does this mean?'}
      </button>
      {expanded && <MetricGuideCard metricKey={metric} />}
      <style>{`
                .metric-explanation {
                    margin-top: 8px;
                }
                .explanation-toggle {
                    background: none;
                    border: none;
                    color: #6b7280;
                    font-size: 12px;
                    cursor: pointer;
                    padding: 4px 0;
                    text-decoration: underline;
                    transition: color 0.2s;
                }
                .explanation-toggle:hover {
                    color: #4f46e5;
                }
            `}</style>
    </div>
  );
};

// Metric cards component
const MetricCard = ({
  label,
  value,
  color,
  description,
}: {
  label: string;
  value: string | number;
  color: string;
  description?: string;
  metricKey?: 'R2' | 'MAE' | 'RMSE';
}) => {

  return (
    <div className="metric-card">
      <div className="metric-header" style={{ borderLeftColor: color }}>
        <span className="metric-label">{label}</span>
      </div>
      <div className="metric-value-container">
        <div className="metric-value" style={{ color }}>
          {value}
        </div>
      </div>
      {description && <div className="metric-description">{description}</div>}
      <style>{`
      .metric-card {
        background: #fff;
        border-radius: 12px;
        padding: 20px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        transition: transform 0.2s, box-shadow 0.2s;
      }
      .metric-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
      }
      .metric-header {
        border-left: 4px solid;
        padding-left: 12px;
        margin-bottom: 12px;
      }
      .metric-label {
        font-size: 14px;
        color: #666;
        font-weight: 500;
      }
      .metric-value-container {
        display: flex;
        align-items: baseline;
        gap: 12px;
      }
      .metric-value {
        font-size: 32px;
        font-weight: 700;
        line-height: 1.2;
      }
      .metric-rating {
        font-size: 14px;
        color: #666;
        font-weight: 500;
      }
      .metric-description {
        font-size: 12px;
        color: #999;
        margin-top: 8px;
      }
    `}</style>
    </div>
  );
};

export function ModelEvaluation() {
  const [allMetrics, setAllMetrics] = useState<ModelMetrics[]>([]);
  const [bestMetrics, setBestMetrics] = useState<ModelMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError('');

      try {
        const [allMetricsData, bestMetricsData] = await Promise.all([
          getAllModelMetrics(),
          getMetrics(),
        ]);
        setAllMetrics(allMetricsData.models || []);
        setBestMetrics(bestMetricsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load model data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // Process all models for display
  const modelsArray = useMemo(() => {
    if (!allMetrics.length) return [];

    // Find the best model by R2 score
    let bestIndex = 0;
    let bestR2 = -Infinity;
    allMetrics.forEach((m, i) => {
      if (m.R2 && m.R2 > bestR2) {
        bestR2 = m.R2;
        bestIndex = i;
      }
    });

    return allMetrics.map((model, index) => ({
      name: model.model || `Model ${index + 1}`,
      metrics: model,
      color: metricColors[index % metricColors.length],
      isBest: index === bestIndex,
    }));
  }, [allMetrics]);

  // Chart data for comparing models
  const chartData = useMemo(() => {
    return modelsArray.map((model) => ({
      name: model.name,
      R2: model.metrics.R2 || 0,
      MAE: model.metrics.MAE || 0,
      RMSE: model.metrics.RMSE || 0,
    }));
  }, [modelsArray]);

  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) => {
    if (active && payload && payload.length) {
      return (
        <div className="custom-tooltip">
          <p className="label">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="value" style={{ color: entry.name === 'R2' ? '#82ca9d' : entry.name === 'MAE' ? '#fa456d' : entry.name === "RMSE" ? '#58b9f1' : '#82ca9d' }}>
              {entry.name}: {entry.value.toFixed(4)}
            </p>
          ))}
          <style>{`
                .custom-tooltip {
                  background: #fff;
                  border: 1px solid #ddd;
                  border-radius: 8px;
                  padding: 12px;
                  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
                }
                .custom-tooltip .label {
                  font-weight: 600;
                  margin-bottom: 4px;
                  color: #333;
                }
                .custom-tooltip .value {
                  font-size: 14px;
                }
              `}</style>
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading model metrics...</p>
        <style>{`
          .loading-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 400px;
            gap: 16px;
          }
          .loading-spinner {
            width: 48px;
            height: 48px;
            border: 4px solid #f3f3f3;
            border-top: 4px solid #fa456d;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          .loading-container p {
            color: #666;
            font-size: 16px;
          }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <div className="error-message">
          <h3>Error Loading Metrics</h3>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
        <style>{`
          .error-container {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 400px;
          }
          .error-message {
            background: #fff;
            border: 1px solid #ff6b6b;
            border-radius: 12px;
            padding: 24px;
            text-align: center;
          }
          .error-message h3 {
            color: #ff6b6b;
            margin-bottom: 8px;
          }
          .error-message p {
            color: #666;
            margin-bottom: 16px;
          }
          .error-message button {
            background: #fa456d;
            color: #fff;
            border: none;
            padding: 10px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 500;
          }
          .error-message button:hover {
            background: #e03d5d;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="model-evaluation">
      {/* Header */}
      <header className="page-header">
        <div className="header-content">
          <h1>Model Evaluation Dashboard</h1>
          <p>Comprehensive metrics and performance analysis for trained models</p>
        </div>
        <Link to="/" className="back-link">
          ← Back to Homepage
        </Link>
      </header>
      {/* Best Model Summary Section */}
      {bestMetrics && (
        <section className="summary-section">
          <h2>Best Model Metrics</h2>
          <p className="section-description">
            Performance metrics for the selected best model
          </p>
          <div className="metrics-grid">
            <div className="metric-card-wrapper">
              <MetricCard
                label="R² Score"
                value={formatMetricValue(bestMetrics.R2, 4)}
                color="#82ca9d"
                description={bestMetrics.R2 && bestMetrics.R2 >= 0.7 ? 'Good model fit' : 'Needs improvement'}
                metricKey="R2"
              />
              <MetricExplanation metric="R2" />
            </div>
            <div className="metric-card-wrapper">
              <MetricCard
                label="Mean Absolute Error (MAE)"
                value={formatMetricValue(bestMetrics.MAE, 4)}
                color="#fa456d"
                description={bestMetrics.MAE && bestMetrics.MAE <= 5 ? 'Low error' : 'High error'}
                metricKey="MAE"
              />
              <MetricExplanation metric="MAE" />
            </div>
            <div className="metric-card-wrapper">
              <MetricCard
                label="Root Mean Squared Error (RMSE)"
                value={formatMetricValue(bestMetrics.RMSE, 4)}
                color="#58b9f1"
                description={bestMetrics.RMSE && bestMetrics.RMSE <= 5 ? 'Low error' : 'High error'}
                metricKey="RMSE"
              />
              <MetricExplanation metric="RMSE" />
            </div>
          </div>
        </section>
      )}
      {/* Bar Chart Comparison */}
      <section className="charts-section">
        <h2>Model Metrics Comparison</h2>
        <p className="section-description">
          Comparing key metrics across all trained models
        </p>
        <div className="chart-card">
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, angle: -45, textAnchor: 'end' }}
                  interval={0}
                  height={80}
                />
                <YAxis
                  tickFormatter={(value) => value.toFixed(2)} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="R2" name="R² Score" fill="#82ca9d" radius={[4, 4, 0, 0]} />
                <Bar dataKey="MAE" name="MAE" fill="#fa456d" radius={[4, 4, 0, 0]} />
                <Bar dataKey="RMSE" name="RMSE" fill="#58b9f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* All Models Section */}
      <section className="models-section">
        <h2>All Trained Models</h2>
        <p className="section-description">
          Comparison of all models trained during the process
        </p>

        <div className="card">
          <div className="card-content">
            <div className="custom-table-wrapper">
              <table className="models-table">
                <thead>
                  <tr>
                    <th><b>Algorithm</b></th>
                    <th><b>MAE</b></th>
                    <th><b>RMSE</b></th>
                    <th><b>R²</b></th>
                    <th><b>Status</b></th>
                  </tr>
                </thead>
                <tbody>
                  {modelsArray.map((model, index) => {
                    let status = 'Baseline Performance';
                    if (model.isBest) {
                      status = 'Best Fit';
                    } else if (model.metrics.R2 && model.metrics.R2 >= 0.9) {
                      status = 'Perfect';
                    } else if (model.metrics.R2 && model.metrics.R2 >= 0.7) {
                      status = 'Good';
                    } else if (model.metrics.R2 && model.metrics.R2 < 0) {
                      status = 'Needs Improvement';
                    }

                    return (
                      <tr key={index}>
                        <td className="font-medium">{model.name}</td>
                        <td>{formatMetricValue(model.metrics.MAE, 4)}</td>
                        <td>{formatMetricValue(model.metrics.RMSE, 4)}</td>
                        <td>{formatMetricValue(model.metrics.R2, 4)}</td>
                        <td>
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${status === 'Perfect' ? 'bg-purple-100 text-purple-800' :
                            status === 'Best Fit' ? 'bg-green-100 text-green-800' :
                              status === 'Good' ? 'bg-blue-100 text-blue-800' :
                                status === 'Baseline Performance' ? 'bg-gray-100 text-gray-800' :
                                  'bg-red-100 text-red-800'
                            }`}>
                            {status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
      <style>{`
        .model-evaluation {
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

        .back-link {
          color: #fff;
          text-decoration: none;
          padding: 10px 20px;
          border: 2px solid rgba(255, 255, 255, 0.5);
          border-radius: 8px;
          transition: all 0.2s;
          font-weight: 500;
        }

        .back-link:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: #fff;
        }

        .models-section,
        .charts-section,
        .summary-section {
          margin-bottom: 32px;
        }

        .models-section h2,
        .charts-section h2,
        .summary-section h2 {
          font-size: 22px;
          font-weight: 700;
          margin-bottom: 8px;
          color: #333;
        }

        .section-description {
          color: #666;
          margin-bottom: 24px;
          font-size: 14px;
        }

        .metric-card-wrapper {
          display: flex;
          flex-direction: column;
        }

  .models-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .models-list .model-card {
          width: 100%;
        }
        .models-list .model-card .model-header {
          margin-bottom: 12px;
          padding: 10px 12px;
        }
        .models-list .model-card .model-metrics {
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }
        .models-list .model-card .model-metric {
          padding: 8px;
          background: #f8f9fa;
          border-radius: 6px;
        }
        .models-list .model-card .model-metric .metric-label {
          font-size: 10px;
          margin-bottom: 2px;
        }
        .models-list .model-card .model-metric .metric-value {
          font-size: 14px;
        }
        .models-list .model-card .algorithm-guide {
          margin-top: 10px;
        }
        .models-list .model-card .algorithm-header {
          padding: 8px 10px;
        }
        .models-list .model-card .algorithm-content {
          padding: 10px;
          gap: 8px;
        }
        .models-list .model-card .algorithm-section {
          padding: 4px 0;
        }
        .models-list .model-card .algorithm-section ul {
          margin: 2px 0 0 0;
        }
        .models-list .model-card .algorithm-section li {
          font-size: 11px;
          margin-bottom: 2px;
        }

        .charts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
          gap: 20px;
        }

        .chart-card {
          background: #fff;
          border-radius: 12px;
          padding: 24px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        }

        .chart-card h3 {
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 8px;
          color: #333;
        }

        .chart-description {
          font-size: 14px;
          color: #666;
          margin-bottom: 16px;
        }

        .chart-container {
          width: 100%;
        }

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
        }

        .card {
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 0;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        }

        .card-content {
          padding: 24px;
        }

        .custom-table-wrapper {
          width: 100%;
          overflow-x: auto;
        }

        .models-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
          table-layout: fixed;
        }

        .models-table thead {
          background: #f8f9fa;
        }

        .models-table th {
          padding: 12px 16px;
          text-align: left;
          font-weight: 600;
          color: #333;
          border-bottom: 2px solid #e5e7eb;
          white-space: nowrap;
        }

        .models-table tbody tr {
          border-bottom: 1px solid #e5e7eb;
          transition: background-color 0.15s;
        }

        .models-table tbody tr:hover {
          background-color: #f8f9fa;
        }

        .models-table tbody tr:last-child {
          border-bottom: none;
        }

        .models-table td {
          padding: 12px 16px;
          color: #4b5563;
        }

        .models-table td.font-medium {
          font-weight: 500;
          color: #111827;
        }
      `}</style>
    </div>
  );
}