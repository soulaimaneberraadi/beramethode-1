/**
 * Caisse — vente au comptoir.
 *
 * Ce n'est PAS un nouveau stock : c'est une façade sur celui qui existe. Le
 * scan remplit un panier local, et RIEN ne bouge dans le stock tant que
 * l'encaissement n'est pas validé — une pièce scannée puis retirée du panier
 * ne doit jamais avoir été sortie.
 *
 * L'écran est plein cadre et sans menus : au comptoir, on regarde le client,
 * pas l'interface.
 */
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ModelData } from '../types';
import { tx } from '../lib/i18n';
import { fmt } from '../app/constants';
import { resolveScan, attachScannerListener } from '../lib/scanner';
import type { AtelierClient } from './soustraitance/ClientsPanel';
import {
  X, ScanLine, Search, Trash2, Plus, Minus, Loader2, AlertTriangle, User, Store, Check, ArrowLeft,
  Receipt, RotateCcw, Banknote, MoreVertical, Eye, EyeOff, ArrowLeftRight, RefreshCw,
} from 'lucide-react';

export type CaisseLigne = {
  /** clé stable : modèle + cellule */
  key: string;
  model: ModelData;
  couleur: string;
  taille: string;
  qte: number;
  /** prix unitaire appliqué (canal MAGASIN par défaut, modifiable) */
  prix: number;
  /** l'opérateur a fixé le prix lui-même : le tarif serveur ne l'écrase plus */
  prixTouched?: boolean;
};

export type TypeVente = 'BOUTIQUE' | 'DETAIL' | 'GROS';

/** Une vente au comptoir telle que le serveur la rend : un ticket regroupe
 *  toutes les sorties de stock d'un meme encaissement, quel que soit le
 *  nombre de modeles vendus. */
export interface CaisseTicket {
  ticket: string;
  heure: string | null;
  clientId: string | null;
  clientNom: string | null;
  modePaiement: string | null;
  typeVente: string | null;
  factureId: string | null;
  factureNumero: string | null;
  factureStatut: string | null;
  pieces: number;
  total: number;
  lignes: Array<{
    id: string;
    modelId: string;
    modelNom: string;
    couleur: string | null;
    taille: string | null;
    quantite: number;
    prixUnitaire: number;
  }>;
}

export interface CaisseJournal {
  date: string;
  tickets: CaisseTicket[];
  parMode: Record<string, { pieces: number; total: number; tickets: number }>;
  totaux: { tickets: number; pieces: number; total: number };
}

export type CaissePaiement = 'ESPECES' | 'CARTE' | 'CHEQUE' | 'VIREMENT';

export interface CaisseProps {
  open: boolean;
  onClose: () => void;
  /** modèles ET articles achetés, déjà fondus dans la même forme */
  candidats: ModelData[];
  clients: AtelierClient[];
  /** modelId → « couleur|taille » → quantité réellement disponible */
  stockMatrix: Map<string, Map<string, number>>;
  currency: string;
  lang: string;
  /** Enregistre la vente. Renvoie un message d'erreur, ou null si tout est passé. */
  onEncaisser: (payload: {
    lignes: CaisseLigne[];
    clientId: string | null;
    clientNom: string | null;
    paiement: CaissePaiement;
    remiseGlobale: number;
    total: number;
    /** GROS / DETAIL / BOUTIQUE : le segment tarifaire de la vente. */
    typeVente: TypeVente;
    /** Une facture doit suivre cette vente. */
    facture: boolean;
    /** Especes : ce que le client a tendu, et ce qu'on lui rend. */
    recu: number | null;
    rendu: number | null;
  }) => Promise<string | null>;
  /** Mode statique : aucune API, la caisse ne peut pas enregistrer. */
  isStatic?: boolean;
  /** Ouverte depuis un modèle précis : sa grille est déjà à l'écran. */
  initialRecherche?: string;
  /** Ouvre la création d'un client sans quitter le comptoir. */
  onCreateClient?: () => void;
  /** Un ticket vient d'etre annule : les pieces sont revenues au stock, et
   *  l'ecran appelant doit relire ses mouvements. Sans ca, la caisse
   *  continuerait de croire la marchandise vendue. */
  onTicketAnnule?: () => void | Promise<void>;
}

const FACTURE_AUTO_KEY = 'bera_caisse_facture_auto';
const MISE_EN_PAGE_KEY = 'bera_caisse_mise_en_page';

/**
 * Reglages d'affichage du comptoir.
 *
 * Un poste de caisse n'est pas l'autre : sur un grand ecran on veut tout
 * voir, sur un portable il faut choisir. Plutot que d'imposer une mise en
 * page moyenne qui ne va a personne, chaque poste range la sienne — elle est
 * gardee en local, elle ne suit pas le compte d'un poste a l'autre.
 *
 * Ce sont des reglages d'AFFICHAGE : masquer un champ ne change jamais ce qui
 * est enregistre. Le segment tarifaire masque reste celui qui est actif, et
 * le mode de reglement masque reste celui qui part avec la vente — sinon un
 * ecran simplifie ferait vendre au mauvais prix.
 */
type MiseEnPage = {
  /** Le panier passe a gauche : certains caissiers sont gauchers, et sur un
   *  ecran tactile la main qui compose cache la colonne qu'elle touche. */
  panierAGauche: boolean;
  /** Part de l'ecran laissee au panier sur grand ecran. */
  largeurPanier: 'etroit' | 'moyen' | 'large';
  /** Vignettes photo : sur un petit ecran, une liste de noms tient plus. */
  photos: boolean;
  champs: {
    typeVente: boolean;
    client: boolean;
    facture: boolean;
    paiement: boolean;
    remise: boolean;
  };
};

const MISE_EN_PAGE_DEFAUT: MiseEnPage = {
  panierAGauche: false,
  largeurPanier: 'moyen',
  photos: true,
  champs: { typeVente: true, client: true, facture: true, paiement: true, remise: true },
};

const lireMiseEnPage = (): MiseEnPage => {
  try {
    const brut = JSON.parse(localStorage.getItem(MISE_EN_PAGE_KEY) || 'null');
    if (!brut || typeof brut !== 'object') return MISE_EN_PAGE_DEFAUT;
    return {
      ...MISE_EN_PAGE_DEFAUT,
      ...brut,
      champs: { ...MISE_EN_PAGE_DEFAUT.champs, ...(brut.champs || {}) },
    };
  } catch { return MISE_EN_PAGE_DEFAUT; }
};

const LARGEURS: Record<MiseEnPage['largeurPanier'], string> = {
  etroit: 'lg:w-2/5',
  moyen: 'lg:w-1/2',
  large: 'lg:w-3/5',
};

const cellKey = (c: string, t: string) => `${c || ''}|${t || ''}`;

/**
 * Une pastille de couleur approchée, à partir du NOM saisi dans la fiche —
 * le modèle ne stocke aucun code hexadécimal. Ce qu'on ne sait pas teindre
 * reste gris : mieux vaut une pastille neutre qu'une fausse couleur, qui
 * ferait sortir la mauvaise pièce du rayon.
 */
const TEINTES: Array<[RegExp, string]> = [
  [/noir|black|أسود/i, '#111827'],
  [/blanc|white|أبيض/i, '#f8fafc'],
  [/rouge|red|أحمر/i, '#dc2626'],
  [/bleu|blue|أزرق/i, '#2563eb'],
  [/marine|navy/i, '#1e3a8a'],
  [/ciel|sky|turquoise|cyan/i, '#38bdf8'],
  [/vert|green|أخضر/i, '#16a34a'],
  [/emeraude|émeraude|emerald/i, '#059669'],
  [/jaune|yellow|أصفر|dore|doré|gold/i, '#eab308'],
  [/orange|برتقالي/i, '#f97316'],
  [/rose|pink|وردي/i, '#ec4899'],
  [/violet|purple|mauve/i, '#7c3aed'],
  [/gris|grey|gray|رمادي/i, '#9ca3af'],
  [/beige|creme|crème|ecru|écru/i, '#e7d8c0'],
  [/marron|brown|kaki|khaki|بني/i, '#8b5a2b'],
];
const teinteDe = (nom: string): string | null => {
  for (const [re, hex] of TEINTES) if (re.test(nom || '')) return hex;
  return null;
};

/** Vignette du modèle : la photo si elle existe, sinon ses initiales. */
const Vignette: React.FC<{ model: ModelData; className?: string }> = ({ model, className = 'w-12 h-12' }) => {
  const src = (model as any).image || (model as any).photo || '';
  const nom = model.meta_data?.nom_modele || '';
  if (src) {
    return <img src={src} alt="" className={`${className} rounded-lg object-cover bg-slate-100 dark:bg-dk-elevated flex-none`} />;
  }
  return (
    <div className={`${className} rounded-lg bg-slate-100 dark:bg-dk-elevated flex-none flex items-center justify-center text-[10px] font-black text-slate-400 dark:text-dk-muted`}>
      {nom.slice(0, 2).toUpperCase() || '—'}
    </div>
  );
};

