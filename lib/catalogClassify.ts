export type GarmentType = 'CHEMISE' | 'SARWAL' | 'TSHIRT' | 'POLO' | 'AUTRE';
export type OperationType = 'COUTURE' | 'PREPARATION' | 'FINITION' | 'REPASSAGE' | 'CONTROLE' | 'AUTRE';

const GARMENT_KEYWORDS: Record<GarmentType, string[]> = {
  CHEMISE: ['chemise', 'shirt', 'camisa', 'chemisier', 'blouse'],
  SARWAL: ['pantalon', 'sarwal', 'trouser', 'bottom', 'jogging', 'short', 'bermuda'],
  TSHIRT: ['t-shirt', 'tee', 'tshirt', 'marcel', 'débardeur'],
  POLO: ['polo', 'polo shirt'],
  AUTRE: [],
};

const OPERATION_KEYWORDS: Record<OperationType, string[]> = {
  COUTURE: [
    'coudre', 'assembler', 'piquer', 'surjeter', 'faufiler', 'point',
    'crafter', 'overlock', 'surcharger', 'broder', 'attacher',
    'reprendre', 'fixer', 'monter', 'poser', 'ourler', 'ourlir',
    'froncer', 'plisser', 'empiécer', 'assembl', 'cousu', 'coud',
  ],
  PREPARATION: [
    'couper', 'marquer', 'repérer', 'découper', 'décalquer',
    'tracer', 'échanillonner', 'tracer le patron', ' découpe',
  ],
  FINITION: [
    'repasser', 'presser', 'filer', 'couper le fil', 'nettoyer',
    'détacher', 'essorer', 'écrouter', 'pressage', 'repassage',
  ],
  REPASSAGE: [
    'repasser', 'repassage', 'presser', 'pressoir', 'repassoir',
    'pressage', 'finisher', 'finish',
  ],
  CONTROLE: [
    'contrôler', 'vérifier', 'controler', 'vérif', 'controle',
    'qualité', 'check', 'inspection',
  ],
  AUTRE: [],
};

const MACHINE_OPERATION_MAP: Record<string, OperationType> = {
  'piqueuse': 'COUTURE',
  'surjeteuse': 'COUTURE',
  'overlock': 'COUTURE',
  'brodeuse': 'COUTURE',
  'buttonhole': 'COUTURE',
  'boutonnière': 'COUTURE',
  'repassoir': 'REPASSAGE',
  'pressoir': 'REPASSAGE',
  'coupe': 'PREPARATION',
  'cutter': 'PREPARATION',
};

function norm(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function matchesKeywords(text: string, keywords: string[]): boolean {
  const n = norm(text);
  return keywords.some(kw => n.includes(norm(kw)));
}

/**
 * Classify garment type from ficheData.category or meta_data.category
 */
export function classifyGarment(category: string): GarmentType {
  if (!category) return 'AUTRE';
  for (const [type, keywords] of Object.entries(GARMENT_KEYWORDS) as [GarmentType, string[]][]) {
    if (type === 'AUTRE') continue;
    if (matchesKeywords(category, keywords)) return type;
  }
  return 'AUTRE';
}

/**
 * Classify operation type from description + machine info
 */
export function classifyOperation(description: string, machineClass?: string, machineName?: string): OperationType {
  const text = `${description} ${machineClass || ''} ${machineName || ''}`;

  for (const [type, keywords] of Object.entries(OPERATION_KEYWORDS) as [OperationType, string[]][]) {
    if (type === 'AUTRE') continue;
    if (matchesKeywords(text, keywords)) return type;
  }

  const machineLower = norm(`${machineClass || ''} ${machineName || ''}`);
  for (const [machineKeyword, opType] of Object.entries(MACHINE_OPERATION_MAP)) {
    if (machineLower.includes(norm(machineKeyword))) return opType;
  }

  return 'AUTRE';
}

/**
 * Get garment type label in French
 */
export function garmentLabel(type: GarmentType): string {
  const labels: Record<GarmentType, string> = {
    CHEMISE: 'Chemise',
    SARWAL: 'Pantalon',
    TSHIRT: 'T-shirt',
    POLO: 'Polo',
    AUTRE: 'Autre',
  };
  return labels[type];
}

/**
 * Get operation type label in French
 */
export function operationLabel(type: OperationType): string {
  const labels: Record<OperationType, string> = {
    COUTURE: 'Couture',
    PREPARATION: 'Préparation',
    FINITION: 'Finition',
    REPASSAGE: 'Repassage',
    CONTROLE: 'Contrôle',
    AUTRE: 'Autre',
  };
  return labels[type];
}
