import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
    getManageRequestsReceived,
    getManagingAdmin,
    acceptManageRequest,
    rejectManageRequest,
    ManageRequest,
} from '../lib/groups';

export function Groups() {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [pendingRequests, setPendingRequests] = useState<ManageRequest[]>([]);
    const [managingAdmin, setManagingAdmin] = useState<ManageRequest | null>(null);

    useEffect(() => {
        if (user && user.email) {
            loadData();
        }
    }, [user]);

    const loadData = () => {
        if (!user || !user.email) return;

        // Fetch pending requests
        const requests = getManageRequestsReceived(user.email);
        setPendingRequests(requests.filter(r => r.status === 'pending'));

        // Fetch managing admin
        const admin = getManagingAdmin(user.email);
        setManagingAdmin(admin);

        setLoading(false);
    };

    const handleAcceptRequest = (requestId: string) => {
        acceptManageRequest(requestId);
        loadData();
    };

    const handleRejectRequest = (requestId: string) => {
        if (!confirm('Are you sure you want to decline this request?')) return;
        rejectManageRequest(requestId);
        loadData();
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900">Organization</h1>
                <p className="text-gray-600 mt-2">Manage your organization membership and see who's monitoring your sessions</p>
            </div>

            {/* Managing Admin Section */}
            {managingAdmin && (
                <div className="mb-8">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">Your Managing Admin</h2>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                        <div className="flex items-center space-x-4">
                            <div className="h-12 w-12 rounded-full bg-blue-600 flex items-center justify-center">
                                <span className="text-white text-xl font-medium">
                                    {managingAdmin.admin_name.charAt(0).toUpperCase()}
                                </span>
                            </div>
                            <div>
                                <p className="font-semibold text-gray-900">{managingAdmin.admin_name}</p>
                                <p className="text-sm text-gray-600">{managingAdmin.admin_email}</p>
                                <p className="text-xs text-gray-500 mt-1">
                                    Managing since {formatDate(managingAdmin.responded_at || managingAdmin.requested_at)}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Pending Requests */}
            {pendingRequests.length > 0 && (
                <div className="mb-8">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">Pending Requests</h2>
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                        <p className="text-yellow-700 mb-4">
                            The following admins have requested to monitor and manage your sessions.
                        </p>
                        <div className="space-y-3">
                            {pendingRequests.map((request) => (
                                <div
                                    key={request.id}
                                    className="bg-white rounded-lg shadow-sm p-4 flex items-center justify-between"
                                >
                                    <div className="flex items-center space-x-4">
                                        <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                                            <span className="text-gray-600 font-medium">
                                                {request.admin_name.charAt(0).toUpperCase()}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-900">{request.admin_name}</p>
                                            <p className="text-sm text-gray-500">{request.admin_email}</p>
                                            <p className="text-xs text-gray-400">
                                                Requested on {formatDate(request.requested_at)}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex space-x-3">
                                        <button
                                            onClick={() => handleAcceptRequest(request.id)}
                                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                                        >
                                            Accept
                                        </button>
                                        <button
                                            onClick={() => handleRejectRequest(request.id)}
                                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
                                        >
                                            Decline
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* No Admin Message */}
            {!managingAdmin && pendingRequests.length === 0 && (
                <div className="text-center py-12 bg-gray-50 rounded-xl">
                    <svg
                        className="mx-auto h-12 w-12 text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                        />
                    </svg>
                    <p className="mt-4 text-gray-500">
                        You don't have a managing admin yet.
                    </p>
                    <p className="text-sm text-gray-400 mt-2">
                        An admin will send you a request to monitor your sessions.
                    </p>
                </div>
            )}
        </div>
    );
}