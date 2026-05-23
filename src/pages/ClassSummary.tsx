import { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { PredictionResult as ApiPredictionResult, getProficiencyLabels } from '../services/api';
import type { ProficiencyBand } from '../services/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';

// ─── Feature maps ─────────────────────────────────────────────────────────────

const ACADEMIC_FEATURE_MAP: Record<string, { label: string; icon: string }> = {
  Math_avg: { label: 'Mathematics', icon: '📐' },
  Filipino_avg: { label: 'Filipino', icon: '📖' },
  English_avg: { label: 'English', icon: '🔤' },
  AralPan_avg: { label: 'Araling Panlipunan', icon: '🌏' },
  Science_avg: { label: 'Science', icon: '🔬' },
};

const DEMOGRAPHIC_FEATURE_MAP: Record<string, { group: string; label: string }> = {
  Gender_F: { group: 'Gender', label: 'Female' },
  Gender_M: { group: 'Gender', label: 'Male' },

  'Mother Tongue_Cebuano / Sinugbuanong Binisay': { group: 'Mother Tongue', label: 'Cebuano / Bisaya' },
  'Mother Tongue_English': { group: 'Mother Tongue', label: 'English' },
  'Mother Tongue_Hiligaynon': { group: 'Mother Tongue', label: 'Hiligaynon' },
  'Mother Tongue_Ilocano': { group: 'Mother Tongue', label: 'Ilocano' },
  'Mother Tongue_Kamayo': { group: 'Mother Tongue', label: 'Kamayo' },
  'Mother Tongue_Kapampangan': { group: 'Mother Tongue', label: 'Kapampangan' },
  'Mother Tongue_Maranao': { group: 'Mother Tongue', label: 'Maranao' },
  'Mother Tongue_Pangasinan': { group: 'Mother Tongue', label: 'Pangasinan' },
  'Mother Tongue_Tagalog': { group: 'Mother Tongue', label: 'Tagalog' },

  'Nutritional Status_Normal': { group: 'Nutritional Status', label: 'Normal' },
  'Nutritional Status_Obese': { group: 'Nutritional Status', label: 'Obese' },
  'Nutritional Status_Overweight': { group: 'Nutritional Status', label: 'Overweight' },
  'Nutritional Status_Severely Wasted': { group: 'Nutritional Status', label: 'Severely Wasted' },
  'Nutritional Status_Wasted': { group: 'Nutritional Status', label: 'Wasted' },
};

const SIGNIFICANCE_THRESHOLD = 0.05;

const SUBJECT_PREFIX_TO_LABEL: Record<string, string> = {
  'Filipino': 'Filipino',
  'English': 'English',
  'Math': 'Mathematics',
  'Science': 'Science',
  'Aral Pan': 'Araling Panlipunan',
};

const SCORE_RANGES = ['75-80', '81-85', '86-90', '91-95', '96-100'] as const;

function getScoreRange(score: number): string | null {
  if (score >= 75 && score <= 80) return '75-80';
  if (score >= 81 && score <= 85) return '81-85';
  if (score >= 86 && score <= 90) return '86-90';
  if (score >= 91 && score <= 95) return '91-95';
  if (score >= 96 && score <= 100) return '96-100';
  return null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClassSummaryState {
  predictions: ApiPredictionResult[];
  fileName?: string;
  sessionName?: string;
  rawData?: Record<string, unknown>[];
}

interface AggregatedFeature {
  feature: string;
  avgShap: number;
  avgAbsShap: number;
  count: number;
  positiveCount: number;
  negativeCount: number;
}

interface FactorItem {
  label: string;
  icon?: string;
  avgShap: number;
  avgAbsShap: number;
}

interface DemoGroup {
  group: string;
  features: FactorItem[];
}

const FactorPillList = ({ items }: { items: FactorItem[] }) => {
  const helping = items
    .filter(f => f.avgShap > SIGNIFICANCE_THRESHOLD)
    .sort((a, b) => b.avgShap - a.avgShap);
  const hurting = items
    .filter(f => f.avgShap < -SIGNIFICANCE_THRESHOLD)
    .sort((a, b) => a.avgShap - b.avgShap);

  if (helping.length === 0 && hurting.length === 0) return null;

  return (
    <div className="space-y-2">
      {helping.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {helping.map(f => (
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
          {hurting.map(f => (
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


// ─── Nutritional Status Pie Chart ─────────────────────────────────────────────

const NUTRITION_COLORS: Record<string, string> = {
  Normal: '#22c55e',
  Overweight: '#f59e0b',
  Obese: '#ef4444',
  Wasted: '#3b82f6',
  'Severely Wasted': '#8b5cf6',
};

const NutritionalPieChart = ({ rawData }: { rawData: Record<string, unknown>[] }) => {
  const data = useMemo(() => {
    const counts: Record<string, number> = {};
    rawData.forEach(row => {
      const val = String(
        row['Nutritional Status'] ?? row['nutritional status'] ?? row.nutritional_status ?? ''
      ).trim();
      if (val) counts[val] = (counts[val] ?? 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [rawData]);

  if (data.length === 0) return null;

  const COLORS = data.map(d => NUTRITION_COLORS[d.name] ?? '#6b7280');

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 h-full">
      <h3 className="text-base font-semibold text-gray-900 mb-4">Nutritional Status</h3>
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            outerRadius={90}
            dataKey="value"
            label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
            labelLine={true}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

// ─── Mother Tongue Bar Chart ───────────────────────────────────────────────────

const MotherTongueBarChart = ({ rawData }: { rawData: Record<string, unknown>[] }) => {
  const data = useMemo(() => {
    const counts: Record<string, number> = {};
    rawData.forEach(row => {
      const val = String(
        row['Mother Tongue'] ?? row['mother tongue'] ?? row.mother_tongue ?? ''
      ).trim();
      if (val) counts[val] = (counts[val] ?? 0) + 1;
    });
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([name, value]) => ({ name, value }));
  }, [rawData]);

  if (data.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 h-full">
      <h3 className="text-base font-semibold text-gray-900 mb-4">Mother Tongue Distribution</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" angle={-35} textAnchor="end" interval={0} tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="value" name="Students" fill="#3da6e2" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// ─── Subject Average Distribution Charts ──────────────────────────────────────

function computeSubjectAverages(
  rawData: Record<string, unknown>[],
  prefix: string
): number[] {
  return rawData.map(row => {
    const grades = Object.entries(row)
      .filter(([key]) => key.startsWith(prefix + ' ') && !isNaN(Number(key.split(' ').pop())))
      .map(([, val]) => Number(val))
      .filter(v => !isNaN(v));
    if (grades.length === 0) return null;
    return grades.reduce((s, v) => s + v, 0) / grades.length;
  }).filter((v): v is number => v !== null);
}

const SubjectDistributionChart = ({
  label,
  averages,
}: {
  label: string;
  averages: number[];
}) => {
  const data = useMemo(() => {
    const counts: Record<string, number> = {
      '75-80': 0, '81-85': 0, '86-90': 0, '91-95': 0, '96-100': 0,
    };
    averages.forEach(avg => {
      const range = getScoreRange(avg);
      if (range) counts[range]++;
    });
    return SCORE_RANGES.map(range => ({ range, students: counts[range] }));
  }, [averages]);

  const hasData = data.some(d => d.students > 0);
  if (!hasData) return null;

  return (
    <div className="bg-white rounded-2xl shadow-lg p-5">
      <h4 className="text-sm font-semibold text-gray-800 mb-3">{label}</h4>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="range" tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v) => [v, 'Students']} />
          <Bar dataKey="students" name="Students" fill="#1480be" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

const SubjectAverageDistributions = ({ rawData }: { rawData: Record<string, unknown>[] }) => {
  const subjects = useMemo(() => [
    { prefix: 'Math', label: 'Math Average Distribution' },
    { prefix: 'Science', label: 'Science Average Distribution' },
    { prefix: 'Filipino', label: 'Filipino Average Distribution' },
    { prefix: 'English', label: 'English Average Distribution' },
    { prefix: 'Aral Pan', label: 'Aral Pan Average Distribution' },
  ].map(s => ({ ...s, averages: computeSubjectAverages(rawData, s.prefix) }))
    .filter(s => s.averages.length > 0), [rawData]);

  if (subjects.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Distribution of Subject Averages</h2>
      <p className="text-sm text-gray-500 mb-5">Number of students per score range across subjects</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {subjects.map(s => (
          <SubjectDistributionChart key={s.prefix} label={s.label} averages={s.averages} />
        ))}
      </div>
    </div>
  );
};
// ─── FeatureImportanceSection ─────────────────────────────────────────────────

const FeatureImportanceSection = ({ aggregated }: { aggregated: AggregatedFeature[] }) => {
  const significant = aggregated.filter(f => f.avgAbsShap >= SIGNIFICANCE_THRESHOLD);

  const academicItems: FactorItem[] = significant
    .filter(f => f.feature in ACADEMIC_FEATURE_MAP)
    .map(f => ({
      label: ACADEMIC_FEATURE_MAP[f.feature].label,
      icon: ACADEMIC_FEATURE_MAP[f.feature].icon,
      avgShap: f.avgShap,
      avgAbsShap: f.avgAbsShap,
    }));

  // Build demographic groups, then discard any group where no pill would render
  const demoGroups = useMemo<DemoGroup[]>(() => {
    const groupMap = new Map<string, DemoGroup>();
    significant
      .filter(f => f.feature in DEMOGRAPHIC_FEATURE_MAP)
      .forEach(f => {
        const meta = DEMOGRAPHIC_FEATURE_MAP[f.feature];
        if (!meta) return;
        if (!groupMap.has(meta.group)) {
          groupMap.set(meta.group, { group: meta.group, features: [] });
        }
        groupMap.get(meta.group)!.features.push({
          label: meta.label,
          avgShap: f.avgShap,
          avgAbsShap: f.avgAbsShap,
        });
      });

    // Keep only groups that have at least one visually significant item
    return Array.from(groupMap.values()).filter(g =>
      g.features.some(
        f => f.avgShap > SIGNIFICANCE_THRESHOLD || f.avgShap < -SIGNIFICANCE_THRESHOLD
      )
    );
  }, [significant]);

  const hasAcademic = academicItems.some(
    f => f.avgShap > SIGNIFICANCE_THRESHOLD || f.avgShap < -SIGNIFICANCE_THRESHOLD
  );
  const hasDemo = demoGroups.length > 0;

  if (!hasAcademic && !hasDemo) return null;

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Factors that affect learners</h2>
        <p className="text-sm text-gray-500 mt-1">
          Based on the class predictions, here are the factors that most influenced students' MPS on average.
        </p>
      </div>

      {/* Shared legend */}
      <div className="flex items-center gap-4 mb-6 pb-4 border-b border-gray-100">
        <span className="flex items-center gap-2 text-sm text-gray-500">
          <span className="w-3 h-3 rounded-full bg-green-500 inline-block flex-shrink-0" />
          Enrichment Subjects (raise predicted MPS)
        </span>
        <span className="flex items-center gap-2 text-sm text-gray-500">
          <span className="w-3 h-3 rounded-full bg-red-500 inline-block flex-shrink-0" />
          Remedial Subjects (lower predicted MPS)
        </span>
      </div>

      {/* Academic factors */}
      {hasAcademic && (
        <div className={hasDemo ? 'mb-6' : ''}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center text-sm">🎓</div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Academic factors</p>
              <p className="text-xs text-gray-400">Based on past subject grades</p>
            </div>
          </div>
          <FactorPillList items={academicItems} />
          <p className="mt-4 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            These reflect historical grades and cannot be changed, but they help identify which subjects to prioritize when supporting students.
          </p>
        </div>
      )}

      {hasAcademic && hasDemo && <hr className="border-gray-100 my-6" />}

      {/* Demographic factors */}
      {hasDemo && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-sm">👥</div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Demographic factors</p>
              <p className="text-xs text-gray-400">Background characteristics — for context, not judgment</p>
            </div>
          </div>
          <div className="space-y-5">
            {demoGroups.map(group => (
              <div key={group.group}>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                  {group.group}
                </p>
                <FactorPillList items={group.features} />
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            These patterns may appear across the class, but every student is unique. Use these as conversation starters, not conclusions.
          </p>
        </div>
      )}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export function ClassSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { viewMode } = useOutletContext<{ viewMode: string }>();

  const [proficiencyBands, setProficiencyBands] = useState<ProficiencyBand[]>([]);

  useEffect(() => {
    getProficiencyLabels()
      .then((res) => setProficiencyBands(res.bands))
      .catch(() => setProficiencyBands([]));
  }, []);

  const getBandForScore = (score: number): ProficiencyBand | null => {
    for (const band of proficiencyBands) {
      const m = band.range.match(/^(\d+)[-–](\d+)$/);
      if (m) {
        const lo = parseInt(m[1]);
        const hi = parseInt(m[2]);
        if (score >= lo && score <= hi) return band;
      }
    }
    return null;
  };

  const state = location.state as ClassSummaryState | null;
  const predictions = state?.predictions || [];
  const fileName = state?.fileName || 'Dataset';
  const sessionName = state?.sessionName || '';
  const rawData = state?.rawData || [];

  const totalPredictions = predictions.length;
  const passedCount = predictions.filter(p => (p.proficiency?.code ?? 0) >= 3).length;
  const failedCount = totalPredictions - passedCount;
  const averageScore = totalPredictions > 0
    ? predictions.reduce((sum, p) => sum + p.prediction, 0) / totalPredictions
    : 0;

  const avgBand = getBandForScore(averageScore);
  const avgColor = avgBand?.color || '#6b7280';

  const aggregatedFeatureImportance = useMemo<AggregatedFeature[]>(() => {
    if (!predictions.length || !predictions[0]?.explanation?.features) return [];
    const featureMap = new Map<string, AggregatedFeature>();
    predictions.forEach(pred => {
      if (!pred.explanation?.features) return;
      pred.explanation.features.forEach((shapFeature: { feature: string; shap_value: number }) => {
        const { feature, shap_value } = shapFeature;
        if (!featureMap.has(feature)) {
          featureMap.set(feature, { feature, avgShap: 0, avgAbsShap: 0, count: 0, positiveCount: 0, negativeCount: 0 });
        }
        const current = featureMap.get(feature)!;
        current.count++;
        current.avgShap += shap_value;
        current.avgAbsShap += Math.abs(shap_value);
        if (shap_value > 0) current.positiveCount++;
        else current.negativeCount++;
      });
    });
    return Array.from(featureMap.values())
      .map(item => ({ ...item, avgShap: item.avgShap / item.count, avgAbsShap: item.avgAbsShap / item.count }))
      .sort((a, b) => b.avgAbsShap - a.avgAbsShap);
  }, [predictions]);

  const backDestination = useMemo(() => {
    const isAdminView = user?.role === 'admin' || (user?.role === 'researcher' && viewMode === 'admin');
    return isAdminView ? '/overview' : '/dashboard';
  }, [user, viewMode]);

  if (predictions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="rounded-full bg-yellow-100 w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <svg className="h-8 w-8 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">No Class Data Available</h2>
          <p className="text-gray-600 mb-6">Please run predictions first to view the class summary.</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <header className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {fileName.endsWith('.csv') ? fileName.slice(0, -4) : fileName} Summary
              </h1>
            </div>
            <button
              onClick={() => navigate('/prediction-table', { state: { predictions, fileName, sessionName } })}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              View Detailed Results
            </button>
          </div>
        </header>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 mb-8">
          <div className="bg-white rounded-2xl shadow-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500">Total Learners</p>
                <p className="text-2xl font-bold mt-1 text-blue-800" >{totalPredictions}</p>
              </div>
              <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-blue-100">
                <span className='material-icons-round text-blue-700'>people</span>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500">Average MPS</p>
                <p className="text-2xl font-bold mt-1" style={{ color: avgColor }}>{averageScore.toFixed(1)}</p>
              </div>
              <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: avgColor + '20' }}>
                <span className='material-icons-round' style={{ color: avgColor }}>leaderboard</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500">Above Proficient</p>
                <p className="text-2xl font-bold text-green-600 mt-1">{passedCount}</p>
                <p className="text-xs text-gray-500">
                  {totalPredictions > 0 ? ((passedCount / totalPredictions) * 100).toFixed(0) : 0}%
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-green-100 flex items-center justify-center">
                <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500">Below Proficient</p>
                <p className="text-2xl font-bold text-red-600 mt-1">{failedCount}</p>
                <p className="text-xs text-gray-500">
                  {totalPredictions > 0 ? ((failedCount / totalPredictions) * 100).toFixed(0) : 0}%
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center">
                <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>


        {/* Demographics — 2 column layout */}
        {rawData.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <NutritionalPieChart rawData={rawData} />
            <MotherTongueBarChart rawData={rawData} />
          </div>
        )}

        {/* Subject Average Distributions */}
        {rawData.length > 0 && (
          <SubjectAverageDistributions rawData={rawData} />
        )}

        {/* Feature Importance */}
        {predictions[0]?.explanation?.features && (
          <FeatureImportanceSection aggregated={aggregatedFeatureImportance} />
        )}

        {/* Back button */}
        <div className="flex justify-center">
          <button
            onClick={() => navigate(backDestination)}
            className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition flex items-center space-x-2"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Analyze Different Dataset</span>
          </button>
        </div>

      </div>
    </div>
  );
}