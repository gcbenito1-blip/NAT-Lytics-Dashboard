import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useState, useEffect } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export function ResearcherPredictionLayout() {
    const { signOut, user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [viewMode, setViewMode] = useState<'teacher' | 'admin'>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('researcherViewMode');
            return (saved as 'teacher' | 'admin') || 'teacher';
        }
        return 'teacher';
    });
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [researcherMode, setResearcherMode] = useState<'prediction' | 'evaluation'>('prediction');

    const hasPredictions = !!location.state?.predictions;

    const handleSignOut = async () => {
        await signOut();
        navigate('/login');
    };

    useEffect(() => {
        localStorage.setItem('researcherViewMode', viewMode);
    }, [viewMode]);

    useEffect(() => {
        const isUpload = location.pathname === '/researcher/prediction/dashboard';
        if (!hasPredictions && !isUpload) {
            toast.warn('No dataset uploaded. Please upload a dataset first.');
            navigate('/researcher/prediction/dashboard', { replace: true });
        }
    }, [location.pathname]);

    const toggleResearcherMode = () => {
        const newMode = researcherMode === 'prediction' ? 'evaluation' : 'prediction';
        const modeName = newMode === 'prediction' ? 'Prediction' : 'Evaluation';
        if (window.confirm(`Switch to ${modeName} Mode? You will be redirected to the ${modeName} dashboard.`)) {
            setResearcherMode(newMode);
            if (newMode === 'evaluation') {
                navigate('/researcher/evaluation/model-evaluation');
            } else {
                navigate('/researcher/prediction/dashboard');
            }
        }
    };

    const teacherMenuItems = [
        {
            name: 'Upload',
            path: '/researcher/prediction/dashboard',
            icon: (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
            ),
        },
        {
            name: 'Class Summary',
            path: '/researcher/prediction/class-summary',
            icon: (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
            ),
        },
        {
            name: 'Prediction Table',
            path: '/researcher/prediction/prediction-table',
            icon: (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
            ),
        },
        {
            name: 'Model Reliability',
            path: '/researcher/prediction/model-reliability',
            icon: (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
            ),
        },
    ];

    const adminMenuItems = [
        {
            name: 'Upload',
            path: '/researcher/prediction/dashboard',
            icon: (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
            ),
        },
        {
            name: 'School Summary',
            path: '/researcher/prediction/school-summary',
            icon: (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
            ),
        },
        {
            name: 'Section Comparison',
            path: '/researcher/prediction/section-comparison',
            icon: (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
            ),
        },
        {
            name: 'Prediction Table',
            path: '/researcher/prediction/prediction-table',
            icon: (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
            ),
        },
        {
            name: 'Model Reliability',
            path: '/researcher/prediction/model-reliability',
            icon: (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
            ),
        },
    ];

    const menuItems = viewMode === 'teacher' ? teacherMenuItems : adminMenuItems;

    const isActive = (path: string) => location.pathname === path;

    return (
        <div className="min-h-screen bg-gray-50 flex">
            <ToastContainer position="top-right" autoClose={4000} />

            <aside
                className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
            >
                <div className="flex flex-col h-full">
                    <div className="flex items-center justify-between p-4 border-b border-gray-200">
                        <Link to="/home" className="flex items-center space-x-3 hover:opacity-90 transition">
                            <div className="rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg mb-4 overflow-hidden">
                                <img src="/logo.png" alt="Logo" className="h-full w-full object-cover" />
                            </div>
                            <span className="text-xl font-bold">
                                NAT-Lytics
                                <br />
                                <p className="text-xs font-normal text-gray-500">National Achievement Test Predictive Analytics Tool</p>
                            </span>
                        </Link>
                    </div>

                    <div className="px-4 py-2 border-b border-gray-200">
                        <div className="flex bg-gray-100 rounded-lg p-1">
                            <button
                                onClick={() => setViewMode('teacher')}
                                className={`flex-1 px-3 py-1 text-xs font-medium rounded-md transition ${viewMode === 'teacher'
                                    ? 'bg-white text-blue-700 shadow-sm'
                                    : 'text-gray-600 hover:text-gray-900'
                                    }`}
                            >
                                Teacher View
                            </button>
                            <button
                                onClick={() => setViewMode('admin')}
                                className={`flex-1 px-3 py-1 text-xs font-medium rounded-md transition ${viewMode === 'admin'
                                    ? 'bg-white text-blue-700 shadow-sm'
                                    : 'text-gray-600 hover:text-gray-900'
                                    }`}
                            >
                                Admin View
                            </button>
                        </div>
                    </div>

                    {viewMode === 'teacher' ? (
                        <>
                            <div className="px-4 py-2 border-b border-gray-200">
                                <span className="w-full px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 inline-block text-center">
                                    TEACHER MODE
                                </span>
                            </div>

                            <nav className="flex-1 p-4 space-y-2">
                                {menuItems.map((item) => (
                                    <button
                                        key={item.path}
                                        onClick={() => {
                                            const isUpload = item.path === '/researcher/prediction/dashboard';
                                            if (!hasPredictions && !isUpload) {
                                                toast.warn('No dataset uploaded. Please upload a dataset first.');
                                                return;
                                            }
                                            navigate(item.path, { state: location.state });
                                        }}
                                        className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition ${isActive(item.path)
                                            ? 'bg-blue-50 text-blue-700'
                                            : 'text-gray-700 hover:bg-gray-100'
                                            }`}
                                    >
                                        {item.icon}
                                        <span className="font-medium">{item.name}</span>
                                    </button>
                                ))}
                            </nav>
                        </>
                    ) : (
                        <>
                            <div className="px-4 py-2 border-b border-gray-200">
                                <span className="w-full px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700 inline-block text-center">
                                    ADMIN MODE
                                </span>
                            </div>

                            <nav className="flex-1 p-4 space-y-2">
                                {menuItems.map((item) => (
                                    <button
                                        key={item.path}
                                        onClick={() => navigate(item.path)}
                                        className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition ${isActive(item.path)
                                            ? 'bg-blue-50 text-blue-700'
                                            : 'text-gray-700 hover:bg-gray-100'
                                            }`}
                                    >
                                        {item.icon}
                                        <span className="font-medium">{item.name}</span>
                                    </button>
                                ))}
                            </nav>
                        </>
                    )}

                    <div className="p-4 border-t border-gray-200">
                        <div className="flex items-center space-x-3 mb-4">
                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                                <span className="text-white font-medium">
                                    {user?.firstName?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase()}
                                </span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                    {user?.firstName} {user?.lastName}
                                </p>
                                <p className="text-xs text-gray-500">{user?.email}</p>
                                <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
                            </div>
                        </div>
                        <button
                            onClick={handleSignOut}
                            className="w-full flex items-center justify-center space-x-2 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition"
                        >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                            <span>Logout</span>
                        </button>
                    </div>
                </div>
            </aside>

            <div className={`flex-1 transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-0'}`}>
                <header className="bg-white shadow-sm sticky top-0 z-40">
                    <div className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center space-x-4">
                            <button
                                onClick={() => setSidebarOpen(!sidebarOpen)}
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
                            {viewMode === 'teacher' && (
                                <button
                                    onClick={toggleResearcherMode}
                                    className="cursor-pointer px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 transition"
                                >
                                    RESEARCHER - {researcherMode.toUpperCase()} MODE
                                </button>
                            )}
                        </div>
                    </div>
                </header>

                <main className="p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}