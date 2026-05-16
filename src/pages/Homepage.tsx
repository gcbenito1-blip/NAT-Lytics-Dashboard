import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// ─── Upload Modal ─────────────────────────────────────────────────────────────

function UploadModal({ onClose }: { onClose: () => void }) {
    const navigate = useNavigate();

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8 border border-slate-100">
                {/* Close */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition"
                >
                    <span className="material-icons-round">close</span>
                </button>

                {/* Privacy Notice */}
                <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6">
                    <span className="material-icons-round text-blue-500 mt-0.5 text-lg">shield</span>
                    <div>
                        <p className="text-sm font-semibold text-blue-800 mb-1">Data Privacy Notice</p>
                        <p className="text-xs text-blue-700 leading-relaxed">
                            All uploaded data is processed locally and used solely for generating class performance
                            predictions. No student information is shared with third parties. Data is handled in
                            compliance with RA 10173 (Data Privacy Act of 2012).
                        </p>
                    </div>
                </div>

                {/* Template Info */}
                <div className="mb-6">
                    <p className="text-sm font-semibold text-slate-700 mb-3">Required CSV Columns</p>
                    <div className="grid grid-cols-2 gap-2">
                        {[
                            'Filipino (Gr. 1–5)',
                            'English (Gr. 1–5)',
                            'Science (Gr. 3–5)',
                            'Math (Gr. 1–5)',
                            'Araling Panlipunan (Gr. 1–5)',
                            'Age',
                            'Gender (M/F)',
                            'Mother Tongue',
                            'Nutritional Status',
                        ].map((col) => (
                            <div key={col} className="flex items-center gap-2 text-xs text-slate-600">
                                <span className="material-icons-round text-emerald-500 text-sm">check_circle</span>
                                {col}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm font-medium hover:bg-slate-50 transition"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => navigate('/dashboard')}
                        className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2"
                    >
                        <span className="material-icons-round text-sm">upload_file</span>
                        Go to Upload
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Step Card ────────────────────────────────────────────────────────────────

function StepCard({
    step,
    icon,
    title,
    description,
}: {
    step: number;
    icon: string;
    title: string;
    description: string;
}) {
    return (
        <div className="relative flex flex-col items-center text-center group">
            {/* Connector line (hidden on last) */}
            <div className="hidden md:block absolute top-8 left-1/2 w-full h-px bg-gradient-to-r from-blue-200 to-transparent -z-10" />

            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-200 mb-4 group-hover:scale-105 transition-transform">
                <span className="material-icons-round text-white text-2xl">{icon}</span>
            </div>

            <span className="inline-block text-xs font-bold text-blue-500 tracking-widest uppercase mb-1">
                Step {step}
            </span>
            <h3 className="text-sm font-bold text-slate-800 mb-1">{title}</h3>
            <p className="text-xs text-slate-500 leading-relaxed max-w-[160px]">{description}</p>
        </div>
    );
}

// ─── Preview Card ─────────────────────────────────────────────────────────────

function PreviewCard({
    icon,
    title,
    description,
    color,
}: {
    icon: string;
    title: string;
    description: string;
    color: 'blue' | 'violet' | 'amber' | 'emerald';
}) {
    const palette = {
        blue: 'from-blue-50 to-blue-100/60 border-blue-100 text-blue-600',
        violet: 'from-violet-50 to-violet-100/60 border-violet-100 text-violet-600',
        amber: 'from-amber-50 to-amber-100/60 border-amber-100 text-amber-600',
        emerald: 'from-emerald-50 to-emerald-100/60 border-emerald-100 text-emerald-600',
    }[color];

    const iconBg = {
        blue: 'bg-blue-100',
        violet: 'bg-violet-100',
        amber: 'bg-amber-100',
        emerald: 'bg-emerald-100',
    }[color];

    return (
        <div
            className={`bg-gradient-to-br ${palette} border rounded-2xl p-5 flex flex-col gap-3 opacity-80`}
        >
            <div className={`w-10 h-10 ${iconBg} rounded-xl flex items-center justify-center`}>
                <span className={`material-icons-round text-lg`}>{icon}</span>
            </div>
            <div>
                <p className="text-sm font-bold text-slate-800 mb-0.5">{title}</p>
                <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
            </div>
        </div>
    );
}

// ─── Admin Card ─────────────────────────────────────────────────────────────

function AdminCard({
    icon,
    title,
    description,
    route,
}: {
    icon: string;
    title: string;
    description: string;
    route: string;
}) {
    const navigate = useNavigate();
    return (
        <button
            onClick={() => navigate(route)}
            className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col items-center text-center hover:shadow-lg hover:border-blue-200 transition group"
        >
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                <span className="material-icons-round text-white text-2xl">{icon}</span>
            </div>
            <p className="text-sm font-bold text-slate-800 mb-1">{title}</p>
            <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
        </button>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function Homepage() {
    const [showModal, setShowModal] = useState(false);
    const { user } = useAuth();

    const isAdmin = user?.role === 'admin';

    const adminCards = [
        {
            icon: 'manage_accounts',
            title: 'Manage Teachers',
            description: 'Add, view, and manage teacher accounts in your organization.',
            route: '/manage-teachers',
        },
        {
            icon: 'analytics',
            title: 'List of Results',
            description: 'View prediction history and performance results.',
            route: '/results-list',
        },
    ];

    const steps = [
        {
            icon: 'upload_file',
            title: 'Upload Class Data',
            description: 'Import your student CSV file with grades and demographics',
        },
        {
            icon: 'analytics',
            title: 'System Analyzes',
            description: 'The model processes student performance data automatically',
        },
        {
            icon: 'dashboard',
            title: 'View Overview',
            description: 'Explore class-wide results and performance summaries',
        },
        {
            icon: 'person_search',
            title: 'Identify Students',
            description: 'Pinpoint learners who need additional support',
        },
    ];

    const previewCards = [
        {
            icon: 'bar_chart',
            title: 'Class Overview',
            description: 'Class-wide performance summary at a glance',
            color: 'blue' as const,
        },
        {
            icon: 'group',
            title: 'Student Results',
            description: 'Individual NAT performance predictions per student',
            color: 'violet' as const,
        },
        {
            icon: 'lightbulb',
            title: 'Key Learning Factors',
            description: 'Insights into what most influences performance',
            color: 'amber' as const,
        },
        {
            icon: 'summarize',
            title: 'Reports',
            description: 'Downloadable summaries in CSV or PDF format',
            color: 'emerald' as const,
        },
    ];

    const requiredColumns = [
        { label: 'Filipino', detail: 'Grades 1–5' },
        { label: 'English', detail: 'Grades 1–5' },
        { label: 'Science', detail: 'Grades 3–5' },
        { label: 'Mathematics', detail: 'Grades 1–5' },
        { label: 'Araling Panlipunan', detail: 'Grades 1–5' },
        { label: 'Age', detail: 'Numeric' },
        { label: 'Gender', detail: 'M / F' },
        { label: 'Mother Tongue', detail: 'e.g. Ilocano, Tagalog' },
        { label: 'Nutritional Status', detail: 'Wasted, Normal, etc.' },
    ];

    return (
        <div className="min-h-screen bg-slate-50">
            {showModal && <UploadModal onClose={() => setShowModal(false)} />}

            {/* ── Admin View ─────────────────────────────────────────────────────────── */}
            {isAdmin ? (
                <>
                    {/* Section 1: Admin Welcome */}
                    <section className="relative overflow-hidden bg-gradient-to-br from-blue-700 via-blue-600 to-blue-800 text-white">
                        <div className="absolute -top-16 -right-16 w-80 h-80 rounded-full bg-white/5 pointer-events-none" />
                        <div className="absolute bottom-0 -left-12 w-64 h-64 rounded-full bg-white/5 pointer-events-none" />

                        <div className="relative max-w-4xl mx-auto px-6 py-20 text-center">
                            <span className="inline-flex items-center gap-1.5 bg-white/15 border border-white/20 rounded-full px-4 py-1.5 text-xs font-semibold tracking-wide uppercase mb-6">
                                <span className="material-icons-round text-sm">admin_panel_settings</span>
                                School Admin Dashboard
                            </span>

                            <h1 className="text-4xl md:text-5xl font-extrabold leading-tight mb-5">
                                Welcome, {user?.firstName || 'Admin'}
                            </h1>

                            <p className="text-blue-100 text-lg max-w-xl mx-auto mb-10 leading-relaxed">
                                Manage teachers and monitor prediction results across your organization.
                            </p>
                        </div>
                    </section>

                    {/* Section 2: Admin Actions */}
                    <section className="max-w-4xl mx-auto px-6 py-16">
                        <div className="text-center mb-10">
                            <p className="text-xs font-bold tracking-widest text-blue-500 uppercase mb-2">
                                Administration
                            </p>
                            <h2 className="text-2xl font-extrabold text-slate-800">Admin Panel</h2>
                            <p className="text-slate-500 text-sm mt-2">
                                Manage your organization's teachers and view prediction history
                            </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl mx-auto [&>*]:cursor-pointer">
                            {adminCards.map((card) => (
                                <AdminCard key={card.title} {...card} />
                            ))}
                        </div>
                    </section>
                </>
            ) : (
                /* ── Teacher View ────────────────────────────────────────────────────────── */
                <>
                    {/* ── Section 1: Welcome ─────────────────────────────────────────────── */}
                    <section className="relative overflow-hidden bg-gradient-to-br from-blue-700 via-blue-600 to-blue-800 text-white">
                        {/* Decorative circles */}
                        <div className="absolute -top-16 -right-16 w-80 h-80 rounded-full bg-white/5 pointer-events-none" />
                        <div className="absolute bottom-0 -left-12 w-64 h-64 rounded-full bg-white/5 pointer-events-none" />

                        <div className="relative max-w-4xl mx-auto px-6 py-20 text-center">
                            {/* Badge */}
                            <span className="inline-flex items-center gap-1.5 bg-white/15 border border-white/20 rounded-full px-4 py-1.5 text-xs font-semibold tracking-wide uppercase mb-6">
                                <span className="material-icons-round text-sm">school</span>
                                NAT Performance Prediction System
                            </span>

                            <h1 className="text-4xl md:text-5xl font-extrabold leading-tight mb-5">
                                Welcome to{' '}
                                <span className="text-blue-200">NAT-Lytics</span>
                                {user?.firstName ? `, ${user.firstName}` : ''}
                            </h1>

                            <p className="text-blue-100 text-lg max-w-xl mx-auto mb-10 leading-relaxed">
                                A system that helps you understand your class performance and identify
                                students who need support.
                            </p>

                            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                                <button
                                    onClick={() => setShowModal(true)}
                                    className="inline-flex items-center gap-2 bg-white text-blue-700 hover:bg-blue-50 px-7 py-3.5 rounded-xl font-bold text-sm shadow-lg shadow-blue-900/30 transition"
                                >
                                    <span className="material-icons-round text-lg">upload_file</span>
                                    Upload Your Class Data
                                </button>
                            </div>

                            <p className="mt-5 text-xs text-blue-300">
                                Start by uploading your student file (CSV) to generate predictions.
                            </p>
                        </div>
                    </section>

                    {/* ── Section 2: How It Works ────────────────────────────────────────── */}
                    <section className="max-w-4xl mx-auto px-6 py-16">
                        <div className="text-center mb-12">
                            <p className="text-xs font-bold tracking-widest text-blue-500 uppercase mb-2">
                                Getting Started
                            </p>
                            <h2 className="text-2xl font-extrabold text-slate-800">How It Works</h2>
                            <p className="text-slate-500 text-sm mt-2">Four simple steps to actionable insights</p>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                            {steps.map((s, i) => (
                                <StepCard
                                    key={s.title}
                                    step={i + 1}
                                    icon={s.icon}
                                    title={s.title}
                                    description={s.description}
                                />
                            ))}
                        </div>
                    </section>

                    {/* ── Section 3: File Requirements ──────────────────────────────────── */}
                    <section className="bg-white border-y border-slate-100">
                        <div className="max-w-4xl mx-auto px-6 py-16">
                            <div className="text-center mb-10">
                                <p className="text-xs font-bold tracking-widest text-blue-500 uppercase mb-2">
                                    File Requirements
                                </p>
                                <h2 className="text-2xl font-extrabold text-slate-800">Accepted File Format</h2>
                                <p className="text-slate-500 text-sm mt-2">
                                    Upload a <span className="font-semibold text-slate-700">.csv</span> file with the
                                    following columns:
                                </p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {requiredColumns.map((col) => (
                                    <div
                                        key={col.label}
                                        className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3"
                                    >
                                        <span className="material-icons-round text-emerald-500 text-lg">check_circle</span>
                                        <div>
                                            <p className="text-sm font-semibold text-slate-800">{col.label}</p>
                                            <p className="text-xs text-slate-400">{col.detail}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Nutritional Status note */}
                            <div className="mt-6 flex items-start gap-2 text-xs text-slate-500 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                                <span className="material-icons-round text-amber-400 text-base mt-0.5">info</span>
                                <span>
                                    <strong className="text-amber-700">Nutritional Status</strong> accepted values:
                                    Severely Wasted, Wasted, Normal, Overweight, Obese.
                                </span>
                            </div>
                        </div>
                    </section>

                    {/* ── Section 4: What You'll See ─────────────────────────────────────── */}
                    <section className="max-w-4xl mx-auto px-6 py-16">
                        <div className="text-center mb-10">
                            <p className="text-xs font-bold tracking-widest text-blue-500 uppercase mb-2">
                                After Upload
                            </p>
                            <h2 className="text-2xl font-extrabold text-slate-800">What You Will See</h2>
                            <p className="text-slate-500 text-sm mt-2">
                                Once your data is uploaded, you'll have access to these features
                            </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {previewCards.map((card) => (
                                <PreviewCard key={card.title} {...card} />
                            ))}
                        </div>
                    </section>

                    {/* ── Section 5: Empty State Footer ─────────────────────────────────── */}
                    <section className="border-t border-slate-100 bg-white">
                        <div className="max-w-4xl mx-auto px-6 py-12 text-center">
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-100 mb-5">
                                <span className="material-icons-round text-slate-400 text-3xl">folder_open</span>
                            </div>
                            <p className="text-base font-bold text-slate-700 mb-1">
                                No class data available yet.
                            </p>
                            <p className="text-sm text-slate-400 mb-6">
                                Please upload a dataset to begin analysis.
                            </p>
                            <button
                                onClick={() => setShowModal(true)}
                                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl text-sm font-semibold transition shadow-md shadow-blue-200"
                            >
                                <span className="material-icons-round text-base">upload_file</span>
                                Upload Class Data
                            </button>
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}