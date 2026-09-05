import React from 'react';
import { WifiOff, UploadCloud, CheckCircle2, AlertTriangle } from 'lucide-react';
import { tx } from '../../lib/i18n';
import { useLang } from '../../src/context/LanguageContext';
import { etatFile, viderFile, relancerEchecs, type EtatFile } from '../../src/lib/filaHorsLigne';

/**
 * L'etat hors-ligne, dans le header.
 *
 * Il occupait le bas de l'ecran, en travers du contenu : sur un telephone il
 * recouvrait la carte et le bouton qu'on cherchait justement a atteindre. Un
 * avertissement qui cache ce dont il parle finit par etre ignore, ou pire, par
 * gener. Il tient desormais sa place a cote des autres indicateurs, a la meme
 * taille qu'eux, et ne mange plus une ligne de travail.
 *
 * Ce qu'il dit reste indispensable : sans reseau, l'application montre le
 * dernier etat connu, et un solde de la veille ressemble trait pour trait a un
 * solde d'aujourd'hui — c'est de l'argent. Il porte aussi le compte des saisies
 * pas encore parties : sans ce chiffre, personne ne peut savoir s'il est
 * prudent d'eteindre le poste.
 */
const BandeauHorsLigne: React.FC = () => {
    const { lang } = useLang();
    const [horsLigne, setHorsLigne] = React.useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
    const [file, setFile] = React.useState<EtatFile>(() => etatFile());
    // Confirmation breve apres un envoi reussi : sans elle, l'indicateur
    // s'eteint sans rien dire et on ignore si le travail est bien parti.
    const [envoye, setEnvoye] = React.useState(0);

    React.useEffect(() => {
        const partie = () => setHorsLigne(true);
        const revenue = () => { setHorsLigne(false); void viderFile(); };
        const majFile = (e: Event) => setFile((e as CustomEvent<EtatFile>).detail);
        const videe = (e: Event) => {
            setEnvoye((e as CustomEvent<{ envoyees: number }>).detail.envoyees);
            window.setTimeout(() => setEnvoye(0), 6000);
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

    // Meme gabarit que ses voisins (SyncIndicator, support, profil) : une
    // pastille ronde. Elle s'allonge pour porter un chiffre ou un mot quand
    // l'ecran est assez large — jamais au point de pousser les autres dehors.
    const pastille = 'flex items-center justify-center h-8 min-w-8 px-1.5 gap-1 rounded-full border text-[11px] font-black transition-colors';

    const etats = {
        echecs: {
            classe: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400',
            titre: tx(lang, {
                fr: `${file.echecs} saisie(s) refusée(s) par le serveur. Touchez pour réessayer.`,
                ar: `${file.echecs} إدخال رفضه الخادم. المس لإعادة المحاولة.`,
                en: `${file.echecs} entr(y/ies) refused by the server. Tap to retry.`,
                es: `${file.echecs} entrada(s) rechazada(s) por el servidor. Toque para reintentar.`,
                pt: `${file.echecs} entrada(s) recusada(s) pelo servidor. Toque para tentar de novo.`,
                tr: `Sunucu ${file.echecs} kaydi reddetti. Yeniden denemek icin dokunun.`,
            }),
        },
        horsLigne: {
            classe: 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400',
            titre: tx(lang, {
                fr: "Hors ligne — vous voyez les données de la dernière connexion." + (file.enAttente > 0 ? ` ${file.enAttente} saisie(s) attendent le retour du réseau.` : ''),
                ar: 'غير متصل — أنت ترى بيانات آخر اتصال.' + (file.enAttente > 0 ? ` ${file.enAttente} إدخال ينتظر عودة الشبكة.` : ''),
                en: 'Offline — you are seeing data from the last connection.' + (file.enAttente > 0 ? ` ${file.enAttente} entr(y/ies) waiting for the network.` : ''),
                es: 'Sin conexión — ve los datos de la última conexión.' + (file.enAttente > 0 ? ` ${file.enAttente} entrada(s) esperan la red.` : ''),
                pt: 'Offline — vê os dados da última ligação.' + (file.enAttente > 0 ? ` ${file.enAttente} entrada(s) aguardam a rede.` : ''),
                tr: 'Cevrimdisi — son baglantinin verilerini goruyorsunuz.' + (file.enAttente > 0 ? ` ${file.enAttente} kayit agi bekliyor.` : ''),
            }),
        },
        envoi: {
            classe: 'bg-sky-50 dark:bg-sky-900/30 border-sky-200 dark:border-sky-800 text-sky-600 dark:text-sky-400',
            titre: tx(lang, {
                fr: `Envoi des saisies faites hors ligne — ${file.enAttente} restante(s).`,
                ar: `جارٍ إرسال الإدخالات المسجّلة دون اتصال — بقي ${file.enAttente}.`,
                en: `Sending entries made offline — ${file.enAttente} left.`,
                es: `Enviando entradas hechas sin conexión — quedan ${file.enAttente}.`,
                pt: `A enviar entradas feitas offline — faltam ${file.enAttente}.`,
                tr: `Cevrimdisi yapilan kayitlar gonderiliyor — ${file.enAttente} kaldi.`,
            }),
        },
        envoye: {
            classe: 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400',
            titre: tx(lang, {
                fr: `${envoye} saisie(s) hors ligne envoyée(s). Touchez pour actualiser l'écran.`,
                ar: `تم إرسال ${envoye} إدخال. المس لتحديث الشاشة.`,
                en: `${envoye} offline entr(y/ies) sent. Tap to refresh the screen.`,
                es: `${envoye} entrada(s) enviada(s). Toque para actualizar la pantalla.`,
                pt: `${envoye} entrada(s) enviada(s). Toque para atualizar o ecrã.`,
                tr: `${envoye} kayit gonderildi. Ekrani yenilemek icin dokunun.`,
            }),
        },
    };

    // Priorite a ce qui reclame une action : des saisies abandonnees se perdent
    // en silence si l'indicateur prefere annoncer la coupure.
    if (file.echecs > 0) {
        return (
            <button type="button" onClick={() => { void relancerEchecs(); }} className={`${pastille} ${etats.echecs.classe}`} title={etats.echecs.titre} aria-label={etats.echecs.titre}>
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{file.echecs}</span>
            </button>
        );
    }

    if (horsLigne) {
        return (
            <div className={`${pastille} ${etats.horsLigne.classe}`} title={etats.horsLigne.titre} aria-label={etats.horsLigne.titre} aria-live="polite">
                <WifiOff className="w-3.5 h-3.5 shrink-0" />
                {file.enAttente > 0 && <span>{file.enAttente}</span>}
            </div>
        );
    }

    if (file.enAttente > 0) {
        return (
            <div className={`${pastille} ${etats.envoi.classe}`} title={etats.envoi.titre} aria-label={etats.envoi.titre} aria-live="polite">
                <UploadCloud className={`w-3.5 h-3.5 shrink-0 ${file.envoiEnCours ? 'animate-pulse' : ''}`} />
                <span>{file.enAttente}</span>
            </div>
        );
    }

    if (envoye > 0) {
        // Cliquable, et pas seulement informatif : les ecrans ouverts montrent
        // encore l'etat d'avant l'envoi. Le serveur fait desormais foi, et
        // recharger est le seul moyen sur de le voir, quel que soit l'ecran.
        return (
            <button type="button" onClick={() => window.location.reload()} className={`${pastille} ${etats.envoye.classe}`} title={etats.envoye.titre} aria-label={etats.envoye.titre}>
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>{envoye}</span>
            </button>
        );
    }

    // Rien a signaler : on ne prend pas de place. Les voisins ne bougent pas
    // pour autant — la pastille apparait a leur gauche, en bout de rangee.
    return null;
};

export default BandeauHorsLigne;
