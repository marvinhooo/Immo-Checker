// Zentraler App-State: aktives Szenario + benannte Szenarien, persistiert in localStorage.
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Scenario } from '../engine/types';
import { createDefaultScenario } from '../engine/defaults';
import { validateScenario } from '../lib/io';

interface ScenarioState {
  active: Scenario;
  saved: Scenario[];
  /** Aktives Szenario ergonomisch und immutabel aendern (Kopie wird mutiert). */
  updateActive: (mutator: (draft: Scenario) => void) => void;
  /** Aktives Szenario komplett ersetzen. */
  setActive: (scenario: Scenario) => void;
  /** Aktives Szenario auf das Default-Szenario zuruecksetzen. */
  resetActive: () => void;
  /** Aktuelles Szenario unter (optional neuem) Namen speichern; gibt die id zurueck. */
  saveCurrent: (name?: string) => string;
  /** Gespeichertes Szenario als aktives laden. */
  loadSaved: (id: string) => void;
  /** Gespeichertes Szenario loeschen. */
  deleteSaved: (id: string) => void;
}

function safeScenario(value: unknown): Scenario | null {
  try {
    return validateScenario(value);
  } catch {
    return null;
  }
}

export const useScenarioStore = create<ScenarioState>()(
  persist(
    (set, get) => ({
      active: createDefaultScenario(),
      saved: [],

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
    }),
    {
      name: 'immo-checker-store',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ active: s.active, saved: s.saved }),
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<Pick<ScenarioState, 'active' | 'saved'>> | undefined;
        const active = safeScenario(persistedState?.active) ?? current.active;
        const seenSavedIds = new Set<string>();
        const saved = Array.isArray(persistedState?.saved)
          ? persistedState.saved.flatMap((scenario) => {
              const valid = safeScenario(scenario);
              if (!valid || seenSavedIds.has(valid.id)) return [];
              seenSavedIds.add(valid.id);
              return [valid];
            })
          : current.saved;

        return {
          ...current,
          active,
          saved,
        };
      },
    },
  ),
);
