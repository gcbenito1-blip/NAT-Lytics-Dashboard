import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

type ResearcherMode = 'evaluation' | 'prediction';

export function Home() {
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();

  const isResearcher = user?.role === 'researcher';
  const isTeacher = user?.role === 'teacher';
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!user) return;

    if (isAdmin) {
      navigate('/overview', { replace: true });
      return;
    }

    if (isTeacher) {
      navigate('/overview', { replace: true });
      return;
    }

    // Researchers don't need sessions — just stop the loading spinner
    setLoading(false);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const enterMode = (mode: ResearcherMode) => {
    localStorage.setItem('researcherMode', mode);
    navigate(mode === 'evaluation' ? '/evaluation/metrics' : '/dashboard');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
      </div>
    );
  }

  // Researcher mode picker
  if (isResearcher) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-4xl w-full">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Welcome, {user?.firstName} {user?.lastName}
            </h1>
            <p className="text-xl text-gray-600">Select your working mode to get started</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Evaluation Mode */}
            <ModeCard
              title="Evaluation Mode"
              description="Analyze model performance, review metrics, and understand prediction accuracy. Access detailed model evaluation reports and comparative analysis."
              color="blue"
              logo="quiz"
              features={[
                'View model performance metrics (R², MAE, RMSE)',
                'Compare different model algorithms',
                'Analyze feature importance',
                'Review prediction accuracy',
              ]}
              onEnter={() => enterMode('evaluation')}
            />

            {/* Prediction Mode */}
            <ModeCard
              title="Prediction Mode"
              description="Run predictions on student data, generate forecasts, and export results. Create sessions and analyze prediction outcomes with detailed explanations."
              color="green"
              logo="category"
              features={[
                'Upload datasets for prediction',
                'Generate student performance forecasts',
                'View prediction results with explanations',
                'Export results to CSV/PDF',
              ]}
              onEnter={() => enterMode('prediction')}
            />
          </div>
        </div>
      </div>
    );
  }

  // Fallback — should not be reached in normal flow
  return null;
}

// ─── ModeCard sub-component ───────────────────────────────────────────────────

interface ModeCardProps {
  title: string;
  description: string;
  color: 'blue' | 'green';
  features: string[];
  logo: string;
  onEnter: () => void;
}

function ModeCard({ title, description, color, features, onEnter, logo }: ModeCardProps) {
  const palette = {
    blue: {
      border: 'hover:border-blue-200',
      icon: 'from-blue-500 to-blue-600',
      bg: 'bg-blue-50',
      logo: "",
      heading: 'text-blue-900',
      text: 'text-blue-800',
      button: 'bg-blue-600 hover:bg-blue-700',
    },
    green: {
      border: 'hover:border-green-200',
      icon: 'from-green-500 to-green-600',
      bg: 'bg-green-50',
      heading: 'text-green-900',
      logo: '',
      text: 'text-green-800',
      button: 'bg-green-600 hover:bg-green-700',
    },
  }[color];

  return (
    <div
      className={`bg-white rounded-2xl shadow-lg p-8 border-2 border-transparent ${palette.border} transition-all flex flex-col h-full`}
    >
      <div className="flex-1 flex flex-col">
        <div
          className={`w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br ${palette.icon} flex items-center justify-center`}
        >
          <span className='material-icons-round text-white'>{logo}</span>
        </div>

        <h2 className="text-2xl font-bold text-gray-900 mb-4 text-center">{title}</h2>
        <p className="text-gray-600 mb-6 leading-relaxed text-center">{description}</p>

        <div className={`${palette.bg} rounded-lg p-4 flex-1`}>
          <h3 className={`font-semibold ${palette.heading} mb-2`}>What you can do:</h3>
          <ul className={`text-sm ${palette.text} space-y-1`}>
            {features.map((f) => (
              <li key={f}>• {f}</li>
            ))}
          </ul>
        </div>
      </div>

      <button
        onClick={onEnter}
        className={`mt-6 w-full px-6 py-3 ${palette.button} text-white rounded-lg font-semibold transition cursor-pointer`}
      >
        Enter {title}
      </button>
    </div>
  );
}