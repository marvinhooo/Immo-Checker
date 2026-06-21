import { useState } from 'react';
import { useAuthStore } from '../../store/authStore';

export function LoginForm() {
  const signIn = useAuthStore((s) => s.signIn);
  const setAuthView = useAuthStore((s) => s.setAuthView);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const err = await signIn(email, password);
    setLoading(false);
    if (err) setError(err);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-xl font-bold text-slate-900">Anmelden</h2>

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

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 py-2.5 text-sm font-bold text-white transition disabled:opacity-50 cursor-pointer"
      >
        {loading ? 'Wird angemeldet...' : 'Anmelden'}
      </button>

      <div className="flex justify-between text-xs font-semibold">
        <button
          type="button"
          onClick={() => setAuthView('reset')}
          className="text-blue-600 hover:text-blue-800 transition cursor-pointer"
        >
          Passwort vergessen?
        </button>
        <button
          type="button"
          onClick={() => setAuthView('register')}
          className="text-blue-600 hover:text-blue-800 transition cursor-pointer"
        >
          Registrieren
        </button>
      </div>
    </form>
  );
}
