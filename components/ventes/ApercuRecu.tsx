import React from 'react';
import { Printer, AlertTriangle } from 'lucide-react';
import PanneauDetail from './PanneauDetail';
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
                    className="h-9 px-3.5 rounded-lg text-[12px] font-black bg-slate-900 dark:bg-dk-accent text-white inline-flex items-center gap-1.5 disabled:opacity-40"
                >
                    <Printer className="w-4 h-4" /> Imprimer
                </button>
                </div>
            }
        >
            {erreur && (
                <p className="flex items-start gap-1.5 text-[12px] text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50 rounded-xl bg-white dark:bg-dk-surface p-3">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-px" /> {erreur}
                </p>
            )}
            {html && (
                <div className={`rounded-xl border border-slate-200 dark:border-dk-border bg-white overflow-hidden mx-auto max-w-[820px]`}>
                    {/* Le recu tel qu'il sortira : meme feuille, meme largeur. */}
                    <iframe title="Recu" srcDoc={html} className="w-full h-[70vh] border-0 bg-white" />
                </div>
            )}
        </PanneauDetail>
    );
};

export default ApercuRecu;
