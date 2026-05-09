import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { API_BASE_URL } from '../config';

interface FeatureImportanceItem {
    feature: string;
    importance: number;
}

// Tooltip content explaining feature importance
const featureImportanceTooltip =
    "Feature importance score – " +
    "Indicates how much these variables contributed to the model's predictions relative to all other inputs. " +
    "A score of 0.21 means this feature accounted for roughly 21% of the model's decision-making. " +
    "Higher scores identify stronger predictors of NAT performance.";


export function FeatureImportance() {
    const [featureImportance, setFeatureImportance] = useState<FeatureImportanceItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchFeatureImportance = async () => {
            setLoading(true);
            try {
                const response = await fetch(`${API_BASE_URL}/feature-importance`);
                if (response.ok) {
                    const data = await response.json();
                    let fiArray: FeatureImportanceItem[] = [];

                    if (data.features && data.importances && data.sorted_indices) {
                        fiArray = (data.sorted_indices as number[]).map((idx: number) => ({
                            feature: data.features[idx],
                            importance: parseFloat(data.importances[idx]) || 0,
                        }));
                    } else {
                        fiArray = Object.entries(data)
                            .filter(([key]) => !['features', 'importances', 'sorted_indices'].includes(key))
                            .map(([feature, importance]) => ({
                                feature: String(feature),
                                importance: parseFloat(String(importance)) || 0,
                            }))
                            .sort((a, b) => b.importance - a.importance);
                    }
                    setFeatureImportance(fiArray);
                }
            } catch (error) {
                console.error('Failed to fetch feature importance:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchFeatureImportance();
    }, []);

    const sortedData = [...featureImportance].sort((a, b) => b.importance - a.importance);
    const maxImportance = Math.max(...featureImportance.map(f => f.importance), 0);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Feature Importance</h1>
                <p className="text-gray-600">
                    Analyze which features contribute most to the model's predictions. View SHAP values, feature rankings, and detailed explanations.
                </p>
            </div>

            {/* Feature Importance Bar Chart */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                <div className="mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">Feature Importance Analysis</h2>

                    <p className="text-sm text-gray-600">
                        All {featureImportance.length} features ranked by their contribution to NAT score predictions (sorted descending)
                    </p>
                </div>
                <div className="w-full" style={{ height: `${Math.max(featureImportance.length * 36 + 80, 400)}px` }}>
                    {loading ? (
                        <div className="h-full flex items-center justify-center bg-gray-50 rounded-lg">
                            <p className="text-gray-500">Loading feature importance data...</p>
                        </div>
                    ) : featureImportance.length === 0 ? (
                        <div className="h-full flex items-center justify-center bg-gray-50 rounded-lg">
                            <p className="text-gray-500">Feature importance visualization will appear here</p>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                layout="vertical"
                                data={sortedData}
                                margin={{ top: 10, right: 40, left: 10, bottom: 30 }}
                                barCategoryGap="20%"
                            >
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                <XAxis
                                    type="number"
                                    domain={[0, (dataMax: number) => Math.ceil(dataMax * 10) / 10]}
                                    tickCount={12}
                                    tickFormatter={(v) => v.toFixed(2)}
                                    label={{ value: 'Importance Score', position: 'insideBottom', offset: -15 }}
                                    tick={{ fontSize: 12 }}
                                />
                                <YAxis
                                    type="category"
                                    dataKey="feature"
                                    width={150}
                                    tick={{ fontSize: 11, fill: '#374151' }}
                                    tickLine={false}
                                />
                                <Tooltip
                                    formatter={(value: any) => [Number(value).toFixed(8), 'Importance']}
                                    contentStyle={{ fontSize: 12, borderRadius: 6 }}
                                />
                                <Bar
                                    dataKey="importance"
                                    name="Importance"
                                    radius={[0, 4, 4, 0]}
                                    isAnimationActive={true}
                                    label={{ position: 'right', formatter: (v: any) => Number(v).toFixed(3), fontSize: 11, fill: '#374151' }}
                                >
                                    {sortedData.map((_entry, index, arr) => {
                                        const ratio = 1 - index / Math.max(arr.length - 1, 1);
                                        const r = Math.round(59 + (186 - 59) * (1 - ratio));
                                        const g = Math.round(130 + (230 - 130) * (1 - ratio));
                                        return <Cell key={`cell-${index}`} fill={`rgb(${r},${g},246)`} />;
                                    })}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            {/* Feature Importance Info Tooltip */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                <div className="mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">Understanding Feature Importance</h2>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                        <span className="material-icons-round text-blue-500 mt-0.5 text-lg">info_outline</span>
                        <p className="text-sm text-blue-800 leading-relaxed">{featureImportanceTooltip}</p>
                    </div>
                </div>
            </div>

            {/* Top 5 Most Important Features */}
            {!loading && featureImportance.length > 0 && (
                <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                    <div className="mb-4">
                        <h2 className="text-lg font-semibold text-gray-900">Top 5 Most Important Features</h2>
                        <p className="text-sm text-gray-600">Features with the highest predictive contribution</p>
                    </div>
                    <div className="space-y-4">
                        {sortedData.slice(0, 5).map((item, index) => (
                            <div key={item.feature} className="flex items-center gap-4">
                                <div className="bg-blue-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-xs font-bold flex-shrink-0">
                                    {index + 1}
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center justify-between mb-1">
                                        <p className="font-semibold text-sm text-gray-800">{item.feature}</p>
                                        <span className="text-xs font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                                            {item.importance.toFixed(4)}
                                        </span>
                                    </div>
                                    <div className="bg-sky-100 rounded-full h-2.5">
                                        <div
                                            className="bg-sky-600 h-2.5 rounded-full transition-all duration-700"
                                            style={{ width: `${(item.importance / maxImportance) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}