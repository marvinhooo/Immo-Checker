import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export function PwaUpdatePrompt() {
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateFailed, setUpdateFailed] = useState(false);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });

  if (!needRefresh) return null;

  const handleUpdate = async () => {
    setIsUpdating(true);
    setUpdateFailed(false);
    try {
      await updateServiceWorker(true);
    } catch {
      setUpdateFailed(true);
      setIsUpdating(false);
    }
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed inset-x-4 bottom-4 z-[100] sm:left-auto sm:max-w-sm"
    >
      <div className="rounded-2xl border border-blue-200 bg-white p-4 shadow-2xl shadow-slate-900/20">
        <div className="text-sm font-bold text-slate-900">Neue Version verfügbar</div>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          Speichere offene Eingaben und lade danach die aktuelle Version der App.
        </p>
        {updateFailed && (
          <p className="mt-2 text-xs font-semibold text-rose-700">
            Aktualisierung fehlgeschlagen. Bitte lade die Seite manuell neu.
          </p>
        )}
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setNeedRefresh(false)}
            disabled={isUpdating}
            className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Später
          </button>
          <button
            type="button"
            onClick={() => void handleUpdate()}
            disabled={isUpdating}
            className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70"
          >
            {isUpdating ? 'Aktualisiere …' : 'Jetzt neu laden'}
          </button>
        </div>
      </div>
    </div>
  );
}
