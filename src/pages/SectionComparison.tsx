import { useAuth } from '../contexts/AuthContext';

export function SectionComparison() {
    const { user } = useAuth();

    return (
        <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Section Comparison</h1>
            <p className="text-gray-600">
                Compare performance across different sections. View side-by-side comparisons of average scores, pass rates, and subject-wise performance.
                This page is under construction.
            </p>
        </div>
    );
}
