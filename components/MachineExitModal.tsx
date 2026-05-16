import React, { useEffect, useMemo, useState } from 'react';
import { X, Camera, QrCode, AlertTriangle, PackageMinus, ShoppingBag } from 'lucide-react';
import type { Machine } from '../types';
import { parseMachineQrFromString, tryDecodeQrFromImageFile } from '../lib/machineQrPayload';

export type MachineExitPayload = {
  machine: Machine;
  kind: 'EXIT' | 'SELL';
  actorName: string;
  details: string;
  confirmationRef: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  machines: Machine[];
  /** Si défini, la machine est pré-sélectionnée (ligne du registre). */
  initialMachineId: string | null;
  defaultActorName: string;
  onConfirm: (p: MachineExitPayload) => void;
};

function norm(s: string) {
  return s.trim().toLowerCase();
}

/** Préremplissage session : met en forme prénom/nom (évite « soulaiman » tout en minuscules). Les e-mails restent inchangés. */
function formatActorNamePrefill(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  if (t.includes('@')) return t;
  return t
    .split(/\s+/)
    .map(w => (w ? w.charAt(0).toLocaleUpperCase('fr') + w.slice(1).toLocaleLowerCase('fr') : w))
    .join(' ');
}

export default function MachineExitModal({
  open,
  onClose,
  machines,
  initialMachineId,
  defaultActorName,
  onConfirm,
}: Props) {
  const [machineId, setMachineId] = useState('');
  const [kind, setKind] = useState<'EXIT' | 'SELL'>('EXIT');
  const [actorName, setActorName] = useState('');
  const [details, setDetails] = useState('');
  const [confirmMode, setConfirmMode] = useState<'MAT' | 'QR'>('MAT');
  const [matInput, setMatInput] = useState('');
  const [qrPaste, setQrPaste] = useState('');
  const [decodeBusy, setDecodeBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraInputId = 'machine-exit-qr-camera';

  const selected = useMemo(
    () => machines.find(m => m.id === machineId) || null,
    [machines, machineId]
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    setKind('EXIT');
    setDetails('');
    setMatInput('');
    setQrPaste('');
    setConfirmMode('MAT');
    const def = formatActorNamePrefill(defaultActorName || '');
    setActorName(def);
    if (initialMachineId && machines.some(m => m.id === initialMachineId)) {
      setMachineId(initialMachineId);
    } else {
      setMachineId(machines[0]?.id || '');
    }
  }, [open, initialMachineId, defaultActorName, machines]);

  if (!open) return null;

  const validateAndSubmit = () => {
    setError(null);
    const m = selected;
    if (!m) {
      setError('Choisissez une machine dans la liste.');
      return;
    }
    const actor = actorName.trim();
    if (actor.length < 2) {
      setError('Indiquez votre nom (au moins 2 caractères).');
      return;
    }
    const det = details.trim();
    if (det.length < 4) {
      setError('Précisez le motif ou les détails (au moins 4 caractères).');
      return;
    }

    const matMachine = (m.matricule || '').trim();
    let confirmationRef = '';

    if (confirmMode === 'QR') {
      const raw = qrPaste.trim();
      const parsed = parseMachineQrFromString(raw);
      if (!parsed) {
        setError('QR invalide : collez le JSON complet lu sur l’étiquette (ou photo décodée).');
        return;
      }
      if (parsed.id !== m.id) {
        setError('Ce QR ne correspond pas à la machine sélectionnée.');
        return;
      }
      confirmationRef = `qr:${parsed.id}`;
    } else {
      const typed = matInput.trim();
      if (!typed) {
        setError(matMachine ? 'Saisissez le matricule atelier pour confirmer.' : 'Saisissez l’ID interne affiché sur la fiche ou scannez le QR.');
        return;
      }
      if (matMachine) {
        if (norm(typed) !== norm(matMachine)) {
          setError('Le matricule ne correspond pas à cette machine.');
          return;
        }
        confirmationRef = `mat:${typed.trim()}`;
      } else {
        if (typed.trim() !== m.id) {
          setError(`L’ID interne attendu est : ${m.id}`);
          return;
        }
        confirmationRef = `id:${m.id}`;
      }
    }

    onConfirm({
      machine: m,
      kind,
      actorName: actor,
      details: det,
      confirmationRef,
    });
    onClose();
  };

  const onPickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setDecodeBusy(true);
    setError(null);
    try {
      const raw = await tryDecodeQrFromImageFile(f);
      if (!raw) {
        setError(
          'Impossible de lire le QR sur cette image. Utilisez Chrome sur mobile, ou collez le texte JSON du QR.'
        );
        return;
      }
      setQrPaste(raw);
      setConfirmMode('QR');
    } finally {
      setDecodeBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="machine-exit-title"
    >
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col border border-slate-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/90 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
              <PackageMinus className="w-5 h-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 id="machine-exit-title" className="text-base font-black text-slate-900 truncate">
                Retirer du parc
              </h2>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">
                Sortie ou vente — la machine reste dans l’historique
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:bg-slate-200/80 transition-colors shrink-0"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto custom-scrollbar p-5 space-y-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-tight">Machine</span>
            <select
              value={machineId}
              onChange={e => setMachineId(e.target.value)}
              disabled={Boolean(initialMachineId && machines.some(m => m.id === initialMachineId))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-70"
            >
              {machines.length === 0 ? (
                <option value="">— Aucune machine —</option>
              ) : (
                machines.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {(m.matricule || '').trim() || m.id.slice(0, 8)}
                  </option>
                ))
              )}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setKind('EXIT')}
              className={`flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-xs font-black uppercase tracking-tight transition-colors ${
                kind === 'EXIT'
                  ? 'border-rose-300 bg-rose-50 text-rose-800 ring-1 ring-rose-200'
                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              <PackageMinus className="w-4 h-4 shrink-0" />
              Sortie
            </button>
            <button
              type="button"
              onClick={() => setKind('SELL')}
              className={`flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-xs font-black uppercase tracking-tight transition-colors ${
                kind === 'SELL'
                  ? 'border-amber-300 bg-amber-50 text-amber-900 ring-1 ring-amber-200'
                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              <ShoppingBag className="w-4 h-4 shrink-0" />
              Vente
            </button>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-tight">
              Votre nom · الاسم الكامل
            </span>
            <input
              type="text"
              value={actorName}
              onChange={e => setActorName(e.target.value)}
              placeholder="Prénom et nom"
              autoComplete="name"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-tight">Détails / motif</span>
            <textarea
              value={details}
              onChange={e => setDetails(e.target.value)}
              rows={3}
              placeholder={
                kind === 'SELL'
                  ? 'Ex. vendue à…, prix indicatif, état…'
                  : 'Ex. mise au rebut, transfert autre site, panne irréparable…'
              }
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 resize-y min-h-[72px]"
            />
          </label>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
            <div className="flex items-start gap-2 text-xs text-slate-600 font-bold leading-snug">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" aria-hidden />
              <span>
                Confirmez l’identité avec le <strong className="text-slate-800">matricule atelier</strong> ou le{' '}
                <strong className="text-slate-800">QR</strong> de l’étiquette. Sans matricule enregistré, saisissez
                l’<strong className="text-slate-800">ID interne</strong> exact de la machine.
              </span>
            </div>

            <div className="flex rounded-xl border border-slate-200 overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => setConfirmMode('MAT')}
                className={`flex-1 py-2 text-[10px] font-black uppercase tracking-tight ${
                  confirmMode === 'MAT' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                Matricule / ID
              </button>
              <button
                type="button"
                onClick={() => setConfirmMode('QR')}
                className={`flex-1 py-2 text-[10px] font-black uppercase tracking-tight ${
                  confirmMode === 'QR' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                Contenu QR
              </button>
            </div>

            {confirmMode === 'MAT' ? (
              <input
                type="text"
                value={matInput}
                onChange={e => setMatInput(e.target.value)}
                placeholder={
                  selected && (selected.matricule || '').trim()
                    ? 'Matricule atelier (identique à la fiche)'
                    : `ID interne : ${selected?.id || '…'}`
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
              />
            ) : (
              <div className="space-y-2">
                <textarea
                  value={qrPaste}
                  onChange={e => setQrPaste(e.target.value)}
                  rows={4}
                  placeholder='Collez ici le JSON du QR (bouton « copier » depuis l’étiquette ou lecture manuelle)'
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-mono text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="flex flex-wrap gap-2">
                  {/*
                    Ne pas utiliser display:none sur l’input : Safari iOS n’ouvre souvent pas
                    l’appareil photo directement. Input transparent au-dessus du libellé + capture environment.
                  */}
                  <label
                    htmlFor={cameraInputId}
                    className={`relative inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-700 hover:bg-slate-50 overflow-hidden ${
                      decodeBusy ? 'opacity-50 pointer-events-none' : 'cursor-pointer'
                    }`}
                  >
                    <input
                      id={cameraInputId}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      disabled={decodeBusy}
                      onChange={onPickPhoto}
                      className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                      aria-label="Prendre une photo du QR (appareil photo)"
                    />
                    <Camera className="w-4 h-4 text-indigo-600 pointer-events-none shrink-0" aria-hidden />
                    <span className="pointer-events-none">{decodeBusy ? 'Décodage…' : 'Photo / fichier QR'}</span>
                  </label>
                  <span className="text-[10px] font-bold text-slate-400 self-center flex items-center gap-1">
                    <QrCode className="w-3.5 h-3.5" /> Chrome recommandé pour la lecture auto
                  </span>
                </div>
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{error}</p>
          )}
        </div>

        <div className="p-5 border-t border-slate-100 bg-white flex flex-col-reverse sm:flex-row gap-2 sm:justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-3 rounded-2xl border border-slate-200 text-sm font-black text-slate-600 hover:bg-slate-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={validateAndSubmit}
            disabled={!machines.length}
            className="px-4 py-3 rounded-2xl bg-rose-600 text-white text-sm font-black shadow-lg shadow-rose-100 hover:bg-rose-700 disabled:opacity-50"
          >
            Confirmer le retrait du parc
          </button>
        </div>
      </div>
    </div>
  );
}
