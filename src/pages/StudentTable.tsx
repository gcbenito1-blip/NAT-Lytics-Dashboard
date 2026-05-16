import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../config';

type SortKey = 'id' | 'school' | 'actualMPS' | 'actual_proficiency' | 'predictedMPS' | 'predicted_proficiency' | 'difference' | 'errorMagnitude';

export function StudentTable() {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [testResults, setTestResults] = useState<any[]>([]);
    const [uniqueSchools, setUniqueSchools] = useState<string[]>([]);
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const [selectedModel, setSelectedModel] = useState<string>('');

    // Filter state
    const [filters, setFilters] = useState({
        school: '',
        actual_proficiency: '',
        predicted_proficiency: '',
        difference: '',
        errorMin: '',
        errorMax: '',
    });

    // Sort state
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' } | null>(null);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(20);

    useEffect(() => {
        const fetchModels = async () => {
            try {
                const modelRes = await fetch(`${API_BASE_URL}/model-predict`);
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
                const testRes = await fetch(`${API_BASE_URL}/api/test-results?model=${encodeURIComponent(selectedModel)}`);
                if (testRes.ok) {
                    const testData = await testRes.json();
                    const transformed = (testData.results || []).map((r: any) => ({
                        id: r.learnerID,
                        school: r.School,
                        actualMPS: r.Actual_MPS,
                        predictedMPS: r.Predicted_MPS,
                        difference: r.Difference,
                        actual_proficiency: r.Actual_Proficiency,
                        predicted_proficiency: r.Predicted_Proficiency,
                        errorMagnitude: r.Error_Magnitude,
                    }));
                    setTestResults(transformed);
                    const schools = Array.from(new Set(transformed.map((r: any) => r.school) as string[])).sort() as string[];
                    setUniqueSchools(schools);
                }
            } catch (error) {
                console.error('Failed to fetch test results:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [selectedModel]);

    // Filtered results
    let filteredResults = testResults.filter((student) => {
        if (filters.school && student.school !== filters.school) return false;
        if (filters.actual_proficiency && student.actual_proficiency !== filters.actual_proficiency) return false;
        if (filters.predicted_proficiency && student.predicted_proficiency !== filters.predicted_proficiency) return false;
        if (filters.difference && Math.abs(student.difference) > parseFloat(filters.difference)) return false;
        if (filters.errorMin && student.errorMagnitude < parseFloat(filters.errorMin)) return false;
        if (filters.errorMax) {
            const absDiff = Math.abs(student.difference);
            const studentErrorLevel = absDiff < 2 ? 'Low' : absDiff < 3 ? 'Medium' : 'High';
            const levelOrder = { Low: 0, Medium: 1, High: 2 };
            if (levelOrder[studentErrorLevel as keyof typeof levelOrder] > levelOrder[filters.errorMax as keyof typeof levelOrder]) return false;
        }
        return true;
    });

    // Apply sorting
    if (sortConfig !== null) {
        filteredResults.sort((a, b) => {
            const aVal = a[sortConfig.key];
            const bVal = b[sortConfig.key];

            if (typeof aVal === 'string' && typeof bVal === 'string') {
                return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            }
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
            }
            return 0;
        });
    }

    // Pagination
    const totalPages = Math.ceil(filteredResults.length / rowsPerPage);
    const paginatedResults = filteredResults.slice(
        (currentPage - 1) * rowsPerPage,
        (currentPage - 1) * rowsPerPage + rowsPerPage
    );

    useEffect(() => {
        setCurrentPage(1);
    }, [filters, sortConfig]);

    const handleSort = (key: SortKey) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const getSortIndicator = (key: SortKey) => {
        if (!sortConfig || sortConfig.key !== key) return <span className="ml-1 text-gray-400">↕</span>;
        return sortConfig.direction === 'asc' ? <span className="ml-1 text-blue-600">↑</span> : <span className="ml-1 text-blue-600">↓</span>;
    };

    const downloadStudentTableCSV = () => {
        if (filteredResults.length === 0) return;
        const headers = ['learnerID', 'School', 'Actual_MPS', 'Actual_Proficiency', 'Predicted_MPS', 'Predicted_Proficiency', 'Difference', 'Error_Magnitude'];
        const csvRows = [headers.join(',')];
        for (const row of filteredResults) {
            csvRows.push([
                `"${row.id}"`,
                `"${row.school}"`,
                row.actualMPS.toFixed(4),
                `"${row.actual_proficiency}"`,
                row.predictedMPS.toFixed(4),
                `"${row.predicted_proficiency}"`,
                row.difference.toFixed(4),
                row.errorMagnitude.toFixed(4),
            ].join(','));
        }
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'student_predictions.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const getProficiencyBadgeClass = (proficiency: string) => {
        switch (proficiency) {
            case 'Highly Proficient': return 'bg-green-100 text-green-800';
            case 'Proficient': return 'bg-blue-100 text-blue-800';
            case 'Nearly Proficient': return 'bg-yellow-100 text-yellow-800';
            case 'Low Proficient': return 'bg-orange-100 text-orange-800';
            default: return 'bg-red-100 text-red-800';
        }
    };

    const getErrorBadgeClass = (diff: number) => {
        const absDiff = Math.abs(diff);
        if (absDiff < 2) return 'bg-green-100 text-green-800';
        if (absDiff < 3) return 'bg-yellow-100 text-yellow-800';
        return 'bg-red-100 text-red-800';
    };

    const getErrorLabel = (diff: number) => {
        const absDiff = Math.abs(diff);
        if (absDiff < 2) return 'Low';
        if (absDiff < 3) return 'Medium';
        return 'High';
    };

    if (loading && testResults.length === 0) {
        return (
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-4">Student Table</h1>
                    <p className="text-gray-600">View detailed student-level predictions and explanations. Drill down into individual student results.</p>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
                    <div className="h-96 flex items-center justify-center">
                        <p className="text-gray-500">Loading student data...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Student Table</h1>
                <p className="text-gray-600">View detailed student-level predictions and explanations. Drill down into individual student results.</p>
            </div>

            {/* Research Purpose Card */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg">
                <div className="p-6">
                    <h2 className="text-blue-900 flex items-center gap-2 text-lg font-semibold">
                        <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Research Purpose
                    </h2>
                    <div className="mt-4 text-sm text-blue-900 space-y-2">
                        <p className="font-semibold">Purpose of Individual-Level Prediction Table:</p>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                            <li><span className="font-medium">Prediction Accuracy Record:</span> Documents actual vs. predicted MPS for each learner</li>
                            <li><span className="font-medium">Outlier Investigation:</span> Identifies large prediction errors for case-level investigation</li>
                            <li><span className="font-medium">Downloadable Research Record:</span> Enables offline analysis in Python/Excel</li>
                        </ul>
                        <p className="mt-2 text-xs font-semibold">Note: For research validation, not for identifying which specific students need remediation.</p>
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
                            setCurrentPage(1);
                            setFilters({ school: '', actual_proficiency: '', predicted_proficiency: '', difference: '', errorMin: '', errorMax: '' });
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

            {/* Main Table Card */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
                <div className="p-6">
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">Individual Learner Predictions</h2>
                            <p className="text-sm text-gray-600">Actual vs. Predicted NAT MPS with error analysis ({filteredResults.length} records)</p>
                        </div>
                        <button
                            onClick={downloadStudentTableCSV}
                            disabled={filteredResults.length === 0}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md border transition ${filteredResults.length === 0 ? 'border-gray-200 text-gray-400 cursor-not-allowed' : 'border-gray-300 text-gray-700 hover:bg-gray-50 cursor-pointer'}`}
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Download CSV
                        </button>
                    </div>

                    {/* Filters */}
                    <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            {/* School Filter */}
                            <div>
                                <label htmlFor="school-filter" className="block text-sm font-medium text-gray-700 mb-1">School</label>
                                <select
                                    id="school-filter"
                                    value={filters.school || '__all__'}
                                    onChange={(e) => setFilters({ ...filters, school: e.target.value === '__all__' ? '' : e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    <option value="__all__">All Schools</option>
                                    {uniqueSchools.map((school) => (
                                        <option key={school} value={school}>{school}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Actual Proficiency Filter */}
                            <div>
                                <label htmlFor="actual-prof-filter" className="block text-sm font-medium text-gray-700 mb-1">Actual Proficiency</label>
                                <select
                                    id="actual-prof-filter"
                                    value={filters.actual_proficiency || '__all__'}
                                    onChange={(e) => setFilters({ ...filters, actual_proficiency: e.target.value === '__all__' ? '' : e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    <option value="__all__">All Levels</option>
                                    <option value="Highly Proficient">Highly Proficient</option>
                                    <option value="Proficient">Proficient</option>
                                    <option value="Nearly Proficient">Nearly Proficient</option>
                                    <option value="Low Proficient">Low Proficient</option>
                                    <option value="Not Proficient">Not Proficient</option>
                                </select>
                            </div>

                            {/* Predicted Proficiency Filter */}
                            <div>
                                <label htmlFor="pred-prof-filter" className="block text-sm font-medium text-gray-700 mb-1">Predicted Proficiency</label>
                                <select
                                    id="pred-prof-filter"
                                    value={filters.predicted_proficiency || '__all__'}
                                    onChange={(e) => setFilters({ ...filters, predicted_proficiency: e.target.value === '__all__' ? '' : e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    <option value="__all__">All Levels</option>
                                    <option value="Highly Proficient">Highly Proficient</option>
                                    <option value="Proficient">Proficient</option>
                                    <option value="Nearly Proficient">Nearly Proficient</option>
                                    <option value="Low Proficient">Low Proficient</option>
                                    <option value="Not Proficient">Not Proficient</option>
                                </select>
                            </div>

                            {/* Difference Filter */}
                            <div>
                                <label htmlFor="difference-filter" className="block text-sm font-medium text-gray-700 mb-1">Max Difference (≤)</label>
                                <input
                                    id="difference-filter"
                                    type="number"
                                    placeholder="e.g., 5"
                                    value={filters.difference}
                                    onChange={(e) => setFilters({ ...filters, difference: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                            </div>

                            {/* Error Max Filter */}
                            <div>
                                <label htmlFor="error-max" className="block text-sm font-medium text-gray-700 mb-1">Error Magnitude</label>
                                <select
                                    id="error-max"
                                    value={filters.errorMax || '__all__'}
                                    onChange={(e) => setFilters({ ...filters, errorMax: e.target.value === '__all__' ? '' : e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    <option value="__all__">All Levels</option>
                                    <option value="Low">Low</option>
                                    <option value="Medium">Medium</option>
                                    <option value="High">High</option>
                                </select>
                            </div>
                        </div>

                        <div className="mt-3 flex gap-2 items-center">
                            <button
                                onClick={() => setFilters({ school: '', actual_proficiency: '', predicted_proficiency: '', difference: '', errorMin: '', errorMax: '' })}
                                className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition"
                            >
                                Clear Filters
                            </button>
                            <span className="text-sm text-gray-600">
                                Showing {paginatedResults.length} of {filteredResults.length} records (Total: {testResults.length})
                            </span>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    <th className="text-left py-3 px-4 font-semibold text-sm text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('id')}>
                                        Learner ID {getSortIndicator('id')}
                                    </th>
                                    <th className="text-left py-3 px-4 font-semibold text-sm text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('school')}>
                                        School {getSortIndicator('school')}
                                    </th>
                                    <th className="text-left py-3 px-4 font-semibold text-sm text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('actualMPS')}>
                                        Actual MPS {getSortIndicator('actualMPS')}
                                    </th>
                                    <th className="text-left py-3 px-4 font-semibold text-sm text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('actual_proficiency')}>
                                        Actual Proficiency {getSortIndicator('actual_proficiency')}
                                    </th>
                                    <th className="text-left py-3 px-4 font-semibold text-sm text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('predictedMPS')}>
                                        Predicted MPS {getSortIndicator('predictedMPS')}
                                    </th>
                                    <th className="text-left py-3 px-4 font-semibold text-sm text-gray-700 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('predicted_proficiency')}>
                                        Predicted Proficiency {getSortIndicator('predicted_proficiency')}
                                    </th>
                                    <th className="text-left py-3 px-4 font-semibold text-sm text-gray-700 cursor-pointer hover:bg-gray-100 relative group" onClick={() => handleSort('difference')}>
                                        Difference {getSortIndicator('difference')}
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none w-64 z-10">
                                            <div className="mb-1"><span className="font-semibold">Positive value:</span> Model overestimated — learner performed lower than predicted.</div>
                                            <div><span className="font-semibold">Negative value:</span> Model underestimated — learner performed better than predicted.</div>
                                        </div>
                                    </th>
                                    <th className="text-left py-3 px-4 font-semibold text-sm text-gray-700 cursor-pointer hover:bg-gray-100 relative group" onClick={() => handleSort('errorMagnitude')}>
                                        Error Magnitude {getSortIndicator('errorMagnitude')}
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none w-64 z-10">
                                            <div className="mb-1"><span className="font-semibold">High:</span> Difference &gt; 3 points — flagged for investigation.</div>
                                            <div className="mb-1"><span className="font-semibold">Medium:</span> Difference 2-3 points — acceptable range.</div>
                                            <div><span className="font-semibold">Low:</span> Difference &lt; 2 points — high accuracy.</div>
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedResults.map((student) => (
                                    <tr key={student.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                                        <td className="py-3 px-4 font-medium text-sm">{student.id}</td>
                                        <td className="py-3 px-4 text-sm text-gray-600">{student.school}</td>
                                        <td className="py-3 px-4">{student.actualMPS.toFixed(1)}</td>
                                        <td className="py-3 px-4">
                                            <span className={`px-2 py-1 rounded-full text-xs font-semibold relative group ${getProficiencyBadgeClass(student.actual_proficiency)}`}>
                                                {student.actual_proficiency}
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none w-48 z-10">
                                                    <div><span className="font-semibold">Highly Proficient:</span> 90-100</div>
                                                    <div><span className="font-semibold">Proficient:</span> 75-89</div>
                                                    <div><span className="font-semibold">Nearly Proficient:</span> 50-74</div>
                                                    <div><span className="font-semibold">Low Proficient:</span> 25-49</div>
                                                    <div><span className="font-semibold">Not Proficient:</span> 0-24</div>
                                                </div>
                                            </span>
                                        </td>
                                        <td className="py-3 px-4">{student.predictedMPS.toFixed(1)}</td>
                                        <td className="py-3 px-4">
                                            <span className={`px-2 py-1 rounded-full text-xs font-semibold relative group ${getProficiencyBadgeClass(student.predicted_proficiency)}`}>
                                                {student.predicted_proficiency}
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none w-48 z-10">
                                                    <div><span className="font-semibold">Highly Proficient:</span> 90-100</div>
                                                    <div><span className="font-semibold">Proficient:</span> 75-89</div>
                                                    <div><span className="font-semibold">Nearly Proficient:</span> 50-74</div>
                                                    <div><span className="font-semibold">Low Proficient:</span> 25-49</div>
                                                    <div><span className="font-semibold">Not Proficient:</span> 0-24</div>
                                                </div>
                                            </span>
                                        </td>
                                        <td className={`py-3 px-4 font-medium relative group ${Math.abs(student.difference) > 3 ? 'text-red-600' : ''}`}>
                                            <span className="cursor-help">{student.difference > 0 ? '+' : ''}{student.difference.toFixed(1)}</span>
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none w-64 z-10">
                                                {student.difference > 0 ? (
                                                    <div><span className="font-semibold">Positive value:</span> Model overestimated — learner performed lower than predicted.</div>
                                                ) : (
                                                    <div><span className="font-semibold">Negative value:</span> Model underestimated — learner performed better than predicted.</div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className={`px-2 py-1 rounded-full text-xs font-semibold relative group ${getErrorBadgeClass(student.difference)}`}>
                                                {getErrorLabel(student.difference)}
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none w-64 z-10">
                                                    <div className="mb-1"><span className="font-semibold">High:</span> Difference &gt; 3 points — flagged for investigation.</div>
                                                    <div className="mb-1"><span className="font-semibold">Medium:</span> Difference 2-3 points — acceptable range.</div>
                                                    <div><span className="font-semibold">Low:</span> Difference &lt; 2 points — high accuracy.</div>
                                                </div>
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="mt-4 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setCurrentPage(1)}
                                    disabled={currentPage === 1}
                                    className={`px-3 py-1.5 text-sm border rounded-md transition ${currentPage === 1 ? 'border-gray-200 text-gray-400 cursor-not-allowed' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                                >
                                    First
                                </button>
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className={`px-3 py-1.5 text-sm border rounded-md transition ${currentPage === 1 ? 'border-gray-200 text-gray-400 cursor-not-allowed' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                                >
                                    Prev
                                </button>
                            </div>

                            <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-600">Page {currentPage} of {totalPages}</span>
                                <input
                                    type="number"
                                    min={1}
                                    max={totalPages}
                                    value={currentPage}
                                    onChange={(e) => { const val = parseInt(e.target.value); if (val >= 1 && val <= totalPages) setCurrentPage(val); }}
                                    className="w-16 px-2 py-1 text-sm border border-gray-300 rounded-md text-center"
                                />
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className={`px-3 py-1.5 text-sm border rounded-md transition ${currentPage === totalPages ? 'border-gray-200 text-gray-400 cursor-not-allowed' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                                >
                                    Next
                                </button>
                                <button
                                    onClick={() => setCurrentPage(totalPages)}
                                    disabled={currentPage === totalPages}
                                    className={`px-3 py-1.5 text-sm border rounded-md transition ${currentPage === totalPages ? 'border-gray-200 text-gray-400 cursor-not-allowed' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                                >
                                    Last
                                </button>
                            </div>

                            <div className="flex items-center gap-2">
                                <label htmlFor="rows-per-page" className="text-sm text-gray-600">Rows per page:</label>
                                <select
                                    id="rows-per-page"
                                    value={rowsPerPage}
                                    onChange={(e) => { setRowsPerPage(parseInt(e.target.value)); setCurrentPage(1); }}
                                    className="w-20 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    <option value="10">10</option>
                                    <option value="20">20</option>
                                    <option value="50">50</option>
                                    <option value="100">100</option>
                                </select>
                            </div>
                        </div>
                    )}

                    <div className="mt-4 text-xs text-gray-600 space-y-1">
                        <p><span className="font-semibold">Difference Interpretation:</span> Positive = model underestimated; negative = overestimation</p>
                        <p><span className="font-semibold">Error Magnitude:</span> Red cells (|difference| &gt; 3) indicate cases worth investigating</p>
                    </div>
                </div>
            </div>

            {/* Error Analysis Summary */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg">
                <div className="p-6">
                    <h2 className="text-amber-900 text-lg font-semibold mb-4">Error Analysis Summary</h2>
                    <div className="grid md:grid-cols-3 gap-4">
                        <div>
                            <p className="font-semibold">High Error Cases (|diff| &gt; 3):</p>
                            <p className="text-2xl font-bold text-red-600">
                                {filteredResults.filter(s => Math.abs(s.difference) > 3).length}
                            </p>
                            <p className="text-xs text-gray-600">Requires case-level investigation</p>
                        </div>
                        <div>
                            <p className="font-semibold">Medium Error Cases (2-3):</p>
                            <p className="text-2xl font-bold text-yellow-600">
                                {filteredResults.filter(s => Math.abs(s.difference) >= 2 && Math.abs(s.difference) <= 3).length}
                            </p>
                            <p className="text-xs text-gray-600">Acceptable prediction range</p>
                        </div>
                        <div>
                            <p className="font-semibold">Low Error Cases (&lt; 2):</p>
                            <p className="text-2xl font-bold text-green-600">
                                {filteredResults.filter(s => Math.abs(s.difference) < 2).length}
                            </p>
                            <p className="text-xs text-gray-600">High accuracy predictions</p>
                        </div>
                    </div>
                    <p className="mt-4 text-xs text-gray-700">
                        <span className="font-semibold">For Chapter 4 Discussion:</span> Focus on high-error cases to identify learner characteristics where the model struggles.
                    </p>
                </div>
            </div>
        </div>
    );
}
