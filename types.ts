/** Pièce jointe PDF stockée en local (data URL). */
export type MachinePdfAttachment = {
  dataUrl: string;
  name: string;
};

/**
 * Classe (sinf) de machine — définit les paramètres méthode utilisés par les règles industrielles.
 * Plusieurs machines physiques (MachineInstance) peuvent appartenir à une même classe.
 */
export type MachineClass = {
  id: string;
  name: string;
  classe: string;      // code classe ex: "301", "504"
  speed: number;
  speedMajor: number;
  cofs: number;
  active: boolean;
  machineCategory?: string;
  photoDataUrl?: string;
  machinePhotos?: string[];
  machineManuals?: MachinePdfAttachment[];
  manualPdfDataUrl?: string;
  manualPdfName?: string;
};

/**
 * Machine physique individuelle dans l'atelier, identifiée par numéro séquentiel au sein de sa classe.
 */
export type MachineInstance = {
  id: string;
  classId: string;
  numero: number;
  matricule?: string;
  brand?: string;
  purchaseDate?: string;
  purchaseCondition?: 'NEW' | 'USED';
  status?: 'OK' | 'PANNE' | 'MAINT';
  machinePhotos?: string[];
  machineManuals?: MachinePdfAttachment[];
  chainId?: string;
  serialNumber?: string;
  downtimeStartYmd?: string;
  downtimeEndYmd?: string;
};

/** Alias rétrocompatibilité — Planning, SuiviProduction, machineMatch utilisent Machine */
export type Machine = MachineClass & {
  matricule?: string;
  brand?: string;
  purchaseDate?: string;
  purchaseCondition?: 'NEW' | 'USED';
  status?: 'OK' | 'PANNE' | 'MAINT';
  chainId?: string;
  serialNumber?: string;
  downtimeStartYmd?: string;
  downtimeEndYmd?: string;
};

/** Entrée / sortie machine conservée hors parc actif (traçabilité). */
export type MachineFleetEventKind = 'ADD' | 'EXIT' | 'SELL';

export type MachineFleetHistoryEntry = {
  id: string;
  at: string;
  kind: MachineFleetEventKind;
  /** Qui a enregistré l'opération (obligatoire sortie / vente). */
  actorName: string;
  /** Motif, acheteur, commentaire libre. */
  details: string;
  /** Copie de la fiche au moment de l'événement. */
  machineSnapshot: Machine;
  /** Valeur saisie ou décodée pour verrouiller le retrait (matricule, ou id si pas de matricule). */
  confirmationRef?: string;
};

export type SpeedFactor = {
  id: string;
  min: number;
  max: number;
  value: number;
};

export type ComplexityFactor = {
  id: string;
  label: string;
  value: number;
};

export type StandardTime = {
  id: string;
  label: string;
  value: number;
  unit: 'min' | 'sec';
};

export type Guide = {
  id: string;
  name: string;
  category: string;
  machineType: string;
  description: string;
  useCase: string;
};

export type Operation = {
  id: string;
  order: number;
  description: string;
  machineId: string;
  /** Si renseigné, la couverture machines utilise cette classe (prioritaire sur `machineId` → parc). */
  machineClass?: string;
  machineName?: string;
  length?: number;
  manualTime?: number;
  forcedTime?: number;
  time: number;
  predecessors?: string[];
  stitchCount?: number;
  rpm?: number;
  speedFactor?: number;
  guideFactor?: number;
  endPrecision?: number;
  startStop?: number;
  majoration?: number;
  guideId?: string;
  guideName?: string;
  groupId?: string; // Link operations together (visual grouping)
  targetOperationId?: string; // New: Defines the destination flow (Preparation -> Montage)
  side?: 'G' | 'D' | 'GD'; // New: Side of operation (Gauche, Droite, Gauche/Droite)
  section?: 'PREPARATION' | 'MONTAGE' | 'GLOBAL';
  /** Photo illustrative de l'opération (base64 compressé) — caméra ou galerie. */
  photo?: string;
};

export interface SectionSettings {
  efficiency: number;
  numWorkers: number;
}

export interface ModelSectionSettings {
  global: SectionSettings;
  preparation: SectionSettings;
  montage: SectionSettings;
}

export type AutoMachine = {
  id: string;
  name: string;
  rpm: number;
  length: number;
  density: number;
  handlingTime: number;
  efficiency: number;
};

export type Poste = {
  id: string;
  originalId?: string; // Links split physical posts (P1.1, P1.2) back to logical group (P1)
  name: string;
  machine: string;
  dominantSection?: 'PREPARATION' | 'MONTAGE' | 'GLOBAL';
  operatorName?: string;
  notes?: string;
  timeOverride?: number;
  length?: number;
  isPlaced?: boolean; // New field for manual mode state
  colorName?: string; // New field for persistent color assignment
  // Free Mode Props
  x?: number;
  y?: number;
  rotation?: number; // Rotation in degrees
  shape?: 'rect' | 'circle' | 'zone'; // Visual shape
  width?: number; // For resizing (future)
  height?: number; // For resizing (future)
};

