import React, { useRef, useState } from 'react';
import { X, Camera, QrCode, ScanLine, AlertTriangle, CheckCircle2, Wrench, ArrowRightLeft, Check } from 'lucide-react';
import type { Machine, MachineInstance } from '../types';
import { parseMachineQrFromString, tryDecodeQrFromImageFile } from '../lib/machineQrPayload';

export type QuickActionPayload = {
  instanceId: string;
  kind: 'PANNE' | 'REPARE' | 'MAINT' | 'TRANSFER';
  newChainId?: string;
  actorName: string;
  details: string;
  machineSnapshot: Machine;
};

type Chain = { id: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  machineInstances: MachineInstance[];
  machines: Machine[];
  chains: Chain[];
  defaultActorName?: string;
  onAction: (payload: QuickActionPayload) => void;
};

const STATUS_LABEL: Record<string, string> = { OK: 'OK', PANNE: 'Panne', MAINT: 'Maintenance' };
const STATUS_COLOR: Record<string, string> = {
  OK: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  PANNE: 'text-rose-600 bg-rose-50 border-rose-200',
  MAINT: 'text-amber-600 bg-amber-50 border-amber-200',
};

export default function MachineQuickScanModal({ open, onClose, machineInstances, machines, chains, onAction }: Props) {
  const [tab, setTab] = useState<'mat' | 'qr'>('mat');
  const [matInput, setMatInput] = useState('');
  const [qrText, setQrText] = useState('');
  const [identified, setIdentified] = useState<MachineInstance | null>(null);
  const [identifyError, setIdentifyError] = useState('');
  const [action, setAction] = useState<'PANNE' | 'REPARE' | 'MAINT' | 'TRANSFER' | null>(null);
  const [newChainId, setNewChainId] = useState('');
  const [details, setDetails] = useState('');
  const [actorName, setActorName] = useState('');
  const [scanning, setScanning] = useState(false);
  const [done, setDone] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  function findInstance(ref: string): MachineInstance | null {
    const norm = ref.trim().toLowerCase();
    return machineInstances.find(inst =>
      inst.matricule?.toLowerCase() === norm || inst.id.toLowerCase() === norm
    ) || null;
  }

  function handleIdentify() {
    setIdentifyError('');
    let inst: MachineInstance | null = null;
    if (tab === 'mat') {
      inst = findInstance(matInput);
      if (!inst) { setIdentifyError('Aucune machine trouvée avec ce matricule.'); return; }
    } else {
      const parsed = parseMachineQrFromString(qrText.trim());
      if (!parsed) { setIdentifyError('QR invalide ou non reconnu.'); return; }
      inst = findInstance(parsed.matricule || parsed.id);
      if (!inst) { setIdentifyError("Machine du QR introuvable dans l'inventaire."); return; }
    }
    setIdentified(inst);
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);
    try {
      const raw = await tryDecodeQrFromImageFile(file);
      if (!raw) { setIdentifyError("QR non détecté dans l'image."); setScanning(false); return; }
      setQrText(raw);
      const parsed = parseMachineQrFromString(raw);
      if (!parsed) { setIdentifyError('QR décodé mais format non reconnu.'); setScanning(false); return; }
      const inst = findInstance(parsed.matricule || parsed.id);
      if (!inst) { setIdentifyError("Machine du QR introuvable dans l'inventaire."); setScanning(false); return; }
      setIdentified(inst);
      setIdentifyError('');
    } catch {
      setIdentifyError("Erreur lors de la lecture de l'image.");
    }
    setScanning(false);
    if (photoRef.current) photoRef.current.value = '';
  }

  function handleConfirm() {
    if (!identified || !action) return;
    const cls = machines.find(m => m.id === identified.classId);
    const snap: Machine = cls
      ? { ...cls, matricule: identified.matricule, brand: identified.brand, status: identified.status, chainId: identified.chainId } as Machine
      : { id: identified.classId, name: identified.classId, classe: identified.classId, active: true, matricule: identified.matricule, brand: identified.brand, status: identified.status, chainId: identified.chainId, speed: 0, speedMajor: 1, cofs: 1 } as Machine;

    onAction({ instanceId: identified.id, kind: action, newChainId: action === 'TRANSFER' ? newChainId || undefined : undefined, actorName: actorName.trim() || 'Système', details: details.trim() || '—', machineSnapshot: snap });
    setDone(true);
    setTimeout(() => { handleClose(); }, 1200);
  }

  function handleClose() {
    setTab('mat'); setMatInput(''); setQrText(''); setIdentified(null);
    setIdentifyError(''); setAction(null); setNewChainId(''); setDetails('');
    setActorName(''); setDone(false);
    onClose();
  }

  const inst = identified;
  const cls = inst ? machines.find(m => m.id === inst.classId) : null;
  const currentChain = inst?.chainId ? chains.find(c => c.id === inst.chainId) : null;
  const statusKey = (inst?.status || 'OK') as string;

  const ACTIONS: { kind: 'PANNE' | 'REPARE' | 'MAINT' | 'TRANSFER'; label: string; icon: React.ReactNode; color: string }[] = [
    { kind: 'PANNE', label: 'Panne', icon: <AlertTriangle className="w-4 h-4" />, color: 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100' },
    { kind: 'REPARE', label: 'Réparé', icon: <CheckCircle2 className="w-4 h-4" />, color: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
    { kind: 'MAINT', label: 'Maintenance', icon: <Wrench className="w-4 h-4" />, color: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100' },
    { kind: 'TRANSFER', label: 'Transfert', icon: <ArrowRightLeft className="w-4 h-4" />, color: 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
              <ScanLine className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-black text-slate-900 tracking-tight">Identifier une machine</h2>
          </div>
          <button onClick={handleClose} className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4 overflow-y-auto max-h-[80vh]">

          {!identified && (
            <>
              <div className="flex rounded-xl border border-slate-200 overflow-hidden text-[11px] font-black uppercase tracking-widest">
                <button onClick={() => setTab('mat')} className={`flex-1 py-2 transition-colors ${tab === 'mat' ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>Matricule</button>
                <button onClick={() => setTab('qr')} className={`flex-1 py-2 transition-colors ${tab === 'qr' ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>
                  <span className="flex items-center justify-center gap-1"><QrCode className="w-3 h-3" /> Photo QR</span>
                </button>
              </div>

              {tab === 'mat' ? (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={matInput}
                    onChange={e => setMatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleIdentify()}
                    placeholder="Ex: MAC-3602"
                    className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  />
                  <button onClick={handleIdentify} className="px-4 py-2 bg-indigo-600 text-white text-[11px] font-black rounded-xl hover:bg-indigo-700 transition-colors">
                    Chercher
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <input type="file" accept="image/*" capture="environment" ref={photoRef} onChange={handlePhoto} className="hidden" />
                  <button
                    onClick={() => photoRef.current?.click()}
                    disabled={scanning}
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50 text-indigo-600 text-[11px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-colors disabled:opacity-50"
                  >
                    <Camera className="w-4 h-4" />
                    {scanning ? 'Décodage...' : 'Prendre une photo du QR'}
                  </button>
                  <textarea
                    value={qrText}
                    onChange={e => setQrText(e.target.value)}
                    placeholder="Ou collez le contenu du QR ici..."
                    rows={3}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none"
                  />
                  <button onClick={handleIdentify} className="py-2 bg-indigo-600 text-white text-[11px] font-black rounded-xl hover:bg-indigo-700 transition-colors">
                    Identifier
                  </button>
                </div>
              )}

              {identifyError && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-bold">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {identifyError}
                </div>
              )}
            </>
          )}

          {identified && !done && (
            <>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 text-slate-300">
                  <Wrench className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-black text-slate-900 text-sm truncate">{inst?.matricule || inst?.id}</div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{cls?.name || inst?.classId} {inst?.brand ? `· ${inst.brand}` : ''}</div>
                  {currentChain && <div className="text-[10px] text-indigo-500 font-bold mt-0.5">{currentChain.name}</div>}
                </div>
                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border ${STATUS_COLOR[statusKey] || STATUS_COLOR['OK']}`}>
                  {STATUS_LABEL[statusKey] || statusKey}
                </span>
                <button onClick={() => { setIdentified(null); setAction(null); }} className="text-slate-300 hover:text-slate-600 transition-colors ml-1">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {ACTIONS.map(a => (
                  <button
                    key={a.kind}
                    onClick={() => setAction(a.kind)}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-[11px] font-black uppercase tracking-widest transition-all ${a.color} ${action === a.kind ? 'ring-2 ring-offset-1 ring-indigo-400 scale-[1.02]' : ''}`}
                  >
                    {a.icon} {a.label}
                  </button>
                ))}
              </div>

              {action === 'TRANSFER' && (
                <select
                  value={newChainId}
                  onChange={e => setNewChainId(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">— Chaîne de destination —</option>
                  {chains.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}

              {action && (
                <textarea
                  value={details}
                  onChange={e => setDetails(e.target.value)}
                  placeholder="Détails / motif (optionnel)..."
                  rows={2}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none"
                />
              )}

              {action && (
                <input
                  value={actorName}
                  onChange={e => setActorName(e.target.value)}
                  placeholder="Votre nom..."
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              )}

              {action && (
                <button
                  onClick={handleConfirm}
                  disabled={action === 'TRANSFER' && !newChainId}
                  className="w-full py-2.5 bg-indigo-600 text-white text-[11px] font-black rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  <Check className="w-3.5 h-3.5" /> Confirmer
                </button>
              )}
            </>
          )}

          {done && (
            <div className="flex flex-col items-center justify-center gap-3 py-6">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <Check className="w-6 h-6" />
              </div>
              <div className="text-sm font-black text-slate-900">Action enregistrée</div>
              <div className="text-xs text-slate-400">L'historique a été mis à jour.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
