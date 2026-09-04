import React from 'react';
import { WifiOff, UploadCloud, CheckCircle2, AlertTriangle } from 'lucide-react';
import { etatFile, viderFile, relancerEchecs, type EtatFile } from '../../src/lib/filaHorsLigne';

/**
 * Le bandeau hors-ligne.
 *
 * L'application continue de s'ouvrir sans reseau — le service worker rend le
 * dernier etat connu. Mais un solde de la veille ressemble trait pour trait a
 * un solde d'aujourd'hui, et c'est de l'argent : il faut que l'ecran DISE
 * qu'il montre une copie, sinon on encaisse sur un chiffre perime.
 *
 * Il porte aussi le compte des saisies faites pendant la coupure et pas encore
 * parties. Sans ce chiffre, personne ne peut savoir s'il est prudent d'eteindre
 * le poste : le travail de l'apres-midi dort dans le navigateur, et le fermer
 * pour de bon avant le retour du reseau l'emporterait avec lui.
 *
 * Il disparait de lui-meme quand la connexion est revenue ET que la file est
 * vide.
 */
const BandeauHorsLigne: React.FC = () => {
    const [horsLigne, setHorsLigne] = React.useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
    const [file, setFile] = React.useState<EtatFile>(() => etatFile());
    // Confirmation breve apres un envoi reussi : sans elle, le bandeau
    // disparait sans rien dire et on ignore si le travail est bien parti.
    const [envoye, setEnvoye] = React.useState(0);

    React.useEffect(() => {
        const partie = () => setHorsLigne(true);
        const revenue = () => { setHorsLigne(false); void viderFile(); };
        const majFile = (e: Event) => setFile((e as CustomEvent<EtatFile>).detail);
        const videe = (e: Event) => {
            setEnvoye((e as CustomEvent<{ envoyees: number }>).detail.envoyees);
            window.setTimeout(() => setEnvoye(0), 4000);
        };
        window.addEventListener('offline', partie);
        window.addEventListener('online', revenue);
        window.addEventListener('beramethode:file-hors-ligne', majFile);
        window.addEventListener('beramethode:file-videe', videe);
        return () => {
            window.removeEventListener('offline', partie);
            window.removeEventListener('online', revenue);
            window.removeEventListener('beramethode:file-hors-ligne', majFile);
            window.removeEventListener('beramethode:file-videe', videe);
        };
    }, []);

    const enveloppe = 'fixed bottom-3 left-1/2 -translate-x-1/2 z-[300] px-3.5 py-2 rounded-full text-white text-[11px] font-black shadow-lg inline-flex items-center gap-2';

    // Priorite a ce qui reclame une action : des saisies abandonnees se perdent
    // en silence si le bandeau prefere annoncer la coupure.
    if (file.echecs > 0) {
        return (
            <button type="button" onClick={() => { void relancerEchecs(); }} className={`${enveloppe} bg-red-600`}>
                <AlertTriangle className="w-3.5 h-3.5" />
                {file.echecs} saisie{file.echecs > 1 ? 's' : ''} refusee{file.echecs > 1 ? 's' : ''} — reessayer
            </button>
        );
    }

    if (horsLigne) {
        return (
            <div className={`${enveloppe} bg-amber-500`}>
                <WifiOff className="w-3.5 h-3.5" />
                Hors ligne — donnees de la derniere connexion
                {file.enAttente > 0 && <span className="px-1.5 py-0.5 rounded-full bg-white/25">{file.enAttente} a envoyer</span>}
            </div>
        );
    }

    if (file.enAttente > 0) {
        return (
            <div className={`${enveloppe} bg-sky-600`}>
                <UploadCloud className={`w-3.5 h-3.5 ${file.envoiEnCours ? 'animate-pulse' : ''}`} />
                Envoi des saisies hors ligne — {file.enAttente} restante{file.enAttente > 1 ? 's' : ''}
            </div>
        );
    }

    if (envoye > 0) {
        // Cliquable, et pas seulement informatif : les ecrans ouverts montrent
        // encore l'etat d'avant l'envoi. Le serveur fait desormais foi, et
        // recharger est le seul moyen sur de le voir, quel que soit l'ecran.
        return (
            <button type="button" onClick={() => window.location.reload()} className={`${enveloppe} bg-emerald-600`}>
                <CheckCircle2 className="w-3.5 h-3.5" />
                {envoye} saisie{envoye > 1 ? 's' : ''} envoyee{envoye > 1 ? 's' : ''} — actualiser
            </button>
        );
    }

    return null;
};

export default BandeauHorsLigne;
