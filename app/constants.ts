import { Machine, Guide } from '../types';

export const TRANSLATIONS = {
    fr: {
        title: 'INGÉNIERIE BERAMETHODE',
        dashboard: 'Tableau de bord',
        library: 'Bibliothèque',
        coupe: 'La Coupe',
        effectifs: 'Effectifs',
        objectifs: 'Objectifs',
        atelier: 'Chef Atelier',
        ingenierie: 'Ingénierie',
        admin: 'Admin',
        profile: 'Profil',
        config: 'Paramètres',
        export: 'Export Stocks',
        suivi: 'Suivi Production',
        planning: 'Planning',
        magasin: 'Magasin',
        logout: 'Déconnexion',
        langBtn: 'AR',
        saved: 'Sauvegardé',
        saving: 'Enregistrement...',
        unsaved: 'Non sauvegardé',
        fiche: 'Fiche Technique',
        gamme: 'Gamme de Montage',
        analyse: 'Analyse',
        equilibrage: 'Équilibrage',
        implantation: 'Implantation',
        couts: 'Coûts & Budget',
        save: 'Enregistrer',
        next: 'Suivant',
        finish: 'Terminer',
        undo: 'Annuler (Ctrl+Z)',
        redo: 'Rétablir (Ctrl+Y)',
        refresh: 'Actualiser',
        configuration: 'Configuration'
    },
    ar: {
        title: 'بـيـراميـثـود',
        dashboard: 'لوحة التحكم',
        library: 'المكتبة',
        coupe: 'القص',
        effectifs: 'التأطير',
        objectifs: 'الأهداف',
        atelier: 'رئيس الورشة',
        ingenierie: 'الورشة',
        admin: 'المشرف',
        profile: 'حسابي',
        config: 'الإعدادات',
        export: 'تصدير المخزون',
        suivi: 'تتبع الإنتاج',
        planning: 'التخطيط',
        magasin: 'المخزن',
        saved: 'محفوظ',
        saving: 'جارٍ الحفظ...',
        unsaved: 'غير محفوظ',
        logout: 'تسجيل الخروج',
        langBtn: 'FR',
        fiche: 'الملف التقني',
        gamme: 'سلسلة العمليات',
        analyse: 'التحليل',
        equilibrage: 'التوازن',
        implantation: 'التخطيط',
        couts: 'التكاليف والميزانية',
        save: 'حفظ',
        next: 'التالي',
        finish: 'إنهاء',
        undo: 'تراجع (Ctrl+Z)',
        redo: 'إعادة (Ctrl+Y)',
        refresh: 'تحديث العرض',
        configuration: 'الإعدادات'
    },
} as const;

export type Lang = 'fr' | 'ar';

export const DEFAULT_MACHINES: Machine[] = [
    { id: '1', name: 'Surjeteuse 5 Fils', classe: '516', speed: 5500, speedMajor: 1.01, cofs: 1.19, active: true, machineCategory: 'Surjeteuse' },
    { id: '2', name: 'Surjeteuse 4 Fils', classe: '514', speed: 6000, speedMajor: 1.01, cofs: 1.17, active: true, machineCategory: 'Surjeteuse' },
    { id: '3', name: 'Surjeteuse 3 Fils', classe: '504', speed: 6000, speedMajor: 1.01, cofs: 1.15, active: true, machineCategory: 'Surjeteuse' },
    { id: '4', name: 'Piqueuse Plate', classe: '301', speed: 4500, speedMajor: 1.01, cofs: 1.17, active: true, machineCategory: 'Piqueuse' },
    { id: '5', name: 'Piqueuse Double Aig', classe: '316', speed: 3000, speedMajor: 1.01, cofs: 1.23, active: true, machineCategory: 'Piqueuse' },
    { id: '6', name: 'Colleteuse', classe: '602', speed: 4500, speedMajor: 1.01, cofs: 1.15, active: true, machineCategory: 'Colleteuse' },
    { id: '7', name: 'Chainette 2 Aig', classe: '402', speed: 4000, speedMajor: 1.01, cofs: 1.14, active: true, machineCategory: 'Chainette' },
    { id: '8', name: 'Point Invisible', classe: '101', speed: 2500, speedMajor: 1.01, cofs: 1.19, active: true, machineCategory: 'Spéciale' },
    { id: '9', name: 'Pose Bouton', classe: '107', speed: 1800, speedMajor: 1.01, cofs: 1.17, active: true, machineCategory: 'Spéciale' },
    { id: '10', name: 'Boutonnière Droite', classe: '304', speed: 2000, speedMajor: 1.01, cofs: 1.17, active: true, machineCategory: 'Spéciale' },
    { id: '11', name: 'Brideuse', classe: 'BR', speed: 2200, speedMajor: 1.01, cofs: 1.18, active: true, machineCategory: 'Spéciale' },
    { id: '12', name: 'ZigZag', classe: 'ZIGZAG', speed: 3000, speedMajor: 1.01, cofs: 1.19, active: true, machineCategory: 'Spéciale' },
    { id: '13', name: 'Manuel', classe: 'MAN', speed: 0, speedMajor: 1.01, cofs: 1.12, active: true, machineCategory: 'Manuel' },
    { id: '14', name: 'Repassage', classe: 'FER', speed: 0, speedMajor: 1.01, cofs: 1.12, active: true, machineCategory: 'Repassage' },
];