export type ManualLink = {
  id: string;
  from: string;
  to: string;
  label?: string;
};

export type SavedLayout = {
  id: string;
  name: string;
  date: string;
  postes: Poste[];
  manualLinks?: ManualLink[];
};

export type FicheData = {
  date: string;
  /** Heure de lancement (HH:mm), alignée Planning / Suivi */
  launchTime?: string;
  client: string;
  category: string;
  designation: string;
  color: string;
  quantity: number;
  chaine: string;
  targetEfficiency: number;
  unitCost: number;
  clientPrice: number;
  observations: string;
  costMinute: number;
  sectionSplitEnabled?: boolean;
  sectionSettings?: ModelSectionSettings;
  sizes?: string[];
  colors?: { id: string, name: string }[];
  gridQuantities?: Record<string, number>;
  materials?: PurchasingData[];
  todm?: string;
  kisba?: 'COUPE' | 'EN_COURS' | 'NON_LANCE' | 'AUTRE';
  hala?: 'EN_COURS' | 'TERMINE' | 'EN_ATTENTE' | 'BLOQUE';
  facteurPlanning?: number;
  bufferLancement?: number;
  statutProduction?: 'En Attente' | 'En Cours' | 'En Pause' | 'Clôturé';
  typeMarche?: 'Export' | 'Local';
  toleranceSaturation?: number;
  /** Sous-traitance (façon) : le modèle est confié à un sous-traitant à prix fixe
   *  par pièce, au lieu de calculer la main d'œuvre depuis le temps des ouvriers.
   *  - mode 'facon'   : le sous-traitant coud seulement → coût = matières + prix
   *  - mode 'complet' : le sous-traitant fournit tout (matière incluse) → coût = prix
   *  L'activation masque les champs concernés sans effacer leurs données. */
  soustraitance?: {
    active: boolean;
    mode: 'facon' | 'complet';
    prix: number;
  };
};

// --- NEW TYPES FOR COST CALCULATOR ---

export interface Material {
  id: number;
  name: string;
  unitPrice: number;
  qty: number;
  unit: string;
  threadMeters: number;
  threadCapacity: number;
  fournisseur?: string;
  threadColor?: string;
  threadReference?: string;
  /** Lien fort vers l'article du Magasin (id), pour un statut stock fiable. */
  magasinId?: string;
  /**
   * Affectation de la matière à des couleurs / tailles précises de la commande.
   * Absent (ou listes vides) = la matière s'applique à TOUTES les pièces.
   * colors = ids de couleurs ; sizes = indices de tailles. La combinaison des deux
   * cible des cellules précises (couleur × taille) de la grille.
   */
  scope?: { colors?: string[]; sizes?: number[] };
}

export interface PurchasingData extends Material {
  totalRaw: number;
  totalWithWaste: number;
  qtyToBuy: number;
  lineCost: number;
}

export interface AppTask {
  id: string;
  text: string;
  assigneeName: string; // The person assigned to this task (e.g., 'Ahmed - Qualité' or 'Global Admin')
  assigneeRole?: string; // e.g. 'Chef de chaîne'
  status: 'PENDING' | 'DONE_OK' | 'DONE_NOT_OK' | 'SKIPPED';
  skipReason?: string;
  date: string; // YYYY-MM-DD
  isDone: boolean; // Keep for backward compatibility or remove if safe (let's keep and sync with status)
  createdAt: string;
}

// --- TASK MANAGEMENT & HR DIRECTORY ---
export type EmployeeRole = 'OPERATOR' | 'SUPERVISOR' | 'MECHANIC' | 'ADMIN';

export interface Employee {
  id: string;
  fullName: string;
  phoneNumber: string;
  role: EmployeeRole;
  chaineId?: string;
  isActive: boolean;
}

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'PENDING' | 'DONE_OK' | 'DONE_NOT_OK' | 'SKIPPED';

export interface Task {
  id: string;
  title?: string;
  description?: string;
  assignedTo?: string;       // Employee.id
  assignedBy?: string;       // creator user id/name
  createdAt: string;        // ISO String
  completedAt?: string;     // ISO String
  status: TaskStatus;
  text?: string;
  assigneeName?: string;
  assigneeRole?: string;
  skipReason?: string;
  date?: string;
  isDone?: boolean;
}

export interface CompanyProfile {
  companyName: string;
  legalName: string;
  slogan?: string;
  logo?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  city?: string;
  country?: string;
  description?: string;
  operatingCostsMonthly?: number;
}

