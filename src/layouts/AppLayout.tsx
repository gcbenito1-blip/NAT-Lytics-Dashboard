// AppLayout.tsx
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useState, useEffect, useRef } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {
  UserRole,
  ResearcherMode,
  MenuItem,
  badgeConfig,
  sampleDatasetConfig,
  getMenuItems,
  getSampleDatasetKey,
  UPLOAD_PATH,
  icon,
} from './layoutConfig';

// ── Proficiency Guide Badge ───────────────────────────────────────────────────

function ProficiencyHelperBadge() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition cursor-pointer"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Proficiency Guide
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-white text-gray-800 text-xs rounded-xl shadow-xl border border-gray-200 z-[9999] p-4">
          <p className="font-semibold text-gray-900 mb-3 text-sm">Proficiency Level Labels</p>
          <div className="space-y-3">
            {[
              { color: 'bg-green-500', label: 'Highly Proficient', labelColor: 'text-green-700', range: '90–100', desc: 'Exceptional mastery, well above the national proficiency benchmark.' },
              { color: 'bg-blue-500', label: 'Proficient', labelColor: 'text-blue-700', range: '75–89', desc: 'Meets the DepEd national proficiency benchmark.' },
              { color: 'bg-yellow-500', label: 'Nearly Proficient', labelColor: 'text-yellow-700', range: '50–74', desc: 'Adequate understanding; some support may be beneficial.' },
              { color: 'bg-orange-500', label: 'Low Proficient', labelColor: 'text-orange-700', range: '25–49', desc: 'Partial understanding; targeted remediation recommended.' },
              { color: 'bg-red-500', label: 'Not Proficient', labelColor: 'text-red-700', range: '0–24', desc: 'Substantial support needed; early intervention recommended.' },
            ].map((item) => (
              <div key={item.label} className="flex gap-2">
                <span className={`shrink-0 w-2 h-2 rounded-full ${item.color} mt-1.5`} />
                <div>
                  <span className={`font-semibold ${item.labelColor}`}>{item.label}</span>
                  <p className="text-gray-600 mt-0.5">
                    MPS: <span className="font-medium text-gray-900">{item.range}</span> — {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="absolute -top-2 right-4 w-3 h-3 bg-white rotate-45 border-t border-l border-gray-200" />
        </div>
      )}
    </div>
  );
}

// ── Main Layout ───────────────────────────────────────────────────────────────

