import { useAuth } from '../contexts/AuthContext';

export function ModelReliability() {
    const { user } = useAuth();

    return (
        <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Model Reliability</h1>
            <p className="text-gray-600">
                View model performance metrics, confidence intervals, and reliability statistics for your predictions.
                This page is under construction.
            </p>
        </div>
    );
}
