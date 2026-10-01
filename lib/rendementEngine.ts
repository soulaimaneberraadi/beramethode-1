import type { ModelData, PlanningEvent, SuiviData, AppSettings } from '../types';
import { getWorkMinutesPerDay } from '../utils/planning';
import { creneauxDuJour } from './horaires';
import { effectifChaineJour, type DonneesRH } from './effectifChaine';

export interface RendementInputs {
  models: ModelData[];
  planningEvents: PlanningEvent[];
  suivis: SuiviData[];
  settings: AppSettings;
  range?: { from: string; to: string };
  /** Pointage RH : effectif d'une chaine quand la page Effectifs n'a rien pour le jour. */
  rh?: DonneesRH | null;
  /** Horloge (tests). */
  maintenant?: Date;
}

export interface RendementNode {
  id: string;
  label: string;
  level: 'societe' | 'salle' | 'chaine' | 'modele' | 'machine' | 'poste';
  produced: number;
  target: number;
  earnedMinutes: number;
  /** Minutes-personne de presence : effectif x minutes de travail du jour. */
  presenceMinutes: number;
  /** Minutes-personne perdues en arrets declares (pause, panne, rupture...). */
  arretMinutes: number;
  defects: number;
  /** Minutes d'horloge d'arret declarees. */
  downtimeMinutes: number;
  /** Effectif moyen par jour produit (somme des chaines aux niveaux salle et societe). */
  effectif: number;
  rPercent: number;
  availability: number;
  quality: number;
  trs: number;
  children?: RendementNode[];
  prep?: number;
  montage?: number;
}

/* Meme bareme que la grille du Suivi (colonne R) : un creneau marque L, P, M ou S
   perd ces minutes. Les deux pages doivent donner le meme rendement. */
const MINUTES_ARRET: Record<string, number> = { L: 60, P: 15, M: 30, S: 45 };

const valeurSaisie = (v: unknown): v is number | string =>
  v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

const sumHourly = (s: SuiviData): number =>
  Object.values(s.sorties || {}).reduce<number>((acc, v) => acc + (Number(v) || 0), 0);

const sumDefects = (s: SuiviData): number =>
  (s.defauts || []).reduce((acc, d) => acc + (d.quantity || 0), 0) +
  (s.scrap_details || []).reduce((acc, d) => acc + (d.quantity || 0), 0);

const sumDowntimeEvents = (s: SuiviData): number =>
  (s.downtime_events || []).reduce((acc, d) => acc + (d.minutes || 0), 0);

/**
 * Minutes de travail d'un jour selon l'horaire de CE jour (vendredi court,
 * jour de repos travaille). Aujourd'hui, seulement le temps deja ecoule : une
 * matinee produite ne se mesure pas sur la journee entiere. L'ancien calcul
 * prenait une duree unique pour tous les jours.
 */
export function minutesTravailJour(settings: AppSettings, date: string, maintenant = new Date()): number {
  const aujourdHui = maintenant.toLocaleDateString('en-CA');
  if (date > aujourdHui) return 0;
  const jour = new Date(`${date}T00:00:00`);
  const creneaux = creneauxDuJour(settings, jour, { ignorerFermeture: true });
  if (!creneaux.length) return getWorkMinutesPerDay(settings, jour);
  const fin = date < aujourdHui ? Infinity : maintenant.getHours() * 60 + maintenant.getMinutes();
  let total = 0;
  for (const c of creneaux) {
    if (c.endMin <= fin) { total += c.duration; continue; }
    if (c.startMin >= fin) continue;
    const etendue = c.endMin - c.startMin;
    total += etendue > 0 ? c.duration * ((fin - c.startMin) / etendue) : 0;
  }
  return total;
}

function computeNodeStats(produced: number, earnedMinutes: number, presenceMinutes: number, arretMinutes: number, defects: number) {
  /* TRS = Disponibilite x Performance x Qualite, avec la performance mesuree sur
     le temps DISPONIBLE (presence moins arrets). Mesuree sur la presence entiere,
     l'arret etait compte deux fois : une fois dans la performance, une fois
     dans la disponibilite. */
  const utile = Math.max(0, presenceMinutes - Math.min(arretMinutes, presenceMinutes));
  const rP = utile > 0 ? (earnedMinutes / utile) * 100 : 0;
  const avail = presenceMinutes > 0 ? (utile / presenceMinutes) * 100 : 0;
  const qual = produced > 0 ? ((produced - defects) / produced) * 100 : 100;
  const trsVal = (rP * avail * qual) / 10000;
  return {
    rPercent: Math.round(rP * 100) / 100,
    availability: Math.round(avail * 100) / 100,
    quality: Math.round(qual * 100) / 100,
    trs: Math.round(trsVal * 100) / 100,
  };
}

