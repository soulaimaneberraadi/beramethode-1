import React, { useMemo, useRef, useState } from 'react';
import type { HRWorker } from '../../types';
import { tx } from '../../lib/i18n';

const PLACEHOLDER = { fr: 'Nom de l’ouvrier…', ar: 'سميّة العامل…', en: 'Worker name…', es: 'Nombre del operario…', pt: 'Nome do operario…', tr: 'Isci adi…' };

const L = {
    sansChaine: { fr: 'sans chaine', ar: 'بلا شين', en: 'no line', es: 'sin linea', pt: 'sem linha', tr: 'hat yok' },
    /* On ne promet PAS de reaffecter la fiche RH : le releve du jour se fera ici,
       le rattachement officiel de la personne, lui, ne bouge pas. */
    autreChaine: { fr: 'Vient d’une autre chaine — son releve du jour se fera ici', ar: 'جاي من شين أخرى — تسجيل هاد النهار غادي يكون هنا', en: 'From another line — today’s entry will be recorded here', es: 'Viene de otra linea — su registro de hoy se hara aqui', pt: 'Vem de outra linha — o registo de hoje sera feito aqui', tr: 'Baska bir hattan — bugunku kaydi burada tutulacak' },
};

/**
 * Champ « ouvrier » : on ecrit le nom, les fiches RH sont proposees.
 *
 * Un simple selecteur supposait le fichier RH deja saisi. Ici le nom libre est
 * accepte tel quel, et s'il correspond exactement a une fiche, le releve est
 * rattache a cette personne — son historique se remplit sans rien resaisir.
 *
 * Les fiches proposees viennent de TOUTES les chaines, celles de la chaine en
 * cours d'abord. Chaque ligne dit d'ou vient la personne : c'est ce qui permet
 * de deplacer quelqu'un d'une chaine a l'autre en connaissance de cause, au
 * lieu de choisir un homonyme au hasard.
 */
export default function ChampOuvrier({ valeur, workers, lang, onValider, onAnnuler, autoFocus = true, chaineCourante }: {
    valeur: string; workers: HRWorker[]; lang: string;
    onValider: (nom: string) => void; onAnnuler: () => void;
    /** Faux quand le champ vit dans un formulaire : il n'a pas a s'y imposer. */
    autoFocus?: boolean;
    /** Chaine du releve : sert a signaler les fiches qui viennent d'ailleurs. */
    chaineCourante?: string;
}) {
    const [saisie, setSaisie] = useState(valeur);
    const [actif, setActif] = useState(autoFocus);
    /* Un choix dans la liste doit gagner contre la validation de sortie de
       champ : sur telephone, toucher une proposition fait TOUJOURS perdre le
       focus a l'input, et la validation differee renvoyait alors le texte
       partiel tape ("Fad") par-dessus le nom choisi. */
    const choixEnCours = useRef(false);

    const propositions = useMemo(() => {
        const q = saisie.trim().toLowerCase();
        const base = q === '' ? workers : workers.filter(w => (w.full_name || '').toLowerCase().includes(q));
        return base.slice(0, 6);
    }, [saisie, workers]);

    const choisir = (w: HRWorker) => {
        choixEnCours.current = true;
        const nom = w.full_name || '';
        // Le champ doit MONTRER le nom choisi : sans cela, l'ecran gardait le
        // texte partiel et le clic semblait sans effet.
        setSaisie(nom);
        setActif(false);
        onValider(nom);
        setTimeout(() => { choixEnCours.current = false; }, 300);
    };

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
                   ne pense a appuyer sur Entree. Un choix dans la liste, lui, a
                   deja valide — on ne le recouvre pas. */
                onBlur={() => setTimeout(() => {
                    if (choixEnCours.current) return;
                    setActif(false);
                    onValider(saisie);
                }, 150)}
                placeholder={tx(lang, PLACEHOLDER)}
                className="w-full h-9 text-[12px] font-bold text-slate-700 dark:text-dk-text bg-slate-50 dark:bg-dk-elevated/60 border border-slate-200 dark:border-dk-border rounded-lg px-2.5 outline-none focus:border-indigo-600"
            />
            {actif && propositions.length > 0 && (
                <div className="absolute z-40 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface shadow-lg">
                    {propositions.map(w => {
                        const chaine = (w.chaine_id || '').trim();
                        const ailleurs = Boolean(chaineCourante && chaine && chaine !== chaineCourante);
                        const details = [w.matricule, w.poste || w.specialite].filter(Boolean).join(' · ');
                        return (
                            <button
                                key={w.id}
                                type="button"
                                title={ailleurs ? tx(lang, L.autreChaine) : undefined}
                                /* `pointerdown` et non `mousedown` : sur telephone le
                                   `mousedown` n'est synthetise qu'apres le `touchend`,
                                   donc APRES la perte de focus — la liste avait deja
                                   disparu et le doigt ne selectionnait rien. */
                                onPointerDown={e => { e.preventDefault(); choisir(w); }}
                                className="w-full text-left px-2.5 py-2 min-h-[40px] hover:bg-slate-50 dark:hover:bg-dk-elevated/50 border-b border-slate-100 dark:border-dk-border/40 last:border-0"
                            >
                                <span className="flex items-center gap-1.5">
                                    <span className="flex-1 min-w-0 truncate text-[12px] font-bold text-slate-700 dark:text-dk-text">{w.full_name}</span>
                                    {/* La chaine d'origine, en clair : c'est elle qui dit si
                                        l'on prend quelqu'un de sa propre equipe ou si on le
                                        fait venir d'une autre. */}
                                    <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[9px] font-black ${ailleurs
                                        ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                        : 'bg-slate-100 text-slate-500 dark:bg-dk-elevated dark:text-dk-muted'}`}>
                                        {chaine || tx(lang, L.sansChaine)}
                                    </span>
                                </span>
                                {details && (
                                    <span className="block mt-0.5 text-[9px] font-bold text-slate-400 dark:text-dk-muted truncate">{details}</span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
