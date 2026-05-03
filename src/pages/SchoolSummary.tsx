import { useAuth } from '../contexts/AuthContext';

export function SchoolSummary() {
    const { user } = useAuth();

    return (
        <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-4">School Summary</h1>
            <p className="text-gray-600">
                View comprehensive summary of school performance, including average scores across sections, subject breakdown, and school-wide demographics.
                This page is under construction.
            </p>
        </div>
    );
}