export interface AppSettings {
  // --- EXISTING FINANCIAL SETTINGS ---
  costMinute: number;
  useCostMinute: boolean;
  cutRate: number;
  packRate: number;
  marginAtelier: number;
  tva: number;
  marginBoutique: number;
  // --- New App Settings ---
  workingHoursStart: string; // e.g. "08:00"
  workingHoursEnd: string; // e.g. "18:00"
  timeFormat: '12h' | '24h'; // Whether to display time in 12h AM/PM or 24h format
  pauses: { id: string, name: string, start: string, end: string, durationMin: number }[]; // Added 'name' for pause
  workingDays: number[]; // e.g [1,2,3,4,5] (Monday to Friday, 1=Monday)
  currency: string; // 'MAD' | 'EUR' | 'USD'
  chainsCount: number; // e.g 12
  chainNames?: Record<string, string>; // NEW: custom chain names matching "CHAINE 1" => "My Custom Chain"
  organigram: { id: string, name: string, role: string, parentId?: string }[]; // General Managers
  chainStaff: Record<string, { id: string, name: string, role: string }[]>; // Staff/Supervisors per chain
  companyProfile: CompanyProfile;
  chainCapacityPerDay?: Record<string, number>; // CHAINE X -> capacity/day
  /** Machines affectées à chaque ligne (ids). Si absent ou vide pour une ligne → toutes les machines actives (comportement par défaut). */
  chainMachines?: Record<string, string[]>;
  calendarExceptions?: Record<string, { isWorking: boolean, note: string }>; // Key: 'YYYY-MM-DD', for specific holidays or extra working days
  tasks?: Task[]; // Updated to the new Task interface
  employees?: Employee[]; // New: Centralized HR directory
  /** Recalcul serveur H.N. / HS depuis entrée–sortie–pause (sync `app_settings.hr_auto_overtime`). Défaut true. */
  hrAutoOvertime?: boolean;
  /** Arrondi SAGE (minutes) pour le calcul de paie — miroir de `app_settings.hr_sage_rounding` (défaut 15). */
  hrSageRounding?: number;
  /** Début de journée « usine » pour l'ancrage d'entrée (jour) — miroir de `app_settings.hr_sage_workday_start` (ex. 06:00). */
  hrSageWorkdayStart?: string;
  /** Appliquer règles SAGE côté serveur — miroir de `app_settings.hr_sage_apply` (défaut true). */
  hrSageApply?: boolean;
  /** Référence documentaire compta / facturation : base de temps pour valorisation (V1). */
  hrComptaPointageRef?: 'pointees' | 'normales_paie';
  /** Active les alertes/notifications liées aux machines (couverture machines dans le Planning). Défaut true. Si false → aucune alerte machine n'est générée, mais la page Machines reste accessible. */
  machineAlertsEnabled?: boolean;

  // ═══════════════════════════════════════════════════════════
  // APS — Advanced Planning & Scheduling (Blueprint Engine)
  // ═══════════════════════════════════════════════════════════

  /** Mode de calcul de la capacité : STATIC = pcs/jour fixe, DYNAMIC = Opérateurs × Minutes × η / SAM */
  capacityMode?: 'STATIC' | 'DYNAMIC';
  /** Nombre d'opérateurs par chaîne (ex: { "CHAINE 1": 30, "CHAINE 2": 25 }) */
  chainOperators?: Record<string, number>;
  /** Spécialités par chaîne (ex: { "CHAINE 1": ["JACKET", "COAT"] }) */
  chainSpeciality?: Record<string, string[]>;
  /** Taux d'activité Q par chaîne (0.5–1.0, défaut 0.85) — issu du Work Sampling */
  chainActivityRate?: Record<string, number>;
  /** Systèmes de tailles définis dans l'usine (alpha S/M/L, numérique 36-44, en gros, personnalisé) */
  tailleSystems?: { id: string; label: string; mode: 'alpha' | 'numerique' | 'gros' | 'custom'; sizes: string[] }[];
  /** Active/désactive la fonctionnalité « Systèmes de tailles » (Beta). Défaut : activé. */
  tailleSystemsEnabled?: boolean;
  /** ID du profil de courbe d'apprentissage par défaut */
  learningCurveProfileId?: string;
  /** Coût horaire des heures supplémentaires (MAD/h) — pour comparaison Overtime vs Sous-traitance */
  overtimeCostPerHour?: number;
  /** Coût par pièce sous-traitance par défaut (MAD/pièce) */
  subcontractDefaultCostPerPiece?: number;
  /** Temps de changement de série par défaut en minutes (ex: 120 pour 2 heures) */
  changeoverDurationMins?: number;

  /** Salle (hall/workshop) hierarchy — optional, graceful degradation to single default */
  salleNames?: Record<string, string>;          // salleId → display name
  chaineToSalle?: Record<string, string>;        // chaineId → salleId
}

export interface PdfSettings {
  orientation: 'portrait' | 'landscape';
  colorMode: 'color' | 'grayscale';
  scale: number;
}

export interface Translations {
  [key: string]: {
    [key: string]: string;
  };
}

// --- NEW TYPE FOR WORKFLOW & COUPE ---
export type WorkflowStatus =
  | 'NEW'
  | 'INGENIERIE'
  | 'COUPE'
  | 'METHODES'
  | 'PLANNING'
  | 'SUIVI'
  | 'EXPORT';

