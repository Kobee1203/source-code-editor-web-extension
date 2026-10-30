import { type Ref, ref } from 'vue';
import { MonacoWorkbenchService, type WorkbenchMountHandle } from '@/services/monacoWorkbenchService';

export interface WorkbenchBootstrapState {
  isReady: Ref<boolean>;
  initWorkbench: (container: HTMLElement) => Promise<WorkbenchMountHandle>;
  disposeWorkbench: () => void;
}

export function useWorkbenchBootstrap(
  monacoService: MonacoWorkbenchService = new MonacoWorkbenchService(),
): WorkbenchBootstrapState {
  const isReady = ref<boolean>(false);
  let handle: WorkbenchMountHandle | null = null;

  async function initWorkbench(container: HTMLElement): Promise<WorkbenchMountHandle> {
    handle = await monacoService.mountWorkbench(container);
    isReady.value = true;
    return handle;
  }

  function disposeWorkbench(): void {
    handle?.dispose();
    handle = null;
    isReady.value = false;
  }

  return {
    isReady,
    initWorkbench,
    disposeWorkbench,
  };
}
