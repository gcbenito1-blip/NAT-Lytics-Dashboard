import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './layouts/AppLayout';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { Home } from './pages/Home';
import { Dashboard } from './pages/Dashboard';
import { ClassSummary } from './pages/ClassSummary';
import { SchoolSummary } from './pages/SchoolSummary';
import { SectionComparison } from './pages/SectionComparison';
import { Results } from './pages/Results';
import { ModelReliability } from './pages/ModelReliability';
import { ModelEvaluation } from './pages/Model_Evaluation';
import { Charts } from './pages/Charts';
import { FeatureImportance } from './pages/FeatureImportance';
import { SchoolComparison } from './pages/SchoolComparison';
import { StudentTable } from './pages/StudentTable';


export const router = createBrowserRouter([
  // public
  { path: '/login', element: <Login /> },
  { path: '/signup', element: <Signup /> },

  // home — all roles, protected
  {
    path: '/home',
    element: (
      <ProtectedRoute>
        <Home />
      </ProtectedRoute>
    ),
  },

  // app shell — protected, all roles
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      // prediction
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'class-summary', element: <ClassSummary /> },
      { path: 'school-summary', element: <SchoolSummary /> },
      { path: 'section-comparison', element: <SectionComparison /> },
      { path: 'prediction-table', element: <Results /> },
      { path: 'model-reliability', element: <ModelReliability /> },
      // evaluation
      { path: 'evaluation/metrics', element: <ModelEvaluation /> },
      { path: 'evaluation/charts', element: <Charts /> },
      { path: 'evaluation/feature-importance', element: <FeatureImportance /> },
      { path: 'evaluation/school-comparison', element: <SchoolComparison /> },
      { path: 'evaluation/student-table', element: <StudentTable /> },
    ],
  },

  // redirects
  { path: '/', element: <Navigate to="/home" replace /> },
  { path: '*', element: <Navigate to="/login" replace /> },
]);