export interface Faisceau {
  id: string;
  taille: string;
  couleur: string;
  quantite: number;
  codeBarre: string;
}

export interface MatelasLine {
  id: string;
  plis: number;
  longTracee: number;
  ratios: Record<string, number>; // sizeName -> ratio (e.g. {"36": 2, "38": 6})
}

export interface OrdreCoupe {
  refModele: string;
  longueurMatelas: number;
  consommation: number;
  nbrFeuilles: number;
  nbrMatelas: number;
  qteTotale: number;
  status: 'EN_PREPARATION' | 'EN_COURS' | 'SOUS_TRAITANCE' | 'VALIDE' | 'REJETE';
  faisceaux?: Faisceau[];
  matelasLines?: MatelasLine[];
  tissuRecu?: number;
}

// --- NEW TYPE FOR LIBRARY ---
export interface ModelData {
  id: string;
  filename: string;
  workflowStatus?: WorkflowStatus; // NEW: Track the OF lifecycle
  ordreCoupe?: OrdreCoupe; // NEW: Cutting order details
  isPublishedToLibrary?: boolean; // NEW: True if visible in Bibliothèque
  image?: string | null; // Thumbnail (Front)
  images?: { front: string | null; back: string | null }; // NEW: Store both images fully
  ficheData?: FicheData; // NEW: Store complete FicheData for matrix sync
  meta_data: {
    nom_modele: string;
    reference?: string;
    category?: string;
    date_creation: string;
    date_lancement?: string;
    heure_lancement?: string;
    total_temps: number;
    effectif: number;
    sizes?: string[];
    colors?: { id: string, name: string }[];
    quantity?: number;
    photo_url?: string; // Phase 5 Anticipation
    todm?: string;
    kisba?: 'COUPE' | 'EN_COURS' | 'NON_LANCE' | 'AUTRE';
    hala?: 'EN_COURS' | 'TERMINE' | 'EN_ATTENTE' | 'BLOQUE';
  };
  gamme_operatoire: Operation[];
  // Added for Implantation persistence
  implantation?: {
    postes: Poste[];
    assignments: Record<string, string[]>;
    layoutMemory?: Record<string, { id: string, x?: number, y?: number, isPlaced?: boolean, rotation?: number }[]>;
    activeLayout?: 'zigzag' | 'free' | 'line' | 'double-zigzag';
    manualLinks?: ManualLink[];
    savedPlantations?: { id: string, name: string, date: string, layoutType: string, postes: { id: string, x?: number, y?: number, isPlaced?: boolean, rotation?: number }[] }[]; // NEW: Manual saves
  };
  chronoData?: Record<string, ChronoData>;
  chronoCustomStations?: CustomStation[];
  chronoLayoutSide?: 'left' | 'right' | 'both';
}

// --- NEW TYPES FOR EXTENDED MODULES (CHRONO, PLANNING, SUIVI, MAGASIN) ---

export interface CustomStation {
  id: string;
  name: string;
  machine: string;
  operatorName?: string;
  description?: string;
  side: 'left' | 'right';
  linkedOperationId?: string;
}

export type ChronoData = {
  operationId: string;
  tr1?: number;
  tr2?: number;
  tr3?: number;
  tr4?: number;
  tr5?: number;
  tr6?: number;
  tr7?: number;
  tr8?: number;
  tr9?: number;
  tr10?: number;
  tm?: number; // Temps Moyen
  /** Si true, tm est saisi manuellement (prioritaire sur la moyenne des TR) */
  tmManual?: boolean;
  majoration: number; // Taux de majoration (default 1.15)
  tempMajore?: number; // TM * Majoration
  pMax?: number; // Production Maximale
  p85?: number; // Production à 85%
};

export type PlanningStatus = 
  | 'READY'             // السلعة موجودة، الفصالة ناضية (أخضر)
  | 'BLOCKED_STOCK'     // حابس على السلعة من الماڭازا (أحمر)
  | 'EXTERNAL_PROCESS'  // في الطرز أو الغسيل (برتقالي)
  | 'IN_PROGRESS'       // خدامين فيه في الشين (أزرق)
  | 'DONE';             // تسالى (رمادي)

