import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PredictionResult as ApiPredictionResult } from '../services/api';
import { getFriendlyFeatureName, getCategoryColor, getFeatureInsight, featureExplanations } from './Results';

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

export function ClassSummary() {
    const navigate = useNavigate();
    const location = useLocation();
    const [isFeatureDashboardOpen, setIsFeatureDashboardOpen] = useState(false);

    // Load predictions from navigation state
    const state = location.state as ClassSummaryState | null;
    const predictions = state?.predictions || [];
    const fileName = state?.fileName || 'Dataset';
    const sessionName = state?.sessionName || '';

    // Calculate statistics
    const totalPredictions = predictions.length;
    const passedCount = predictions.filter((p) => (p.proficiency?.code ?? 0) >= 2).length;
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

    // Calculate aggregated feature importance
    const aggregatedFeatureImportance = React.useMemo(() => {
        if (!predictions.length || !predictions[0]?.explanation?.features) {
            return [];
        }

        const featureMap = new Map<string, AggregatedFeature>();

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

                {/* Summary Statistics */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <div className="bg-white rounded-2xl shadow-lg p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-500">Total Predictions</p>
                                <p className="text-3xl font-bold text-gray-900 mt-1">{totalPredictions}</p>
                            </div>
                            <div className="h-12 w-12 rounded-xl bg-blue-100 flex items-center justify-center">
                                <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 116 0zm6 3a2 2 0 11-4 0 2 2 0 114 0zM7 10a2 2 0 11-4 0 2 2 0 114 0z" />
                                </svg>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-lg p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-500">Average MPS</p>
                                <p className="text-3xl font-bold text-gray-900 mt-1">{averageScore.toFixed(1)}</p>
                            </div>
                            <div className="h-12 w-12 rounded-xl bg-purple-100 flex items-center justify-center">
                                <span className="material-icons-round text-sm">score</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-lg p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-500">Passed</p>
                                <p className="text-3xl font-bold text-green-600 mt-1">{passedCount}</p>
                            </div>
                            <div className="h-12 w-12 rounded-xl bg-green-100 flex items-center justify-center">
                                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-lg p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-500">Failed</p>
                                <p className="text-3xl font-bold text-red-600 mt-1">{failedCount}</p>
                            </div>
                            <div className="h-12 w-12 rounded-xl bg-red-100 flex items-center justify-center">
                                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Score Distribution */}
                <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Score Distribution</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl">
                            <p className="text-sm font-medium text-blue-600">Highest Score</p>
                            <p className="text-2xl font-bold text-blue-700 mt-1">{highestScore.toFixed(1)}</p>
                        </div>
                        <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl">
                            <p className="text-sm font-medium text-purple-600">Average Score</p>
                            <p className="text-2xl font-bold text-purple-700 mt-1">{averageScore.toFixed(1)}</p>
                        </div>
                        <div className="p-4 bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl">
                            <p className="text-sm font-medium text-orange-600">Lowest Score</p>
                            <p className="text-2xl font-bold text-orange-700 mt-1">{lowestScore.toFixed(1)}</p>
                        </div>
                    </div>
                </div>

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
                                            const categoryInfo = featureExplanations[item.feature];
                                            const categoryColor = getCategoryColor('Student Profile');

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
                                                        <span
                                                            className="inline-block px-2 py-0.5 text-xs rounded-full text-white"
                                                            style={{ backgroundColor: categoryColor }}
                                                        >
                                                            {categoryInfo?.category || 'Unknown'}
                                                        </span>
                                                        <span className={`text-xs ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                                                            {isPositive ? '↑ Increases prediction' : '↓ Decreases prediction'}
                                                        </span>
                                                    </div>
                                                    {/* Actionable Insight for Non-Technical Users */}
                                                    {(() => {
                                                        const insight = getFeatureInsight(item.feature, item.avgShap, isPositive);
                                                        return (
                                                            <div className="mt-2 p-3 rounded-lg bg-gray-50 border border-gray-200 text-sm">
                                                                <div className="flex items-start gap-2">
                                                                    <span className={`mt-0.5 ${isPositive ? 'text-green-600' : 'text-orange-500'}`}>
                                                                        {isPositive ? '✓' : '⚡'}
                                                                    </span>
                                                                    <div>
                                                                        <p className="text-gray-700 font-medium">{insight.actionMessage}</p>
                                                                        <div className="mt-2 flex items-center gap-2 text-xs">
                                                                            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">
                                                                                📚 {insight.relatedGrade}
                                                                            </span>
                                                                            <span className="text-blue-600 font-medium">
                                                                                📋 Study Plan:
                                                                            </span>
                                                                            <span className="text-gray-600">
                                                                                {insight.studyPlanTip}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}
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
                        onClick={() => navigate('/home')}
                        className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition flex items-center space-x-2"
                    >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        <span>Analyze Another Dataset</span>
                    </button>
                </div>
            </div>
        </div>
    );
}