export function AppLayout() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const role = (user?.role ?? 'teacher') as UserRole;
  const isResearcher = role === 'researcher';
  const isAdmin = role === 'admin';

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  useEffect(() => {
    setSidebarOpen(!(isResearcher && location.pathname === '/homepage'));
  }, [isResearcher, location.pathname]);

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

  const viewMode = 'teacher';

  // ── Upload guard (teacher & researcher prediction only) ───────────────────
  const hasPredictions = !!location.state?.predictions;
  const isEvaluation = isResearcher && researcherMode === 'evaluation';

  // Determine menu items
  let menuItems: MenuItem[];
  const isAdminOrResearcherAdmin = isAdmin;
  if (isAdminOrResearcherAdmin) {
    // Check if we're viewing session results (paths that should show session navigation)
    const sessionResultPaths = ["/class-summary", "/prediction-table"];
    const isViewingSessionResult = sessionResultPaths.includes(location.pathname);
    if (isViewingSessionResult) {
      // Menu for admin/researcher admin viewing session results: show overview and session-related pages
      // Note: Class Comparison is on the default menu only (shows aggregated data from all teachers)
      menuItems = [
        { name: 'Overview', path: '/overview', icon: icon('home'), alwaysAccessible: true },
        { name: 'Class Summary', path: '/class-summary', icon: icon('analytics') },
        { name: 'Student Results', path: '/prediction-table', icon: icon('table_chart') },
      ];
    } else {
      menuItems = getMenuItems(role, researcherMode);
    }
  } else {
    menuItems = getMenuItems(role, researcherMode);
  }
  const currentMenuItem = menuItems.find((m) => m.path === location.pathname);
  const needsUploadGuard = !isEvaluation && !isAdmin;
  const isAlwaysAccessible = currentMenuItem?.alwaysAccessible ?? false;

  useEffect(() => {
    const isResearcherHome = isResearcher && location.pathname === '/homepage';
    if (needsUploadGuard && !hasPredictions && !isAlwaysAccessible && !isResearcherHome) {
      toast.warn('No dataset uploaded. Please upload a dataset first.');
      navigate(UPLOAD_PATH, { replace: true });
    }
  }, [location.pathname]);

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === 'researcherMode' && e.newValue) {
        setResearcherModeInternal(e.newValue as ResearcherMode);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────
  const sampleKey = getSampleDatasetKey(role, researcherMode);
  const sampleDataset = sampleKey ? sampleDatasetConfig[sampleKey] : null;

  const badge = isResearcher
    ? {
      label: `${researcherMode.toUpperCase()} MODE`,
      className:
        researcherMode === 'prediction'
          ? 'bg-green-100 text-green-700'
          : 'bg-blue-100 text-blue-700',
    }
    : badgeConfig[role];

  const isActive = (path: string) => location.pathname === path;
  const isDisabled = (item: typeof menuItems[0]) => {
    if (item.alwaysAccessible || isAdmin) return false;
    if (needsUploadGuard && !hasPredictions) return true;
    return false;
  };

  const handleNavClick = (item: typeof menuItems[0]) => {
    if (isDisabled(item)) {
      toast.warn('No dataset uploaded. Please upload a dataset first.');
      return;
    }
    navigate(item.path, { state: location.state });
  };

  const toggleResearcherMode = () => {
    const next: ResearcherMode = researcherMode === 'prediction' ? 'evaluation' : 'prediction';
    if (window.confirm(`Switch to ${next === 'prediction' ? 'Prediction' : 'Evaluation'} Mode?`)) {
      setResearcherMode(next);
      navigate(next === 'evaluation' ? '/evaluation/metrics' : UPLOAD_PATH);
    }
  };

  const confirmSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <ToastContainer position="top-right" autoClose={4000} />

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg flex flex-col
          transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-14 h-14 flex-shrink-0 rounded-xl overflow-hidden bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg">
              <img src="/logo.png" alt="Logo" className="w-full h-full object-cover block" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-xl font-bold">NAT-Lytics</span>
              <span className="text-xs font-normal text-gray-500">
                National Achievement Test Predictive Analytics Tool
              </span>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            const disabled = isDisabled(item);
            return (
              <button
                key={item.path}
                onClick={() => handleNavClick(item)}
                disabled={disabled}
                title={disabled ? 'Upload a dataset first' : undefined}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition
                  ${isActive(item.path)
                    ? role === 'admin' ? 'bg-blue-50 text-blue-700' : 'bg-blue-50 text-blue-700'
                    : disabled
                      ? 'text-gray-300 cursor-not-allowed opacity-50'
                      : 'text-gray-700 hover:bg-gray-100'}`}
              >
                {item.icon}
                <span className="font-medium text-sm">{item.name}</span>
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
          <div className="flex items-center space-x-3 mb-3">
            <div
              className="h-10 w-10 rounded-full flex items-center justify-center shrink-0"
              style={{
                background: role === 'admin'
                  ? 'linear-gradient(135deg, #214bd3, #01398d)'
                  : 'linear-gradient(135deg, #3da6e2, #1480be)',
              }}
            >
              <span className="text-white font-medium text-sm">
                {user?.firstName?.charAt(0).toUpperCase() ?? user?.email?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              <p className="text-xs text-gray-400 capitalize">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={() => setShowSignOutConfirm(true)}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2 text-sm font-medium bg-red-500 text-white hover:bg-red-600 rounded-lg transition"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* ── Sign Out Modal ───────────────────────────────────────────────────── */}
      {showSignOutConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowSignOutConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 mb-4">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Sign Out</h2>
              <p className="text-sm text-gray-500 mb-6">Your session data will be cleared.</p>
              <div className="flex justify-center space-x-3">
                <button onClick={() => setShowSignOutConfirm(false)} className="px-6 py-3 rounded-lg font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition">Cancel</button>
                <button onClick={confirmSignOut} className="px-6 py-3 rounded-lg font-medium bg-red-600 text-white hover:bg-red-700 transition">Sign Out</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div className={`flex-1 transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-0'}`}>
        {!(
          isResearcher &&
          location.pathname === '/homepage'
        ) && (
            <header className="bg-white shadow-sm sticky top-0 z-40">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center space-x-4">
                  <button
                    onClick={() => setSidebarOpen((o) => !o)}
                    className="p-2 rounded-lg hover:bg-gray-100 transition"
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

                  {isResearcher ? (
                    <button
                      onClick={toggleResearcherMode}
                      className={`cursor-pointer px-3 py-1 rounded-full text-xs font-medium transition hover:opacity-80 flex items-center gap-1 ${badge.className}`}
                    >
                      {badge.label}
                      <span className="material-icons-round text-xs">cached</span>
                    </button>
                  ) : (
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${badge.className}`}>
                      {badge.label}
                    </span>
                  )}
                </div>

                <ProficiencyHelperBadge />
              </div>
            </header>
          )}
        <main className="p-6">
          <Outlet context={{ sampleDataset, viewMode }} />
        </main>
      </div>
    </div>
  );
}
