import React from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Un panneau ouvert en absolute est coupe par le premier parent qui defile —
 * l'agenda s'arretait au 16 aout, la moitie du mois hors du cadre. Il part
 * donc en portail, en position fixed calculee sur le bouton, et bascule
 * au-dessus quand le bas de l'ecran manque.
 */
export const Flottant: React.FC<{ ancre: React.RefObject<HTMLElement>; largeurAncre?: boolean; children: React.ReactNode }> = ({ ancre, largeurAncre, children }) => {
    const [style, setStyle] = React.useState<React.CSSProperties | null>(null);
    const boite = React.useRef<HTMLDivElement>(null);

    React.useLayoutEffect(() => {
        const placer = () => {
            const a = ancre.current?.getBoundingClientRect();
            if (!a) return;
            const h = boite.current?.offsetHeight || 300;
            const dessous = window.innerHeight - a.bottom;
            const versLeHaut = dessous < h + 12 && a.top > dessous;
            const largeur = largeurAncre ? a.width : undefined;
            const gauche = Math.max(8, Math.min(a.left, window.innerWidth - (largeur || 260) - 8));
            setStyle({
                position: 'fixed',
                left: gauche,
                width: largeur,
                minWidth: largeurAncre ? undefined : a.width,
                ...(versLeHaut ? { bottom: window.innerHeight - a.top + 4 } : { top: a.bottom + 4 }),
                maxHeight: (versLeHaut ? a.top : dessous) - 12,
                zIndex: 200,
            });
        };
        placer();
        window.addEventListener('resize', placer);
        window.addEventListener('scroll', placer, true);
        return () => { window.removeEventListener('resize', placer); window.removeEventListener('scroll', placer, true); };
    }, [ancre, largeurAncre]);

    return createPortal(
        <div ref={boite} style={style || { position: 'fixed', opacity: 0 }} className="overflow-y-auto overscroll-contain rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface shadow-xl">
            {children}
        </div>,
        document.body,
    );
};

/**
 * Les champs de saisie de la page Ventes, sortis du tableau de bord pour que
 * les feuilles de detail les reutilisent : un selecteur natif ouvert au milieu
 * d'un panneau maison se voit immediatement.
 */
export const aujourdhui = () => new Date().toISOString().slice(0, 10);

/** Le champ date natif affiche mm/dd/yyyy des que le navigateur est en
 *  anglais, et n'ouvre l'agenda que sur la petite icone. Ici la date se lit
 *  en jj/mm/aaaa et le champ entier ouvre l'agenda. */
export type OptionListe = {
    valeur: string; texte: string;
    /** Ce qui distingue deux homonymes : telephone, ville. */
    sous?: string;
    /** Le seul chiffre qui compte au moment de choisir. */
    droite?: string; alerte?: boolean;
    /** Texte cherchable mais non affiche (ICE, ancien nom...). */
    recherche?: string;
};

/** Le select natif ouvre une liste dessinee par le systeme : police,
 *  couleurs et surlignage bleu n'ont rien a voir avec le reste. Ici la
 *  liste est a nous, et se filtre des qu'elle devient longue. */
