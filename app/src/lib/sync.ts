import { supabase } from './supabase';
import type { Scenario } from '../engine/types';
import { validateScenario } from './io';
import { createAgentSnapshot } from '../agent/snapshot';

export interface RemoteAgentDraft {
  id: string;
  data: unknown;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

function isMissingAnalysisColumn(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST204'
    || error.code === '42703'
    || Boolean(error.message?.includes("'analysis' column"));
}

export async function pullScenarios(userId: string): Promise<Scenario[]> {
  const { data, error } = await supabase
    .from('scenarios')
    .select('id, data')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(`Sync-Pull fehlgeschlagen: ${error.message}`);

  const valid: Scenario[] = [];
  for (const row of data ?? []) {
    try {
      valid.push(validateScenario(row.data));
    } catch {
      // skip invalid rows
    }
  }
  return valid;
}

export async function pushScenarios(userId: string, scenarios: Scenario[]): Promise<void> {
  if (scenarios.length === 0) return;

  const rows = scenarios.map((s) => {
    const snapshot = createAgentSnapshot(s);
    return {
      id: s.id,
      user_id: userId,
      data: s,
      analysis: {
        generatedAt: snapshot.generatedAt,
        completeness: snapshot.completeness,
        ...snapshot.analysis,
      },
      updated_at: new Date().toISOString(),
    };
  });

  const { error } = await supabase
    .from('scenarios')
    .upsert(rows, { onConflict: 'user_id,id' });

  if (error && isMissingAnalysisColumn(error)) {
    const legacyRows = rows.map(({ analysis, ...row }) => {
      void analysis;
      return row;
    });
    const { error: legacyError } = await supabase
      .from('scenarios')
      .upsert(legacyRows, { onConflict: 'user_id,id' });
    if (legacyError) throw new Error(`Sync-Push fehlgeschlagen: ${legacyError.message}`);
    return;
  }
  if (error) throw new Error(`Sync-Push fehlgeschlagen: ${error.message}`);
}

export async function pushSingleScenario(userId: string, scenario: Scenario): Promise<void> {
  const snapshot = createAgentSnapshot(scenario);
  const row = {
    id: scenario.id,
    user_id: userId,
    data: scenario,
    analysis: {
      generatedAt: snapshot.generatedAt,
      completeness: snapshot.completeness,
      ...snapshot.analysis,
    },
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from('scenarios')
    .upsert(row, { onConflict: 'user_id,id' });

  if (error && isMissingAnalysisColumn(error)) {
    const { analysis, ...legacyRow } = row;
    void analysis;
    const { error: legacyError } = await supabase
      .from('scenarios')
      .upsert(legacyRow, { onConflict: 'user_id,id' });
    if (legacyError) throw new Error(`Sync-Push fehlgeschlagen: ${legacyError.message}`);
    return;
  }
  if (error) throw new Error(`Sync-Push fehlgeschlagen: ${error.message}`);
}

export async function deleteRemoteScenario(userId: string, scenarioId: string): Promise<void> {
  const { error } = await supabase
    .from('scenarios')
    .delete()
    .eq('user_id', userId)
    .eq('id', scenarioId);

  if (error) throw new Error(`Sync-Delete fehlgeschlagen: ${error.message}`);
}

export async function pullAgentDrafts(userId: string): Promise<RemoteAgentDraft[]> {
  const { data, error } = await supabase
    .from('scenario_drafts')
    .select('id, data, revision, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (error) throw new Error(`Agent-Drafts konnten nicht geladen werden: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    data: row.data,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function deleteRemoteAgentDraft(userId: string, draftId: string): Promise<void> {
  const { error } = await supabase
    .from('scenario_drafts')
    .delete()
    .eq('user_id', userId)
    .eq('id', draftId);

  if (error) throw new Error(`Agent-Draft konnte nicht entfernt werden: ${error.message}`);
}
