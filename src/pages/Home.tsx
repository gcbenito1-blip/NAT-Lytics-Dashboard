import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getSessions, createSession, deleteSession, Session } from '../lib/sessions';

export function Home() {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [newSessionName, setNewSessionName] = useState('');
    const [saving, setSaving] = useState(false);
    const [selectedSession, setSelectedSession] = useState<Session | null>(null);
    const navigate = useNavigate();
    const { user } = useAuth();

    const isResearcher = user?.role === 'researcher';
    const isTeacher = user?.role === 'teacher';
    const isAdmin = user?.role === 'admin';
    const [researcherMode, setResearcherMode] = useState<'evaluation' | 'prediction' | null>(() => {
        if (isResearcher && typeof window !== 'undefined') {
            const viewMode = localStorage.getItem('researcherViewMode');
            // For Home page, we only need to know if it's prediction or evaluation
            // evaluation mode has its own route
            return viewMode === 'teacher' || viewMode === 'admin' ? 'prediction' : null;
        }
        return null;
    });

    useEffect(() => {
        if (user) {
            fetchSessions();
            // Redirect teacher and admin directly to their role-specific dashboard
            if (isTeacher) {
                navigate('/teacher/dashboard', { replace: true });
            } else if (isAdmin) {
                navigate('/admin/dashboard', { replace: true });
            }
        }
    }, [user, isTeacher, isAdmin, navigate]);

    const fetchSessions = async () => {
        if (!user) return;

        try {
            console.log('[Home] Fetching sessions for user:', user.uid);
            const userSessions = await getSessions(user.uid);
            console.log('[Home] Sessions fetched:', userSessions);
            setSessions(userSessions);
        } catch (error) {
            console.error('[Home] Error fetching sessions:', error);
            if (error instanceof Error) {
                console.error('[Home] Error message:', error.message);
                console.error('[Home] Error stack:', error.stack);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleCreateSession = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newSessionName.trim() || !user) return;

        setSaving(true);
        try {
            const newSession = await createSession(user.uid, newSessionName.trim(), user.email);

            setSessions([newSession, ...sessions]);
            setNewSessionName('');
            setShowForm(false);

            // Navigate to role-specific dashboard with session ID
            let dashboardPath = '/dashboard';
            if (user.role === 'teacher') {
                dashboardPath = '/teacher/dashboard';
            } else if (user.role === 'admin') {
                dashboardPath = '/admin/dashboard';
            } else if (user.role === 'researcher' && researcherMode === 'prediction') {
                dashboardPath = '/researcher/prediction/dashboard';
            }

            navigate(dashboardPath, { state: { sessionId: newSession.id, sessionName: newSession.name } });
        } catch (error) {
            console.error('Error creating session:', error);
            alert('Failed to create session. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteSession = async (id: string) => {
        if (!confirm('Are you sure you want to delete this session?')) return;

        try {
            await deleteSession(id);
            setSessions(sessions.filter(s => s.id !== id));
            if (selectedSession?.id === id) {
                setSelectedSession(null);
            }
        } catch (error) {
            console.error('Error deleting session:', error);
            alert('Failed to delete session.');
        }
    };

    const handleOpenSession = (session: Session) => {
        // If session has results, navigate to results, otherwise to role-specific dashboard
        // Check total_predictions as fallback since predictions array may not be in Firestore
        if (session.predictions || session.total_predictions) {
            // Navigate to role-specific prediction-table page
            let resultsPath = '/results';
            if (user) {
                if (user.role === 'teacher') {
                    resultsPath = '/teacher/prediction-table';
                } else if (user.role === 'admin') {
                    resultsPath = '/admin/prediction-table';
                } else if (user.role === 'researcher' && researcherMode === 'prediction') {
                    resultsPath = '/researcher/prediction/prediction-table';
                } else if (user.role === 'researcher' && researcherMode === 'evaluation') {
                    // For researcher in evaluation mode, maybe they shouldn't see prediction results?
                    // But if they have a session with predictions, we'll send them to researcher prediction table
                    resultsPath = '/researcher/prediction/prediction-table';
                }
            }
            navigate(resultsPath, { state: { sessionId: session.id, sessionName: session.name } });
        } else {
            let dashboardPath = '/dashboard';
            if (user?.role === 'teacher') {
                dashboardPath = '/teacher/dashboard';
            } else if (user?.role === 'admin') {
                dashboardPath = '/admin/dashboard';
            } else if (user?.role === 'researcher' && researcherMode === 'prediction') {
                dashboardPath = '/researcher/prediction/dashboard';
            }

            navigate(dashboardPath, { state: { sessionId: session.id, sessionName: session.name } });
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    // Researcher mode selection view
    if (isResearcher && !researcherMode) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="max-w-4xl w-full">
                    <div className="text-center mb-12">
                        <h1 className="text-4xl font-bold text-gray-900 mb-4">Welcome, Researcher</h1>
                        <p className="text-xl text-gray-600">Select your working mode to get started</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Evaluation Mode */}
                        <div className="bg-white rounded-2xl shadow-lg p-8 border-2 border-transparent hover:border-blue-200 transition-all flex flex-col h-full">
                            <div className="flex-1 flex flex-col">
                                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                                    <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                    </svg>
                                </div>
                                <h2 className="text-2xl font-bold text-gray-900 mb-4 text-center">Evaluation Mode</h2>
                                <p className="text-gray-600 mb-6 leading-relaxed text-center flex-shrink-0">Analyze model performance, review metrics, and understand prediction accuracy. Access detailed model evaluation reports and comparative analysis.</p>
                                <div className="bg-blue-50 rounded-lg p-4 flex-1">
                                    <h3 className="font-semibold text-blue-900 mb-2">What you can do:</h3>
                                    <ul className="text-sm text-blue-800 space-y-1">
                                        <li>• View model performance metrics (R², MAE, RMSE)</li>
                                        <li>• Compare different model algorithms</li>
                                        <li>• Analyze feature importance</li>
                                        <li>• Review prediction accuracy</li>
                                    </ul>
                                </div>
                            </div>
                            <button
                                onClick={() => navigate('/researcher/evaluation/model-evaluation')}
                                className="mt-6 w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition cursor-pointer"
                            >
                                Enter Evaluation Mode
                            </button>
                        </div>

                        {/* Prediction Mode */}
                        <div className="bg-white rounded-2xl shadow-lg p-8 border-2 border-transparent hover:border-green-200 transition-all flex flex-col h-full">
                            <div className="flex-1 flex flex-col">
                                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center">
                                    <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                    </svg>
                                </div>
                                <h2 className="text-2xl font-bold text-gray-900 mb-4 text-center">Prediction Mode</h2>
                                <p className="text-gray-600 mb-6 leading-relaxed text-center flex-shrink-0">Run predictions on student data, generate forecasts, and export results. Create sessions and analyze prediction outcomes with detailed explanations.</p>
                                <div className="bg-green-50 rounded-lg p-4 flex-1">
                                    <h3 className="font-semibold text-green-900 mb-2">What you can do:</h3>
                                    <ul className="text-sm text-green-800 space-y-1">
                                        <li>• Upload datasets for prediction</li>
                                        <li>• Generate student performance forecasts</li>
                                        <li>• View prediction results with explanations</li>
                                        <li>• Export results to CSV/PDF</li>
                                    </ul>
                                </div>
                            </div>
                            <button
                                onClick={() => navigate('/researcher/prediction/dashboard')}
                                className="mt-6 w-full px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition cursor-pointer"
                            >
                                Enter Prediction Mode
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900">Predictive Analytics Sessions</h1>
                <p className="mt-2 text-gray-600">Create and manage your prediction projects</p>
            </div>

            {/* Create New Button */}
            <div className="mb-6">
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                    <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    {showForm ? 'Cancel' : 'Create New Session'}
                </button>
            </div>

            {/* Create Form */}
            {showForm && (
                <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h2 className="text-lg font-semibold mb-4">New Session</h2>
                    <form onSubmit={handleCreateSession}>
                        <div className="mb-4">
                            <label htmlFor="sessionName" className="block text-sm font-medium text-gray-700 mb-2">
                                Session Name
                            </label>
                            <input
                                type="text"
                                id="sessionName"
                                value={newSessionName}
                                onChange={(e) => setNewSessionName(e.target.value)}
                                placeholder="example: Grade6-Ruby 2026-2027"
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                required
                            />
                        </div>
                        <div className="flex justify-end">
                            <button
                                type="submit"
                                disabled={saving || !newSessionName.trim()}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                            >
                                {saving ? 'Creating...' : 'Create Session'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Sessions List */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
                {sessions.length === 0 ? (
                    <div className="p-8 text-center">
                        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        <h3 className="mt-4 text-lg font-medium text-gray-900">No sessions yet</h3>
                        <p className="mt-2 text-gray-500">Create your first predictive analytics session to get started.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-200">
                        {sessions.map((session) => (
                            <div
                                key={session.id}
                                className="p-6 hover:bg-gray-50 transition cursor-pointer"
                                onClick={() => setSelectedSession(selectedSession?.id === session.id ? null : session)}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3">
                                            <h3 className="text-lg font-semibold text-gray-900">{session.name}</h3>
                                            {(session.predictions || session.total_predictions) && (
                                                <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                                                    Completed
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-gray-500 mt-1">
                                            Created: {formatDate(session.created_at)}
                                            {session.file_name && ` • File: ${session.file_name}`}
                                        </p>
                                        {(session.predictions || session.total_predictions) && (() => {
                                            // Use predictions array if available, otherwise use summary fields
                                            const hasPredictionsArray = Array.isArray(session.predictions) && session.predictions.length > 0;

                                            if (!hasPredictionsArray && session.total_predictions) {
                                                // Use summary fields from Firestore
                                                const totalPreds = session.total_predictions;

                                                return (
                                                    <div className="flex flex-wrap gap-3 mt-2 text-sm">
                                                        <span className="text-gray-600">
                                                            <span className="font-medium">{totalPreds}</span> predictions
                                                        </span>
                                                    </div>
                                                );
                                            }

                                            // Calculate stats from predictions inline
                                            const preds = Array.isArray(session.predictions) ? session.predictions : JSON.parse(typeof session.predictions === 'string' ? session.predictions : '[]');
                                            const totalPreds = preds.length;
                                            if (totalPreds === 0) return null;

                                            const passedCount = preds.filter((p: any) => (p.proficiency?.code ?? 0) >= 2).length;
                                            const failedCount = totalPreds - passedCount;
                                            const passRate = totalPreds > 0 ? (passedCount / totalPreds) * 100 : 0;
                                            const avgScore = totalPreds > 0
                                                ? preds.reduce((sum: number, p: any) => sum + p.prediction, 0) / totalPreds
                                                : 0;

                                            // Check for band distribution
                                            const hasBands = preds[0]?.probability_breakdown && preds[0].probability_breakdown.length > 0;

                                            if (hasBands) {
                                                return (
                                                    <div className="flex flex-wrap gap-3 mt-2">
                                                        {preds[0].probability_breakdown.map((band: any, idx: number) => {
                                                            const count = preds.filter((p: any) => p.top_probable_band?.code === band.code).length;
                                                            const pct = totalPreds > 0 ? (count / totalPreds) * 100 : 0;
                                                            return (
                                                                <span
                                                                    key={idx}
                                                                    className="px-2 py-1 rounded-full text-xs font-medium"
                                                                    style={{
                                                                        backgroundColor: band.color + '20',
                                                                        color: band.color
                                                                    }}
                                                                >
                                                                    {band.label}: {count} ({pct.toFixed(1)}%)
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                );
                                            }

                                            // Default: show passed/failed with pass rate
                                            return (
                                                <div className="flex flex-wrap gap-3 mt-2 text-sm">
                                                    <span className="text-gray-600">
                                                        <span className="font-medium">{totalPreds}</span> predictions
                                                    </span>
                                                    <span className="text-green-600">
                                                        <span className="font-medium">{passedCount}</span> passed
                                                    </span>
                                                    <span className="text-red-600">
                                                        <span className="font-medium">{failedCount}</span> failed
                                                    </span>
                                                    <span className="text-blue-600">
                                                        <span className="font-medium">{passRate.toFixed(1)}%</span> pass rate
                                                    </span>
                                                    <span className="text-purple-600">
                                                        <span className="font-medium">avg: {avgScore.toFixed(1)}</span>
                                                    </span>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                    <div className="flex items-center space-x-3">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleOpenSession(session);
                                            }}
                                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                                        >
                                            {session.predictions || session.total_predictions ? 'View Results' : 'Continue'}
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteSession(session.id);
                                            }}
                                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                                        >
                                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>

                                {/* Expanded Details */}
                                {selectedSession?.id === session.id && (session.predictions || session.total_predictions) && (() => {
                                    // Calculate stats from predictions (same logic as Results.tsx)
                                    // Use predictions array if available, otherwise use summary fields
                                    const hasPredictionsArray = Array.isArray(session.predictions) && session.predictions.length > 0;

                                    const totalPreds = hasPredictionsArray
                                        ? (Array.isArray(session.predictions) ? session.predictions : JSON.parse(typeof session.predictions === 'string' ? session.predictions : '[]')).length
                                        : session.total_predictions || 0;

                                    const avgScore = hasPredictionsArray
                                        ? (totalPreds > 0
                                            ? (Array.isArray(session.predictions) ? session.predictions : JSON.parse(typeof session.predictions === 'string' ? session.predictions : '[]')).reduce((sum: number, p: any) => sum + p.prediction, 0) / totalPreds
                                            : 0)
                                        : session.average_score || 0;

                                    const highestScore = hasPredictionsArray && totalPreds > 0
                                        ? Math.max(...(Array.isArray(session.predictions) ? session.predictions : JSON.parse(typeof session.predictions === 'string' ? session.predictions : '[]')).map((p: any) => p.prediction))
                                        : avgScore; // Approximate when no full predictions

                                    const lowestScore = hasPredictionsArray && totalPreds > 0
                                        ? Math.min(...(Array.isArray(session.predictions) ? session.predictions : JSON.parse(typeof session.predictions === 'string' ? session.predictions : '[]')).map((p: any) => p.prediction))
                                        : avgScore; // Approximate when no full predictions

                                    // Get probability breakdown bands (only if we have predictions array)
                                    const hasBands = hasPredictionsArray && (Array.isArray(session.predictions) ? session.predictions : JSON.parse(typeof session.predictions === 'string' ? session.predictions : '[]'))[0]?.probability_breakdown && (Array.isArray(session.predictions) ? session.predictions : JSON.parse(typeof session.predictions === 'string' ? session.predictions : '[]'))[0].probability_breakdown.length > 0;

                                    return (
                                        <div className="mt-6 pt-6 border-t border-gray-200">
                                            <h4 className="text-sm font-semibold text-gray-700 mb-3">Session Details</h4>

                                            {/* Score Distribution */}
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                                <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl">
                                                    <p className="text-sm font-medium text-blue-600">Highest Score</p>
                                                    <p className="text-2xl font-bold text-blue-700 mt-1">{highestScore.toFixed(1)}</p>
                                                </div>
                                                <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl">
                                                    <p className="text-sm font-medium text-purple-600">Average Score</p>
                                                    <p className="text-2xl font-bold text-purple-700 mt-1">{avgScore.toFixed(1)}</p>
                                                </div>
                                                <div className="p-4 bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl">
                                                    <p className="text-sm font-medium text-orange-600">Lowest Score</p>
                                                    <p className="text-2xl font-bold text-orange-700 mt-1">{lowestScore.toFixed(1)}</p>
                                                </div>
                                            </div>

                                            {/* Band Distribution (if available) or Pass/Fail */}
                                            {hasBands && hasPredictionsArray ? (
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                    {(() => {
                                                        const preds = Array.isArray(session.predictions) ? session.predictions : JSON.parse(typeof session.predictions === 'string' ? session.predictions : '[]');
                                                        return preds[0].probability_breakdown.map((band: any, idx: number) => {
                                                            const count = preds.filter((p: any) => p.top_probable_band?.code === band.code).length;
                                                            const pct = totalPreds > 0 ? (count / totalPreds) * 100 : 0;
                                                            return (
                                                                <div
                                                                    key={idx}
                                                                    className="rounded-lg p-4"
                                                                    style={{ backgroundColor: band.color + '20' }}
                                                                >
                                                                    <div className="text-xs text-gray-500">{band.label}</div>
                                                                    <div className="text-xl font-bold" style={{ color: band.color }}>{count}</div>
                                                                    <div className="text-xs text-gray-500">{pct.toFixed(1)}%</div>
                                                                </div>
                                                            );
                                                        });
                                                    })()}
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                    <div className="bg-gray-50 rounded-lg p-4">
                                                        <div className="text-xs text-gray-500">Total Predictions</div>
                                                        <div className="text-xl font-bold text-gray-900">{totalPreds}</div>
                                                    </div>
                                                </div>
                                            )}

                                            {session.file_name && (
                                                <div className="mt-4 text-sm text-gray-600">
                                                    Dataset: <span className="font-medium">{session.file_name}</span>
                                                </div>
                                            )}
                                            {session.analysis_summary && (
                                                <div className="mt-2 text-sm text-gray-600">
                                                    Analysis: <span className="font-medium">{(session.analysis_summary as any).total_rows} rows, {(session.analysis_summary as any).total_columns} columns</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Info Box */}
            <div className="mt-8 bg-blue-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-blue-900">What is a Session?</h3>
                <p className="mt-2 ml-8 text-blue-800">
                    <li>
                        A session represents a single predictive analytics project.
                    </li>
                    <li>
                        Each session contains your data, model training history, and results.
                    </li>
                    <li>
                        You can create multiple sessions to predict results for different sections.
                    </li>
                    <li>
                        Your results are saved automatically and you can return to view them anytime.
                    </li>
                </p>
            </div>
        </div>
    );
}
