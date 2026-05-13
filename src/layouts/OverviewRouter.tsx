import { useAuth } from '../contexts/AuthContext';
import { TeacherOverview } from '../pages/TeacherOverview';
import { AdminOverview } from '../pages/AdminOverview';
import { Navigate } from 'react-router-dom';

// This component exists purely to resolve /overview to the correct page.
// Router routes /overview; this chooses which overview page to render based on role.
export function OverviewRouter() {
    const { user, loading } = useAuth();

    if (loading) return null;
    if (!user) return <Navigate to="/login" replace />;

    if (user.role === 'admin') return <AdminOverview />;

    // teacher + researcher use teacher overview content
    return <TeacherOverview />;
}