export type PlanningEvent = {
  id: string;
  isLocked?: boolean;
  modelId: string;
  chaineId: string;         // الشين فين غيتخيط
  dateLancement: string;    // وقتاش غيبدا
  dateExport: string;       // وقتاش خصو يتسالم (DDS)
  qteTotal: number;         // الكمية الإجمالية
  qteProduite?: number;     // شحال تخدم من بياسة (كتجي من Suivi)
  status: PlanningStatus | 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK';
  blockedReason?: string;   // إيلا كان حابس، شنو السبب؟ (مثلا: ناقص الخيط)
  dateFin?: string;         // Phase 6 Atelier
  superviseur?: string;
  totalQuantity?: number;
  startDate?: string;
  strictDeadline_DDS?: string;
  clientName?: string;
  estimatedEndDate?: string;
  producedQuantity?: number;
  modelName?: string;
  // Section-aware scheduling
  sectionSplitEnabled?: boolean;
  fournisseurId?: string;
  fournisseurDate?: string;  // L: matériaux arrivent
  prepStart?: string;        // saisi par l'utilisateur
  prepEnd?: string;          // calculé
  montageStart?: string;     // calculé: max(prepEnd, fournisseurDate)
  montageEnd?: string;       // calculé = dateExport
  lots_data?: Lot[];         // Phase 2: Sous-commandes
  color?: string;            // Couleur identifiant l'OF dans le Suivi
  lastSyncedFromSuivi?: string;
  /** Phase 5 — écart besoins vs stock magasin (persisté avec l'OF) */
  materialShortages?: { name: string; unit?: string; productId?: string; required: number; available: number; missing: number; unmatched?: boolean }[];
  /** Phase 6 — bons de commande brouillon liés à l'OF (sans API SQLite pour l'instant) */
  purchaseOrdersDraft?: PlanningPurchaseDraft[];
  /** Phase 7 — Sous-traitance */
  isSubcontracted?: boolean;
  subcontractorName?: string;
  subcontractStatus?: 'PENDING' | 'SENT' | 'COMPLETED';
  subcontractorPhone?: string;
  subcontractorRating?: number;
  subcontractorAvailabilityDate?: string;
  subcontractPricePerPiece?: number;
  subcontractSizeColorDistribution?: Record<string, Record<string, number>>;
  /** Répartition par couleur et taille (ex: { "red": { "S": 10, "M": 20 } }) */
  sizeColorDistribution?: Record<string, Record<string, number>>;

  // ═══════════════════════════════════════════════════════════
  // APS — Critical Ratio & Re-scheduling fields
  // ═══════════════════════════════════════════════════════════

  /** Valeur CR calculée (Critical Ratio) — mis à jour après chaque suivi */
  crValue?: number;
  /** Statut CR : CRITICAL / AT_RISK / ON_TRACK / AHEAD */
  crStatus?: 'CRITICAL' | 'AT_RISK' | 'ON_TRACK' | 'AHEAD';
  /** Déficit accumulé en pièces (somme des écarts cible-réel) */
  accumulatedDeficit?: number;
  /** ID du profil courbe d'apprentissage (override par OF) */
  learningCurveProfileId?: string;
  /** Taux d'activité Q override (par OF) */
  activityRateOverride?: number;
  facteurPlanning?: number;
  bufferLancement?: number;
  typeMarche?: 'Export' | 'Local';
};

/** Ligne de BC générée depuis le planning (persistance JSON / raw_data) */
export type PlanningPurchaseDraft = {
  id: string;
  productId: string;
  productName: string;
  qty: number;
  supplierName?: string;
  orderDateYmd: string;
  expectedArrivalYmd: string;
  status: 'DRAFT';
};

