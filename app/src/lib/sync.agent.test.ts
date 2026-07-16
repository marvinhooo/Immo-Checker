import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultScenario } from '../engine/defaults';

const mocks = vi.hoisted(() => {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.order = vi.fn(() => query);
  query.limit = vi.fn();
  query.delete = vi.fn(() => query);
  return { query, from: vi.fn(() => query) };
});

vi.mock('./supabase', () => ({
  supabase: { from: mocks.from },
}));

import { deleteRemoteAgentDraft, pullAgentDrafts, pullScenarios } from './sync';

describe('kontogebundene Agent-Draft-Synchronisation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.select.mockImplementation(() => mocks.query);
    mocks.query.eq.mockImplementation(() => mocks.query);
    mocks.query.order.mockImplementation(() => mocks.query);
    mocks.query.delete.mockImplementation(() => mocks.query);
  });

  it('lädt nur eigene Draft-Zeilen und normalisiert Datenbankspalten', async () => {
    mocks.query.limit.mockResolvedValue({
      data: [{
        id: 'draft-1',
        data: { format: 'immo-checker-agent-draft' },
        revision: 3,
        created_at: '2026-07-16T09:00:00.000Z',
        updated_at: '2026-07-16T10:00:00.000Z',
      }],
      error: null,
    });

    await expect(pullAgentDrafts('account-a')).resolves.toEqual([{
      id: 'draft-1',
      data: { format: 'immo-checker-agent-draft' },
      revision: 3,
      createdAt: '2026-07-16T09:00:00.000Z',
      updatedAt: '2026-07-16T10:00:00.000Z',
    }]);
    expect(mocks.from).toHaveBeenCalledWith('scenario_drafts');
    expect(mocks.query.eq).toHaveBeenCalledWith('user_id', 'account-a');
    expect(mocks.query.limit).toHaveBeenCalledWith(20);
  });

  it('begrenzt auch das Löschen explizit auf Konto und Draft-ID', async () => {
    await deleteRemoteAgentDraft('account-a', 'draft-1');

    expect(mocks.query.delete).toHaveBeenCalledOnce();
    expect(mocks.query.eq).toHaveBeenNthCalledWith(1, 'user_id', 'account-a');
    expect(mocks.query.eq).toHaveBeenNthCalledWith(2, 'id', 'draft-1');
  });

  it('meldet ungültige Cloud-Szenarien und behält gültige Zeilen', async () => {
    const first = createDefaultScenario({ name: 'Gültig A' });
    first.id = 'valid-a';
    const invalid = createDefaultScenario({ name: 'Ungültig' });
    invalid.id = 'invalid';
    invalid.objekt.miteigentumsanteilZaehler = 1001;
    invalid.objekt.miteigentumsanteilNenner = 1000;
    const second = createDefaultScenario({ name: 'Gültig B' });
    second.id = 'valid-b';

    mocks.query.order.mockResolvedValueOnce({
      data: [{ data: first }, { data: invalid }, { data: second }],
      error: null,
    });

    await expect(pullScenarios('account-a')).resolves.toEqual({
      scenarios: [first, second],
      skippedInvalidRows: 1,
    });
    expect(mocks.from).toHaveBeenCalledWith('scenarios');
    expect(mocks.query.eq).toHaveBeenCalledWith('user_id', 'account-a');
  });
});
