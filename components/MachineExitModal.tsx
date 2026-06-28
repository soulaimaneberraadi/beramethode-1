import React, { useEffect, useMemo, useState } from 'react';
import { X, Camera, QrCode, AlertTriangle, PackageMinus, ShoppingBag } from 'lucide-react';
import type { Machine } from '../types';
import { parseMachineQrFromString, tryDecodeQrFromImageFile } from '../lib/machineQrPayload';
import { tx } from '../lib/i18n';
import { useLang } from '../src/context/LanguageContext';

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
  initialMachineId: string | null;
  defaultActorName: string;
  onConfirm: (p: MachineExitPayload) => void;
};

function norm(s: string) {
  return s.trim().toLowerCase();
}

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
  const { lang } = useLang();

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
      setError(tx(lang,{fr:'Choisissez une machine dans la liste.',ar:'اختر آلة من القائمة.',en:'Choose a machine from the list.',es:'Elija una máquina de la lista.',pt:'Escolha uma máquina da lista.',tr:'Listeden bir makine seçin.'}));
      return;
    }
    const actor = actorName.trim();
    if (actor.length < 2) {
      setError(tx(lang,{fr:'Indiquez votre nom (au moins 2 caractères).',ar:'أدخل اسمك (حرفان على الأقل).',en:'Enter your name (at least 2 characters).',es:'Indique su nombre (al menos 2 caracteres).',pt:'Indique o seu nome (pelo menos 2 caracteres).',tr:'Adınızı girin (en az 2 karakter).'}));
      return;
    }
    const det = details.trim();
    if (det.length < 4) {
      setError(tx(lang,{fr:'Précisez le motif ou les détails (au moins 4 caractères).',ar:'حدد السبب أو التفاصيل (4 أحرف على الأقل).',en:'Specify the reason or details (at least 4 characters).',es:'Especifique el motivo o los detalles (al menos 4 caracteres).',pt:'Especifique o motivo ou os detalhes (pelo menos 4 caracteres).',tr:'Nedeni veya ayrıntıları belirtin (en az 4 karakter).'}));
      return;
    }

    const matMachine = (m.matricule || '').trim();
    let confirmationRef = '';

    if (confirmMode === 'QR') {
      const raw = qrPaste.trim();
      const parsed = parseMachineQrFromString(raw);
      if (!parsed) {
        setError(tx(lang,{fr:'QR invalide : collez le JSON complet lu sur l\'étiquette (ou photo décodée).',ar:'رمز QR غير صالح: ألصق JSON الكامل المقروء من الملصق (أو الصورة المفكوكة).',en:'Invalid QR: paste the full JSON read from the label (or decoded photo).',es:'QR inválido: pegue el JSON completo leído de la etiqueta (o foto decodificada).',pt:'QR inválido: cole o JSON completo lido da etiqueta (ou foto descodificada).',tr:'Geçersiz QR: etiketten okunan tam JSON\'ı yapıştırın (veya çözülmüş fotoğraf).'}));
        return;
      }
      if (parsed.id !== m.id) {
        setError(tx(lang,{fr:'Ce QR ne correspond pas à la machine sélectionnée.',ar:'رمز QR هذا لا يتطابق مع الآلة المحددة.',en:'This QR does not match the selected machine.',es:'Este QR no corresponde a la máquina seleccionada.',pt:'Este QR não corresponde à máquina selecionada.',tr:'Bu QR, seçilen makineyle eşleşmiyor.'}));
        return;
      }
      confirmationRef = `qr:${parsed.id}`;
    } else {
      const typed = matInput.trim();
      if (!typed) {
        setError(matMachine ? tx(lang,{fr:'Saisissez le matricule atelier pour confirmer.',ar:'أدخل رقم الآلة في الورشة للتأكيد.',en:'Enter the workshop registration number to confirm.',es:'Ingrese la matrícula del taller para confirmar.',pt:'Insira a matrícula da oficina para confirmar.',tr:'Atölye kayıt numarasını girin.'}) : tx(lang,{fr:'Saisissez l\'ID interne affiché sur la fiche ou scannez le QR.',ar:'أدخل المعرف الداخلي المعروض على البطاقة أو امسح QR.',en:'Enter the internal ID shown on the card or scan the QR.',es:'Ingrese el ID interno mostrado en la ficha o escanee el QR.',pt:'Insira o ID interno exibido na ficha ou digitalize o QR.',tr:'Kartta görünen dahili kimliği girin veya QR\'ı tarayın.'}));
        return;
      }
      if (matMachine) {
        if (norm(typed) !== norm(matMachine)) {
          setError(tx(lang,{fr:'Le matricule ne correspond pas à cette machine.',ar:'رقم الآلة لا يتطابق مع هذه الآلة.',en:'The registration number does not match this machine.',es:'La matrícula no corresponde a esta máquina.',pt:'A matrícula não corresponde a esta máquina.',tr:'Kayıt numarası bu makineyle eşleşmiyor.'}));
          return;
        }
        confirmationRef = `mat:${typed.trim()}`;
      } else {
        if (typed.trim() !== m.id) {
          setError(tx(lang,{fr:`L'ID interne attendu est : ${m.id}`,ar:`المعرف الداخلي المتوقع هو: ${m.id}`,en:`Expected internal ID: ${m.id}`,es:`ID interno esperado: ${m.id}`,pt:`ID interno esperado: ${m.id}`,tr:`Beklenen dahili kimlik: ${m.id}`}));
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
          tx(lang,{fr:'Impossible de lire le QR sur cette image. Utilisez Chrome sur mobile, ou collez le texte JSON du QR.',ar:'تعذر قراءة QR من هذه الصورة. استخدم Chrome على الجوال، أو ألصق نص JSON الخاص بـ QR.',en:'Unable to read the QR from this image. Use Chrome on mobile, or paste the QR JSON text.',es:'No se puede leer el QR de esta imagen. Use Chrome en móvil, o pegue el texto JSON del QR.',pt:'Não foi possível ler o QR desta imagem. Use o Chrome no celular ou cole o texto JSON do QR.',tr:'QR bu görüntüden okunamadı. Mobilde Chrome kullanın veya QR JSON metnini yapıştırın.'})
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
      <div className="bg-white dark:bg-dk-surface rounded-t-3xl sm:rounded-3xl shadow-2xl dark:shadow-dk-lg w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col border border-slate-200 dark:border-dk-border">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-dk-border bg-slate-50/90 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
              <PackageMinus className="w-5 h-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 id="machine-exit-title" className="text-base font-black text-slate-900 dark:text-dk-text truncate">
                {tx(lang,{fr:'Retirer du parc',ar:'إزالة من الأسطول',en:'Remove from fleet',es:'Retirar del parque',pt:'Retirar do parque',tr:'Filodan çıkar'})}
              </h2>
              <p className="text-[10px] font-bold text-slate-500 dark:text-dk-text-muted uppercase tracking-tight">
                {tx(lang,{fr:'Sortie ou vente — la machine reste dans l\'historique',ar:'خروج أو بيع — تبقى الآلة في السجل',en:'Exit or sale — the machine remains in history',es:'Salida o venta — la máquina permanece en el historial',pt:'Saída ou venda — a máquina permanece no histórico',tr:'Çıkış veya satış — makine geçmişte kalır'})}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 dark:text-dk-text-muted hover:bg-slate-200/80 transition-colors shrink-0"
            aria-label={tx(lang,{fr:'Fermer',ar:'إغلاق',en:'Close',es:'Cerrar',pt:'Fechar',tr:'Kapat'})}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto custom-scrollbar p-5 space-y-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-black text-slate-400 dark:text-dk-text-muted uppercase tracking-tight">{tx(lang,{fr:'Machine',ar:'الآلة',en:'Machine',es:'Máquina',pt:'Máquina',tr:'Makine'})}</span>
            <select
              value={machineId}
              onChange={e => setMachineId(e.target.value)}
              disabled={Boolean(initialMachineId && machines.some(m => m.id === initialMachineId))}
              className="rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface px-3 py-2.5 text-sm font-bold text-slate-800 dark:text-dk-text outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-70"
            >
              {machines.length === 0 ? (
                <option value="">{tx(lang,{fr:'— Aucune machine —',ar:'— لا توجد آلة —',en:'— No machine —',es:'— Ninguna máquina —',pt:'— Nenhuma máquina —',tr:'— Makine yok —'})}</option>
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
                  ? 'border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/30 text-rose-800 ring-1 ring-rose-200'
                  : 'border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-500 dark:text-dk-text-muted hover:bg-slate-50 dark:hover:bg-dk-hover'
              }`}
            >
              <PackageMinus className="w-4 h-4 shrink-0" />
              {tx(lang,{fr:'Sortie',ar:'خروج',en:'Exit',es:'Salida',pt:'Saída',tr:'Çıkış'})}
            </button>
            <button
              type="button"
              onClick={() => setKind('SELL')}
              className={`flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-xs font-black uppercase tracking-tight transition-colors ${
                kind === 'SELL'
                  ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-amber-900 ring-1 ring-amber-200'
                  : 'border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-500 dark:text-dk-text-muted hover:bg-slate-50 dark:hover:bg-dk-hover'
              }`}
            >
              <ShoppingBag className="w-4 h-4 shrink-0" />
              {tx(lang,{fr:'Vente',ar:'بيع',en:'Sale',es:'Venta',pt:'Venda',tr:'Satış'})}
            </button>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-black text-slate-400 dark:text-dk-text-muted uppercase tracking-tight">
              {tx(lang,{fr:'Votre nom',ar:'الاسم الكامل',en:'Your name',es:'Su nombre',pt:'O seu nome',tr:'Adınız'})}
            </span>
            <input
              type="text"
              value={actorName}
              onChange={e => setActorName(e.target.value)}
              placeholder={tx(lang,{fr:'Prénom et nom',ar:'الاسم واللقب',en:'First and last name',es:'Nombre y apellido',pt:'Nome e apelido',tr:'Ad ve soyad'})}
              autoComplete="name"
              className="rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface px-3 py-2.5 text-sm font-bold text-slate-800 dark:text-dk-text outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-black text-slate-400 dark:text-dk-text-muted uppercase tracking-tight">{tx(lang,{fr:'Détails / motif',ar:'التفاصيل / السبب',en:'Details / reason',es:'Detalles / motivo',pt:'Detalhes / motivo',tr:'Detaylar / neden'})}</span>
            <textarea
              value={details}
              onChange={e => setDetails(e.target.value)}
              rows={3}
              placeholder={
                kind === 'SELL'
                  ? tx(lang,{fr:'Ex. vendue à…, prix indicatif, état…',ar:'مثال: بيعت إلى…، سعر إرشادي، حالة…',en:'E.g. sold to…, indicative price, condition…',es:'Ej. vendida a…, precio indicativo, estado…',pt:'Ex. vendida a…, preço indicativo, estado…',tr:'Örn. satıldı…, gösterge fiyat, durum…'})
                  : tx(lang,{fr:'Ex. mise au rebut, transfert autre site, panne irréparable…',ar:'مثال: إعدام، نقل إلى موقع آخر، عطل لا يمكن إصلاحه…',en:'E.g. scrapped, transfer to another site, irreparable breakdown…',es:'Ej. desechada, transferencia a otro sitio, avería irreparable…',pt:'Ex. sucateada, transferência para outro local, avaria irreparável…',tr:'Örn. hurdaya çıkarıldı, başka siteye transfer, onarılamaz arıza…'})
              }
              className="rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface px-3 py-2.5 text-sm font-medium text-slate-800 dark:text-dk-text outline-none focus:ring-2 focus:ring-indigo-500 resize-y min-h-[72px]"
            />
          </label>

          <div className="rounded-2xl border border-slate-200 dark:border-dk-border bg-slate-50/80 p-4 space-y-3">
            <div className="flex items-start gap-2 text-xs text-slate-600 dark:text-dk-text-secondary font-bold leading-snug">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" aria-hidden />
              <span>
                {tx(lang,{fr:'Confirmez l\'identité avec le ',ar:'أكد الهوية باستخدام ',en:'Confirm identity with the ',es:'Confirme la identidad con la ',pt:'Confirme a identidade com a ',tr:'Kimliği şununla onaylayın: '})}
                <strong className="text-slate-800 dark:text-dk-text">{tx(lang,{fr:'matricule atelier',ar:'رقم الآلة في الورشة',en:'workshop registration',es:'matrícula del taller',pt:'matrícula da oficina',tr:'atölye kayıt numarası'})}</strong>
                {tx(lang,{fr:' ou le ',ar:' أو ',en:' or the ',es:' o el ',pt:' ou o ',tr:' veya '})}
                <strong className="text-slate-800 dark:text-dk-text">{tx(lang,{fr:'QR',ar:'QR',en:'QR',es:'QR',pt:'QR',tr:'QR'})}</strong>
                {tx(lang,{fr:' de l\'étiquette. Sans matricule enregistré, saisissez l\'',ar:' من الملصق. بدون رقم آلة مسجل، أدخل ',en:' from the label. Without a registered registration, enter the ',es:' de la etiqueta. Sin matrícula registrada, ingrese el ',pt:' da etiqueta. Sem matrícula registada, insira o ',tr:' etiketten. Kayıtlı bir numara yoksa, girin '})}
                <strong className="text-slate-800 dark:text-dk-text">{tx(lang,{fr:'ID interne',ar:'المعرف الداخلي',en:'internal ID',es:'ID interno',pt:'ID interno',tr:'dahili kimlik'})}</strong>
                {tx(lang,{fr:' exact de la machine.',ar:' الدقيق للآلة.',en:' of the machine.',es:' exacto de la máquina.',pt:' exato da máquina.',tr:' makinenin tam kimliğini.'})}
              </span>
            </div>

            <div className="flex rounded-xl border border-slate-200 dark:border-dk-border overflow-hidden bg-white dark:bg-dk-surface">
              <button
                type="button"
                onClick={() => setConfirmMode('MAT')}
                className={`flex-1 py-2 text-[10px] font-black uppercase tracking-tight ${
                  confirmMode === 'MAT' ? 'bg-indigo-600 dark:bg-dk-accent text-white' : 'text-slate-500 dark:text-dk-text-muted hover:bg-slate-50 dark:hover:bg-dk-hover'
                }`}
              >
                {tx(lang,{fr:'Matricule / ID',ar:'رقم الآلة / المعرف',en:'Registration / ID',es:'Matrícula / ID',pt:'Matrícula / ID',tr:'Kayıt No / Kimlik'})}
              </button>
              <button
                type="button"
                onClick={() => setConfirmMode('QR')}
                className={`flex-1 py-2 text-[10px] font-black uppercase tracking-tight ${
                  confirmMode === 'QR' ? 'bg-indigo-600 dark:bg-dk-accent text-white' : 'text-slate-500 dark:text-dk-text-muted hover:bg-slate-50 dark:hover:bg-dk-hover'
                }`}
              >
                {tx(lang,{fr:'Contenu QR',ar:'محتوى QR',en:'QR content',es:'Contenido QR',pt:'Conteúdo QR',tr:'QR içeriği'})}
              </button>
            </div>

            {confirmMode === 'MAT' ? (
              <input
                type="text"
                value={matInput}
                onChange={e => setMatInput(e.target.value)}
                placeholder={
                  selected && (selected.matricule || '').trim()
                    ? tx(lang,{fr:'Matricule atelier (identique à la fiche)',ar:'رقم الآلة في الورشة (مطابق للبطاقة)',en:'Workshop registration (same as the card)',es:'Matrícula del taller (idéntica a la ficha)',pt:'Matrícula da oficina (idêntica à ficha)',tr:'Atölye kayıt numarası (kartla aynı)'})
                    : `${tx(lang,{fr:'ID interne',ar:'المعرف الداخلي',en:'Internal ID',es:'ID interno',pt:'ID interno',tr:'Dahili kimlik'})} : ${selected?.id || '…'}`
                }
                className="w-full rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface px-3 py-2.5 text-sm font-mono font-bold text-slate-800 dark:text-dk-text outline-none focus:ring-2 focus:ring-indigo-500"
              />
            ) : (
              <div className="space-y-2">
                <textarea
                  value={qrPaste}
                  onChange={e => setQrPaste(e.target.value)}
                  rows={4}
                  placeholder={tx(lang,{fr:'Collez ici le JSON du QR (bouton « copier » depuis l\'étiquette ou lecture manuelle)',ar:'ألصق JSON الخاص بـ QR هنا (زر "نسخ" من الملصق أو القراءة اليدوية)',en:'Paste the QR JSON here (copy button from the label or manual reading)',es:'Pegue aquí el JSON del QR (botón "copiar" desde la etiqueta o lectura manual)',pt:'Cole aqui o JSON do QR (botão "copiar" da etiqueta ou leitura manual)',tr:'QR JSON\'ını buraya yapıştırın (etiketten "kopyala" düğmesi veya manuel okuma)'})}
                  className="w-full rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface px-3 py-2.5 text-xs font-mono text-slate-800 dark:text-dk-text outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="flex flex-wrap gap-2">
                  <label
                    htmlFor={cameraInputId}
                    className={`relative inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-xs font-black text-slate-700 dark:text-dk-text hover:bg-slate-50 dark:hover:bg-dk-hover overflow-hidden ${
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
                      aria-label={tx(lang,{fr:'Prendre une photo du QR (appareil photo)',ar:'التقاط صورة QR (كاميرا)',en:'Take a QR photo (camera)',es:'Tomar una foto del QR (cámara)',pt:'Tirar uma foto do QR (câmara)',tr:'QR fotoğrafı çek (kamera)'})}
                    />
                    <Camera className="w-4 h-4 text-indigo-600 dark:text-dk-accent-text pointer-events-none shrink-0" aria-hidden />
                    <span className="pointer-events-none">{decodeBusy ? tx(lang,{fr:'Décodage…',ar:'فك الترميز…',en:'Decoding…',es:'Decodificando…',pt:'A descodificar…',tr:'Kod çözülüyor…'}) : tx(lang,{fr:'Photo / fichier QR',ar:'صورة / ملف QR',en:'QR photo / file',es:'Foto / archivo QR',pt:'Foto / ficheiro QR',tr:'QR fotoğrafı / dosyası'})}</span>
                  </label>
                  <span className="text-[10px] font-bold text-slate-400 dark:text-dk-text-muted self-center flex items-center gap-1">
                    <QrCode className="w-3.5 h-3.5" /> {tx(lang,{fr:'Chrome recommandé pour la lecture auto',ar:'يوصى باستخدام Chrome للقراءة التلقائية',en:'Chrome recommended for auto reading',es:'Chrome recomendado para lectura automática',pt:'Chrome recomendado para leitura automática',tr:'Otomatik okuma için Chrome önerilir'})}
                  </span>
                </div>
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 rounded-xl px-3 py-2">{error}</p>
          )}
        </div>

        <div className="p-5 border-t border-slate-100 dark:border-dk-border bg-white dark:bg-dk-surface flex flex-col-reverse sm:flex-row gap-2 sm:justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-3 rounded-2xl border border-slate-200 dark:border-dk-border text-sm font-black text-slate-600 dark:text-dk-text-secondary hover:bg-slate-50 dark:hover:bg-dk-hover"
          >
            {tx(lang,{fr:'Annuler',ar:'إلغاء',en:'Cancel',es:'Cancelar',pt:'Cancelar',tr:'İptal'})}
          </button>
          <button
            type="button"
            onClick={validateAndSubmit}
            disabled={!machines.length}
            className="px-4 py-3 rounded-2xl bg-rose-600 text-white text-sm font-black shadow-lg dark:shadow-dk-lg shadow-rose-100 hover:bg-rose-700 disabled:opacity-50"
          >
            {tx(lang,{fr:'Confirmer le retrait du parc',ar:'تأكيد إزالة الآلة من الأسطول',en:'Confirm removal from fleet',es:'Confirmar la retirada del parque',pt:'Confirmar a remoção do parque',tr:'Filodan çıkarmayı onayla'})}
          </button>
        </div>
      </div>
    </div>
  );
}