export const ChampListe: React.FC<{
    label: string; value: string; onChange: (v: string) => void;
    options: OptionListe[];
    placeholderRecherche?: string;
    largeur?: string;
    rechercheToujours?: boolean;
    classe?: string;
    /** Un champ toujours renseigne (mode de reglement, date du jour) ne doit pas
     *  crier comme un filtre actif : il garde l'habit neutre. */
    neutre?: boolean;
}> = ({ label, value, onChange, options, placeholderRecherche, largeur = 'sm:min-w-[150px]', rechercheToujours, classe = '', neutre }) => {
    const [ouvert, setOuvert] = React.useState(false);
    const [q, setQ] = React.useState('');
    const boite = React.useRef<HTMLDivElement>(null);
    const ancre = React.useRef<HTMLButtonElement>(null);
    React.useEffect(() => {
        if (!ouvert) return;
        const dehors = (e: MouseEvent) => {
            const cible = e.target as Node;
            if (boite.current?.contains(cible)) return;
            // Le panneau vit dans un portail : il n est pas un enfant du champ.
            if ((cible as HTMLElement)?.closest?.('[data-flottant]')) return;
            setOuvert(false);
        };
        const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false); };
        document.addEventListener('mousedown', dehors);
        document.addEventListener('keydown', echap);
        return () => { document.removeEventListener('mousedown', dehors); document.removeEventListener('keydown', echap); };
    }, [ouvert]);
    const filtrable = rechercheToujours || options.length > 8;
    const terme = q.trim().toLowerCase();
    const visibles = filtrable && terme
        ? options.filter(o => `${o.texte} ${o.sous || ''} ${o.recherche || ''}`.toLowerCase().includes(terme))
        : options;
    const courant = options.find(o => o.valeur === value) || options[0];
    return (
        <div className={`flex flex-col gap-1 min-w-0 ${classe}`} ref={boite}>
            <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400 dark:text-dk-muted">{label}</span>
            <div className="relative">
                <button
                    ref={ancre}
                    type="button"
                    onClick={() => { setOuvert(v => !v); setQ(''); }}
                    className={`h-8 pl-2.5 pr-7 ${largeur} w-full rounded-lg border text-[11px] font-bold text-left truncate transition-colors ${value && !neutre
                        ? 'bg-slate-900 dark:bg-dk-accent text-white border-transparent'
                        : 'bg-slate-50 dark:bg-dk-elevated text-slate-600 dark:text-dk-text-soft border-slate-200 dark:border-dk-border hover:border-slate-400'}`}
                >
                    {courant?.texte}
                    <ChevronDown className={`w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 transition-transform ${ouvert ? 'rotate-180' : ''} ${value && !neutre ? 'text-white/70' : 'text-slate-400'}`} />
                </button>
                {ouvert && (
                    <Flottant ancre={ancre}>
                    <div data-flottant className="min-w-[140px] max-w-[220px]">
                        {filtrable && (
                            <input
                                autoFocus
                                value={q}
                                onChange={e => setQ(e.target.value)}
                                placeholder={placeholderRecherche}
                                className="w-full h-8 px-2.5 text-[11px] border-b border-slate-100 dark:border-dk-border bg-transparent text-slate-700 dark:text-dk-text placeholder:text-slate-400 outline-none"
                            />
                        )}
                        <div className="py-1">
                            {visibles.length === 0 && (
                                <p className="px-2.5 py-2 text-[11px] text-slate-400 dark:text-dk-muted">—</p>
                            )}
                            {visibles.map(o => (
                                <button
                                    key={o.valeur || '__tous'}
                                    type="button"
                                    onClick={() => { onChange(o.valeur); setOuvert(false); }}
                                    className={`w-full text-left px-2.5 py-1.5 text-[11px] font-bold leading-tight truncate transition-colors ${o.valeur === value
                                        ? 'bg-slate-100 dark:bg-dk-elevated text-slate-900 dark:text-dk-text'
                                        : 'text-slate-600 dark:text-dk-text-soft hover:bg-slate-50 dark:hover:bg-dk-elevated/60'}`}
                                >
                                    <span className="flex items-center gap-2">
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate">{o.texte}</span>
                                            {o.sous && <span className="block truncate text-[10px] font-medium text-slate-400 dark:text-dk-muted">{o.sous}</span>}
                                        </span>
                                        {o.droite && (
                                            <span className={`shrink-0 text-[10px] font-black tabular-nums ${o.alerte ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-dk-muted'}`}>
                                                {o.droite}
                                            </span>
                                        )}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                    </Flottant>
                )}
            </div>
        </div>
    );
};

/** L'agenda natif est dessine par le navigateur : mois en anglais, semaine
 *  qui commence dimanche, boutons bleus. On dessine le notre — semaine du
 *  lundi, bornes respectees, et des cibles qu'un doigt atteint. */
const Agenda: React.FC<{
    value: string; min?: string; max?: string;
    onPick: (v: string) => void; labels: { mois: string[]; jours: string[]; aujourdhui: string; effacer: string };
}> = ({ value, min, max, onPick, labels }) => {
    const base = value || aujourdhui();
    const [curseur, setCurseur] = React.useState(() => new Date(base.slice(0, 7) + '-01T00:00:00'));
    const annee = curseur.getFullYear();
    const mois = curseur.getMonth();
    const premier = new Date(annee, mois, 1);
    // getDay() met dimanche a 0 : ici la semaine commence lundi.
    const decalage = (premier.getDay() + 6) % 7;
    const nbJours = new Date(annee, mois + 1, 0).getDate();
    const iso = (d: number) => `${annee}-${String(mois + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const bloque = (k: string) => Boolean((min && k < min) || (max && k > max));
    const cases: Array<number | null> = [
        ...Array(decalage).fill(null),
        ...Array.from({ length: nbJours }, (_, n) => n + 1),
    ];
    return (
        <div className="p-2.5 w-[248px]">
            <div className="flex items-center justify-between mb-2">
                <button type="button" onClick={() => setCurseur(new Date(annee, mois - 1, 1))}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-dk-elevated">
                    <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-[11px] font-black uppercase tracking-[0.06em] text-slate-700 dark:text-dk-text">
                    {labels.mois[mois]} {annee}
                </span>
                <button type="button" onClick={() => setCurseur(new Date(annee, mois + 1, 1))}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-dk-elevated">
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 mb-1">
                {labels.jours.map(d => (
                    <span key={d} className="h-5 flex items-center justify-center text-[9px] font-black text-slate-400 dark:text-dk-muted">{d}</span>
                ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
                {cases.map((n, idx) => {
                    if (n == null) return <span key={`vide-${idx}`} />;
                    const k = iso(n);
                    const off = bloque(k);
                    const choisi = k === value;
                    const cejour = k === aujourdhui();
                    return (
                        <button
                            key={k}
                            type="button"
                            disabled={off}
                            onClick={() => onPick(k)}
                            className={`h-8 rounded-lg text-[11px] font-bold tabular-nums transition-colors ${choisi
                                ? 'bg-slate-900 dark:bg-dk-accent text-white'
                                : off
                                    ? 'text-slate-200 dark:text-dk-border cursor-not-allowed'
                                    : cejour
                                        ? 'text-slate-900 dark:text-dk-text ring-1 ring-slate-300 dark:ring-dk-border hover:bg-slate-100 dark:hover:bg-dk-elevated'
                                        : 'text-slate-600 dark:text-dk-text-soft hover:bg-slate-100 dark:hover:bg-dk-elevated'}`}
                        >
                            {n}
                        </button>
                    );
                })}
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-dk-border">
                <button type="button" onClick={() => onPick('')}
                    className="text-[10px] font-bold text-slate-400 dark:text-dk-muted hover:text-rose-600">{labels.effacer}</button>
                <button type="button" onClick={() => { if (!bloque(aujourdhui())) onPick(aujourdhui()); }}
                    className="text-[10px] font-bold text-slate-600 dark:text-dk-text-soft hover:text-slate-900">{labels.aujourdhui}</button>
            </div>
        </div>
    );
};

export const ChampDate: React.FC<{
    label: string; value: string; onChange: (v: string) => void;
    min?: string; max?: string; vide: string; classe?: string; neutre?: boolean;
    labels: { mois: string[]; jours: string[]; aujourdhui: string; effacer: string };
}> = ({ label, value, onChange, min, max, vide, classe = '', labels, neutre }) => {
    const [ouvert, setOuvert] = React.useState(false);
    const boite = React.useRef<HTMLDivElement>(null);
    const ancre = React.useRef<HTMLButtonElement>(null);
    React.useEffect(() => {
        if (!ouvert) return;
        const dehors = (e: MouseEvent) => {
            const cible = e.target as Node;
            if (boite.current?.contains(cible)) return;
            if ((cible as HTMLElement)?.closest?.('[data-flottant]')) return;
            setOuvert(false);
        };
        const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false); };
        document.addEventListener('mousedown', dehors);
        document.addEventListener('keydown', echap);
        return () => { document.removeEventListener('mousedown', dehors); document.removeEventListener('keydown', echap); };
    }, [ouvert]);
    const lisible = value ? value.slice(8, 10) + '/' + value.slice(5, 7) + '/' + value.slice(0, 4) : vide;
    return (
        <div className={`flex flex-col gap-1 min-w-0 ${classe}`} ref={boite}>
            <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400 dark:text-dk-muted">{label}</span>
            <div className="relative">
                <button
                    ref={ancre}
                    type="button"
                    onClick={() => setOuvert(v => !v)}
                    className={`relative w-full h-9 sm:h-8 pl-7 pr-2 sm:min-w-[128px] rounded-lg border text-[11px] font-bold text-left tabular-nums transition-colors ${value && !neutre
                        ? 'bg-slate-900 dark:bg-dk-accent text-white border-transparent'
                        : 'bg-slate-50 dark:bg-dk-elevated border-slate-200 dark:border-dk-border text-slate-400 dark:text-dk-muted'} hover:border-slate-400`}
                >
                    <CalendarDays className={`w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 ${value && !neutre ? 'text-white/70' : 'text-slate-400'}`} />
                    {lisible}
                </button>
                {ouvert && (
                    <Flottant ancre={ancre}>
                    <div data-flottant>
                        <Agenda
                            value={value}
                            min={min}
                            max={max}
                            labels={labels}
                            onPick={v => { onChange(v); setOuvert(false); }}
                        />
                    </div>
                    </Flottant>
                )}
            </div>
        </div>
    );
};
