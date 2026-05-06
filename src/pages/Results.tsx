import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { PredictionResult as ApiPredictionResult } from '../services/api';
import { getSession, getSessionsByEmail } from '../lib/sessions';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ============================================================
// EXPORT FUNCTIONS FOR CSV AND PDF
// ============================================================

// CSV Export function
const exportToCSV = (predictions: ApiPredictionResult[], fileName: string, hasSection: boolean) => {
    if (predictions.length === 0) return;

    const csvHeaders = ['Learner ID', ...(hasSection ? ['Section'] : []), 'prediction', 'proficiency_label', 'pass_probability'];

    const csvRows = predictions.map(pred => [
        String(pred.learnerID || ''),
        ...(hasSection ? [pred.Section || ''] : []),
        pred.prediction?.toString() || '',
        pred.proficiency?.label || '',
        pred.pass_probability != null ? (pred.pass_probability * 100).toFixed(1) + '%' : '',
    ].join(','));

    const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName.replace(/\.csv$/i, '')}_predictions.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

// PDF Export function
const exportToPDF = (predictions: ApiPredictionResult[], fileName: string, sessionName?: string, hasSection?: boolean) => {
    if (predictions.length === 0) return;

    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`${sessionName ?? ''} Prediction Results Report`, 14, 22);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);
    doc.text(`Total Records: ${predictions.length}`, 14, 36);

    const tableData = predictions.map(pred => [
        pred.learnerID || '-',
        ...(hasSection ? [pred.Section || '-'] : []),
        pred.prediction?.toString() || '-',
        pred.proficiency?.label || '-',
        pred.pass_probability != null ? `${(pred.pass_probability * 100).toFixed(1)}%` : '-',
    ]);

    autoTable(doc, {
        head: [['Learner ID', ...(hasSection ? ['Section'] : []), 'Predicted MPS', 'Proficiency Level', 'Pass Probability']],
        body: tableData,
        startY: 42,
        styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak' },
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [240, 240, 240] },
        margin: { left: 14, right: 14 }
    });

    doc.save(`${fileName.replace(/\.pdf$/i, '')}_predictions.pdf`);
};

// ============================================================
// FEATURE IMPORTANCE EXPLANATIONS (imported from Results.tsx)
// These are still needed for the per-student modal in Results
// ============================================================

// Map technical column names to user-friendly descriptions
export const featureExplanations: Record<string, {
    friendlyName: string;
    category: string;
    description: string;
    canChange: boolean;
    insight: string;
}> = {
    // ... (keep all the existing featureExplanations - these are needed for per-student modal)
    // This section should remain unchanged as it's used in the modal
};

// Get a user-friendly name for any feature
export const getFriendlyFeatureName = (featureName: string): string => {
    return featureExplanations[featureName]?.friendlyName || featureName;
};

// Get category color for display
export const getCategoryColor = (category: string): string => {
    const colors: Record<string, string> = {
        'Student Profile': '#8b5cf6',
        'Academic History': '#8b5cf6',
        'Other': '#8b5cf6'
    };
    return colors[category] || '#8b5cf6';
};

// Fallback category detection
export function getFeatureCategory(featureName: string): string {
    const info = featureExplanations[featureName];
    if (info) return info.category;

    const lower = featureName.toLowerCase();
    if (lower.includes('math') || lower.includes('english') || lower.includes('filipino') || lower.includes('science') || lower.includes('aral')) {
        return 'Academic History';
    }
    if (lower.includes('age') || lower.includes('sex') || lower.includes('gender') || lower.includes('mother tongue') || lower.includes('nutrition') || lower.includes('bmi')) {
        return 'Student Profile';
    }
    if (lower.startsWith('gender_') || lower.startsWith('mother tongue_') || lower.startsWith('nutritional status(bmi)_')) {
        return 'Student Profile';
    }
    return 'Other';
}

interface ResultsState {
    predictions: ApiPredictionResult[];
    fileName: string;
    sessionId?: string;
    sessionName?: string;
    rawData?: Record<string, unknown>[];
}

