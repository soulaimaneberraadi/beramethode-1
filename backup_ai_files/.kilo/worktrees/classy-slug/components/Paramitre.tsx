import React from 'react';
import { Settings } from 'lucide-react';

export default function Paramitre() {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center min-h-[60vh]">
      <div className="w-full max-w-lg mx-auto bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 p-10 text-center relative overflow-hidden">
        
        {/* Subtle top Accent */}
        <div className="absolute top-0 inset-x-0 h-1 bg-slate-300"></div>

        <div className="w-16 h-16 bg-slate-50 rounded-2xl mx-auto flex items-center justify-center mb-6 text-slate-600">
          <Settings className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Paramètres</h2>
        <p className="text-slate-500 text-sm">
          Cet espace est prêt pour la configuration du système.
        </p>
      </div>
    </div>
  );
}