import React, { useState, useMemo, useCallback } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { useLang } from '../../src/context/LanguageContext';
import { tx } from '../../lib/i18n';
import type { RendementNode } from '../../lib/rendementEngine';
import EfficiencyBadge from './EfficiencyBadge';

interface DrilldownTableProps {
  root: RendementNode;
}

interface FlatRow {
  node: RendementNode;
  depth: number;
  expandable: boolean;
  hasSectionSplit: boolean;
}

function flattenTree(node: RendementNode, expanded: Set<string>, depth = 0): FlatRow[] {
  const rows: FlatRow[] = [];
  const expandable = !!node.children && node.children.length > 0;
  rows.push({ node, depth, expandable, hasSectionSplit: expandable && node.children!.some(c => c.prep != null || c.montage != null) });
  if (expandable && expanded.has(node.id)) {
    for (const child of node.children!) {
      rows.push(...flattenTree(child, expanded, depth + 1));
    }
  }
  return rows;
}

export const DrilldownTable: React.FC<DrilldownTableProps> = ({ root }) => {
  const { lang } = useLang();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([root.id]));

  const toggle = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const rows = useMemo(() => flattenTree(root, expanded), [root, expanded]);

  const hasSectionSplit = rows.some(r => r.hasSectionSplit);

  const levelLabel = (level: string) => {
    const labels: Record<string, ReturnType<typeof tx>> = {
      societe: tx(lang, { fr: 'Société', ar: 'الشركة', en: 'Company', es: 'Compañía', pt: 'Empresa', tr: 'Şirket' }),
      salle: tx(lang, { fr: 'Salle', ar: 'القاعة', en: 'Hall', es: 'Sala', pt: 'Sala', tr: 'Salon' }),
      chaine: tx(lang, { fr: 'Chaîne', ar: 'الخط', en: 'Line', es: 'Línea', pt: 'Linha', tr: 'Hat' }),
      modele: tx(lang, { fr: 'Modèle', ar: 'الموديل', en: 'Model', es: 'Modelo', pt: 'Modelo', tr: 'Model' }),
      machine: tx(lang, { fr: 'Machine', ar: 'آلة', en: 'Machine', es: 'Máquina', pt: 'Máquina', tr: 'Makine' }),
      poste: tx(lang, { fr: 'Poste', ar: 'محطة', en: 'Station', es: 'Puesto', pt: 'Posto', tr: 'İstasyon' }),
    };
    return labels[level] ?? level;
  };

  const formatNum = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 0 });

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden dark:bg-dk-surface dark:border-dk-border">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/60">
              <th className="text-left px-4 py-3 text-[10px] uppercase font-bold text-slate-400 dark:text-dk-muted">
                {tx(lang, { fr: 'Niveau', ar: 'المستوى', en: 'Level', es: 'Nivel', pt: 'Nível', tr: 'Seviye' })}
              </th>
              <th className="text-left px-4 py-3 text-[10px] uppercase font-bold text-slate-400 dark:text-dk-muted">
                {tx(lang, { fr: 'Nom', ar: 'الاسم', en: 'Name', es: 'Nombre', pt: 'Nome', tr: 'İsim' })}
              </th>
              <th className="text-right px-4 py-3 text-[10px] uppercase font-bold text-slate-400 dark:text-dk-muted tabular-nums">
                {tx(lang, { fr: 'Produit', ar: 'المنتج', en: 'Produced', es: 'Producido', pt: 'Produzido', tr: 'Üretilen' })}
              </th>
              <th className="text-right px-4 py-3 text-[10px] uppercase font-bold text-slate-400 dark:text-dk-muted tabular-nums">
                {tx(lang, { fr: 'Objectif', ar: 'الهدف', en: 'Target', es: 'Objetivo', pt: 'Meta', tr: 'Hedef' })}
              </th>
              {/* Only show Prep/Montage when at least one row has section split */}
              {hasSectionSplit && (
                <>
                  <th className="text-right px-4 py-3 text-[10px] uppercase font-bold text-slate-400 dark:text-dk-muted tabular-nums">
                    {tx(lang, { fr: 'Prép', ar: 'تحضير', en: 'Prep', es: 'Prep', pt: 'Prep', tr: 'Hazırlık' })}
                  </th>
                  <th className="text-right px-4 py-3 text-[10px] uppercase font-bold text-slate-400 dark:text-dk-muted tabular-nums">
                    {tx(lang, { fr: 'Mont', ar: 'تجميع', en: 'Assembly', es: 'Montaje', pt: 'Montagem', tr: 'Montaj' })}
                  </th>
                </>
              )}
              <th className="text-center px-4 py-3 text-[10px] uppercase font-bold text-slate-400 dark:text-dk-muted">
                {tx(lang, { fr: 'R%', ar: 'نسبة الإنتاج', en: 'R%', es: 'R%', pt: 'R%', tr: 'R%' })}
              </th>
              <th className="text-center px-4 py-3 text-[10px] uppercase font-bold text-slate-400 dark:text-dk-muted">
                {tx(lang, { fr: 'TRS', ar: 'الكفاءة', en: 'OEE', es: 'OEE', pt: 'OEE', tr: 'OEE' })}
              </th>
              <th className="text-right px-4 py-3 text-[10px] uppercase font-bold text-slate-400 dark:text-dk-muted tabular-nums">
                {tx(lang, { fr: 'Dispo', ar: 'التوفر', en: 'Avail.', es: 'Dispon.', pt: 'Dispon.', tr: 'Kullan.' })}
              </th>
              <th className="text-right px-4 py-3 text-[10px] uppercase font-bold text-slate-400 dark:text-dk-muted tabular-nums">
                {tx(lang, { fr: 'Qual.', ar: 'الجودة', en: 'Qual.', es: 'Cal.', pt: 'Qual.', tr: 'Kal.' })}
              </th>
              <th className="text-right px-4 py-3 text-[10px] uppercase font-bold text-slate-400 dark:text-dk-muted tabular-nums">
                {tx(lang, { fr: 'Effectif', ar: 'العمال', en: 'Workers', es: 'Personal', pt: 'Efetivo', tr: 'Çalışan' })}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
            {rows.map(({ node, depth, expandable }) => (
              <tr
                key={node.id}
                className={`hover:bg-slate-50 dark:hover:bg-dk-elevated/30 transition-colors duration-100 ${
                  expandable ? 'cursor-pointer' : ''
                }`}
                onClick={() => expandable && toggle(node.id)}
              >
                {/* Level + Name */}
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <div className="flex items-center gap-1" style={{ paddingLeft: `${depth * 20}px` }}>
                    {expandable ? (
                      expanded.has(node.id) ? (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-dk-muted shrink-0" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-dk-muted shrink-0" />
                      )
                    ) : (
                      <span className="w-3.5 shrink-0" />
                    )}
                    <span className="text-[10px] font-medium text-slate-400 dark:text-dk-muted uppercase mr-1">
                      {levelLabel(node.level)}
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-dk-text">
                      {node.label}
                    </span>
                  </div>
                </td>

                {/* Produced */}
                <td className="px-4 py-2.5 text-right text-slate-700 dark:text-dk-text-soft tabular-nums">
                  {formatNum(node.produced)}
                </td>

                {/* Target */}
                <td className="px-4 py-2.5 text-right text-slate-700 dark:text-dk-text-soft tabular-nums">
                  {formatNum(node.target)}
                </td>

                {/* Prep / Montage (conditional) */}
                {hasSectionSplit && (
                  <>
                    <td className="px-4 py-2.5 text-right text-slate-700 dark:text-dk-text-soft tabular-nums">
                      {node.prep != null ? formatNum(node.prep) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-700 dark:text-dk-text-soft tabular-nums">
                      {node.montage != null ? formatNum(node.montage) : '—'}
                    </td>
                  </>
                )}

                {/* R% */}
                <td className="px-4 py-2.5 text-center">
                  <div className="inline-flex justify-center">
                    <EfficiencyBadge value={node.rPercent} />
                  </div>
                </td>

                {/* TRS */}
                <td className="px-4 py-2.5 text-center">
                  <div className="inline-flex justify-center">
                    <EfficiencyBadge value={node.trs} />
                  </div>
                </td>

                {/* Disponibilité */}
                <td className="px-4 py-2.5 text-right text-slate-700 dark:text-dk-text-soft tabular-nums font-medium">
                  {node.availability.toFixed(1)}%
                </td>

                {/* Qualité */}
                <td className="px-4 py-2.5 text-right text-slate-700 dark:text-dk-text-soft tabular-nums font-medium">
                  {node.quality.toFixed(1)}%
                </td>

                {/* Effectif */}
                <td className="px-4 py-2.5 text-right text-slate-700 dark:text-dk-text-soft tabular-nums">
                  {formatNum(node.effectif)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DrilldownTable;