const Caisse: React.FC<CaisseProps> = ({
  open, onClose, candidats, clients, stockMatrix, currency, lang, onEncaisser, isStatic,
  initialRecherche, onCreateClient, onTicketAnnule,
}) => {
  const [lignes, setLignes] = useState<CaisseLigne[]>([]);
  const [clientId, setClientId] = useState<string>('');
  const [clientLibre, setClientLibre] = useState('');
  const [clientQuery, setClientQuery] = useState('');
  /** Segment tarifaire choisi a la main quand le client n'a pas de fiche. */
  const [typeVente, setTypeVente] = useState<TypeVente>('BOUTIQUE');
  /** Reglage, pas question : celui qui facture toujours ne veut pas cocher a
   *  chaque vente. Retenu par poste de caisse. */
  const [factureAuto, setFactureAuto] = useState(() => {
    try { return localStorage.getItem(FACTURE_AUTO_KEY) === '1'; } catch { return false; }
  });
  const [paiement, setPaiement] = useState<CaissePaiement>('ESPECES');
  const [remiseGlobale, setRemiseGlobale] = useState<number | ''>('');
  const [recherche, setRecherche] = useState('');
  /** Modèle ouvert : le comptoir choisit un vêtement, PUIS sa couleur et sa
   *  taille. Tant qu'aucun n'est ouvert, on montre le rayon. */
  const [modeleOuvert, setModeleOuvert] = useState<ModelData | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [encaisse, setEncaisse] = useState<number | ''>('');
  /** Telephone : le rayon et le panier ne tiennent pas cote a cote. On en
   *  montre UN seul, plein ecran, et une barre du bas fait la navette. Sur
   *  grand ecran les deux volets reviennent, et cet etat n'a plus d'effet. */
  const [voletMobile, setVoletMobile] = useState<'rayon' | 'panier'>('rayon');
  const [mep, setMep] = useState<MiseEnPage>(lireMiseEnPage);
  const [reglagesOuverts, setReglagesOuverts] = useState(false);
  useEffect(() => {
    try { localStorage.setItem(MISE_EN_PAGE_KEY, JSON.stringify(mep)); } catch { /* le reglage vaut alors pour cette session */ }
  }, [mep]);
  const basculerChamp = useCallback((k: keyof MiseEnPage['champs']) => {
    setMep(m => ({ ...m, champs: { ...m.champs, [k]: !m.champs[k] } }));
  }, []);
  const lignesRef = useRef<CaisseLigne[]>([]);
  lignesRef.current = lignes;

  /* ── La journee ───────────────────────────────────────────────────────────
   *  Le soir, la question est toujours la meme : combien de tickets, et
   *  combien dans chaque mode de reglement. Le journal la pose au serveur —
   *  jamais au panier a l'ecran, qui ne connait que la vente en cours.
   */
  const [journeeOuverte, setJourneeOuverte] = useState(false);
  const [journalJour, setJournalJour] = useState(() => new Date().toISOString().slice(0, 10));
  const [journal, setJournal] = useState<CaisseJournal | null>(null);
  const [journalCharge, setJournalCharge] = useState(false);
  const [journalErreur, setJournalErreur] = useState<string | null>(null);
  /** Ticket dont l'annulation attend confirmation : au comptoir, un clic de
   *  travers ne doit pas defaire une vente encaissee. */
  const [ticketAConfirmer, setTicketAConfirmer] = useState<string | null>(null);
  const [annulEnCours, setAnnulEnCours] = useState<string | null>(null);

  const chargerJournal = useCallback(async (jour: string) => {
    if (isStatic) { setJournal(null); setJournalErreur(null); return; }
    setJournalCharge(true);
    setJournalErreur(null);
    try {
      const res = await fetch(`/api/subcontract/caisse/journal?date=${encodeURIComponent(jour)}`, { credentials: 'include' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || 'HTTP ' + res.status);
      setJournal(body as CaisseJournal);
    } catch (err: any) {
      setJournal(null);
      setJournalErreur(err?.message || String(err));
    } finally {
      setJournalCharge(false);
    }
  }, [isStatic]);

  useEffect(() => {
    if (!open || !journeeOuverte) return;
    void chargerJournal(journalJour);
  }, [open, journeeOuverte, journalJour, chargerJournal]);

  /** Annule un ticket : les pieces reviennent au stock cote serveur, et
   *  l'ecran appelant relit ses mouvements pour que le rayon suive. */
  const annulerTicket = useCallback(async (ticket: string) => {
    setAnnulEnCours(ticket);
    setJournalErreur(null);
    try {
      const res = await fetch(`/api/subcontract/caisse/ticket/${encodeURIComponent(ticket)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || 'HTTP ' + res.status);
      setTicketAConfirmer(null);
      await chargerJournal(journalJour);
      await onTicketAnnule?.();
    } catch (err: any) {
      setJournalErreur(err?.message || String(err));
    } finally {
      setAnnulEnCours(null);
    }
  }, [chargerJournal, journalJour, onTicketAnnule]);

  const client = clients.find(c => c.id === clientId) || null;
  /** Le client fiche impose son segment : son tarif est deja negocie. */
  const typeEffectif: TypeVente = (client?.type as TypeVente) || typeVente;
  /** Un revendeur repart toujours avec une facture — la case ne se decoche pas. */
  const factureRequise = typeEffectif === 'GROS' ? true : factureAuto;

  useEffect(() => {
    try { localStorage.setItem(FACTURE_AUTO_KEY, factureAuto ? '1' : '0'); } catch { /* stockage refuse : le reglage vaut pour cette session */ }
  }, [factureAuto]);

  const clientsTrouves = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return [];
    return clients
      .filter(c => [c.nom, c.tel, c.ville, c.ice].filter(Boolean).some(v => String(v).toLowerCase().includes(q)))
      .slice(0, 20);
  }, [clientQuery, clients]);

  /** Un « pip » sonore : au comptoir on n'a pas le temps de lire un message. */
  const pip = useCallback((ok: boolean) => {
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = ok ? 880 : 220;
      gain.gain.value = 0.05;
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + (ok ? 0.08 : 0.22));
    } catch { /* le son est un confort, jamais un blocage */ }
  }, []);

  const dispoDe = useCallback((modelId: string, couleur: string, taille: string) => {
    return Number(stockMatrix.get(modelId)?.get(cellKey(couleur, taille)) || 0);
  }, [stockMatrix]);

  /** Le stock déjà engagé dans le panier compte : sans ça on vendrait deux fois
   *  la même pièce en scannant le même tiki. */
  const restantDe = useCallback((modelId: string, couleur: string, taille: string) => {
    const enPanier = lignesRef.current
      .filter(l => l.model.id === modelId && l.couleur === couleur && l.taille === taille)
      .reduce((a, l) => a + l.qte, 0);
    return dispoDe(modelId, couleur, taille) - enPanier;
  }, [dispoDe]);

  const ajouter = useCallback((model: ModelData, couleur: string, taille: string) => {
    const nom = model.meta_data?.nom_modele || '';
    if (restantDe(model.id, couleur, taille) <= 0) {
      pip(false);
      setFlash({ ok: false, msg: tx(lang, {
        fr: `Rupture : ${nom} ${couleur} ${taille}`.trim(),
        ar: `نافد: ${nom} ${couleur} ${taille}`.trim(),
        en: `Out of stock: ${nom} ${couleur} ${taille}`.trim(),
        es: `Sin stock: ${nom} ${couleur} ${taille}`.trim(),
        pt: `Sem stock: ${nom} ${couleur} ${taille}`.trim(),
        tr: `Stok yok: ${nom} ${couleur} ${taille}`.trim(),
      }) });
      return;
    }
    const key = `${model.id}::${cellKey(couleur, taille)}`;
    setLignes(prev => {
      const i = prev.findIndex(l => l.key === key);
      if (i >= 0) {
        const copy = [...prev];
        copy[i] = { ...copy[i], qte: copy[i].qte + 1 };
        return copy;
      }
      return [...prev, { key, model, couleur, taille, qte: 1, prix: 0 }];
    });
    pip(true);
    setFlash({ ok: true, msg: `${nom || model.id} ${couleur} ${taille}`.trim() });
  }, [restantDe, pip, lang]);

  /** Le tarif « Ma boutique » vient du serveur, comme partout ailleurs : la
   *  caisse ne recalcule aucun prix, elle demande celui qui fait foi. */
  useEffect(() => {
    if (!open || isStatic) return;
    const aChercher = lignes.filter(l => !l.prixTouched && l.prix === 0);
    if (aChercher.length === 0) return;
    let alive = true;
    Promise.all(aChercher.map(l =>
      fetch(`/api/prix/resolve?modelId=${encodeURIComponent(l.model.id)}&qty=${l.qte}&canal=MAGASIN&${client ? `clientId=${encodeURIComponent(client.id)}` : `type=${typeEffectif}`}`, { credentials: 'include' })
        .then(r => (r.ok ? r.json() : null))
        .then((d: any) => [l.key, d?.prix == null ? null : Number(d.prix)] as const)
        .catch(() => [l.key, null] as const)
    )).then(pairs => {
      if (!alive) return;
      const map = new Map(pairs);
      setLignes(prev => prev.map(l => {
        const p = map.get(l.key);
        return p != null && !l.prixTouched ? { ...l, prix: Number(p.toFixed(2)) } : l;
      }));
    });
    return () => { alive = false; };
  }, [open, isStatic, lignes, client, typeEffectif]);

  /** Le lecteur reste actif en permanence tant que la caisse est ouverte. */
  useEffect(() => {
    if (!open) return;
    return attachScannerListener(code => {
      const hit = resolveScan(candidats, code);
      if (!hit) {
        pip(false);
        setFlash({ ok: false, msg: tx(lang, { fr: 'Tiki inconnu.', ar: 'تيكي غير معروف.', en: 'Unknown label.', es: 'Etiqueta desconocida.', pt: 'Etiqueta desconhecida.', tr: 'Bilinmeyen etiket.' }) });
        return;
      }
      if (!hit.taille && !hit.couleur) {
        pip(false);
        setFlash({ ok: false, msg: tx(lang, { fr: 'Tiki sans taille ni couleur : choisissez la pièce à la main.', ar: 'تيكي بلا مقاس ولا لون: اختر القطعة يدوياً.', en: 'Label without size or color: pick the item manually.', es: 'Etiqueta sin talla ni color: elija la pieza a mano.', pt: 'Etiqueta sem tamanho nem cor: escolha a peca a mao.', tr: 'Beden veya renk yok: parcayi elle secin.' }) });
        setRecherche(hit.model.meta_data?.nom_modele || '');
        return;
      }
      ajouter(hit.model, hit.couleur, hit.taille);
    });
  }, [open, candidats, ajouter, pip, lang]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2200);
    return () => clearTimeout(t);
  }, [flash]);

  /** Ouverture depuis un modèle : on part de sa grille, l'opérateur n'a pas à
   *  retaper le nom qu'il vient de cliquer. */
  useEffect(() => {
    if (open) { setRecherche(initialRecherche || ''); setVoletMobile('rayon'); }
  }, [open, initialRecherche]);

  /** Plein cadre : la page derriere ne doit pas defiler sous le comptoir. */
  useEffect(() => {
    if (!open) return;
    const avant = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = avant; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  /** Le catalogue du comptoir : un modèle par vignette, avec sa photo et ce
   *  qu'il reste VRAIMENT (stock des mouvements, jamais les compteurs de
   *  commande). Sans photo, l'opérateur cherche un nom au lieu de reconnaître
   *  un vêtement — c'est plus lent que de fouiller le rayon. */
  const catalogue = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const out: Array<{ model: ModelData; total: number; couleurs: string[] }> = [];
    for (const m of candidats) {
      const cells = stockMatrix.get(m.id);
      if (!cells) continue;
      let total = 0;
      const couleurs = new Set<string>();
      cells.forEach((qte, k) => {
        if (qte <= 0) return;
        total += qte;
        const c = k.split('|')[0];
        if (c) couleurs.add(c);
      });
      if (total <= 0) continue;
      if (q) {
        const nom = String(m.meta_data?.nom_modele || '').toLowerCase();
        const ref = String(m.meta_data?.reference || '').toLowerCase();
        if (!nom.includes(q) && !ref.includes(q)) continue;
      }
      out.push({ model: m, total, couleurs: [...couleurs] });
    }
    return out.sort((a, b) => b.total - a.total);
  }, [recherche, candidats, stockMatrix]);

  /** Les cellules du modèle ouvert, rangées couleur par couleur : on choisit
   *  d'abord la couleur (c'est ce que le client montre), puis la taille. */
  const grilleModele = useMemo(() => {
    if (!modeleOuvert) return [];
    const cells = stockMatrix.get(modeleOuvert.id);
    if (!cells) return [];
    const parCouleur = new Map<string, Array<{ taille: string; dispo: number }>>();
    cells.forEach((qte, k) => {
      if (qte <= 0) return;
      const [couleur, taille] = k.split('|');
      const arr = parCouleur.get(couleur) || [];
      arr.push({ taille, dispo: qte });
      parCouleur.set(couleur, arr);
    });
    return [...parCouleur.entries()].map(([couleur, tailles]) => ({
      couleur,
      tailles: tailles.sort((a, b) => a.taille.localeCompare(b.taille, undefined, { numeric: true })),
    }));
  }, [modeleOuvert, stockMatrix]);

  const sousTotal = useMemo(
    () => lignes.reduce((a, l) => a + l.qte * (Number(l.prix) || 0), 0),
    [lignes],
  );
  const remise = Number(remiseGlobale) || 0;
  const total = Math.max(0, sousTotal - remise);
  const rendu = encaisse === '' ? null : Number(encaisse) - total;
  const nbPieces = lignes.reduce((a, l) => a + l.qte, 0);


  const reset = () => {
    setLignes([]); setRemiseGlobale(''); setEncaisse(''); setClientId('');
    setClientLibre(''); setErreur(null); setRecherche(''); setClientQuery('');
  };

  const valider = async () => {
    if (lignes.length === 0) return;
    if (lignes.some(l => !(Number(l.prix) > 0))) {
      setErreur(tx(lang, { fr: 'Une ligne est sans prix.', ar: 'كاين سطر بلا ثمن.', en: 'A line has no price.', es: 'Una linea no tiene precio.', pt: 'Uma linha sem preco.', tr: 'Bir satirin fiyati yok.' }));
      return;
    }
    // Une facture se rattache a une FICHE client : sans elle, elle ne
    // remonterait dans aucun compte, et le gros ne se vend pas anonymement.
    if (factureRequise && !client) {
      setErreur(tx(lang, { fr: 'Choisissez un client : une facture ne peut pas etre anonyme.', ar: 'اختر زبوناً: الفاتورة ما تكونش مجهولة.', en: 'Pick a customer: an invoice cannot be anonymous.', es: 'Elija un cliente: una factura no puede ser anonima.', pt: 'Escolha um cliente: uma fatura nao pode ser anonima.', tr: 'Bir musteri secin: fatura anonim olamaz.' }));
      return;
    }
    setSaving(true); setErreur(null);
    const msg = await onEncaisser({
      lignes,
      clientId: client?.id || null,
      clientNom: client?.nom || (clientLibre.trim() || null),
      paiement,
      remiseGlobale: remise,
      total,
      typeVente: typeEffectif,
      facture: factureRequise,
      recu: paiement === 'ESPECES' && encaisse !== '' ? Number(encaisse) : null,
      rendu: paiement === 'ESPECES' && rendu != null ? rendu : null,
    });
    setSaving(false);
    if (msg) { setErreur(msg); pip(false); return; }
    pip(true);
    reset();
    // Vente close : le comptoir repart du rayon, pas d'un panier vide.
    setVoletMobile('rayon');
    setFlash({ ok: true, msg: tx(lang, { fr: 'Vente enregistrée.', ar: 'تسجّلت البيعة.', en: 'Sale recorded.', es: 'Venta registrada.', pt: 'Venda registada.', tr: 'Satis kaydedildi.' }) });
  };

  if (!open) return null;

  const T = {
    titre: tx(lang, { fr: 'Caisse', ar: 'الصندوق', en: 'Checkout', es: 'Caja', pt: 'Caixa', tr: 'Kasa' }),
    scan: tx(lang, { fr: 'Scannez un tiki', ar: 'امسح التيكي', en: 'Scan a label', es: 'Escanee una etiqueta', pt: 'Leia uma etiqueta', tr: 'Etiket okutun' }),
    chercher: tx(lang, { fr: 'Chercher un article…', ar: 'قلّب على منتج…', en: 'Search an item…', es: 'Buscar un articulo…', pt: 'Procurar artigo…', tr: 'Urun ara…' }),
    panier: tx(lang, { fr: 'Panier', ar: 'السلّة', en: 'Cart', es: 'Cesta', pt: 'Cesto', tr: 'Sepet' }),
    vide: tx(lang, { fr: 'Le panier est vide. Scannez un tiki pour commencer.', ar: 'السلّة خاوية. امسح تيكي باش تبدا.', en: 'The cart is empty. Scan a label to start.', es: 'La cesta esta vacia. Escanee una etiqueta.', pt: 'O cesto esta vazio. Leia uma etiqueta.', tr: 'Sepet bos. Baslamak icin etiket okutun.' }),
    client: tx(lang, { fr: 'Client', ar: 'الزبون', en: 'Customer', es: 'Cliente', pt: 'Cliente', tr: 'Musteri' }),
    passage: tx(lang, { fr: 'Client de passage', ar: 'زبون عابر', en: 'Walk-in customer', es: 'Cliente ocasional', pt: 'Cliente de passagem', tr: 'Gecici musteri' }),
    reglement: tx(lang, { fr: 'Reglement', ar: 'طريقة الأداء', en: 'Payment', es: 'Pago', pt: 'Pagamento', tr: 'Odeme' }),
    remise: tx(lang, { fr: 'Remise', ar: 'التخفيض', en: 'Discount', es: 'Descuento', pt: 'Desconto', tr: 'Indirim' }),
    total: tx(lang, { fr: 'Total', ar: 'المجموع', en: 'Total', es: 'Total', pt: 'Total', tr: 'Toplam' }),
    recu: tx(lang, { fr: 'Recu', ar: 'المدفوع', en: 'Received', es: 'Recibido', pt: 'Recebido', tr: 'Alinan' }),
    rendu: tx(lang, { fr: 'A rendre', ar: 'الصرف', en: 'Change', es: 'Cambio', pt: 'Troco', tr: 'Para ustu' }),
    encaisser: tx(lang, { fr: 'Encaisser', ar: 'خلّص', en: 'Charge', es: 'Cobrar', pt: 'Cobrar', tr: 'Tahsil et' }),
    chercherClient: tx(lang, { fr: 'Chercher un client…', ar: 'قلّب على زبون…', en: 'Search a customer…', es: 'Buscar un cliente…', pt: 'Procurar cliente…', tr: 'Musteri ara…' }),
    nouveauClient: tx(lang, { fr: 'Nouveau client', ar: 'زبون جديد', en: 'New customer', es: 'Nuevo cliente', pt: 'Novo cliente', tr: 'Yeni musteri' }),
    aucunClient: tx(lang, { fr: 'Aucun client trouve.', ar: 'ما لقيت حتى زبون.', en: 'No customer found.', es: 'Ningun cliente encontrado.', pt: 'Nenhum cliente encontrado.', tr: 'Musteri bulunamadi.' }),
    retirerClient: tx(lang, { fr: 'Retirer le client', ar: 'إزالة الزبون', en: 'Remove customer', es: 'Quitar cliente', pt: 'Remover cliente', tr: 'Musteriyi kaldir' }),
    typeDuClient: tx(lang, { fr: 'Le segment vient de la fiche du client.', ar: 'الصنف جاي من بطاقة الزبون.', en: 'The segment comes from the customer record.', es: 'El segmento viene de la ficha del cliente.', pt: 'O segmento vem da ficha do cliente.', tr: 'Segment musteri kartindan gelir.' }),
    factureAuto: tx(lang, { fr: 'Facture automatique', ar: 'فاتورة أوتوماتيكية', en: 'Automatic invoice', es: 'Factura automatica', pt: 'Fatura automatica', tr: 'Otomatik fatura' }),
    imposee: tx(lang, { fr: 'imposee en gros', ar: 'إجبارية فالجملة', en: 'required for wholesale', es: 'obligatoria al por mayor', pt: 'obrigatoria no grosso', tr: 'toptanda zorunlu' }),
    retour: tx(lang, { fr: 'Retour', ar: 'رجوع', en: 'Back', es: 'Volver', pt: 'Voltar', tr: 'Geri' }),
    rienEnStock: tx(lang, { fr: 'Aucune piece en stock.', ar: 'ما كاين حتى قطعة فالستوك.', en: 'No item in stock.', es: 'Ninguna pieza en stock.', pt: 'Nenhuma peca em stock.', tr: 'Stokta parca yok.' }),
    reglages: tx(lang, { fr: 'Mise en page', ar: 'ترتيب الشاشة', en: 'Layout', es: 'Disposicion', pt: 'Disposicao', tr: 'Yerlesim' }),
    panierAGauche: tx(lang, { fr: 'Panier a gauche', ar: 'السلّة على اليسار', en: 'Cart on the left', es: 'Cesta a la izquierda', pt: 'Cesto a esquerda', tr: 'Sepet solda' }),
    largeur: tx(lang, { fr: 'Largeur du panier', ar: 'عرض السلّة', en: 'Cart width', es: 'Ancho de la cesta', pt: 'Largura do cesto', tr: 'Sepet genisligi' }),
    etroit: tx(lang, { fr: 'Etroit', ar: 'ضيّق', en: 'Narrow', es: 'Estrecho', pt: 'Estreito', tr: 'Dar' }),
    moyen: tx(lang, { fr: 'Moyen', ar: 'متوسّط', en: 'Medium', es: 'Medio', pt: 'Medio', tr: 'Orta' }),
    large: tx(lang, { fr: 'Large', ar: 'واسع', en: 'Wide', es: 'Ancho', pt: 'Largo', tr: 'Genis' }),
    photos: tx(lang, { fr: 'Photos des articles', ar: 'صور المنتجات', en: 'Item photos', es: 'Fotos de articulos', pt: 'Fotos dos artigos', tr: 'Urun fotograflari' }),
    champs: tx(lang, { fr: 'Champs affiches', ar: 'الحقول الظاهرة', en: 'Visible fields', es: 'Campos visibles', pt: 'Campos visiveis', tr: 'Gorunen alanlar' }),
    champMasque: tx(lang, { fr: 'Masquer un champ ne change rien a la vente enregistree.', ar: 'إخفاء حقل ما كيبدّلش البيعة المسجّلة.', en: 'Hiding a field does not change the recorded sale.', es: 'Ocultar un campo no cambia la venta registrada.', pt: 'Ocultar um campo nao muda a venda registada.', tr: 'Bir alani gizlemek kaydedilen satisi degistirmez.' }),
    defaut: tx(lang, { fr: 'Reglages par defaut', ar: 'الإعدادات الأصلية', en: 'Reset layout', es: 'Ajustes originales', pt: 'Definicoes originais', tr: 'Varsayilana don' }),
    voirPanier: tx(lang, { fr: 'Voir le panier', ar: 'شوف السلّة', en: 'View cart', es: 'Ver la cesta', pt: 'Ver o cesto', tr: 'Sepeti gor' }),
    auRayon: tx(lang, { fr: 'Au rayon', ar: 'للرفوف', en: 'Back to shelf', es: 'Al estante', pt: 'As prateleiras', tr: 'Rafa don' }),
    videz: tx(lang, { fr: 'Vider', ar: 'فرّغ', en: 'Clear', es: 'Vaciar', pt: 'Limpar', tr: 'Temizle' }),
    journee: tx(lang, { fr: 'Journee', ar: 'اليومية', en: 'Day', es: 'Jornada', pt: 'Jornada', tr: 'Gun' }),
    tickets: tx(lang, { fr: 'Tickets', ar: 'التيكيات', en: 'Tickets', es: 'Tickets', pt: 'Talões', tr: 'Fisler' }),
    pieces: tx(lang, { fr: 'Pieces', ar: 'القطع', en: 'Items', es: 'Piezas', pt: 'Pecas', tr: 'Parca' }),
    encaisseJour: tx(lang, { fr: 'Encaisse', ar: 'المحصّل', en: 'Collected', es: 'Cobrado', pt: 'Cobrado', tr: 'Tahsil edilen' }),
    aucunTicket: tx(lang, { fr: 'Aucune vente ce jour.', ar: 'ما كاين حتى بيعة فهاد النهار.', en: 'No sale on this day.', es: 'Ninguna venta este dia.', pt: 'Nenhuma venda neste dia.', tr: 'Bu gun satis yok.' }),
    annuler: tx(lang, { fr: 'Annuler le ticket', ar: 'إلغاء التيكي', en: 'Cancel ticket', es: 'Anular ticket', pt: 'Anular talao', tr: 'Fisi iptal et' }),
    confirmerAnnul: tx(lang, { fr: 'Confirmer : les pieces reviennent au stock', ar: 'أكّد: القطع كترجع للستوك', en: 'Confirm: items return to stock', es: 'Confirmar: las piezas vuelven al stock', pt: 'Confirmar: as pecas voltam ao stock', tr: 'Onayla: parcalar stoga doner' }),
    renoncer: tx(lang, { fr: 'Renoncer', ar: 'تراجع', en: 'Cancel', es: 'Renunciar', pt: 'Desistir', tr: 'Vazgec' }),
    modeAutre: tx(lang, { fr: 'Non precise', ar: 'غير محدّد', en: 'Unspecified', es: 'Sin precisar', pt: 'Nao indicado', tr: 'Belirtilmemis' }),
    journeeStatique: tx(lang, { fr: "Mode statique : la journee de caisse vient du serveur.", ar: 'الوضع الساكن: يومية الصندوق كتجي من السيرفر.', en: 'Static mode: the cash journal comes from the server.', es: 'Modo estatico: la jornada viene del servidor.', pt: 'Modo estatico: a jornada vem do servidor.', tr: 'Statik mod: kasa gunlugu sunucudan gelir.' }),
    statique: tx(lang, { fr: "Mode statique : la caisse a besoin du serveur pour enregistrer une vente.", ar: 'الوضع الساكن: الصندوق كيحتاج السيرفر باش يسجّل البيعة.', en: 'Static mode: the checkout needs the server to record a sale.', es: 'Modo estatico: la caja necesita el servidor.', pt: 'Modo estatico: a caixa precisa do servidor.', tr: 'Statik mod: kasa sunucuya ihtiyac duyar.' }),
  };

  const typesVente: Array<{ v: TypeVente; l: string }> = [
    { v: 'BOUTIQUE', l: tx(lang, { fr: 'Ma boutique', ar: 'محلّي', en: 'My shop', es: 'Mi tienda', pt: 'Minha loja', tr: 'Magazam' }) },
    { v: 'DETAIL', l: tx(lang, { fr: 'Detail', ar: 'بالتقسيط', en: 'Retail', es: 'Detalle', pt: 'Retalho', tr: 'Perakende' }) },
    { v: 'GROS', l: tx(lang, { fr: 'Gros', ar: 'بالجملة', en: 'Wholesale', es: 'Por mayor', pt: 'Grosso', tr: 'Toptan' }) },
  ];

  const modes: Array<{ v: CaissePaiement; l: string }> = [
    { v: 'ESPECES', l: tx(lang, { fr: 'Especes', ar: 'نقداً', en: 'Cash', es: 'Efectivo', pt: 'Dinheiro', tr: 'Nakit' }) },
    { v: 'CARTE', l: tx(lang, { fr: 'Carte', ar: 'بطاقة', en: 'Card', es: 'Tarjeta', pt: 'Cartao', tr: 'Kart' }) },
    { v: 'CHEQUE', l: tx(lang, { fr: 'Cheque', ar: 'شيك', en: 'Cheque', es: 'Cheque', pt: 'Cheque', tr: 'Cek' }) },
    { v: 'VIREMENT', l: tx(lang, { fr: 'Virement', ar: 'تحويل', en: 'Transfer', es: 'Transferencia', pt: 'Transferencia', tr: 'Havale' }) },
  ];

  /* Portal sur <body> : un ancetre anime (transform Framer Motion) redefinit
   * le repere des elements `fixed`, et l'ecran plein cadre se retrouvait
   * decale sous l'entete, laissant depasser la barre d'outils de la page. */
  return createPortal(
    <div className="fixed inset-0 z-[120] flex flex-col bg-slate-900/40 pt-2 lg:bg-transparent lg:pt-0">
      {/* Telephone : une feuille qui monte du bas, comme les fiches du reste
          de l'application — coins arrondis et poignee. Sur grand ecran la
          feuille occupe tout, et l'habillage disparait. */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-slate-100 dark:bg-dk-bg rounded-t-3xl shadow-2xl lg:rounded-none lg:shadow-none">
        <div className="lg:hidden shrink-0 flex justify-center pt-2.5 pb-1 bg-white dark:bg-dk-surface">
          <span className="h-1.5 w-10 rounded-full bg-slate-300 dark:bg-dk-border" />
        </div>
      {/* Barre du haut : ce que la caisse fait, et comment en sortir. */}
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-3 bg-white dark:bg-dk-surface border-b border-slate-200 dark:border-dk-border shrink-0">
        <Store className="w-5 h-5 text-indigo-600 dark:text-dk-accent shrink-0" />
        <span className="font-extrabold text-slate-800 dark:text-dk-text text-sm sm:text-base truncate">{T.titre}</span>
        <span className="hidden sm:flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
          <ScanLine className="w-4 h-4 animate-pulse" /> {T.scan}
        </span>
        {/* Le panier, en discret, tout en haut : savoir combien de pieces sont
            engagees sans quitter le rayon des yeux. */}
        {nbPieces > 0 && (
          <button
            onClick={() => setVoletMobile('panier')}
            className="ml-1 sm:ml-2 px-2.5 py-1 rounded-full text-[11px] font-bold text-slate-500 dark:text-dk-muted bg-slate-100/70 dark:bg-dk-elevated/60 shrink-0 lg:cursor-default"
          >
            {T.panier} · {nbPieces}
          </button>
        )}
        <div className="flex-1 min-w-0" />
        {/* La journee : le seul detour permis depuis le comptoir, parce que
            c'est la ou l'on repare une vente qui vient de partir de travers. */}
        <button
          onClick={() => setJourneeOuverte(v => !v)}
          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-bold transition-colors shrink-0 ${journeeOuverte
            ? 'bg-slate-800 dark:bg-dk-accent text-white'
            : 'text-slate-600 dark:text-dk-muted hover:bg-slate-100 dark:hover:bg-dk-elevated'}`}
        >
          <Receipt className="w-4 h-4" />
          <span className="hidden sm:inline">{T.journee}</span>
        </button>
        {/* Trois points : la mise en page du comptoir. Un poste n'est pas
            l'autre, et le caissier range son ecran une fois pour toutes. */}
        <button
          onClick={() => setReglagesOuverts(v => !v)}
          className={`p-2 rounded-xl transition-colors shrink-0 ${reglagesOuverts
            ? 'bg-slate-800 dark:bg-dk-accent text-white'
            : 'text-slate-500 dark:text-dk-muted hover:bg-slate-100 dark:hover:bg-dk-elevated'}`}
          aria-label={T.reglages}
        >
          <MoreVertical className="w-5 h-5" />
        </button>
        <button
          onClick={onClose}
          className="p-2 rounded-xl text-slate-500 dark:text-dk-muted hover:bg-slate-100 dark:hover:bg-dk-elevated transition-colors shrink-0"
          aria-label="Fermer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {reglagesOuverts && (
        <div className="shrink-0 border-b border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface px-3 sm:px-5 py-3 space-y-3 max-h-[55vh] overflow-y-auto overscroll-contain">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 dark:text-dk-muted">{T.reglages}</span>
            <div className="flex-1" />
            <button
              onClick={() => setMep(MISE_EN_PAGE_DEFAUT)}
              className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-dk-muted hover:text-slate-800 dark:hover:text-dk-text"
            >
              <RefreshCw className="w-3.5 h-3.5" /> {T.defaut}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setMep(m => ({ ...m, panierAGauche: !m.panierAGauche }))}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold border transition-colors ${mep.panierAGauche
                ? 'bg-slate-800 dark:bg-dk-text text-white dark:text-dk-bg border-transparent'
                : 'bg-slate-50 dark:bg-dk-elevated text-slate-600 dark:text-dk-text-soft border-slate-200 dark:border-dk-border'}`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" /> {T.panierAGauche}
            </button>
            <button
              onClick={() => setMep(m => ({ ...m, photos: !m.photos }))}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold border transition-colors ${mep.photos
                ? 'bg-slate-800 dark:bg-dk-text text-white dark:text-dk-bg border-transparent'
                : 'bg-slate-50 dark:bg-dk-elevated text-slate-600 dark:text-dk-text-soft border-slate-200 dark:border-dk-border'}`}
            >
              {mep.photos ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />} {T.photos}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-dk-muted shrink-0">{T.largeur}</span>
            <div className="flex gap-1.5">
              {(['etroit', 'moyen', 'large'] as const).map(l => (
                <button
                  key={l}
                  onClick={() => setMep(m => ({ ...m, largeurPanier: l }))}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${mep.largeurPanier === l
                    ? 'bg-slate-800 dark:bg-dk-text text-white dark:text-dk-bg border-transparent'
                    : 'bg-slate-50 dark:bg-dk-elevated text-slate-600 dark:text-dk-text-soft border-slate-200 dark:border-dk-border'}`}
                >
                  {l === 'etroit' ? T.etroit : l === 'moyen' ? T.moyen : T.large}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-dk-muted">{T.champs}</span>
            <div className="flex flex-wrap gap-1.5">
              {([
                ['typeVente', typesVente.map(t => t.l).join(' / ')],
                ['client', T.client],
                ['facture', T.factureAuto],
                ['paiement', T.reglement],
                ['remise', T.remise],
              ] as Array<[keyof MiseEnPage['champs'], string]>).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => basculerChamp(k)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${mep.champs[k]
                    ? 'bg-slate-800 dark:bg-dk-text text-white dark:text-dk-bg border-transparent'
                    : 'bg-slate-50 dark:bg-dk-elevated text-slate-400 dark:text-dk-muted border-slate-200 dark:border-dk-border line-through'}`}
                >
                  {mep.champs[k] ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  <span className="truncate max-w-[160px]">{label}</span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 dark:text-dk-muted">{T.champMasque}</p>
          </div>
        </div>
      )}

      {flash && (
        <div className={`px-3 sm:px-5 py-2 text-xs font-bold shrink-0 ${flash.ok
          ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
          : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400'}`}>
          {flash.msg}
        </div>
      )}
      {isStatic && (
        <div className="px-3 sm:px-5 py-2 text-xs font-bold bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 flex items-center gap-2 shrink-0">
          <AlertTriangle className="w-4 h-4 shrink-0" /> <span className="truncate">{T.statique}</span>
        </div>
      )}

      {/* La journee de caisse. Elle REMPLACE l'ecran de vente au lieu de le
          recouvrir a moitie : au comptoir, deux ecrans a moitie visibles font
          scanner un article dans le vide. */}
      {journeeOuverte && (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-3 sm:px-5 py-3 border-b border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface shrink-0">
            <input
              type="date"
              value={journalJour}
              onChange={e => { setJournalJour(e.target.value); setTicketAConfirmer(null); }}
              className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border text-sm font-bold text-slate-800 dark:text-dk-text focus:outline-none focus:ring-2 focus:ring-slate-400/40"
            />
            {journalCharge && <Loader2 className="w-4 h-4 animate-spin text-slate-400 dark:text-dk-muted" />}
            <div className="flex-1 min-w-0" />
            <div className="flex items-center gap-3 sm:gap-5 text-right">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-dk-muted">{T.tickets}</p>
                <p className="text-sm font-black text-slate-800 dark:text-dk-text tabular-nums">{journal?.totaux.tickets ?? 0}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-dk-muted">{T.pieces}</p>
                <p className="text-sm font-black text-slate-800 dark:text-dk-text tabular-nums">{journal?.totaux.pieces ?? 0}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-dk-muted">{T.encaisseJour}</p>
                <p className="text-sm font-black text-slate-800 dark:text-dk-text tabular-nums">{fmt(journal?.totaux.total ?? 0)} {currency}</p>
              </div>
            </div>
          </div>

          {isStatic && (
            <div className="px-3 sm:px-5 py-2 text-xs font-bold bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 flex items-center gap-2 shrink-0">
              <AlertTriangle className="w-4 h-4 shrink-0" /> <span className="truncate">{T.journeeStatique}</span>
            </div>
          )}
          {journalErreur && (
            <div className="px-3 sm:px-5 py-2 text-xs font-bold bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 shrink-0">
              {journalErreur}
            </div>
          )}

          {/* Le fond de caisse, mode par mode : c'est ce qu'on compare aux
              billets qu'on a dans la main. */}
          {journal && Object.keys(journal.parMode).length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 sm:px-5 py-3 shrink-0">
              {Object.entries(journal.parMode).map(([mode, agg]) => (
                <div key={mode} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border">
                  <Banknote className="w-4 h-4 text-slate-400 dark:text-dk-muted shrink-0" />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-dk-muted">
                      {modes.find(m => m.v === mode)?.l || T.modeAutre}
                    </p>
                    <p className="text-sm font-black text-slate-800 dark:text-dk-text tabular-nums">
                      {fmt(agg.total)} {currency}
                      <span className="ml-1.5 text-[10px] font-bold text-slate-400 dark:text-dk-muted">({agg.tickets})</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-5 pb-4 space-y-2">
            {!journalCharge && (journal?.tickets.length ?? 0) === 0 && (
              <p className="p-8 text-center text-xs text-slate-400 dark:text-dk-muted">{T.aucunTicket}</p>
            )}
            {journal?.tickets.map(t => (
              <div key={t.ticket} className="rounded-xl bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-slate-100 dark:border-dk-border">
                  <span className="font-mono text-[11px] font-bold text-slate-500 dark:text-dk-muted">{t.ticket}</span>
                  {t.clientNom && (
                    <span className="flex items-center gap-1 text-[11px] font-bold text-slate-700 dark:text-dk-text">
                      <User className="w-3 h-3" />{t.clientNom}
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-dk-elevated text-[10px] font-bold text-slate-600 dark:text-dk-muted">
                    {modes.find(m => m.v === t.modePaiement)?.l || T.modeAutre}
                  </span>
                  {t.factureNumero && (
                    <span className="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/30 text-[10px] font-bold text-indigo-700 dark:text-indigo-400">
                      {t.factureNumero}
                    </span>
                  )}
                  <div className="flex-1 min-w-0" />
                  <span className="text-sm font-black text-slate-800 dark:text-dk-text tabular-nums">{fmt(t.total)} {currency}</span>
                  {ticketAConfirmer === t.ticket ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => void annulerTicket(t.ticket)}
                        disabled={annulEnCours === t.ticket}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-600 text-white text-[11px] font-bold hover:bg-rose-700 disabled:opacity-60 transition-colors"
                      >
                        {annulEnCours === t.ticket
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <RotateCcw className="w-3.5 h-3.5" />}
                        {T.confirmerAnnul}
                      </button>
                      <button
                        onClick={() => setTicketAConfirmer(null)}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-500 dark:text-dk-muted hover:bg-slate-100 dark:hover:bg-dk-elevated transition-colors"
                      >
                        {T.renoncer}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setTicketAConfirmer(t.ticket)}
                      disabled={isStatic}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-500 dark:text-dk-muted hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-600 dark:hover:text-rose-400 disabled:opacity-40 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{T.annuler}</span>
                    </button>
                  )}
                </div>
                <div className="divide-y divide-slate-50 dark:divide-dk-border/50">
                  {t.lignes.map(l => (
                    <div key={l.id} className="flex items-center gap-2 px-3 py-1.5 text-[11px]">
                      <span className="font-bold text-slate-700 dark:text-dk-text truncate">{l.modelNom}</span>
                      <span className="text-slate-400 dark:text-dk-muted truncate">
                        {[l.couleur, l.taille].filter(Boolean).join(' / ') || '—'}
                      </span>
                      <div className="flex-1 min-w-0" />
                      <span className="text-slate-500 dark:text-dk-muted tabular-nums">{l.quantite} x {fmt(l.prixUnitaire)}</span>
                      <span className="font-bold text-slate-700 dark:text-dk-text tabular-nums w-20 text-right">
                        {fmt(l.quantite * l.prixUnitaire)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!journeeOuverte && (
        <div className="lg:hidden shrink-0 flex gap-1 px-3 pb-2 pt-1 bg-white dark:bg-dk-surface border-b border-slate-200 dark:border-dk-border">
          {([
            { v: 'rayon' as const, l: T.auRayon },
            { v: 'panier' as const, l: `${T.panier} · ${nbPieces}` },
          ]).map(o => (
            <button
              key={o.v}
              onClick={() => setVoletMobile(o.v)}
              className={`flex-1 py-2 rounded-xl text-xs font-extrabold transition-colors ${voletMobile === o.v
                ? 'bg-slate-900 dark:bg-dk-accent text-white'
                : 'bg-slate-100 dark:bg-dk-elevated text-slate-500 dark:text-dk-muted'}`}
            >
              {o.l}
            </button>
          ))}
        </div>
      )}

      <div className={`flex-1 min-h-0 flex-col overflow-hidden overscroll-contain ${mep.panierAGauche ? 'lg:flex-row-reverse' : 'lg:flex-row'} ${journeeOuverte ? 'hidden' : 'flex'}`}>
        {/* Gauche : la recherche manuelle, pour les tikis illisibles. */}
        <div className={`flex-col flex-1 min-h-0 p-3 sm:p-4 gap-3 overflow-hidden bg-slate-50/50 dark:bg-transparent lg:flex ${voletMobile === 'rayon' ? 'flex' : 'hidden'}`}>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-dk-muted" />
            <input
              value={recherche}
              onChange={e => setRecherche(e.target.value)}
              placeholder={T.chercher}
              className="w-full pl-9 pr-3 py-3 rounded-xl bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border text-sm text-slate-800 dark:text-dk-text placeholder-slate-400 dark:placeholder-dk-muted focus:outline-none focus:ring-2 focus:ring-slate-400/40"
            />
          </div>
          {/* Le rayon : un modele par vignette. Il NE DISPARAIT PAS quand on
              ouvre un modele — il se replie en bandeau, et la grille des
              tailles s'ouvre dessous. Au comptoir on ajoute souvent deux
              vetements differents d'affilee : refermer le rayon a chaque
              fois faisait retaper la recherche. */}
          <div className="flex-1 min-h-0 flex flex-col sm:flex-row gap-3 overflow-hidden">
          <div className={`grid gap-2 sm:gap-3 content-start flex-1 min-h-0 overflow-y-auto overscroll-contain pb-2 auto-rows-max ${
            modeleOuvert ? 'grid-cols-2 xl:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4'}`}>
              {catalogue.length === 0 && (
                <p className="col-span-full p-6 text-center text-xs text-slate-400 dark:text-dk-muted">{T.rienEnStock}</p>
              )}
              {catalogue.map(c => (
                <button
                  key={c.model.id}
                  onClick={() => setModeleOuvert(m => (m?.id === c.model.id ? null : c.model))}
                  className={`p-2 sm:p-2.5 rounded-xl bg-white dark:bg-dk-surface border text-left hover:shadow-sm transition-all active:scale-[0.98] flex flex-col ${
                    modeleOuvert?.id === c.model.id
                    ? 'border-slate-900 dark:border-dk-accent ring-1 ring-slate-900/10'
                    : 'border-slate-200 dark:border-dk-border hover:border-slate-400 dark:hover:border-dk-accent'}`}
                >
                  {mep.photos && <Vignette model={c.model} className="w-full aspect-[4/3] sm:aspect-square" />}
                  <span className="block mt-1.5 sm:mt-2 text-[11px] sm:text-xs font-bold text-slate-800 dark:text-dk-text truncate leading-tight">
                    {c.model.meta_data?.nom_modele || c.model.id}
                  </span>
                  <span className="flex items-center gap-1 mt-1">
                    {c.couleurs.slice(0, 4).map(nom => {
                      const hex = teinteDe(nom);
                      return (
                        <span
                          key={nom}
                          title={nom}
                          className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full border border-slate-300 dark:border-dk-border flex-none"
                          style={hex ? { backgroundColor: hex } : undefined}
                        />
                      );
                    })}
                    <span className="flex-1" />
                    <span className="text-[10px] sm:text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded-full">{c.total}</span>
                  </span>
                </button>
              ))}
          </div>

          {/* Le modele ouvert : couleur d'abord, taille ensuite. Il occupe sa
              PROPRE colonne, a droite du rayon : la liste des modeles garde
              toute sa hauteur meme quand ils sont nombreux, et il n'y a plus
              de bouton retour a chercher pour revenir au rayon. */}
          {modeleOuvert && (
            <div className="sm:w-[300px] xl:w-[340px] shrink-0 min-h-0 overflow-y-auto overscroll-contain pb-2 sm:border-l sm:border-slate-200 sm:dark:border-dk-border sm:pl-3">
              <div className="flex items-center gap-2.5 mb-3">
                {mep.photos && <Vignette model={modeleOuvert} className="w-9 h-9" />}
                <div className="min-w-0 flex-1">
                  <span className="block text-sm font-extrabold text-slate-800 dark:text-dk-text truncate">
                    {modeleOuvert.meta_data?.nom_modele || modeleOuvert.id}
                  </span>
                  <span className="block text-[11px] text-slate-500 dark:text-dk-muted truncate">
                    {modeleOuvert.meta_data?.reference || ''}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                {grilleModele.map(g => (
                  <div key={g.couleur} className="rounded-xl bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border p-3">
                    <span className="flex items-center gap-2 mb-2">
                      <span
                        className="w-4 h-4 rounded-full border border-slate-300 dark:border-dk-border flex-none"
                        style={teinteDe(g.couleur) ? { backgroundColor: teinteDe(g.couleur)! } : undefined}
                      />
                      <span className="text-xs font-extrabold text-slate-800 dark:text-dk-text">{g.couleur || '—'}</span>
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {g.tailles.map(t => {
                        const reste = restantDe(modeleOuvert.id, g.couleur, t.taille);
                        return (
                          <button
                            key={t.taille}
                            disabled={reste <= 0}
                            onClick={() => ajouter(modeleOuvert, g.couleur, t.taille)}
                            className={`px-3 py-2 rounded-xl border text-center min-w-[64px] transition-colors ${
                              reste > 0
                                ? 'bg-slate-50 dark:bg-dk-elevated border-slate-200 dark:border-dk-border hover:border-slate-400 dark:hover:border-dk-accent'
                                : 'bg-slate-100 dark:bg-dk-elevated border-slate-200 dark:border-dk-border opacity-50 cursor-not-allowed'
                            }`}
                          >
                            <span className="block text-xs font-extrabold text-slate-800 dark:text-dk-text">{t.taille || '—'}</span>
                            <span className="block text-[11px] font-bold text-emerald-600 dark:text-emerald-400">{reste}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setModeleOuvert(null)}
                className="mt-3 w-full py-2 rounded-xl border border-slate-200 dark:border-dk-border text-[11px] font-bold text-slate-500 dark:text-dk-muted hover:bg-white dark:hover:bg-dk-elevated"
              >
                {T.retour}
              </button>
            </div>
          )}
          </div>
        </div>

        {/* Droite : le panier et l'encaissement. */}
        <div className={`flex-col flex-1 min-h-0 bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border overflow-hidden lg:flex lg:flex-none ${LARGEURS[mep.largeurPanier]} ${mep.panierAGauche ? 'lg:border-r' : 'lg:border-l'} ${voletMobile === 'panier' ? 'flex' : 'hidden'}`}>
          <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-3 border-b border-slate-200 dark:border-dk-border shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {/* Telephone : revenir au rayon sans quitter la vente. */}
              <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500 dark:text-dk-muted shrink-0">
                {T.panier} · {nbPieces}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {lignes.length > 0 && (
                <button onClick={reset} className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline px-2 py-1">
                  {T.videz}
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain divide-y divide-slate-100 dark:divide-dk-border">
            {lignes.length === 0 && (
              <p className="p-6 text-center text-xs text-slate-400 dark:text-dk-muted">{T.vide}</p>
            )}
            {lignes.map(l => (
              <div key={l.key} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2 px-3 sm:px-4 py-3">
                <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                  {mep.photos && <Vignette model={l.model} className="w-10 h-10 sm:w-10 sm:h-10" />}
                  <div className="flex-1 min-w-0">
                    <span className="block text-[13px] sm:text-sm font-bold text-slate-800 dark:text-dk-text truncate leading-tight">
                      {l.model.meta_data?.nom_modele || l.model.id}
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-dk-muted truncate">
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-slate-300 dark:border-dk-border flex-none"
                        style={teinteDe(l.couleur) ? { backgroundColor: teinteDe(l.couleur)! } : undefined}
                      />
                      {[l.couleur, l.taille].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </div>
                  <button
                    onClick={() => setLignes(prev => prev.filter(x => x.key !== l.key))}
                    className="sm:hidden p-1.5 rounded-lg text-slate-400 dark:text-dk-muted hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto justify-between sm:justify-end">
                  <div className="flex items-center gap-1 bg-slate-50 dark:bg-dk-elevated rounded-full p-0.5 border border-slate-200 dark:border-dk-border">
                    <button
                      onClick={() => setLignes(prev => prev.flatMap(x => x.key !== l.key ? [x] : (x.qte > 1 ? [{ ...x, qte: x.qte - 1 }] : [])))}
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border flex items-center justify-center text-slate-600 dark:text-dk-text-soft hover:bg-slate-50 dark:hover:bg-dk-elevated shadow-sm active:scale-95 transition-transform"
                    >
                      <Minus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    </button>
                    <span className="w-6 sm:w-8 text-center text-sm font-black text-slate-800 dark:text-dk-text">{l.qte}</span>
                    <button
                      onClick={() => ajouter(l.model, l.couleur, l.taille)}
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border flex items-center justify-center text-slate-600 dark:text-dk-text-soft hover:bg-slate-50 dark:hover:bg-dk-elevated shadow-sm active:scale-95 transition-transform"
                    >
                      <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    </button>
                  </div>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={l.prix === 0 ? '' : l.prix}
                    placeholder="0.00"
                    onChange={e => {
                      const v = e.target.value === '' ? 0 : Number(e.target.value);
                      setLignes(prev => prev.map(x => x.key === l.key ? { ...x, prix: v, prixTouched: true } : x));
                    }}
                    className="w-[72px] sm:w-20 px-2 py-1.5 rounded-lg text-right text-[13px] sm:text-sm font-bold bg-slate-50 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border text-slate-800 dark:text-dk-text focus:outline-none focus:ring-2 focus:ring-slate-400/40 placeholder:text-slate-400"
                  />
                  <span className="w-[64px] sm:w-20 text-right text-[13px] sm:text-sm font-black text-slate-800 dark:text-dk-text truncate">
                    {fmt(l.qte * (Number(l.prix) || 0))}
                  </span>
                  <button
                    onClick={() => setLignes(prev => prev.filter(x => x.key !== l.key))}
                    className="hidden sm:flex p-1.5 rounded-lg text-slate-400 dark:text-dk-muted hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-200 dark:border-dk-border p-3 sm:p-4 space-y-2.5 sm:space-y-3 shrink-0 bg-white dark:bg-dk-surface max-h-[45vh] overflow-y-auto overscroll-contain lg:max-h-none lg:overflow-visible">
            {/* Le type de vente commande le tarif ET le document : en gros on
                facture un revendeur nomme, au comptoir on remet un ticket. */}
            {mep.champs.typeVente && (
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              {typesVente.map(t => (
                <button
                  key={t.v}
                  onClick={() => setTypeVente(t.v)}
                  disabled={!!client}
                  title={client ? T.typeDuClient : undefined}
                  className={`px-2 py-2.5 sm:py-2 rounded-xl text-[11px] font-bold border transition-colors active:scale-[0.98] ${
                    typeEffectif === t.v
                      ? 'bg-slate-800 dark:bg-dk-text text-white dark:text-dk-bg border-transparent shadow-sm'
                      : 'bg-slate-50 dark:bg-dk-elevated text-slate-600 dark:text-dk-text-soft border-slate-200 dark:border-dk-border'
                  } ${client ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {t.l}
                </button>
              ))}
            </div>
            )}

            {/* Le client : on le reconnait a sa photo, on le trouve en tapant,
                et on le cree sans quitter le comptoir. */}
            {mep.champs.client && (client ? (
              <div className="flex items-center gap-3 p-2 rounded-xl bg-slate-50 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border">
                {client.photo
                  ? <img src={client.photo} alt="" className="w-9 h-9 rounded-lg object-cover flex-none" />
                  : <div className="w-9 h-9 rounded-lg bg-white dark:bg-dk-surface flex-none flex items-center justify-center"><User className="w-4 h-4 text-slate-400 dark:text-dk-muted" /></div>}
                <div className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-slate-800 dark:text-dk-text truncate">{client.nom}</span>
                  <span className="block text-[11px] text-slate-500 dark:text-dk-muted truncate">
                    {[client.type, client.tel, client.ville].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <button
                  onClick={() => { setClientId(''); setClientQuery(''); }}
                  className="p-1.5 rounded-lg text-slate-400 dark:text-dk-muted hover:text-rose-600 dark:hover:text-rose-400"
                  aria-label={T.retirerClient}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-dk-muted pointer-events-none" />
                    <input
                      value={clientQuery}
                      onChange={e => setClientQuery(e.target.value)}
                      placeholder={T.chercherClient}
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm bg-slate-50 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border text-slate-800 dark:text-dk-text placeholder-slate-400 dark:placeholder-dk-muted focus:outline-none focus:ring-2 focus:ring-slate-400/40"
                    />
                  </div>
                  {onCreateClient && (
                    <button
                      onClick={onCreateClient}
                      title={T.nouveauClient}
                      className="shrink-0 px-3 rounded-xl border border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft hover:bg-slate-50 dark:hover:bg-dk-elevated"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {clientQuery.trim() !== '' && (
                  <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 dark:border-dk-border divide-y divide-slate-100 dark:divide-dk-border">
                    {clientsTrouves.length === 0 && (
                      <p className="p-3 text-[11px] text-slate-400 dark:text-dk-muted">{T.aucunClient}</p>
                    )}
                    {clientsTrouves.map(c => (
                      <button
                        key={c.id}
                        onClick={() => { setClientId(c.id); setClientQuery(''); }}
                        className="w-full flex items-center gap-2 p-2 text-left hover:bg-slate-50 dark:hover:bg-dk-elevated"
                      >
                        {c.photo
                          ? <img src={c.photo} alt="" className="w-8 h-8 rounded-lg object-cover flex-none" />
                          : <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-dk-elevated flex-none" />}
                        <span className="min-w-0">
                          <span className="block text-xs font-bold text-slate-800 dark:text-dk-text truncate">{c.nom}</span>
                          <span className="block text-[10px] text-slate-500 dark:text-dk-muted truncate">
                            {[c.type, c.tel, c.ville].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {/* Vente au comptoir sans fiche : un nom libre suffit, et il
                    apparaitra sur le ticket. */}
                <input
                  value={clientLibre}
                  onChange={e => setClientLibre(e.target.value)}
                  placeholder={T.passage}
                  className="w-full px-3 py-2 rounded-xl text-sm bg-slate-50 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border text-slate-800 dark:text-dk-text placeholder-slate-400 dark:placeholder-dk-muted focus:outline-none focus:ring-2 focus:ring-slate-400/40"
                />
              </div>
            ))}

            {/* La facture : un reglage, pas une question a chaque vente. En
                gros elle est imposee — un revendeur part toujours avec. */}
            {mep.champs.facture && (
            <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 dark:text-dk-text-soft">
              <input
                type="checkbox"
                checked={factureRequise}
                disabled={typeEffectif === 'GROS'}
                onChange={e => setFactureAuto(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 dark:border-dk-border"
              />
              {T.factureAuto}
              {typeEffectif === 'GROS' && <span className="text-slate-400 dark:text-dk-muted">({T.imposee})</span>}
            </label>
            )}

            {mep.champs.paiement && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {modes.map(m => (
                <button
                  key={m.v}
                  onClick={() => setPaiement(m.v)}
                  className={`px-2 py-2.5 sm:py-2 rounded-xl text-[11px] font-bold border transition-colors active:scale-[0.98] ${
                    paiement === m.v
                      ? 'bg-slate-800 dark:bg-dk-text text-white dark:text-dk-bg border-transparent'
                      : 'bg-slate-50 dark:bg-dk-elevated text-slate-600 dark:text-dk-text-soft border-slate-200 dark:border-dk-border'
                  }`}
                >
                  {m.l}
                </button>
              ))}
            </div>
            )}

            {mep.champs.remise && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[11px] font-bold text-slate-500 dark:text-dk-muted uppercase tracking-wide shrink-0">{T.remise}</span>
              <input
                type="number"
                inputMode="decimal"
                value={remiseGlobale}
                placeholder="0"
                onChange={e => setRemiseGlobale(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-20 px-2 py-1.5 rounded-lg text-right font-bold bg-slate-50 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border text-slate-800 dark:text-dk-text focus:outline-none focus:ring-2 focus:ring-slate-400/40 text-sm"
              />
              {paiement === 'ESPECES' && (
                <>
                  <span className="text-[11px] font-bold text-slate-500 dark:text-dk-muted uppercase tracking-wide shrink-0 ml-1">{T.recu}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={encaisse}
                    placeholder="0"
                    onChange={e => setEncaisse(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-20 px-2 py-1.5 rounded-lg text-right font-bold bg-slate-50 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border text-slate-800 dark:text-dk-text focus:outline-none focus:ring-2 focus:ring-slate-400/40 text-sm"
                  />
                </>
              )}
              <div className="flex-1 min-w-0" />
              {paiement === 'ESPECES' && rendu != null && (
                <span className={`text-xs font-extrabold shrink-0 ${rendu < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-dk-text-soft'}`}>
                  {T.rendu} : {fmt(rendu)} {currency}
                </span>
              )}
            </div>
            )}

            {erreur && (
              <p className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-start gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-px" /> <span>{erreur}</span>
              </p>
            )}
          </div>

          {/* La barre du bas ne bouge jamais. Sur un telephone l'ecran defile,
              et le geste qui conclut la vente doit rester sous le pouce : un
              bouton qu'il faut aller chercher fait rescanner l'article
              « pour voir », et le stock finit par mentir. */}
          <div className="sticky bottom-0 z-10 shrink-0 flex items-center gap-3 px-3 sm:px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] bg-white dark:bg-dk-surface border-t border-slate-200 dark:border-dk-border">
            <div className="min-w-0">
              <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-dk-muted">{T.total}</span>
              <span className="block text-xl sm:text-2xl font-black text-slate-900 dark:text-dk-text leading-none truncate">
                {fmt(total)} <span className="text-xs font-bold text-slate-400 dark:text-dk-muted">{currency}</span>
              </span>
            </div>
            <button
              disabled={lignes.length === 0 || saving || isStatic}
              onClick={valider}
              className={`flex-1 py-3.5 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 transition-all ${
                lignes.length === 0 || saving || isStatic
                  ? 'bg-slate-100 dark:bg-dk-elevated text-slate-400 dark:text-dk-muted cursor-not-allowed'
                  : 'bg-slate-900 hover:bg-slate-800 dark:bg-dk-accent dark:hover:bg-dk-accent/90 text-white active:scale-[0.99]'
              }`}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {T.encaisser}
            </button>
          </div>
        </div>
      </div>

      {/* Telephone : depuis le rayon, le panier reste a un pouce. Le total y
          est deja lisible, pour ne pas avoir a changer de volet juste pour
          verifier ce qu'on est en train de facturer. */}
      {!journeeOuverte && voletMobile === 'rayon' && (
        <div className="lg:hidden shrink-0 flex items-center gap-3 px-3 py-3 pb-[max(12px,env(safe-area-inset-bottom))] bg-white dark:bg-dk-surface border-t border-slate-200 dark:border-dk-border">
          <div className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-dk-muted">{T.total}</span>
            <span className="block text-lg font-black text-slate-900 dark:text-dk-text leading-none truncate">
              {fmt(total)} <span className="text-xs font-bold text-slate-400 dark:text-dk-muted">{currency}</span>
            </span>
          </div>
          <button
            onClick={() => setVoletMobile('panier')}
            className="flex-1 py-3 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 dark:bg-dk-accent text-white active:scale-[0.99] transition-all"
          >
            {T.voirPanier} · {nbPieces}
          </button>
        </div>
      )}
      </div>
    </div>,
    document.body,
  );
};

export default Caisse;
