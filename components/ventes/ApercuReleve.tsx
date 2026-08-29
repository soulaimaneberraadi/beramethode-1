import React from 'react';
import { Printer, MessageCircle, Loader2 } from 'lucide-react';
import { enPdf, partagerOuTelecharger, enregistrerFichier } from './partagerDocument';
import PanneauDetail from './PanneauDetail';
import CadreDocument from './CadreDocument';
import { imprimerHtml } from './recuVersement';
import { htmlReleve, OPTIONS_PAR_DEFAUT, type DonneesReleve, type OptionsReleve } from './releveCompte';
import { versInternational, messageRelance } from './ContactClient';

const LIBELLES: Array<[keyof OptionsReleve, string]> = [
    ['articles', 'Modeles et photos'],
    ['prixUnitaires', 'Prix unitaires'],
    ['versements', 'Versements'],
    ['garanties', 'Garanties'],
];

/**
 * La situation de compte, vue avant d'etre envoyee.
 *
 * Les sections se decochent : on n'envoie pas les memes pages a un client qui
 * conteste une livraison qu'a un client qui a juste oublie une echeance. Les
 * photos surtout — elles prouvent la commande, mais alourdissent le document.
 */
const ApercuReleve: React.FC<{
    donnees: DonneesReleve;
    devise: string;
    tel?: string | null;
    onFermer: () => void;
    retour?: string;
}> = ({ donnees, devise, tel, onFermer, retour }) => {
    const [options, setOptions] = React.useState<OptionsReleve>(OPTIONS_PAR_DEFAUT);
    const [envoi, setEnvoi] = React.useState(false);
    const [avis, setAvis] = React.useState<string | null>(null);
    // Le lien WhatsApp ne peut pas s ouvrir tout seul apres un await (iOS bloque
    // ce qui n est plus un geste) : on l affiche, le doigt le touche.
    const [lienPret, setLienPret] = React.useState(false);
    // Le PDF est fabrique DES l ouverture, avant tout clic : au moment du geste
    // il n y a plus rien a attendre, et iOS laisse passer l enregistrement ET
    // l ouverture de WhatsApp dans la meme foulee.
    const [fichierPret, setFichierPret] = React.useState<File | null>(null);
    const html = htmlReleve(donnees, devise, false, options);

    const solde = Math.max(0, donnees.factures.reduce((a, f) => a + f.totalTtc - f.montantPaye, 0));
    const nf = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
    const international = tel ? versInternational(tel) : null;

    const texte = messageRelance({
        nom: donnees.client.nom,
        encours: solde,
        devise,
        societe: donnees.emetteur?.nom || null,
        factures: donnees.factures.filter(f => f.reste > 0.009)
            .map(f => ({ numero: f.numero, reste: f.reste, dateEcheance: f.dateEcheance })),
    });

    const nomFichier = `Situation ${donnees.client.nom} ${new Date().toISOString().slice(0, 10)}`.replace(/[\\/:*?"<>|]/g, '-');

    // Preparation silencieuse : le document est pret avant qu'on le demande.
    // Elle recommence quand les sections changent — le PDF doit correspondre a
    // ce qui est affiche, jamais a une version precedente.
    React.useEffect(() => {
        let vivant = true;
        setFichierPret(null);
        const minuteur = window.setTimeout(() => {
            enPdf(html, nomFichier)
                .then(f => { if (vivant) setFichierPret(f); })
                .catch(() => undefined);
        }, 400);
        return () => { vivant = false; window.clearTimeout(minuteur); };
    }, [html, nomFichier]);

    /**
     * Un seul geste vers LE bon client : la conversation s'ouvre et le PDF
     * s'enregistre dans la meme foulee. Il ne reste qu'a le joindre — iOS ne
     * laisse aucun lien WhatsApp porter un fichier, mais rien n'oblige a
     * choisir le destinataire dans une liste.
     */
    const envoyerAuClient = () => {
        if (!international) return;
        // Le fichier part en premier : son enregistrement ne quitte pas la page.
        if (fichierPret) enregistrerFichier(fichierPret);
        // Sur iPhone, un lien de telechargement n enregistre rien : Safari se
        // contente d ouvrir le PDF. Le seul chemin qui depose vraiment un
        // fichier est la feuille de partage — d ou ce message, qui n annonce
        // pas un enregistrement dont on n est pas sur.
        setAvis(`Message ouvert pour ${donnees.client.nom}. Pour joindre le document, revenez et utilisez « Envoyer le PDF ».`);
        // Puis on VA sur WhatsApp au lieu d'ouvrir un onglet : Safari bloque les
        // fenetres ouvertes par script, meme dans un geste, quand une autre
        // action vient de partir. Une navigation, lui, passe toujours.
        window.setTimeout(() => {
            window.location.href = `https://wa.me/${international}?text=${encodeURIComponent(texte)}`;
        }, 300);
    };

    /**
     * Fabrique le PDF, puis le passe au partage du systeme — une feuille ou
     * l'on choisit WhatsApp et le contact. Sur un poste qui ne sait pas
     * partager de fichiers, il se telecharge et la conversation s'ouvre : il
     * ne reste qu'a le glisser. On le dit, plutot que de laisser croire a un
     * envoi qui n'a pas eu lieu.
     */
    const envoyer = async () => {
        setEnvoi(true);
        setAvis(null);
        try {
            const fichier = fichierPret || await enPdf(html, nomFichier);
            const resultat = await partagerOuTelecharger(fichier, texte);
            setLienPret(resultat !== 'PARTAGE');
            setAvis(
                resultat === 'PARTAGE' ? 'Le PDF est parti dans la fenetre de partage.'
                : resultat === 'NON_SECURISE'
                    ? 'Le partage direct exige une connexion securisee (https). En http, le PDF est enregistre : ouvrez WhatsApp ci-dessous et joignez-le.'
                    : 'PDF enregistre. Ouvrez WhatsApp ci-dessous et joignez le fichier.',
            );
        } catch (e: any) {
            setAvis(e?.message || String(e));
        } finally {
            setEnvoi(false);
        }
    };

    return (
        <PanneauDetail
            titre="Situation de compte"
            valeur={`${nf(solde)} ${devise}`}
            alerte={solde > 0}
            sous={donnees.client.nom}
            retour={retour}
            onFermer={onFermer}
            barre={
                <div className="space-y-2">
                    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none -mx-0.5 px-0.5">
                        {LIBELLES.map(([cle, texte]) => (
                            <button
                                key={cle}
                                type="button"
                                onClick={() => setOptions(o => ({ ...o, [cle]: !o[cle] }))}
                                className={`h-8 shrink-0 px-2.5 rounded-lg text-[11px] font-bold whitespace-nowrap border transition-colors ${options[cle]
                                    ? 'bg-slate-900 dark:bg-dk-accent text-white border-transparent'
                                    : 'bg-white dark:bg-dk-surface text-slate-500 dark:text-dk-muted border-slate-200 dark:border-dk-border'}`}
                            >
                                {texte}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-stretch gap-2">
                    <button
                        type="button"
                        onClick={() => imprimerHtml(html)}
                        className="h-10 flex-1 px-2 rounded-lg text-[11px] font-black bg-slate-900 dark:bg-dk-accent text-white inline-flex items-center justify-center gap-1.5 text-center leading-tight"
                    >
                        <Printer className="w-4 h-4" /> Imprimer / PDF
                    </button>
                    <button
                        type="button"
                        disabled={envoi}
                        onClick={() => void envoyer()}
                        className="h-10 flex-1 px-2 rounded-lg text-[11px] font-black bg-emerald-600 text-white inline-flex items-center justify-center gap-1.5 text-center leading-tight disabled:opacity-50"
                    >
                        {envoi ? <Loader2 className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />}
                        {envoi ? 'Preparation...' : fichierPret ? 'Envoyer le PDF' : 'Envoyer le PDF ...'}
                    </button>
                    {international && (
                        <button
                            type="button"
                            onClick={envoyerAuClient}
                            title="Ouvre la conversation de ce client — message seul, sans piece jointe"
                            className="h-10 flex-1 min-w-0 px-2 rounded-lg text-[11px] font-black border border-emerald-300 text-emerald-700 dark:border-emerald-800/60 dark:text-emerald-400 inline-flex items-center justify-center gap-1.5 whitespace-nowrap overflow-hidden"
                        >
                            <MessageCircle className="w-4 h-4" />
                            <span className="truncate">{donnees.client.nom}</span>
                            <span className="font-bold opacity-60 shrink-0">· texte</span>
                        </button>
                    )}
                    </div>
                </div>
            }
        >
            {avis && (
                <div className="text-[12px] font-bold text-slate-600 dark:text-dk-text-soft border border-slate-200 dark:border-dk-border rounded-xl bg-white dark:bg-dk-surface px-3.5 py-2.5">
                    {avis}
                    {lienPret && international && (
                        <a
                            href={`https://wa.me/${international}?text=${encodeURIComponent(texte)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 h-9 px-3.5 rounded-lg text-[12px] font-black bg-emerald-600 text-white inline-flex items-center justify-center gap-1.5"
                        >
                            <MessageCircle className="w-4 h-4" /> Ouvrir WhatsApp
                        </a>
                    )}
                </div>
            )}
            <div className="rounded-xl border border-slate-200 dark:border-dk-border bg-white overflow-hidden mx-auto w-full max-w-[820px]">
                <CadreDocument html={html} titre="Situation de compte" />
            </div>
        </PanneauDetail>
    );
};

export default ApercuReleve;
