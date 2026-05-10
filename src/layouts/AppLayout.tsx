// AppLayout.tsx
import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useState, useEffect, useRef } from 'react';
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

function ProficiencyHelperBadge() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition cursor-pointer"
        aria-label="Proficiency level guide"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Proficiency Guide
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-white text-gray-800 text-xs rounded-xl shadow-xl border border-gray-200 z-[9999] p-4">
          <p className="font-semibold text-gray-900 mb-3 text-sm">
            Proficiency Level Labels
          </p>

          <div className="space-y-3">
            <div className="flex gap-2">
              <span className="shrink-0 w-2 h-2 rounded-full bg-green-500 mt-1.5"></span>
              <div>
                <span className="font-semibold text-green-700">Highly Proficient</span>
                <p className="text-gray-600 mt-0.5">
                  Predicted MPS: <span className="font-medium text-gray-900">90–100.</span>{' '}
                  The learner is expected to demonstrate exceptional mastery of NAT content and performs well above the national proficiency benchmark.
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <span className="shrink-0 w-2 h-2 rounded-full bg-blue-500 mt-1.5"></span>
              <div>
                <span className="font-semibold text-blue-700">Proficient</span>
                <p className="text-gray-600 mt-0.5">
                  Predicted MPS: <span className="font-medium text-gray-900">75–89.</span>{' '}
                  The learner is expected to meet the DepEd national proficiency benchmark, demonstrating strong and independent understanding of core subject competencies.
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <span className="shrink-0 w-2 h-2 rounded-full bg-yellow-500 mt-1.5"></span>
              <div>
                <span className="font-semibold text-yellow-700">Nearly Proficient</span>
                <p className="text-gray-600 mt-0.5">
                  Predicted MPS: <span className="font-medium text-gray-900">50–74.</span>{' '}
                  The learner demonstrates adequate understanding but has not yet reached the proficiency benchmark. Some additional academic support may be beneficial.
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <span className="shrink-0 w-2 h-2 rounded-full bg-orange-500 mt-1.5"></span>
              <div>
                <span className="font-semibold text-orange-700">Low Proficient</span>
                <p className="text-gray-600 mt-0.5">
                  Predicted MPS: <span className="font-medium text-gray-900">25–49.</span>{' '}
                  The learner demonstrates only partial understanding of key competencies and may require targeted remediation before the NAT.
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <span className="shrink-0 w-2 h-2 rounded-full bg-red-500 mt-1.5"></span>
              <div>
                <span className="font-semibold text-red-700">Not Proficient</span>
                <p className="text-gray-600 mt-0.5">
                  Predicted MPS: <span className="font-medium text-gray-900">0–24.</span>{' '}
                  The learner is expected to need substantial academic support. Early and sustained intervention is recommended.
                </p>
              </div>
            </div>
          </div>

          {/* Arrow pointer */}
          <div className="absolute -top-2 right-4 w-3 h-3 bg-white rotate-45 border-t border-l border-gray-200" />
        </div>
      )}
    </div>
  );
}

export function AppLayout() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const role = (user?.role ?? 'teacher') as UserRole;
  const isResearcher = role === 'researcher';

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [researcherMode, setResearcherModeInternal] = useState<ResearcherMode>(() => {
    if (isResearcher) {
      const saved = localStorage.getItem('researcherMode');
      return (saved as ResearcherMode) || 'prediction';
    }
    return 'prediction';
  });

  const setResearcherMode = (mode: ResearcherMode) => {
    setResearcherModeInternal(mode);
    localStorage.setItem('researcherMode', mode);
  };

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

  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  const handleSignOut = async () => {
    setShowSignOutConfirm(true);
  };

  const confirmSignOut = async () => {
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
            <div className="w-14 h-14 flex-shrink-0 rounded-xl overflow-hidden bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg">
              <img
                src="/logo.png"
                alt="Logo"
                className="w-full h-full object-cover block"
              />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-xl font-bold">NAT-Lytics</span>
              <span className="text-xs font-normal text-gray-500">
                National Achievement Test Predictive Analytics Tool
              </span>
            </div>
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
            <div
              className="h-10 w-10 rounded-full bg-gradient-to-br flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, #3da6e2 0%, #1480be 100%)' }}
            >
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

      {/* Sign Out Confirmation Modal */}
      {showSignOutConfirm && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShowSignOutConfirm(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 mb-4">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Sign Out</h2>
              <p className="text-sm text-gray-500 mb-6">
                Are you sure you want to sign out? Your session data will be cleared.
              </p>
              <div className="flex justify-center space-x-3">
                <button
                  onClick={() => setShowSignOutConfirm(false)}
                  className="px-6 py-3 rounded-lg font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmSignOut}
                  className="px-6 py-3 rounded-lg font-medium bg-red-600 text-white hover:bg-red-700 transition"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <div className={`flex-1 transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-0'}`}>
        {/* Header */}
        <header className="bg-white shadow-sm sticky top-0 z-40">
          <div className="flex items-center justify-between px-4 py-3">
            {/* Left: hamburger + role badge */}
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

              {/* Role/mode badge */}
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

            {/* Right: Proficiency Guide badge */}
            <ProficiencyHelperBadge />
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">
          <Outlet context={{ sampleDataset, viewMode }} />
        </main>
      </div>
    </div>
  );
}