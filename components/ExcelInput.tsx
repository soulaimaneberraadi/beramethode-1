
import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface ExcelInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  containerClassName?: string;
  /** Poids d'usage par mot (cle en minuscules) : les mots que l'atelier tape le plus remontent en tete. */
  rankWeights?: Record<string, number>;
  /** Ajoute une espace apres un mot choisi (saisie de phrases, ex. description de gamme). */
  spaceAfterAccept?: boolean;
  maxSuggestions?: number;
}

interface Proposition {
  label: string;
  /** Portion du texte remplacee par la proposition : [from, to). */
  from: number;
  to: number;
  rang: number;
}

/**
 * Distance d'edition limitee (Levenshtein) : sert a retrouver le bon mot
 * malgre UNE faute de frappe (« surpik » -> « surpiqure »).
 */
function distance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

const sansAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Champ texte avec liste de propositions.
 *
 * L'ancienne version completait « a la Excel » : elle ecrivait le mot propose
 * directement dans le champ, selectionne. Des qu'on effacait une lettre (une
 * faute de frappe, le cas le plus courant), toute proposition disparaissait
 * jusqu'a la lettre suivante — au moment precis ou on en avait besoin. Elle ne
 * proposait aussi qu'UN mot, le premier du dictionnaire, jamais le plus utilise.
 *
 * Ici la liste suit le mot sous le curseur, que l'on tape ou que l'on efface :
 *  - flèches haut/bas pour choisir, Entree ou Tab pour valider, Echap pour fermer ;
 *  - un toucher sur le telephone ;
 *  - les mots les plus utilises d'abord, puis tolerance d'une faute de frappe.
 * Rien n'est ecrit dans le champ tant qu'on n'a pas choisi.
 */
