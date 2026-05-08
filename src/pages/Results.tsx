import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { PredictionResult as ApiPredictionResult } from '../services/api';
import { getSession, getSessions } from '../lib/sessions';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ============================================================
// EXPORT HELPERS
// ============================================================

const exportToCSV = (
  predictions: ApiPredictionResult[],
  fileName: string,
  hasSection: boolean
) => {
  if (predictions.length === 0) return;

  const headers = [
    'Learner ID',
    ...(hasSection ? ['Section'] : []),
    'Predicted MPS',
    'Proficiency Level',
    'Pass Probability',
  ];

  const rows = predictions.map((pred) =>
    [
      String(pred.learnerID ?? ''),
      ...(hasSection ? [pred.Section ?? ''] : []),
      pred.prediction?.toString() ?? '',
      pred.proficiency?.label ?? '',
      pred.pass_probability != null
        ? (pred.pass_probability * 100).toFixed(1) + '%'
        : '',
    ].join(',')
  );

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName.replace(/\.csv$/i, '')}_predictions.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const exportToPDF = (
  predictions: ApiPredictionResult[],
  fileName: string,
  sessionName?: string,
  hasSection?: boolean
) => {
  if (predictions.length === 0) return;

  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text(`${sessionName ?? ''} Prediction Results Report`, 14, 22);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);
  doc.text(`Total Records: ${predictions.length}`, 14, 36);

  const tableData = predictions.map((pred) => [
    pred.learnerID ?? '-',
    ...(hasSection ? [pred.Section ?? '-'] : []),
    pred.prediction?.toString() ?? '-',
    pred.proficiency?.label ?? '-',
    pred.pass_probability != null
      ? `${(pred.pass_probability * 100).toFixed(1)}%`
      : '-',
  ]);

  autoTable(doc, {
    head: [
      [
        'Learner ID',
        ...(hasSection ? ['Section'] : []),
        'Predicted MPS',
        'Proficiency Level',
        'Pass Probability',
      ],
    ],
    body: tableData,
    startY: 42,
    styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [240, 240, 240] },
    margin: { left: 14, right: 14 },
  });

  doc.save(`${fileName.replace(/\.pdf$/i, '')}_predictions.pdf`);
};

// ============================================================
// FEATURE IMPORTANCE HELPERS
// ============================================================

export const featureExplanations: Record<
  string,
  {
    friendlyName: string;
    category: string;
    description: string;
    canChange: boolean;
    insight: string;
  }
> = {
  // Add your feature mappings here, e.g.:
  // math_grade_5: { friendlyName: 'Math Grade 5', category: 'Academic History', ... }
};

export const getFriendlyFeatureName = (featureName: string): string =>
  featureExplanations[featureName]?.friendlyName ?? featureName;

export const getCategoryColor = (_category: string): string => '#8b5cf6';

export function getFeatureCategory(featureName: string): string {
  const info = featureExplanations[featureName];
  if (info) return info.category;

  const lower = featureName.toLowerCase();
  if (
    lower.includes('math') ||
    lower.includes('english') ||
    lower.includes('filipino') ||
    lower.includes('science') ||
    lower.includes('aral')
  )
    return 'Academic History';
  if (
    lower.includes('age') ||
    lower.includes('sex') ||
    lower.includes('gender') ||
    lower.includes('mother tongue') ||
    lower.includes('nutrition') ||
    lower.includes('bmi') ||
    lower.startsWith('gender_') ||
    lower.startsWith('mother tongue_') ||
    lower.startsWith('nutritional status(bmi)_')
  )
    return 'Student Profile';

  return 'Other';
}

