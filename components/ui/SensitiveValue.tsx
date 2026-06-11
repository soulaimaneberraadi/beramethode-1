import React from 'react';
import { Lock } from 'lucide-react';
import { usePermissions } from '../../src/context/PermissionsContext';

/**
 * Masque intelligent d'un champ sensible (Epic 2 — gating champ).
 * Si l'utilisateur n'a pas le droit de voir `field`, affiche « 🔒 » au lieu de la valeur.
 * Sinon affiche `children`. Non-breaking : par défaut (super/solo) => tout visible.
 *
 * Usage :
 *   <SensitiveValue field="model.cout_minute">{settings.costMinute.toFixed(2)} DH</SensitiveValue>
 */
export default function SensitiveValue({
  field,
  children,
  placeholder,
}: {
  field: string;
  children: React.ReactNode;
  placeholder?: React.ReactNode;
}) {
  const { canField } = usePermissions();
  if (canField(field, 'view')) return <>{children}</>;
  return (
    <span className="inline-flex items-center gap-1 text-slate-400" title="Information masquée selon vos permissions">
      <Lock size={12} strokeWidth={1.75} />
      {placeholder ?? '•••'}
    </span>
  );
}

/** Hook pratique pour masquer/désactiver des contrôles d'édition selon la permission. */
export function useFieldAccess(field: string) {
  const { canField } = usePermissions();
  return { canView: canField(field, 'view'), canEdit: canField(field, 'edit') };
}
