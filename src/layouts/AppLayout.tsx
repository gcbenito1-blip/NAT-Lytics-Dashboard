// AppLayout.tsx
import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useState, useEffect } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {
  UserRole,
  ResearcherMode,
  ViewMode,
  badgeConfig,
  sampleDatasetConfig,
  getMenuItems,
  getSampleDatasetKey,
  UPLOAD_PATH,
} from './layoutConfig';

export function AppLayout() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const role = (user?.role ?? 'teacher') as UserRole;
  const isResearcher = role === 'researcher';

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [researcherMode, setResearcherMode] = useState<ResearcherMode>('prediction');
  const [viewMode, setViewMode] = useState<ViewMode>('teacher');

  // Upload guard — only applies when predictions are expected (non-evaluation modes)
  const hasPredictions = !!location.state?.predictions;
  const isEvaluation = isResearcher && researcherMode === 'evaluation';
  const needsUploadGuard = !isEvaluation;
  const isUploadPage = location.pathname === UPLOAD_PATH;

  useEffect(() => {
    if (needsUploadGuard && !hasPredictions && !isUploadPage) {
      toast.warn('No dataset uploaded. Please upload a dataset first to access every options');
      navigate(UPLOAD_PATH, { replace: true });
    }
  }, [location.pathname]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const handleNavClick = (path: string) => {
    if (needsUploadGuard && !hasPredictions && path !== UPLOAD_PATH) {
      toast.warn('No dataset uploaded. Please upload a dataset first to access every options');
      return;
    }
    navigate(path, { state: location.state });
  };

  const toggleResearcherMode = () => {
    const next: ResearcherMode = researcherMode === 'prediction' ? 'evaluation' : 'prediction';
    const label = next === 'prediction' ? 'Prediction' : 'Evaluation';
    if (window.confirm(`Switch to ${label} Mode?`)) {
      setResearcherMode(next);
      navigate(next === 'evaluation' ? '/evaluation/metrics' : UPLOAD_PATH);
    }
  };

  // ── Derived values ───────────────────────────────────────────────────────────
  const menuItems = getMenuItems(role, researcherMode, viewMode);
  const sampleKey = getSampleDatasetKey(role, researcherMode, viewMode);
  const sampleDataset = sampleKey ? sampleDatasetConfig[sampleKey] : null;

  const badge = isResearcher
    ? {
      label: `RESEARCHER — ${researcherMode.toUpperCase()} MODE`,
      className: 'bg-blue-100 text-blue-700',
    }
    : badgeConfig[role];

  const isActive = (path: string) => location.pathname === path;
  const isDisabled = (path: string) =>
    needsUploadGuard && path !== UPLOAD_PATH && !hasPredictions;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex">
      <ToastContainer position="top-right" autoClose={4000} />

      {/* ── Sidebar ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg flex flex-col
          transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <Link to="/home" className="flex items-center space-x-3 hover:opacity-90 transition">
            <div className="rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg mb-4 overflow-hidden">
              <img src="/logo.png" alt="Logo" className="h-full w-full object-cover" />
            </div>
            <span className="text-xl font-bold">
              NAT-Lytics
              <br />
              <p className="text-xs font-normal text-gray-500">
                National Achievement Test Predictive Analytics Tool
              </p>
            </span>
          </Link>
        </div>

        {/* Researcher prediction: teacher/admin view toggle */}
        {isResearcher && researcherMode === 'prediction' && (
          <div className="px-4 py-2 border-b border-gray-200">
            <div className="flex bg-gray-100 rounded-lg p-1">
              {(['teacher', 'admin'] as ViewMode[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setViewMode(v)}
                  className={`flex-1 px-3 py-1 text-xs font-medium rounded-md transition capitalize
                    ${viewMode === v
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'}`}
                >
                  {v} View
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {menuItems.map((item) => {
            const disabled = isDisabled(item.path);
            return (
              <button
                key={item.path}
                onClick={() => handleNavClick(item.path)}
                disabled={disabled}
                title={disabled ? 'Upload a dataset first' : undefined}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition
                  ${isActive(item.path)
                    ? 'bg-blue-50 text-blue-700'
                    : disabled
                      ? 'text-gray-300 cursor-not-allowed opacity-50'
                      : 'text-gray-700 hover:bg-gray-100'}`}
              >
                {item.icon}
                <span className="font-medium">{item.name}</span>
                {disabled && (
                  <span className="ml-auto">
                    <span className="material-icons-round text-sm">lock</span>
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User info + logout */}
        <div className="p-4 border-t border-gray-200 shrink-0">
          <div className="flex items-center space-x-3 mb-4">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0">
              <span className="text-white font-medium">
                {user?.firstName?.charAt(0).toUpperCase() ??
                  user?.email?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className={`flex-1 transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-0'}`}>
        {/* Header */}
        <header className="bg-white shadow-sm sticky top-0 z-40">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center space-x-4">
              {/* Hamburger */}
              <button
                onClick={() => setSidebarOpen((o) => !o)}
                className="p-2 rounded-lg hover:bg-gray-100 transition"
                aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
              >
                {sidebarOpen ? (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>

              {/* Role/mode badge — clickable for researcher to toggle mode */}
              {isResearcher ? (
                <button
                  onClick={toggleResearcherMode}
                  className={`cursor-pointer px-3 py-1 rounded-full text-xs font-medium transition hover:opacity-80 flex items-center justify-center gap-1 ${badge.className}`}
                >
                  {badge.label}
                  <span className="material-icons-round text-xs">cached</span>
                </button>
              ) : (
                <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center justify-center ${badge.className}`}>
                  {badge.label}
                </span>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">
          {/*
            Pass sampleDataset down via Outlet context so Dashboard
            can read it without localStorage hacks.
          */}
          <Outlet context={{ sampleDataset, viewMode }} />
        </main>
      </div>
    </div>
  );
}
