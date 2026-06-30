import type { ModelData, PlanningEvent, SuiviData, AppSettings } from '../types';
import { getWorkMinutesPerDay } from '../utils/planning';

export interface RendementInputs {
  models: ModelData[];
  planningEvents: PlanningEvent[];
  suivis: SuiviData[];
  settings: AppSettings;
  range?: { from: string; to: string };
}

export interface RendementNode {
  id: string;
  label: string;
  level: 'societe' | 'salle' | 'chaine' | 'modele' | 'machine' | 'poste';
  produced: number;
  target: number;
  earnedMinutes: number;
  presenceMinutes: number;
  defects: number;
  downtimeMinutes: number;
  effectif: number;
  rPercent: number;
  availability: number;
  quality: number;
  trs: number;
  children?: RendementNode[];
  prep?: number;
  montage?: number;
}

const sumHourly = (s: SuiviData): number =>
  Object.values(s.sorties || {}).reduce<number>((acc, v) => acc + (Number(v) || 0), 0);

const sumDefects = (s: SuiviData): number =>
  (s.defauts || []).reduce((acc, d) => acc + (d.quantity || 0), 0) +
  (s.scrap_details || []).reduce((acc, d) => acc + (d.quantity || 0), 0);

const sumDowntime = (s: SuiviData): number =>
  (s.downtime_events || []).reduce((acc, d) => acc + (d.minutes || 0), 0);

function computeNodeStats(
  produced: number,
  target: number,
  earnedMinutes: number,
  presenceMinutes: number,
  defects: number,
  downtimeMinutes: number,
  effectif: number
) {
  const rP = presenceMinutes > 0 ? (earnedMinutes / presenceMinutes) * 100 : 0;
  const avail = presenceMinutes > 0
    ? ((presenceMinutes - Math.min(downtimeMinutes, presenceMinutes)) / presenceMinutes) * 100
    : 100;
  const qual = produced > 0 ? ((produced - defects) / produced) * 100 : 100;
  const trsVal = (rP * avail * qual) / 10000;
  return {
    rPercent: Math.round(rP * 100) / 100,
    availability: Math.round(avail * 100) / 100,
    quality: Math.round(qual * 100) / 100,
    trs: Math.round(trsVal * 100) / 100,
  };
}

function verifySum(parent: RendementNode, field: 'produced' | 'target' | 'earnedMinutes' | 'presenceMinutes' | 'effectif'): boolean {
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
  verifySum(node, 'produced');
  verifySum(node, 'target');
  verifySum(node, 'earnedMinutes');
  verifySum(node, 'presenceMinutes');
  verifySum(node, 'effectif');
}

