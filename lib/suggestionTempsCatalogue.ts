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

// ─── Fuzzy Operation Matching ────────────────────────────────────────────

export type OperationLike = {
  description: string;
  machine: string;
  machineClass?: string;
  section?: string;
  time: number;
  modelId?: string;
  modelName?: string;
  garmentType?: string;
  gammeLength?: number;
  gammeTotalTime?: number;
  workerName?: string;
  reference?: string;
  fromChrono?: boolean;
};

export type FuzzyMatchResult = {
  merged: OperationLike[];
  confidence: number; // 0-1
};

const STOP_WORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'ou', 'à', 'a',
  'en', 'sur', 'pour', 'avec', 'sans', 'the', 'and', 'or', 'de', 'du',
  'les', 'des', 'un', 'une', 'est', 'son', 'sa', 'ses', 'ce', 'cette',
]);

function normFuzzy(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ');
}

function opTokens(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/i)
    .map(t => t.trim())
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

/**
 * Jaccard similarity between two token sets
 */
function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Prefix similarity — checks if one string starts with the other
 * e.g. "ass" matches "assembler", "piq" matches "piquer"
 */
function prefixSimilarity(a: string, b: string): number {
  const na = normFuzzy(a);
  const nb = normFuzzy(b);
  if (na === nb) return 1;
  if (na.startsWith(nb) || nb.startsWith(na)) {
    const minLen = Math.min(na.length, nb.length);
    const maxLen = Math.max(na.length, nb.length);
    return minLen / maxLen;
  }
  return 0;
}

/**
 * Compute fuzzy similarity between two operation descriptions
 * Returns score 0-1 (1 = exact match, 0 = completely different)
 */
export function operationSimilarity(descA: string, descB: string): number {
  const tokensA = opTokens(descA);
  const tokensB = opTokens(descB);

  // Exact normalized match
  const normA = normFuzzy(descA);
  const normB = normFuzzy(descB);
  if (normA === normB) return 1;

  // Token-based Jaccard
  const jaccard = jaccardSimilarity(tokensA, tokensB);

  // Prefix bonus: if any token is a prefix match
  let prefixBonus = 0;
  for (const ta of tokensA) {
    for (const tb of tokensB) {
      const ps = prefixSimilarity(ta, tb);
      if (ps > 0.6) prefixBonus = Math.max(prefixBonus, ps * 0.3);
    }
  }

  // Length penalty: very different lengths = lower score
  const lenRatio = Math.min(tokensA.length, tokensB.length) / Math.max(tokensA.length, tokensB.length);
  const lenPenalty = lenRatio > 0.5 ? 1 : 0.5 + lenRatio * 0.5;

  return Math.min(1, (jaccard + prefixBonus) * lenPenalty);
}

/**
 * Compute machine similarity (same machine = bonus)
 */
export function machineSimilarity(machineA: string, machineB: string): number {
  const na = normFuzzy(machineA);
  const nb = normFuzzy(machineB);
  if (na === nb) return 1;
  // Partial match (e.g. "514" matches "514 surjeteuse")
  if (na.includes(nb) || nb.includes(na)) return 0.7;
  return 0;
}

/**
 * Full operation match score combining description + machine + section
 */
export function operationMatchScore(
  a: { description: string; machine: string; section?: string },
  b: { description: string; machine: string; section?: string },
): number {
  const descSim = operationSimilarity(a.description, b.description);
  const machSim = machineSimilarity(a.machine, b.machine);

  // Machine is critical — different machine usually means different entry
  if (machSim === 0) return descSim * 0.3; // heavy penalty

  // Section bonus
  const sectionBonus = (a.section && b.section && a.section === b.section) ? 0.05 : 0;

  // Weighted combination: description 70%, machine 25%, section 5%
  return descSim * 0.7 + machSim * 0.25 + sectionBonus;
}

/**
 * Build a fuzzy key for an operation — groups similar operations together
 */
export function buildFuzzyKey(
  description: string,
  machine: string,
  threshold: number = 0.7,
): string {
  // Primary key: normalized description + machine
  const normDesc = normFuzzy(description);
  const normMach = normFuzzy(machine);
  return `${normDesc}|${normMach}`;
}

