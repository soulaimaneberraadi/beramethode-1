import React, { useRef, useState } from 'react';
import { X, Camera, QrCode, ScanLine, AlertTriangle, CheckCircle2, Wrench, ArrowRightLeft, Check } from 'lucide-react';
import type { Machine, MachineInstance } from '../types';
import { parseMachineQrFromString, tryDecodeQrFromImageFile } from '../lib/machineQrPayload';
import { tx } from '../lib/i18n';
import { useLang } from '../src/context/LanguageContext';

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
  PANNE: 'text-rose-600 bg-rose-50 dark:bg-rose-950/30 border-rose-200',
  MAINT: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-amber-200',
};

export default function MachineQuickScanModal({ open, onClose, machineInstances, machines, chains, onAction }: Props) {
  const { lang } = useLang();
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
      if (!inst) { setIdentifyError(tx(lang, { fr: 'Aucune machine trouvée avec ce matricule.', ar: 'لم يتم العثور على آلة بهذا الرقم التسلسلي.', en: 'No machine found with this serial number.', es: 'No se encontró ninguna máquina con esta matrícula.', pt: 'Nenhuma máquina encontrada com esta matrícula.', tr: 'Bu seri numarasına sahip makine bulunamadı.' })); return; }
    } else {
      const parsed = parseMachineQrFromString(qrText.trim());
      if (!parsed) { setIdentifyError(tx(lang, { fr: 'QR invalide ou non reconnu.', ar: 'رمز QR غير صالح أو غير معروف.', en: 'Invalid or unrecognized QR.', es: 'QR inválido o no reconocido.', pt: 'QR inválido ou não reconhecido.', tr: 'Geçersiz veya tanınmayan QR.' })); return; }
      inst = findInstance((parsed as any).mat || parsed.id);
      if (!inst) { setIdentifyError(tx(lang, { fr: 'Machine du QR introuvable dans l\'inventaire.', ar: 'الآلة من QR غير موجودة في المخزون.', en: 'QR machine not found in inventory.', es: 'Máquina del QR no encontrada en el inventario.', pt: 'Máquina do QR não encontrada no inventário.', tr: 'QR makinesi envanterde bulunamadı.' })); return; }
    }
    setIdentified(inst);
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);
    try {
      const raw = await tryDecodeQrFromImageFile(file);
      if (!raw) { setIdentifyError(tx(lang, { fr: 'QR non détecté dans l\'image.', ar: 'QR غير مكتشف في الصورة.', en: 'QR not detected in the image.', es: 'QR no detectado en la imagen.', pt: 'QR não detetado na imagem.', tr: 'Resimde QR algılanmadı.' })); setScanning(false); return; }
      setQrText(raw);
      const parsed = parseMachineQrFromString(raw);
      if (!parsed) { setIdentifyError(tx(lang, { fr: 'QR décodé mais format non reconnu.', ar: 'تم فك تشفير QR ولكن التنسيق غير معروف.', en: 'QR decoded but format not recognized.', es: 'QR decodificado pero formato no reconocido.', pt: 'QR descodificado mas formato não reconhecido.', tr: 'QR kodu çözüldü ancak format tanınmadı.' })); setScanning(false); return; }
      const inst = findInstance((parsed as any).mat || parsed.id);
      if (!inst) { setIdentifyError(tx(lang, { fr: 'Machine du QR introuvable dans l\'inventaire.', ar: 'الآلة من QR غير موجودة في المخزون.', en: 'QR machine not found in inventory.', es: 'Máquina del QR no encontrada en el inventario.', pt: 'Máquina do QR não encontrada no inventário.', tr: 'QR makinesi envanterde bulunamadı.' })); setScanning(false); return; }
      setIdentified(inst);
      setIdentifyError('');
    } catch {
      setIdentifyError(tx(lang, { fr: 'Erreur lors de la lecture de l\'image.', ar: 'خطأ في قراءة الصورة.', en: 'Error reading the image.', es: 'Error al leer la imagen.', pt: 'Erro ao ler a imagem.', tr: 'Resim okunurken hata oluştu.' }));
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
    { kind: 'PANNE', label: 'Panne', icon: <AlertTriangle className="w-4 h-4" />, color: 'border-rose-200 bg-rose-50 dark:bg-rose-950/30 text-rose-700 hover:bg-rose-100' },
    { kind: 'REPARE', label: 'Réparé', icon: <CheckCircle2 className="w-4 h-4" />, color: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
    { kind: 'MAINT', label: 'Maintenance', icon: <Wrench className="w-4 h-4" />, color: 'border-amber-200 bg-amber-50 dark:bg-amber-950/30 text-amber-700 hover:bg-amber-100' },
    { kind: 'TRANSFER', label: 'Transfert', icon: <ArrowRightLeft className="w-4 h-4" />, color: 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100' },
  ];

  // Helper for translating ACTIONS labels
  const actionLabel = (action: typeof ACTIONS[number]) => {
    const map: Record<string, { fr: string; ar: string; en: string; es: string; pt: string; tr: string }> = {
      PANNE: { fr: 'Panne', ar: 'عطل', en: 'Breakdown', es: 'Avería', pt: 'Avaria', tr: 'Arıza' },
      REPARE: { fr: 'Réparé', ar: 'مُصلح', en: 'Repaired', es: 'Reparado', pt: 'Reparado', tr: 'Onarıldı' },
      MAINT: { fr: 'Maintenance', ar: 'صيانة', en: 'Maintenance', es: 'Mantenimiento', pt: 'Manutenção', tr: 'Bakım' },
      TRANSFER: { fr: 'Transfert', ar: 'نقل', en: 'Transfer', es: 'Transferencia', pt: 'Transferência', tr: 'Transfer' },
    };
    return tx(lang, map[action.kind]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-2xl dark:shadow-dk-lg w-full max-w-md flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-dk-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 dark:text-dk-accent-text flex items-center justify-center">
              <ScanLine className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-black text-slate-900 dark:text-dk-text tracking-tight">{tx(lang, { fr: 'Identifier une machine', ar: 'تحديد آلة', en: 'Identify a machine', es: 'Identificar una máquina', pt: 'Identificar uma máquina', tr: 'Bir makineyi tanımla' })}</h2>
          </div>
          <button onClick={handleClose} className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-dk-hover text-slate-400 dark:text-dk-text-muted hover:text-slate-700 flex items-center justify-center transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4 overflow-y-auto max-h-[80vh]">

          {!identified && (
            <>
              <div className="flex rounded-xl border border-slate-200 dark:border-dk-border overflow-hidden text-[11px] font-black uppercase tracking-widest">
                <button onClick={() => setTab('mat')} className={`flex-1 py-2 transition-colors ${tab === 'mat' ? 'bg-indigo-600 dark:bg-dk-accent text-white' : 'bg-slate-50 dark:bg-dk-bg text-slate-500 dark:text-dk-text-muted hover:bg-slate-100 dark:hover:bg-dk-hover'}`}>{tx(lang, { fr: 'Matricule', ar: 'الرقم التسلسلي', en: 'Serial number', es: 'Matrícula', pt: 'Matrícula', tr: 'Seri numarası' })}</button>
                <button onClick={() => setTab('qr')} className={`flex-1 py-2 transition-colors ${tab === 'qr' ? 'bg-indigo-600 dark:bg-dk-accent text-white' : 'bg-slate-50 dark:bg-dk-bg text-slate-500 dark:text-dk-text-muted hover:bg-slate-100 dark:hover:bg-dk-hover'}`}>
                  <span className="flex items-center justify-center gap-1"><QrCode className="w-3 h-3" /> {tx(lang, { fr: 'Photo QR', ar: 'صورة QR', en: 'QR Photo', es: 'Foto QR', pt: 'Foto QR', tr: 'QR Fotoğraf' })}</span>
                </button>
              </div>

              {tab === 'mat' ? (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={matInput}
                    onChange={e => setMatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleIdentify()}
                    placeholder={tx(lang, { fr: 'Ex: MAC-3602', ar: 'مثال: MAC-3602', en: 'Ex: MAC-3602', es: 'Ej: MAC-3602', pt: 'Ex: MAC-3602', tr: 'Örn: MAC-3602' })}
                    className="flex-1 rounded-xl border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg px-3 py-2 text-sm font-bold text-slate-800 dark:text-dk-text outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  />
                  <button onClick={handleIdentify} className="px-4 py-2 bg-indigo-600 dark:bg-dk-accent text-white text-[11px] font-black rounded-xl hover:bg-indigo-700 dark:hover:bg-dk-accent-hover transition-colors">
                    {tx(lang, { fr: 'Chercher', ar: 'بحث', en: 'Search', es: 'Buscar', pt: 'Procurar', tr: 'Ara' })}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <input type="file" accept="image/*" capture="environment" ref={photoRef} onChange={handlePhoto} className="hidden" />
                  <button
                    onClick={() => photoRef.current?.click()}
                    disabled={scanning}
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50 dark:bg-dk-accent/20 text-indigo-600 dark:text-dk-accent-text text-[11px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-colors disabled:opacity-50"
                  >
                    <Camera className="w-4 h-4" />
                    {scanning ? tx(lang, { fr: 'Décodage...', ar: 'جارٍ فك الترميز...', en: 'Decoding...', es: 'Descodificando...', pt: 'A descodificar...', tr: 'Kod çözülüyor...' }) : tx(lang, { fr: 'Prendre une photo du QR', ar: 'التقط صورة لرمز QR', en: 'Take a QR photo', es: 'Tomar una foto del QR', pt: 'Tirar uma foto do QR', tr: 'QR fotoğrafı çek' })}
                  </button>
                  <textarea
                    value={qrText}
                    onChange={e => setQrText(e.target.value)}
                    placeholder={tx(lang, { fr: 'Ou collez le contenu du QR ici...', ar: 'أو الصق محتوى QR هنا...', en: 'Or paste the QR content here...', es: 'O pegue el contenido del QR aquí...', pt: 'Ou cole o conteúdo do QR aqui...', tr: 'Veya QR içeriğini buraya yapıştırın...' })}
                    rows={3}
                    className="rounded-xl border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg px-3 py-2 text-xs font-mono text-slate-700 dark:text-dk-text outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none"
                  />
                  <button onClick={handleIdentify} className="py-2 bg-indigo-600 dark:bg-dk-accent text-white text-[11px] font-black rounded-xl hover:bg-indigo-700 dark:hover:bg-dk-accent-hover transition-colors">
                    {tx(lang, { fr: 'Identifier', ar: 'تحديد', en: 'Identify', es: 'Identificar', pt: 'Identificar', tr: 'Tanımla' })}
                  </button>
                </div>
              )}

              {identifyError && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-100 text-rose-600 text-xs font-bold">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {identifyError}
                </div>
              )}
            </>
          )}

          {identified && !done && (
            <>
              <div className="rounded-xl border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border flex items-center justify-center shrink-0 text-slate-300 dark:text-dk-muted">
                  <Wrench className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-black text-slate-900 dark:text-dk-text text-sm truncate">{inst?.matricule || inst?.id}</div>
                  <div className="text-[10px] font-bold text-slate-400 dark:text-dk-text-muted uppercase tracking-widest mt-0.5">{cls?.name || inst?.classId} {inst?.brand ? `· ${inst.brand}` : ''}</div>
                  {currentChain && <div className="text-[10px] text-indigo-500 font-bold mt-0.5">{currentChain.name}</div>}
                </div>
                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border ${STATUS_COLOR[statusKey] || STATUS_COLOR['OK']}`}>
                  {tx(lang, { fr: STATUS_LABEL[statusKey] || statusKey, ar: statusKey === 'PANNE' ? 'عطل' : statusKey === 'MAINT' ? 'صيانة' : statusKey, en: STATUS_LABEL[statusKey] || statusKey, es: statusKey === 'PANNE' ? 'Avería' : statusKey === 'MAINT' ? 'Mantenimiento' : statusKey, pt: statusKey === 'PANNE' ? 'Avaria' : statusKey === 'MAINT' ? 'Manutenção' : statusKey, tr: statusKey === 'PANNE' ? 'Arıza' : statusKey === 'MAINT' ? 'Bakım' : statusKey })}
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
                    {a.icon} {actionLabel(a)}
                  </button>
                ))}
              </div>

              {action === 'TRANSFER' && (
                <select
                  value={newChainId}
                  onChange={e => setNewChainId(e.target.value)}
                  className="rounded-xl border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg px-3 py-2 text-sm font-bold text-slate-800 dark:text-dk-text outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">{tx(lang, { fr: '— Chaîne de destination —', ar: '— سلسلة الوجهة —', en: '— Destination chain —', es: '— Cadena de destino —', pt: '— Linha de destino —', tr: '— Hedef hat —' })}</option>
                  {chains.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}

              {action && (
                <textarea
                  value={details}
                  onChange={e => setDetails(e.target.value)}
                  placeholder={tx(lang, { fr: 'Détails / motif (optionnel)...', ar: 'تفاصيل / سبب (اختياري)...', en: 'Details / reason (optional)...', es: 'Detalles / motivo (opcional)...', pt: 'Detalhes / motivo (opcional)...', tr: 'Detaylar / sebep (isteğe bağlı)...' })}
                  rows={2}
                  className="rounded-xl border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg px-3 py-2 text-sm text-slate-700 dark:text-dk-text outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none"
                />
              )}

              {action && (
                <input
                  value={actorName}
                  onChange={e => setActorName(e.target.value)}
                  placeholder={tx(lang, { fr: 'Votre nom...', ar: 'اسمك...', en: 'Your name...', es: 'Su nombre...', pt: 'O seu nome...', tr: 'Adınız...' })}
                  className="rounded-xl border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg px-3 py-2 text-sm font-bold text-slate-800 dark:text-dk-text outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              )}

              {action && (
                <button
                  onClick={handleConfirm}
                  disabled={action === 'TRANSFER' && !newChainId}
                  className="w-full py-2.5 bg-indigo-600 dark:bg-dk-accent text-white text-[11px] font-black rounded-xl hover:bg-indigo-700 dark:hover:bg-dk-accent-hover transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  <Check className="w-3.5 h-3.5" /> {tx(lang, { fr: 'Confirmer', ar: 'تأكيد', en: 'Confirm', es: 'Confirmar', pt: 'Confirmar', tr: 'Onayla' })}
                </button>
              )}
            </>
          )}

          {done && (
            <div className="flex flex-col items-center justify-center gap-3 py-6">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <Check className="w-6 h-6" />
              </div>
              <div className="text-sm font-black text-slate-900 dark:text-dk-text">{tx(lang, { fr: 'Action enregistrée', ar: 'تم حفظ الإجراء', en: 'Action saved', es: 'Acción guardada', pt: 'Ação guardada', tr: 'İşlem kaydedildi' })}</div>
              <div className="text-xs text-slate-400 dark:text-dk-text-muted">{tx(lang, { fr: 'L\'historique a été mis à jour.', ar: 'تم تحديث السجل.', en: 'The history has been updated.', es: 'El historial ha sido actualizado.', pt: 'O histórico foi atualizado.', tr: 'Geçmiş güncellendi.' })}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
