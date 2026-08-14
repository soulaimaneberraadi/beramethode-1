/**
 * Presets de rôles (données pures). Le catalogue des ressources protégeables
 * (pages + champs) vit désormais dans `app/permissionCatalog.ts` — source de
 * vérité unique, réexportée ici pour ne casser aucun import existant.
 * Les clés de pages correspondent à `currentView` dans App.tsx / defaultNavOrder.
 */

import { PROTECTED_PAGES, PROTECTED_FIELDS } from '../../app/permissionCatalog';

export { PROTECTED_PAGES, PROTECTED_FIELDS };

export type RolePresetKey = 'patron' | 'methode' | 'chrono' | 'commercial' | 'rh' | 'chef_chaine';

interface PresetDef {
  name: string;
  level: number;
  /** Pages visibles (view). Les pages éditables sont dans `edit`. */
  view: string[];
  edit: string[];
  /** Champs sensibles visibles. */
  fields: string[];
}

/** Presets par défaut — appliqués en 1 clic à la création d'un rôle. */
export const ROLE_PRESETS: Record<RolePresetKey, PresetDef> = {
  patron: {
    name: 'Patron', level: 0,
    view: [...PROTECTED_PAGES], edit: [...PROTECTED_PAGES], fields: [...PROTECTED_FIELDS],
  },
  methode: {
    name: 'Méthode', level: 1,
    view: ['vuegenerale', 'dashboard', 'ingenierie', 'atelier', 'atelierProd', 'library', 'coupe', 'planning', 'suivi', 'rendement', 'machin', 'pageMachine'],
    edit: ['ingenierie', 'atelier', 'atelierProd', 'library', 'coupe'],
    fields: ['model.cout_minute', 'model.prix_revient', 'model.marge'],
  },
  chrono: {
    name: 'Chrono', level: 2,
    view: ['dashboard', 'ingenierie', 'atelier', 'suivi', 'rendement', 'machin'],
    edit: ['atelier'],
    fields: [],
  },
  commercial: {
    name: 'Commercial', level: 1,
    view: ['vuegenerale', 'dashboard', 'facturation', 'library', 'planning'],
    edit: ['facturation'],
    fields: ['facturation.marge'],
  },
  rh: {
    name: 'RH', level: 1,
    view: ['dashboard', 'gestionRh', 'effectifs', 'objectifs'],
    edit: ['gestionRh', 'effectifs'],
    fields: ['hr.salaire', 'hr.avances', 'hr.cnss'],
  },
  chef_chaine: {
    name: 'Chef de chaîne', level: 2,
    view: ['dashboard', 'suivi', 'rendement', 'effectifs', 'planning'],
    edit: ['suivi'],
    fields: [],
  },
};

/** Génère les lignes role_permissions à partir d'un preset. */
export function presetToPermissions(preset: PresetDef): Array<{
  resource_type: 'page' | 'field';
  resource_key: string;
  can_view: number;
  can_edit: number;
}> {
  const rows: Array<{ resource_type: 'page' | 'field'; resource_key: string; can_view: number; can_edit: number }> = [];
  for (const p of PROTECTED_PAGES) {
    const v = preset.view.includes(p) ? 1 : 0;
    const e = preset.edit.includes(p) ? 1 : 0;
    if (v || e) rows.push({ resource_type: 'page', resource_key: p, can_view: v, can_edit: e });
  }
  for (const f of PROTECTED_FIELDS) {
    if (preset.fields.includes(f)) rows.push({ resource_type: 'field', resource_key: f, can_view: 1, can_edit: 0 });
  }
  return rows;
}
