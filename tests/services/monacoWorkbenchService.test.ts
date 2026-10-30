import { describe, expect, it, vi } from 'vitest';
import {
  type IMonacoEngineAdapter,
  MockMonacoEngineAdapter,
  MonacoWorkbenchService,
  type SupportedLanguagePackLocale,
  resolveLanguagePackLocale,
} from '@/services/monacoWorkbenchService';

function createMockEngineAdapter() {
  let initCount = 0;

  const initialize = vi.fn((_locale: SupportedLanguagePackLocale, _container?: HTMLElement) => {
    initCount += 1;
    return Promise.resolve();
  });

  const mountWorkbench = vi.fn((_container: HTMLElement) => {
    return Promise.resolve({
      dispose: vi.fn(),
    });
  });

  const adapter: IMonacoEngineAdapter = {
    initialize,
    mountWorkbench,
  };

  return {
    adapter,
    initialize,
    mountWorkbench,
    get initializeCallCount() {
      return initCount;
    },
  };
}

describe('services/monacoWorkbenchService', () => {
  describe('resolveLanguagePackLocale', () => {
    it('normalizes browser locales into supported VS Code language packs', () => {
      expect(resolveLanguagePackLocale('en-US')).toBe('en');
      expect(resolveLanguagePackLocale('fr-FR')).toBe('fr');
      expect(resolveLanguagePackLocale('de-DE')).toBe('de');
      expect(resolveLanguagePackLocale('es-ES')).toBe('es');
      expect(resolveLanguagePackLocale('it-IT')).toBe('it');
      expect(resolveLanguagePackLocale('ja-JP')).toBe('ja');
      expect(resolveLanguagePackLocale('pt-BR')).toBe('pt-br');
      expect(resolveLanguagePackLocale('pt-PT')).toBe('pt-br');
      expect(resolveLanguagePackLocale('zh-CN')).toBe('zh-hans');
      expect(resolveLanguagePackLocale('zh-Hans')).toBe('zh-hans');
      expect(resolveLanguagePackLocale('unknown-LOCALE')).toBe('en');
    });
  });

  describe('MonacoWorkbenchService', () => {
    it('initializes services once and deduplicates concurrent initializeServices calls', async () => {
      const mockAdapter = createMockEngineAdapter();
      const service = new MonacoWorkbenchService(mockAdapter.adapter, 'fr-FR');

      expect(service.isInitialized()).toBe(false);
      await Promise.all([service.initializeServices(), service.initializeServices()]);
      expect(service.isInitialized()).toBe(true);
      expect(mockAdapter.initializeCallCount).toBe(1);
      expect(mockAdapter.initialize).toHaveBeenCalledWith('fr', undefined);

      await service.initializeServices();
      expect(mockAdapter.initializeCallCount).toBe(1);
    });

    it('mounts native workbench container via the engine adapter', async () => {
      const mockAdapter = createMockEngineAdapter();
      const service = new MonacoWorkbenchService(mockAdapter.adapter);
      const container = document.createElement('div');

      const handle = await service.mountWorkbench(container);
      expect(mockAdapter.initialize).toHaveBeenCalledWith('en', container);
      expect(mockAdapter.mountWorkbench).toHaveBeenCalledWith(container);
      expect(handle).toBeDefined();
      expect(typeof handle.dispose).toBe('function');
      handle.dispose();
    });
  });

  describe('MockMonacoEngineAdapter', () => {
    it('implements IMonacoEngineAdapter lifecycle and mounting', async () => {
      const adapter = new MockMonacoEngineAdapter();
      expect(adapter.isAdapterInitialized()).toBe(false);

      await adapter.initialize('en');
      expect(adapter.isAdapterInitialized()).toBe(true);

      const container = document.createElement('div');
      const handle = await adapter.mountWorkbench(container);
      expect(container.classList.contains('monaco-workbench-container')).toBe(true);
      handle.dispose();
      expect(container.classList.contains('monaco-workbench-container')).toBe(false);
    });
  });
});
