import { useState, useEffect, useMemo } from 'react';
import {
    ScatterChart, Scatter, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
    Legend, ResponsiveContainer
} from 'recharts';
import { API_BASE_URL } from '../config';

type ModelKey = string;

interface ModelOutput {
    y_true: number[];
    y_pred: number[];
    y_true_cat?: string[] | null;
    y_pred_cat?: string[] | null;
}
interface ModelOutputs { [key: string]: ModelOutput; }

interface MetricModel {
    model?: string;
    model_name?: string;
    MAE?: number; mae?: number;
    RMSE?: number; rmse?: number;
    R2?: number; r2?: number;
}

const PROFICIENCY_BANDS = [
    'Not Proficient', 'Low Proficient',
    'Nearly Proficient', 'Proficient', 'Highly Proficient'
] as const;

const TooltipIcon = ({ text }: { text: string }) => {
    const [show, setShow] = useState(false);

    return (
        <span className="relative inline-block ml-2">
            <span
                className="material-icons-round text-gray-400 text-xs text-base cursor-help"
                onMouseEnter={() => setShow(true)}
                onMouseLeave={() => setShow(false)}
                role="button"
                tabIndex={0}
                aria-label="Information"
            >
                help_outline
            </span>
            {show && (
                <div className="absolute z-50 w-72 p-3 mt-2 text-sm bg-white border border-gray-200 rounded-lg shadow-lg -left-20">
                    {text}
                </div>
            )}
        </span>
    );
};

const getBandLabel = (score: number) => {
    if (score >= 90) return 'Highly Proficient';
    if (score >= 75) return 'Proficient';
    if (score >= 50) return 'Nearly Proficient';
    if (score >= 25) return 'Low Proficient';
    return 'Not Proficient';
};

const computeR2 = (yTrue: number[], yPred: number[]) => {
    const mean = yTrue.reduce((a, b) => a + b, 0) / yTrue.length;
    const ssRes = yTrue.reduce((s, v, i) => s + (v - yPred[i]) ** 2, 0);
    const ssTot = yTrue.reduce((s, v) => s + (v - mean) ** 2, 0);
    return 1 - ssRes / ssTot;
};

const buildCharts = (model: ModelOutput) => {
    const { y_true, y_pred, y_true_cat, y_pred_cat } = model;

    const scatter = y_true.map((actual, i) => ({
        actual: Math.round(actual * 10) / 10,
        predicted: Math.round((y_pred[i] ?? 0) * 10) / 10,
    }));

    const actualCounts = Object.fromEntries(PROFICIENCY_BANDS.map(b => [b, 0]));
    const predictedCounts = Object.fromEntries(PROFICIENCY_BANDS.map(b => [b, 0]));

    const useCat = y_true_cat?.length === y_true.length && y_pred_cat?.length === y_pred.length;
    if (useCat) {
        y_true_cat!.forEach(l => { if (l in actualCounts) actualCounts[l]++; });
        y_pred_cat!.forEach(l => { if (l in predictedCounts) predictedCounts[l]++; });
    } else {
        y_true.forEach(s => actualCounts[getBandLabel(s)]++);
        y_pred.forEach(s => predictedCounts[getBandLabel(s)]++);
    }

    const distribution = PROFICIENCY_BANDS.map(band => ({
        proficiency: band,
        actual: actualCounts[band],
        predicted: predictedCounts[band],
    }));

    return { scatter, distribution };
};

