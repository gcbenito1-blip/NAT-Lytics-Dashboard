import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PredictionResult as ApiPredictionResult, getProficiencyLabels } from '../services/api';
import { getFriendlyFeatureName, } from './Results';
import type { ProficiencyBand } from '../services/api';

interface ClassSummaryState {
  predictions: ApiPredictionResult[];
  fileName?: string;
  sessionName?: string;
}

interface AggregatedFeature {
  feature: string;
  avgShap: number;
  avgAbsShap: number;
  count: number;
  positiveCount: number;
  negativeCount: number;
}

const ProficiencyDistributionChart = ({ predictions, proficiencyBands }: {
  predictions: ApiPredictionResult[],
  proficiencyBands: ProficiencyBand[]
}) => {
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

  // Calculate distribution with safety checks
  const distribution = useMemo(() => {
    // Return empty array if no predictions or no proficiency bands
    if (!predictions.length || !proficiencyBands.length) {
      return [];
    }

    const counts: Record<number, { count: number; band: ProficiencyBand | null }> = {};

    // Initialize counts for all proficiency bands
    proficiencyBands.forEach(band => {
      counts[band.code] = { count: 0, band };
    });

    // Count predictions by proficiency code
    predictions.forEach(pred => {
      const code = pred.proficiency?.code;
      if (code !== undefined && counts[code]) {
        counts[code].count++;
      }
    });

    // Convert to array and calculate percentages
    const total = predictions.length;
    return Object.values(counts)
      .filter(item => item.count > 0) // Only show bands with at least one student
      .map(item => ({
        ...item,
        percentage: total > 0 ? (item.count / total) * 100 : 0,
      }))
      .sort((a, b) => (a.band?.code || 0) - (b.band?.code || 0));
  }, [predictions, proficiencyBands]);

  // Don't render if no distribution data
  if (distribution.length === 0) {
    return null;
  }

  const maxCount = Math.max(...distribution.map(d => d.count), 1);

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Proficiency Distribution</h2>
        <p className="text-sm text-gray-500 mb-6">
          Distribution of students across proficiency levels based on predicted MPS scores
        </p>
      </div>

      {/* Bar Chart */}
      <div className="space-y-4">
        {distribution.map((item, idx) => {
          const band = item.band;
          if (!band) return null;

          const barHeight = (item.count / maxCount) * 100;
          const isHovered = hoveredBar === idx;

          return (
            <div key={band.code} className="relative">
              {/* Label Row */}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: band.color }}
                  />
                  <span className="text-sm font-medium text-gray-700">
                    {band.label}
                  </span>
                  <span className="text-xs text-gray-400">
                    ({band.range})
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-900">
                    {item.count}
                  </span>
                  <span className="text-xs text-gray-500 min-w-[45px]">
                    ({item.percentage.toFixed(1)}%)
                  </span>
                </div>
              </div>

              {/* Bar */}
              <div
                className="relative group"
                onMouseEnter={() => setHoveredBar(idx)}
                onMouseLeave={() => setHoveredBar(null)}
              >
                <div className="w-full bg-gray-100 rounded-full h-8 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out flex items-center justify-end px-3"
                    style={{
                      width: `${item.percentage}%`,
                      backgroundColor: band.color,
                      opacity: isHovered ? 0.9 : 1,
                    }}
                  >
                    {item.percentage >= 15 && (
                      <span className="text-xs font-medium text-white">
                        {item.percentage.toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>

                {/* Tooltip on hover */}
                {isHovered && item.percentage < 15 && (
                  <div className="absolute -top-8 right-0 bg-gray-800 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap">
                    {item.percentage.toFixed(1)}% ({item.count} students)
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary Stats - Only show if we have distribution data */}
      {distribution.length > 0 && (
        <div className="mt-6 pt-4 border-t border-gray-100 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500">Most Common Level</p>
            <p className="text-sm font-semibold text-gray-900">
              {distribution.reduce((a, b) => a.count > b.count ? a : b).band?.label || 'N/A'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Least Common Level</p>
            <p className="text-sm font-semibold text-gray-900">
              {
                distribution.length <= 1
                  ? 'N/A'
                  : (distribution.reduce((a, b) => a.count < b.count ? a : b).band?.label || 'N/A')
              }
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">At or Above Proficient</p>
            <p className="text-sm font-semibold text-green-600">
              {predictions.filter(p => (p.proficiency?.code ?? 0) >= 3).length} students
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Below Proficient</p>
            <p className="text-sm font-semibold text-orange-600">
              {predictions.filter(p => (p.proficiency?.code ?? 0) <= 2).length} students
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export function ClassSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isFeatureDashboardOpen, setIsFeatureDashboardOpen] = useState(true);
  const [proficiencyBands, setProficiencyBands] = useState<ProficiencyBand[]>([]);

  // Load proficiency bands
  useEffect(() => {
    getProficiencyLabels()
      .then((res) => setProficiencyBands(res.bands))
      .catch(() => setProficiencyBands([]));
  }, []);


  // Helper: get band for a score
  const getBandForScore = (score: number): ProficiencyBand | null => {
    for (const band of proficiencyBands) {
      const m = band.range.match(/^(\d+)[-–](\d+)$/);
      if (m) {
        const lo = parseInt(m[1]);
        const hi = parseInt(m[2]);
        if (score >= lo && score <= hi) return band;
      }
    }
    return null;
  };;

  // Load predictions from navigation state
  const state = location.state as ClassSummaryState | null;
  const predictions = state?.predictions || [];
  const fileName = state?.fileName || 'Dataset';
  const sessionName = state?.sessionName || '';

  // Calculate statistics
  const totalPredictions = predictions.length;
  const passedCount = predictions.filter((p) => (p.proficiency?.code ?? 0) >= 3).length;
  const failedCount = totalPredictions - passedCount;
  const averageScore = totalPredictions > 0
    ? predictions.reduce((sum, p) => sum + p.prediction, 0) / totalPredictions
    : 0;
  const highestScore = totalPredictions > 0
    ? Math.max(...predictions.map((p) => p.prediction))
    : 0;
  const lowestScore = totalPredictions > 0
    ? Math.min(...predictions.map((p) => p.prediction))
    : 0;

  const avgBand = getBandForScore(averageScore);
  const avgColor = avgBand?.color || '#6b7280';
  const aggregatedFeatureImportance = React.useMemo(() => {
    if (!predictions.length || !predictions[0]?.explanation?.features) {
      return [];
    }

    const featureMap = new Map<string, AggregatedFeature>();

    {
      proficiencyBands.length > 0 && predictions.length > 0 && (
        <ProficiencyDistributionChart
          predictions={predictions}
          proficiencyBands={proficiencyBands}
        />
      )
    }
    predictions.forEach(pred => {
      if (!pred.explanation?.features) return;

      pred.explanation.features.forEach((shapFeature: { feature: string; shap_value: number }) => {
        const { feature, shap_value } = shapFeature;

        if (!featureMap.has(feature)) {
          featureMap.set(feature, {
            feature,
            avgShap: 0,
            avgAbsShap: 0,
            count: 0,
            positiveCount: 0,
            negativeCount: 0
          });
        }

        const current = featureMap.get(feature)!;
        current.count++;
        current.avgShap += shap_value;
        current.avgAbsShap += Math.abs(shap_value);
        if (shap_value > 0) {
          current.positiveCount++;
        } else {
          current.negativeCount++;
        }
      });
    });

    const aggregated = Array.from(featureMap.values()).map(item => ({
      ...item,
      avgShap: item.avgShap / item.count,
      avgAbsShap: item.avgAbsShap / item.count
    }));

    return aggregated.sort((a, b) => b.avgAbsShap - a.avgAbsShap);
  }, [predictions]);

  if (predictions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="rounded-full bg-yellow-100 w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <svg className="h-8 w-8 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">No Class Data Available</h2>
          <p className="text-gray-600 mb-6">
            Please run predictions first to view the class summary.
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {sessionName || fileName} - Class Summary
              </h1>
              <p className="text-gray-600 mt-1">
                Aggregated view of {totalPredictions} student predictions
              </p>
            </div>
            <button
              onClick={() => navigate('/prediction-table', { state: { predictions, fileName, sessionName } })}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              View Detailed Results
            </button>
          </div>
        </header>

        {/* All Statistics in a Single Responsive Grid */}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2 mb-8">
          {/* Total Learners */}
          <div className="bg-white rounded-2xl shadow-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500">Total Learners</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{totalPredictions}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Highest MPS */}
          <div className="bg-white rounded-2xl shadow-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500">Highest MPS</p>
                <p className="text-2xl font-bold text-blue-600 mt-1">{highestScore.toFixed(1)}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
            </div>
          </div>

          {/* Average MPS */}
          <div className="bg-white rounded-2xl shadow-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500">Average MPS</p>
                <p className="text-2xl font-bold mt-1" style={{ color: avgColor }}>
                  {averageScore.toFixed(1)}
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: avgColor + '20' }}>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: avgColor }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Lowest MPS */}
          <div className="bg-white rounded-2xl shadow-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500">Lowest MPS</p>
                <p className="text-2xl font-bold text-orange-600 mt-1">{lowestScore.toFixed(1)}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-orange-100 flex items-center justify-center">
                <svg className="h-5 w-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                </svg>
              </div>
            </div>
          </div>

          {/* Passed */}
          <div className="bg-white rounded-2xl shadow-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500">Passed</p>
                <p className="text-2xl font-bold text-green-600 mt-1">{passedCount}</p>
                <p className="text-xs text-gray-500">{totalPredictions > 0 ? ((passedCount / totalPredictions) * 100).toFixed(0) : 0}%</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-green-100 flex items-center justify-center">
                <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Failed */}
          <div className="bg-white rounded-2xl shadow-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500">Failed</p>
                <p className="text-2xl font-bold text-red-600 mt-1">{failedCount}</p>
                <p className="text-xs text-gray-500">{totalPredictions > 0 ? ((failedCount / totalPredictions) * 100).toFixed(0) : 0}%</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center">
                <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        <ProficiencyDistributionChart
          predictions={predictions}
          proficiencyBands={proficiencyBands}
        />

        {/* Aggregated Feature Importance Dashboard */}
        {predictions[0]?.explanation && predictions[0].explanation.top_drivers && predictions[0].explanation.top_drivers.length > 0 && (
          <div className="feature-dashboard bg-white rounded-2xl shadow-lg p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Feature Importance Dashboard</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Aggregated feature importance based on SHAP values from all {totalPredictions} predictions
                </p>
              </div>
              <button
                onClick={() => setIsFeatureDashboardOpen(!isFeatureDashboardOpen)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
              >
                <svg
                  className={`h-5 w-5 transition-transform ${isFeatureDashboardOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                {isFeatureDashboardOpen ? 'Collapse' : 'Expand'}
              </button>
            </div>

            {/* What is SHAP? Help Section */}
            <div className="mb-4">
              <details className="group">
                <summary className="flex items-center gap-2 cursor-pointer text-sm text-blue-600 hover:text-blue-800">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium">What are SHAP values?</span>
                  <svg className="h-4 w-4 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <div className="mt-3 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-100">
                  <div className="space-y-3 text-sm text-gray-700">
                    <p>
                      <strong className="text-blue-800">SHAP (SHapley Additive exPlanations)</strong> is a method that explains how each feature contributes to a prediction. Think of it as a "scorecard" that shows which factors pushed the prediction up or down.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-white/60 p-3 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="w-3 h-3 rounded-full bg-green-500"></span>
                          <span className="font-semibold text-green-700">Positive Impact (↑)</span>
                        </div>
                        <p className="text-xs text-gray-600">
                          These factors helped increase the predicted score. For example, strong past grades in Math would push the prediction higher.
                        </p>
                      </div>
                      <div className="bg-white/60 p-3 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="w-3 h-3 rounded-full bg-red-500"></span>
                          <span className="font-semibold text-red-700">Negative Impact (↓)</span>
                        </div>
                        <p className="text-xs text-gray-600">
                          These factors contributed to lowering the predicted score. For example, lower grades in previous years would push the prediction lower.
                        </p>
                      </div>
                    </div>
                    <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100">
                      <p className="text-xs text-yellow-800">
                        <strong className="font-semibold">📚 Important:</strong> Most features shown are from historical academic data (past grades from Grades 1-5). These are records of past performance and cannot be changed, but they help predict future outcomes so teachers can provide appropriate support.
                      </p>
                    </div>
                  </div>
                </div>
              </details>
            </div>

            {isFeatureDashboardOpen && (
              <>
                {/* Top Feature Importance Bar Chart */}
                <div className="mb-8">
                  <h3 className="text-md font-medium text-gray-700 mb-4">Top Contributing Features</h3>
                  <div className="space-y-3">
                    {aggregatedFeatureImportance.slice(0, 10).map((item, idx) => {
                      const maxAbs = Math.max(...aggregatedFeatureImportance.map(f => Math.abs(f.avgAbsShap)), 0.01);
                      const width = maxAbs > 0 ? (Math.abs(item.avgAbsShap) / maxAbs) * 100 : 0;
                      const isPositive = item.avgShap > 0;

                      return (
                        <div key={idx} className="relative">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-gray-700">
                              {getFriendlyFeatureName(item.feature)}
                            </span>
                            <span className="text-sm text-gray-500">
                              Avg |SHAP|: {item.avgAbsShap.toFixed(3)}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                            <div
                              className={`h-3 rounded-full transition-all duration-500 ${isPositive ? 'bg-green-500' : 'bg-red-500'}`}
                              style={{ width: `${width}%` }}
                            />
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-xs ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                              {isPositive ? '↑ Increases prediction' : '↓ Decreases prediction'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Back to Dashboard Button */}
        <div className="flex justify-center">
          <button
            onClick={() => navigate('/dashboard')}
            className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition flex items-center space-x-2"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Analyze Different Dataset</span>
          </button>
        </div>
      </div>
    </div>
  );
}