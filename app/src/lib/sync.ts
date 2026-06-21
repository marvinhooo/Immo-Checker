import { supabase } from './supabase';
import type { Scenario } from '../engine/types';
import { validateScenario } from './io';

export async function pullScenarios(userId: string): Promise<Scenario[]> {
  const { data, error } = await supabase
    .from('scenarios')
    .select('id, data')
    .eq('user_id', userId);

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

  const rows = scenarios.map((s) => ({
    id: s.id,
    user_id: userId,
    data: s,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('scenarios')
    .upsert(rows, { onConflict: 'user_id,id' });

  if (error) throw new Error(`Sync-Push fehlgeschlagen: ${error.message}`);
}

export async function pushSingleScenario(userId: string, scenario: Scenario): Promise<void> {
  const { error } = await supabase
    .from('scenarios')
    .upsert(
      { id: scenario.id, user_id: userId, data: scenario, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,id' },
    );

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
