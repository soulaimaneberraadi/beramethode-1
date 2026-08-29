import React from 'react';
import { WifiOff } from 'lucide-react';

/**
 * Le bandeau hors-ligne.
 *
 * L'application continue de s'ouvrir sans reseau — le service worker rend le
 * dernier etat connu. Mais un solde de la veille ressemble trait pour trait a
 * un solde d'aujourd'hui, et c'est de l'argent : il faut que l'ecran DISE
 * qu'il montre une copie, sinon on encaisse sur un chiffre perime.
 *
 * Il disparait de lui-meme des que la connexion revient.
 */
const BandeauHorsLigne: React.FC = () => {
    const [horsLigne, setHorsLigne] = React.useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);

    React.useEffect(() => {
        const partie = () => setHorsLigne(true);
        const revenue = () => setHorsLigne(false);
        window.addEventListener('offline', partie);
        window.addEventListener('online', revenue);
        return () => {
            window.removeEventListener('offline', partie);
            window.removeEventListener('online', revenue);
        };
    }, []);

    if (!horsLigne) return null;

    return (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[300] px-3.5 py-2 rounded-full bg-amber-500 text-white text-[11px] font-black shadow-lg inline-flex items-center gap-2">
            <WifiOff className="w-3.5 h-3.5" />
            Hors ligne — donnees de la derniere connexion
        </div>
    );
};

export default BandeauHorsLigne;
