/**
 * Fabrique d'adaptateurs.
 *
 * Point d'entrée unique : le controller et le worker n'importent JAMAIS un
 * adaptateur concret. Ajouter WooCommerce demain se fera ici et nulle part
 * ailleurs — c'est ce qui garantit que la logique de stock, elle, ne bouge pas.
 */

import type { StoreAdapter, StoreConfigRow } from './types';
import { StoreAdapterError } from './types';
import { ShopifyAdapter } from './shopify';
import { CustomStoreAdapter } from './custom';

export * from './types';
export { ShopifyAdapter, SHOPIFY_API_VERSION } from './shopify';
export { CustomStoreAdapter } from './custom';

export const PLATEFORMES = ['SHOPIFY', 'WOO', 'CUSTOM'] as const;

export const getAdapter = (config: StoreConfigRow): StoreAdapter => {
    switch (String(config.plateforme || '').toUpperCase()) {
        case 'SHOPIFY':
            return new ShopifyAdapter(config);
        case 'CUSTOM':
        // WooCommerce expose une API REST proche du contrat « boutique maison ».
        // Tant qu'un adaptateur dédié n'existe pas, une passerelle respectant la
        // spécification de `custom.ts` fait le pont — mieux vaut un chemin
        // documenté qu'un adaptateur à moitié écrit qui donnerait de faux stocks.
        case 'WOO':
            return new CustomStoreAdapter(config);
        default:
            throw new StoreAdapterError(`Plateforme inconnue : ${config.plateforme}`);
    }
};
