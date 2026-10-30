import { describe, expect, it, vi } from 'vitest';
import { useWorkbenchBootstrap } from '@/composables/useWorkbenchBootstrap';
import type { MonacoWorkbenchService, WorkbenchMountHandle } from '@/services/monacoWorkbenchService';

describe('composables/useWorkbenchBootstrap', () => {
  it('initializes with isReady false, mounts workbench and disposes properly', async () => {
    const mockDispose = vi.fn();
    const mockHandle: WorkbenchMountHandle = { dispose: mockDispose };
    const mockMount = vi.fn().mockResolvedValue(mockHandle);
    const mockService = { mountWorkbench: mockMount } as unknown as MonacoWorkbenchService;

    const { isReady, initWorkbench, disposeWorkbench } = useWorkbenchBootstrap(mockService);

    expect(isReady.value).toBe(false);

    const container = document.createElement('div');
    const handle = await initWorkbench(container);

    expect(mockMount).toHaveBeenCalledWith(container);
    expect(handle).toBe(mockHandle);
    expect(isReady.value).toBe(true);

    disposeWorkbench();
    expect(mockDispose).toHaveBeenCalledTimes(1);
    expect(isReady.value).toBe(false);
  });
});