export interface SubcontractOrder {
  id: string;
  modelId: string;
  modelName?: string;
  clientName?: string;
  totalQuantity: number;
  subcontractorName: string;
  pricePerPiece?: number;
  deliveryDate: string;
  status: 'PENDING' | 'IN_COUPE' | 'IN_COUTURE' | 'IN_FINITION' | 'LIVRE_PARTIEL' | 'COMPLETED';
  sizes_json?: string; // format: JSON string representing Record<string, number>
  colors_json?: string; // format: JSON string representing Record<string, number>
  notes?: string;
  tissuStatus?: 'PENDING' | 'SENT';
  fournituresStatus?: 'PENDING' | 'DELIVERED';
  ficheTechniqueSent?: number; // 0 or 1
  qtyAccepted?: number;
  qtyToRepair?: number;
  qtyRejected?: number;
  subcontractorPhone?: string;
  subcontractorRating?: number;
  subcontractorAvailabilityDate?: string;
  prestationType?: 'CMT' | 'FACON_PURE';
  tissuFournisseur?: 'CLIENT' | 'SUBCONTRACTOR';
  fournituresFournisseur?: 'CLIENT' | 'SUBCONTRACTOR';
  conditionnementFournisseur?: 'CLIENT' | 'SUBCONTRACTOR';
  protoRequired?: number; // 0 or 1
  protoStatus?: 'PENDING' | 'APPROVED';
  paymentTerms?: 'AVANCE_RECEPTION' | 'APRES_LIVRAISON' | 'ECHEANCES';
  defectRateAccepted?: number;
  stitchingDetails?: string;
  specifications_json?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Lot {
  id: string;
  taille: string;
  couleur: string;
  quantite: number;
  deadline: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'READY' | 'DELIVERED';
  dateDelivered?: string;
  producedQuantity?: number;
  modelId?: string;
  sizeColorDistribution?: Record<string, Record<string, number>>;
}

export interface SectionEffectif {
  total: number;
  roles?: Record<string, number>;
}

export interface Chaine {
  id: string;
  name: string;
  capacityPerDay: number;   // القدرة الإنتاجية في النهار
  isActive: boolean;
  /** Efficacité dynamique (Suivi) ou manuelle — optionnel */
  efficiency?: number;
  efficiencySource?: 'COMPUTED' | 'MANUAL';
  efficiencySampleSize?: number;
}

export type HourlySuivi = Record<string, number | undefined>;

/** Rôles AJANIF (effectifs journaliers) — tags libres optionnels (ex. OVR), sans impact sur les totaux numériques */
export type EffectifRoleTagKey = 'chaf' | 'recta' | 'sujet' | 'transp' | 'man' | 'sp' | 'stager';

export type SuiviData = {
  id: string;
  planningId: string;
  date: string;
  entrer: number;
  sorties: HourlySuivi;
  totalHeure: number;
  pJournaliere: number;
  enCour: number;
  resteEntrer: number;
  resteSortie: number;
  // Legacy effectifs (kept for backward compatibility)
  machinistes?: number;
  tracage?: number;
  preparation?: number;
  finition?: number;
  controle?: number;
  // AJANIF-standard effectifs
  chaf?: number;
  recta?: number;
  sujet?: number;
  transp?: number;
  man?: number;
  sp?: number;
  stager?: number;
  methodes?: number;
  qualite?: number;
  mecanicien?: number;
  /** Texte libre par rôle (code, remarque) — affiché à côté des effectifs ; ne remplace pas les nombres */
  effectifRoleTags?: Partial<Record<EffectifRoleTagKey, string>>;
  ouvriers_modele?: number; // Ouvriers dédiés au modèle (dénominateur R%)
  absent?: number;
  totalWorkers: number;
  downtimes?: Record<string, string>; // NEW: Phase 13 - Reasons for missed targets
  defauts?: { id: string; hour: string; type: string; quantity: number; notes: string }[]; // NEW: Phase 13 - In-Line QC
  trs?: number; // NEW: Phase 13 - OEE/TRS score
  // Section-aware tracking
  activeSection?: 'PREPARATION' | 'MONTAGE' | 'BOTH';
  sectionEffectif?: { preparation: SectionEffectif; montage: SectionEffectif };
  sectionOutput?: { preparation: number; montage: number };
  // PHASE 6 — Next-Gen Suivi
  modelId?: string;
  chaineId?: string;
  created_by?: string;
  source?: 'PLANNING' | 'LIBRARY_DIRECT';
  scrap_details?: ScrapDetail[];
  downtime_events?: DowntimeEvent[];
  comments?: SuiviComment[];
  /** Fil d'activité atelier (référence logique, ex. bera:activity:planningId:posteId) */
  activityThreadId?: string;
  activityAnchorPosteId?: string;
  /** Snapshot optionnel des bornes gamme (poste / opération) */
  gammeEntryPosteId?: string;
  gammeExitPosteId?: string;
  // NEW: Support for dynamic effectif roles
  customEffectifs?: Record<string, number>;
};

// PHASE 6 — Next-Gen Suivi types
export type PosteType = 'MACHINISTE' | 'MANUEL' | 'AUX';

export type SuiviEffectifHoraire = {
  id: string;
  suivi_id: string;
  chaineId: string;
  modelId?: string;
  date: string;
  heure_debut: string; // "HH:MM"
  heure_fin: string;   // "HH:MM"
  worker_id?: string;
  poste?: string;
  type_poste: PosteType;
  is_present: boolean;
  join_minute?: number;  // 0..60 — minutes into the hour when the worker joined
  leave_minute?: number; // 0..60 — minutes into the hour when the worker left
};

export type DowntimeEvent = {
  id: string;
  hour: string;     // "HH:MM"
  code: string;     // FK → downtime_codes.code
  minutes: number;
  notes?: string;
  reported_by?: string;
};

export type ScrapDetail = {
  id: string;
  hour: string;
  quantity: number;
  cause: string;
  worker_id?: string;
  operation?: string;
};

export type SuiviComment = {
  id: string;
  hour?: string;
  author: string;
  text: string;
  timestamp: string;
};

export type OEEBreakdown = {
  disponibilite: number;  // 0..1
  performance: number;    // 0..1
  qualite: number;        // 0..1
  oee: number;            // product
  plannedMinutes: number;
  runMinutes: number;
  downtimeMinutes: number;
  produced: number;
  theoretical: number;
  good: number;
};

export type PosteSuiviData = {
  id: string;
  planningId: string;
  modelId: string;
  posteId: string;
  workerId?: string;
  date: string;
  heure_debut?: string;
  heure_fin?: string;
  pieces_entrees: number;
  pieces_sorties: number;
  pieces_defaut: number;
  temps_reel_par_piece?: number;
  temps_prevu_par_piece?: number;
  notes?: string;
  problemes: string[];
};

// --- TYPES FOR MAGASIN & ATELIER ---

export interface MouvementStock {
  id: string;
  productId: string;
  type: 'entree' | 'sortie' | 'retour_atelier' | 'rebut' | 'regularisation' | 'reservation';
  source: 'fournisseur' | 'retour_chaine' | 'inventaire';
  destination: 'chaine' | 'rebut' | 'inventaire';
  quantite: number;
  prixUnitaire?: number;
  fournisseurId?: string;
  chaineId?: string;
  modeleRef?: string;
  date: string;
  operateurNom?: string;
  notes?: string;
  lotId?: string;
  bain?: string;
  documentRef?: string;
  pieceJointe?: string; // Base64 string for photo
}

export interface DemandeAppro {
  id: string;
  dateDemande: string;
  modelId: string;
  chaineId: string;
  produitDesignation: string;
  quantiteDemandee: number;
  demandeur: string;
  notes?: string;
  statut: 'attente' | 'preparee' | 'livree' | 'rejetee';
}

// ═══════════════════════════════════════════════════════════
// STOCK PRODUIT FINI — Pièces finies après production
// ═══════════════════════════════════════════════════════════

export interface FinishedGoodStock {
  id: string;
  owner_id: number;
  modelId: string;
  planningId?: string;
  reference?: string;
  designation?: string;
  clientName?: string;
  chaineId?: string;
  quantiteProduite: number;
  quantiteDefaut: number;
  quantiteExpediee: number;
  quantiteRestante: number;
  statut: 'disponible' | 'partielle' | 'expediee';
  dateProduction: string;
  dateExportPrevue?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface FinishedGoodMovement {
  id: string;
  owner_id: number;
  fgId: string;
  type: 'entree' | 'expedition' | 'retour' | 'regularisation';
  quantite: number;
  date: string;
  clientNom?: string;
  bonLivraisonRef?: string;
  factureRef?: string;
  notes?: string;
  created_at: string;
}

// ═══════════════════════════════════════════════════════════
// PHASE 5 — HR MODULE TYPES (RH Complet + Sage Paie)
// ═══════════════════════════════════════════════════════════

export type HRWorkerRole = 'OPERATOR' | 'SUPERVISOR' | 'MECHANIC' | 'ADMIN' | 'QC' | 'IRON' | 'CUTTER' | 'PACKER';
export type HRContractType = 'CDI' | 'CDD' | 'ANAPEC' | 'STAGE';
export type HRPointageStatus = 'PRESENT' | 'ABSENT' | 'CONGE' | 'MALADIE' | 'RETARD' | 'MISSION' | 'FERIE';
export type HRPointageSource = 'MANUAL' | 'RFID' | 'FINGERPRINT' | 'FACE';
export type HRAvanceStatut = 'DEMANDE' | 'APPROUVE' | 'EN_COURS' | 'REMBOURSE' | 'REFUSE' | 'ANNULE';

export interface HRWorker {
  id: string;
  matricule: string;
  full_name: string;
  /** Identité plateforme (Section 23) — renvoyé par l'API, lecture seule côté UI */
  person_id?: string | null;
  /** Rattachement explicite à un person_id existant (corps POST uniquement, pas colonne SQL) */
  link_person_id?: string | null;
  /** Indication API BERAOUVIER : un PIN a été défini (pas le hash) */
  has_pin?: boolean;
  cin?: string;
  cnss?: string;
  phone?: string;
  date_naissance?: string;
  adresse?: string;
  photo?: string;
  sexe?: 'M' | 'F';
  role: HRWorkerRole;
  chaine_id?: string;
  poste?: string;
  specialite?: string;
  date_embauche: string;
  type_contrat: HRContractType;
  date_fin_contrat?: string;
  date_renouvellement?: string;
  is_active: boolean;
  contact_urgence_nom?: string;
  contact_urgence_tel?: string;
  contact_urgence_lien?: string;
  pointeuse_id?: string;
  pointeuse_device?: string;
  pointeuse_type?: 'RFID' | 'FINGERPRINT' | 'FACE' | 'MANUAL';
  salaire_base: number;
  taux_horaire: number;
  taux_piece: number;
  prime_assiduite: number;
  prime_transport: number;
  mode_paiement: 'VIREMENT' | 'ESPECES' | 'CHEQUE';
  notes?: string;
  equipe?: string;
  transport_ligne_id?: string;
  transport_ligne_nom?: string;
  transport_ligne_quartier?: string;
  owner_id?: number;
  hidden_from_societes?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface HRTransportLigne {
  id: string;
  nom: string;
  code_ligne?: string;
  quartier?: string;
  chauffeur_nom?: string;
  chauffeur_tel?: string;
  matricule_vehicule?: string;
  capacite: number;
  notes?: string;
  owner_id?: number;
  created_at?: string;
}

export interface HRPointage {
  id: string;
  worker_id: string;
  date: string;
  /** JSON : tableau de 9 booléens (créneaux 6h30–15h30), optionnel — sinon grille dérivée des heures. */
  grille_presence?: string | null;
  heure_entree?: string;
  heure_sortie?: string;
  pause_debut?: string;
  pause_fin?: string;
  source: HRPointageSource;
  heures_travaillees: number;
  heures_normales: number;
  heures_supp_25: number;
  heures_supp_50: number;
  statut: HRPointageStatus;
  motif_absence?: string;
  is_validated: boolean;
  validated_by?: string;
  notes?: string;
}

export interface HRProduction {
  id: string;
  worker_id: string;
  date: string;
  chaine_id?: string;
  model_ref?: string;
  pieces_produites: number;
  pieces_defaut: number;
  pieces_retouchees: number;
  taux_qualite?: number;
  rendement?: number;
  notes?: string;
}

export interface HRAvance {
  id: string;
  worker_id: string;
  date_demande: string;
  montant: number;
  montant_approuve?: number;
  montant_rembourse: number;
  solde_restant: number;
  nb_echeances: number;
  mois_debut_deduction?: string;
  statut: HRAvanceStatut;
  approuve_par?: string;
  date_approbation?: string;
  motif?: string;
  notes?: string;
}

export interface HRSageExport {
  id: string;
  mois: string;
  date_export: string;
  nb_salaries: number;
  total_salaire_base: number;
  total_heures_supp: number;
  total_primes: number;
  total_avances: number;
  total_brut: number;
  total_net: number;
  fichier_nom: string;
}

export interface SagePaieRow {
  matricule: string;
  nom: string;
  prenom: string;
  cin: string;
  cnss: string;
  nb_jours: number;
  h_normales: number;
  h_supp_25: number;
  h_supp_50: number;
  sal_base: number;
  prime_piece: number;
  prime_assiduite: number;
  prime_transport: number;
  total_brut: number;
  avances: number;
  net_a_payer: number;
}

// --------------------------------------------------------------------------------
// PHASE: FACTURATION (Achat, Vente, Devis, BL)
// --------------------------------------------------------------------------------

export interface FactureLigne {
  designation: string;
  quantite: number;
  prix_unitaire: number;
  total: number;
}

export type FactureType = 'ACHAT' | 'VENTE' | 'PROFORMA' | 'AVOIR' | 'DEVIS';
export type FactureStatut = 'BROUILLON' | 'ENVOYEE' | 'PAYEE' | 'PARTIELLEMENT' | 'ANNULEE' | 'ACCEPTE' | 'REFUSE';

export interface Facture {
  id: string;
  owner_id: number;
  numero: string;
  type: FactureType;
  
