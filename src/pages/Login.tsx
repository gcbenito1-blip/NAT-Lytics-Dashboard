import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  // Translate technical Firebase/auth errors into user-friendly messages
  const getFriendlyError = (error: any): string => {
    const message = error?.message?.toLowerCase() || '';

    if (message.includes('invalid email') || message.includes('invalid-email')) {
      return 'Please enter a valid email address.';
    }
    if (message.includes('user not found') || message.includes('user-not-found') || message.includes('no user')) {
      return 'No account found with this email. Please check your email or create a new account.';
    }
    if (message.includes('wrong password') || message.includes('invalid password') || message.includes('incorrect password')) {
      return 'Incorrect password. Please try again or reset your password.';
    }
    if (message.includes('too many attempts') || message.includes('try again later') || message.includes('too many requests')) {
      return 'Too many failed attempts. Please wait a few minutes before trying again.';
    }
    if (message.includes('network') || message.includes('fetch') || message.includes('request failed')) {
      return 'Unable to connect. Please check your internet connection and try again.';
    }
    if (message.includes('operation not allowed') || message.includes('disabled')) {
      return 'Sign-in is currently disabled. Please contact support.';
    }
    if (message.includes('user disabled')) {
      return 'This account has been disabled. Please contact support for assistance.';
    }
    // Default fallback - don't expose technical details
    return 'Something went wrong. Please try again or contact support if the problem persists.';
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      const friendlyMessage = getFriendlyError(error);
      setError(friendlyMessage);
      toast.error(friendlyMessage);
      setLoading(false);
    } else {
      navigate('/home');
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg mb-4 overflow-hidden">
              <img src="/logo.png" alt="Logo" className="h-full w-full object-cover" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">NAT-Lytics</h1>
            <p className="text-gray-500 mt-2">National Achievement Test Predictive Tool</p>
          </div>

          <ToastContainer position="top-right" autoClose={5000} />

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="Enter your email"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-medium rounded-lg shadow-md hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-600">
            Don't have an account?{' '}
            <Link to="/signup" className="text-blue-600 hover:underline font-medium">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
