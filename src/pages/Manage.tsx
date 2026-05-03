import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
    getManageRequestsSent,
    sendManageRequest,
    cancelManageRequest,
    searchUsersNew,
    ManageRequest,
} from '../lib/groups';
import { getSessionsByEmail, Session } from '../lib/sessions';
import { PredictionResult as ApiPredictionResult } from '../services/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Helper function to get predictions from session
function getSessionPredictions(session: Session): ApiPredictionResult[] | null {
    if (session.predictions && Array.isArray(session.predictions)) {
        return session.predictions as ApiPredictionResult[];
    }
    return null;
}

interface SearchResult {
    email: string;
    firstName: string;
    lastName: string;
    id: string;
}

export function Manage() {
    const { user } = useAuth();

    const [manageRequests, setManageRequests] = useState<ManageRequest[]>([]);
    const [loading, setLoading] = useState(true);

    // Search states
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [showSearchResults, setShowSearchResults] = useState(false);

    // User sessions states
    const [userEmail, setUserEmail] = useState<string>('');
    const [userName, setUserName] = useState<string>('');
    const [userSessions, setUserSessions] = useState<Session[]>([]);
    const [showUserSessions, setShowUserSessions] = useState(false);
    const [selectedSessionForResults, setSelectedSessionForResults] = useState<Session | null>(null);
    const [sessionPredictions, setSessionPredictions] = useState<ApiPredictionResult[] | null>(null);

    useEffect(() => {
        if (user) {
            loadManageRequests();
        }
    }, [user]);

    const loadManageRequests = () => {
        if (!user) return;
        const requests = getManageRequestsSent(user.uid);
        setManageRequests(requests);
        setLoading(false);
    };

    const handleSearch = (query: string) => {
        setSearchQuery(query);
        if (query.trim().length >= 2) {
            setSearching(true);
            const results = searchUsersNew(query, user?.email);
            setSearchResults(results);
            setShowSearchResults(true);
            setSearching(false);
        } else {
            setSearchResults([]);
            setShowSearchResults(false);
        }
    };

    const handleSendRequest = (result: SearchResult) => {
        if (!user) return;

        const request = sendManageRequest(
            user.uid,
            `${user.firstName} ${user.lastName}`,
            user.email || '',
            result.email,
            `${result.firstName} ${result.lastName}`
        );

        if (request) {
            setManageRequests([...manageRequests, request]);
        }

        setSearchQuery('');
        setSearchResults([]);
        setShowSearchResults(false);
    };

    const handleCancelRequest = (requestId: string) => {
        if (!confirm('Are you sure you want to cancel this manage request?')) return;

        cancelManageRequest(requestId);
        setManageRequests(manageRequests.filter(r => r.id !== requestId));
    };

    const handleViewUserSessions = (email: string, name: string) => {
        setUserEmail(email);
        setUserName(name);
        const sessions = getSessionsByEmail(email);
        setUserSessions(sessions);
        setShowUserSessions(true);
    };

    const exportSessionsToCSV = (sessions: Session[], userEmail: string) => {
        const headers = ['Session Name', 'Created At', 'File Name', 'Total Predictions', 'Average Score'];
        const rows = sessions.map(s => [
            s.name,
            new Date(s.created_at).toLocaleString(),
            s.file_name || '',
            s.total_predictions?.toString() || '0',
            s.average_score?.toFixed(2) || '0'
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `sessions_${userEmail.replace(/@/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const exportResultsToCSV = (predictions: ApiPredictionResult[], sessionName: string) => {
        const headers = ['Student ID', 'Prediction', 'Proficiency', 'Most Probable Band'];
        const rows = predictions.map(p => [
            p.studentID || '',
            p.prediction?.toFixed(2) || '',
            p.proficiency?.label || '',
            p.top_probable_band?.label || ''
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `results_${sessionName.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const exportResultsToPDF = (predictions: ApiPredictionResult[], sessionName: string) => {
        try {
            if (!predictions || predictions.length === 0) {
                alert('No predictions to export');
                return;
            }

            const totalPreds = predictions.length;
            const avgScore = predictions.reduce((sum, p) => sum + (p.prediction || 0), 0) / totalPreds;
            const notLowProficient = predictions.filter(p => (p.proficiency?.code || 0) <= 1).length;
            const proficientPlus = predictions.filter(p => (p.proficiency?.code || 0) >= 3).length;

            const doc = new jsPDF();

            doc.setFontSize(18);
            doc.text('Prediction Results', 14, 22);

            doc.setFontSize(11);
            doc.text(`Session: ${sessionName}`, 14, 32);
            doc.text(`Total Predictions: ${totalPreds}`, 14, 40);
            doc.text(`Average Score: ${avgScore.toFixed(2)}`, 14, 48);
            doc.text(`Not/Low Proficient: ${notLowProficient}`, 14, 56);
            doc.text(`Proficient+: ${proficientPlus}`, 14, 64);

            const proficiencyData = [
                ['Not Proficient', predictions.filter(p => p.proficiency?.code === 0).length.toString()],
                ['Low Proficient', predictions.filter(p => p.proficiency?.code === 1).length.toString()],
                ['Nearly Proficient', predictions.filter(p => p.proficiency?.code === 2).length.toString()],
                ['Proficient', predictions.filter(p => p.proficiency?.code === 3).length.toString()],
                ['Highly Proficient', predictions.filter(p => p.proficiency?.code === 4).length.toString()]
            ];

            const firstTable = autoTable(doc, {
                startY: 75,
                head: [['Proficiency Level', 'Count']],
                body: proficiencyData,
                theme: 'striped',
                headStyles: { fillColor: [59, 130, 246] }
            }) as unknown as { finalY?: number; lastAutoTable?: { finalY: number } };

            const tableData = predictions.map(p => [
                p.studentID || '-',
                p.prediction?.toFixed(2) || '-',
                p.proficiency?.label || '-',
                p.top_probable_band?.label || '-'
            ]);

            const finalY = firstTable?.finalY || firstTable?.lastAutoTable?.finalY || 100;

            autoTable(doc, {
                startY: finalY + 15,
                head: [['Student ID', 'Prediction', 'Proficiency', 'Most Probable Band']],
                body: tableData,
                theme: 'striped',
                headStyles: { fillColor: [59, 130, 246] },
                styles: { fontSize: 9 }
            });

            const pageCount = doc.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(9);
                doc.text(`Generated on ${new Date().toLocaleString()} | ${totalPreds} predictions`, 14, doc.internal.pageSize.height - 7);
            }

            doc.save(`results_${sessionName.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
        } catch (error) {
            console.error('PDF export error:', error);
            alert(`Error exporting PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    };

    const handleViewSessionResults = (session: Session) => {
        const predictions = getSessionPredictions(session);
        if (predictions && predictions.length > 0) {
            setSessionPredictions(predictions);
            setSelectedSessionForResults(session);
        } else {
            alert('No predictions available for this session.');
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900">Manage</h1>
                <p className="text-gray-600 mt-2">Search for teachers and send manage requests</p>
            </div>

            {/* Search Section */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Find Teacher</h2>
                <div className="relative">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => handleSearch(e.target.value)}
                        placeholder="Search by ID, name, or email..."
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />

                    {/* Search Results Dropdown */}
                    {showSearchResults && searchResults.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                            {searchResults.map((result, index) => (
                                <div
                                    key={index}
                                    className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                                    onClick={() => handleSendRequest(result)}
                                >
                                    <p className="font-medium text-gray-900">
                                        {result.firstName} {result.lastName}
                                    </p>
                                    <p className="text-sm text-gray-500">{result.email}</p>
                                    <p className="text-xs text-gray-400">ID: {result.id}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {showSearchResults && searchResults.length === 0 && searchQuery.length >= 2 && !searching && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-4">
                            <p className="text-gray-500 text-center">No users found</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Manage Requests List */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Manage Requests</h2>

                {manageRequests.length === 0 ? (
                    <div className="text-center py-12 bg-gray-50 rounded-xl">
                        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        <p className="mt-4 text-gray-500">No manage requests yet.</p>
                        <p className="text-sm text-gray-400 mt-2">Search for teachers above to send manage requests.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Teacher</th>
                                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Email</th>
                                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Status</th>
                                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Requested</th>
                                    <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {manageRequests.map((request) => (
                                    <tr key={request.id} className="border-b border-gray-100 hover:bg-gray-50">
                                        <td className="py-3 px-4 text-gray-900">
                                            {request.teacher_name}
                                        </td>
                                        <td className="py-3 px-4 text-gray-600">{request.teacher_email}</td>
                                        <td className="py-3 px-4">
                                            <span className={`px-2 py-1 text-xs rounded-full ${request.status === 'accepted'
                                                ? 'bg-green-100 text-green-700'
                                                : request.status === 'rejected'
                                                    ? 'bg-red-100 text-red-700'
                                                    : 'bg-yellow-100 text-yellow-700'
                                                }`}>
                                                {request.status}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-gray-600">
                                            {formatDate(request.requested_at)}
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                            <div className="flex justify-end space-x-2">
                                                {request.status === 'pending' && (
                                                    <button
                                                        onClick={() => handleCancelRequest(request.id)}
                                                        className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded-lg transition"
                                                    >
                                                        Cancel
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleViewUserSessions(request.teacher_email, request.teacher_name)}
                                                    className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                                >
                                                    View Sessions
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* User Sessions Modal */}
            {showUserSessions && userEmail && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-4xl mx-4 max-h-[80vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-semibold text-gray-900">
                                Sessions by {userName}
                            </h3>
                            <button
                                onClick={() => setShowUserSessions(false)}
                                className="p-2 hover:bg-gray-100 rounded-lg transition"
                            >
                                <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {userSessions.length === 0 ? (
                            <p className="text-gray-500 text-center py-8">No sessions found for this user.</p>
                        ) : (
                            <div className="space-y-3">
                                {userSessions.map((session) => (
                                    <div
                                        key={session.id}
                                        className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                                    >
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h4 className="font-medium text-gray-900">{session.name}</h4>
                                                <p className="text-sm text-gray-500">
                                                    Created: {formatDate(session.created_at)}
                                                </p>
                                                <div className="flex space-x-4 mt-2 text-sm">
                                                    <span className="text-gray-600">
                                                        Predictions: {session.total_predictions || 0}
                                                    </span>
                                                    <span className="text-gray-600">
                                                        Avg Score: {session.average_score?.toFixed(2) || '0'}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex space-x-2">
                                                <button
                                                    onClick={() => handleViewSessionResults(session)}
                                                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                                                >
                                                    View Results
                                                </button>
                                                <button
                                                    onClick={() => exportSessionsToCSV(userSessions, userEmail)}
                                                    className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
                                                >
                                                    Export CSV
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="mt-4 flex justify-end">
                            <button
                                onClick={() => exportSessionsToCSV(userSessions, userEmail)}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                            >
                                Export All Sessions
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Session Results Modal */}
            {selectedSessionForResults && sessionPredictions && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-4xl mx-4 max-h-[80vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-semibold text-gray-900">
                                Results: {selectedSessionForResults.name}
                            </h3>
                            <button
                                onClick={() => {
                                    setSelectedSessionForResults(null);
                                    setSessionPredictions(null);
                                }}
                                className="p-2 hover:bg-gray-100 rounded-lg transition"
                            >
                                <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="mb-4 flex space-x-2">
                            <button
                                onClick={() => exportResultsToCSV(sessionPredictions, selectedSessionForResults.name)}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                            >
                                Export CSV
                            </button>
                            <button
                                onClick={() => exportResultsToPDF(sessionPredictions, selectedSessionForResults.name)}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                            >
                                Export PDF
                            </button>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-gray-200">
                                        <th className="text-left py-2 px-3 text-sm font-medium text-gray-500">Student ID</th>
                                        <th className="text-left py-2 px-3 text-sm font-medium text-gray-500">Prediction</th>
                                        <th className="text-left py-2 px-3 text-sm font-medium text-gray-500">Proficiency</th>
                                        <th className="text-left py-2 px-3 text-sm font-medium text-gray-500">Most Probable Band</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sessionPredictions.slice(0, 100).map((pred, idx) => (
                                        <tr key={idx} className="border-b border-gray-100">
                                            <td className="py-2 px-3 text-gray-900">{pred.studentID || '-'}</td>
                                            <td className="py-2 px-3 text-gray-600">{pred.prediction?.toFixed(2) || '-'}</td>
                                            <td className="py-2 px-3 text-gray-600">{pred.proficiency?.label || '-'}</td>
                                            <td className="py-2 px-3 text-gray-600">{pred.top_probable_band?.label || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {sessionPredictions.length > 100 && (
                                <p className="text-sm text-gray-500 mt-2">Showing first 100 of {sessionPredictions.length} predictions</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}