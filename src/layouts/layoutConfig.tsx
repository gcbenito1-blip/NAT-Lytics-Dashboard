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
}

// ── Icons (Material Icons Round) ──────────────────────────────────────────────
const icon = (name: string) => <span className="material-icons-round text-base">{name}</span>;

// ── Menu item sets ────────────────────────────────────────────────────────────
export const teacherMenuItems: MenuItem[] = [
  { name: 'Upload',           path: '/dashboard',           icon: icon('upload_file') },
  { name: 'Class Summary',    path: '/class-summary',       icon: icon('analytics') },
  { name: 'Prediction Table', path: '/prediction-table',    icon: icon('table_chart') },
  { name: 'Model Reliability',path: '/model-reliability',   icon: icon('monitor_heart') },
];

export const adminMenuItems: MenuItem[] = [
  { name: 'Upload',             path: '/dashboard',           icon: icon('upload_file') },
  { name: 'School Summary',     path: '/school-summary',      icon: icon('school') },
  { name: 'Section Comparison', path: '/section-comparison',  icon: icon('compare') },
  { name: 'Prediction Table',   path: '/prediction-table',    icon: icon('table_chart') },
  { name: 'Model Reliability',  path: '/model-reliability',   icon: icon('monitor_heart') },
];

export const evaluationMenuItems: MenuItem[] = [
  { name: 'Metrics',            path: '/evaluation/metrics',            icon: icon('show_chart') },
  { name: 'Charts',             path: '/evaluation/charts',             icon: icon('bar_chart') },
  { name: 'Feature Importance', path: '/evaluation/feature-importance', icon: icon('query_stats') },
  { name: 'School Comparison',  path: '/evaluation/school-comparison',  icon: icon('balance') },
  { name: 'Student Table',      path: '/evaluation/student-table',      icon: icon('table_chart') },
];

// ── Badge configs ─────────────────────────────────────────────────────────────
export const badgeConfig = {
  teacher:    { label: 'TEACHER MODE',    className: 'bg-green-100  text-green-700'  },
  admin:      { label: 'ADMIN MODE',      className: 'bg-purple-100 text-purple-700' },
  researcher: { label: 'RESEARCHER MODE', className: 'bg-blue-100   text-blue-700'   },
};

// ── Sample dataset URLs ───────────────────────────────────────────────────────
export const sampleDatasetConfig: Record<SampleDataset & string, { href: string; filename: string; label: string }> = {
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

// ── Derive menu items for a given role + viewMode ─────────────────────────────
export function getMenuItems(
  role: UserRole,
  researcherMode: ResearcherMode,
  viewMode: ViewMode,
): MenuItem[] {
  if (role === 'researcher') {
    if (researcherMode === 'evaluation') return evaluationMenuItems;
    return viewMode === 'admin' ? adminMenuItems : teacherMenuItems;
  }
  return role === 'admin' ? adminMenuItems : teacherMenuItems;
}

// ── Derive sample dataset key ─────────────────────────────────────────────────
export function getSampleDatasetKey(
  role: UserRole,
  researcherMode: ResearcherMode,
  viewMode: ViewMode,
): SampleDataset {
  if (role === 'researcher' && researcherMode === 'evaluation') return null;
  if (role === 'admin') return 'admin';
  if (role === 'researcher') return viewMode === 'admin' ? 'admin' : 'teacher';
  return 'teacher';
}

// ── Upload guard: which paths are always accessible (no predictions needed) ───
export const UPLOAD_PATH = '/dashboard';
