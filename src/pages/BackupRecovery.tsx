import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getTeacherSessions, createSession, type PredictionSession } from '../services/sessionService';
import { toast } from 'react-toastify';

function WarningModal({ message, onCancel }: { message: string; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-yellow-100 mx-auto mb-4">
          <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5 12a7 7 0 1114 0 7 7 0 01-14 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-gray-900 text-center mb-2">Invalid File</h3>
        <p className="text-sm text-gray-500 text-center mb-6">{message}</p>
        <button
          onClick={onCancel}
          className="w-full py-2.5 rounded-xl bg-yellow-600 text-white text-sm font-medium hover:bg-yellow-700 transition"
        >
          OK
        </button>
      </div>
    </div>
  );
}

function isValidSession(obj: unknown): boolean {
  if (typeof obj !== 'object' || obj === null) return false;
  const s = obj as Record<string, unknown>;

  if (typeof s.sessionName !== 'string') return false;
  if (typeof s.fileName !== 'string') return false;
  if (typeof s.createdAt !== 'string') return false;
  if (typeof s.averageScore !== 'number') return false;
  if (!Array.isArray(s.predictions)) return false;

  if (s.predictions.length > 0) {
    const p = s.predictions[0] as Record<string, unknown>;
    if (typeof p.learnerID !== 'string') return false;
    if (typeof p.prediction !== 'number') return false;
    if (typeof p.pass_probability !== 'number') return false;
    if (!Array.isArray(p.probability_breakdown)) return false;
  }

  return true;
}

export function BackupRecovery() {
  const { user } = useAuth();
  const [exportLoading, setExportLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importSuccess, setImportSuccess] = useState<number | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    getTeacherSessions(user.id)
      .then((sessions) => setSessionCount(sessions.length))
      .catch(() => setSessionCount(0));
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
    } catch {
      toast.error('Failed to export sessions.');
    } finally {
      setExportLoading(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const resetInput = () => {
      if (importInputRef.current) importInputRef.current.value = '';
    };

    if (!user || !file) return;

    // 1. Extension check
    if (!file.name.toLowerCase().endsWith('.json')) {
      setWarningMessage('Please select a valid .json file to import.');
      resetInput();
      return;
    }

    // 2. Parse check
    let parsed: unknown;
    try {
      const text = await file.text();
      parsed = JSON.parse(text);
    } catch {
      setWarningMessage('The selected file is not a valid JSON file.');
      resetInput();
      return;
    }

    // 3. Array check
    if (!Array.isArray(parsed)) {
      setWarningMessage('Invalid backup file: expected an array of sessions.');
      resetInput();
      return;
    }

    // 4. Empty array check
    if (parsed.length === 0) {
      setWarningMessage('The backup file contains no sessions to import.');
      resetInput();
      return;
    }

    // 5. Structure check
    const invalidIndex = parsed.findIndex((item) => !isValidSession(item));
    if (invalidIndex !== -1) {
      setWarningMessage(
        `Invalid backup file: item at index ${invalidIndex} is missing required fields. Make sure this file was exported from NAT-Lytics.`
      );
      resetInput();
      return;
    }

    // All checks passed — proceed with import
    setImportLoading(true);
    setImportSuccess(null);
    try {
      const sessions = parsed as PredictionSession[];
      let imported = 0;
      for (const session of sessions) {
        const { id: _, teacherId: __, totalPredictions: ___, passedCount: ____, ...sessionData } = session as any;
        await createSession({
          ...sessionData,
          teacherId: user.id,
          rawData: [],
        });
        imported++;
      }
      setImportSuccess(imported);
      setSessionCount((c) => c + imported);
      toast.success(`Imported ${imported} session${imported !== 1 ? 's' : ''} successfully.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to import sessions.';
      toast.error(msg);
    } finally {
      setImportLoading(false);
      resetInput();
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <header
        className="rounded-2xl p-6 text-white"
        style={{ background: 'linear-gradient(135deg, #3da6e2 0%, #1480be 100%)' }}
      >
        <h1 className="text-2xl font-bold mb-1">Backup and Recovery</h1>
        <p className="text-sm opacity-90">Backup and restore your prediction sessions.</p>
      </header>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6 flex flex-col">
        {/* Export */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Export Sessions</h2>
          <p className="text-sm text-gray-500 mb-4">
            Backup all your saved prediction sessions as a JSON file to your computer.
          </p>
          <button
            onClick={handleExport}
            disabled={exportLoading || sessionCount === 0}
            className="cursor-pointer flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition disabled:opacity-60"
          >
            <span className="material-icons-round">cloud_download</span>
            {exportLoading
              ? 'Exporting...'
              : sessionCount === 0
                ? 'No Sessions to Backup'
                : 'Backup Sessions (.json)'}
          </button>
        </div>

        {/* Import */}
        <div className="border-t border-gray-100 pt-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Import Sessions</h2>
          <p className="text-sm text-gray-500 mb-4">
            Restore sessions from a previously exported JSON file.
          </p>

          <button
            onClick={() => !importLoading && importInputRef.current?.click()}
            disabled={importLoading}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg font-medium text-sm hover:bg-green-700 cursor-pointer transition disabled:opacity-60"
          >
            <span className="material-icons-round">cloud_upload</span>
            {importLoading ? 'Importing...' : 'Import Sessions (.json)'}
          </button>

          <input
            ref={importInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />

          {importSuccess !== null && (
            <p className="mt-3 text-sm text-green-600">
              Successfully imported {importSuccess} session{importSuccess !== 1 ? 's' : ''}.
            </p>
          )}
        </div>
      </div>

      {warningMessage && (
        <WarningModal message={warningMessage} onCancel={() => setWarningMessage(null)} />
      )}
    </div>
  );
}