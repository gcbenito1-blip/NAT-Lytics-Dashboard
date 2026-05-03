import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { Home } from './pages/Home';
import { Dashboard } from './pages/Dashboard';
import { Results } from './pages/Results';
import { ModelEvaluation } from './pages/Model_Evaluation';
import { TeacherPredictionLayout } from './components/layouts/TeacherPredictionLayout';
import { AdminPredictionLayout } from './components/layouts/AdminPredictionLayout';
import { ResearcherEvaluationLayout } from './components/layouts/ResearcherEvaluationLayout';
import { ResearcherPredictionLayout } from './components/layouts/ResearcherPredictionLayout';
import { ClassSummary } from './pages/ClassSummary';
import { SchoolSummary } from './pages/SchoolSummary';
import { SectionComparison } from './pages/SectionComparison';
import { ModelReliability } from './pages/ModelReliability';
import { Charts } from './pages/Charts';
import { FeatureImportance } from './pages/FeatureImportance';
import { SchoolComparison } from './pages/SchoolComparison';
import { StudentTable } from './pages/StudentTable';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* Home - landing page with mode selection for researchers, redirect for teacher/admin */}
          <Route
            path="/home"
            element={
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            }
          />

          {/* Teacher prediction mode routes */}
          <Route
            path="/teacher"
            element={
              <ProtectedRoute allowedRoles={['teacher']}>
                <TeacherPredictionLayout />
              </ProtectedRoute>
            }
          >
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="class-summary" element={<ClassSummary />} />
            <Route path="prediction-table" element={<Results />} />
            <Route path="model-reliability" element={<ModelReliability />} />
          </Route>

          {/* Admin prediction mode routes */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminPredictionLayout />
              </ProtectedRoute>
            }
          >
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="school-summary" element={<SchoolSummary />} />
            <Route path="section-comparison" element={<SectionComparison />} />
            <Route path="prediction-table" element={<Results />} />
            <Route path="model-reliability" element={<ModelReliability />} />
          </Route>

          {/* Researcher evaluation mode routes */}
          <Route
            path="/researcher/evaluation"
            element={
              <ProtectedRoute allowedRoles={['researcher']}>
                <ResearcherEvaluationLayout />
              </ProtectedRoute>
            }
          >
            <Route path="model-evaluation" element={<ModelEvaluation />} />
            <Route path="charts" element={<Charts />} />
            <Route path="feature-importance" element={<FeatureImportance />} />
            <Route path="school-comparison" element={<SchoolComparison />} />
            <Route path="student-table" element={<StudentTable />} />
          </Route>

          {/* Researcher prediction mode routes */}
          <Route
            path="/researcher/prediction"
            element={
              <ProtectedRoute allowedRoles={['researcher']}>
                <ResearcherPredictionLayout />
              </ProtectedRoute>
            }
          >
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="class-summary" element={<ClassSummary />} />
            <Route path="school-summary" element={<SchoolSummary />} />
            <Route path="section-comparison" element={<SectionComparison />} />
            <Route path="prediction-table" element={<Results />} />
            <Route path="model-reliability" element={<ModelReliability />} />
          </Route>

          {/* Redirect root to /home */}
          <Route path="/" element={<Navigate to="/home" replace />} />

          {/* Catch all - redirect to login */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
