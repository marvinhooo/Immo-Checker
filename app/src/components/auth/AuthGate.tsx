import { useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';
import { ResetPasswordForm } from './ResetPasswordForm';
import { App } from '../../app/App';

export function AuthGate() {
  const initialize = useAuthStore((s) => s.initialize);
  const isLoading = useAuthStore((s) => s.isLoading);
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const authView = useAuthStore((s) => s.authView);
  const signOut = useAuthStore((s) => s.signOut);

  useEffect(() => {
    const unsubscribe = initialize();
    return unsubscribe;
  }, [initialize]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50/50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="h-8 w-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-medium text-slate-500">Wird geladen...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50/50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Immobilien-Investment-Checker
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Kapitalanlage-Rechner für private Anleger
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            {authView === 'login' && <LoginForm />}
            {authView === 'register' && <RegisterForm />}
            {(authView === 'reset' || authView === 'set-password') && <ResetPasswordForm />}
          </div>
        </div>
      </div>
    );
  }

  if (authView === 'set-password') {
    return (
      <div className="min-h-screen bg-slate-50/50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <ResetPasswordForm />
          </div>
        </div>
      </div>
    );
  }

  if (profile && !profile.approved) {
    return (
      <div className="min-h-screen bg-slate-50/50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="text-5xl">⏳</div>
          <h2 className="text-xl font-bold text-slate-900">Warten auf Freigabe</h2>
          <p className="text-sm text-slate-600">
            Ihr Account wurde erstellt. Ein Administrator muss Ihren Zugang erst genehmigen.
            Bitte haben Sie etwas Geduld.
          </p>
          <button
            onClick={signOut}
            className="text-sm font-bold text-slate-500 hover:text-slate-800 transition cursor-pointer"
          >
            Abmelden
          </button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-50/50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="h-8 w-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-medium text-slate-500">Profil wird geladen...</p>
        </div>
      </div>
    );
  }

  return <App />;
}
