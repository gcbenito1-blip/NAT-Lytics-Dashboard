const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// ---------------------------------------------------------------------------
// CORE FETCH HELPERS
// ---------------------------------------------------------------------------
async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error || `Request failed: ${response.status} ${response.statusText}`);
  }
  return json as T;
}

const apiGet = <T>(path: string) => apiFetch<T>(path, { method: 'GET' });
const apiPost = <T>(path: string, body: unknown) => apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) });

async function apiUpload<T>(path: string, file: File): Promise<T> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(`${API_BASE_URL}${path}`, { method: 'POST', body: formData });
  const json = await response.json();
  if (!response.ok) throw new Error(json?.error || 'Upload failed');
  return json as T;
}


// ===========================================================================
// TYPES
// ===========================================================================

// ── Proficiency ──────────────────────────────────────────────────────────────
export interface ProficiencyBand {
  code: number;
  label: string;
  range: string;
  color: string;
}

export interface ProficiencyMeta extends ProficiencyBand {
  probability: number;
}

// ── SHAP ─────────────────────────────────────────────────────────────────────
export interface ShapFeature {
  feature: string;
  shap_value: number;
  direction: 'positive' | 'negative';
}

export interface ShapExplanation {
  base_value: number;
  top_drivers: ShapFeature[];
  features: ShapFeature[];
}

// ── Prediction (every response now includes explanation) ─────────────────────
export interface PredictionResult {
  School: string | null;
  learnerID: string | null;
  prediction: number;
  proficiency: ProficiencyBand;
  top_probable_band: ProficiencyMeta | null;
  probability_breakdown: ProficiencyMeta[] | null;
  explanation: ShapExplanation;          // always present — no more optional
}

export interface BatchPredictionResponse {
  results: PredictionResult[];
  total: number;
  distribution: (ProficiencyBand & { count: number; percentage: number })[];
}

// ── Feature Importance (training-level, static) ───────────────────────────────
export interface FeatureImportance {
  features: string[];
  importances: number[];
  sorted_indices: number[];
}

// ── Metrics ───────────────────────────────────────────────────────────────────
export interface ModelMetrics {
  model?: string;
  MAE?: number;
  RMSE?: number;
  R2?: number;
  Label_Acc?: number;
  [key: string]: unknown;
}

export interface AllModelsMetrics {
  models: ModelMetrics[];
}

// ── Health ────────────────────────────────────────────────────────────────────
export interface HealthStatus {
  status: 'ok' | 'degraded';
  model: string;
  model_loaded: boolean;
  shap_ready: boolean;
}

// ── Upload / Analyze ──────────────────────────────────────────────────────────
export interface UploadResponse {
  columns: string[];
  row_count: number;
  preview: Record<string, unknown>[];
}

export interface ColumnInfo {
  name: string;
  dtype: string;
  non_null_count: number;
  null_count: number;
  null_percentage: number;
  statistics?: {
    mean: number | null;
    std: number | null;
    min: number | null;
    max: number | null;
    median: number | null;
    q1: number | null;
    q3: number | null;
  };
  value_counts?: Record<string, number>;
  unique_count?: number;
  duplicate_count?: number;
  is_id_column?: boolean;
}

export interface ProficiencyDistributionEntry extends ProficiencyBand {
  count: number;
  percentage: number;
}

export interface AnalysisResult {
  row_count: number;
  column_count: number;
  columns: ColumnInfo[];
  preview: Record<string, unknown>[];
  correlation_matrix: Record<string, Record<string, number>>;
  missing_values: {
    total_missing: number;
    total_cells: number;
    missing_percentage: number;
    columns_with_missing: { column: string; missing_count: number }[];
  };
  proficiency_distribution: ProficiencyDistributionEntry[] | null;
}


// ===========================================================================
// API CALLS
// ===========================================================================

// ── Info ──────────────────────────────────────────────────────────────────────
export const getHealth = () => apiGet<HealthStatus>('/health');
export const getMetrics = () => apiGet<ModelMetrics>('/metrics');
export const getAllModelMetrics = () => apiGet<AllModelsMetrics>('/all-metrics');
export const getFeatureImportance = () => apiGet<FeatureImportance>('/feature-importance');
export const getProficiencyLabels = () => apiGet<{ bands: ProficiencyBand[] }>('/proficiency-labels');

// ── Predict + Explain (single route) ─────────────────────────────────────────
export const explainSingle = (data: Record<string, unknown>) =>
  apiPost<PredictionResult>('/explain', data);

export const explainBatch = (data: Record<string, unknown>[]) =>
  apiPost<BatchPredictionResponse>('/explain-batch', data);

// ── Upload / Analyze ──────────────────────────────────────────────────────────
export const uploadFile = (file: File) =>
  apiUpload<UploadResponse>('/api/upload', file);

export const analyzeData = (data: Record<string, unknown>[]) =>
  apiPost<AnalysisResult>('/api/analyze', { data });

// ===========================================================================
// RESEARCHER EVALUATION - SCHOOL & STUDENT DATA
// ===========================================================================

export interface SchoolMetrics {
  School: string;
  Student_Count: number;
  Avg_Actual_MPS: number;
  Avg_Predicted_MPS: number;
  Avg_Bias: number;
  MAE: number;
  Actual_Not_Proficient: number;
  Actual_Low_Proficient: number;
  Actual_Nearly_Proficient: number;
  Actual_Proficient: number;
  Actual_Highly_Proficient: number;
  [key: string]: unknown;
}

export interface SchoolMAE {
  School: string;
  MAE: number;
}

export interface SchoolProficiency {
  School: string;
  Actual: Record<string, number>;
  Predicted: Record<string, number>;
}

export interface TestResult {
  learnerID: string;
  School: string;
  Actual_MPS: number;
  Predicted_MPS: number;
  Difference: number;
  Proficiency: string;
  Error_Magnitude: number;
}

export interface TestResultsResponse {
  results: TestResult[];
  count: number;
  columns: string[];
}

export interface ModelPredictResponse {
  linear?: { y_true: number[]; y_pred: number[] };
  lasso?: { y_true: number[]; y_pred: number[] };
  decisionTrees?: { y_true: number[]; y_pred: number[] };
  randomForest?: { y_true: number[]; y_pred: number[] };
  gradientBoost?: { y_true: number[]; y_pred: number[] };
}

// ── School & Test Data ─────────────────────────────────────────────────────────
export const getSchoolMetrics = () => apiGet<{ schools: SchoolMetrics[] }>('/api/school-metrics');
export const getSchoolMAE = () => apiGet<{ schools: SchoolMAE[] }>('/api/school-mae');
export const getSchoolProficiency = () => apiGet<{ schools: SchoolProficiency[] }>('/api/school-proficiency');
export const getTestResults = () => apiGet<TestResultsResponse>('/api/test-results');
export const getModelPredict = () => apiGet<ModelPredictResponse>('/model-predict');