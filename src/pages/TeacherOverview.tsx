import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  getTeacherSessions,
  deleteSession,
  renameSession,
  type PredictionSession,
} from '../services/sessionService';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function PassBadge({ pct }: { pct: number }) {
  const color =
    pct >= 75
      ? 'text-green-700'
      : pct >= 50
        ? 'text-yellow-700'
        : 'text-red-700';
  return (
    <span className={`px-2 py-0.5 text-xs font-semibold ${color}`}>
      {pct.toFixed(0)}% above proficient
    </span>
  );
}

// ── Inline rename input ───────────────────────────────────────────────────────

function RenameInput({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (v: string) => void;
  onCancel: () => void;
}) {
  const [val, setVal] = useState(initial);
  return (
    <div className="flex items-center gap-2 flex-1">
      <input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSave(val.trim() || initial);
          if (e.key === 'Escape') onCancel();
        }}
        className="flex-1 px-3 py-1.5 border border-blue-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        onClick={() => onSave(val.trim() || initial)}
        className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition"
      >
        Save
      </button>
      <button
        onClick={onCancel}
        className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200 transition"
      >
        Cancel
      </button>
    </div>
  );
}

// ── Delete confirm modal ──────────────────────────────────────────────────────

function DeleteModal({
  sessionName,
  onConfirm,
  onCancel,
}: {
  sessionName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mx-auto mb-4">
          <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-gray-900 text-center mb-1">Delete Session?</h3>
        <p className="text-sm text-gray-500 text-center mb-6">
          "<span className="font-medium text-gray-700">{sessionName}</span>" will be permanently
          removed.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Session card (grid view) ──────────────────────────────────────────────────

function SessionCard({
  session,
  onView,
  onRename,
  onDelete,
}: {
  session: PredictionSession;
  onView: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const passPct =
    session.totalPredictions > 0
      ? (session.passedCount / session.totalPredictions) * 100
      : 0;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-shadow">
      {/* Top row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          {editing ? (
            <RenameInput
              initial={session.sessionName}
              onSave={(v) => {
                onRename(v);
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <h3 className="text-base font-semibold text-gray-900 truncate">
              {session.sessionName}
            </h3>
          )}
          <p className="text-xs text-gray-400 mt-0.5 truncate">{session.fileName}</p>
        </div>

        {/* Action buttons */}
        {!editing && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setEditing(true)}
              title="Rename"
              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </button>
            <button
              onClick={onDelete}
              title="Delete"
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 mb-4">
        <div className="text-center">
          <p className="text-xl font-bold text-gray-900">{session.totalPredictions}</p>
          <p className="text-xs text-gray-400">Learners</p>
        </div>
        <div className="w-px h-8 bg-gray-100" />
        <div className="text-center">
          <p
            className="text-xl font-bold"
            style={{
              color:
                session.averageScore >= 75
                  ? '#16a34a'
                  : session.averageScore >= 50
                    ? '#d97706'
                    : '#dc2626',
            }}
          >
            {session.averageScore.toFixed(1)}
          </p>
          <p className="text-xs text-gray-400">Avg MPS</p>
        </div>
        <div className="w-px h-8 bg-gray-100" />
        <PassBadge pct={passPct} />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">{formatDate(session.createdAt)}</p>
        <button
          onClick={onView}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
          View Results
        </button>
      </div>
    </div>
  );
}

// ── Session row (list view) ───────────────────────────────────────────────────

function SessionRow({
  session,
  onView,
  onRename,
  onDelete,
}: {
  session: PredictionSession;
  onView: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const passPct =
    session.totalPredictions > 0
      ? (session.passedCount / session.totalPredictions) * 100
      : 0;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-4">
        {/* Name + file */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <RenameInput
              initial={session.sessionName}
              onSave={(v) => {
                onRename(v);
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <h3 className="text-sm font-semibold text-gray-900 truncate">{session.sessionName}</h3>
          )}
          {!editing && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">{session.fileName}</p>
          )}
        </div>

        {/* Stats */}
        <div className="hidden sm:flex items-center gap-5 shrink-0">
          <div className="text-center">
            <p className="text-sm font-bold text-gray-900">{session.totalPredictions}</p>
            <p className="text-xs text-gray-400">Learners</p>
          </div>
          <div className="w-px h-7 bg-gray-100" />
          <div className="text-center">
            <p
              className="text-sm font-bold"
              style={{
                color:
                  session.averageScore >= 75
                    ? '#16a34a'
                    : session.averageScore >= 50
                      ? '#d97706'
                      : '#dc2626',
              }}
            >
              {session.averageScore.toFixed(1)}
            </p>
            <p className="text-xs text-gray-400">Avg MPS</p>
          </div>
          <div className="w-px h-7 bg-gray-100" />
          <PassBadge pct={passPct} />
          <div className="w-px h-7 bg-gray-100" />
          <p className="text-xs text-gray-400 whitespace-nowrap">{formatDate(session.createdAt)}</p>
        </div>

        {/* Actions */}
        {!editing && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setEditing(true)}
              title="Rename"
              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </button>
            <button
              onClick={onDelete}
              title="Delete"
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
            <button
              onClick={onView}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition ml-1"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
              View Results
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── View mode toggle icons ────────────────────────────────────────────────────

function GridIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={`h-4 w-4 ${active ? 'text-white' : 'text-gray-500'}`}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function ListIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={`h-4 w-4 ${active ? 'text-white' : 'text-gray-500'}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="3.5" cy="6" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="3.5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="3.5" cy="18" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function TeacherOverview() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [sessions, setSessions] = useState<PredictionSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<PredictionSession | null>(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getTeacherSessions(user.id);
      setSessions(data);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    let retried = false;

    async function run() {
      await load();
      if (cancelled) return;

      if (!user || retried) return;
      retried = true;

      await new Promise((r) => setTimeout(r, 800));
      if (cancelled) return;

      setLoading(true);
      try {
        const data = await getTeacherSessions(user.id);
        if (!cancelled) setSessions(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, user]);

  const handleRename = async (session: PredictionSession, newName: string) => {
    if (!user || newName === session.sessionName) return;
    await renameSession(user.id, session.id, newName);
    setSessions((prev) =>
      prev.map((s) => (s.id === session.id ? { ...s, sessionName: newName } : s))
    );
  };

  const handleDelete = async () => {
    if (!user || !deleteTarget) return;
    await deleteSession(user.id, deleteTarget.id);
    setSessions((prev) => prev.filter((s) => s.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  const handleView = (session: PredictionSession) => {
    navigate('/class-summary', {
      state: {
        sessionId: session.id,
        predictions: session.predictions,
        fileName: session.fileName,
        sessionName: session.sessionName,
      },
    });
  };

  const filtered = sessions.filter(
    (s) =>
      s.sessionName.toLowerCase().includes(search.toLowerCase()) ||
      s.fileName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <header
        className="rounded-2xl p-6 text-white"
        style={{ background: 'linear-gradient(135deg, #3da6e2 0%, #1480be 100%)' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold mb-1">Prediction History</h1>
            <p className="text-sm opacity-90">
              Manage your prediction history and track your class's progress.
            </p>
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 px-5 py-2.5 bg-white text-blue-700 rounded-xl font-semibold text-sm hover:bg-blue-50 transition shrink-0"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Prediction
          </button>
        </div>
      </header>

      {/* Sessions panel */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <h2 className="text-lg font-semibold text-gray-900">
            History List
            <span className="ml-2 text-sm font-normal text-gray-400">({sessions.length})</span>
          </h2>

          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                placeholder="Search history…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
              />
            </div>

            {/* View toggle */}
            <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-1">
              <button
                onClick={() => setViewMode('grid')}
                title="Grid view"
                className={`p-1.5 rounded-md transition ${viewMode === 'grid' ? 'bg-blue-600 shadow-sm' : 'hover:bg-gray-200'
                  }`}
              >
                <GridIcon active={viewMode === 'grid'} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                title="List view"
                className={`p-1.5 rounded-md transition ${viewMode === 'list' ? 'bg-blue-600 shadow-sm' : 'hover:bg-gray-200'
                  }`}
              >
                <ListIcon active={viewMode === 'list'} />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-blue-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <svg
                className="h-8 w-8 text-gray-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <p className="text-gray-500 font-medium mb-1">
              {search ? 'No sessions match your search.' : 'No prediction sessions yet.'}
            </p>
            {!search && (
              <>
                <p className="text-sm text-gray-400 mb-4">
                  Upload a dataset to create your first session.
                </p>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
                >
                  Upload Dataset
                </button>
              </>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onView={() => handleView(session)}
                onRename={(name) => handleRename(session, name)}
                onDelete={() => setDeleteTarget(session)}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                onView={() => handleView(session)}
                onRename={(name) => handleRename(session, name)}
                onDelete={() => setDeleteTarget(session)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete modal — top-level so it overlays the full page */}
      {deleteTarget && (
        <DeleteModal
          sessionName={deleteTarget.sessionName}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}