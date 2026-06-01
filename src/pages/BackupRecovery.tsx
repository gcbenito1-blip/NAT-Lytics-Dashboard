import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getTeacherSessions, createSession, type PredictionSession } from '../services/sessionService';
import { toast } from 'react-toastify';

export function BackupRecovery() {
  const { user } = useAuth();
  const [exportLoading, setExportLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importSuccess, setImportSuccess] = useState<number | null>(null);
  const [sessionCount, setSessionCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    getTeacherSessions(user.id).then(sessions => setSessionCount(sessions.length)).catch(() => setSessionCount(0));
  }, [user]);

  const handleExport = async () => {
    if (!user) return;
    setExportLoading(true);
    try {
      const sessions = await getTeacherSessions(user.id);
      const data = JSON.stringify(sessions, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nat-lytics-sessions-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${sessions.length} session${sessions.length !== 1 ? 's' : ''} successfully.`);
    } catch (e) {
      toast.error('Failed to export sessions.');
    } finally {
      setExportLoading(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!user || !file) return;
    setImportLoading(true);
    setImportSuccess(null);
    try {
      const text = await file.text();
      const sessions: PredictionSession[] = JSON.parse(text);
      if (!Array.isArray(sessions)) {
        throw new Error('Invalid file format: expected an array of sessions.');
      }
      let imported = 0;
      for (const session of sessions) {
        const { id: _, ...sessionData } = session;
        await createSession({
          ...sessionData,
          teacherId: user.id,
          rawData: [],
        });
        imported++;
      }
      setImportSuccess(imported);
      setSessionCount(c => c + imported);
      toast.success(`Imported ${imported} session${imported !== 1 ? 's' : ''} successfully.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to import sessions.';
      toast.error(msg);
    } finally {
      setImportLoading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <header className="rounded-2xl p-6 text-white" style={{ background: 'linear-gradient(135deg, #3da6e2 0%, #1480be 100%)' }}>
        <h1 className="text-2xl font-bold mb-1">Backup and Recovery</h1>
        <p className="text-sm opacity-90">Download and restore your prediction sessions.</p>
      </header>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Export Sessions</h2>
          <p className="text-sm text-gray-500 mb-4">
            Download all your saved prediction sessions as a JSON file to your computer.
          </p>
          <button
            onClick={handleExport}
            disabled={exportLoading || sessionCount === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition disabled:opacity-60"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {exportLoading ? 'Exporting...' : sessionCount === 0 ? 'No Sessions to Download' : 'Download Sessions (.json)'}
          </button>
        </div>

        <div className="border-t border-gray-100 pt-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Import Sessions</h2>
          <p className="text-sm text-gray-500 mb-4">
            Restore sessions from a previously exported JSON file.
          </p>
          <label className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg font-medium text-sm hover:bg-green-700 transition cursor-pointer disabled:opacity-60">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88 7.902V11a5 5 0 1010 0v7.902A4 4 0 0113 16h-6z" />
            </svg>
            {importLoading ? 'Importing...' : 'Import Sessions (.json)'}
            <input type="file" accept=".json" onChange={handleImport} disabled={importLoading} className="hidden" />
          </label>
          {importSuccess !== null && (
            <p className="mt-3 text-sm text-green-600">Successfully imported {importSuccess} session{importSuccess !== 1 ? 's' : ''}.</p>
          )}
        </div>
      </div>
    </div>
  );
}