type Additif = 'produced' | 'target' | 'earnedMinutes' | 'presenceMinutes' | 'arretMinutes';

function verifySum(parent: RendementNode, field: Additif): boolean {
  if (!parent.children || parent.children.length === 0) return true;
  const childSum = parent.children.reduce((s, c) => s + c[field], 0);
  const diff = Math.abs(parent[field] - childSum);
  if (diff > 0.01) {
    console.warn(`[RendementEngine] Sum mismatch at ${parent.level} "${parent.label}" field ${field}: parent=${parent[field]} sum(children)=${childSum} diff=${diff}`);
    return false;
  }
  return true;
}

function verifyNode(node: RendementNode): void {
  if (!node.children) return;
  for (const child of node.children) verifyNode(child);
  // L'effectif n'est pas additif d'un modele a sa chaine (meme equipe) : pas verifie.
  (['produced', 'target', 'earnedMinutes', 'presenceMinutes', 'arretMinutes'] as Additif[]).forEach(f => verifySum(node, f));
}

interface Cumul {
  produced: number; target: number; earnedMinutes: number; presenceMinutes: number; arretMinutes: number;
  defects: number; downtimeMinutes: number; effectif: number; prep: number; montage: number;
}
const cumulVide = (): Cumul => ({
  produced: 0, target: 0, earnedMinutes: 0, presenceMinutes: 0, arretMinutes: 0,
  defects: 0, downtimeMinutes: 0, effectif: 0, prep: 0, montage: 0,
});
const ajouter = (a: Cumul, b: Cumul) => {
  a.produced += b.produced; a.target += b.target; a.earnedMinutes += b.earnedMinutes;
  a.presenceMinutes += b.presenceMinutes; a.arretMinutes += b.arretMinutes; a.defects += b.defects;
  a.downtimeMinutes += b.downtimeMinutes; a.effectif += b.effectif; a.prep += b.prep; a.montage += b.montage;
};
const moyenne = (m: Map<string, number>) => (m.size ? Math.round(([...m.values()].reduce((x, y) => x + y, 0) / m.size) * 10) / 10 : 0);

