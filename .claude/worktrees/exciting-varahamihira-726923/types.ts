
export type Machine = {
  id: string;
  name: string;
  classe: string;
  speed: number;
  speedMajor: number;
  cofs: number;
  active: boolean;
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
  calendarExceptions?: Record<string, { isWorking: boolean, note: string }>; // Key: 'YYYY-MM-DD', for specific holidays or extra working days
  tasks?: Task[]; // Updated to the new Task interface
  employees?: Employee[]; // New: Centralized HR directory
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
export type WorkflowStatus = 'COUPE' | 'METHODES' | 'PLANNING' | 'SUIVI' | 'EXPORT';

export interface Faisceau {
  id: string;
  taille: string;
  couleur: string;
  quantite: number;
  codeBarre: string;
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
}

// --- NEW TYPES FOR EXTENDED MODULES (CHRONO, PLANNING, SUIVI, MAGASIN) ---

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
};

export interface Lot {
  id: string;
  taille: string;
  couleur: string;
  quantite: number;
  deadline: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'READY' | 'DELIVERED';
  dateDelivered?: string;
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
}

export type HourlySuivi = Record<string, number | undefined>;

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
  owner_id?: number;
  hidden_from_societes?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface HRPointage {
  id: string;
  worker_id: string;
  date: string;
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