import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getOrgSessions, getSessionById, type SessionMeta } from '../services/sessionService';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { UserProfile } from '../contexts/AuthContext';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function MpsChip({ score }: { score: number }) {
  const color = score >= 75 ? 'bg-green-100 text-green-700' : score >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>{score.toFixed(1)} MPS</span>;
}

// ── Teacher row ───────────────────────────────────────────────────────────────

interface TeacherGroup {
  teacher: Pick<UserProfile, 'id' | 'name' | 'email'>;
  sessions: SessionMeta[];
}

function TeacherAccordion({
  group,
  onViewSession,
}: {
  group: TeacherGroup;
  onViewSession: (meta: SessionMeta) => void;
}) {
  const [open, setOpen] = useState(true);
  const totalLearners = group.sessions.reduce((a, s) => a + s.totalPredictions, 0);
  const avgMps = group.sessions.length
    ? group.sessions.reduce((a, s) => a + s.averageScore, 0) / group.sessions.length
    : 0;

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 bg-white hover:bg-gray-50 transition text-left"
      >
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
            style={{ background: 'linear-gradient(135deg, #3da6e2, #1480be)' }}
          >
            {group.teacher.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">{group.teacher.name}</p>
            <p className="text-xs text-gray-400">{group.teacher.email}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-4 text-sm">
            <span className="text-gray-500">
              <span className="font-semibold text-gray-800">{group.sessions.length}</span> sessions
            </span>
            <span className="text-gray-500">
              <span className="font-semibold text-gray-800">{totalLearners}</span> learners
            </span>
            {group.sessions.length > 0 && <MpsChip score={avgMps} />}
          </div>
          <svg
            className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Sessions list */}
      {open && (
        <div className="border-t border-gray-100 bg-gray-50">
          {group.sessions.length === 0 ? (
            <p className="text-sm text-gray-400 px-5 py-4">No sessions yet.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {group.sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between px-5 py-3 hover:bg-white transition"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{session.sessionName}</p>
                    <p className="text-xs text-gray-400 truncate">{session.fileName} · {formatDate(session.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    <span className="text-xs text-gray-500 hidden sm:block">
                      {session.totalPredictions} learners
                    </span>
                    <MpsChip score={session.averageScore} />
                    <button
                      onClick={() => onViewSession(session)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      View
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AdminOverview() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [groups, setGroups] = useState<TeacherGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSession, setLoadingSession] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!user?.schoolId) return;
    setLoading(true);

    try {
      // 1. Fetch all teachers in the same org
      const teacherSnap = await getDocs(
        query(
          collection(db, 'users'),
          where('schoolId', '==', user.schoolId),
          where('role', '==', 'teacher')
        )
      );
      const teachers = teacherSnap.docs.map((d) => {
        const data = d.data() as UserProfile;
        return { id: data.id || d.id, name: data.name, email: data.email };
      });

      // 2. Fetch all sessions for this org
      const sessions = await getOrgSessions(user.schoolId);

      // 3. Group sessions by teacher
      const grouped: TeacherGroup[] = teachers.map((teacher) => ({
        teacher,
        sessions: sessions.filter((s) => s.teacherId === teacher.id),
      }));

      // Sort by most recent session
      grouped.sort((a, b) => {
        const aLast = a.sessions[0]?.createdAt ?? '';
        const bLast = b.sessions[0]?.createdAt ?? '';
        return bLast.localeCompare(aLast);
      });

      setGroups(grouped);
    } catch (e) {
      console.error('AdminOverview load failed', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const handleViewSession = async (meta: SessionMeta) => {
    setLoadingSession(true);
    try {
      const full = await getSessionById(meta.teacherId, meta.id);
      if (full) {
        navigate('/class-summary', {
          state: {
            predictions: full.predictions,
            fileName: full.fileName,
            sessionName: `${meta.teacherName} – ${full.sessionName}`,
          },
        });
      }
    } finally {
      setLoadingSession(false);
    }
  };

  // ── Aggregate stats ──────────────────────────────────────────────────────────
  const totalTeachers = groups.length;
  const totalSessions = groups.reduce((a, g) => a + g.sessions.length, 0);
  const totalLearners = groups.reduce((a, g) => a + g.sessions.reduce((b, s) => b + s.totalPredictions, 0), 0);
  const allScores = groups.flatMap((g) => g.sessions.map((s) => s.averageScore));
  const orgAvg = allScores.length ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 0;

  const filteredGroups = groups.filter((g) =>
    g.teacher.name.toLowerCase().includes(search.toLowerCase()) ||
    g.teacher.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <header
        className="justify-between items-center mb-8 p-6 rounded-2xl text-white bg-[linear-gradient(135deg,_#3da6e2_0%,_#1480be_100%)]"
      >
        <h1 className="text-2xl font-bold mb-1">School Overview</h1>
        <p className="text-sm opacity-90">
          Monitor all teachers and their prediction sessions in your organization.
        </p>
      </header>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Teachers', value: totalTeachers, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Total Predictions', value: totalSessions, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Total Learners', value: totalLearners, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Average NAT MPS', value: orgAvg.toFixed(1), color: orgAvg >= 75 ? 'text-green-600' : 'text-orange-500', bg: orgAvg >= 75 ? 'bg-green-50' : 'bg-orange-50' },
        ].map((stat) => (
          <div key={stat.label} className={`${stat.bg} rounded-xl p-4`}>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Teachers list */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <h2 className="text-lg font-semibold text-gray-900">
            Teachers
            <span className="ml-2 text-sm font-normal text-gray-400">({groups.length})</span>
          </h2>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search teachers…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-blue-500" />
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <svg className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <p className="text-gray-500 font-medium">
              {search ? 'No teachers match your search.' : 'No teachers in your organization yet.'}
            </p>
            {!search && (
              <p className="text-sm text-gray-400 mt-1">
                Teachers must be registered with the same Organization ID.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredGroups.map((group) => (
              <TeacherAccordion
                key={group.teacher.id}
                group={group}
                onViewSession={handleViewSession}
              />
            ))}
          </div>
        )}
      </div>

      {/* Loading overlay when fetching full session */}
      {loadingSession && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white rounded-2xl p-6 shadow-xl flex items-center gap-3">
            <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-blue-600" />
            <p className="text-sm font-medium text-gray-700">Loading session…</p>
          </div>
        </div>
      )}
    </div>
  );
}