/**
 * Check if two operations should be merged based on their gamme context
 * Returns true if they're likely the same operation despite time differences
 */
export function shouldMergeOperations(
  opA: { time: number; gammeLength?: number; gammeTotalTime?: number },
  opB: { time: number; gammeLength?: number; gammeTotalTime?: number },
  timeDiffThreshold: number = 0.4,
): boolean {
  const timeRatio = Math.max(opA.time, opB.time) / Math.max(1, Math.min(opA.time, opB.time));
  if (timeRatio <= 1 + timeDiffThreshold) return true; // times are close enough

  // Times differ significantly — check gamme context
  if (opA.gammeLength != null && opB.gammeLength != null) {
    const gammeLenDiff = Math.abs(opA.gammeLength - opB.gammeLength) / Math.max(opA.gammeLength, opB.gammeLength);
    if (gammeLenDiff > 0.3) return false; // very different gamme structures → different operations
  }

  if (opA.gammeTotalTime != null && opB.gammeTotalTime != null) {
    const gammeTimeDiff = Math.abs(opA.gammeTotalTime - opB.gammeTotalTime) / Math.max(opA.gammeTotalTime, opB.gammeTotalTime);
    if (gammeTimeDiff > 0.3) return false;
  }

  return true; // similar context → merge with warning
}

/**
 * Group operations by fuzzy similarity
 * Returns groups of operations that should be merged into single catalogue entries
 */
export function groupOperationsBySimilarity(
  operations: OperationLike[],
  matchThreshold: number = 0.65,
): OperationLike[][] {
  const groups: OperationLike[][] = [];

  for (const op of operations) {
    let matched = false;
    for (const group of groups) {
      const representative = group[0];
      const score = operationMatchScore(
        { description: representative.description, machine: representative.machine, section: representative.section },
        { description: op.description, machine: op.machine, section: op.section },
      );
      if (score >= matchThreshold) {
        // Check if times are compatible
        const avgTime = group.reduce((s, g) => s + g.time, 0) / group.length;
        if (shouldMergeOperations({ time: avgTime, gammeLength: representative.gammeLength, gammeTotalTime: representative.gammeTotalTime }, { time: op.time, gammeLength: op.gammeLength, gammeTotalTime: op.gammeTotalTime })) {
          group.push(op);
          matched = true;
          break;
        }
      }
    }
    if (!matched) {
      groups.push([op]);
    }
  }

  return groups;
}

/**
 * Merge a group of similar operations into a single catalogue entry
 */
export function mergeOperationGroup(group: OperationLike[]): {
  description: string;
  machine: string;
  section?: string;
  avg: number;
  min: number;
  max: number;
  count: number;
  confidence: number;
  garmentTypes: string[];
} {
  const times = group.map(o => o.time);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);

  // Confidence based on consistency
  const spread = max > 0 ? (max - min) / max : 0;
  const countBonus = Math.min(1, group.length / 5); // more sources = more confidence
  const consistencyBonus = Math.max(0, 1 - spread * 2); // less spread = more confidence
  const confidence = Math.min(1, (countBonus * 0.4 + consistencyBonus * 0.6));

  // Use the most common description (or the longest one)
  const descMap = new Map<string, number>();
  for (const op of group) {
    const n = normFuzzy(op.description);
    descMap.set(n, (descMap.get(n) || 0) + 1);
  }
  let bestDesc = group[0].description;
  let bestCount = 0;
  for (const op of group) {
    const c = descMap.get(normFuzzy(op.description)) || 0;
    if (c > bestCount || (c === bestCount && op.description.length > bestDesc.length)) {
      bestDesc = op.description;
      bestCount = c;
    }
  }

  const garmentTypes = [...new Set(group.map(o => o.garmentType).filter(Boolean))];

  return {
    description: bestDesc,
    machine: group[0].machine,
    section: group[0].section,
    avg,
    min,
    max,
    count: group.length,
    confidence,
    garmentTypes,
  };
}
