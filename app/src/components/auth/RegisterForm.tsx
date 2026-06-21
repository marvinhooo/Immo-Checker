import { useState } from 'react';
import { useAuthStore } from '../../store/authStore';

export function RegisterForm() {
  const signUp = useAuthStore((s) => s.signUp);
  const setAuthView = useAuthStore((s) => s.setAuthView);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== passwordConfirm) {
      setError('Passwörter stimmen nicht überein.');
      return;
    }

    setLoading(true);
    const err = await signUp(email, password);
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
        <div className="text-4xl">✉️</div>
        <h2 className="text-xl font-bold text-slate-900">Bestätigungs-E-Mail gesendet</h2>
        <p className="text-sm text-slate-600">
          Bitte bestätigen Sie Ihre E-Mail-Adresse über den Link in der Mail.
          Nach der Bestätigung muss ein Admin Ihren Account freischalten.
        </p>
        <button
          type="button"
          onClick={() => setAuthView('login')}
          className="text-sm font-bold text-blue-600 hover:text-blue-800 transition cursor-pointer"
        >
          Zurück zum Login
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-xl font-bold text-slate-900">Registrieren</h2>

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

      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Passwort</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 focus:outline-hidden"
          placeholder="Mindestens 6 Zeichen"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Passwort bestätigen</label>
        <input
          type="password"
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          required
          minLength={6}
          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 focus:outline-hidden"
          placeholder="Passwort wiederholen"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 py-2.5 text-sm font-bold text-white transition disabled:opacity-50 cursor-pointer"
      >
        {loading ? 'Wird registriert...' : 'Registrieren'}
      </button>

      <div className="text-center">
        <button
          type="button"
          onClick={() => setAuthView('login')}
          className="text-xs font-bold text-blue-600 hover:text-blue-800 transition cursor-pointer"
        >
          Bereits registriert? Anmelden
        </button>
      </div>
    </form>
  );
}
