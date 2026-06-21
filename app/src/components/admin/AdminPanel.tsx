import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

interface AdminUser {
  user_id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  is_admin: boolean;
  approved: boolean;
  scenario_count: number;
}

interface AdminPanelProps {
  onClose: () => void;
}

export function AdminPanel({ onClose }: AdminPanelProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setError(null);
    const { data, error: err } = await supabase.rpc('admin_list_users');
    if (err) {
      setError(err.message);
    } else {
      setUsers(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleApprove = async (userId: string) => {
    setActionLoading(userId);
    const { error: err } = await supabase
      .from('profiles')
      .update({ approved: true })
      .eq('id', userId);
    if (err) setError(err.message);
    else await loadUsers();
    setActionLoading(null);
  };

  const handleReject = async (userId: string) => {
    setActionLoading(userId);
    const { error: err } = await supabase
      .from('profiles')
      .update({ approved: false })
      .eq('id', userId);
    if (err) setError(err.message);
    else await loadUsers();
    setActionLoading(null);
  };

  const handleDelete = async (userId: string, email: string) => {
    if (!confirm(`User "${email}" wirklich löschen? Alle Szenarien werden ebenfalls gelöscht.`)) return;
    setActionLoading(userId);
    const { error: err } = await supabase.rpc('admin_delete_user', { target_user_id: userId });
    if (err) setError(err.message);
    else await loadUsers();
    setActionLoading(null);
  };

  const handleResetPassword = async (email: string) => {
    if (!confirm(`Passwort-Reset-Mail an "${email}" senden?`)) return;
    const redirectTo = window.location.origin + (import.meta.env.BASE_URL || '/');
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (err) {
      setError(err.message);
    } else {
      alert(`Passwort-Reset-Mail an "${email}" gesendet.`);
    }
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 pt-16 overflow-y-auto">
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Admin-Verwaltung</h2>
          <button
            onClick={onClose}
            className="text-sm font-semibold text-slate-500 hover:text-slate-800 transition cursor-pointer"
          >
            Schließen
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-8">
              <div className="h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-slate-500 mt-2">Lade User-Liste...</p>
            </div>
          ) : users.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">Keine User gefunden.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className="py-2 pr-4 text-xs font-bold uppercase tracking-wider text-slate-400">E-Mail</th>
                    <th className="py-2 pr-4 text-xs font-bold uppercase tracking-wider text-slate-400">Registriert</th>
                    <th className="py-2 pr-4 text-xs font-bold uppercase tracking-wider text-slate-400">Letzter Login</th>
                    <th className="py-2 pr-4 text-xs font-bold uppercase tracking-wider text-slate-400 text-center">Szenarien</th>
                    <th className="py-2 pr-4 text-xs font-bold uppercase tracking-wider text-slate-400">Status</th>
                    <th className="py-2 text-xs font-bold uppercase tracking-wider text-slate-400">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.user_id} className="border-b border-slate-100 last:border-0">
                      <td className="py-3 pr-4 font-medium text-slate-800">
                        {u.email}
                        {u.is_admin && (
                          <span className="ml-1.5 text-[10px] font-bold uppercase bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                            Admin
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-slate-500">{formatDate(u.created_at)}</td>
                      <td className="py-3 pr-4 text-slate-500">{formatDate(u.last_sign_in_at)}</td>
                      <td className="py-3 pr-4 text-center text-slate-500">{u.scenario_count}</td>
                      <td className="py-3 pr-4">
                        {u.approved ? (
                          <span className="text-[11px] font-bold uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                            Genehmigt
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold uppercase text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                            Wartend
                          </span>
                        )}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {!u.approved && (
                            <button
                              onClick={() => handleApprove(u.user_id)}
                              disabled={actionLoading === u.user_id}
                              className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-800 transition cursor-pointer disabled:opacity-50"
                            >
                              Genehmigen
                            </button>
                          )}
                          {u.approved && !u.is_admin && (
                            <button
                              onClick={() => handleReject(u.user_id)}
                              disabled={actionLoading === u.user_id}
                              className="text-[11px] font-semibold text-amber-600 hover:text-amber-800 transition cursor-pointer disabled:opacity-50"
                            >
                              Sperren
                            </button>
                          )}
                          <button
                            onClick={() => handleResetPassword(u.email)}
                            className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition cursor-pointer"
                          >
                            PW-Reset
                          </button>
                          {!u.is_admin && (
                            <button
                              onClick={() => handleDelete(u.user_id, u.email)}
                              disabled={actionLoading === u.user_id}
                              className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 transition cursor-pointer disabled:opacity-50"
                            >
                              Löschen
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
