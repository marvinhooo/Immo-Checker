import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { PwaUpdatePrompt } from './PwaUpdatePrompt';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: vi.fn(),
}));

const useRegisterSWMock = vi.mocked(useRegisterSW);

describe('PwaUpdatePrompt', () => {
  const setNeedRefresh = vi.fn();
  const setOfflineReady = vi.fn();
  const updateServiceWorker = vi.fn<() => Promise<void>>();

  beforeEach(() => {
    vi.clearAllMocks();
    updateServiceWorker.mockResolvedValue();
    useRegisterSWMock.mockReturnValue({
      needRefresh: [false, setNeedRefresh],
      offlineReady: [false, setOfflineReady],
      updateServiceWorker,
    });
  });

  it('stays hidden while no update is waiting', () => {
    render(<PwaUpdatePrompt />);

    expect(screen.queryByText('Neue Version verfügbar')).not.toBeInTheDocument();
  });

  it('lets the user activate the waiting update', async () => {
    useRegisterSWMock.mockReturnValue({
      needRefresh: [true, setNeedRefresh],
      offlineReady: [false, setOfflineReady],
      updateServiceWorker,
    });
    render(<PwaUpdatePrompt />);

    fireEvent.click(screen.getByRole('button', { name: 'Jetzt neu laden' }));

    await waitFor(() => expect(updateServiceWorker).toHaveBeenCalledWith(true));
  });

  it('allows deferring the update without reloading', () => {
    useRegisterSWMock.mockReturnValue({
      needRefresh: [true, setNeedRefresh],
      offlineReady: [false, setOfflineReady],
      updateServiceWorker,
    });
    render(<PwaUpdatePrompt />);

    fireEvent.click(screen.getByRole('button', { name: 'Später' }));

    expect(setNeedRefresh).toHaveBeenCalledWith(false);
    expect(updateServiceWorker).not.toHaveBeenCalled();
  });

  it('shows a recoverable error if activation fails', async () => {
    updateServiceWorker.mockRejectedValueOnce(new Error('update failed'));
    useRegisterSWMock.mockReturnValue({
      needRefresh: [true, setNeedRefresh],
      offlineReady: [false, setOfflineReady],
      updateServiceWorker,
    });
    render(<PwaUpdatePrompt />);

    fireEvent.click(screen.getByRole('button', { name: 'Jetzt neu laden' }));

    expect(await screen.findByText('Aktualisierung fehlgeschlagen. Bitte lade die Seite manuell neu.')).toBeVisible();
  });
});
