/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  /** Nur nach Login und bei bewusst aktiviertem Agent Edit Mode verfügbar. */
  immoCheckerAgent?: {
    getCapabilities: () => unknown;
    listScenarios: () => Array<{ id: string; name: string }>;
    getScenario: (scenarioId: string) => unknown;
    stageDraft: (draft: unknown) => unknown;
  };
}
