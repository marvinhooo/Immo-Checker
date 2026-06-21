import { useState } from 'react';
import { useAuthStore } from '../../store/authStore';

export function ResetPasswordForm() {
  const resetPassword = useAuthStore((s) => s.resetPassword);
  const updatePassword = useAuthStore((s) => s.updatePassword);
  const authView = useAuthStore((s) => s.authView);
  const setAuthView = useAuthStore((s) => s.setAuthView);
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  if (authView === 'set-password') {
    const handleSetPassword = async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setLoading(true);
      const err = await updatePassword(newPassword);
      setLoading(false);
      if (err) {
        setError(err);
      } else {
        setAuthView('login');
      }
    };

    return (
      <form onSubmit={handleSetPassword} className="space-y-4">
        <h2 className="text-xl font-bold text-slate-900">Neues Passwort setzen</h2>

        {error && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Neues Passwort</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={6}
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 focus:outline-hidden"
            placeholder="Mindestens 6 Zeichen"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 py-2.5 text-sm font-bold text-white transition disabled:opacity-50 cursor-pointer"
        >
          {loading ? 'Wird gespeichert...' : 'Passwort speichern'}
        </button>
      </form>
    );
  }

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const err = await resetPassword(email);
    setLoading(false);
    if (err) {
      setError(err);
    } else {
      setSuccess(true);
    }
  };

  if (success) {
    return (
      <div className="space-y-4 text-center">
        <div className="text-4xl">📧</div>
        <h2 className="text-xl font-bold text-slate-900">E-Mail gesendet</h2>
        <p className="text-sm text-slate-600">
          Falls ein Account mit dieser E-Mail existiert, erhalten Sie einen Link zum Zurücksetzen.
        </p>
        <button
          type="button"
          onClick={() => { setSuccess(false); setAuthView('login'); }}
          className="text-sm font-bold text-blue-600 hover:text-blue-800 transition cursor-pointer"
        >
          Zurück zum Login
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleReset} className="space-y-4">
      <h2 className="text-xl font-bold text-slate-900">Passwort zurücksetzen</h2>

      {error && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">E-Mail</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 focus:outline-hidden"
          placeholder="name@beispiel.de"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 py-2.5 text-sm font-bold text-white transition disabled:opacity-50 cursor-pointer"
      >
        {loading ? 'Wird gesendet...' : 'Link senden'}
      </button>

      <div className="text-center">
        <button
          type="button"
          onClick={() => setAuthView('login')}
          className="text-xs font-bold text-blue-600 hover:text-blue-800 transition cursor-pointer"
        >
          Zurück zum Login
        </button>
      </div>
    </form>
  );
}
