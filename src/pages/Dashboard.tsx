import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { explainBatch, AnalysisResult, BatchPredictionResponse } from '../services/api';
import { createSession } from '../services/sessionService';
import { API_BASE_URL } from '../config';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, PieSectorShapeProps, Sector,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts';

const colors = ['#fa456d', '#58b9f1', '#ffe369', '#82ca9d', '#caa1ff'];
const colors1 = ['#3da6e2', '#be3614', '#8f0d23', '#7bc4e6', '#5aafe0'];
const colors2 = ['#1480be', '#3da6e2', '#ffe369', '#fa456d', '#ca0909'];

// const MyCustomPie = (props: PieSectorShapeProps) => <Sector {...props} fill={colors[props.index % colors.length]} />;
// const MyCustomPie1 = (props: PieSectorShapeProps) => <Sector {...props} fill={colors1[props.index % colors1.length]} />;
// const MyCustomPie2 = (props: PieSectorShapeProps) => <Sector {...props} fill={colors2[props.index % colors2.length]} />;

interface AnomalyInfo {
  column: string;
  type: 'missing' | 'wrong_dtype' | 'invalid_value';
  message: string;
}

interface OutletContextType {
  sampleDataset: { href: string; filename: string; label: string } | null;
  viewMode?: 'teacher' | 'admin';
}

// ── Local CSV Parser ──────────────────────────────────────────────────────────

function parseCSVContent(content: string): Record<string, unknown>[] {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
    const row: Record<string, unknown> = {};
    headers.forEach((header, idx) => {
      const value = values[idx] ?? '';
      const num = parseFloat(value);
      row[header] = isNaN(num) ? value : num;
    });
    return row;
  });
}

async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target?.result as string ?? '');
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

// ── Local Analyzer ────────────────────────────────────────────────────────────
// Replicates the /api/analyze backend logic entirely in the browser.

