import React, { useMemo, useState } from 'react';
import type { HRWorker } from '../../types';
import { tx } from '../../lib/i18n';

const PLACEHOLDER = { fr: 'Nom de l’ouvrier…', ar: 'سميّة العامل…', en: 'Worker name…', es: 'Nombre del operario…', pt: 'Nome do operario…', tr: 'Isci adi…' };

/**
 * Champ « ouvrier » : on ecrit le nom, les fiches RH sont proposees.
 *
 * Un simple selecteur supposait le fichier RH deja saisi. Ici le nom libre est
 * accepte tel quel, et s'il correspond exactement a une fiche, le releve est
 * rattache a cette personne — son historique se remplit sans rien resaisir.
 */
export default function ChampOuvrier({ valeur, workers, lang, onValider, onAnnuler, autoFocus = true }: {
    valeur: string; workers: HRWorker[]; lang: string;
    onValider: (nom: string) => void; onAnnuler: () => void;
    /** Faux quand le champ vit dans un formulaire : il n'a pas a s'y imposer. */
    autoFocus?: boolean;
}) {
    const [saisie, setSaisie] = useState(valeur);
    const [actif, setActif] = useState(autoFocus);
    const propositions = useMemo(() => {
        const q = saisie.trim().toLowerCase();
        const base = q === '' ? workers : workers.filter(w => (w.full_name || '').toLowerCase().includes(q));
        return base.slice(0, 6);
    }, [saisie, workers]);

    return (
        <div className="relative">
            <input
                autoFocus={autoFocus}
                value={saisie}
                onFocus={() => setActif(true)}
                onChange={e => setSaisie(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Enter') onValider(saisie);
                    if (e.key === 'Escape') onAnnuler();
                }}
                /* On valide en quittant le champ : au pied de la chaine, personne
                   ne pense a appuyer sur Entree. Le clic sur une proposition passe
                   avant, grace au delai. */
                onBlur={() => setTimeout(() => { setActif(false); onValider(saisie); }, 150)}
                placeholder={tx(lang, PLACEHOLDER)}
                className="w-full h-9 text-[12px] font-bold text-slate-700 dark:text-dk-text bg-slate-50 dark:bg-dk-elevated/60 border border-slate-200 dark:border-dk-border rounded-lg px-2.5 outline-none focus:border-indigo-600"
            />
            {actif && propositions.length > 0 && (
                <div className="absolute z-40 left-0 right-0 mt-1 max-h-44 overflow-y-auto rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface shadow-lg">
                    {propositions.map(w => (
                        <button
                            key={w.id}
                            type="button"
                            onMouseDown={e => { e.preventDefault(); onValider(w.full_name || ''); }}
                            className="w-full text-left px-2.5 py-1.5 text-[12px] font-bold text-slate-700 dark:text-dk-text hover:bg-slate-50 dark:hover:bg-dk-elevated/50 border-b border-slate-100 dark:border-dk-border/40 last:border-0 truncate"
                        >
                            {w.full_name}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

