import type { ModelData, Machine } from '../types';

export type CatalogueSimilarRow = {
  modelId: string;
  nom: string;
  score: number;
  totalTempsMin: number;
  gammeMinutes: number;
  category: string;
};

const STOP = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'ou', 'à', 'a', 'en', 'sur', 'pour', 'avec', 'sans', 'the', 'and', 'or',
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/i)
    .map(t => t.trim())
    .filter(t => t.length > 1 && !STOP.has(t));
}

function tokenSetFromModel(m: ModelData, machines: Machine[]): Set<string> {
  const parts: string[] = [];
  const f = m.ficheData;
  if (f) {
    parts.push(f.designation || '', f.category || '', f.client || '', f.observations || '', f.color || '');
    if (f.materials?.length) {
      for (const mat of f.materials) parts.push(mat.name || '', mat.fournisseur || '');
    }
  }
  const meta = m.meta_data;
  parts.push(meta?.nom_modele || '', meta?.reference || '', meta?.category || '');
  for (const op of m.gamme_operatoire || []) {
    parts.push(op.description || '', op.machineName || '');
    const mn = machines.find(x => x.id === op.machineId)?.name;
    if (mn) parts.push(mn);
  }
  const set = new Set<string>();
  for (const p of parts) {
    for (const t of tokens(p)) set.add(t);
  }
  return set;
}

function gammeTotalMinutes(m: ModelData): number {
  return (m.gamme_operatoire || []).reduce((a, op) => a + (Number(op.time) || 0), 0);
}

/**
 * MVP : similarité par intersection de tokens (fiche + gamme + machines).
 */
export function suggestSimilarModelsForTemps(
  target: ModelData,
  libraryModels: ModelData[],
  machines: Machine[],
  opts?: { limit?: number; minScore?: number }
): CatalogueSimilarRow[] {
  const limit = opts?.limit ?? 8;
  const minScore = opts?.minScore ?? 1;
  const targetSet = tokenSetFromModel(target, machines);
  if (targetSet.size === 0) return [];

  const rows: CatalogueSimilarRow[] = [];
  for (const m of libraryModels) {
    if (m.id === target.id) continue;
    const cand = tokenSetFromModel(m, machines);
    let score = 0;
    for (const t of targetSet) {
      if (cand.has(t)) score += 1;
    }
    if (target.meta_data?.category && m.meta_data?.category && target.meta_data.category === m.meta_data.category) {
      score += 3;
    }
    if (target.ficheData?.category && m.ficheData?.category && target.ficheData.category === m.ficheData.category) {
      score += 3;
    }
    if (score < minScore) continue;
    const totalTempsMin =
      m.meta_data?.total_temps != null && !Number.isNaN(Number(m.meta_data.total_temps))
        ? Number(m.meta_data.total_temps)
        : gammeTotalMinutes(m);
    rows.push({
      modelId: m.id,
      nom: (m.meta_data?.nom_modele || m.filename || m.id).trim(),
      score,
      totalTempsMin,
      gammeMinutes: gammeTotalMinutes(m),
      category: m.meta_data?.category || m.ficheData?.category || '—',
    });
  }
  rows.sort((a, b) => b.score - a.score || a.nom.localeCompare(b.nom, 'fr'));
  return rows.slice(0, limit);
}

export function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