function analyzeLocally(records: Record<string, unknown>[]): AnalysisResult {
  if (records.length === 0) {
    return {
      row_count: 0,
      column_count: 0,
      columns: [],
      preview: [],
      correlation_matrix: {},
      missing_values: { total_missing: 0, total_cells: 0, missing_percentage: 0, columns_with_missing: [] },
      proficiency_distribution: null,
    };
  }

  const allKeys = Object.keys(records[0]);
  const rowCount = records.length;
  const columnCount = allKeys.length;

  // Helper: is value null/empty/undefined
  const isMissing = (v: unknown) => v === null || v === undefined || v === '' || (typeof v === 'number' && isNaN(v));

  // Per-column stats
  const columns: AnalysisResult['columns'] = allKeys.map(col => {
    const values = records.map(r => r[col]);
    const nullCount = values.filter(isMissing).length;
    const nonNullCount = rowCount - nullCount;
    const nullPct = rowCount > 0 ? parseFloat(((nullCount / rowCount) * 100).toFixed(2)) : 0;

    const numericValues = values
      .filter(v => !isMissing(v) && !isNaN(Number(v)))
      .map(Number);

    const isNumeric = numericValues.length > 0 && numericValues.length >= nonNullCount * 0.5;
    const isId = col.toLowerCase() === 'learnerid';

    const base = {
      name: col,
      dtype: isNumeric ? 'float64' : 'object',
      non_null_count: nonNullCount,
      null_count: nullCount,
      null_percentage: nullPct,
    };

    if (isId) {
      const unique = new Set(values.filter(v => !isMissing(v)).map(String)).size;
      return { ...base, unique_count: unique, duplicate_count: nonNullCount - unique, is_id_column: true };
    }

    if (isNumeric) {
      const sorted = [...numericValues].sort((a, b) => a - b);
      const mean = numericValues.reduce((s, n) => s + n, 0) / numericValues.length;
      const variance = numericValues.reduce((s, n) => s + (n - mean) ** 2, 0) / numericValues.length;
      const std = Math.sqrt(variance);
      const median = sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)];
      const q25 = sorted[Math.floor(sorted.length * 0.25)];
      const q75 = sorted[Math.floor(sorted.length * 0.75)];
      return {
        ...base,
        statistics: {
          mean: parseFloat(mean.toFixed(4)),
          std: parseFloat(std.toFixed(4)),
          min: sorted[0],
          max: sorted[sorted.length - 1],
          median: parseFloat(median.toFixed(4)),
          q1: parseFloat(q25.toFixed(4)),
          q3: parseFloat(q75.toFixed(4)),
        },
      };
    }

    // Categorical
    const vc: Record<string, number> = {};
    values.filter(v => !isMissing(v)).forEach(v => {
      const k = String(v);
      vc[k] = (vc[k] ?? 0) + 1;
    });
    const sortedVc = Object.entries(vc)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);
    const unique = new Set(values.filter(v => !isMissing(v)).map(String)).size;
    return {
      ...base,
      value_counts: Object.fromEntries(sortedVc),
      unique_count: unique,
    };
  });

  // Correlation matrix (numeric columns only, Pearson)
  const numericCols = columns.filter(c => c.statistics).map(c => c.name);
  const correlation_matrix: Record<string, Record<string, number | null>> = {};

  if (numericCols.length > 1) {
    const vectors: Record<string, number[]> = {};
    numericCols.forEach(col => {
      vectors[col] = records.map(r => Number(r[col])).filter(n => !isNaN(n));
    });

    numericCols.forEach(colA => {
      correlation_matrix[colA] = {};
      numericCols.forEach(colB => {
        const a = vectors[colA];
        const b = vectors[colB];
        const n = Math.min(a.length, b.length);
        if (n < 2) { correlation_matrix[colA][colB] = 0; return; }
        const meanA = a.slice(0, n).reduce((s, v) => s + v, 0) / n;
        const meanB = b.slice(0, n).reduce((s, v) => s + v, 0) / n;
        let num = 0, denA = 0, denB = 0;
        for (let i = 0; i < n; i++) {
          num += (a[i] - meanA) * (b[i] - meanB);
          denA += (a[i] - meanA) ** 2;
          denB += (b[i] - meanB) ** 2;
        }
        const den = Math.sqrt(denA * denB);
        correlation_matrix[colA][colB] = den === 0 ? 0 : parseFloat((num / den).toFixed(4));
      });
    });
  }

  // Missing values summary
  const totalCells = rowCount * columnCount;
  const totalMissing = columns.reduce((s, c) => s + c.null_count, 0);
  const missing_values = {
    total_missing: totalMissing,
    total_cells: totalCells,
    missing_percentage: totalCells > 0 ? parseFloat(((totalMissing / totalCells) * 100).toFixed(2)) : 0,
    columns_with_missing: columns
      .filter(c => c.null_count > 0)
      .map(c => ({ column: c.name, missing_count: c.null_count })),
  };

  return {
    row_count: rowCount,
    column_count: columnCount,
    columns,
    preview: records.slice(0, 5),
    correlation_matrix,
    missing_values,
    proficiency_distribution: null,
  };
}

// ── Session Name Modal ────────────────────────────────────────────────────────