export function computeRendement(inputs: RendementInputs): RendementNode {
  const { models, planningEvents, suivis, settings, range } = inputs;
  const modelMap = new Map(models.map(m => [m.id, m]));
  const eventMap = new Map(planningEvents.map(e => [e.id, e]));
  const minutesPerDay = getWorkMinutesPerDay(settings);

  let filtered = suivis;
  if (range) {
    filtered = suivis.filter(s => s.date >= range.from && s.date <= range.to);
  }

  const modeleMap = new Map<string, {
    produced: number; target: number; earnedMinutes: number; presenceMinutes: number;
    defects: number; downtimeMinutes: number; effectif: number; prep: number; montage: number;
    modelName: string; chaineId: string;
  }>();

  for (const s of filtered) {
    const ev = eventMap.get(s.planningId);
    if (!ev) continue;
    const model = modelMap.get(ev.modelId);
    const sam = model?.meta_data?.total_temps || 0;
    const prod = sumHourly(s);
    const def = sumDefects(s);
    const dt = sumDowntime(s);

    const key = `${ev.chaineId || '__unknown__'}__${ev.modelId}`;
    const cur = modeleMap.get(key) || {
      produced: 0, target: 0, earnedMinutes: 0, presenceMinutes: 0,
      defects: 0, downtimeMinutes: 0, effectif: 0, prep: 0, montage: 0,
      modelName: model?.meta_data?.nom_modele || ev.modelId,
      chaineId: ev.chaineId || '__unknown__',
    };
    cur.produced += prod;
    cur.target += ev.qteTotal || 0;
    cur.earnedMinutes += prod * sam;
    cur.presenceMinutes += (s.totalWorkers || 0) * minutesPerDay;
    cur.defects += def;
    cur.downtimeMinutes += dt;
    cur.effectif += s.totalWorkers || 0;
    cur.prep += s.sectionOutput?.preparation || 0;
    cur.montage += s.sectionOutput?.montage || 0;
    modeleMap.set(key, cur);
  }

  const chaineMap = new Map<string, {
    produced: number; target: number; earnedMinutes: number; presenceMinutes: number;
    defects: number; downtimeMinutes: number; effectif: number; prep: number; montage: number;
    children: RendementNode[];
  }>();

  for (const [, md] of modeleMap) {
    const cId = md.chaineId;
    const meta = computeNodeStats(md.produced, md.target, md.earnedMinutes, md.presenceMinutes, md.defects, md.downtimeMinutes, md.effectif);
    const modeleNode: RendementNode = {
      id: `modele__${cId}__${md.modelName}`,
      label: md.modelName,
      level: 'modele',
      produced: md.produced,
      target: md.target,
      earnedMinutes: md.earnedMinutes,
      presenceMinutes: md.presenceMinutes,
      defects: md.defects,
      downtimeMinutes: md.downtimeMinutes,
      effectif: md.effectif,
      prep: md.prep,
      montage: md.montage,
      ...meta,
    };

    const cur = chaineMap.get(cId) || {
      produced: 0, target: 0, earnedMinutes: 0, presenceMinutes: 0,
      defects: 0, downtimeMinutes: 0, effectif: 0, prep: 0, montage: 0,
      children: [],
    };
    cur.produced += modeleNode.produced;
    cur.target += modeleNode.target;
    cur.earnedMinutes += modeleNode.earnedMinutes;
    cur.presenceMinutes += modeleNode.presenceMinutes;
    cur.defects += modeleNode.defects;
    cur.downtimeMinutes += modeleNode.downtimeMinutes;
    cur.effectif += modeleNode.effectif;
    cur.prep += modeleNode.prep || 0;
    cur.montage += modeleNode.montage || 0;
    cur.children.push(modeleNode);
    chaineMap.set(cId, cur);
  }

  const salleMap = new Map<string, {
    produced: number; target: number; earnedMinutes: number; presenceMinutes: number;
    defects: number; downtimeMinutes: number; effectif: number; prep: number; montage: number;
    children: RendementNode[];
  }>();

  for (const [cId, cData] of chaineMap) {
    const salleId = settings.chaineToSalle?.[cId] ?? '__default__';
    const label = settings.chainNames?.[cId] || cId;
    const meta = computeNodeStats(cData.produced, cData.target, cData.earnedMinutes, cData.presenceMinutes, cData.defects, cData.downtimeMinutes, cData.effectif);
    const chaineNode: RendementNode = {
      id: cId,
      label,
      level: 'chaine',
      produced: cData.produced,
      target: cData.target,
      earnedMinutes: cData.earnedMinutes,
      presenceMinutes: cData.presenceMinutes,
      defects: cData.defects,
      downtimeMinutes: cData.downtimeMinutes,
      effectif: cData.effectif,
      prep: cData.prep,
      montage: cData.montage,
      ...meta,
      children: cData.children,
    };

    const cur = salleMap.get(salleId) || {
      produced: 0, target: 0, earnedMinutes: 0, presenceMinutes: 0,
      defects: 0, downtimeMinutes: 0, effectif: 0, prep: 0, montage: 0,
      children: [],
    };
    cur.produced += chaineNode.produced;
    cur.target += chaineNode.target;
    cur.earnedMinutes += chaineNode.earnedMinutes;
    cur.presenceMinutes += chaineNode.presenceMinutes;
    cur.defects += chaineNode.defects;
    cur.downtimeMinutes += chaineNode.downtimeMinutes;
    cur.effectif += chaineNode.effectif;
    cur.prep += chaineNode.prep || 0;
    cur.montage += chaineNode.montage || 0;
    cur.children.push(chaineNode);
    salleMap.set(salleId, cur);
  }

  let societeProduced = 0, societeTarget = 0, societeEarned = 0, societePresence = 0;
  let societeDefects = 0, societeDowntime = 0, societeEffectif = 0, societePrep = 0, societeMontage = 0;
  const salleChildren: RendementNode[] = [];

  for (const [salleId, sData] of salleMap) {
    const label = settings.salleNames?.[salleId] || (salleId === '__default__' ? 'Atelier' : salleId);
    const meta = computeNodeStats(sData.produced, sData.target, sData.earnedMinutes, sData.presenceMinutes, sData.defects, sData.downtimeMinutes, sData.effectif);
    const salleNode: RendementNode = {
      id: salleId,
      label,
      level: 'salle',
      produced: sData.produced, target: sData.target,
      earnedMinutes: sData.earnedMinutes, presenceMinutes: sData.presenceMinutes,
      defects: sData.defects, downtimeMinutes: sData.downtimeMinutes,
      effectif: sData.effectif, prep: sData.prep, montage: sData.montage,
      ...meta,
      children: sData.children,
    };
    salleChildren.push(salleNode);
    societeProduced += sData.produced; societeTarget += sData.target;
    societeEarned += sData.earnedMinutes; societePresence += sData.presenceMinutes;
    societeDefects += sData.defects; societeDowntime += sData.downtimeMinutes;
    societeEffectif += sData.effectif; societePrep += sData.prep; societeMontage += sData.montage;
  }

  const rootMeta = computeNodeStats(societeProduced, societeTarget, societeEarned, societePresence, societeDefects, societeDowntime, societeEffectif);
  const root: RendementNode = {
    id: '__societe__',
    label: 'Société',
    level: 'societe',
    produced: societeProduced, target: societeTarget,
    earnedMinutes: societeEarned, presenceMinutes: societePresence,
    defects: societeDefects, downtimeMinutes: societeDowntime,
    effectif: societeEffectif, prep: societePrep, montage: societeMontage,
    ...rootMeta,
    children: salleChildren,
  };

  if (typeof console !== 'undefined') {
    verifyNode(root);
  }

  return root;
}