export default function ExcelInput({
  value,
  onChange,
  suggestions,
  className,
  containerClassName,
  rankWeights,
  spaceAfterAccept = false,
  maxSuggestions = 6,
  onBlur,
  onFocus,
  onKeyDown,
  ...props
}: ExcelInputProps) {

  const inputRef = useRef<HTMLInputElement>(null);
  const cursorRef = useRef<number | null>(null);
  const [items, setItems] = useState<Proposition[]>([]);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; above: boolean } | null>(null);
  const listId = useId();

  // Replace le curseur apres l'insertion d'un mot choisi
  useLayoutEffect(() => {
    if (cursorRef.current != null && inputRef.current) {
      inputRef.current.setSelectionRange(cursorRef.current, cursorRef.current);
      cursorRef.current = null;
    }
  });

  const fermer = () => { setItems([]); setActive(0); };

  const calculer = (texte: string, caret: number) => {
    const avant = texte.slice(0, caret);
    const debutMot = avant.search(/\S+$/);
    if (debutMot < 0) { fermer(); return; }
    const mot = avant.slice(debutMot);
    const finMot = caret + (texte.slice(caret).match(/^\S*/)?.[0].length ?? 0);
    const motN = sansAccents(mot);
    // Phrase entiere tapee depuis le debut (utile pour « Bleu ma » -> « Bleu marine »)
    const phrase = avant.trimStart();
    const phraseN = /\s/.test(phrase) ? sansAccents(phrase) : '';
    const debutPhrase = avant.length - phrase.length;

    const vus = new Set<string>();
    const trouves: Proposition[] = [];
    let motExact = false;
    for (const brut of suggestions) {
      if (!brut) continue;
      const s = String(brut).trim();
      const sN = sansAccents(s);
      if (!sN || vus.has(sN)) continue;
      vus.add(sN);
      if (sN === motN) { motExact = true; continue; }

      let rang = -1;
      let from = debutMot;
      if (phraseN && sN.startsWith(phraseN) && sN !== phraseN) { rang = 0; from = debutPhrase; }
      else if (sN.startsWith(motN)) rang = 1;
      else if (motN.length >= 3 && sN.includes(motN)) rang = 2;
      else if (motN.length >= 4 && distance(motN, sN.slice(0, motN.length)) <= 1) rang = 3;
      if (rang < 0) continue;
      trouves.push({ label: s, from, to: finMot, rang });
    }

    const poids = (l: string) => rankWeights?.[l.toLowerCase()] ?? 0;
    trouves.sort((a, b) =>
      a.rang - b.rang
      || poids(b.label) - poids(a.label)
      || a.label.length - b.label.length
      || a.label.localeCompare(b.label));

    const liste = trouves.slice(0, maxSuggestions);
    setItems(liste);
    // Preselection (Entree/Tab valident) seulement pour une vraie suite du mot
    // tape. Un mot deja complet, ou une simple correction de faute, ne doit
    // jamais etre remplace par Tab : on passerait au champ suivant avec un
    // autre mot que celui ecrit.
    setActive(!motExact && liste[0] && liste[0].rang <= 1 ? 0 : -1);
  };

  // Position de la liste : rendue hors du tableau (portail) pour ne pas etre
  // coupee par les conteneurs `overflow` des lignes de gamme.
  useLayoutEffect(() => {
    if (!items.length) { setPos(null); return; }
    const placer = () => {
      const r = inputRef.current?.getBoundingClientRect();
      if (!r) return;
      const hauteur = Math.min(items.length * 36 + 8, 260);
      const above = r.bottom + hauteur > window.innerHeight - 8 && r.top > hauteur;
      const width = Math.max(r.width, 200);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      setPos({ left, top: above ? r.top - hauteur - 4 : r.bottom + 4, width, above });
    };
    placer();
    window.addEventListener('scroll', placer, true);
    window.addEventListener('resize', placer);
    return () => {
      window.removeEventListener('scroll', placer, true);
      window.removeEventListener('resize', placer);
    };
  }, [items]);

  // La liste suit le texte si la valeur change de l'exterieur (annuler, rechargement)
  useEffect(() => {
    if (document.activeElement !== inputRef.current) fermer();
  }, [value]);

  const accepter = (p: Proposition, parTab: boolean) => {
    const reste = value.slice(p.to);
    const espace = (parTab || spaceAfterAccept) && !/^\s/.test(reste) ? ' ' : '';
    const nouveau = value.slice(0, p.from) + p.label + espace + reste;
    cursorRef.current = p.from + p.label.length + espace.length;
    onChange(nouveau);
    fermer();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const texte = e.target.value;
    onChange(texte);
    calculer(texte, e.target.selectionStart ?? texte.length);
  };

  const handleKeyDownInternal = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (items.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % items.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i <= 0 ? items.length - 1 : i - 1)); return; }
      if (e.key === 'Escape') { e.preventDefault(); fermer(); return; }
      if ((e.key === 'Enter' || e.key === 'Tab') && items[active]) {
        e.preventDefault();
        accepter(items[active], e.key === 'Tab');
        return;
      }
    }
    if (onKeyDown) onKeyDown(e);
  };

  // Deplacement du curseur (clic, fleches gauche/droite) : la liste suit le mot vise
  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      const el = e.currentTarget;
      calculer(el.value, el.selectionStart ?? el.value.length);
    }
  };

  const ouvert = items.length > 0 && pos != null;

  return (
    <div className={`relative w-full ${containerClassName || ''}`}>
      <input
        {...props}
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDownInternal}
        onKeyUp={handleKeyUp}
        onBlur={(e) => { fermer(); onBlur?.(e); }}
        onFocus={onFocus}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={ouvert}
        aria-controls={ouvert ? listId : undefined}
        className={`${className} relative z-10 bg-transparent`}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck="false"
      />
      {ouvert && createPortal(
        <ul
          id={listId}
          role="listbox"
          className="fixed z-[10000] max-h-[260px] overflow-y-auto overscroll-contain rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface shadow-lg dark:shadow-dk-lg py-1"
          style={{ left: pos!.left, top: pos!.top, width: pos!.width }}
          // Garder le focus dans le champ : sans cela le clic ferme la liste avant d'etre pris
          onMouseDown={(e) => e.preventDefault()}
        >
          {items.map((p, i) => (
            <li
              key={p.label}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => accepter(p, false)}
              className={`px-3 min-h-[34px] flex items-center justify-between gap-2 text-[13px] cursor-pointer ${i === active ? 'bg-slate-100 dark:bg-dk-elevated text-slate-900 dark:text-dk-text' : 'text-slate-700 dark:text-dk-text-soft'}`}
            >
              <span className="truncate">{p.label}</span>
              {i === active && (
                <span className="hidden sm:inline shrink-0 text-[11px] font-semibold text-slate-400 dark:text-dk-muted" aria-hidden="true">↵</span>
              )}
            </li>
          ))}
        </ul>,
        document.body
      )}
    </div>
  );
}
