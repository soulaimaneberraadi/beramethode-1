// ════════════════════════════════════════════════════════════════════════════
// permissionCatalog — source de vérité UNIQUE pour les ressources protégeables
// (pages + champs sensibles) et leurs libellés multilingues.
//
// Fichier PUR : aucun import Node (fs, db…), aucun import React/JSX.
// Importé à la fois côté serveur (server/permissions/presets.ts) et côté
// client (app/accessControl.ts, components/PermissionsManager.tsx).
// ════════════════════════════════════════════════════════════════════════════

import type { Lang } from '../lib/i18n';
import { defaultNavOrder } from './constants';

/** Pages protégeables (alignées sur defaultNavOrder dans app/constants.ts). */
export const PROTECTED_PAGES = [
  'vuegenerale', 'dashboard', 'ingenierie', 'atelier', 'atelierProd', 'library',
  'coupe', 'effectifs', 'gestionRh', 'planning', 'suivi', 'rendement',
  'magasin', 'export', 'facturation', 'config', 'pageMachine', 'machin',
  'objectifs', 'sousTraitance', 'catalogueTemps',
] as const;

export type ProtectedPage = typeof PROTECTED_PAGES[number];

/**
 * Champs sensibles protégeables (resource_key = 'domaine.champ').
 * Forme canonique du préfixe facturation : `facturation.` (pas `facture.`) —
 * des lignes existent déjà en base avec `facturation.marge`.
 */
export const PROTECTED_FIELDS = [
  'model.cout_minute',    // coût/minute
  'model.prix_revient',   // prix de revient
  'model.marge',          // marge modèle
  'hr.salaire',           // salaires
  'hr.avances',           // avances
  'hr.cnss',              // CNSS
  'facturation.marge',    // marge facturation
  'facturation.remise',   // remise facturation
] as const;

export type ProtectedField = typeof PROTECTED_FIELDS[number];

/** Regroupement des champs sensibles par page, pour l'affichage en arbre. */
export const FIELDS_BY_MODULE: Record<string, string[]> = {
  ingenierie: ['model.cout_minute', 'model.prix_revient', 'model.marge'],
  gestionRh: ['hr.salaire', 'hr.avances', 'hr.cnss'],
  facturation: ['facturation.marge', 'facturation.remise'],
};

type LabelMap = Partial<Record<Lang, string>>;

/** Libellés multilingues des pages protégeables. */
export const PAGE_LABELS: Record<string, LabelMap> = {
  vuegenerale: { fr: 'Vue générale', ar: 'نظرة عامة', en: 'Overview', es: 'Vista general', pt: 'Visão geral', tr: 'Genel Bakış' },
  dashboard: { fr: 'Tableau de bord', ar: 'لوحة القيادة', en: 'Dashboard', es: 'Panel', pt: 'Painel', tr: 'Panel' },
  ingenierie: { fr: 'Ingénierie', ar: 'الهندسة', en: 'Engineering', es: 'Ingeniería', pt: 'Engenharia', tr: 'Mühendislik' },
  atelier: { fr: 'Atelier', ar: 'الورشة', en: 'Workshop', es: 'Taller', pt: 'Oficina', tr: 'Atölye' },
  atelierProd: { fr: 'Atelier production', ar: 'ورشة الإنتاج', en: 'Production workshop', es: 'Taller de producción', pt: 'Oficina de produção', tr: 'Üretim Atölyesi' },
  library: { fr: 'Bibliothèque', ar: 'المكتبة', en: 'Library', es: 'Biblioteca', pt: 'Biblioteca', tr: 'Kütüphane' },
  coupe: { fr: 'Coupe', ar: 'القص', en: 'Cutting', es: 'Corte', pt: 'Corte', tr: 'Kesim' },
  effectifs: { fr: 'Effectifs', ar: 'التأثيرات', en: 'Workforce', es: 'Plantilla', pt: 'Efetivos', tr: 'Personel' },
  gestionRh: { fr: 'Gestion RH', ar: 'الموارد البشرية', en: 'HR Management', es: 'Gestión RRHH', pt: 'Gestão RH', tr: 'İK Yönetimi' },
  planning: { fr: 'Planning', ar: 'التخطيط', en: 'Planning', es: 'Planificación', pt: 'Planejamento', tr: 'Planlama' },
  suivi: { fr: 'Suivi production', ar: 'متابعة الإنتاج', en: 'Production tracking', es: 'Seguimiento de producción', pt: 'Acompanhamento de produção', tr: 'Üretim Takibi' },
  rendement: { fr: 'Rendement', ar: 'العائد', en: 'Performance', es: 'Rendimiento', pt: 'Rendimento', tr: 'Verimlilik' },
  magasin: { fr: 'Magasin', ar: 'المخازن', en: 'Warehouse', es: 'Almacén', pt: 'Armazém', tr: 'Depo' },
  export: { fr: 'Export', ar: 'التصدير', en: 'Export', es: 'Exportar', pt: 'Exportar', tr: 'Dışa Aktar' },
  facturation: { fr: 'Facturation', ar: 'الفوترة', en: 'Invoicing', es: 'Facturación', pt: 'Faturamento', tr: 'Faturalama' },
  config: { fr: 'Configuration', ar: 'الإعدادات', en: 'Settings', es: 'Configuración', pt: 'Configuração', tr: 'Yapılandırma' },
  pageMachine: { fr: 'Suivi machines', ar: 'متابعة الآلات', en: 'Machine tracking', es: 'Seguimiento de máquinas', pt: 'Acompanhamento de máquinas', tr: 'Makine Takibi' },
  machin: { fr: 'Catalogue machines', ar: 'كتالوج الآلات', en: 'Machine catalog', es: 'Catálogo de máquinas', pt: 'Catálogo de máquinas', tr: 'Makine Kataloğu' },
  objectifs: { fr: 'Objectifs', ar: 'الأهداف', en: 'Goals', es: 'Objetivos', pt: 'Objetivos', tr: 'Hedefler' },
  sousTraitance: { fr: 'Sous-traitance', ar: 'الاستعانة بمصادر خارجية', en: 'Subcontracting', es: 'Subcontratación', pt: 'Subcontratação', tr: 'Taşeronluk' },
  catalogueTemps: { fr: 'Catalogue des temps', ar: 'كتالوج الأوقات', en: 'Time catalog', es: 'Catálogo de tiempos', pt: 'Catálogo de tempos', tr: 'Zaman Kataloğu' },
};

