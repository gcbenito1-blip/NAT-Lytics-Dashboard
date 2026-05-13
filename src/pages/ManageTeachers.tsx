import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  collection, query, where, getDocs, deleteDoc, doc, serverTimestamp, setDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, updateProfile, signOut as firebaseSignOut } from 'firebase/auth';
import type { UserProfile } from '../contexts/AuthContext';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TeacherRow extends Pick<UserProfile, 'id' | 'name' | 'email' | 'firstName' | 'lastName'> {
  createdAt?: string;
}

// Secondary Firebase app for admin-created users (preserves admin session)
let secondaryApp: FirebaseApp | null = null;

function getSecondaryAuth() {
  if (!secondaryApp) {
    const primaryApp = getApps()[0];
    if (!primaryApp) throw new Error('Primary Firebase app not initialized');
    secondaryApp = initializeApp(primaryApp.options, 'AdminCreateApp');
  }
  return getAuth(secondaryApp);
}

async function createTeacherAccount(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  role: 'teacher',
  schoolId: string
): Promise<{ error: Error | null; user?: UserProfile }> {
  const secondaryAuth = getSecondaryAuth();
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const userId = cred.user.uid;

    const profile: UserProfile = {
      id: userId,
      email: email.toLowerCase().trim(),
      role,
      firstName,
      lastName,
      name: `${firstName} ${lastName}`.trim(),
      schoolId,
    };

    await updateProfile(cred.user, { displayName: profile.name });
    await setDoc(doc(db, 'users', userId), {
      ...profile,
      createdAt: serverTimestamp(),
    });

    // Sign out from secondary auth to keep it clean
    await firebaseSignOut(secondaryAuth);
    return { error: null, user: profile };
  } catch (error) {
    // Ensure we don't leave a signed-in secondary user
    try { await firebaseSignOut(secondaryAuth); } catch { /* ignore */ }
    return { error: error as Error };
  }
}

// ── Add Teacher Modal ─────────────────────────────────────────────────────────

function AddTeacherModal({
  schoolId,
  onCreated,
  onClose,
  signUp,
}: {
  schoolId: string;
  onCreated: (teacher: TeacherRow) => void;
  onClose: () => void;
  signUp: (
    email: string, password: string, firstName: string, lastName: string,
    role: 'teacher', schoolId: string
  ) => Promise<{ error: Error | null; user?: UserProfile }>;
}) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!form.firstName || !form.lastName || !form.email || !form.password) {
      setError('All fields are required.');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    setError('');
    const { error: err, user } = await signUp(
      form.email, form.password, form.firstName, form.lastName, 'teacher', schoolId
    );
    setLoading(false);
    if (err) {
      setError(err.message || 'Failed to create account.');
      return;
    }
    if (user) {
      onCreated({ id: user.id, name: user.name, email: user.email, firstName: user.firstName, lastName: user.lastName });
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-gray-900">Add Teacher Account</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {(['firstName', 'lastName'] as const).map((k) => (
              <div key={k}>
                <label className="block text-xs font-medium text-gray-600 mb-1 capitalize">
                  {k === 'firstName' ? 'First Name' : 'Last Name'}
                </label>
                <input
                  type="text"
                  value={form[k]}
                  onChange={set(k)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={k === 'firstName' ? 'Juan' : 'Dela Cruz'}
                />
              </div>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={set('email')}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="teacher@school.edu.ph"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Temporary Password</label>
            <input
              type="password"
              value={form.password}
              onChange={set('password')}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Min. 6 characters"
            />
          </div>

          <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
            <strong>Organization ID:</strong> <span className="font-mono">{schoolId}</span>
            <br />This teacher will be linked to your school automatically.
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-60"
          >
            {loading ? 'Creating…' : 'Create Account'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete confirm ────────────────────────────────────────────────────────────

function DeleteTeacherModal({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full text-center">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
          <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-1">Remove Teacher?</h3>
        <p className="text-sm text-gray-500 mb-6">
          This will remove <span className="font-medium text-gray-800">{name}</span> from your organization. Their sessions will remain.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition">Remove</button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ManageTeachers() {
  const { user } = useAuth();
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TeacherRow | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!user?.schoolId) return;
    setLoading(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, 'users'),
          where('schoolId', '==', user.schoolId),
          where('role', '==', 'teacher')
        )
      );
      const rows: TeacherRow[] = snap.docs.map((d) => {
        const data = d.data() as UserProfile & { createdAt?: { toDate?: () => Date } };
        return {
          id: data.id || d.id,
          name: data.name,
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? '',
        };
      });
      rows.sort((a, b) => a.name.localeCompare(b.name));
      setTeachers(rows);
    } catch (e) {
      console.error('ManageTeachers load failed', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDoc(doc(db, 'users', deleteTarget.id));
      setTeachers((prev) => prev.filter((t) => t.id !== deleteTarget.id));
    } catch (e) {
      console.error('Delete teacher failed', e);
    }
    setDeleteTarget(null);
  };

  const filtered = teachers.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <header
        className="justify-between items-center mb-8 p-6 rounded-2xl text-white bg-[linear-gradient(135deg,_#3da6e2_0%,_#1480be_100%)]"
        style={{ background: 'linear-gradient(135deg, #3da6e2 0%, #1480be 100%)' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold mb-1">Manage Teachers</h1>
            <p className="text-sm opacity-90">
              Add and manage teacher accounts in your organization.
            </p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-white text-blue-700 rounded-xl font-semibold text-sm hover:bg-blue-50 transition shrink-0"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Teacher
          </button>
        </div>
      </header>

      {/* Org ID info */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
        <svg className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <p className="text-sm font-semibold text-blue-800">Your Organization ID</p>
          <p className="text-sm text-blue-700 font-mono mt-0.5">{user?.schoolId}</p>
          <p className="text-xs text-blue-600 mt-1">
            Teacher accounts created here are automatically linked to your school. You can also share this ID with teachers who self-register.
          </p>
        </div>
      </div>

      {/* Teachers table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <h2 className="text-lg font-semibold text-gray-900">
            Teachers
            <span className="ml-2 text-sm font-normal text-gray-400">({teachers.length})</span>
          </h2>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-blue-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <svg className="h-7 w-7 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <p className="text-gray-500 font-medium">
              {search ? 'No teachers match your search.' : 'No teachers yet.'}
            </p>
            {!search && (
              <button onClick={() => setShowAdd(true)} className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition">
                Add First Teacher
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-400 uppercase py-3 px-4">Teacher</th>
                  <th className="text-left text-xs font-semibold text-gray-400 uppercase py-3 px-4">Email</th>
                  <th className="text-right text-xs font-semibold text-gray-400 uppercase py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((teacher) => (
                  <tr key={teacher.id} className="hover:bg-gray-50 transition">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                          style={{ background: 'linear-gradient(135deg, #3da6e2 0%, #1480be 100%)' }}
                        >
                          {teacher.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-sm text-gray-900">{teacher.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500">{teacher.email}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setDeleteTarget(teacher)}
                        className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {showAdd && user && (
        <AddTeacherModal
          schoolId={user.schoolId}
          signUp={createTeacherAccount}
          onCreated={(t) => {
            setTeachers((prev) => [...prev, t].sort((a, b) => a.name.localeCompare(b.name)));
            setShowAdd(false);
          }}
          onClose={() => setShowAdd(false)}
        />
      )}

      {deleteTarget && (
        <DeleteTeacherModal
          name={deleteTarget.name}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
