import { create } from 'zustand';
import type { Scenario } from '../engine/types';
import { createDefaultScenario } from '../engine/defaults';
import { pullScenarios, pushSingleScenario, deleteRemoteScenario } from '../lib/sync';

interface ScenarioState {
  ownerUserId: string | null;
  active: Scenario;
  saved: Scenario[];
  isSyncing: boolean;
  syncError: string | null;
  updateActive: (mutator: (draft: Scenario) => void) => void;
  setActive: (scenario: Scenario) => void;
  resetActive: () => void;
  saveCurrent: (name?: string) => string;
  loadSaved: (id: string) => void;
  deleteSaved: (id: string) => void;
  loadFromCloud: (userId: string) => Promise<void>;
  setSaved: (scenarios: Scenario[]) => void;
}

export const useScenarioStore = create<ScenarioState>()((set, get) => ({
  ownerUserId: null,
  active: createDefaultScenario(),
  saved: [],
  isSyncing: false,
  syncError: null,

  updateActive: (mutator) =>
    set((s) => {
      const next = structuredClone(s.active);
      mutator(next);
      return { active: next };
    }),

  setActive: (scenario) => set({ active: structuredClone(scenario) }),

  resetActive: () => set({ active: createDefaultScenario() }),

  saveCurrent: (name) => {
    const current = structuredClone(get().active);
    if (name) current.name = name;
    const rest = get().saved.filter((x) => x.id !== current.id);
    set({ saved: [...rest, current] });
    return current.id;
  },

  loadSaved: (id) => {
    const found = get().saved.find((x) => x.id === id);
    if (found) set({ active: structuredClone(found) });
  },

  deleteSaved: (id) =>
    set((s) => ({ saved: s.saved.filter((x) => x.id !== id) })),

  loadFromCloud: async (userId) => {
    set({
      ownerUserId: userId,
      active: createDefaultScenario(),
      saved: [],
      isSyncing: true,
      syncError: null,
    });
    try {
      const scenarios = await pullScenarios(userId);
      if (get().ownerUserId !== userId) return;
      set({
        active: scenarios[0] ? structuredClone(scenarios[0]) : createDefaultScenario(),
        saved: scenarios,
        isSyncing: false,
      });
    } catch (e) {
      if (get().ownerUserId !== userId) return;
      set({
        active: createDefaultScenario(),
        saved: [],
        isSyncing: false,
        syncError: (e as Error).message,
      });
    }
  },

  setSaved: (scenarios) => set({ saved: scenarios }),
}));

export function useSyncedSave(userId: string | undefined) {
  const saveCurrent = useScenarioStore((s) => s.saveCurrent);
  const store = useScenarioStore;

  return async (name?: string) => {
    const id = saveCurrent(name);
    if (userId) {
      const saved = store.getState().saved.find((s) => s.id === id);
      if (saved) {
        try {
          await pushSingleScenario(userId, saved);
        } catch {
          // silent — user sees data in-memory, next full sync will retry
        }
      }
    }
    return id;
  };
}

export function useSyncedDelete(userId: string | undefined) {
  const deleteSaved = useScenarioStore((s) => s.deleteSaved);

  return async (id: string) => {
    deleteSaved(id);
    if (userId) {
      try {
        await deleteRemoteScenario(userId, id);
      } catch {
        // silent
      }
    }
  };
}