/** Libellés multilingues des champs sensibles. */
export const FIELD_LABELS: Record<string, LabelMap> = {
  'model.cout_minute': { fr: 'Coût/minute', ar: 'التكلفة/الدقيقة', en: 'Cost/minute', es: 'Costo/minuto', pt: 'Custo/minuto', tr: 'Maliyet/dakika' },
  'model.prix_revient': { fr: 'Prix de revient', ar: 'سعر التكلفة', en: 'Cost price', es: 'Precio de costo', pt: 'Preço de custo', tr: 'Maliyet fiyatı' },
  'model.marge': { fr: 'Marge modèle', ar: 'هامش النموذج', en: 'Model margin', es: 'Margen del modelo', pt: 'Margem do modelo', tr: 'Model marjı' },
  'hr.salaire': { fr: 'Salaire', ar: 'الأجرة', en: 'Salary', es: 'Salario', pt: 'Salário', tr: 'Maaş' },
  'hr.avances': { fr: 'Avances', ar: 'السلفات', en: 'Advances', es: 'Adelantos', pt: 'Adiantamentos', tr: 'Avanslar' },
  'hr.cnss': { fr: 'CNSS', ar: 'الضمان الاجتماعي (CNSS)', en: 'CNSS', es: 'CNSS', pt: 'CNSS', tr: 'CNSS' },
  'facturation.marge': { fr: 'Marge', ar: 'الهامش', en: 'Margin', es: 'Margen', pt: 'Margem', tr: 'Marj' },
  'facturation.remise': { fr: 'Remise', ar: 'التخفيض', en: 'Discount', es: 'Descuento', pt: 'Desconto', tr: 'İndirim' },
};

/** Libellé d'une page dans une langue donnée, repli sur la clé brute si absente. */
export function pageLabel(key: string, lang: Lang | string | null | undefined): string {
  const l = (lang || 'fr') as Lang;
  const map = PAGE_LABELS[key];
  if (!map) return key;
  return map[l] ?? map.fr ?? key;
}

/** Libellé d'un champ dans une langue donnée, repli sur la clé brute si absente. */
export function fieldLabel(key: string, lang: Lang | string | null | undefined): string {
  const l = (lang || 'fr') as Lang;
  const map = FIELD_LABELS[key];
  if (!map) return key;
  return map[l] ?? map.fr ?? key;
}

/**
 * Garde de cohérence (non appelée automatiquement) : compare PROTECTED_PAGES
 * avec `defaultNavOrder` (app/constants.ts). À utiliser dans un test futur.
 */
export function assertCatalogSync(): {
  inNavNotInCatalog: string[];
  inCatalogNotInNav: string[];
} {
  const navSet = new Set<string>(defaultNavOrder);
  const catalogSet = new Set<string>(PROTECTED_PAGES);
  return {
    inNavNotInCatalog: defaultNavOrder.filter((p) => !catalogSet.has(p)),
    inCatalogNotInNav: PROTECTED_PAGES.filter((p) => !navSet.has(p)),
  };
}
