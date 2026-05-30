import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { PredictionResult as ApiPredictionResult } from '../services/api';
import { getSessionRawData } from '../services/sessionService';
import { pdf, Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';

// ============================================================
// CONSTANTS
// ============================================================

const SIGNIFICANCE_THRESHOLD = 0.05;

const ACADEMIC_FEATURE_MAP: Record<string, { label: string; icon: string }> = {
  Math_avg: { label: 'Mathematics', icon: '📐' },
  Filipino_avg: { label: 'Filipino', icon: '📖' },
  English_avg: { label: 'English', icon: '🔤' },
  AralPan_avg: { label: 'Araling Panlipunan', icon: '🌏' },
  Science_avg: { label: 'Science', icon: '🔬' },
};

const SUBJECT_GRADE_KEYS: { prefix: string; avgKey: string; label: string }[] = [
  { prefix: 'Math', avgKey: 'Math_avg', label: 'Mathematics' },
  { prefix: 'Science', avgKey: 'Science_avg', label: 'Science' },
  { prefix: 'Filipino', avgKey: 'Filipino_avg', label: 'Filipino' },
  { prefix: 'English', avgKey: 'English_avg', label: 'English' },
  { prefix: 'AralPan', avgKey: 'AralPan_avg', label: 'Araling Panlipunan' },
];

// ============================================================
// HELPERS
// ============================================================

const computeSubjectAverage = (
  student: Record<string, unknown>,
  prefix: string,
  avgKey: string
): number | null => {
  // 1. Try the pre-computed _avg key first (e.g. Math_avg)
  if (student[avgKey] != null) {
    const val = Number(student[avgKey]);
    if (!isNaN(val) && val > 0) return parseFloat(val.toFixed(2));
  }

  // 2. Fall back: scan for quarter columns (e.g. "Math 1", "Math Q1", "Math_1")
  const grades: number[] = [];
  Object.entries(student).forEach(([key, value]) => {
    const normalized = key.replace(/[-_]/g, ' ');
    if (
      normalized.toLowerCase().startsWith(prefix.toLowerCase() + ' ') ||
      normalized.toLowerCase().startsWith(prefix.toLowerCase() + '_')
    ) {
      const grade = Number(value);
      if (!isNaN(grade) && grade > 0) grades.push(grade);
    }
  });

  if (grades.length === 0) return null;
  return parseFloat((grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(2));
};

const getGradeColor = (grade: number): string => {
  if (grade >= 90) return 'text-green-600 bg-green-50';
  if (grade >= 80) return 'text-blue-600 bg-blue-50';
  if (grade >= 75) return 'text-yellow-600 bg-yellow-50';
  return 'text-red-600 bg-red-50';
};

const getGradeLabel = (grade: number): string => {
  if (grade >= 90) return 'Excellent';
  if (grade >= 80) return 'Very Good';
  if (grade >= 75) return 'Good';
  return 'Needs Improvement';
};

const getNutritionalStatusDescription = (status: string): string => {
  const s = status.toLowerCase();
  if (s === 'normal') return `"${status}" nutritional status shows minimal influence on predicted MPS. Maintain healthy habits, health monitoring and coordinate with school feeding programs.`;
  if (s === 'obese') return `"${status}" nutritional status is associated with lower predicted MPS. Consider nutrition counseling and promoting physical activity.`;
  if (s === 'overweight') return `"${status}" nutritional status shows moderate influence on predicted MPS. Encourage balanced diet and regular exercise.`;
  if (s === 'severely wasted') return `"${status}" nutritional status shows strong influence on predicted MPS. Urgent nutrition intervention and school feeding program coordination needed.`;
  if (s === 'wasted') return `"${status}" nutritional status shows significant influence on predicted MPS. Prioritize nutrition support and health monitoring.`;
  return `"${status}" nutritional status shows influence on predicted MPS. Consider health and nutrition support.`;
};

const getMotherTongueDescription = (language: string): string => {
  const l = language.toLowerCase();
  if (l === 'ilocano') return `Learners with "${language}" as their mother tongue showed lower predicted MPS on average. Consider additional language support and mother-tongue based instruction.`;
  if (l === 'tagalog') return `Learners with "${language}" as their mother tongue showed lower predicted MPS on average. Provide scaffolding and multilingual learning materials.`;
  return `Learners with "${language}" as their mother tongue show average predicted MPS. Continue multilingual support and mother-tongue based instruction.`;
};

const isConcerningMotherTongue = (language: string): boolean =>
  ['ilocano', 'tagalog'].includes(language.toLowerCase());

// ============================================================
// TYPES
// ============================================================

interface FactorItem {
  label: string;
  icon?: string;
  avgShap: number;
  avgAbsShap: number;
}

interface DemographicFactor {
  group: string;
  label: string;
  impact: number;
  description: string;
}

interface SubjectGrade {
  name: string;
  average: number;
  label: string;
  colorClass: string;
}

interface ResultsState {
  predictions: ApiPredictionResult[];
  fileName: string;
  sessionId?: string;
  sessionName?: string;
  rawData?: Record<string, unknown>[];
}

// ============================================================
// PDF STYLES
// ============================================================

const pdfStyles = StyleSheet.create({
  page: {
    padding: 32,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#1f2937',
    backgroundColor: '#ffffff',
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: '#004db1',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 9,
    color: '#6b7280',
    marginBottom: 2,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    marginVertical: 12,
  },
  table: {
    width: '100%',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#3a8cda',
    borderRadius: 4,
    paddingVertical: 7,
    paddingHorizontal: 4,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  tableRowAlt: {
    backgroundColor: '#f9fafb',
  },
  colHeader: {
    fontFamily: 'Helvetica-Bold',
    color: '#ffffff',
    fontSize: 8,
    textTransform: 'uppercase',
  },
  colCell: {
    fontSize: 8.5,
    color: '#374151',
  },
  colID: { flex: 1.2 },
  colSection: { flex: 1 },
  colMPS: { flex: 0.9, textAlign: 'center' },
  colProf: { flex: 1.4 },
  colBreakdown: { flex: 1.2 },
  colPassProb: { flex: 1, textAlign: 'center' },
  green: { color: '#16a34a', fontFamily: 'Helvetica-Bold' },
  red: { color: '#dc2626', fontFamily: 'Helvetica-Bold' },
  // Breakdown band row
  bandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  bandPill: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
    fontSize: 7,
    borderWidth: 1,
  },
  bandPct: {
    fontSize: 7.5,
    color: '#4b5563',
    fontFamily: 'Helvetica-Bold',
    marginLeft: 4,
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 32,
    right: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    color: '#9ca3af',
    fontSize: 7.5,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 6,
  },
});

// ============================================================
// PDF DOCUMENT COMPONENT
// ============================================================

const PredictionsPDFDocument = ({
  predictions,
  fileName,
  sessionName,
  hasSection,
}: {
  predictions: ApiPredictionResult[];
  fileName: string;
  sessionName?: string;
  hasSection: boolean;
}) => {
  const generatedAt = new Date().toLocaleString();
  const passedCount = predictions.filter((p) => (p.proficiency?.code ?? 0) > 2).length;
  const avgMPS =
    predictions.length > 0
      ? (predictions.reduce((s, p) => s + p.prediction, 0) / predictions.length).toFixed(1)
      : '—';

  return (
    <Document>
      <Page size="A4" orientation="portrait" style={pdfStyles.page}>

        {/* Header */}
        <View style={pdfStyles.header}>
          <Text style={pdfStyles.title}>
            {sessionName ? `${sessionName} - ` : ''}Prediction Results
          </Text>
          <Text style={pdfStyles.subtitle}>Class Data Used: {fileName.replace(/\.csv$/i, '')}</Text>
          <Text style={pdfStyles.subtitle}>
            Total: {predictions.length} learners · NAT Mean Percentage Score: {avgMPS} · Passed: {passedCount}
          </Text>
          <Text style={pdfStyles.subtitle}>Generated: {generatedAt}</Text>
        </View>

        <View style={pdfStyles.divider} />

        {/* Table */}
        <View style={pdfStyles.table}>

          {/* Table Header */}
          <View style={pdfStyles.tableHeader}>
            <Text style={[pdfStyles.colHeader, pdfStyles.colID]}>Learner ID</Text>
            {hasSection && (
              <Text style={[pdfStyles.colHeader, pdfStyles.colSection]}>Section</Text>
            )}
            <View style={[pdfStyles.colHeader, pdfStyles.colMPS]}>
              <Text>
                Predicted
              </Text>
              <Text>
                MPS
              </Text>
            </View>
            <Text style={[pdfStyles.colHeader, pdfStyles.colProf]}>Proficiency</Text>
            <View style={[pdfStyles.colHeader, pdfStyles.colBreakdown]}>
              <Text>Probability</Text>
              <Text>Breakdown</Text>
            </View>
            <View style={[pdfStyles.colHeader, pdfStyles.colPassProb]}>
              <Text>Probability of</Text>
              <Text>Passing</Text>
            </View>
          </View>

          {/* Table Rows */}
          {predictions.map((result, i) => {
            const isAlt = i % 2 !== 0;
            const mpsColor = result.prediction >= 75 ? pdfStyles.green : pdfStyles.red;
            const passColor = (result.pass_probability ?? 0) >= 0.5 ? pdfStyles.green : pdfStyles.red;

            // Per-band breakdown — mirrors the webapp pill layout
            const breakdownCell = result.probability_breakdown?.length ? (
              <View style={pdfStyles.colBreakdown}>
                {result.probability_breakdown.map((band, idx) => {
                  const isTop = result.top_probable_band?.code === band.code;
                  const color = band.color ?? '#6b7280';
                  return (
                    <View key={idx} style={pdfStyles.bandRow}>
                      <Text
                        style={[
                          pdfStyles.bandPill,
                          {
                            backgroundColor: color + '20',
                            color,
                            borderColor: isTop ? color : 'transparent',
                            borderWidth: isTop ? 1.5 : 0,
                          },
                        ]}
                      >
                        {band.label}
                      </Text>
                      <Text style={pdfStyles.bandPct}>
                        {(band.probability * 100).toFixed(1)}%
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text
                style={[
                  pdfStyles.colCell,
                  pdfStyles.colBreakdown,
                  (result.proficiency?.code ?? 0) >= 2 ? pdfStyles.green : pdfStyles.red,
                ]}
              >
                {(result.proficiency?.code ?? 0) >= 2 ? 'Passed' : 'Failed'}
              </Text>
            );

            return (
              <View
                key={i}
                style={[pdfStyles.tableRow, isAlt ? pdfStyles.tableRowAlt : {}]}
                wrap={false}
              >
                <Text style={[pdfStyles.colCell, pdfStyles.colID]}>
                  {result.learnerID ?? '—'}
                </Text>
                {hasSection && (
                  <Text style={[pdfStyles.colCell, pdfStyles.colSection]}>
                    {result.Section ?? '—'}
                  </Text>
                )}
                <Text style={[pdfStyles.colCell, pdfStyles.colMPS, mpsColor]}>
                  {result.prediction.toFixed(1)}
                </Text>
                <Text style={[pdfStyles.colCell, pdfStyles.colProf]}>
                  {result.proficiency?.label ?? 'N/A'}
                </Text>
                {breakdownCell}
                <Text style={[pdfStyles.colCell, pdfStyles.colPassProb, passColor]}>
                  {result.pass_probability != null
                    ? `${(result.pass_probability * 100).toFixed(1)}%`
                    : '—'}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Footer */}
        <View style={pdfStyles.footer} fixed>
          <Text>NAT-Lytics: National Achievement Test Predictive Analytics System</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>

      </Page>
    </Document>
  );
};

// ============================================================
// EXPORT HELPERS
// ============================================================
const exportToCSV = (
  predictions: ApiPredictionResult[],
  fileName: string,
  hasSection: boolean
) => {
  if (predictions.length === 0) return;

  // Collect all unique band labels across all predictions (preserving order of first occurrence)
  const bandLabels: string[] = [];
  predictions.forEach((pred) => {
    pred.probability_breakdown?.forEach((band) => {
      if (!bandLabels.includes(band.label)) bandLabels.push(band.label);
    });
  });

  const headers = [
    'Learner ID',
    ...(hasSection ? ['Section'] : []),
    'Predicted MPS',
    'Proficiency Level',
    ...bandLabels.map((label) => `${label} Probability`),
    'Probability of Passing',
  ];

  const rows = predictions.map((pred) => {
    const bandMap = Object.fromEntries(
      (pred.probability_breakdown ?? []).map((b) => [b.label, b.probability])
    );
    return [
      String(pred.learnerID ?? ''),
      ...(hasSection ? [pred.Section ?? ''] : []),
      pred.prediction?.toString() ?? '',
      pred.proficiency?.label ?? '',
      ...bandLabels.map((label) =>
        bandMap[label] != null ? (bandMap[label] * 100).toFixed(1) + '%' : ''
      ),
      pred.pass_probability != null
        ? (pred.pass_probability * 100).toFixed(1) + '%'
        : '',
    ].join(',');
  });

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


const exportToPDF = async (
  predictions: ApiPredictionResult[],
  fileName: string,
  sessionName?: string,
  hasSection?: boolean
) => {
  if (predictions.length === 0) return;

  const blob = await pdf(
    <PredictionsPDFDocument
      predictions={predictions}
      fileName={fileName}
      sessionName={sessionName}
      hasSection={hasSection ?? false}
    />
  ).toBlob();

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName.replace(/\.pdf$/i, '')}_predictions.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// ============================================================
// FACTOR PILL LIST
// ============================================================

const FactorPillList = ({ items }: { items: FactorItem[] }) => {
  const helping = items
    .filter((f) => f.avgShap > SIGNIFICANCE_THRESHOLD)
    .sort((a, b) => b.avgShap - a.avgShap);
  const hurting = items
    .filter((f) => f.avgShap < -SIGNIFICANCE_THRESHOLD)
    .sort((a, b) => a.avgShap - b.avgShap);

  if (helping.length === 0 && hurting.length === 0) return null;

  return (
    <div className="space-y-2">
      {helping.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {helping.map((f) => (
            <span
              key={f.label}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 border border-green-200 text-sm text-green-800"
            >
              {f.icon && <span className="text-base leading-none">{f.icon}</span>}
              {f.label}
            </span>
          ))}
        </div>
      )}
      {hurting.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {hurting.map((f) => (
            <span
              key={f.label}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-50 border border-red-200 text-sm text-red-800"
            >
              {f.icon && <span className="text-base leading-none">{f.icon}</span>}
              {f.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================
// COMPONENT
// ============================================================

export function Results() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { viewMode } = useOutletContext<{ viewMode: string }>();

  const locationState = location.state as ResultsState | null;
  const sessionId = locationState?.sessionId;

  const [predictions, setPredictions] = useState<ApiPredictionResult[]>([]);
  const [fileName, setFileName] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [rawData, setRawData] = useState<Record<string, unknown>[]>(
    locationState?.rawData ?? []
  );
  const [rawDataLoading, setRawDataLoading] = useState(false);

  const [sortField, setSortField] = useState<keyof ApiPredictionResult>('prediction');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filterProficiency, setFilterProficiency] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [pageInput, setPageInput] = useState('1');
  const [hasAnySession, setHasAnySession] = useState(false);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  const hasSection = predictions.some((p) => p.Section != null && p.Section !== '');

  const uniqueProficiencies = React.useMemo(() => {
    const set = new Set<string>();
    predictions.forEach((p) => {
      if (p.proficiency?.label) set.add(p.proficiency.label);
    });
    return Array.from(set).sort();
  }, [predictions]);

  // Body scroll lock when modal is open
  useEffect(() => {
    document.body.style.overflow = selectedStudent ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [selectedStudent]);

  // ── 1. Load predictions from navigation state ────────────────────────────
  useEffect(() => {
    if (locationState?.predictions) {
      setPredictions(locationState.predictions);
      setFileName(locationState.fileName ?? 'Dataset');
      setSessionName(locationState.sessionName ?? '');
      if (locationState.rawData?.length) {
        setRawData(locationState.rawData);
      }
    } else {
      navigate('/homepage');
    }
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 2. Fetch rawData from Firestore if not already available ─────────────
  useEffect(() => {
    if (rawData.length > 0 || !sessionId) return;

    let cancelled = false;
    setRawDataLoading(true);

    getSessionRawData(sessionId)
      .then((rows) => { if (!cancelled) setRawData(rows); })
      .catch(() => { if (!cancelled) setRawData([]); })
      .finally(() => { if (!cancelled) setRawDataLoading(false); });

    return () => { cancelled = true; };
  }, [sessionId]);

  const handleSort = (field: keyof ApiPredictionResult) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // ── Student data lookup (fixed) ──────────────────────────────────────────
  const getStudentData = (learnerId: string) => {
    // Flexible ID matching — handles casing and space variants in the key
    const student = rawData.find((row) => {
      const id =
        row.learnerID ??
        row.LearnerID ??
        row['Learner ID'] ??
        row.learner_id ??
        row.id;
      return String(id) === String(learnerId);
    });

    if (!student) return null;

    const str = (v: unknown): string =>
      v != null && String(v).trim() !== '' ? String(v).trim() : 'N/A';

    const subjectGrades: SubjectGrade[] = [];
    for (const { prefix, avgKey, label } of SUBJECT_GRADE_KEYS) {
      const avg = computeSubjectAverage(student, prefix, avgKey);
      if (avg !== null) {
        subjectGrades.push({
          name: label,
          average: avg,
          label: getGradeLabel(avg),
          colorClass: getGradeColor(avg),
        });
      }
    }

    return {
      age: str(student.age ?? student.Age),
      gender: str(student.gender ?? student.Gender),
      nutritionalStatus: str(
        student['nutritional status'] ??
        student['Nutritional Status'] ??
        student.nutritional_status ??
        student.NutritionalStatus
      ),
      motherTongue: str(
        student['mother tongue'] ??
        student['Mother Tongue'] ??
        student.mother_tongue ??
        student.MotherTongue
      ),
      subjectGrades,
    };
  };

  const totalPredictions = predictions.length;
  const averageScore =
    totalPredictions > 0
      ? predictions.reduce((s, p) => s + p.prediction, 0) / totalPredictions
      : 0;
  const passedCount = predictions.filter((p) => (p.proficiency?.code ?? 0) > 2).length;

  const filteredAndSortedPredictions = predictions
    .filter((pred) =>
      filterProficiency === 'all' ? true : pred.proficiency?.label === filterProficiency
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

  const isAdminView =
    user?.role === 'admin' || (user?.role === 'researcher' && viewMode === 'admin');

  // ── Empty state ──────────────────────────────────────────────────────────
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
                onClick={() => navigate('/homepage')}
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

  // ── Main render ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-8" ref={resultsContainerRef}>

      {/* Header */}
      <header
        className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-6 rounded-2xl text-white"
        style={{ background: 'linear-gradient(135deg, #3da6e2 0%, #1480be 100%)' }}
      >
        <div>
          <h1 className="text-2xl font-bold mb-1">Individual Prediction Result</h1>
          <p className="text-sm opacity-90">
            {sessionName && (
              <><span className="font-semibold">Session: {sessionName}</span> &nbsp;|&nbsp; </>
            )}
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
          </div>
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <SortableHeader label="Learner ID" field="learnerID" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                {hasSection && (
                  <SortableHeader label="Section" field="Section" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                )}
                <SortableHeader
                  label="Predicted MPS"
                  field="prediction"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  title="This is the model's estimated Mean Percentage Score for this learner based on their academic grades and demographic profile. It is a forecast, not an official NAT result, and should be used as a guide for planning — not as a final assessment of the learner's ability."
                />
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Proficiency</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Probability Breakdown</th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  title="The estimated likelihood that this learner will reach the Proficient level (MPS ≥ 75) in the NAT. A probability of 30% means the model estimates a 30-in-100 chance of meeting the proficiency threshold based on current academic records. Use this to prioritize learners who may need early support."
                >
                  Proficiency Probability<br />(MPS ≥ 75)
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
                        Student Prediction Details
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

      {/* Student Prediction Details Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedStudent(null)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden">

            {/* Modal header */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Learner {selectedStudent} Prediction Details
                  </h3>
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

            {/* Modal body */}
            <div className="p-6 overflow-y-auto max-h-[85vh]">
              {(() => {
                const pred = predictions.find((p) => String(p.learnerID) === String(selectedStudent));
                const explanation = pred?.explanation;
                const studentInfo = getStudentData(selectedStudent);

                const getProficiencyColor = (proficiency: string) => {
                  const colors: Record<string, string> = {
                    'Below Basic': 'text-red-600 bg-red-50',
                    'Basic': 'text-orange-600 bg-orange-50',
                    'Proficient': 'text-green-600 bg-green-50',
                    'Advanced': 'text-blue-600 bg-blue-50',
                  };
                  return colors[proficiency] || 'text-gray-600 bg-gray-50';
                };

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

                const significant = (explanation.features ?? []).filter(
                  (f: { feature: string; shap_value: number }) =>
                    Math.abs(f.shap_value) >= SIGNIFICANCE_THRESHOLD
                );

                // Academic factors
                const academicItems: FactorItem[] = significant
                  .filter((f: { feature: string }) => f.feature in ACADEMIC_FEATURE_MAP)
                  .map((f: { feature: string; shap_value: number }) => ({
                    label: ACADEMIC_FEATURE_MAP[f.feature].label,
                    icon: ACADEMIC_FEATURE_MAP[f.feature].icon,
                    avgShap: f.shap_value,
                    avgAbsShap: Math.abs(f.shap_value),
                  }));

                // Demographic factors based on actual student data from rawData
                const demographicFactors: DemographicFactor[] = [];

                if (studentInfo?.nutritionalStatus && studentInfo.nutritionalStatus !== 'N/A') {
                  const status = studentInfo.nutritionalStatus;
                  if (status.toLowerCase() !== 'normal') {
                    demographicFactors.push({
                      group: 'Nutritional Status',
                      label: status,
                      impact: -0.1,
                      description: getNutritionalStatusDescription(status),
                    });
                  }
                }

                if (studentInfo?.motherTongue && studentInfo.motherTongue !== 'N/A') {
                  const tongue = studentInfo.motherTongue;
                  if (isConcerningMotherTongue(tongue)) {
                    demographicFactors.push({
                      group: 'Mother Tongue',
                      label: tongue,
                      impact: -0.1,
                      description: getMotherTongueDescription(tongue),
                    });
                  }
                }

                const hasAcademic = academicItems.some(
                  (f) => f.avgShap > SIGNIFICANCE_THRESHOLD || f.avgShap < -SIGNIFICANCE_THRESHOLD
                );
                const hasDemographic = demographicFactors.length > 0;

                return (
                  <div className="space-y-6">

                    {/* Student Info Card */}
                    <div className="bg-gray-50 rounded-xl p-5 border border-blue-200">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-semibold text-gray-700">Student Information</h4>
                        <span className="text-xs text-gray-500">ID: {selectedStudent}</span>
                      </div>

                      {/* Prediction Summary */}
                      <div className="grid grid-cols-3 gap-4 mb-4 pb-4 border-b border-blue-200">
                        <div className="text-center">
                          <p className="text-xs text-gray-500 mb-1">Predicted MPS</p>
                          <p className={`text-2xl font-bold ${(pred?.prediction ?? 0) >= 75 ? 'text-green-600' : 'text-red-600'}`}>
                            {pred?.prediction.toFixed(1)}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-gray-500 mb-1">Proficiency Classification</p>
                          <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${getProficiencyColor(pred?.proficiency?.label || '')}`}>
                            {pred?.proficiency?.label || 'N/A'}
                          </span>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-gray-500 mb-1">Pass Probability</p>
                          <p className={`text-xl font-bold ${(pred?.pass_probability || 0) >= 0.5 ? 'text-green-600' : 'text-red-600'}`}>
                            {pred?.pass_probability != null ? `${(pred.pass_probability * 100).toFixed(1)}%` : 'N/A'}
                          </p>
                        </div>
                      </div>

                      {/* Demographics Grid */}
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        {studentInfo?.age && studentInfo.age !== 'N/A' && (
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                              <span className="material-icons-round text-blue-700">access_time</span>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500">Age</p>
                              <p className="text-sm font-semibold text-gray-800">{studentInfo.age}</p>
                            </div>
                          </div>
                        )}
                        {studentInfo?.gender && studentInfo.gender !== 'N/A' && (
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                              <span className="material-icons-round text-blue-700 text-xs">person</span>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500">Gender</p>
                              <p className="text-sm font-semibold text-gray-800">
                                {studentInfo.gender === 'M' ? 'Male' : studentInfo.gender === 'F' ? 'Female' : studentInfo.gender}
                              </p>
                            </div>
                          </div>
                        )}
                        {studentInfo?.nutritionalStatus && studentInfo.nutritionalStatus !== 'N/A' && (
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                              <span className="material-icons-round text-blue-700">balance</span>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500">Nutritional Status</p>
                              <p className="text-sm font-semibold text-gray-800">{studentInfo.nutritionalStatus}</p>
                            </div>
                          </div>
                        )}
                        {studentInfo?.motherTongue && studentInfo.motherTongue !== 'N/A' && (
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                              <span className="material-icons-round text-blue-700">translate</span>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500">Mother Tongue</p>
                              <p className="text-sm font-semibold text-gray-800">{studentInfo.motherTongue}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Subject Grades Cards */}
                      {studentInfo?.subjectGrades && studentInfo.subjectGrades.length > 0 ? (
                        <div>
                          <p className="text-xs font-semibold text-gray-600 mb-2">Subject Averages</p>
                          <div className="grid grid-cols-3 gap-2">
                            {studentInfo.subjectGrades.map((subject, idx) => (
                              <div key={idx} className={`p-2 rounded-lg ${subject.colorClass} border border-blue-100`}>
                                <p className="text-xs font-medium text-gray-600">{subject.name}</p>
                                <div className="flex items-baseline justify-between mt-1">
                                  <p className="text-lg font-bold">{subject.average}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : rawDataLoading ? (
                        <p className="text-xs text-gray-400 italic">Loading subject grades…</p>
                      ) : (
                        <p className="text-xs text-gray-400 italic">No subject grade data available.</p>
                      )}
                    </div>

                    {/* Academic Factors Section */}
                    {hasAcademic && (
                      <div>
                        <div className="mb-3">
                          <h4 className="text-md font-semibold text-gray-900">Factors Influencing this Student's Prediction</h4>
                        </div>
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-sm">📚</div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">Academic Factors</p>
                            <p className="text-xs text-gray-400">Based on this student's past subject grades</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 mb-4 pb-3 border-b border-gray-100">
                          <span className="flex items-center gap-2 text-xs text-gray-500">
                            <span className="w-3 h-3 rounded-full bg-green-500 inline-block flex-shrink-0" />
                            Enrichment Subjects (raise predicted MPS)
                          </span>
                          <span className="flex items-center gap-2 text-xs text-gray-500">
                            <span className="w-3 h-3 rounded-full bg-red-500 inline-block flex-shrink-0" />
                            Remedial Subjects (lower predicted MPS)
                          </span>
                        </div>

                        <FactorPillList items={academicItems} />
                        <p className="mt-3 text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-2">
                          Subjects highlighted in green show strengths that can be further developed, while subjects
                          in red indicate areas where students may need additional support and review.
                        </p>
                      </div>
                    )}

                    {/* Demographic Factors Section */}
                    {hasDemographic && (
                      <div className="pt-2">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-sm">👥</div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">Demographic factors (Contextual)</p>
                            <p className="text-xs text-gray-400">Background characteristics that may need support</p>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {demographicFactors.map((factor, idx) => (
                            <div key={idx} className="p-3 bg-gray-50 rounded-lg">
                              <div className="flex items-start gap-2">
                                <div className="flex-1">
                                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                    {factor.group}
                                  </p>
                                  <p className="text-sm font-medium text-gray-800 mt-1">{factor.label}</p>
                                  <p className="text-xs text-gray-600 mt-1">{factor.description}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        <p className="mt-4 mb-10 text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-2">
                          This background is linked with lower predicted performance based on class patterns.
                          <br />
                          <b>Note:</b> Provide additional reading and comprehension support to help improve understanding.
                        </p>
                      </div>
                    )}

                    {/* Base Score */}
                    <div className="pt-2 p-3 bg-gray-50 rounded-lg text-xs text-gray-500">
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
          onClick={() => navigate(isAdminView ? '/overview' : '/dashboard')}
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

// ============================================================
// SUB-COMPONENTS
// ============================================================

function SortableHeader<T>({
  label,
  field,
  sortField,
  sortDirection,
  onSort,
  title,
}: {
  label: string;
  field: keyof T;
  sortField: keyof T;
  sortDirection: 'asc' | 'desc';
  onSort: (f: keyof T) => void;
  title?: string;
}) {
  return (
    <th
      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
      onClick={() => onSort(field)}
      title={title}
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