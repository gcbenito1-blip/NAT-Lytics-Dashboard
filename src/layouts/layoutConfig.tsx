// layoutConfig.ts
import { ReactNode } from 'react';

export type UserRole = 'teacher' | 'admin' | 'researcher';
export type ResearcherMode = 'prediction' | 'evaluation';
export type ViewMode = 'teacher' | 'admin';
export type SampleDataset = 'teacher' | 'admin' | null;

export interface MenuItem {
  name: string;
  path: string;
  icon: ReactNode;
  alwaysAccessible?: boolean; // skips the upload guard
}

// ── Icons (Material Icons Round) ──────────────────────────────────────────────
const icon = (name: string) => <span className="material-icons-round text-base">{name}</span>;

// ── Menu item sets ────────────────────────────────────────────────────────────

export const teacherMenuItems: MenuItem[] = [
  { name: 'Overview', path: '/overview', icon: icon('home'), alwaysAccessible: true },
  { name: 'Upload Dataset', path: '/dashboard', icon: icon('upload_file'), alwaysAccessible: true },
  { name: 'Class Summary', path: '/class-summary', icon: icon('analytics') },
  { name: 'Prediction Table', path: '/prediction-table', icon: icon('table_chart') },
  { name: 'Model Reliability', path: '/model-reliability', icon: icon('monitor_heart'), alwaysAccessible: true },
];

export const adminMenuItems: MenuItem[] = [
  { name: 'Overview', path: '/overview', icon: icon('home'), alwaysAccessible: true },
  { name: 'Manage Teachers', path: '/manage-teachers', icon: icon('manage_accounts'), alwaysAccessible: true },
  // Admin can view session results navigated from Overview — no upload
  { name: 'Model Reliability', path: '/model-reliability', icon: icon('monitor_heart'), alwaysAccessible: true },
];

export const evaluationMenuItems: MenuItem[] = [
  { name: 'Metrics', path: '/evaluation/metrics', icon: icon('show_chart'), alwaysAccessible: true },
  { name: 'Charts', path: '/evaluation/charts', icon: icon('bar_chart'), alwaysAccessible: true },
  { name: 'Feature Importance', path: '/evaluation/feature-importance', icon: icon('query_stats'), alwaysAccessible: true },
  { name: 'School Comparison', path: '/evaluation/school-comparison', icon: icon('balance'), alwaysAccessible: true },
  { name: 'Student Table', path: '/evaluation/student-table', icon: icon('table_chart'), alwaysAccessible: true },
];

// Researcher using prediction mode (teacher view)
export const researcherTeacherMenuItems: MenuItem[] = [
  { name: 'Upload Dataset', path: '/dashboard', icon: icon('upload_file'), alwaysAccessible: true },
  { name: 'Class Summary', path: '/class-summary', icon: icon('analytics') },
  { name: 'Prediction Table', path: '/prediction-table', icon: icon('table_chart') },
  { name: 'Model Reliability', path: '/model-reliability', icon: icon('monitor_heart'), alwaysAccessible: true },
];

// Researcher using prediction mode (admin view)
export const researcherAdminMenuItems: MenuItem[] = [
  { name: 'Upload Dataset', path: '/dashboard', icon: icon('upload_file'), alwaysAccessible: true },
  { name: 'School Summary', path: '/school-summary', icon: icon('school') },
  { name: 'Section Comparison', path: '/section-comparison', icon: icon('compare') },
  { name: 'Prediction Table', path: '/prediction-table', icon: icon('table_chart') },
  { name: 'Model Reliability', path: '/model-reliability', icon: icon('monitor_heart'), alwaysAccessible: true },
];

// ── Badge configs ─────────────────────────────────────────────────────────────
export const badgeConfig = {
  teacher: { label: 'TEACHER MODE', className: 'bg-green-100 text-green-700' },
  admin: { label: 'ADMIN MODE', className: 'bg-purple-100 text-purple-700' },
  researcher: { label: 'RESEARCHER MODE', className: 'bg-blue-100 text-blue-700' },
};

// ── Sample dataset config ─────────────────────────────────────────────────────
export const sampleDatasetConfig: Record<string, { href: string; filename: string; label: string }> = {
  teacher: {
    href: '/sample_dataset.csv',
    filename: 'sample_dataset.csv',
    label: 'Download Sample Dataset',
  },
  admin: {
    href: '/admin_sample_dataset.csv',
    filename: 'admin_sample_dataset.csv',
    label: 'Download Sample Dataset (with Section)',
  },
};

// ── Derive menu items ─────────────────────────────────────────────────────────
export function getMenuItems(
  role: UserRole,
  researcherMode: ResearcherMode,
  viewMode: ViewMode,
): MenuItem[] {
  if (role === 'researcher') {
    if (researcherMode === 'evaluation') return evaluationMenuItems;
    return viewMode === 'admin' ? researcherAdminMenuItems : researcherTeacherMenuItems;
  }
  return role === 'admin' ? adminMenuItems : teacherMenuItems;
}

// ── Derive sample dataset key ─────────────────────────────────────────────────
export function getSampleDatasetKey(
  role: UserRole,
  researcherMode: ResearcherMode,
  viewMode: ViewMode,
): SampleDataset {
  if (role === 'admin') return null; // admin cannot upload
  if (role === 'researcher' && researcherMode === 'evaluation') return null;
  if (role === 'researcher') return viewMode === 'admin' ? 'admin' : 'teacher';
  return 'teacher';
}

// ── Paths that are always accessible without uploaded data ───────────────────
export const UPLOAD_PATH = '/dashboard';
export const OVERVIEW_PATH = '/overview';