function SessionNameModal({
  value,
  onChange,
  onConfirm,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">Save Prediction Session</h3>
            <p className="text-xs text-gray-500">Give this session a name so you can find it later on your Overview page.</p>
          </div>
        </div>

        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(value); }}
          placeholder="e.g. Grade 6 – Section A – May 2026"
          className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
        />

        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
            Cancel
          </button>
          <button onClick={() => onConfirm(value)} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition">
            Save &amp; View Results
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export function Dashboard() {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { sampleDataset, viewMode = 'teacher' } = useOutletContext<OutletContextType>();

  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [fileName, setFileName] = useState('');
  const [, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [hasUploadedData, setHasUploadedData] = useState(false);
  const [isPredicting, setIsPredicting] = useState(false);
  const [, setPredictionError] = useState('');
  const [modalChart, setModalChart] = useState<{ title: string; data: { name: string; value: number }[]; colors: string[] } | null>(null);
  const [showRadarChart, setShowRadarChart] = useState(false);
  const [anomalies, setAnomalies] = useState<AnomalyInfo[]>([]);
  const [columnsExpanded, setColumnsExpanded] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const datasetSummaryRef = useRef<HTMLDivElement>(null);
  const [showInvalidFileModal, setShowInvalidFileModal] = useState(false);

  // Session naming state
  const [pendingResponse, setPendingResponse] = useState<BatchPredictionResponse | null>(null);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [sessionNameInput, setSessionNameInput] = useState('');

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setModalChart(null); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  useEffect(() => {
    if (modalChart) { document.body.style.overflow = 'hidden'; window.dispatchEvent(new Event('resize')); }
    else { document.body.style.overflow = 'unset'; }
  }, [modalChart]);

  useEffect(() => {
    if (!analysisResult) { setAnomalies([]); return; }
    const newAnomalies: AnomalyInfo[] = [];
    if (analysisResult.missing_values.total_missing > 0) {
      analysisResult.missing_values.columns_with_missing.forEach(col => {
        if (col.missing_count > 0) newAnomalies.push({ column: col.column, type: 'missing', message: `${col.missing_count} missing values` });
      });
    }
    analysisResult.columns.forEach(col => {
      const OPTIONAL_COLUMNS = ['science 3', 'science 4', 'science 5'];
      if (col.null_percentage > 80 && !OPTIONAL_COLUMNS.includes(col.name.toLowerCase()))
        newAnomalies.push({ column: col.name, type: 'wrong_dtype', message: `Very high null percentage (${col.null_percentage.toFixed(1)}%)` });
    });
    setAnomalies(newAnomalies);
  }, [analysisResult]);

  useEffect(() => {
    if (analysisResult && datasetSummaryRef.current) {
      datasetSummaryRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [analysisResult]);

  const REQUIRED_COLUMNS = ['learnerid', 'gender', 'age', 'mother tongue', 'nutritional status'];

  // Critical anomalies - missing values in required columns
  const criticalAnomalies = anomalies.filter(a =>
    a.type === 'missing' && REQUIRED_COLUMNS.includes(a.column.toLowerCase())
  );

  // Warning anomalies - all other anomalies (missing in non-required columns, wrong_dtype, etc.)
  const warningAnomalies = anomalies.filter(a =>
    !(a.type === 'missing' && REQUIRED_COLUMNS.includes(a.column.toLowerCase()))
  );

  // Enable predictions if: data exists AND no critical anomalies AND privacy accepted
  const canRunPredictions = useMemo(() =>
    data.length > 0 && criticalAnomalies.length === 0 && privacyAccepted,
    [data.length, criticalAnomalies, privacyAccepted]
  );
  // ── File Upload — fully client-side, no API calls ─────────────────────────

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Block non-CSV files
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      setShowInvalidFileModal(true);
      e.target.value = ''; // reset the input
      return;
    }

    setFileName(file.name);
    setError('');
    setIsLoading(true);
    setAnalysisResult(null);
    setPredictionError('');
    setAnomalies([]);
    setColumnsExpanded(false);
    setHasUploadedData(false);

    try {
      const content = await readFileAsText(file);
      const parsed = parseCSVContent(content);

      if (parsed.length === 0) throw new Error('File is empty or could not be parsed.');

      setData(parsed);
      const result = analyzeLocally(parsed);
      setAnalysisResult(result);
      setHasUploadedData(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to process file';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Run Predictions — calls /explain-batch only ───────────────────────────

  const handleRunPredictions = useCallback(async () => {
    if (!canRunPredictions) return;
    if (data.length === 0) { setPredictionError('No data available.'); return; }

    setIsPredicting(true);
    setPredictionError('');

    try {
      const response: BatchPredictionResponse = await explainBatch(data);
      setPendingResponse(response);

      const defaultName = `${fileName.replace(/\.csv$/i, '')} — ${new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`;
      setSessionNameInput(defaultName);
      setShowSessionModal(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to run predictions';
      setPredictionError(msg);
      toast.error(msg);
    } finally {
      setIsPredicting(false);
    }
  }, [data, fileName, canRunPredictions]);

  // ── Session confirm ───────────────────────────────────────────────────────

  const handleConfirmSession = useCallback(async (name: string) => {
    if (!pendingResponse || !user) return;
    setShowSessionModal(false);

    const predictions = pendingResponse.results;
    const totalPredictions = predictions.length;
    const averageScore = totalPredictions > 0 ? predictions.reduce((s, p) => s + p.prediction, 0) / totalPredictions : 0;
    const passedCount = predictions.filter((p) => (p.proficiency?.code ?? 0) >= 3).length;
    const finalName = name.trim() || sessionNameInput;

    const sessionId = await createSession({
      teacherId: user.id,
      teacherName: user.name,
      schoolId: user.schoolId,
      sessionName: finalName,
      fileName,
      totalPredictions,
      averageScore,
      passedCount,
      predictions,
      rawData: data,
    }).catch((e) => console.warn('Session save failed (non-critical):', e));

    let resultsPath = '/prediction-table';
    if (user.role === 'teacher') resultsPath = '/class-summary';
    else if (user.role === 'admin') resultsPath = '/school-summary';

    navigate(resultsPath, { state: { predictions, fileName, sessionName: finalName, rawData: data, sessionId } });
    window.scrollTo(0, 0);
  }, [pendingResponse, user, fileName, sessionNameInput, navigate]);

  // ── Chart helpers ─────────────────────────────────────────────────────────

  const sexDistributionData = useMemo(() => {
    if (!analysisResult) return [];
    const col = analysisResult.columns.find(c => c.name.toLowerCase() === 'sex' || c.name.toLowerCase() === 'gender');
    if (!col?.value_counts) return [];
    return Object.entries(col.value_counts).map(([name, value]) => ({ name: name === 'M' ? 'Male' : name === 'F' ? 'Female' : name, value: Number(value) }));
  }, [analysisResult]);

  const bmiDistributionData = useMemo(() => {
    if (!analysisResult) return [];
    const col = analysisResult.columns.find(c => c.name.toLowerCase().includes('bmi') || c.name.toLowerCase().includes('nutritional'));
    if (!col?.value_counts) return [];
    return Object.entries(col.value_counts).map(([name, value]) => ({ name, value: Number(value) }));
  }, [analysisResult]);

  const motherTongueDistributionData = useMemo(() => {
    if (!analysisResult) return [];
    const col = analysisResult.columns.find(c => c.name.toLowerCase().includes('mother tongue') || c.name.toLowerCase().includes('language'));
    if (!col?.value_counts) return [];
    return Object.entries(col.value_counts).map(([name, value]) => ({ name, value: Number(value) }));
  }, [analysisResult]);

  const ageGroupData = useMemo(() => {
    if (!data.length) return [];
    const ageCounts: Record<string, number> = {};
    data.forEach(row => {
      const age = String(row.age ?? row.Age);
      if (age && age !== 'undefined') ageCounts[age] = (ageCounts[age] || 0) + 1;
    });
    return Object.entries(ageCounts)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([name, value]) => ({ name, value }));
  }, [data]);

  const missingValuesData = useMemo(() => {
    if (!analysisResult) return [];
    return analysisResult.missing_values.columns_with_missing.map(item => ({
      name: item.column, missing: item.missing_count,
      percentage: ((item.missing_count / analysisResult.row_count) * 100).toFixed(1)
    }));
  }, [analysisResult]);

  const subjectStatsData = useMemo(() => {
    if (!analysisResult) return [];
    const subjects = ['Math', 'English', 'Filipino', 'Science', 'Araling Panlipunan'];
    const keyMap: Record<string, string[]> = {
      'Math': ['math'], 'English': ['english'], 'Filipino': ['filipino', 'fil'],
      'Science': ['science', 'sci'], 'Araling Panlipunan': ['araling panlipunan', 'aral pan', 'ap', 'sibika']
    };
    const stats: Record<string, { mean: number[]; median: number[]; min: number[]; max: number[] }> = {};
    subjects.forEach(s => { stats[s] = { mean: [], median: [], min: [], max: [] }; });
    analysisResult.columns.forEach(col => {
      if (!col.statistics) return;
      const lower = col.name.toLowerCase();
      for (const subject of subjects) {
        const kw = keyMap[subject] || [subject.toLowerCase()];
        if (kw.some(k => lower.includes(k))) {
          if (col.statistics.mean !== null) stats[subject].mean.push(col.statistics.mean);
          if (col.statistics.median !== null) stats[subject].median.push(col.statistics.median);
          if (col.statistics.min !== null) stats[subject].min.push(col.statistics.min);
          if (col.statistics.max !== null) stats[subject].max.push(col.statistics.max);
          break;
        }
      }
    });
    return subjects.filter(s => stats[s].mean.length > 0).map(s => ({
      name: s,
      mean: parseFloat((stats[s].mean.reduce((a, b) => a + b, 0) / stats[s].mean.length).toFixed(2)),
      median: parseFloat((stats[s].median.reduce((a, b) => a + b, 0) / stats[s].median.length).toFixed(2)),
      min: parseFloat((stats[s].min.reduce((a, b) => a + b, 0) / stats[s].min.length).toFixed(2)),
      max: parseFloat((stats[s].max.reduce((a, b) => a + b, 0) / stats[s].max.length).toFixed(2)),
    }));
  }, [analysisResult]);

  const openPieModal = (title: string, d: { name: string; value: number }[], c: string[]) => setModalChart({ title, data: d, colors: c });

  const renderPieChart = (d: { name: string; value: number }[], c: string[], title: string, isModal = false) => {
    const CustomPie = (props: PieSectorShapeProps) => <Sector {...props} fill={c[props.index % c.length]} />;
    return (
      <ResponsiveContainer width="100%" height={isModal ? undefined : '100%'} aspect={isModal ? 1 : undefined}>
        <PieChart>
          <Pie data={d} cx="50%" cy="50%" labelLine={true} label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`} outerRadius={isModal ? 150 : 80} dataKey="value" shape={CustomPie} />
          <Tooltip />
          <Legend iconType="none" formatter={(value, _entry, index) => (
            <span className="flex items-center">
              <span className="w-3 h-3 mr-2 inline-block rounded-sm" style={{ backgroundColor: c[index % c.length] }} />
              {value}
            </span>
          )} />
        </PieChart>
      </ResponsiveContainer>
    );
  };

  const confirmSignOut = async () => { await signOut(); navigate('/login'); };

  return (
    <div className="space-y-8">
      {showInvalidFileModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Invalid File Type</h3>
                <p className="text-xs text-gray-500">Only CSV files are supported.</p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5">
              <p className="text-sm text-red-700 font-medium mb-1">You uploaded an unsupported file format.</p>
              <p className="text-sm text-red-600">
                Please upload a <span className="font-semibold">.csv</span> file. Other formats like Excel (.xlsx), PDF, or text files are not accepted.
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-5">
              <p className="text-xs text-blue-800 font-medium mb-1">💡 Need a template?</p>
              <p className="text-xs text-blue-700">Download the class data template from the header above — it's already in the correct CSV format.</p>
            </div>

            <button
              onClick={() => setShowInvalidFileModal(false)}
              className="w-full py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition"
            >
              Got it, I'll upload a CSV
            </button>
          </div>
        </div>
      )}

      {showSessionModal && (
        <SessionNameModal
          value={sessionNameInput}
          onChange={setSessionNameInput}
          onConfirm={handleConfirmSession}
          onCancel={() => setShowSessionModal(false)}
        />
      )}

      {modalChart && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setModalChart(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-2xl w-full mx-4 max-h-[85vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">{modalChart.title}</h2>
              <button onClick={() => setModalChart(null)} className="p-2 hover:bg-gray-100 rounded-full transition">
                <svg className="h-6 w-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="w-full min-h-[300px]">{renderPieChart(modalChart.data, modalChart.colors, modalChart.title, true)}</div>
            <p className="mt-4 text-center text-sm text-gray-500">Click outside or press ESC to close</p>
          </div>
        </div>
      )}

      {showSignOutConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowSignOutConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-center">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Sign Out</h2>
              <p className="text-sm text-gray-500 mb-6">Are you sure you want to sign out?</p>
              <div className="flex justify-center space-x-3">
                <button onClick={() => setShowSignOutConfirm(false)} className="px-6 py-3 rounded-lg font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition">Cancel</button>
                <button onClick={confirmSignOut} className="px-6 py-3 rounded-lg font-medium bg-red-600 text-white hover:bg-red-700 transition">Sign Out</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; padding: 24px; background: linear-gradient(135deg, #3da6e2 0%, #1480be 100%); border-radius: 16px; color: #fff; }
        .page-header .header-content h1 { margin: 0 0 8px 0; font-size: 28px; font-weight: 700; }
        .page-header .header-content p { margin: 0; opacity: 0.9; font-size: 14px; }
        .sample-download-btn { color: #fff; text-decoration: none; padding: 10px 20px; border: 2px solid rgba(255,255,255,0.5); border-radius: 8px; transition: all 0.2s; font-weight: 500; display: inline-flex; align-items: center; gap: 8px; }
        .sample-download-btn:hover { background: rgba(255,255,255,0.1); border-color: #fff; }
        
      `}</style>

      {/* Privacy Notice */}
      <div className="bg-white rounded-2xl shadow-lg p-6 border-l-4 border-blue-500">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Data Privacy Notice — RA 10173</h2>
        <p className="text-sm text-gray-700 mb-3">
          Upload anonymized learner data to generate NAT proficiency predictions. Uploaded data is session-based and saved to your account. By proceeding, you confirm compliance with RA 10173 (Data Privacy Act of 2012).
        </p>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <p className="font-semibold text-blue-900 mb-1">IMPORTANT: Learner ID (learnerID) must be created by you (e.g., L001, L002).</p>
          <p className="text-sm text-blue-800">Do NOT use LRN or student names to ensure anonymization.</p>
        </div>
        <div className="flex items-start space-x-3">
          <input type="checkbox" id="privacy-accept" checked={privacyAccepted} onChange={(e) => setPrivacyAccepted(e.target.checked)} className="mt-1 h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500" />
          <label htmlFor="privacy-accept" className="text-sm font-medium text-blue-900 cursor-pointer">
            I understand and agree to proceed — the data I am uploading is anonymized and complies with RA 10173.
          </label>
        </div>
      </div>

      {/* Upload Header */}
      <header className="page-header">
        <div className="header-content">
          <h1>Upload Class Data</h1>
          <p>Upload your Class Data to start a new prediction session </p>
          <p className='text-sm'><b>Note: </b>Download the class data template provided for the prediction process to work properly.</p>
        </div>
        {user && sampleDataset && (
          <a href={`${API_BASE_URL}/api/sample-dataset/download?role=${user.role}&viewMode=${viewMode}`} className="sample-download-btn">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            {sampleDataset.label}
          </a>
        )}
      </header>

      <ToastContainer position="top-right" autoClose={5000} />

      {/* File Upload */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload Class Data</h2>
        <div className={`border-2 border-dashed rounded-xl p-8 text-center transition ${!privacyAccepted ? 'border-gray-300 bg-gray-50 cursor-not-allowed opacity-60' : 'border-gray-300 hover:border-blue-500'}`}>
          <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" id="file-upload" disabled={isLoading || !privacyAccepted} />
          <label htmlFor="file-upload" className={`${!privacyAccepted ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
            <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-gray-600 mb-2">
              {!privacyAccepted
                ? <span className="text-gray-500 font-medium">Accept the privacy notice to upload</span>
                : <><span className="text-blue-600 font-medium">Click to upload</span> or drag and drop</>}
            </p>
            <p className="text-sm text-gray-500">CSV files supported</p>
          </label>
        </div>
        {fileName && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg flex items-center">
            <svg className="h-5 w-5 text-blue-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            <span className="text-sm text-blue-700">{fileName} loaded ({data.length} rows)</span>
          </div>
        )}
      </div>

      {isLoading && (
        <div className="p-4 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Analyzing dataset…
        </div>
      )}

      {hasUploadedData && analysisResult && (
        <div className="space-y-6">
          {/* Dataset Summary */}
          <div ref={datasetSummaryRef} className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Class Data Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Rows', value: analysisResult.row_count, color: 'from-blue-50 to-blue-100', text: 'text-blue-700' },
                { label: 'Total Columns', value: analysisResult.column_count, color: 'from-green-50 to-green-100', text: 'text-green-700' },
                { label: 'Missing Values', value: analysisResult.missing_values.total_missing, color: 'from-blue-50 to-blue-100', text: 'text-blue-700' },
                { label: 'Data Quality', value: `${(100 - analysisResult.missing_values.missing_percentage).toFixed(1)}%`, color: 'from-orange-50 to-orange-100', text: 'text-orange-700' },
              ].map((s) => (
                <div key={s.label} className={`p-4 bg-gradient-to-br ${s.color} rounded-xl`}>
                  <p className={`text-sm font-medium ${s.text.replace('700', '600')}`}>{s.label}</p>
                  <p className={`text-2xl font-bold ${s.text} mt-1`}>{s.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Dataset Preview Table */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Dataset Preview</h2>
                <p className="text-sm text-gray-500 mt-0.5">Showing first {Math.min(10, data.length)} of {data.length} rows</p>
              </div>
            </div>
            <div className="min-w-0 w-400">
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-max divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      {analysisResult.columns.map((col) => (
                        <th
                          key={col.name}
                          className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap"
                        >
                          {col.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {data.slice(0, 10).map((row, rowIdx) => (
                      <tr key={rowIdx} className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        {analysisResult.columns.map((col) => {
                          const val = row[col.name];
                          const isEmpty = val === null || val === undefined || val === '';
                          return (
                            <td
                              key={col.name}
                              className={`px-4 py-2.5 whitespace-nowrap ${isEmpty ? 'text-red-400 italic' : 'text-gray-700'}`}
                            >
                              {isEmpty ? 'missing' : String(val)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Demographics Charts */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {sexDistributionData.length > 0 && (
              <div className="bg-white rounded-2xl shadow-lg p-6 cursor-pointer hover:shadow-xl transition" onClick={() => openPieModal('Gender Distribution', sexDistributionData, colors)}>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Gender Distribution</h2>
                <div className="h-64">{renderPieChart(sexDistributionData, colors, 'Gender Distribution')}</div>
                <p className="text-xs text-gray-500 mt-2 text-center">Click for details</p>
              </div>
            )}
            {bmiDistributionData.length > 0 && (
              <div className="bg-white rounded-2xl shadow-lg p-6 cursor-pointer hover:shadow-xl transition" onClick={() => openPieModal('BMI/Nutritional Status', bmiDistributionData, colors2)}>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">BMI / Nutritional Status</h2>
                <div className="h-64">{renderPieChart(bmiDistributionData, colors2, 'BMI')}</div>
                <p className="text-xs text-gray-500 mt-2 text-center">Click for details</p>
              </div>
            )}
            {motherTongueDistributionData.length > 0 && (
              <div className="bg-white rounded-2xl shadow-lg p-6 cursor-pointer hover:shadow-xl transition" onClick={() => openPieModal('Mother Tongue Distribution', motherTongueDistributionData, colors1)}>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Mother Tongue Distribution</h2>
                <div className="h-64">{renderPieChart(motherTongueDistributionData, colors1, 'Mother Tongue')}</div>
                <p className="text-xs text-gray-500 mt-2 text-center">Click for details</p>
              </div>
            )}
          </div>

          {/* Age Distribution */}
          {ageGroupData.length > 0 && (
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Age Distribution</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ageGroupData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Legend /><Bar dataKey="value" name="Count" fill="#3B82F6" /></BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Missing Values */}
          {analysisResult.missing_values.columns_with_missing.length > 0 && (
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Missing Values by Column</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={missingValuesData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Legend /><Bar dataKey="missing" name="Missing Count" fill="#EF4444" /></BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Subject Stats */}
          {subjectStatsData.length > 0 && (
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Average Statistics by Subject</h2>
                <button onClick={() => setShowRadarChart(!showRadarChart)} className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition">
                  {showRadarChart ? 'Show Bar Chart' : 'Show Radar Chart'}
                </button>
              </div>
              <div className="h-80">
                {showRadarChart ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={subjectStatsData}>
                      <PolarGrid /><PolarAngleAxis dataKey="name" /><PolarRadiusAxis angle={30} domain={[0, 'auto']} />
                      <Radar name="Mean" dataKey="mean" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.6} />
                      <Radar name="Median" dataKey="median" stroke="#10B981" fill="#10B981" fillOpacity={0.6} />
                      <Radar name="Min" dataKey="min" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.6} />
                      <Radar name="Max" dataKey="max" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.6} />
                      <Legend /><Tooltip />
                    </RadarChart>
                  </ResponsiveContainer>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={subjectStatsData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Legend />
                      <Bar dataKey="mean" name="Mean" fill="#3B82F6" /><Bar dataKey="median" name="Median" fill="#10B981" />
                      <Bar dataKey="min" name="Min" fill="#8B5CF6" /><Bar dataKey="max" name="Max" fill="#F59E0B" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}

          {/* Column Details */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <button onClick={() => setColumnsExpanded(!columnsExpanded)} className="w-full flex items-center justify-between">
              <div className='flex flex-col items-start'>
                <h2 className="text-lg font-semibold text-gray-900">
                  Column Details <span className="ml-2 text-sm font-normal text-gray-400">({analysisResult.columns.length})</span>
                </h2>
                <small className='text-sm text-gray-500'>A breakdown of all columns and their information.</small>
              </div>
              <span className={`transition-transform duration-200 inline-block ${columnsExpanded ? 'rotate-180' : ''}`}>
                <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </span>
            </button>
            {columnsExpanded && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                {analysisResult.columns.map(col => (
                  <div key={col.name} className="p-4 rounded-xl border-2 border-gray-200 hover:border-gray-300 transition">
                    <h3 className="font-medium text-gray-900 mb-2">{col.name}</h3>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${col.dtype.includes('int') || col.dtype.includes('float') ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>{col.dtype}</span>
                    <div className="mt-3 space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-gray-500">Non-Empty:</span><span className="font-medium">{col.non_null_count}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Empty:</span><span className="font-medium">{col.null_count}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Unique:</span><span className="font-medium">{col.unique_count ?? '-'}</span></div>
                    </div>
                    <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                      <div className={`h-2 rounded-full ${col.null_percentage > 50 ? 'bg-red-500' : col.null_percentage > 20 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${100 - col.null_percentage}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Run Predictions */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-start justify-between gap-6">
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-gray-900">Run Predictions</h2>
                <p className="text-sm text-gray-500 mt-1">Generate predictions for all {data.length} records. Results will be saved as a session.</p>

                {criticalAnomalies.length > 0 && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-600 font-medium mb-2">⚠️ Cannot run predictions — please fix these required columns:</p>
                    <ul className="text-xs text-red-500 space-y-1">
                      {criticalAnomalies.map((a, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <svg className="h-3 w-3 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <span className="font-medium">{a.column}:</span> {a.message}
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-red-600 mt-2 pt-2 border-t border-red-200">
                      Please ensure these required columns have no missing values before running predictions.
                    </p>
                  </div>
                )}

                {warningAnomalies.length > 0 && criticalAnomalies.length === 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-start gap-2 mb-2">
                        <svg className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-yellow-800">⚠️ Heads up — Missing Values Detected</p>
                          <p className="text-xs text-yellow-700 mt-0.5">The following non-required columns have missing values:</p>
                        </div>
                      </div>

                      <ul className="text-xs text-yellow-700 space-y-1 ml-7">
                        {warningAnomalies.filter(a => a.type === 'missing').map((a, i) => (
                          <li key={i} className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full"></span>
                            <span className="font-medium">{a.column}:</span> {a.message}
                          </li>
                        ))}
                        {warningAnomalies.filter(a => a.type === 'wrong_dtype').map((a, i) => (
                          <li key={i} className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full"></span>
                            <span className="font-medium">{a.column}:</span> {a.message}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-start gap-2">
                        <svg className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-blue-800">How missing values will be handled:</p>
                          <ul className="text-xs text-blue-700 mt-1 space-y-1 ml-5 list-disc">
                            {/* <li><span className="font-medium">Text/Categorical columns:</span> Empty values will be filled with Most Occuring value</li> */}
                            <li><span className="font-medium">Numeric columns:</span> Empty values will be filled with the column's median value</li>
                            <li className="mt-1 text-blue-600 font-medium">Predictions will still run successfully with these automatic fixes</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {criticalAnomalies.length === 0 && warningAnomalies.length === 0 && data.length > 0 && (
                  <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className='material-icons-round text-green-600'>check</span>
                      <p className="text-sm font-medium text-green-700">All checks passed — your dataset is ready for predictions</p>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={handleRunPredictions}
                disabled={isPredicting || !canRunPredictions}
                className={`px-6 py-3 rounded-lg font-medium transition flex items-center space-x-2 whitespace-nowrap ${isPredicting || !canRunPredictions
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700 shadow-md hover:shadow-lg transform hover:-translate-y-0.5'
                  }`}
              >
                {isPredicting ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Running Predictions...</span>
                  </>
                ) : (
                  <>
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Run Predictions</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}