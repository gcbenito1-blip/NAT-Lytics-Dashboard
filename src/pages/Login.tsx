import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const getFriendlyError = (error: unknown): string => {
  const message = (error as { message?: string })?.message?.toLowerCase() ?? '';
  const status = String((error as { status?: number })?.status ?? '');

  if (
    message.includes('invalid login credentials') ||
    message.includes('invalid credentials')
  )
    return 'Invalid email or password. Please check your credentials and try again.';
  if (message.includes('email not confirmed') || message.includes('confirm your email'))
    return 'Please verify your email address before signing in. Check your inbox for the confirmation link.';
  if (message.includes('invalid email') || (status === '400' && message.includes('email')))
    return 'Please enter a valid email address.';
  if (message.includes('user not found') || message.includes('no user'))
    return 'No account found with this email. Please sign up first.';
  if (message.includes('too many requests') || status === '429')
    return 'Too many failed attempts. Please wait a few minutes before trying again.';
  if (message.includes('network') || message.includes('fetch') || status === '500')
    return 'Unable to connect. Please check your internet connection and try again.';
  if (message.includes('user disabled'))
    return 'This account has been disabled. Please contact support.';

  return 'Something went wrong. Please try again or contact support if the problem persists.';
};

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      const msg = getFriendlyError(error);
      toast.error(msg);
      setLoading(false);
    } else {
      toast.success('Welcome back! Loading Landing Page...');
      // Give the toast a moment to render, then navigate
      setTimeout(() => navigate('/home'), 1500);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center p-4">
      <ToastContainer
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        pauseOnHover
        theme="light"
      />

      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg mb-4 overflow-hidden">
              <img
                src="/logo.png"
                alt="NAT-Lytics Logo"
                className="h-full w-full object-cover"
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">NAT-Lytics</h1>
            <p className="text-gray-500 mt-2">National Achievement Test Predictive Tool</p>
          </div>

          {/* Form */}
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
                autoComplete="email"
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
                autoComplete="current-password"
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
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
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
