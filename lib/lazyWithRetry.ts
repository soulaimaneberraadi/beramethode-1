import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

type ModuleWithDefault<T extends ComponentType<any>> = {
  default: T;
};

/**
 * Chaque navigateur a sa propre phrase quand un chunk lazy ne se charge pas.
 * Il faut TOUTES les couvrir : sinon la page ne se recharge pas et l'écran
 * reste blanc. Safari/Firefox disent « 'text/html' is not a valid JavaScript
 * MIME type » — c'est ce que renvoie un hébergeur qui sert index.html à la
 * place d'un chunk supprimé par un nouveau déploiement.
 */
const CHUNK_ERROR_PATTERN = new RegExp(
  [
    'Failed to fetch dynamically imported module',
    'error loading dynamically imported module',
    'Importing a module script failed',
    'ChunkLoadError',
    'not a valid JavaScript MIME type',
    'MIME type of "text/html"',
    'Expected a JavaScript(?:-or-Wasm)? module script',
    'Failed to load module script',
    'Load failed',
  ].join('|'),
  'i',
);

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
