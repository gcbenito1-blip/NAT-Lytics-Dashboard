import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface SchoolMAE {
    School: string;
    MAE: number;
}

interface SchoolProficiency {
    School: string;
    Actual_Not_Proficient: number;
    Actual_Low_Proficient: number;
    Actual_Nearly_Proficient: number;
    Actual_Proficient: number;
    Actual_Highly_Proficient: number;
    Pred_Not_Proficient: number;
    Pred_Low_Proficient: number;
    Pred_Nearly_Proficient: number;
    Pred_Proficient: number;
    Pred_Highly_Proficient: number;
}

interface SchoolMetric {
    School: string;
    Student_Count: number;
    Avg_Actual_MPS: number;
    Avg_Predicted_MPS: number;
    Avg_Bias: number;
    MAE: number;
    ["Actual_Not Proficient"]?: number;
    ["Actual_Low Proficient"]?: number;
    ["Actual_Nearly Proficient"]?: number;
    ["Actual_Proficient"]?: number;
    ["Actual_Highly Proficient"]?: number;
    [key: string]: any;
}

export function SchoolComparison() {
    const [schoolMAE, setSchoolMAE] = useState<SchoolMAE[]>([]);
    const [schoolProficiency, setSchoolProficiency] = useState<SchoolProficiency[]>([]);
    const [schoolMetrics, setSchoolMetrics] = useState<SchoolMetric[]>([]);
    const [loading, setLoading] = useState(true);
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const [selectedModel, setSelectedModel] = useState<string>('');

    useEffect(() => {
        const fetchModels = async () => {
            try {
                const modelRes = await fetch('http://localhost:5000/model-predict');
                if (modelRes.ok) {
                    const modelData = await modelRes.json();
                    const models = Object.keys(modelData);
                    setAvailableModels(models);
                    setSelectedModel(models[0] || '');
                }
            } catch (error) {
                console.error('Failed to fetch models:', error);
            }
        };
        fetchModels();
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const metricsRes = await fetch(`http://localhost:5000/api/school-metrics?model=${encodeURIComponent(selectedModel)}`);
                if (metricsRes.ok) {
                    const metricsData = await metricsRes.json();
                    setSchoolMetrics(metricsData.schools || []);
                }

                const maeRes = await fetch(`http://localhost:5000/api/school-mae?model=${encodeURIComponent(selectedModel)}`);
                if (maeRes.ok) {
                    const maeData = await maeRes.json();
                    setSchoolMAE(maeData.schools || []);
                }

                const profDistRes = await fetch(`http://localhost:5000/api/school-proficiency?model=${encodeURIComponent(selectedModel)}`);
                if (profDistRes.ok) {
                    const profDistData = await profDistRes.json();
                    const transformed = (profDistData.schools || []).map((s: any) => ({
                        School: s.School,
                        Actual_Not_Proficient: s.Actual["Not Proficient"] || 0,
                        Actual_Low_Proficient: s.Actual["Low Proficient"] || 0,
                        Actual_Nearly_Proficient: s.Actual["Nearly Proficient"] || 0,
                        Actual_Proficient: s.Actual["Proficient"] || 0,
                        Actual_Highly_Proficient: s.Actual["Highly Proficient"] || 0,
                        Pred_Not_Proficient: s.Predicted["Not Proficient"] || 0,
                        Pred_Low_Proficient: s.Predicted["Low Proficient"] || 0,
                        Pred_Nearly_Proficient: s.Predicted["Nearly Proficient"] || 0,
                        Pred_Proficient: s.Predicted["Proficient"] || 0,
                        Pred_Highly_Proficient: s.Predicted["Highly Proficient"] || 0,
                    }));
                    setSchoolProficiency(transformed);
                }
            } catch (error) {
                console.error('Failed to fetch school comparison data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [selectedModel]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">School Comparison</h1>
                <p className="text-gray-600">
                    Compare performance across different schools. Identify trends, outliers, and areas for intervention.
                </p>
            </div>

            {/* Research Purpose */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <h2 className="text-blue-900 flex items-center gap-2 text-lg font-semibold mb-3">
                    Research Purpose
                </h2>
                <div className="text-sm text-blue-900 space-y-2">
                    <p className="font-semibold">Research Question:</p>
                    <p>Does the model perform consistently across all 8 schools, or does it predict better for some schools than others?</p>
                    <div className="mt-3">
                        <p className="font-semibold">Implications for Thesis Documentation:</p>
                        <ul className="list-disc list-inside space-y-1 ml-2 mt-1">
                            <li><span className="font-medium">Model Fairness:</span> Identifies if the model predicts better for large schools vs. small schools, or mainstream vs. SPED Center</li>
                            <li><span className="font-medium">Generalizability:</span> Documents whether the model is robust across diverse school contexts with varying enrollment</li>
                            <li><span className="font-medium">Chapter 4 Figure:</span> Provides Figure 4.X for Objective 3 results showing prediction distribution across 8 schools</li>
                        </ul>
                    </div>
                </div>
            </div>
            {/* Model Selection — mirrors Charts.tsx pattern */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                <div className="flex items-center gap-4">
                    <label htmlFor="model-select" className="text-sm font-medium text-gray-700">Select Model:</label>
                    <select
                        id="model-select"
                        value={selectedModel}
                        onChange={(e) => {
                            setSelectedModel(e.target.value);
                        }}
                        className="w-[300px] px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                        {availableModels.map((key) => (
                            <option key={key} value={key}>
                                {key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1').trim()}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Model Performance by School */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                <div className="mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">Model Performance by School</h2>
                    <p className="text-sm text-gray-600">Mean Absolute Error (MAE) across 8 participating schools in Urdaneta City</p>
                </div>
                <div className="w-full h-[500px]">
                    {loading ? (
                        <div className="h-full flex items-center justify-center bg-gray-50 rounded-lg">
                            <p className="text-gray-500">Loading school performance data...</p>
                        </div>
                    ) : schoolMAE.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={schoolMAE} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="School" angle={-45} textAnchor="end" height={120} interval={0} tick={{ fontSize: 10 }} />
                                <YAxis label={{ value: 'MAE (Lower is Better)', angle: -90, position: 'insideLeft', dx: -40 }} domain={[0, 40]} />
                                <Tooltip formatter={(value: any) => [Number(value).toFixed(4), 'MAE']} contentStyle={{ fontSize: 12 }} />
                                <Bar dataKey="MAE" radius={[4, 4, 0, 0]}>
                                    {schoolMAE.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.MAE > 6 ? '#ef4444' : entry.MAE > 5.5 ? '#195b81' : '#3da6e2'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex items-center justify-center bg-gray-50 rounded-lg">
                            <p className="text-gray-500">No school MAE data available</p>
                        </div>
                    )}
                </div>
                {schoolMAE.length > 0 && (
                    <p className="text-xs text-gray-500 mt-2 text-center">Note: Red bars indicate higher prediction error</p>
                )}
            </div>

            {/* Proficiency Distribution by School */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                <div className="mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">Proficiency Distribution by School</h2>
                    <p className="text-sm text-gray-600">Predicted proficiency levels across all 8 schools (Actual vs. Predicted comparison)</p>
                </div>
                <div className="w-full h-[500px]">
                    {loading ? (
                        <div className="h-full flex items-center justify-center bg-gray-50 rounded-lg">
                            <p className="text-gray-500">Loading proficiency data...</p>
                        </div>
                    ) : schoolProficiency.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={schoolProficiency} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="School" angle={-45} textAnchor="end" height={120} interval={0} tick={{ fontSize: 10 }} />
                                <YAxis label={{ value: 'Percentage of Students', angle: -90, position: 'insideLeft', dx: -40 }} domain={[0, 100]} />
                                <Tooltip
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            const nonZeroItems = payload.filter((entry: any) => entry.value !== 0);
                                            if (nonZeroItems.length === 0) return null;
                                            return (
                                                <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                                                    {nonZeroItems.map((entry: any, index: number) => (
                                                        <p key={index} className="text-sm" style={{ color: entry.color }}>
                                                            {`${entry.name}: ${entry.value.toFixed(1)}%`}
                                                        </p>
                                                    ))}
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                <Bar dataKey="Actual_Not_Proficient" stackId="a" fill="#F3C66C" name="Not Proficient" />
                                <Bar dataKey="Actual_Low_Proficient" stackId="a" fill="#DB6B78" name="Low Proficient" />
                                <Bar dataKey="Actual_Nearly_Proficient" stackId="a" fill="#339CA7" name="Nearly Proficient" />
                                <Bar dataKey="Actual_Proficient" stackId="a" fill="#5A83B0" name="Proficient" />
                                <Bar dataKey="Actual_Highly_Proficient" stackId="a" fill="#2A5576" name="Highly Proficient" />
                                <Bar dataKey="Pred_Not_Proficient" stackId="b" fill="#B77F2E" name="Not Proficient (Pred)" />
                                <Bar dataKey="Pred_Low_Proficient" stackId="b" fill="#8F2D3A" name="Low Proficient (Pred)" />
                                <Bar dataKey="Pred_Nearly_Proficient" stackId="b" fill="#00575F" name="Nearly Proficient (Pred)" />
                                <Bar dataKey="Pred_Proficient" stackId="b" fill="#214664" name="Proficient (Pred)" />
                                <Bar dataKey="Pred_Highly_Proficient" stackId="b" fill="#00283A" name="Highly Proficient (Pred)" />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex items-center justify-center bg-gray-50 rounded-lg">
                            <p className="text-gray-500">No proficiency distribution data available</p>
                        </div>
                    )}
                </div>
                {schoolProficiency.length > 0 && (
                    <p className="text-xs text-gray-500 mt-2 text-center">
                        Stacked bars show actual (left stack) vs predicted (right stack) proficiency percentages per school
                    </p>
                )}
            </div>

            {/* School Summary Statistics */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                <div className="mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">School Summary Statistics</h2>
                    <p className="text-sm text-gray-600">Student count and average MPS (Actual vs. Predicted) for each school</p>
                </div>
                {schoolMetrics.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-400">
                                    <th className="text-left p-2">School</th>
                                    <th className="text-left p-2">Students</th>
                                    <th className="text-left p-2">Avg Actual MPS</th>
                                    <th className="text-left p-2">Avg Predicted MPS</th>
                                    <th className="text-left p-2">Bias</th>
                                    <th className="text-left p-2">MAE</th>
                                </tr>
                            </thead>
                            <tbody>
                                {schoolMetrics.map((school) => (
                                    <tr key={school.School} className="border-b border-gray-300">
                                        <td className="p-2 font-medium max-w-xs truncate" title={school.School}>{school.School}</td>
                                        <td className="p-2">{school.Student_Count}</td>
                                        <td className="p-2">{school.Avg_Actual_MPS.toFixed(2)}</td>
                                        <td className="p-2">{school.Avg_Predicted_MPS.toFixed(2)}</td>
                                        <td className={`p-2 ${school.Avg_Bias >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                                            {school.Avg_Bias >= 0 ? '+' : ''}{school.Avg_Bias.toFixed(2)}
                                        </td>
                                        <td className="p-2">{school.MAE.toFixed(4)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="h-32 flex items-center justify-center bg-gray-50 rounded-lg">
                        <p className="text-gray-500">No school metrics available</p>
                    </div>
                )}
            </div>

            {/* Key Findings */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
                <h2 className="text-amber-900 text-lg font-semibold mb-3">Key Findings for Chapter 4 & 5</h2>
                <div className="text-sm text-amber-900 space-y-2">
                    <p><span className="font-semibold">Fairness Assessment:</span> Check MAE values per school to identify if the model performs consistently. Higher MAE indicates lower prediction accuracy for that school.</p>
                    <p><span className="font-semibold">Proficiency Patterns:</span> Compare Actual vs Predicted proficiency distributions to see where the model over/under-predicts certain performance levels.</p>
                    <p><span className="font-semibold">Generalizability:</span> Consistent MAE across all 8 schools (ideally below 6.0) supports the model's robustness across diverse school contexts in Urdaneta City.</p>
                </div>
            </div>
        </div>
    );
}