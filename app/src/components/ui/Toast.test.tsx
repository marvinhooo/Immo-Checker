import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toast } from './Toast';

describe('Toast', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('keeps persistent warnings visible until they are dismissed manually', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(
      <Toast
        message="Cloud-Warnung"
        onDismiss={onDismiss}
        durationMs={null}
        tone="warning"
      />,
    );

    act(() => vi.advanceTimersByTime(60_000));
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Cloud-Warnung');

    fireEvent.click(screen.getByRole('button', { name: 'Hinweis schließen' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
