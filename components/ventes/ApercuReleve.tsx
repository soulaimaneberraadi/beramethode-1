import React from 'react';
import { Printer, MessageCircle } from 'lucide-react';
import PanneauDetail from './PanneauDetail';
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
    const html = htmlReleve(donnees, devise, false, options);

    const solde = Math.max(0, donnees.factures.reduce((a, f) => a + f.totalTtc - f.montantPaye, 0));
    const nf = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
    const international = tel ? versInternational(tel) : null;

    return (
        <PanneauDetail
            titre="Situation de compte"
            valeur={`${nf(solde)} ${devise}`}
            alerte={solde > 0}
            sous={donnees.client.nom}
            retour={retour}
            onFermer={onFermer}
            barre={
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                        {LIBELLES.map(([cle, texte]) => (
                            <button
                                key={cle}
                                type="button"
                                onClick={() => setOptions(o => ({ ...o, [cle]: !o[cle] }))}
                                className={`h-8 px-2.5 rounded-lg text-[11px] font-bold border transition-colors ${options[cle]
                                    ? 'bg-slate-900 dark:bg-dk-accent text-white border-transparent'
                                    : 'bg-white dark:bg-dk-surface text-slate-500 dark:text-dk-muted border-slate-200 dark:border-dk-border'}`}
                            >
                                {texte}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={() => imprimerHtml(html)}
                        className="h-9 px-3.5 rounded-lg text-[12px] font-black bg-slate-900 dark:bg-dk-accent text-white inline-flex items-center gap-1.5"
                    >
                        <Printer className="w-4 h-4" /> Imprimer / PDF
                    </button>
                    {international && (
                        <a
                            href={`https://wa.me/${international}?text=${encodeURIComponent(messageRelance({
                                nom: donnees.client.nom,
                                encours: solde,
                                devise,
                                societe: donnees.emetteur?.nom || null,
                                factures: donnees.factures.filter(f => f.reste > 0.009)
                                    .map(f => ({ numero: f.numero, reste: f.reste, dateEcheance: f.dateEcheance })),
                            }))}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="h-9 px-3.5 rounded-lg text-[12px] font-black border border-emerald-300 text-emerald-700 dark:border-emerald-800/60 dark:text-emerald-400 inline-flex items-center gap-1.5"
                        >
                            <MessageCircle className="w-4 h-4" /> WhatsApp
                        </a>
                    )}
                </div>
            }
        >
            <div className="rounded-xl border border-slate-200 dark:border-dk-border bg-white overflow-hidden mx-auto max-w-[820px]">
                <iframe title="Situation de compte" srcDoc={html} className="w-full h-[72vh] border-0 bg-white" />
            </div>
        </PanneauDetail>
    );
};

export default ApercuReleve;
