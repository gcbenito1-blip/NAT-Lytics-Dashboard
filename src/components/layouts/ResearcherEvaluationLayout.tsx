import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useState } from 'react';

export function ResearcherEvaluationLayout() {
    const { signOut, user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [researcherMode, setResearcherMode] = useState<'prediction' | 'evaluation'>('evaluation');

    const handleSignOut = async () => {
        await signOut();
        navigate('/login');
    };

    const toggleResearcherMode = () => {
        const newMode = researcherMode === 'prediction' ? 'evaluation' : 'prediction';
        const modeName = newMode === 'prediction' ? 'Prediction' : 'Evaluation';
        if (window.confirm(`Switch to ${modeName} Mode? You will be redirected to the ${modeName} dashboard.`)) {
            setResearcherMode(newMode);
            if (newMode === 'prediction') {
                navigate('/researcher/prediction/dashboard');
            } else {
                navigate('/researcher/evaluation/model-evaluation');
            }
        }
    };

    const menuItems = [
        {
            name: 'Metrics',
            path: '/researcher/evaluation/model-evaluation',
            icon: (
                <span className="material-icons-round text-base">show_chart</span>
            ),
        },
        {
            name: 'Charts',
            path: '/researcher/evaluation/charts',
            icon: (
                <span className="material-icons-round text-base">bar_chart</span>
            ),
        },
        {
            name: 'Feature Importance',
            path: '/researcher/evaluation/feature-importance',
            icon: (
                <span className="material-icons-round text-base">query_stats</span>
            ),
        },
        {
            name: 'School Comparison',
            path: '/researcher/evaluation/school-comparison',
            icon: (
                <span className="material-icons-round text-base">balance</span>
            ),
        },
        {
            name: 'Student Table',
            path: '/researcher/evaluation/student-table',
            icon: (
                <span className="material-icons-round text-base">table_chart</span>
            ),
        },
    ];

    const isActive = (path: string) => location.pathname === path;

    return (
        <div className="min-h-screen bg-gray-50 flex">
            {/* Sidebar */}
            <aside
                className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
            >
                <div className="flex flex-col h-full">
                    {/* Logo */}
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

                    {/* Navigation */}
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

                    {/* User Info & Logout */}
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

            {/* Main Content */}
            <div className={`flex-1 transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-0'}`}>
                <header className="bg-white shadow-sm sticky top-0 z-40">
                    <div className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center space-x-4">
                            {/* Hamburger Menu Button */}
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
                            <button
                                onClick={toggleResearcherMode}
                                className="cursor-pointer px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 transition"
                            >
                                RESEARCHER - {researcherMode.toUpperCase()} MODE
                            </button>
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <main className="p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
