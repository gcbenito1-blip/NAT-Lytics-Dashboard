import { useAuth } from '../contexts/AuthContext';

export function ClassSummary() {
    const { user } = useAuth();

    return (
        <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Class Summary</h1>
            <p className="text-gray-600">
                View comprehensive summary of your class performance, including average scores, subject breakdown, and student demographics.
                This page is under construction.
            </p>
        </div>
    );
}
