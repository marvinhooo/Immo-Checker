import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentDraftDialog } from './AgentDraftDialog';

describe('AgentDraftDialog', () => {
  it('zeigt einen verständlichen Fehler für ungültiges JSON und löst keinen Import aus', () => {
    const onDraftReady = vi.fn();
    render(
      <AgentDraftDialog
        open
        onClose={vi.fn()}
        onDraftReady={onDraftReady}
        initialValue="kein json"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Entwurf prüfen und übernehmen' }));

    expect(screen.getByRole('alert')).toHaveTextContent('kein valides JSON');
    expect(screen.getByLabelText('Agent-Entwurf als JSON')).toHaveAttribute('aria-invalid', 'true');
    expect(onDraftReady).not.toHaveBeenCalled();
  });

  it('setzt das Beispiel ein, validiert es und gibt nur den geprüften Draft weiter', () => {
    const onClose = vi.fn();
    const onDraftReady = vi.fn();
    render(
      <AgentDraftDialog
        open
        onClose={onClose}
        onDraftReady={onDraftReady}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Beispiel einsetzen' }));
    expect((screen.getByLabelText('Agent-Entwurf als JSON') as HTMLTextAreaElement).value)
      .toContain('immo-checker-agent-draft');

    fireEvent.click(screen.getByRole('button', { name: 'Entwurf prüfen und übernehmen' }));

    expect(onDraftReady).toHaveBeenCalledWith(expect.objectContaining({
      format: 'immo-checker-agent-draft',
      version: 1,
    }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