export const DEFAULT_GUIDES: Guide[] = [
    { id: 'g1', name: 'Guide Bordeur (Biais)', category: 'Bordeurs & Ourleurs', machineType: 'Piqueuse Plate (301)', description: 'Pour poser du biais à cheval (Ganser).', useCase: 'Encolure, Emmanchure' },
    { id: 'g2', name: 'Pied Compensé (1/16 - 1mm)', category: 'Surpiqûre & Précision', machineType: 'Piqueuse Plate (301)', description: 'Pour surpiqûre nervure régulière (Sirpikaj).', useCase: 'Col, Poignet, Rabat' },
    { id: 'g3', name: 'Pied Compensé (1/4 - 6mm)', category: 'Surpiqûre & Précision', machineType: 'Piqueuse Plate (301)', description: 'Pour surpiqûre large (Sebbat 0.5).', useCase: 'Plaquage poches, Jeans' },
    { id: 'g4', name: 'Pied Fermeture Invisible', category: 'Opérations Spéciales', machineType: 'Piqueuse Plate (301)', description: 'Pour poser les zips invisibles (Snsla Madfona).', useCase: 'Robe, Jupe, Pantalon' },
    { id: 'g5', name: 'Pied Unilatéral (Demi-Pied)', category: 'Opérations Spéciales', machineType: 'Piqueuse Plate (301)', description: 'Pour poser fermeture éclair standard ou passepoil.', useCase: 'Braguette, Coussins' },
    { id: 'g6', name: 'Guide Ourleur (Escargot)', category: 'Bordeurs & Ourleurs', machineType: 'Piqueuse Plate (301)', description: 'Pour faire un ourlet roulotté fin (Ghli R9i9).', useCase: 'Bas chemise, Foulard' },
    { id: 'g7', name: 'Pied Téflon (Plastique)', category: 'Matières Difficiles', machineType: 'Piqueuse Plate (301)', description: 'Pour matières glissantes ou collantes (Cuir, Skai).', useCase: 'Cuir, Simili, Vinyl' },
    { id: 'g8', name: 'Pied Fronceur', category: 'Fronces & Plis', machineType: 'Piqueuse Plate (301)', description: 'Pour froncer automatiquement (Tkrich/Kmmch).', useCase: 'Volants, Manches ballon' },
    { id: 'g9', name: 'Guide Aimanté', category: 'Guides & Jauges', machineType: 'Piqueuse Plate (301)', description: 'Guide mobile pour largeur couture fixe.', useCase: 'Toutes coutures droites' },
    { id: 'g10', name: 'Guide Passepoil', category: 'Opérations Spéciales', machineType: 'Piqueuse Plate (301)', description: 'Pour insérer un passepoil régulier.', useCase: 'Coussins, Poches, Cols' },
    { id: 'g11', name: 'Guide Élastique', category: 'Opérations Spéciales', machineType: 'Surjeteuse 4 Fils (514)', description: 'Pour poser élastique en tension (Lastik).', useCase: 'Ceinture, Lingerie' },
    { id: 'g12', name: 'Guide Ourlet Invisible', category: 'Bordeurs & Ourleurs', machineType: 'Surjeteuse 3 Fils (504)', description: 'Pour ourlet invisible bas de pantalon.', useCase: 'Pantalon Classique' },
    { id: 'g13', name: 'Guide Colletage', category: 'Bordeurs & Ourleurs', machineType: 'Colleteuse (602)', description: 'Pour poser bande de propreté ou biais (Bande).', useCase: 'T-shirt, Col' },
    { id: 'g14', name: 'Guide Ourlet (Bas)', category: 'Bordeurs & Ourleurs', machineType: 'Colleteuse (602)', description: 'Pour ourlet bas et manches (Ghli).', useCase: 'T-shirt, Polo' },
    { id: 'g15', name: 'Guide Ceinture', category: 'Guides & Jauges', machineType: 'Piqueuse Double Aig (316)', description: 'Pour montage ceinture (Samta).', useCase: 'Jeans, Pantalon' }
];

export const AUTO_SAVE_KEY = 'beramethode_autosave_v1';
export const LIBRARY_KEY = 'beramethode_library';
export const MANUAL_LINKS_BY_MODEL_KEY = 'beramethode_manual_links_by_model';
export const MACHINES_STORAGE_KEY = 'beramethode_machines_v1';
export const MACHINE_INSTANCES_KEY = 'beramethode_machine_instances';
export const MACHINE_FLEET_HISTORY_KEY = 'beramethode_machines_fleet_history_v1';
export const MAX_MACHINE_FLEET_HISTORY = 500;

export const defaultNavOrder = ['vuegenerale', 'dashboard', 'ingenierie', 'atelier', 'atelierProd', 'library', 'coupe', 'effectifs', 'gestionRh', 'planning', 'suivi', 'rendement', 'magasin', 'export', 'facturation', 'config', 'pageMachine', 'machin', 'catalogTemps', 'objectifs', 'admin', 'sousTraitance'];

