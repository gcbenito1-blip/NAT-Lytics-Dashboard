import { useState, useEffect, useMemo } from 'react';
import { getSessionRawData } from '../services/sessionService';
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

// Updated demographic map - only Mother Tongue and Nutritional Status (no Gender)
const DEMOGRAPHIC_FEATURE_MAP: Record<string, { group: string; label: string }> = {
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

// Helper function to get descriptive text for nutritional status
const getNutritionalStatusDescription = (status: string): string => {
  const descriptions: Record<string, string> = {
    'Normal': 'Nutritional status shows minimal influence on predicted MPS. Maintain healthy habits, health monitoring and coordinate with school feeding programs.',
    'Obese': 'Nutritional status is associated with lower predicted MPS. Consider nutrition counseling and promoting physical activity.',
    'Overweight': 'Nutritional status shows moderate influence on predicted MPS. Encourage balanced diet and regular exercise.',
    'Severely Wasted': 'Nutritional status shows strong influence on predicted MPS. Urgent nutrition intervention and school feeding program coordination needed.',
    'Wasted': 'Nutritional status shows significant influence on predicted MPS. Prioritize nutrition support and health monitoring.',
  };
  return descriptions[status] || 'Nutritional status shows influence on predicted MPS. Consider health and nutrition support.';
};

// Helper function to get descriptive text for mother tongue
const getMotherTongueDescription = (language: string): string => {
  const descriptions: Record<string, string> = {
    'Ilocano': 'Learners with Ilocano as their mother tongue showed lower predicted MPS on average. Consider additional language support and mother-tongue based instruction.',
    'Tagalog': 'Learners with Tagalog as their mother tongue showed lower predicted MPS on average. Provide scaffolding and multilingual learning materials.',
    'Cebuano / Bisaya': 'Learners with Cebuano/Bisaya as their mother tongue show average predicted MPS. Continue multilingual support and mother-tongue based instruction.',
    'English': 'Learners with English as their mother tongue show average predicted MPS. Maintain current language support and enrichment activities.',
    'Hiligaynon': 'Learners with Hiligaynon as their mother tongue show average predicted MPS. Continue mother-tongue based instruction.',
    'Kapampangan': 'Learners with Kapampangan as their mother tongue show average predicted MPS.',
    'Maranao': 'Learners with Maranao as their mother tongue show average predicted MPS.',
    'Pangasinan': 'Learners with Pangasinan as their mother tongue show average predicted MPS.',
    'Kamayo': 'Learners with Kamayo as their mother tongue show average predicted MPS.',
  };
  return descriptions[language] || 'Consider additional language support for this learner population.';
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
  sessionId?: string;
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

interface DemographicFactor {
  group: string;
  label: string;
  impact: number;
  description: string;
}

// Academic Factor Pill List (with colors)
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

// Demographic Factor Section (no colors, only lowering factors)
const DemographicFactorsSection = ({ aggregated }: { aggregated: AggregatedFeature[] }) => {
  // Filter only demographic factors that LOWER prediction (negative impact)
  const loweringDemographics: DemographicFactor[] = aggregated
    .filter(f =>
      f.feature in DEMOGRAPHIC_FEATURE_MAP &&
      f.avgShap < -SIGNIFICANCE_THRESHOLD
    )
    .map(f => {
      const meta = DEMOGRAPHIC_FEATURE_MAP[f.feature];
      let description = '';

      if (meta.group === 'Mother Tongue') {
        description = getMotherTongueDescription(meta.label);
      } else if (meta.group === 'Nutritional Status') {
        description = getNutritionalStatusDescription(meta.label);
      }

      return {
        group: meta.group,
        label: meta.label,
        impact: f.avgShap,
        description,
      };
    });

  // Group by category
  const groupedDemographics = loweringDemographics.reduce((acc, factor) => {
    if (!acc[factor.group]) {
      acc[factor.group] = [];
    }
    acc[factor.group].push(factor);
    return acc;
  }, {} as Record<string, DemographicFactor[]>);

  const hasDemographic = Object.keys(groupedDemographics).length > 0;

  // If no demographic factors lower prediction, show positive message
  if (!hasDemographic) {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-sm">👥</div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Demographic Factors (Contextual)</p>
          </div>
        </div>

        <div className="p-4 bg-green-50 rounded-xl border border-green-200">
          <div className="flex items-start gap-3">
            <div>
              <p className="text-sm font-medium text-green-800">No Intervention Needed</p>
              <p className="text-xs text-green-700 mt-1">
                Both language background and nutritional status are linked to better predicted NAT performance.
                This means that, overall, the class tends to perform higher when students have stronger language
                foundations and better nutritional status.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show lowering demographic factors
  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-sm">👥</div>
        <div>
          <p className="text-sm font-semibold text-gray-900">Demographic Factors (Contextual)</p>
          <p className="text-xs text-gray-400">Background characteristics that may need support</p>
        </div>
      </div>

      <div className="space-y-4">
        {Object.entries(groupedDemographics).map(([category, factors]) => (
          <div key={category} className="border-b border-gray-100 last:border-0 pb-4 last:pb-0">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              {category}
            </p>
            <div className="space-y-2">
              {factors.map((factor, idx) => (
                <div key={idx} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">{factor.label}</p>
                      <p className="text-xs text-gray-600 mt-1">{factor.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-sm text-blue-700 bg-blue-50 rounded-lg px-3 py-2">
        This background is linked with lower predicted performance based on class patterns.
        <br />
        <b>Note:</b> Monitor academic progress and provide targeted support when needed.
      </p>
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

// ─── FeatureImportanceSection (Academic only) ─────────────────────────────────

const AcademicFeatureImportanceSection = ({ aggregated }: { aggregated: AggregatedFeature[] }) => {
  const significant = aggregated.filter(f => f.avgAbsShap >= SIGNIFICANCE_THRESHOLD);

  const academicItems: FactorItem[] = significant
    .filter(f => f.feature in ACADEMIC_FEATURE_MAP)
    .map(f => ({
      label: ACADEMIC_FEATURE_MAP[f.feature].label,
      icon: ACADEMIC_FEATURE_MAP[f.feature].icon,
      avgShap: f.avgShap,
      avgAbsShap: f.avgAbsShap,
    }));

  const hasAcademic = academicItems.some(
    f => f.avgShap > SIGNIFICANCE_THRESHOLD || f.avgShap < -SIGNIFICANCE_THRESHOLD
  );

  if (!hasAcademic) return null;

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Key Academic Factors Affecting Class Performance</h2>
      </div>

      <div className="flex items-center gap-4 mb-6 pb-4 border-b border-gray-100">
        <span className="flex items-center gap-2 text-sm text-gray-500">
          <span className="w-3 h-3 rounded-full bg-green-500 inline-block flex-shrink-0" />
          Enrichment Subjects (Raises predicted MPS)
        </span>
        <span className="flex items-center gap-2 text-sm text-gray-500">
          <span className="w-3 h-3 rounded-full bg-red-500 inline-block flex-shrink-0" />
          Remedial Subjects (Lowers predicted MPS)
        </span>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center text-sm">📚</div>
        <div>
          <p className="text-sm font-semibold text-gray-900">Academic factors</p>
          <p className="text-xs text-gray-400">Based on past subject grades</p>
        </div>
      </div>
      <FactorPillList items={academicItems} />
      <p className="mt-4 text-sm text-blue-700 bg-blue-50 rounded-lg px-3 py-2">
        Subjects highlighted in green show strengths that can be further developed, while subjects in red indicate areas where students may need additional support and review.
      </p>
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

  // State for fetched rawData
  const [fetchedRawData, setFetchedRawData] = useState<Record<string, unknown>[]>([]);
  const [rawDataLoading, setRawDataLoading] = useState(false);

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
  const sessionId = state?.sessionId;

  // Use rawData from state if available, otherwise use fetched data
  const rawData = state?.rawData?.length ? state.rawData : fetchedRawData;

  // Fetch rawData from Firebase if not in state but sessionId exists
  useEffect(() => {
    if (rawData.length > 0 || !sessionId) return;

    setRawDataLoading(true);
    getSessionRawData(sessionId)
      .then((rows) => {
        setFetchedRawData(rows);
      })
      .catch((err) => {
        console.error('Failed to fetch raw data:', err);
      })
      .finally(() => {
        setRawDataLoading(false);
      });
  }, [sessionId, rawData.length]);

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
                Class Prediction Summary
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
                <p className="text-xs font-medium text-gray-500">NAT Mean Percentage Score (MPS)</p>
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
                <span className='material-icons-round text-green-700'>check</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500">At Risk (Below Proficient)</p>
                <p className="text-2xl font-bold text-red-600 mt-1">{failedCount}</p>
                <p className="text-xs text-gray-500">
                  {totalPredictions > 0 ? ((failedCount / totalPredictions) * 100).toFixed(0) : 0}%
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center">
                <span className='material-icons-round text-red-700'>priority_high</span>
              </div>
            </div>
          </div>
        </div>

        {/* Academic Feature Importance */}
        {predictions[0]?.explanation?.features && (
          <AcademicFeatureImportanceSection aggregated={aggregatedFeatureImportance} />
        )}

        {/* Demographic Factors Section */}
        {predictions[0]?.explanation?.features && (
          <DemographicFactorsSection aggregated={aggregatedFeatureImportance} />
        )}

        {/* Loading State for Demographics */}
        {rawDataLoading && (
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-3"></div>
              <p className="text-gray-500">Loading demographic data...</p>
            </div>
          </div>
        )}

        {/* Demographics — 2 column layout */}
        {!rawDataLoading && rawData.length > 0 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <NutritionalPieChart rawData={rawData} />
              <MotherTongueBarChart rawData={rawData} />
            </div>

            {/* Subject Average Distributions */}
            <SubjectAverageDistributions rawData={rawData} />
          </>
        )}

        {/* No rawData message */}
        {!rawDataLoading && rawData.length === 0 && !sessionId && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-6 mb-8 text-center">
            <p className="text-yellow-700">Demographic charts are not available for this session.</p>
          </div>
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