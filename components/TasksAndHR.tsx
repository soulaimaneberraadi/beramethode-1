import React from 'react';
import { Target, ArrowRight, Users } from 'lucide-react';
import { AppSettings } from '../types';

/**
 * Zone « Objectifs » — suivi d’objectifs d’équipe et tâches transverses (roadmap BERA_MASTER_PLAN).
 * Les données RH réelles (fiches, pointage, paie, invitations) sont dans **Gestion RH** (`Effectifs`).
 */
interface TasksAndHRProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  onOpenGestionRH?: () => void;
}

export default function TasksAndHR({ onOpenGestionRH }: TasksAndHRProps) {
  return (
    <div className="h-full flex flex-col bg-[#fafafa] overflow-y-auto">
      <div className="max-w-xl mx-auto px-6 py-16 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-600 mb-6">
          <Target className="w-7 h-7" strokeWidth={2} />
        </div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight mb-2">Objectifs</h1>
        <p className="text-slate-600 text-sm leading-relaxed mb-8">
          Ici : suivi d’objectifs et tâches d’équipe (hors fiches RH). Pour l’instant, tout le
          cycle salarié — annuaire, pointage, production RH, avances, Sage, invitations — se gère dans{' '}
          <strong className="text-slate-800">Gestion RH</strong>.
        </p>
        {onOpenGestionRH && (
          <button
            type="button"
            onClick={onOpenGestionRH}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#2149C1] text-white text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-[#1a3ba3] transition-colors"
          >
            <Users className="w-4 h-4" />
            Ouvrir Gestion RH
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
        <p className="mt-10 text-xs text-slate-400">
          Référence produit : Section 23 (identité) & phases 6–9 du plan maître — contenu à détailler ici plus tard.
        </p>
      </div>
    </div>
  );
}
