import { useEffect, useState } from 'react';

export interface MagasinStock {
    products: {
        id: string;
        designation: string;
        reference?: string;
        fournisseurNom?: string;
        fournisseurDelaiLivraisonJours?: number;
    }[];
    lots: { productId: string; quantiteRestante: number; quantiteReservee?: number }[];
}

/** Sync léger une fois au montage ou lors d'un reload. */
export function usePlanningStock() {
    const [stock, setStock] = useState<MagasinStock | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const reload = () => setRefreshKey(k => k + 1);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [rp, rl] = await Promise.all([
                    fetch('/api/magasin/products', { credentials: 'include' }),
                    fetch('/api/magasin/lots', { credentials: 'include' }),
                ]);
                if (!rp.ok || !rl.ok) return;
                const products = await rp.json();
                const lots = await rl.json();
                if (!cancelled) setStock({ products, lots });
            } catch {
                /* magasin indisponible → on ne bloque pas le planning */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [refreshKey]);

    return { stock, reload };
}
