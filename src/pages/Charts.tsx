import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ScatterChart, Scatter, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';

type ModelKey = 'linear' | 'lasso' | 'decisionTrees' | 'randomForest' | 'gradientBoost';

interface ModelOutputs {
    [key: string]: {
        y_true: number[];
        y_pred: number[];
        y_true_cat?: string[] | null;
        y_pred_cat?: string[] | null;
    };
}

interface MetricModel {
    model?: string;
    model_name?: string;
    MAE?: number;
    mae?: number;
    RMSE?: number;
    rmse?: number;
    R2?: number;
    r2?: number;
}

export function Charts() {
    const { user } = useAuth();
    const [selectedModel, setSelectedModel] = useState<ModelKey>('randomForest');
    const [modelOutputs, setModelOutputs] = useState<ModelOutputs>({});
    const [scatterPlotData, setScatterPlotData] = useState<any[]>([]);
    const [proficiencyDistribution, setProficiencyDistribution] = useState<any[]>([]);
    const [allMetrics, setAllMetrics] = useState<MetricModel[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const modelRes = await fetch('http://localhost:5000/model-predict');
                if (modelRes.ok) {
                    const modelData = await modelRes.json();
                    setModelOutputs(modelData);

                    const bestModelKey = Object.keys(modelData).reduce((best, key) => {
                        const current = modelData[key];
                        const bestModel = modelData[best];
                        if (!current || !current.y_true || !current.y_pred) return best;
                        if (!bestModel || !bestModel.y_true || !bestModel.y_pred) return key;

                        const yTrue = current.y_true;
                        const yPred = current.y_pred;
                        const meanY = yTrue.reduce((a: number, b: number) => a + b, 0) / yTrue.length;
                        const ssRes = yTrue.reduce((sum: number, val: number, i: number) => sum + Math.pow(val - yPred[i], 2), 0);
                        const ssTot = yTrue.reduce((sum: number, val: number) => sum + Math.pow(val - meanY, 2), 0);
                        const r2 = 1 - ssRes / ssTot;

                        const bestYTrue = bestModel.y_true;
                        const bestYPred = bestModel.y_pred;
                        const bestMeanY = bestYTrue.reduce((a: number, b: number) => a + b, 0) / bestYTrue.length;
                        const bestSsRes = bestYTrue.reduce((sum: number, val: number, i: number) => sum + Math.pow(val - bestYPred[i], 2), 0);
                        const bestSsTot = bestYTrue.reduce((sum: number, val: number) => sum + Math.pow(val - bestMeanY, 2), 0);
                        const bestR2 = 1 - bestSsRes / bestSsTot;

                        return r2 > bestR2 ? key : best;
                    }, Object.keys(modelData)[0] || 'randomForest');

                    setSelectedModel(bestModelKey as ModelKey);
                    updateCharts(modelData, bestModelKey);
                }

                const allMetricsRes = await fetch('http://localhost:5000/all-metrics');
                if (allMetricsRes.ok) {
                    const allMetricsData = await allMetricsRes.json();
                    setAllMetrics(allMetricsData.models || []);
                }
            } catch (error) {
                console.error('Failed to fetch data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    const updateCharts = (models: ModelOutputs, modelKey: string) => {
        const model = models[modelKey];
        if (model && model.y_true && model.y_pred) {
            const yTrue = model.y_true;
            const yPred = model.y_pred;

            setScatterPlotData(yTrue.map((actual: number, i: number) => ({
                actual: Math.round(actual * 10) / 10,
                predicted: Math.round((yPred[i] || 0) * 10) / 10
            })));

            const proficiencyBands = [
                'Not Proficient',
                'Low Proficient',
                'Nearly Proficient',
                'Proficient',
                'Highly Proficient'
            ];

            // Use pre-computed categorical arrays if available (they are string labels)
            const yTrueCat = model.y_true_cat || [];
            const yPredCat = model.y_pred_cat || [];

            let actualCounts: Record<string, number> = {
                'Not Proficient': 0,
                'Low Proficient': 0,
                'Nearly Proficient': 0,
                'Proficient': 0,
                'Highly Proficient': 0
            };
            let predictedCounts: Record<string, number> = {
                'Not Proficient': 0,
                'Low Proficient': 0,
                'Nearly Proficient': 0,
                'Proficient': 0,
                'Highly Proficient': 0
            };

            if (yTrueCat.length === yTrue.length && yPredCat.length === yPred.length) {
                // Use pre-computed categories (string labels)
                yTrueCat.forEach((label: string) => {
                    if (actualCounts.hasOwnProperty(label)) {
                        actualCounts[label]++;
                    }
                });
                yPredCat.forEach((label: string) => {
                    if (predictedCounts.hasOwnProperty(label)) {
                        predictedCounts[label]++;
                    }
                });
            } else {
                // Fallback: compute from raw scores using same thresholds as backend
                const getBandLabel = (score: number) => {
                    if (score >= 90) return 'Highly Proficient';
                    if (score >= 75) return 'Proficient';
                    if (score >= 50) return 'Nearly Proficient';
                    if (score >= 25) return 'Low Proficient';
                    return 'Not Proficient';
                };
                yTrue.forEach((score: number) => { actualCounts[getBandLabel(score)]++; });
                yPred.forEach((score: number) => { predictedCounts[getBandLabel(score)]++; });
            }

            setProficiencyDistribution(proficiencyBands.map(band => ({
                proficiency: band,
                actual: actualCounts[band] || 0,
                predicted: predictedCounts[band] || 0
            })));
        }
    };

    const handleModelChange = (value: string) => {
        const modelKey = value as ModelKey;
        setSelectedModel(modelKey);
        updateCharts(modelOutputs, modelKey);
    };

    const getModelR2 = (modelKey: string): number => {
        const model = allMetrics.find((m) => (m.model || m.model_name) === modelKey);
        return model ? (model.R2 || model.r2 || 0) : 0;
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Charts & Visualizations</h1>
                <p className="text-gray-600">
                    Explore interactive charts and visualizations of model performance, feature distributions, and prediction outcomes.
                </p>
            </div>

            {/* Model Selection */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                <div className="flex items-center gap-4">
                    <label htmlFor="model-select" className="text-sm font-medium text-gray-700">Select Model:</label>
                    <select
                        id="model-select"
                        value={selectedModel}
                        onChange={(e) => handleModelChange(e.target.value)}
                        className="w-[300px] px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                        {Object.keys(modelOutputs || {}).map((key) => (
                            <option key={key} value={key}>
                                {key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1').trim()}
                            </option>
                        ))}
                    </select>
                    <span className="text-sm text-gray-500">
                        {selectedModel && allMetrics.find((m: any) => (m.model || m.model_name) === selectedModel) && (
                            <>R²: {getModelR2(selectedModel).toFixed(3)}</>
                        )}
                    </span>
                </div>
            </div>

            {/* Actual vs. Predicted Scatter Plot */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                <div className="mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">Actual vs. Predicted Scatter Plot</h2>
                    <p className="text-sm text-gray-600">Comparison of actual NAT scores against predicted scores</p>
                </div>
                <div className="w-full h-[640px]">
                    {loading ? (
                        <div className="h-full flex items-center justify-center bg-gray-50 rounded-lg">
                            <p className="text-gray-500">Loading chart data...</p>
                        </div>
                    ) : scatterPlotData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={{ top: 40, right: 40, bottom: 40, left: 40 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" dataKey="actual" name="Actual MPS"
                                    label={{ value: 'Actual MPS', position: 'insideBottom', offset: -20 }}
                                    domain={[30, 100]} tickCount={8} />
                                <YAxis type="number" dataKey="predicted" name="Predicted MPS"
                                    label={{ value: 'Predicted MPS', angle: -90, position: 'insideLeft' }}
                                    domain={[30, 100]} tickCount={8} />
                                <RechartsTooltip
                                    cursor={{ strokeDasharray: '3 3' }}
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            return (
                                                <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                                                    <p className="text-sm font-medium">{`Actual: ${payload[0].payload.actual}`}</p>
                                                    <p className="text-sm font-medium">{`Predicted: ${payload[0].payload.predicted}`}</p>
                                                    <p className="text-sm text-gray-500">{`Error: ${(Math.abs(payload[0].payload.actual - payload[0].payload.predicted)).toFixed(1)}`}</p>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                <Legend wrapperStyle={{ paddingTop: '20px', paddingBottom: '10px' }} />
                                <Scatter name="Actual vs Predicted" data={scatterPlotData} fill="#3685e0" isAnimationActive={true} />
                                <Scatter name="Perfect Prediction Line"
                                    data={[{ actual: 30, predicted: 30 }, { actual: 100, predicted: 100 }]}
                                    fill="#ef4444" line stroke="#ef4444" shape="circle" isAnimationActive={false} />
                            </ScatterChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex items-center justify-center bg-gray-50 rounded-lg">
                            <p className="text-gray-500">No data available for scatter plot</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Proficiency Distribution */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                <div className="mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">Proficiency Distribution</h2>
                    <p className="text-sm text-gray-600">Actual vs. predicted proficiency level distribution</p>
                </div>
                <div className="w-full h-[640px]">
                    {loading ? (
                        <div className="h-full flex items-center justify-center bg-gray-50 rounded-lg">
                            <p className="text-gray-500">Loading chart data...</p>
                        </div>
                    ) : proficiencyDistribution.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={proficiencyDistribution} margin={{ top: 40, right: 40, left: 20, bottom: 80 }} barGap={0} barCategoryGap="20%">
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="proficiency" angle={-45} textAnchor="end" height={100} fontSize={12} />
                                <YAxis label={{ value: 'Number of Students', angle: -90, position: 'insideLeft' }}
                                    domain={[0, 'dataMax + 5']} tickCount={6} />
                                <RechartsTooltip
                                    cursor={{ fill: 'rgba(0, 0, 0, 0.05)' }}
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            return (
                                                <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                                                    {payload.map((entry: any, index: number) => (
                                                        <p key={index} className="text-sm" style={{ color: entry.color }}>
                                                            {`${entry.name}: ${entry.value}`}
                                                        </p>
                                                    ))}
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                <Legend wrapperStyle={{ paddingTop: '20px', paddingBottom: '10px' }} iconType="rect" iconSize={14} />
                                <Bar dataKey="actual" fill="#3b82f6" name="Actual" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="predicted" fill="#ef4444" name="Predicted" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex items-center justify-center bg-gray-50 rounded-lg">
                            <p className="text-gray-500">No data available for proficiency distribution</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
