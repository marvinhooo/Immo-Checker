import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AgentReview } from '../../engine/types';
import { AgentEditProvider } from './AgentEditContext';
import { AgentReviewPanel } from './AgentReviewPanel';

const review: AgentReview = {
  version: 1,
  updatedAt: '2026-07-16T12:00:00.000Z',
  sources: [{
    id: 'expose',
    kind: 'pdf',
    label: 'Expose.pdf',
    url: 'https://example.test/expose.pdf',
  }],
  fields: {
    '/objekt/kaufpreis': {
      status: 'uncertain',
      origin: 'extracted',
      required: true,
      confidence: 0.82,
      reason: 'Im Dokument gefunden, bitte gegenprüfen.',
      evidence: [{
        sourceId: 'expose',
        page: 2,
        excerpt: 'Kaufpreis 275.000 EUR',
      }],
    },
    '/objekt/wohnflaeche': {
      status: 'conflict',
      origin: 'inferred',
      required: true,
      reason: 'Exposé und Grundriss nennen unterschiedliche Werte.',
      evidence: [],
    },
    '/finanzierung/sollzinsPct': {
      status: 'missing',
      origin: 'assumption',
      required: true,
      reason: 'Aktuell wird der App-Standard verwendet.',
      evidence: [],
    },
  },
};

function renderPanel(overrides: { enabled?: boolean } = {}) {
  const onEnabledChange = vi.fn();
  const onConfirmField = vi.fn();
  const onNavigateToField = vi.fn();
  render(
    <AgentEditProvider
      enabled={overrides.enabled ?? true}
      review={review}
      onEnabledChange={onEnabledChange}
      onConfirmField={onConfirmField}
      onNavigateToField={onNavigateToField}
    >
      <AgentReviewPanel />
    </AgentEditProvider>,
  );
  return { onEnabledChange, onConfirmField, onNavigateToField };
}

describe('AgentReviewPanel', () => {
  it('zeigt fehlende, unsichere und widersprüchliche Felder ausdrücklich', () => {
    renderPanel();

    expect(screen.getByText('Fehlt')).toBeInTheDocument();
    expect(screen.getByText('Bitte prüfen')).toBeInTheDocument();
    expect(screen.getByText('Widerspruch')).toBeInTheDocument();
    expect(screen.getByText('1 fehlen')).toBeInTheDocument();
    expect(screen.getByText('1 prüfen')).toBeInTheDocument();
    expect(screen.getByText('1 Widersprüche')).toBeInTheDocument();
  });

  it('delegiert Modus, Navigation und Bestätigung ausschließlich über Callbacks', () => {
    const callbacks = renderPanel();

    fireEvent.click(screen.getByRole('switch', { name: 'Agent Edit Mode' }));
    expect(callbacks.onEnabledChange).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: 'Zum Eingabebereich Kaufpreis' }));
    expect(callbacks.onNavigateToField).toHaveBeenCalledWith('/objekt/kaufpreis', 'objekt');

    fireEvent.click(screen.getByRole('button', { name: 'Kaufpreis als geprüft markieren' }));
    expect(callbacks.onConfirmField).toHaveBeenCalledWith('/objekt/kaufpreis');
  });

  it('stellt Quellen und Belege über einen zugänglichen aufklappbaren Bereich bereit', () => {
    renderPanel();

    const summary = screen.getByText('Quellen & Belege (1)');
    expect(summary.tagName).toBe('SUMMARY');
    expect(summary.closest('details')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Expose.pdf' })).toHaveAttribute(
      'href',
      'https://example.test/expose.pdf',
    );
    expect(screen.getByText('Kaufpreis 275.000 EUR')).toBeInTheDocument();
  });
});