export function computeRendement(inputs: RendementInputs): RendementNode {
  const { models, planningEvents, suivis, settings, range, rh } = inputs;
  const maintenant = inputs.maintenant || new Date();
  const modelMap = new Map(models.map(m => [m.id, m]));
  const eventMap = new Map(planningEvents.map(e => [e.id, e]));

  const filtered = range ? suivis.filter(s => s.date >= range.from && s.date <= range.to) : suivis;

  /* 1. Les saisies regroupees par chaine et par jour : la presence d'une equipe
     se compte UNE fois par jour, puis se partage entre les OF qu'elle a
     produits. Avant, chaque ligne d'OF ajoutait l'effectif complet x la journee :
     deux OF le meme jour doublaient la presence et divisaient le rendement par deux. */
  type Ligne = { s: SuiviData; ev: PlanningEvent; sam: number; prod: number; cle: string; modelName: string };
  const parJour = new Map<string, Ligne[]>();
  for (const s of filtered) {
    const ev = eventMap.get(s.planningId);
    if (!ev) continue;
    const model = modelMap.get(ev.modelId);
    const chaineId = ev.chaineId || '__unknown__';
    const ligne: Ligne = {
      s, ev,
      sam: Number(model?.meta_data?.total_temps) || 0,
      prod: sumHourly(s),
      cle: `${chaineId}__${ev.modelId}`,
      modelName: model?.meta_data?.nom_modele || ev.modelId,
    };
    const k = `${chaineId}|${s.date}`;
    (parJour.get(k) || parJour.set(k, []).get(k)!).push(ligne);
  }

  const modeleMap = new Map<string, Cumul & { modelName: string; chaineId: string; ofs: Set<string>; effParJour: Map<string, number> }>();
  const effChaine = new Map<string, Map<string, number>>();

  for (const [k, lignes] of parJour) {
    const [chaineId, date] = k.split('|');
    const effectif = chaineId === '__unknown__' ? 0 : effectifChaineJour({ chaineId, date, suivis, planningEvents, models, rh }).n;
    const minutesJour = minutesTravailJour(settings, date, maintenant);

    // Creneaux occupes : un creneau partage par deux OF compte pour moitie a chacun.
    const occupation = new Map<string, number>();
    for (const l of lignes) for (const [h, v] of Object.entries(l.s.sorties || {})) if (valeurSaisie(v)) occupation.set(h, (occupation.get(h) || 0) + 1);
    // Arrets du jour : un creneau arrete compte une fois, meme si deux OF le portent.
    const arretParCreneau = new Map<string, number>();
    for (const l of lignes) {
      for (const [h, code] of Object.entries(l.s.downtimes || {})) {
        const m = MINUTES_ARRET[String(code)] || 0;
        if (m > (arretParCreneau.get(h) || 0)) arretParCreneau.set(h, m);
      }
    }
    let arretJour = [...arretParCreneau.values()].reduce((a, b) => a + b, 0) + lignes.reduce((a, l) => a + sumDowntimeEvents(l.s), 0);
    arretJour = Math.min(arretJour, minutesJour);

    const poids = lignes.map(l => Object.entries(l.s.sorties || {}).reduce((a, [h, v]) => a + (valeurSaisie(v) ? 1 / (occupation.get(h) || 1) : 0), 0));
    let totalPoids = poids.reduce((a, b) => a + b, 0);
    if (totalPoids <= 0) {
      lignes.forEach((l, i) => { poids[i] = l.prod * l.sam || 1; });
      totalPoids = poids.reduce((a, b) => a + b, 0);
    }

    const chaineJours = effChaine.get(chaineId) || new Map<string, number>();
    chaineJours.set(date, effectif);
    effChaine.set(chaineId, chaineJours);

    lignes.forEach((l, i) => {
      const part = totalPoids > 0 ? poids[i] / totalPoids : 0;
      const cur = modeleMap.get(l.cle) || {
        ...cumulVide(), modelName: l.modelName, chaineId, ofs: new Set<string>(), effParJour: new Map<string, number>(),
      };
      cur.produced += l.prod;
      // La cible d'un OF compte UNE fois, pas une fois par jour de saisie.
      if (!cur.ofs.has(l.ev.id)) { cur.ofs.add(l.ev.id); cur.target += Number(l.ev.qteTotal) || 0; }
      cur.earnedMinutes += l.prod * l.sam;
      cur.presenceMinutes += effectif * minutesJour * part;
      cur.arretMinutes += effectif * arretJour * part;
      cur.downtimeMinutes += arretJour * part;
      cur.defects += sumDefects(l.s);
      cur.prep += l.s.sectionOutput?.preparation || 0;
      cur.montage += l.s.sectionOutput?.montage || 0;
      cur.effParJour.set(date, effectif);
      modeleMap.set(l.cle, cur);
    });
  }

  const nodeDe = (id: string, label: string, level: RendementNode['level'], c: Cumul, children?: RendementNode[]): RendementNode => ({
    id, label, level,
    produced: c.produced, target: c.target, earnedMinutes: c.earnedMinutes, presenceMinutes: c.presenceMinutes,
    arretMinutes: c.arretMinutes, defects: c.defects, downtimeMinutes: c.downtimeMinutes, effectif: c.effectif,
    prep: c.prep, montage: c.montage,
    ...computeNodeStats(c.produced, c.earnedMinutes, c.presenceMinutes, c.arretMinutes, c.defects),
    ...(children ? { children } : {}),
  });

  // 2. Modeles -> chaines.
  const chaineMap = new Map<string, Cumul & { children: RendementNode[] }>();
  for (const [, md] of modeleMap) {
    md.effectif = moyenne(md.effParJour);
    const modeleNode = nodeDe(`modele__${md.chaineId}__${md.modelName}`, md.modelName, 'modele', md);
    const cur = chaineMap.get(md.chaineId) || { ...cumulVide(), children: [] };
    ajouter(cur, md);
    cur.children.push(modeleNode);
    chaineMap.set(md.chaineId, cur);
  }

  // 3. Chaines -> salles.
  const salleMap = new Map<string, Cumul & { children: RendementNode[] }>();
  for (const [cId, cData] of chaineMap) {
    // Une chaine : son effectif moyen par jour, pas la somme de ceux de ses modeles.
    cData.effectif = moyenne(effChaine.get(cId) || new Map());
    const chaineNode = nodeDe(cId, settings.chainNames?.[cId] || cId, 'chaine', cData, cData.children);
    const salleId = settings.chaineToSalle?.[cId] ?? '__default__';
    const cur = salleMap.get(salleId) || { ...cumulVide(), children: [] };
    ajouter(cur, cData);
    cur.children.push(chaineNode);
    salleMap.set(salleId, cur);
  }

  // 4. Salles -> societe.
  const societe = cumulVide();
  const salleChildren: RendementNode[] = [];
  for (const [salleId, sData] of salleMap) {
    const label = settings.salleNames?.[salleId] || (salleId === '__default__' ? 'Atelier' : salleId);
    salleChildren.push(nodeDe(salleId, label, 'salle', sData, sData.children));
    ajouter(societe, sData);
  }

  const root = nodeDe('__societe__', 'Société', 'societe', societe, salleChildren);
  if (typeof console !== 'undefined') verifyNode(root);
  return root;
}
