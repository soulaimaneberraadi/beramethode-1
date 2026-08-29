import React from 'react';
import { Printer, AlertTriangle, MessageCircle, Loader2 } from 'lucide-react';
import { enPdf, partagerOuTelecharger } from './partagerDocument';
import { versInternational } from './ContactClient';
import PanneauDetail from './PanneauDetail';
import CadreDocument from './CadreDocument';
import { chargerRecu, htmlRecu, imprimerHtml, type DonneesRecu } from './recuVersement';

/**
 * Le recu s'affiche AVANT de partir a l'imprimante.
 *
 * Lancer l'impression d'emblee obligeait a gaspiller une feuille pour savoir
 * ce qu'on signait. Ici on lit le mouvement — montant, mode, facture, reste
 * du — et on imprime seulement si c'est juste.
 */
const ApercuRecu: React.FC<{ paiementId: string; devise: string; onFermer: () => void; retour?: string }> = ({ paiementId, devise, onFermer, retour }) => {
    const [donnees, setDonnees] = React.useState<DonneesRecu | null>(null);
    // Un seul format : la feuille A4, celle qu on classe et qu on envoie.

    const [resume, setResume] = React.useState<{ montant: number; reste: number } | null>(null);
    const [erreur, setErreur] = React.useState<string | null>(null);
    const [envoi, setEnvoi] = React.useState(false);
    const [avis, setAvis] = React.useState<string | null>(null);
    const [lienWhatsapp, setLienWhatsapp] = React.useState<string | null>(null);

    React.useEffect(() => {
        let vivant = true;
        chargerRecu(paiementId)
            .then(d => {
                if (!vivant) return;
                setResume({ montant: d.paiement.montant, reste: d.compte.reste });
                setDonnees(d);
            })
            .catch(e => vivant && setErreur(e?.message || String(e)));
        return () => { vivant = false; };
    }, [paiementId, devise]);

    const html = donnees ? htmlRecu(donnees, devise, false, 'A4') : null;

    const nf = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });

    /** Le recu au client, en un geste : PDF + feuille de partage. */
    const envoyer = async () => {
        if (!html || !donnees) return;
        setEnvoi(true);
        setAvis(null);
        try {
            const nom = `Recu ${donnees.client.nom} ${donnees.paiement.date}`.replace(/[\/:*?"<>|]/g, '-');
            const fichier = await enPdf(html, nom);
            const texte = `Bonjour ${donnees.client.nom}, voici le recu de votre versement de ${nf(donnees.paiement.montant)} ${devise}. Reste du : ${nf(donnees.compte.reste)} ${devise}. Merci.`;
            const res = await partagerOuTelecharger(fichier, texte);
            const numero = donnees.client.tel ? versInternational(donnees.client.tel) : null;
            setLienWhatsapp(res === 'PARTAGE' || !numero ? null : `https://wa.me/${numero}?text=${encodeURIComponent(texte)}`);
            setAvis(
                res === 'PARTAGE' ? 'Le recu est parti dans la fenetre de partage.'
                : res === 'NON_SECURISE'
                    ? 'Le partage direct exige une connexion securisee (https). Le recu est enregistre : ouvrez WhatsApp et joignez-le.'
                    : 'Recu enregistre. Ouvrez WhatsApp et joignez le fichier.',
            );
        } catch (e: any) {
            setErreur(e?.message || String(e));
        } finally {
            setEnvoi(false);
        }
    };

    return (
        <PanneauDetail
            titre="Recu de versement"
            valeur={resume ? `${nf(resume.montant)} ${devise}` : undefined}
            sous={resume ? `Reste du apres ce versement : ${nf(resume.reste)} ${devise}` : undefined}
            retour={retour}
            onFermer={onFermer}
            barre={
                <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    disabled={!html}
                    onClick={() => { try { imprimerHtml(html!); } catch (e: any) { setErreur(e?.message || String(e)); } }}
                    className="h-9 flex-1 sm:flex-none px-3 sm:px-3.5 rounded-lg text-[12px] font-black bg-slate-900 dark:bg-dk-accent text-white inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
                >
                    <Printer className="w-4 h-4" /> Imprimer
                </button>
                <button
                    type="button"
                    disabled={!html || envoi}
                    onClick={() => void envoyer()}
                    className="h-9 flex-1 sm:flex-none px-3 sm:px-3.5 rounded-lg text-[12px] font-black bg-emerald-600 text-white inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                    {envoi ? <Loader2 className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />}
                    {envoi ? 'Preparation...' : 'Envoyer'}
                </button>
                </div>
            }
        >
            {avis && (
                <div className="text-[12px] font-bold text-slate-600 dark:text-dk-text-soft border border-slate-200 dark:border-dk-border rounded-xl bg-white dark:bg-dk-surface px-3.5 py-2.5">
                    {avis}
                    {lienWhatsapp && (
                        <a href={lienWhatsapp} target="_blank" rel="noopener noreferrer"
                            className="mt-2 h-9 px-3.5 rounded-lg text-[12px] font-black bg-emerald-600 text-white inline-flex items-center justify-center gap-1.5">
                            <MessageCircle className="w-4 h-4" /> Ouvrir WhatsApp
                        </a>
                    )}
                </div>
            )}
            {erreur && (
                <p className="flex items-start gap-1.5 text-[12px] text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50 rounded-xl bg-white dark:bg-dk-surface p-3">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-px" /> {erreur}
                </p>
            )}
            {html && (
                <div className={`rounded-xl border border-slate-200 dark:border-dk-border bg-white overflow-hidden mx-auto max-w-[820px]`}>
                    {/* Le recu tel qu'il sortira : meme feuille, meme largeur. */}
                    <CadreDocument html={html} titre="Recu" />
                </div>
            )}
        </PanneauDetail>
    );
};

export default ApercuRecu;