  tiers_nom: string;
  tiers_ice?: string | null;
  tiers_rc?: string | null;
  tiers_if?: string | null;
  tiers_adresse?: string | null;
  tiers_tel?: string | null;
  tiers_email?: string | null;
  
  date_facture: string;
  date_echeance?: string | null;
  
  total_ht: number;
  taux_tva: number; // 0 for optional/no TVA
  total_tva: number;
  total_ttc: number;
  montant_paye: number;
  
  devis_id?: string | null;
  planning_id?: string | null;
  commande_id?: string | null;
  
  statut: FactureStatut;
  notes?: string | null;
  lignes: FactureLigne[]; // Will be stored as JSON string in DB
  created_at: string;
  updated_at: string;
}

export interface BonLivraison {
  id: string;
  owner_id: number;
  numero: string;
  facture_id?: string | null;
  tiers_nom: string;
  date_livraison: string;
  adresse_livraison?: string | null;
  transporteur?: string | null;
  lignes: any[]; // JSON array
  statut: 'PREPARE' | 'EXPEDIE' | 'LIVRE' | 'RETOUR';
  notes?: string | null;
  created_at: string;
}

export interface Paiement {
  id: string;
  owner_id: number;
  facture_id: string;
  date_paiement: string;
  montant: number;
  mode: 'VIREMENT' | 'CHEQUE' | 'ESPECES' | 'LCN';
  reference?: string | null;
  notes?: string | null;
  created_at: string;
}

// --------------------------------------------------------------------------------
// PHASE: ADVANCED LOGISTICS & MRP
// --------------------------------------------------------------------------------

export interface MaterialReceipt {
  id: string;              // BR reference number (e.g. BR-2026-001)
  pedidoId: string;        // Linked client order (Pedido)
  modelId: string;         // Linked model
  materialName: string;    // Name matching the BOM entry
  qtyReceived: number;     // Physical quantity delivered
  dateReceived: string;    // YYYY-MM-DD
  owner: 'client' | 'atelier'; // Stock ownership flag
  supplierName?: string;   // Supplier or client name
}

export interface InventoryMovement {
  id: string;
  ofId?: string;           // Linked production event (PlanningEvent)
  materialName: string;    // Trim or fabric name
  type: 'IN' | 'OUT';      // Mouvement direction
  qty: number;
  date: string;            // YYYY-MM-DD
  notes?: string;          // e.g. "Sortie pour Chaine 1"
}