export function Results() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const [predictions, setPredictions] = useState<ApiPredictionResult[]>([]);
    const [fileName, setFileName] = useState('');
    const [sessionName, setSessionName] = useState('');
    const [sortField, setSortField] = useState<keyof ApiPredictionResult>('prediction');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const [filterStatus, setFilterStatus] = useState<'all' | 'passed' | 'failed'>('all');
    const [filterProficiency, setFilterProficiency] = useState<string>('all');
    const [filterSection, setFilterSection] = useState<string>('all'); // New state for section filter
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
    const [pageInput, setPageInput] = useState('');
    const [, setRawData] = useState<Record<string, unknown>[]>([]);
    const [hasAnySession, setHasAnySession] = useState(false);
    const resultsContainerRef = useRef<HTMLDivElement>(null);
    const hasSection = predictions.some(p => p.Section != null && p.Section !== '');

    // Get unique sections for filter
    const uniqueSections = React.useMemo(() => {
        if (!hasSection) return [];
        const sectionSet = new Set<string>();
        predictions.forEach(pred => {
            if (pred.Section && pred.Section.trim() !== '') {
                sectionSet.add(pred.Section);
            }
        });
        return Array.from(sectionSet).sort();
    }, [predictions, hasSection]);

    // Check if user has any sessions
    useEffect(() => {
        if (user) {
            const userSessions = getSessionsByEmail(user.email);
            setHasAnySession(userSessions.length > 0);
        }
    }, [user]);

    // Prevent body scroll when modal is open
    useEffect(() => {
        if (selectedStudent) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [selectedStudent]);

    useEffect(() => {
        const loadResults = async () => {
            const state = location.state as ResultsState | null;

            if (state?.predictions) {
                setPredictions(state.predictions);
                setFileName(state.fileName || 'Dataset');
                setSessionName(state.sessionName || '');
                if (state.rawData) {
                    setRawData(state.rawData);
                }
            } else if (state?.sessionId) {
                try {
                    const session = await getSession(state.sessionId);
                    if (!session) {
                        navigate('/home');
                        return;
                    }
                    if (session.predictions && Array.isArray(session.predictions) && session.predictions.length > 0) {
                        let loadedPredictions: ApiPredictionResult[] = Array.isArray(session.predictions)
                            ? session.predictions
                            : JSON.parse(session.predictions as string);
                        setFileName(session.file_name || 'Dataset');
                        setSessionName(session.name || '');
                        setPredictions(loadedPredictions);
                    } else {
                        navigate('/home');
                    }
                } catch (error) {
                    console.error('Failed to load session:', error);
                    navigate('/home');
                }
            } else {
                navigate('/home');
            }
        };

        loadResults();
    }, [location.state, navigate]);

    const handleSort = (field: keyof ApiPredictionResult) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };

    // Get unique proficiency labels for filter
    const uniqueProficiencies = React.useMemo(() => {
        const profSet = new Set<string>();
        predictions.forEach(pred => {
            if (pred.proficiency?.label) {
                profSet.add(pred.proficiency.label);
            }
        });
        return Array.from(profSet).sort();
    }, [predictions]);

    const filteredAndSortedPredictions = predictions
        .filter((pred) => {
            if (filterStatus === 'all') return true;
            const bandCode = parseInt(filterStatus);
            if (!isNaN(bandCode)) {
                return pred.top_probable_band?.code === bandCode;
            }
            const isPassed = (pred.proficiency?.code ?? 0) > 2;
            if (filterStatus === 'passed') return isPassed;
            if (filterStatus === 'failed') return !isPassed;
            return true;
        })
        .filter((pred) => {
            if (filterProficiency === 'all') return true;
            return pred.proficiency?.label === filterProficiency;
        })
        .filter((pred) => {
            if (filterSection === 'all') return true;
            return pred.Section === filterSection;
        })
        .filter((pred) => {
            if (!searchQuery.trim()) return true;
            const query = searchQuery.toLowerCase();
            return (
                (String(pred.learnerID)?.toLowerCase()?.includes(query)) ||
                (pred.School?.toLowerCase().includes(query)) ||
                (pred.Section?.toLowerCase().includes(query)) ||
                (pred.proficiency?.label?.toLowerCase().includes(query))
            );
        })
        .sort((a, b) => {
            const aValue = a[sortField];
            const bValue = b[sortField];

            if (aValue === null || aValue === undefined) return 1;
            if (bValue === null || bValue === undefined) return -1;

            if (typeof aValue === 'number' && typeof bValue === 'number') {
                return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
            }

            const aStr = String(aValue).toLowerCase();
            const bStr = String(bValue).toLowerCase();
            return sortDirection === 'asc'
                ? aStr.localeCompare(bStr)
                : bStr.localeCompare(aStr);
        });

    const totalPredictions = predictions.length;
    const avgPassPct = totalPredictions > 0 && predictions?.length > 0 && predictions[0]?.pass_probability != null
        ? (predictions.reduce((sum, p) => sum + (p.pass_probability ?? 0), 0) / totalPredictions) * 100
        : null;

    const isGood = avgPassPct !== null && avgPassPct >= 50;

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

    if (predictions.length === 0) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
                    {/* Empty state content - keep as is */}
                    <div className="rounded-full bg-yellow-100 w-16 h-16 flex items-center justify-center mx-auto mb-4">
                        <svg className="h-8 w-8 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">No Dataset Uploaded</h2>
                    <p className="text-gray-600 mb-6">
                        {hasAnySession
                            ? "You have previous sessions, but no dataset is available in this session. Would you like to start a new analysis or return to your dashboard?"
                            : "You need to upload a dataset first before viewing prediction results. Go to the Dashboard to upload your data."
                        }
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <button
                            onClick={() => navigate('/dashboard')}
                            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
                        >
                            Go to Dashboard
                        </button>
                        {hasAnySession && (
                            <button
                                onClick={() => navigate('/home')}
                                className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition"
                            >
                                Select Session
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8" ref={resultsContainerRef}>
            {/* Page Header with Export Options */}
            <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px', background: 'linear-gradient(135deg, #3da6e2 0%, #1480be 100%)', borderRadius: '16px', color: '#fff' }}>
                <div className="header-content">
                    <h1 style={{ margin: '0 0 8px 0', fontSize: '28px', fontWeight: '700' }}>Prediction Results</h1>
                    <p style={{ margin: 0, opacity: 0.9, fontSize: '14px' }}>
                        {sessionName && <span style={{ fontWeight: 600 }}>Session: {sessionName}</span>}
                        {sessionName && <span style={{ margin: '0 8px' }}>|</span>}
                        {fileName} - {totalPredictions} predictions generated
                    </p>
                </div>
                <div className="header-actions" style={{ display: 'flex', gap: '12px' }}>
                    <button
                        onClick={() => exportToCSV(predictions, fileName, hasSection)}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.5)', borderRadius: '8px', color: '#fff', fontWeight: '500', cursor: 'pointer' }}
                    >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Export CSV
                    </button>
                    <button
                        onClick={() => exportToPDF(predictions, fileName, sessionName, hasSection)}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.5)', borderRadius: '8px', color: '#fff', fontWeight: '500', cursor: 'pointer' }}
                    >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Download PDF
                    </button>
                </div>
            </header>


            {/* Filter Section */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Prediction Results</h2>
                        <p className="text-sm text-gray-500 mt-1">
                            Showing {filteredAndSortedPredictions.length} of {totalPredictions} predictions
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                            <input
                                type="text"
                                placeholder="Search student ID, school..."
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
                            />
                        </div>
                        <select
                            value={filterStatus}
                            onChange={(e) => {
                                setFilterStatus(e.target.value as 'all' | 'passed' | 'failed');
                                setCurrentPage(1);
                            }}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="all">All Bands</option>
                            {predictions[0]?.probability_breakdown && predictions[0].probability_breakdown.map((band, idx) => (
                                <option key={idx} value={band.code.toString()}>{band.label}</option>
                            ))}
                        </select>
                        <select
                            value={filterProficiency}
                            onChange={(e) => {
                                setFilterProficiency(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="all">All Proficiencies</option>
                            {uniqueProficiencies.map((prof) => (
                                <option key={prof} value={prof}>{prof}</option>
                            ))}
                        </select>
                        {/* Section Filter - Only show if Section column exists */}
                        {hasSection && uniqueSections.length > 0 && (
                            <select
                                value={filterSection}
                                onChange={(e) => {
                                    setFilterSection(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="all">All Sections</option>
                                {uniqueSections.map((section) => (
                                    <option key={section} value={section}>{section}</option>
                                ))}
                            </select>
                        )}
                    </div>
                </div>
            </div>

            {/* Results Table */}
            <div className="feature-importance-section bg-white rounded-2xl shadow-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('learnerID')}>
                                    <div className="flex items-center space-x-1">
                                        <span>Learner ID</span>
                                        {sortField === 'learnerID' && (
                                            <svg className={`h-4 w-4 ${sortDirection === 'asc' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                            </svg>
                                        )}
                                    </div>
                                </th>
                                {hasSection && (
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('Section')}>
                                        <div className="flex items-center space-x-1">
                                            <span>Section</span>
                                            {sortField === 'Section' && (
                                                <svg className={`h-4 w-4 ${sortDirection === 'asc' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                </svg>
                                            )}
                                        </div>
                                    </th>
                                )}
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('prediction')}>
                                    <div className="flex items-center space-x-1">
                                        <span>Predicted MPS</span>
                                        {sortField === 'prediction' && (
                                            <svg className={`h-4 w-4 ${sortDirection === 'asc' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                            </svg>
                                        )}
                                    </div>
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Proficiency</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Probability Breakdown</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pass Probability <br />P(MPS ≥ 75)</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredAndSortedPredictions
                                .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                                .map((result, index) => (
                                    <tr key={index} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                            {result.learnerID || '-'}
                                        </td>
                                        {hasSection && (
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {result.Section || '-'}
                                            </td>
                                        )}
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            <span className={`font-semibold ${result.prediction >= 75 ? 'text-green-600' : 'text-red-600'}`}>
                                                {result.prediction.toFixed(1)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span
                                                className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full"
                                                style={{
                                                    backgroundColor: result.proficiency?.color + '20',
                                                    color: result.proficiency?.color
                                                }}
                                            >
                                                {result.proficiency?.label || 'N/A'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {result.probability_breakdown && result.probability_breakdown.length > 0 ? (
                                                <div className="flex flex-col gap-1">
                                                    {result.probability_breakdown.map((band, idx) => (
                                                        <div key={idx} className="flex items-center justify-between gap-2">
                                                            <span
                                                                className="px-2 py-0.5 text-xs rounded-full"
                                                                style={{
                                                                    backgroundColor: band.color + '20',
                                                                    color: band.color,
                                                                    border: result.top_probable_band?.code === band.code ? '2px solid ' + band.color : 'none'
                                                                }}
                                                            >
                                                                {band.label}
                                                            </span>
                                                            <span className="text-xs font-medium text-gray-600">
                                                                {(band.probability * 100).toFixed(1)}%
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${(result.proficiency?.code ?? 0) >= 2 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                    {(result.proficiency?.code ?? 0) >= 2 ? 'Passed' : 'Failed'}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {result.pass_probability != null
                                                ? <span className={`font-semibold ${result.pass_probability >= 0.5 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {(result.pass_probability * 100).toFixed(1)}%
                                                </span>
                                                : '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <button
                                                onClick={() => setSelectedStudent(result.learnerID || '')}
                                                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                                            >
                                                Feature Importance
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination - Keep as is */}
            {filteredAndSortedPredictions.length > itemsPerPage && (
                <div className="bg-white rounded-2xl shadow-lg p-4">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="text-sm text-gray-500">
                                Showing {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filteredAndSortedPredictions.length)} of {filteredAndSortedPredictions.length}
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="text-sm text-gray-500">Rows per page:</label>
                                <select
                                    value={itemsPerPage}
                                    onChange={(e) => {
                                        setItemsPerPage(Number(e.target.value));
                                        setCurrentPage(1);
                                    }}
                                    className="px-2 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value={10}>10</option>
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex items-center space-x-2">
                            <button
                                onClick={() => {
                                    setCurrentPage(1);
                                    setPageInput('1');
                                }}
                                disabled={currentPage === 1}
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition"
                            >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                                </svg>
                            </button>
                            <button
                                onClick={() => {
                                    setCurrentPage((p) => Math.max(1, p - 1));
                                    setPageInput(String(Math.max(1, currentPage - 1)));
                                }}
                                disabled={currentPage === 1}
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition"
                            >
                                Previous
                            </button>
                            <div className="flex items-center space-x-1">
                                <input
                                    type="number"
                                    min={1}
                                    max={Math.ceil(filteredAndSortedPredictions.length / itemsPerPage)}
                                    value={pageInput}
                                    onChange={(e) => setPageInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            const page = parseInt(pageInput);
                                            const totalPages = Math.ceil(filteredAndSortedPredictions.length / itemsPerPage);
                                            if (!isNaN(page) && page >= 1 && page <= totalPages) {
                                                setCurrentPage(page);
                                            } else {
                                                setPageInput(String(currentPage));
                                            }
                                        }
                                    }}
                                    className="w-16 px-2 py-2 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Page"
                                />
                                <span className="text-sm text-gray-500">of {Math.ceil(filteredAndSortedPredictions.length / itemsPerPage)}</span>
                            </div>
                            <button
                                onClick={() => {
                                    const totalPages = Math.ceil(filteredAndSortedPredictions.length / itemsPerPage);
                                    setCurrentPage((p) => Math.min(totalPages, p + 1));
                                    setPageInput(String(Math.min(totalPages, currentPage + 1)));
                                }}
                                disabled={currentPage >= Math.ceil(filteredAndSortedPredictions.length / itemsPerPage)}
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition"
                            >
                                Next
                            </button>
                            <button
                                onClick={() => {
                                    const totalPages = Math.ceil(filteredAndSortedPredictions.length / itemsPerPage);
                                    setCurrentPage(totalPages);
                                    setPageInput(String(totalPages));
                                }}
                                disabled={currentPage >= Math.ceil(filteredAndSortedPredictions.length / itemsPerPage)}
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition"
                            >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Per-Student Feature Importance Modal - Keep as is */}
            {selectedStudent && (
                <div className="per-student-feature-modal fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm min-h-screen w-full"
                        onClick={() => setSelectedStudent(null)}
                    />
                    <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden">
                        <div className="p-6 border-b border-gray-200">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-gray-900">
                                    Feature Importance for Student - {predictions.find(p => p.learnerID === selectedStudent)?.learnerID || selectedStudent}
                                </h3>
                                <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 bg-blue-50 px-3 py-2 rounded-lg">
                                    <svg className="h-4 w-4 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span>These are historical grades (Past Performance) - they cannot be changed but help predict future scores.</span>
                                </div>
                                <button
                                    onClick={() => setSelectedStudent(null)}
                                    className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition"
                                >
                                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div className="p-6 overflow-y-auto max-h-[65vh]">
                            {/* What is this section? */}
                            <div className="mb-6 p-4 bg-amber-50 rounded-xl border border-amber-100">
                                <h4 className="text-sm font-semibold text-amber-800 mb-2 flex items-center">
                                    <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    Important: These are Historical Grades
                                </h4>
                                <p className="text-sm text-amber-700 mb-3">
                                    The features shown below are <strong>past grades from Grades 1-5</strong>. These cannot be changed or improved - they are simply records of the student's academic history that help predict future performance.
                                </p>
                                <div className="grid grid-cols-2 gap-3 text-xs">
                                    <div className="flex items-start">
                                        <span className="inline-block w-3 h-3 rounded-full bg-green-500 mr-2 mt-0.5"></span>
                                        <div>
                                            <span className="font-semibold text-green-700">Positive (Green)</span>
                                            <p className="text-green-600">Past performance that helped predict a higher score</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start">
                                        <span className="inline-block w-3 h-3 rounded-full bg-red-500 mr-2 mt-0.5"></span>
                                        <div>
                                            <span className="font-semibold text-red-700">Negative (Red)</span>
                                            <p className="text-red-600">Past performance patterns that correlated with lower scores</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {predictions.length > 0 && predictions[0].explanation ? (
                                <div className="space-y-4">
                                    {(() => {
                                        const selectedPrediction = predictions.find(p => p.learnerID === selectedStudent);
                                        if (selectedPrediction && selectedPrediction.explanation) {
                                            const explanation = selectedPrediction.explanation;
                                            return (
                                                <>
                                                    <div>
                                                        <h5 className="text-sm font-semibold text-gray-700 mb-3">Top Influencing Factors</h5>
                                                        {explanation.top_drivers.map((feat, idx) => {
                                                            const maxContribution = Math.max(...explanation.top_drivers.map(f => Math.abs(f.shap_value)));
                                                            const percentage = maxContribution > 0 ? (Math.abs(feat.shap_value) / maxContribution) * 100 : 0;
                                                            return (
                                                                <div key={feat.feature} className="flex items-center space-x-4 mb-4">
                                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${feat.direction === 'positive' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                                                        {idx + 1}
                                                                    </div>
                                                                    <div className="flex-1">
                                                                        <div className="flex items-center justify-between mb-1">
                                                                            <span className="text-sm font-medium text-gray-700">{getFriendlyFeatureName(feat.feature)}</span>
                                                                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${feat.direction === 'positive' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                                                {feat.direction === 'positive' ? '↑ Boosted Score' : '↓ Lowered Score'}
                                                                            </span>
                                                                        </div>
                                                                        <div className="w-full bg-gray-100 rounded-full h-2.5">
                                                                            <div
                                                                                className={`h-2.5 rounded-full transition-all duration-500 ${feat.direction === 'positive' ? 'bg-gradient-to-r from-green-400 to-green-600' : 'bg-gradient-to-r from-red-400 to-red-600'}`}
                                                                                style={{ width: `${percentage}%` }}
                                                                            />
                                                                        </div>
                                                                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                                                                            <span>Impact: {feat.shap_value > 0 ? '+' : ''}{feat.shap_value.toFixed(3)}</span>
                                                                            <span>{percentage.toFixed(0)}% of total impact</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                    <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
                                                        <h5 className="text-sm font-semibold text-blue-800 mb-2 flex items-center">
                                                            <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                                            </svg>
                                                            What This Means for the Student
                                                        </h5>
                                                        <ul className="text-sm text-blue-700 space-y-2">
                                                            {explanation.top_drivers
                                                                .filter(f => f.direction === 'negative')
                                                                .slice(0, 3)
                                                                .map((feat, idx) => {
                                                                    const category = getFeatureCategory(feat.feature);
                                                                    const isAcademicHistory = category === 'Academic History';
                                                                    return (
                                                                        <li key={idx} className="flex items-start">
                                                                            <span className="mr-2">•</span>
                                                                            <span>
                                                                                <strong>"{getFriendlyFeatureName(feat.feature)}"</strong> contributes a negative impact on the predicted score, make an investigation about this.
                                                                                {isAcademicHistory && ' (Past grades cannot be changed, but indicate areas needing current support)'}
                                                                            </span>
                                                                        </li>
                                                                    );
                                                                })}
                                                            {explanation.top_drivers.filter(f => f.direction === 'negative').length === 0 && (
                                                                <li className="flex items-start">
                                                                    <span className="mr-2">•</span>
                                                                    <span>Major factors are positively contributing to this student's predicted score. The student's historical performance shows strong academic foundations.</span>
                                                                </li>
                                                            )}
                                                        </ul>
                                                        <div className="mt-3 pt-3 border-t border-blue-200 text-xs text-blue-600">
                                                            <strong>Note:</strong> All features shown are from historical data (past grades) which cannot be changed. This analysis helps identify patterns and strengths, but current teaching and support are what can actually improve future outcomes.
                                                        </div>
                                                    </div>
                                                    <div className="mt-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-500">
                                                        <span className="font-medium">Base Score:</span> {explanation.base_value?.toFixed(1) || 'N/A'} (the average prediction before considering specific factors)
                                                    </div>
                                                </>
                                            );
                                        }
                                        return (
                                            <div className="text-center py-8 text-gray-500">
                                                <svg className="h-12 w-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                <p>Feature importance data not available for this student</p>
                                            </div>
                                        );
                                    })()}
                                </div>
                            ) : (
                                <div className="text-center py-8 text-gray-500">
                                    <svg className="h-12 w-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    <p>Explanations not available</p>
                                    <p className="text-xs mt-1">Please re-run the analysis to generate feature explanations</p>
                                </div>
                            )}
                        </div>
                    </div>
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
    );
}