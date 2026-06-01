import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './layouts/AppLayout';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { HomeRouter } from './pages/HomeRouter';
import { Dashboard } from './pages/Dashboard';
import { ClassSummary } from './pages/ClassSummary';
import { SectionComparison } from './pages/SectionComparison';
import { ClassComparison } from './pages/ClassComparison';
import { AdminOverview } from './pages/AdminOverview';
import { OverviewRouter } from './layouts/OverviewRouter';
import { Results } from './pages/Results';
import { ModelReliability } from './pages/ModelReliability';
import { ModelEvaluation } from './pages/Model_Evaluation';
import { Charts } from './pages/Charts';
import { FeatureImportance } from './pages/FeatureImportance';
import { SchoolComparison } from './pages/SchoolComparison';
import { StudentTable } from './pages/StudentTable';
import { ManageTeachers } from './pages/ManageTeachers';
import { Settings } from './pages/Settings';
import { BackupRecovery } from './pages/BackupRecovery';


export const router = createBrowserRouter([
  // public
  { path: '/login', element: <Login /> },
  { path: '/signup', element: <Signup /> },

  // app shell — protected, all roles
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      // home — all roles, protected
      {
        path: 'homepage',
        element: (
          <ProtectedRoute>
            <HomeRouter />
          </ProtectedRoute>
        ),
      },
      // prediction
      {
        path: 'overview',
        element: (
          <OverviewRouter />
        ),
      },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'class-summary', element: <ClassSummary /> },
      { path: 'section-comparison', element: <SectionComparison /> },
      { path: 'class-comparison', element: <ClassComparison /> },
      { path: 'prediction-table', element: <Results /> },
      { path: 'model-reliability', element: <ModelReliability /> },
      { path: 'manage-teachers', element: <ManageTeachers /> },
      { path: 'results-list', element: <AdminOverview /> },
      { path: 'settings', element: <Settings /> },
      { path: 'backup-recovery', element: <ProtectedRoute allowedRoles={['teacher']}><BackupRecovery /></ProtectedRoute> },
      // evaluation
      { path: 'evaluation/metrics', element: <ModelEvaluation /> },
      { path: 'evaluation/charts', element: <Charts /> },
      { path: 'evaluation/feature-importance', element: <FeatureImportance /> },
      { path: 'evaluation/school-comparison', element: <SchoolComparison /> },
      { path: 'evaluation/student-table', element: <StudentTable /> },
    ],
  },

  // redirects
  { path: '/', element: <Navigate to="/homepage" replace /> },
  { path: '*', element: <Navigate to="/login" replace /> },
]);