import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { PredictionResult as ApiPredictionResult } from '../services/api';
import { getOrgSessions, getSessionById } from '../services/sessionService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface ClassData {
    section: string;
    avgMPS: number;
    total: number;
    high: number;
    proficient: number;
    nearlyProficient: number;
    lowProficient: number;
    notProficient: number;
}

export function ClassComparison() {
    const navigate = useNavigate();
    const { user } = useAuth();

    const [predictions, setPredictions] = useState<ApiPredictionResult[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Load all predictions from all sessions for the admin's school
    useEffect(() => {
        const loadAllSessions = async () => {
            if (!user?.schoolId) {
                setError('No school ID found for your account.');
                setLoading(false);
                return;
            }

            setLoading(true);
            try {
                // Get all sessions for this school
                const sessions = await getOrgSessions(user.schoolId);

                if (sessions.length === 0) {
                    setPredictions([]);
                    return;
                }

                // Fetch predictions from each session
                const allPredictions: ApiPredictionResult[] = [];
                for (const session of sessions) {
                    try {
                        const fullSession = await getSessionById(session.teacherId, session.id);
                        if (fullSession?.predictions) {
                            allPredictions.push(...fullSession.predictions);
                        }
                    } catch (e) {
                        console.warn(`Failed to load session ${session.id}:`, e);
                    }
                }

                setPredictions(allPredictions);
            } catch (e) {
                console.error('Failed to load sessions:', e);
                setError('Failed to load session data. Please try again.');
            } finally {
                setLoading(false);
            }
        };

        loadAllSessions();
    }, [user?.schoolId]);

    // Aggregate data by Section
    const classData = useMemo<ClassData[]>(() => {
        if (!predictions.length) return [];

        const sectionMap = new Map<string, {
            total: number;
            sumMPS: number;
            high: number;
            proficient: number;
            nearlyProficient: number;
            lowProficient: number;
            notProficient: number;
        }>();

        predictions.forEach(pred => {
            const section = pred.Section?.trim() || 'Unassigned';
            const code = pred.proficiency?.code ?? 0;

            if (!sectionMap.has(section)) {
                sectionMap.set(section, {
                    total: 0,
                    sumMPS: 0,
                    high: 0,
                    proficient: 0,
                    nearlyProficient: 0,
                    lowProficient: 0,
                    notProficient: 0,
                });
            }

            const entry = sectionMap.get(section)!;
            entry.total++;
            entry.sumMPS += pred.prediction;

            switch (code) {
                case 4: entry.high++; break;
                case 3: entry.proficient++; break;
                case 2: entry.nearlyProficient++; break;
                case 1: entry.lowProficient++; break;
                case 0: entry.notProficient++; break;
            }
        });

        return Array.from(sectionMap.entries())
            .map(([section, stats]) => ({
                section,
                avgMPS: parseFloat((stats.sumMPS / stats.total).toFixed(1)),
                total: stats.total,
                high: stats.high,
                proficient: stats.proficient,
                nearlyProficient: stats.nearlyProficient,
                lowProficient: stats.lowProficient,
                notProficient: stats.notProficient,
            }))
            .sort((a, b) => {
                const aNum = parseInt(a.section);
                const bNum = parseInt(b.section);
                if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
                return a.section.localeCompare(b.section);
            });
    }, [predictions]);

    // Find section with highest at-risk percentage for insight
    const insightSection = useMemo(() => {
        if (!classData.length) return null;

        let highestAtRisk = -1;
        let criticalSection = '';

        classData.forEach(s => {
            const atRisk = s.nearlyProficient + s.lowProficient + s.notProficient;
            const atRiskPct = (atRisk / s.total) * 100;
            if (atRiskPct > highestAtRisk) {
                highestAtRisk = atRiskPct;
                criticalSection = s.section;
            }
        });

        if (highestAtRisk >= 50) {
            const s = classData.find(s => s.section === criticalSection)!;
            return {
                section: criticalSection,
                atRiskPct: highestAtRisk.toFixed(0),
                avgMPS: s.avgMPS,
            };
        }
        return null;
    }, [classData]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="flex flex-col items-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-blue-600 mb-4"></div>
                    <p className="text-gray-600">Loading section comparison data...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
                    <div className="rounded-full bg-red-100 w-16 h-16 flex items-center justify-center mx-auto mb-4">
                        <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Error Loading Data</h2>
                    <p className="text-gray-600 mb-6">{error}</p>
                    <button
                        onClick={() => navigate('/overview')}
                        className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
                    >
                        Back to Overview
                    </button>
                </div>
            </div>
        );
    }

    if (predictions.length === 0) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
                    <div className="rounded-full bg-yellow-100 w-16 h-16 flex items-center justify-center mx-auto mb-4">
                        <svg className="h-8 w-8 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">No Prediction Data</h2>
                    <p className="text-gray-600 mb-6">
                        No sessions found for your school. Teachers need to run predictions first.
                    </p>
                    <button
                        onClick={() => navigate('/overview')}
                        className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
                    >
                        Back to Overview
                    </button>
                </div>
            </div>
        );
    }

    const totalStudents = predictions.length;
    const sectionsWithData = classData.length;

    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <header className="mb-8">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">
                                Section Comparison
                            </h1>
                            <p className="text-gray-600 mt-1">
                                Aggregated from all teacher sessions - {totalStudents} learners across {sectionsWithData} sections
                            </p>
                        </div>
                    </div>
                </header>

                {/* Average MPS Bar Chart */}
                <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Average Predicted MPS by Section</h2>
                    <ResponsiveContainer width="100%" height={350}>
                        <BarChart
                            data={classData}
                            layout="vertical"
                            margin={{ top: 10, right: 20, left: 20, bottom: 10 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" domain={[0, 100]} tickCount={11} />
                            <YAxis type="category" dataKey="section" width={80} tick={{ fontSize: 12 }} />
                            <Tooltip
                                formatter={(value) => [Number(value).toFixed(1), 'Avg MPS']}
                                contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                            />
                            <Bar dataKey="avgMPS" radius={[0, 4, 4, 0]}>
                                {classData.map((entry, index) => {
                                    let fill: string;
                                    if (entry.avgMPS >= 75) fill = '#3b82f6';
                                    else if (entry.avgMPS >= 60) fill = '#f59e0b';
                                    else fill = '#ef4444';
                                    return <Cell key={`cell-${index}`} fill={fill} />;
                                })}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Section Breakdown Table */}
                <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Section Proficiency Breakdown</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Section</th>
                                    <th className="text-right py-3 px-4 font-semibold text-gray-700">Total</th>
                                    <th className="text-right py-3 px-4 font-semibold text-green-700">High</th>
                                    <th className="text-right py-3 px-4 font-semibold text-green-600">Proficient</th>
                                    <th className="text-right py-3 px-4 font-semibold text-yellow-600">Nearly Prof.</th>
                                    <th className="text-right py-3 px-4 font-semibold text-orange-600">Low Prof.</th>
                                    <th className="text-right py-3 px-4 font-semibold text-red-600">Not Prof.</th>
                                    <th className="text-right py-3 px-4 font-semibold text-gray-700">At-Risk %</th>
                                </tr>
                            </thead>
                            <tbody>
                                {classData.map((sect) => {
                                    const atRisk = sect.nearlyProficient + sect.lowProficient + sect.notProficient;
                                    const atRiskPct = ((atRisk / sect.total) * 100).toFixed(0);
                                    const riskNum = Number(atRiskPct);

                                    const rowClasses = riskNum < 30
                                        ? 'bg-green-50/50 hover:bg-green-100/30'
                                        : riskNum < 60
                                            ? 'bg-yellow-50/50 hover:bg-yellow-100/30'
                                            : 'bg-red-50/50 hover:bg-red-100/30';

                                    return (
                                        <tr key={sect.section} className={`border-b border-gray-100 transition-colors ${rowClasses}`}>
                                            <td className="py-3 px-4 font-medium text-gray-900">Section {sect.section}</td>
                                            <td className="text-right py-3 px-4 text-gray-600">{sect.total}</td>
                                            <td className="text-right py-3 px-4 text-green-700">{sect.high}</td>
                                            <td className="text-right py-3 px-4 text-green-600">{sect.proficient}</td>
                                            <td className="text-right py-3 px-4 text-yellow-600">{sect.nearlyProficient}</td>
                                            <td className="text-right py-3 px-4 text-orange-600">{sect.lowProficient}</td>
                                            <td className="text-right py-3 px-4 text-red-600">{sect.notProficient}</td>
                                            <td className="text-right py-3 px-4">
                                                <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${riskNum < 30 ? 'bg-green-100 text-green-800' :
                                                    riskNum < 60 ? 'bg-yellow-100 text-yellow-800' :
                                                        'bg-red-100 text-red-800'
                                                    }`}>
                                                    {atRiskPct}%
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Admin Insights Card */}
                {insightSection && (
                    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 mb-8">
                        <h2 className="text-lg font-semibold text-blue-900 mb-3">Administrator Insights</h2>
                        <div className="text-sm text-blue-900 space-y-3">
                            <p className="font-semibold">Priority Support Recommendation:</p>
                            <p>
                                Section {insightSection.section} has the highest at-risk proportion ({insightSection.atRiskPct}%)
                                with an average predicted MPS of {insightSection.avgMPS}.
                                This section should receive priority support including additional remedial teachers,
                                extra NAT review sessions, and targeted interventions for learners below proficiency.
                            </p>
                            <p className="font-semibold mt-4">Resource Allocation:</p>
                            <p>
                                Consider allocating additional teaching resources to sections with high at-risk percentages
                                and coordinating with section teachers to implement targeted intervention strategies.
                            </p>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}