// ============================================================
// COMPONENT
// ============================================================

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
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterProficiency, setFilterProficiency] = useState<string>('all');
  const [filterSection, setFilterSection] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  // Initialize pageInput to '1' so the input is never blank on first render
  const [pageInput, setPageInput] = useState('1');
  const [hasAnySession, setHasAnySession] = useState(false);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  const hasSection = predictions.some((p) => p.Section != null && p.Section !== '');

  const uniqueSections = React.useMemo(() => {
    if (!hasSection) return [];
    const set = new Set<string>();
    predictions.forEach((p) => {
      if (p.Section?.trim()) set.add(p.Section);
    });
    return Array.from(set).sort();
  }, [predictions, hasSection]);

  const uniqueProficiencies = React.useMemo(() => {
    const set = new Set<string>();
    predictions.forEach((p) => {
      if (p.proficiency?.label) set.add(p.proficiency.label);
    });
    return Array.from(set).sort();
  }, [predictions]);

  // ── Check if user has any sessions ──
  useEffect(() => {
    if (!user) return;
    getSessions()
      .then((s) => setHasAnySession(s.length > 0))
      .catch(() => setHasAnySession(false));
  }, [user]);

  // ── Body scroll lock when modal is open ───────────────────────────────────
  useEffect(() => {
    document.body.style.overflow = selectedStudent ? 'hidden' : 'unset';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [selectedStudent]);

  // ── Load predictions from navigation state or session ─────────────────────
  useEffect(() => {
    const loadResults = async () => {
      const state = location.state as ResultsState | null;

      if (state?.predictions) {
        setPredictions(state.predictions);
        setFileName(state.fileName ?? 'Dataset');
        setSessionName(state.sessionName ?? '');
      } else if (state?.sessionId) {
        try {
          const session = await getSession(state.sessionId);
          if (!session) {
            navigate('/home');
            return;
          }
          if (Array.isArray(session.predictions) && session.predictions.length > 0) {
            setPredictions(session.predictions as ApiPredictionResult[]);
            setFileName(session.file_name ?? 'Dataset');
            setSessionName(session.name ?? '');
          } else {
            navigate('/home');
          }
        } catch {
          navigate('/home');
        }
      } else {
        navigate('/home');
      }
    };

    loadResults();
  }, [location.state, navigate]);

  // ── Sort ───────────────────────────────────────────────────────────────────
  const handleSort = (field: keyof ApiPredictionResult) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // ── Derived stats (actually used in the header) ───────────────────────────
  const totalPredictions = predictions.length;

  const averageScore =
    totalPredictions > 0
      ? predictions.reduce((s, p) => s + p.prediction, 0) / totalPredictions
      : 0;

  const passedCount = predictions.filter((p) => (p.proficiency?.code ?? 0) > 2).length;

  // ── Filtered + sorted list ────────────────────────────────────────────────
  const filteredAndSortedPredictions = predictions
    .filter((pred) => {
      if (filterStatus === 'all') return true;
      const bandCode = parseInt(filterStatus);
      if (!isNaN(bandCode)) return pred.top_probable_band?.code === bandCode;
      if (filterStatus === 'passed') return (pred.proficiency?.code ?? 0) > 2;
      if (filterStatus === 'failed') return (pred.proficiency?.code ?? 0) <= 2;
      return true;
    })
    .filter((pred) =>
      filterProficiency === 'all' ? true : pred.proficiency?.label === filterProficiency
    )
    .filter((pred) =>
      filterSection === 'all' ? true : pred.Section === filterSection
    )
    .filter((pred) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        String(pred.learnerID ?? '').toLowerCase().includes(q) ||
        (pred.School ?? '').toLowerCase().includes(q) ||
        (pred.Section ?? '').toLowerCase().includes(q) ||
        (pred.proficiency?.label ?? '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number')
        return sortDirection === 'asc' ? av - bv : bv - av;
      return sortDirection === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });

  const totalPages = Math.ceil(filteredAndSortedPredictions.length / itemsPerPage);

  const goToPage = (page: number) => {
    const clamped = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(clamped);
    setPageInput(String(clamped));
  };

  // ── Empty state ───────────────────────────────────────────────────────────
  if (predictions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="rounded-full bg-yellow-100 w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <svg className="h-8 w-8 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">No Dataset Uploaded</h2>
          <p className="text-gray-600 mb-6">
            {hasAnySession
              ? 'You have previous sessions, but no dataset is available here. Start a new analysis or return to your dashboard.'
              : 'Upload a dataset from the Dashboard to view prediction results.'}
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

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-8" ref={resultsContainerRef}>

      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-6 rounded-2xl text-white" style={{ background: 'linear-gradient(135deg, #3da6e2 0%, #1480be 100%)' }}>
        <div>
          <h1 className="text-2xl font-bold mb-1">Prediction Results</h1>
          <p className="text-sm opacity-90">
            {sessionName && <><span className="font-semibold">Session: {sessionName}</span> &nbsp;|&nbsp; </>}
            {fileName} — {totalPredictions} predictions &nbsp;·&nbsp;
            Avg MPS: <span className="font-semibold">{averageScore.toFixed(1)}</span> &nbsp;·&nbsp;
            Passed: <span className="font-semibold">{passedCount}</span> / {totalPredictions}
          </p>
        </div>
        <div className="flex gap-3 flex-shrink-0">
          <button
            onClick={() => exportToCSV(predictions, fileName, hasSection)}
            className="flex items-center gap-2 px-4 py-2 bg-white/20 border-2 border-white/50 rounded-lg text-sm font-medium hover:bg-white/30 transition"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export CSV
          </button>
          <button
            onClick={() => exportToPDF(predictions, fileName, sessionName, hasSection)}
            className="flex items-center gap-2 px-4 py-2 bg-white/20 border-2 border-white/50 rounded-lg text-sm font-medium hover:bg-white/30 transition"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download PDF
          </button>
        </div>
      </header>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Prediction Results</h2>
            <p className="text-sm text-gray-500 mt-1">
              Showing {filteredAndSortedPredictions.length} of {totalPredictions} predictions
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search learner ID, school…"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); goToPage(1); }}
                className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
              />
            </div>

            {/* Band filter */}
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); goToPage(1); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Bands</option>
              {predictions[0]?.probability_breakdown?.map((band, i) => (
                <option key={i} value={band.code.toString()}>{band.label}</option>
              ))}
            </select>

            {/* Proficiency filter */}
            <select
              value={filterProficiency}
              onChange={(e) => { setFilterProficiency(e.target.value); goToPage(1); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Proficiencies</option>
              {uniqueProficiencies.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            {/* Section filter — only when Section column exists */}
            {hasSection && uniqueSections.length > 0 && (
              <select
                value={filterSection}
                onChange={(e) => { setFilterSection(e.target.value); goToPage(1); }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Sections</option>
                {uniqueSections.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {/* Learner ID */}
                <SortableHeader label="Learner ID" field="learnerID" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                {hasSection && <SortableHeader label="Section" field="Section" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />}
                <SortableHeader label="Predicted MPS" field="prediction" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Proficiency</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Probability Breakdown</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Pass Probability<br />P(MPS ≥ 75)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredAndSortedPredictions
                .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                .map((result, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {result.learnerID ?? '-'}
                    </td>
                    {hasSection && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {result.Section ?? '-'}
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`font-semibold ${result.prediction >= 75 ? 'text-green-600' : 'text-red-600'}`}>
                        {result.prediction.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full"
                        style={{
                          backgroundColor: (result.proficiency?.color ?? '#ccc') + '20',
                          color: result.proficiency?.color ?? '#666',
                        }}
                      >
                        {result.proficiency?.label ?? 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {result.probability_breakdown?.length ? (
                        <div className="flex flex-col gap-1">
                          {result.probability_breakdown.map((band, idx) => (
                            <div key={idx} className="flex items-center justify-between gap-2">
                              <span
                                className="px-2 py-0.5 text-xs rounded-full"
                                style={{
                                  backgroundColor: band.color + '20',
                                  color: band.color,
                                  border: result.top_probable_band?.code === band.code
                                    ? `2px solid ${band.color}`
                                    : 'none',
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {result.pass_probability != null ? (
                        <span className={`font-semibold ${result.pass_probability >= 0.5 ? 'text-green-600' : 'text-red-600'}`}>
                          {(result.pass_probability * 100).toFixed(1)}%
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => setSelectedStudent(result.learnerID ?? '')}
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

      {/* Pagination */}
      {filteredAndSortedPredictions.length > itemsPerPage && (
        <div className="bg-white rounded-2xl shadow-lg p-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">
                {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, filteredAndSortedPredictions.length)} of {filteredAndSortedPredictions.length}
              </span>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-500">Rows:</label>
                <select
                  value={itemsPerPage}
                  onChange={(e) => { setItemsPerPage(Number(e.target.value)); goToPage(1); }}
                  className="px-2 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <PaginationBtn onClick={() => goToPage(1)} disabled={currentPage === 1} title="First">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
              </PaginationBtn>
              <PaginationBtn onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}>
                Previous
              </PaginationBtn>

              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const p = parseInt(pageInput);
                      if (!isNaN(p)) goToPage(p);
                      else setPageInput(String(currentPage));
                    }
                  }}
                  onBlur={() => {
                    const p = parseInt(pageInput);
                    if (!isNaN(p)) goToPage(p);
                    else setPageInput(String(currentPage));
                  }}
                  className="w-14 px-2 py-2 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-500">of {totalPages}</span>
              </div>

              <PaginationBtn onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages}>
                Next
              </PaginationBtn>
              <PaginationBtn onClick={() => goToPage(totalPages)} disabled={currentPage >= totalPages} title="Last">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
              </PaginationBtn>
            </div>
          </div>
        </div>
      )}

      {/* Per-Student Feature Importance Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedStudent(null)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden">
            {/* Modal header — fixed layout: title on left, close on right */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Feature Importance — Learner {selectedStudent}
                  </h3>
                  <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 bg-blue-50 px-3 py-2 rounded-lg w-fit">
                    <svg className="h-4 w-4 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    These are historical grades (Past Performance) — they cannot be changed but help predict future scores.
                  </div>
                </div>
                <button
                  onClick={() => setSelectedStudent(null)}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition flex-shrink-0"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[65vh]">
              {/* Legend */}
              <div className="mb-6 p-4 bg-amber-50 rounded-xl border border-amber-100">
                <h4 className="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-2">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Important: These are Historical Grades
                </h4>
                <p className="text-sm text-amber-700 mb-3">
                  Features shown are <strong>past grades from Grades 1–5</strong>. They are records of academic history used to predict future performance.
                </p>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="flex items-start gap-2">
                    <span className="w-3 h-3 rounded-full bg-green-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="font-semibold text-green-700">Positive (Green)</span>
                      <p className="text-green-600">Past performance that boosted the predicted score</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="font-semibold text-red-700">Negative (Red)</span>
                      <p className="text-red-600">Past patterns correlated with a lower predicted score</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Feature drivers */}
              {(() => {
                const pred = predictions.find((p) => p.learnerID === selectedStudent);
                const explanation = pred?.explanation;

                if (!explanation) {
                  return (
                    <div className="text-center py-8 text-gray-500">
                      <svg className="h-12 w-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <p>Explanations not available for this student.</p>
                      <p className="text-xs mt-1">Re-run the analysis to generate feature explanations.</p>
                    </div>
                  );
                }

                const maxImpact = Math.max(...explanation.top_drivers.map((f) => Math.abs(f.shap_value)));

                return (
                  <div className="space-y-4">
                    <h5 className="text-sm font-semibold text-gray-700">Top Influencing Factors</h5>

                    {explanation.top_drivers.map((feat, idx) => {
                      const pct = maxImpact > 0 ? (Math.abs(feat.shap_value) / maxImpact) * 100 : 0;
                      const isPos = feat.direction === 'positive';
                      return (
                        <div key={feat.feature} className="flex items-center gap-4">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${isPos ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                            {idx + 1}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-gray-700">{getFriendlyFeatureName(feat.feature)}</span>
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isPos ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {isPos ? '↑ Boosted Score' : '↓ Lowered Score'}
                              </span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2.5">
                              <div
                                className={`h-2.5 rounded-full transition-all duration-500 ${isPos ? 'bg-gradient-to-r from-green-400 to-green-600' : 'bg-gradient-to-r from-red-400 to-red-600'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="flex justify-between text-xs text-gray-500 mt-1">
                              <span>Impact: {feat.shap_value > 0 ? '+' : ''}{feat.shap_value.toFixed(3)}</span>
                              <span>{pct.toFixed(0)}% of total impact</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Insights */}
                    <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
                      <h5 className="text-sm font-semibold text-blue-800 mb-2 flex items-center gap-2">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                        What This Means for the Student
                      </h5>
                      <ul className="text-sm text-blue-700 space-y-2">
                        {explanation.top_drivers
                          .filter((f) => f.direction === 'negative')
                          .slice(0, 3)
                          .map((feat, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span>•</span>
                              <span>
                                <strong>"{getFriendlyFeatureName(feat.feature)}"</strong> contributes a negative impact — investigate further.
                                {getFeatureCategory(feat.feature) === 'Academic History' &&
                                  ' (Past grades cannot be changed, but indicate areas needing current support)'}
                              </span>
                            </li>
                          ))}
                        {explanation.top_drivers.filter((f) => f.direction === 'negative').length === 0 && (
                          <li className="flex items-start gap-2">
                            <span>•</span>
                            <span>All major factors positively contribute to this student's predicted score.</span>
                          </li>
                        )}
                      </ul>
                      <div className="mt-3 pt-3 border-t border-blue-200 text-xs text-blue-600">
                        <strong>Note:</strong> All features are from historical data. Current teaching and support are what can improve future outcomes.
                      </div>
                    </div>

                    <div className="p-3 bg-gray-50 rounded-lg text-xs text-gray-500">
                      <span className="font-medium">Base Score:</span>{' '}
                      {explanation.base_value?.toFixed(1) ?? 'N/A'} (average prediction before considering specific factors)
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Back to Dashboard */}
      <div className="flex justify-center pb-8">
        <button
          onClick={() => navigate('/dashboard')}
          className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Analyze Different Dataset
        </button>
      </div>
    </div>
  );
}

// ── Small reusable sub-components ─────────────────────────────────────────────

function SortableHeader<T>({
  label,
  field,
  sortField,
  sortDirection,
  onSort,
}: {
  label: string;
  field: keyof T;
  sortField: keyof T;
  sortDirection: 'asc' | 'desc';
  onSort: (f: keyof T) => void;
}) {
  return (
    <th
      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        {sortField === field && (
          <svg
            className={`h-4 w-4 transition-transform ${sortDirection === 'asc' ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        )}
      </div>
    </th>
  );
}

function PaginationBtn({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition"
    >
      {children}
    </button>
  );
}
