import { useState, useCallback, useMemo, useEffect, } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useNavigate, useLocation, useOutletContext } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { uploadFile, analyzeData, explainBatch, AnalysisResult, BatchPredictionResponse } from '../services/api';
import { updateSession } from '../lib/sessions';
import { API_BASE_URL } from '../config';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, PieSectorShapeProps, Sector,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts';

const colors = ['#fa456d', '#58b9f1', '#ffe369', '#82ca9d', '#caa1ff', 'url(#pattern-checkers)'];
const colors1 = ['#3da6e2', '#be3614', '#8f0d23', '#7bc4e6', '#5aafe0'];
const colors2 = ['#1480be', '#3da6e2', '#ffe369', '#fa456d', '#ca0909'];

const MyCustomPie = (props: PieSectorShapeProps) => <Sector {...props} fill={colors[props.index]} />;
const MyCustomPie1 = (props: PieSectorShapeProps) => <Sector {...props} fill={colors1[props.index]} />;
const MyCustomPie2 = (props: PieSectorShapeProps) => <Sector {...props} fill={colors2[props.index]} />;

interface AnomalyInfo {
  column: string;
  type: 'missing' | 'wrong_dtype' | 'invalid_value';
  message: string;
}

interface OutletContextType {
  sampleDataset: { href: string; filename: string; label: string } | null;
  viewMode?: 'teacher' | 'admin';
}