export function Charts() {
    const [selectedModel, setSelectedModel] = useState<ModelKey>('randomForest');
    const [modelOutputs, setModelOutputs] = useState<ModelOutputs>({});
    const [allMetrics, setAllMetrics] = useState<MetricModel[]>([]);
    const [loading, setLoading] = useState(true);

     useEffect(() => {
          const fetchData = async () => {
              setLoading(true);
              try {
                  const [modelRes, metricsRes] = await Promise.all([
                      fetch(`${API_BASE_URL}/model-predict`),
                      fetch(`${API_BASE_URL}/all-metrics`),
                  ]);

                const [modelData, metricsData] = await Promise.all([
                    modelRes.ok ? modelRes.json() as Promise<ModelOutputs> : Promise.resolve({} as ModelOutputs),
                    metricsRes.ok ? metricsRes.json() : { models: [] },
                ]);

                setModelOutputs(modelData);
                setAllMetrics(metricsData.models ?? []);

                const keys = Object.keys(modelData);
                const bestKey = keys.reduce((best, key) => {
                    const m = modelData[key];
                    if (!m?.y_true?.length) return best;
                    const bm = modelData[best];
                    if (!bm?.y_true?.length) return key;
                    return computeR2(m.y_true, m.y_pred) > computeR2(bm.y_true, bm.y_pred) ? key : best;
                }, keys[0] ?? 'randomForest');

                setSelectedModel(bestKey);
            } catch (err) {
                console.error('Failed to fetch data:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const { scatterPlotData, proficiencyDistribution } = useMemo(() => {
        const model = modelOutputs[selectedModel];
        if (!model?.y_true?.length) return { scatterPlotData: [], proficiencyDistribution: [] };
        const { scatter, distribution } = buildCharts(model);
        return { scatterPlotData: scatter, proficiencyDistribution: distribution };
    }, [modelOutputs, selectedModel]);

    const metricsMap = useMemo(() =>
        Object.fromEntries(allMetrics.map(m => [m.model ?? m.model_name, m])),
        [allMetrics]
    );

    const r2Val = metricsMap[selectedModel]?.R2 ?? metricsMap[selectedModel]?.r2 ?? null;

    const modelLabel = (key: string) =>
        key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1').trim();

    const LoadingBox = () => (
        <div className="h-full flex items-center justify-center bg-gray-50 rounded-lg">
            <p className="text-gray-500">Loading chart data...</p>
        </div>
    );

    const EmptyBox = ({ msg }: { msg: string }) => (
        <div className="h-full flex items-center justify-center bg-gray-50 rounded-lg">
            <p className="text-gray-500">{msg}</p>
        </div>
    );

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
                    <label htmlFor="model-select" className="text-sm font-medium text-gray-700">
                        Select Model:
                    </label>
                    <select
                        id="model-select"
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        className="w-[300px] px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                        {Object.keys(modelOutputs).map((key) => (
                            <option key={key} value={key}>{modelLabel(key)}</option>
                        ))}
                    </select>
                    {r2Val !== null && (
                        <span className="text-sm text-gray-500">R²: {r2Val.toFixed(3)}</span>
                    )}
                </div>
            </div>

            {/* Scatter Plot */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                <div className="mb-4">
                    <h2 className="text-lg font-semibold text-gray-900 inline-flex items-center">
                        Actual vs. Predicted Scatter Plot
                        <TooltipIcon text="Each dot represents one learner. The red line shows where perfect predictions would fall. Dots far from the line indicate cases where the model's prediction differed significantly from the actual NAT score." />
                    </h2>
                    <p className="text-sm text-gray-600">Comparison of actual NAT scores against predicted scores</p>
                </div>
                <div className="w-full h-[640px]">
                    {loading ? <LoadingBox /> : scatterPlotData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={{ top: 40, right: 40, bottom: 40, left: 40 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis
                                    type="number" dataKey="actual" name="Actual MPS"
                                    label={{ value: 'Actual MPS', position: 'insideBottom', offset: -20 }}
                                    domain={[30, 100]} tickCount={8}
                                />
                                <YAxis
                                    type="number" dataKey="predicted" name="Predicted MPS"
                                    label={{ value: 'Predicted MPS', angle: -90, position: 'insideLeft' }}
                                    domain={[30, 100]} tickCount={8}
                                />
                                <RechartsTooltip
                                    cursor={{ strokeDasharray: '3 3' }}
                                    content={({ active, payload }) => {
                                        if (!active || !payload?.length) return null;
                                        const { actual, predicted } = payload[0].payload;
                                        return (
                                            <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                                                <p className="text-sm font-medium">{`Actual: ${actual}`}</p>
                                                <p className="text-sm font-medium">{`Predicted: ${predicted}`}</p>
                                                <p className="text-sm text-gray-500">{`Error: ${Math.abs(actual - predicted).toFixed(1)}`}</p>
                                            </div>
                                        );
                                    }}
                                />
                                <Legend wrapperStyle={{ paddingTop: '20px', paddingBottom: '10px' }} />
                                <Scatter name="Actual vs Predicted" data={scatterPlotData} fill="#3685e0" isAnimationActive={true} />
                                <Scatter
                                    name="Perfect Prediction Line"
                                    data={[{ actual: 30, predicted: 30 }, { actual: 100, predicted: 100 }]}
                                    fill="#ef4444" line stroke="#ef4444" shape="circle" isAnimationActive={false}
                                />
                            </ScatterChart>
                        </ResponsiveContainer>
                    ) : <EmptyBox msg="No data available for scatter plot" />}
                </div>
            </div>

            {/* Proficiency Distribution */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                <div className="mb-4">
                    <h2 className="text-lg font-semibold text-gray-900 inline-flex items-center">
                        Proficiency Distribution
                        <TooltipIcon text="Compares how many learners actually fell into each proficiency level versus how many the model predicted. A tall red bar next to a shorter blue bar in the same category means the model over-predicted that level." />
                    </h2>
                    <p className="text-sm text-gray-600">Actual vs. predicted proficiency level distribution</p>
                </div>
                <div className="w-full h-[640px]">
                    {loading ? <LoadingBox /> : proficiencyDistribution.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={proficiencyDistribution}
                                margin={{ top: 40, right: 40, left: 20, bottom: 80 }}
                                barGap={0} barCategoryGap="20%"
                            >
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="proficiency" angle={-45} textAnchor="end" height={100} fontSize={12} />
                                <YAxis
                                    label={{ value: 'Number of Students', angle: -90, position: 'insideLeft' }}
                                    domain={[0, 'dataMax + 5']} tickCount={6}
                                />
                                <RechartsTooltip
                                    cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                                    content={({ active, payload }) => {
                                        if (!active || !payload?.length) return null;
                                        return (
                                            <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                                                {payload.map((entry: any, i: number) => (
                                                    <p key={i} className="text-sm" style={{ color: entry.color }}>
                                                        {`${entry.name}: ${entry.value}`}
                                                    </p>
                                                ))}
                                            </div>
                                        );
                                    }}
                                />
                                <Legend wrapperStyle={{ paddingTop: '20px', paddingBottom: '10px' }} iconType="rect" iconSize={14} />
                                <Bar dataKey="actual" fill="#3b82f6" name="Actual" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="predicted" fill="#ef4444" name="Predicted" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : <EmptyBox msg="No data available for proficiency distribution" />}
                </div>
            </div>
        </div>
    );
}