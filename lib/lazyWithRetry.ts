import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

type ModuleWithDefault<T extends ComponentType<any>> = {
  default: T;
};

const CHUNK_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i;

const isRecoverableChunkError = (error: unknown): boolean => {
  if (error instanceof Error) {
    return CHUNK_ERROR_PATTERN.test(error.message);
  }
  return typeof error === 'string' && CHUNK_ERROR_PATTERN.test(error);
};

export function lazyWithRetry<T extends ComponentType<any>>(
  key: string,
  importer: () => Promise<ModuleWithDefault<T>>
): LazyExoticComponent<T> {
  return lazy(async () => {
    const retryKey = `bera:lazy-retry:${key}`;

    try {
      const module = await importer();
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(retryKey);
      }
      return module;
    } catch (error) {
      if (
        typeof window !== 'undefined' &&
        isRecoverableChunkError(error)
      ) {
        const alreadyRetried = window.sessionStorage.getItem(retryKey) === '1';

        if (!alreadyRetried) {
          window.sessionStorage.setItem(retryKey, '1');
          window.location.reload();

          // Keep Suspense pending while the page reloads.
          return new Promise<ModuleWithDefault<T>>(() => {});
        }

        window.sessionStorage.removeItem(retryKey);
      }

      throw error;
    }
  });
}