export function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionName, setSessionName] = useState<string | null>(null);
  const [fullData, setFullData] = useState<Record<string, unknown>[]>([]);
  const [modalChart, setModalChart] = useState<{
    title: string;
    data: { name: string; value: number }[];
    colors: string[];
  } | null>(null);
  const [showRadarChart, setShowRadarChart] = useState(false);
  const [anomalies, setAnomalies] = useState<AnomalyInfo[]>([]);
  const [columnsExpanded, setColumnsExpanded] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  useEffect(() => {
    const state = location.state as { sessionId?: string; sessionName?: string } | null;
    if (state?.sessionId) {
      setSessionId(state.sessionId);
      setSessionName(state.sessionName || null);
      navigate(location.pathname, { replace: true });
    }
  }, [location.state, navigate, location.pathname]);

  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  const handleSignOut = async () => {
    setShowSignOutConfirm(true);
  };

  const confirmSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setModalChart(null); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  useEffect(() => {
    if (modalChart) {
      document.body.style.overflow = 'hidden';
      window.dispatchEvent(new Event('resize'));
    } else {
      document.body.style.overflow = 'unset';
    }
  }, [modalChart]);

  useEffect(() => {
    if (!analysisResult) { setAnomalies([]); return; }
    const newAnomalies: AnomalyInfo[] = [];
    if (analysisResult.missing_values.total_missing > 0) {
      analysisResult.missing_values.columns_with_missing.forEach(col => {
        if (col.missing_count > 0) {
          newAnomalies.push({ column: col.column, type: 'missing', message: `${col.missing_count} missing values` });
        }
      });
    }
    analysisResult.columns.forEach(col => {
      if (col.null_percentage > 50) {
        newAnomalies.push({ column: col.name, type: 'wrong_dtype', message: `High null percentage (${col.null_percentage.toFixed(1)}%)` });
      }
    });
    setAnomalies(newAnomalies);
  }, [analysisResult]);

  const canRunPredictions = useMemo(() => data.length > 0 && anomalies.length === 0 && privacyAccepted, [data.length, anomalies, privacyAccepted]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError('');
    setIsLoading(true);
    setAnalysisResult(null);
    setPredictionError('');
    setAnomalies([]);
    setColumnsExpanded(false);
    try {
      const uploadResponse = await uploadFile(file);
      setData(uploadResponse.preview);
      const fullData = await parseCSVFile(file);
      setFullData(fullData);
      const result = await analyzeData(fullData);
      setAnalysisResult(result);
      if (user?.role === 'admin' || (user?.role === 'researcher' && viewMode === 'admin')) {
        const hasSectionColumn = result.columns.some(col => col.name.toLowerCase() === 'section');
        if (!hasSectionColumn) {
          toast.warn('Admin datasets should include a "Section" column for section-based analysis.', { position: 'top-right', autoClose: 8000 });
        }
      }
      setHasUploadedData(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to process file';
      setError(errorMessage);
      toast.error(errorMessage);
      setHasUploadedData(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const parseCSVFile = async (file: File): Promise<Record<string, unknown>[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          if (!content) { resolve([]); return; }
          const lines = content.split('\n').filter(line => line.trim());
          if (lines.length === 0) { resolve([]); return; }
          const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
          const rows = lines.slice(1).map(line => {
            const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
            const row: Record<string, unknown> = {};
            headers.forEach((header, idx) => {
              const value = values[idx] ?? '';
              const num = parseFloat(value);
              row[header] = isNaN(num) ? value : num;
            });
            return row;
          });
          resolve(rows);
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  };

  const handleRunPredictions = useCallback(async () => {
    if (!canRunPredictions) return;
    const dataToPredict = fullData.length > 0 ? fullData : data;
    if (dataToPredict.length === 0) { setPredictionError('No data available for predictions'); return; }
    setIsPredicting(true);
    setPredictionError('');
    try {
      const response: BatchPredictionResponse = await explainBatch(dataToPredict);
      const predictions = response.results;
      const totalPredictions = predictions.length;
      const averageScore = predictions.reduce((sum, p) => sum + p.prediction, 0) / totalPredictions;
      if (sessionId) {
        updateSession(sessionId, {
          file_name: fileName,
          analysis_summary: analysisResult ? {
            total_rows: analysisResult.row_count,
            total_columns: analysisResult.column_count,
            columns: analysisResult.columns?.map(c => ({ name: c.name, dtype: c.dtype }))
          } : undefined,
          predictions,
          total_predictions: totalPredictions,
          average_score: averageScore
        });
      }
      let resultsPath = '/prediction-table';
      if (user) {
        if (user.role === 'teacher' || user.role === 'admin' || user.role === 'researcher') {
          // All roles use the same prediction-table route in the unified structure
          // The layout will handle showing the appropriate view based on role/mode
          resultsPath = '/prediction-table';
        }
      }
      navigate(resultsPath, { state: { predictions, fileName, sessionId, sessionName } });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to run predictions';
      setPredictionError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsPredicting(false);
    }
  }, [data, fullData, fileName, navigate, sessionId, analysisResult, canRunPredictions, user]);

  const sexDistributionData = useMemo(() => {
    if (!analysisResult) return [];
    const sexColumn = analysisResult.columns.find(col => col.name.toLowerCase() === 'sex' || col.name.toLowerCase() === 'gender');
    if (!sexColumn || !sexColumn.value_counts) return [];
    return Object.entries(sexColumn.value_counts).map(([name, value]) => ({ name, value: Number(value) }));
  }, [analysisResult]);

  const bmiDistributionData = useMemo(() => {
    if (!analysisResult) return [];
    const bmiColumn = analysisResult.columns.find(col => col.name.toLowerCase().includes('bmi') || col.name.toLowerCase().includes('nutritional'));
    if (!bmiColumn || !bmiColumn.value_counts) return [];
    return Object.entries(bmiColumn.value_counts).map(([name, value]) => ({ name, value: Number(value) }));
  }, [analysisResult]);

  const motherTongueDistributionData = useMemo(() => {
    if (!analysisResult) return [];
    const tongueColumn = analysisResult.columns.find(col => col.name.toLowerCase().includes('mother tongue') || col.name.toLowerCase().includes('language'));
    if (!tongueColumn || !tongueColumn.value_counts) return [];
    return Object.entries(tongueColumn.value_counts).map(([name, value]) => ({ name, value: Number(value) }));
  }, [analysisResult]);

  const ageGroupData = useMemo(() => {
    if (!analysisResult) return [];
    const ageColumn = analysisResult.columns.find(col => col.name.toLowerCase() === 'age');
    if (!ageColumn || !ageColumn.statistics) return [];
    const ageCounts: Record<string, number> = {};
    if (analysisResult.preview) {
      analysisResult.preview.forEach(row => {
        const age = String(row.age);
        if (age && age !== 'undefined') ageCounts[age] = (ageCounts[age] || 0) + 1;
      });
    }
    return Object.entries(ageCounts).sort(([a], [b]) => Number(a) - Number(b)).map(([name, value]) => ({ name, value }));
  }, [analysisResult]);

  const missingValuesData = useMemo(() => {
    if (!analysisResult) return [];
    return analysisResult.missing_values.columns_with_missing.map(item => ({
      name: item.column,
      missing: item.missing_count,
      percentage: ((item.missing_count / analysisResult.row_count) * 100).toFixed(1)
    }));
  }, [analysisResult]);

  const subjectStatsData = useMemo(() => {
    if (!analysisResult) return [];
    const subjects = ['Math', 'English', 'Filipino', 'Science', 'Araling Panlipunan'];
    const subjectKeyMap: Record<string, string[]> = {
      'Math': ['math'], 'English': ['english'],
      'Filipino': ['filipino', 'tagalog', 'fil'], 'Science': ['science', 'sci'],
      'Araling Panlipunan': ['araling panlipunan', 'aral pan', 'ap', 'social studies', 'hekasi', 'sibika at kultura', 'sibika']
    };
    const subjectStats: Record<string, { mean: number[]; median: number[]; min: number[]; max: number[] }> = {};
    subjects.forEach(subject => { subjectStats[subject] = { mean: [], median: [], min: [], max: [] }; });
    analysisResult.columns.forEach(col => {
      if (!col.statistics) return;
      const colNameLower = col.name.toLowerCase();
      for (const subject of subjects) {
        const keywords = subjectKeyMap[subject] || [subject.toLowerCase()];
        if (keywords.some(keyword => colNameLower.includes(keyword))) {
          if (col.statistics.mean !== null) subjectStats[subject].mean.push(col.statistics.mean);
          if (col.statistics.median !== null) subjectStats[subject].median.push(col.statistics.median);
          if (col.statistics.min !== null) subjectStats[subject].min.push(col.statistics.min);
          if (col.statistics.max !== null) subjectStats[subject].max.push(col.statistics.max);
          break;
        }
      }
    });
    return subjects.filter(subject => subjectStats[subject].mean.length > 0).map(subject => {
      const stats = subjectStats[subject];
      return {
        name: subject,
        mean: parseFloat((stats.mean.reduce((a, b) => a + b, 0) / stats.mean.length).toFixed(2)),
        median: parseFloat((stats.median.reduce((a, b) => a + b, 0) / stats.median.length).toFixed(2)),
        min: parseFloat((stats.min.reduce((a, b) => a + b, 0) / stats.min.length).toFixed(2)),
        max: parseFloat((stats.max.reduce((a, b) => a + b, 0) / stats.max.length).toFixed(2)),
      };
    });
  }, [analysisResult]);

  const openPieModal = (title: string, data: { name: string; value: number }[], colorScheme: string[]) => {
    setModalChart({ title, data, colors: colorScheme });
  };

  const closeModal = () => setModalChart(null);

   const renderPieChart = (data: { name: string; value: number }[], colors: string[], title: string, isModal = false) => {
     const CustomPie = (props: PieSectorShapeProps) => <Sector {...props} fill={colors[props.index % colors.length]} />;
     if (isModal) {
       return (
         <ResponsiveContainer key={title} width="100%" aspect={1}>
           <PieChart>
             <Pie data={data} cx="50%" cy="50%" labelLine={true} label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`} outerRadius={150} dataKey="value" shape={CustomPie} />
             <Tooltip />
             <Legend iconType="none" formatter={(value, entry, index) => (
               <span className="flex items-center">
                 <span className="w-3 h-3 mr-2 inline-block rounded-sm" style={{ backgroundColor: colors[index % colors.length] }} />
                 {value}
               </span>
             )} />
           </PieChart>
         </ResponsiveContainer>
       );
     }
     return (
       <ResponsiveContainer width="100%" height="100%">
         <PieChart>
           <Pie data={data} cx="50%" cy="50%" labelLine={true} label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`} outerRadius={80} dataKey="value" shape={CustomPie} />
           <Tooltip />
           <Legend iconType="none" formatter={(value, entry, index) => (
             <span className="flex items-center">
               <span className="w-3 h-3 mr-2 inline-block rounded-sm" style={{ backgroundColor: colors[index % colors.length] }} />
               {value}
             </span>
           )} />
         </PieChart>
       </ResponsiveContainer>
     );
   };

  return (
    <div className="space-y-8">
      {/* Privacy Notice Card - Must acknowledge before uploading */}
      <div className="bg-white rounded-2xl shadow-lg p-6 border-l-4 border-blue-500">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Data Privacy Notice — RA 10173</h2>
        </div>
        <div className="text-gray-700 space-y-4">
          <p className="text-sm">
            Upload anonymized learner data to generate NAT proficiency predictions. Uploaded data is session-based and will not be stored after this session ends. By proceeding, you confirm compliance with RA 10173 (Data Privacy Act of 2012).
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="font-semibold text-blue-900 mb-2">IMPORTANT: Learner ID(learnerID) must be created by you (e.g., L001, L002).</p>
            <p className="text-sm text-blue-800">
              Do NOT use LRN (Learner Reference Number) or student names to ensure anonymization.
            </p>
          </div>
        </div>
        <div className="flex items-start space-x-3 mt-4">
          <input
            type="checkbox"
            id="privacy-accept"
            checked={privacyAccepted}
            onChange={(e) => setPrivacyAccepted(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
          />
          <div>
            <label htmlFor="privacy-accept" className="text-sm font-medium text-blue-900 cursor-pointer">
              I understand and agree to proceed
            </label>
            <p className="text-xs text-blue-700">
              I confirm that the data I am uploading is anonymized and complies with RA 10173
            </p>
          </div>
        </div>
      </div>

      {/* Modal for charts */}
      {
        modalChart && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
            <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-2xl w-full mx-4 max-h-[85vh] overflow-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">{modalChart.title}</h2>
                <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-full transition">
                  <svg className="h-6 w-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="w-full min-h-[300px]">{renderPieChart(modalChart.data, modalChart.colors, modalChart.title, true)}</div>
              <div className="mt-4 text-center text-sm text-gray-500">Click outside or press ESC to close</div>
            </div>
          </div>
        )
      } {/* chart modal end */}

      {/* Sign Out Confirmation Modal */}
      {
        showSignOutConfirm && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowSignOutConfirm(false)}>
            <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
              <div className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 mb-4">
                  <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Sign Out</h2>
                <p className="text-sm text-gray-500 mb-6">Are you sure you want to sign out? Your session data will be cleared.</p>
                <div className="flex justify-center space-x-3">
                  <button onClick={() => setShowSignOutConfirm(false)} className="px-6 py-3 rounded-lg font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition">
                    Cancel
                  </button>
                  <button onClick={confirmSignOut} className="px-6 py-3 rounded-lg font-medium bg-red-600 text-white hover:bg-red-700 transition">
                    Sign Out
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }

      <style>{`
        .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; padding: 24px; background: linear-gradient(135deg, #3da6e2 0%, #1480be 100%); border-radius: 16px; color: #fff; }
        .page-header .header-content h1 { margin: 0 0 8px 0; font-size: 28px; font-weight: 700; }
        .page-header .header-content p { margin: 0; opacity: 0.9; font-size: 14px; }
        .sample-download-btn { color: #fff; text-decoration: none; padding: 10px 20px; border: 2px solid rgba(255,255,255,0.5); border-radius: 8px; transition: all 0.2s; font-weight: 500; display: inline-flex; align-items: center; gap: 8px; }
        .sample-download-btn:hover { background: rgba(255,255,255,0.1); border-color: #fff; }
      `}</style>

      <header className="page-header">
        <div className="header-content">
          <h1>Upload Dataset</h1>
          <p>Upload your dataset here to start analysis</p>
        </div>
        {user && (
          <div>
            {sampleDataset && (
              <div>
                <a href={`${API_BASE_URL}/api/sample-dataset/download?role=${user.role}&viewMode=${viewMode}`} className="sample-download-btn">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  {sampleDataset.label}
                </a>
                <div className="mt-2 text-medium text-white text-left w-100">
                  <p className="font-bold mb-1">Template includes required columns:</p>
                  <p className="ml-2">• Learner ID (teacher-created)</p>
                  <p className="ml-2">• Sex, Age, Mother Tongue, Nutritional Status(BMI)</p>
                  <p className="ml-2">• All subject grades from Grade 1-5 (Filipino, English, Math, Science, Aral Pan)</p>
                  <p className="mt-1"><span className="font-small">⚠ Learner ID (learnerID):</span> Create your own ID for each student (e.g., L001, L002). Do NOT use LRN or student names.</p>
                  {user.role === 'admin' || (user.role === 'researcher' && viewMode === 'admin') && (
                    <>
                      <p className="mt-1 ml-2">• <span className="font-small">Section</span> (required for admin - e.g., A, B, C, D)</p>
                      <p className="text-medium mt-1 text-white-100 ">
                        📋 Admin Note: Combine all Grade 6 sections into ONE file with consistent section names (e.g., all "A", not "a" or "Section A")
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Upload Section - Disabled until privacy accepted */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {sessionName ? `Upload data for "${sessionName}" session` : 'Upload Dataset'}
        </h2>
        <div className={`border-2 border-dashed rounded-xl p-8 text-center transition ${!privacyAccepted
          ? 'border-gray-300 bg-gray-50 cursor-not-allowed opacity-60'
          : 'border-gray-300 hover:border-blue-500'}`}>
          <input
            type="file"
            accept=".csv,.xlsx"
            onChange={handleFileUpload}
            className="hidden"
            id="file-upload"
            disabled={isLoading || !privacyAccepted}
          />
          <label htmlFor="file-upload" className={`${!privacyAccepted ? 'cursor-not-allowed' : 'cursor-pointer'} ${isLoading ? 'opacity-50' : ''}`}>
            <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-gray-600 mb-2">
              {!privacyAccepted ? (
                <span className="text-gray-500 font-medium">Please accept the privacy notice to upload</span>
              ) : (
                <><span className="text-blue-600 font-medium">Click to upload</span> or drag and drop</>
              )}
            </p>
            <p className="text-sm text-gray-500">CSV file upload</p>
          </label>
        </div>
        {!privacyAccepted && (
          <div className="mt-3 text-center">
            <p className="text-xs text-red-500">⚠ You must accept the Data Privacy Notice above before uploading files</p>
          </div>
        )}
        {fileName && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg flex items-center">
            <svg className="h-5 w-5 text-blue-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-sm text-blue-700">{fileName} loaded ({data.length} rows)</span>
          </div>
        )}
      </div>

      <ToastContainer position="top-right" autoClose={5000} />

      {
        isLoading && (
          <div className="p-4 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Analyzing dataset...
          </div>
        )
      }

      {
        hasUploadedData && analysisResult && (
          <div className="space-y-6">
            {/* Dataset Summary */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Dataset Summary</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl">
                  <p className="text-sm font-medium text-blue-600">Total Rows</p>
                  <p className="text-2xl font-bold text-blue-700 mt-1">{analysisResult.row_count}</p>
                </div>
                <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-xl">
                  <p className="text-sm font-medium text-green-600">Total Columns</p>
                  <p className="text-2xl font-bold text-green-700 mt-1">{analysisResult.column_count}</p>
                </div>
                <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl">
                  <p className="text-sm font-medium text-purple-600">Missing Values</p>
                  <p className="text-2xl font-bold text-purple-700 mt-1">{analysisResult.missing_values.total_missing}</p>
                  <p className="text-xs text-purple-600 mt-2">{analysisResult.missing_values.missing_percentage.toFixed(2)}% of total</p>
                </div>
                <div className="p-4 bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl">
                  <p className="text-sm font-medium text-orange-600">Data Quality</p>
                  <p className="text-2xl font-bold text-orange-700 mt-1">{(100 - analysisResult.missing_values.missing_percentage).toFixed(1)}%</p>
                  <p className="text-xs text-orange-600 mt-2">Complete data</p>
                </div>
              </div>
            </div>

            {/* Demographics Charts */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {sexDistributionData.length > 0 && (
                <div className="bg-white rounded-2xl shadow-lg p-6 cursor-pointer hover:shadow-xl transition"
                  onClick={() => openPieModal('Gender Distribution', sexDistributionData.map(item => ({ ...item, name: item.name === 'M' ? 'Male' : item.name === 'F' ? 'Female' : item.name })), colors)}>
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Gender Distribution</h2>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={sexDistributionData.map(item => ({ ...item, name: item.name === 'M' ? 'Male' : item.name === 'F' ? 'Female' : item.name }))} cx="50%" cy="50%" labelLine={false} label={({ name }) => name} outerRadius={80} dataKey="value" shape={MyCustomPie} />
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-xs text-gray-500 mt-2 text-center">Click chart for details</p>
                </div>
              )}
              {bmiDistributionData.length > 0 && (
                <div className="bg-white rounded-2xl shadow-lg p-6 cursor-pointer hover:shadow-xl transition"
                  onClick={() => openPieModal('BMI/Nutritional Status', bmiDistributionData, colors2)}>
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">BMI/Nutritional Status</h2>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={bmiDistributionData} cx="50%" cy="50%" labelLine={false} label={({ name }) => name} outerRadius={80} shape={MyCustomPie2} dataKey="value" />
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-xs text-gray-500 mt-2 text-center">Click chart for details</p>
                </div>
              )}
              {motherTongueDistributionData.length > 0 && (
                <div className="bg-white rounded-2xl shadow-lg p-6 cursor-pointer hover:shadow-xl transition"
                  onClick={() => openPieModal('Mother Tongue Distribution', motherTongueDistributionData, colors1)}>
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Mother Tongue Distribution</h2>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={motherTongueDistributionData} cx="50%" cy="50%" labelLine={false} label={({ name }) => name} outerRadius={80} shape={MyCustomPie1} dataKey="value" />
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-xs text-gray-500 mt-2 text-center">Click chart for details</p>
                </div>
              )}
            </div>

            {/* Age Distribution */}
            {ageGroupData.length > 0 && (
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Age Distribution</h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ageGroupData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis />
                      <Tooltip /><Legend />
                      <Bar dataKey="value" name="Count" fill="#3B82F6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Missing Values Chart */}
            {analysisResult.missing_values.columns_with_missing.length > 0 && (
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Missing Values by Column</h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={missingValuesData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis />
                      <Tooltip formatter={(value, name) => [name === 'missing' ? value : `${value}%`, name === 'missing' ? 'Missing Count' : 'Missing Percentage']} />
                      <Legend />
                      <Bar dataKey="missing" name="Missing Count" fill="#EF4444" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Subject Stats Chart */}
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
                      <BarChart data={subjectStatsData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis />
                        <Tooltip /><Legend />
                        <Bar dataKey="mean" name="Mean" fill="#3B82F6" />
                        <Bar dataKey="median" name="Median" fill="#10B981" />
                        <Bar dataKey="min" name="Min" fill="#8B5CF6" />
                        <Bar dataKey="max" name="Max" fill="#F59E0B" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            )}

            {/* Column Details - Collapsible */}
            <div className="bg-white rounded-2xl shadow-lg p-6">

              <button
                onClick={() => setColumnsExpanded(!columnsExpanded)}
                className="w-full flex items-center justify-between"
              >
                <h2 className="text-lg font-semibold text-gray-900">
                  Column Details
                  <span className="ml-2 text-sm font-normal text-gray-400">
                    ({analysisResult.columns.length} columns)
                  </span>
                </h2>

                <span className="flex items-center space-x-2 text-gray-500">
                  <span className="text-sm font-medium">
                    {columnsExpanded ? 'Collapse' : 'Expand'}
                  </span>
                  <span
                    className="transition-transform duration-200 inline-block"
                    style={{ transform: columnsExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                    aria-hidden
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </span>
                </span>
              </button>

              {columnsExpanded && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                  {analysisResult.columns.map(col => (
                    <div key={col.name} className="p-4 rounded-xl border-2 border-gray-200 hover:border-gray-300 transition">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-medium text-gray-900">{col.name}</h3>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${col.dtype.includes('int') || col.dtype.includes('float') ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                          {col.dtype}
                        </span>
                        {col.is_id_column && (
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">ID</span>
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm"><span className="text-gray-500">Non-Empty:</span><span className="font-medium">{col.non_null_count}</span></div>
                        <div className="flex justify-between text-sm"><span className="text-gray-500">Empty:</span><span className="font-medium">{col.null_count}</span></div>
                        <div className="flex justify-between text-sm"><span className="text-gray-500">Empty %:</span><span className="font-medium">{col.null_percentage.toFixed(2)}%</span></div>
                        <div className="flex justify-between text-sm"><span className="text-gray-500">Unique:</span><span className="font-medium">{col.unique_count || '-'}</span></div>
                        {col.duplicate_count !== undefined && (
                          <div className="flex justify-between text-sm"><span className="text-gray-500">Duplicates:</span><span className="font-medium">{col.duplicate_count}</span></div>
                        )}
                        <div className="mt-2">
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div className={`h-2 rounded-full ${col.null_percentage > 50 ? 'bg-red-500' : col.null_percentage > 20 ? 'bg-yellow-500' : 'bg-green-500'}`}
                              style={{ width: `${100 - col.null_percentage}%` }} />
                          </div>
                        </div>
                        {col.statistics && (
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <p className="text-xs font-medium text-gray-500 mb-1">Statistics</p>
                            <div className="grid grid-cols-2 gap-1 text-xs">
                              <div><span className="text-gray-400">Mean:</span><span className="ml-1 font-medium">{col.statistics.mean?.toFixed(2)}</span></div>
                              <div><span className="text-gray-400">Std:</span><span className="ml-1 font-medium">{col.statistics.std?.toFixed(2)}</span></div>
                              <div><span className="text-gray-400">Min:</span><span className="ml-1 font-medium">{col.statistics.min?.toFixed(2)}</span></div>
                              <div><span className="text-gray-400">Max:</span><span className="ml-1 font-medium">{col.statistics.max?.toFixed(2)}</span></div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Run Predictions */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Run Predictions</h2>
                  <p className="text-sm text-gray-500 mt-1">Generate predictions for all {data.length} records in your dataset</p>
                  {anomalies.length > 0 && (
                    <div className="mt-2 p-2 bg-red-50 rounded-lg">
                      <p className="text-sm text-red-600 font-medium">Dataset has anomalies:</p>
                      <ul className="text-xs text-red-500 mt-1 list-disc list-inside">
                        {anomalies.slice(0, 3).map((a, i) => <li key={i}>{a.column}: {a.message}</li>)}
                        {anomalies.length > 3 && <li>...and {anomalies.length - 3} more</li>}
                      </ul>
                    </div>
                  )}
                </div>
                <button
                  onClick={handleRunPredictions}
                  disabled={isPredicting || !canRunPredictions}
                  className={`px-6 py-3 rounded-lg font-medium transition flex items-center space-x-2 ${isPredicting || !canRunPredictions ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}
                >
                  {isPredicting ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
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
        )
      }
    </div >
  );
}