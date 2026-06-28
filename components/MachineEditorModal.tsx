import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronLeft, ChevronRight, Download, Edit2, ImageIcon, Link2, Plus, FileText, Star, Trash2, X } from 'lucide-react';
import type { Machine, MachinePdfAttachment } from '../types';
import { BASE_MACHINE_TYPE_PRESETS, machineTypeDatalistOptions } from '../lib/machineTypePresets';
import { suggestClasseFromFamilyInput, suggestFamilyFromClasseInput } from '../lib/machineCategoryClasseLink';
import { useLang } from '../src/context/LanguageContext';
import { tx } from '../lib/i18n';

const PDF_MAX_BYTES = 5 * 1024 * 1024;
const IMG_MAX_BYTES = 5 * 1024 * 1024;
const MAX_PHOTOS = 24;
const MAX_PDFS = 16;

/** Marques courantes confection + enrichissement depuis le parc (`allMachines`). */
const COMMON_MACHINE_BRANDS = [
  'Adler',
  'Baby Lock',
  'Bernina',
  'Brother',
  'Durkopp Adler',
  'Elna',
  'Husqvarna Viking',
  'Janome',
  'Juki',
  'Kingtex',
  'Kansai',
  'Mauser Spezial',
  'Merrow',
  'Mitsubishi',
  'Pegasus',
  'Pfaff',
  'Rimoldi',
  'Singer',
  'Siruba',
  'Sunstar',
  'Typical',
  'Union Special',
  'Yamato',
];

const emptyForm = (): Partial<Machine> => ({
  name: '',
  classe: '',
  speed: 2000,
  speedMajor: 1.01,
  cofs: 1.0,
  active: true,
  status: 'OK',
  matricule: '',
  brand: '',
  machineCategory: '',
  purchaseDate: '',
  purchaseCondition: 'NEW',
  machinePhotos: [],
  photoDataUrl: '',
  machineManuals: [],
  manualPdfDataUrl: '',
  manualPdfName: '',
});

function formatMo(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))}`;
}

function downloadFromDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename.replace(/[/\\?%*:|"<>]/g, '_');
  a.rel = 'noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function extensionFromDataUrl(dataUrl: string, fallback: string) {
  const m = /^data:([^;]+);/i.exec(dataUrl);
  if (!m) return fallback;
  const sub = m[1].split('/')[1];
  if (sub === 'jpeg') return 'jpg';
  return sub || fallback;
}

function readFileAsDataUrl(file: File, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > maxBytes) {
      reject(new Error('FILE_TOO_LARGE'));
      return;
    }
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error('READ_FAIL'));
    r.readAsDataURL(file);
  });
}

function photosFromMachine(m: Machine): string[] {
  const g = (m.machinePhotos || []).filter(Boolean);
  if (g.length) return [...g];
  return m.photoDataUrl ? [m.photoDataUrl] : [];
}

function manualsFromMachine(m: Machine): MachinePdfAttachment[] {
  const g = (m.machineManuals || []).filter(x => x?.dataUrl);
  if (g.length) return g.map(x => ({ dataUrl: x.dataUrl, name: x.name || 'document.pdf' }));
  return m.manualPdfDataUrl ? [{ dataUrl: m.manualPdfDataUrl, name: m.manualPdfName || 'manuel.pdf' }] : [];
}

function formFromMachine(initial: Machine | null): Partial<Machine> {
  if (!initial) return emptyForm();
  const photos = photosFromMachine(initial);
  const manuals = manualsFromMachine(initial);
  const ref =
    (initial.name || '').trim() || (initial.matricule || '').trim() || '';
  return {
    ...emptyForm(),
    ...initial,
    name: ref,
    matricule: ref,
    machinePhotos: photos,
    machineManuals: manuals,
    photoDataUrl: photos[0] || '',
    manualPdfDataUrl: manuals[0]?.dataUrl || '',
    manualPdfName: manuals[0]?.name || '',
  };
}

export type MachineEditorTitleMode = 'machine' | 'classe';

export default function MachineEditorModal({
  open,
  initialMachine,
  allMachines = [],
  onClose,
  onSave,
  formPrefill,
  titleMode = 'machine',
}: {
  open: boolean;
  initialMachine: Machine | null;
  /** Parc actuel : enrichit les suggestions « type » avec les familles déjà utilisées (même logique que Machin / guides). */
  allMachines?: Machine[];
  onClose: () => void;
  onSave: (m: Machine, ctx: { created: boolean }) => void;
  /** Fusionné à l’ouverture (ex. pastille famille depuis Parc Machines). */
  formPrefill?: Partial<Machine> | null;
  /** `classe` : titres alignés sur Parc Machines (Nouvelle classe). `machine` : inventaire / libellé générique. */
  titleMode?: MachineEditorTitleMode;
}) {
  const { lang } = useLang();
  const [machineForm, setMachineForm] = useState<Partial<Machine>>(emptyForm());
  const [errors, setErrors] = useState({ name: false, classe: false });
  const [fileHint, setFileHint] = useState<string | null>(null);
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [typeMenuPos, setTypeMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [linkFlash, setLinkFlash] = useState<'classe' | 'type' | null>(null);
  const [photoLightboxIndex, setPhotoLightboxIndex] = useState<number | null>(null);
  const [brandSuggestOpen, setBrandSuggestOpen] = useState(false);
  const typeAnchorRef = useRef<HTMLDivElement>(null);
  const typeMenuRef = useRef<HTMLUListElement>(null);
  const brandSuggestWrapRef = useRef<HTMLDivElement>(null);
  const machineFormRef = useRef(machineForm);
  machineFormRef.current = machineForm;

  const typeDatalistOptions = useMemo(() => machineTypeDatalistOptions(allMachines), [allMachines]);

  const classeDatalistOptions = useMemo(() => {
    const seen = new Map<string, string>();
    const staticCodes = [
      '101',
      '107',
      '256',
      '301',
      '304',
      '316',
      '402',
      '404',
      '504',
      '514',
      '516',
      '602',
      'BR',
      'FER',
      'MAN',
      'ZIGZAG',
    ];
    for (const x of staticCodes) seen.set(x.toLowerCase(), x);
    for (const m of allMachines) {
      const cl = (m.classe || '').trim();
      if (cl) seen.set(cl.toLowerCase(), cl);
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
  }, [allMachines]);

  const brandDatalistOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const b of COMMON_MACHINE_BRANDS) {
      const t = b.trim();
      if (t) seen.set(t.toLowerCase(), t);
    }
    for (const m of allMachines) {
      const b = (m.brand || '').trim();
      if (b) seen.set(b.toLowerCase(), b);
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
  }, [allMachines]);

  /** Suggestions « colonne » (pas le popup natif sombre du datalist) : préfixe d’abord, puis contient. */
  const brandComboFiltered = useMemo(() => {
    const q = (machineForm.brand || '').trim().toLowerCase();
    if (!q) return brandDatalistOptions.slice(0, 12);
    const starts = brandDatalistOptions.filter(b => b.toLowerCase().startsWith(q));
    const inc = brandDatalistOptions.filter(b => !b.toLowerCase().startsWith(q) && b.toLowerCase().includes(q));
    return [...starts, ...inc].slice(0, 12);
  }, [brandDatalistOptions, machineForm.brand]);

  const typeComboFiltered = useMemo(() => {
    const q = (machineForm.machineCategory || '').trim().toLowerCase();
    if (!q) return typeDatalistOptions;
    return typeDatalistOptions.filter(t => t.toLowerCase().includes(q));
  }, [typeDatalistOptions, machineForm.machineCategory]);

  const refreshTypeMenuPos = useCallback(() => {
    if (!typePickerOpen || !typeAnchorRef.current) {
      setTypeMenuPos(null);
      return;
    }
    const r = typeAnchorRef.current.getBoundingClientRect();
    setTypeMenuPos({ top: r.bottom + 6, left: r.left, width: r.width });
  }, [typePickerOpen]);

  useLayoutEffect(() => {
    refreshTypeMenuPos();
  }, [refreshTypeMenuPos, typePickerOpen, machineForm.machineCategory]);

  useEffect(() => {
    if (!typePickerOpen) return;
    const f = () => refreshTypeMenuPos();
    window.addEventListener('scroll', f, true);
    window.addEventListener('resize', f);
    return () => {
      window.removeEventListener('scroll', f, true);
      window.removeEventListener('resize', f);
    };
  }, [typePickerOpen, refreshTypeMenuPos]);

  useEffect(() => {
    if (!typePickerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTypePickerOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (typeAnchorRef.current?.contains(t)) return;
      if (typeMenuRef.current?.contains(t)) return;
      setTypePickerOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [typePickerOpen]);

  useEffect(() => {
    if (!brandSuggestOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (brandSuggestWrapRef.current?.contains(t)) return;
      setBrandSuggestOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [brandSuggestOpen]);

  useEffect(() => {
    if (!linkFlash) return;
    const t = window.setTimeout(() => setLinkFlash(null), 920);
    return () => window.clearTimeout(t);
  }, [linkFlash]);

  const commitTypeFamily = useCallback((raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const sug = suggestClasseFromFamilyInput(trimmed);
    setMachineForm(f => ({
      ...f,
      machineCategory: trimmed,
      ...(sug ? { classe: sug } : {}),
    }));
    if (sug) setLinkFlash('classe');
    setTypePickerOpen(false);
    setErrors(prev => ({ ...prev, classe: sug ? false : prev.classe }));
  }, []);

  const galleryPhotos = useMemo(() => {
    const g = machineForm.machinePhotos?.filter(Boolean) || [];
    if (g.length) return g;
    return machineForm.photoDataUrl ? [machineForm.photoDataUrl] : [];
  }, [machineForm.machinePhotos, machineForm.photoDataUrl]);

  const galleryManuals = useMemo(() => {
    const g = (machineForm.machineManuals || []).filter(x => x?.dataUrl);
    if (g.length) return g;
    return machineForm.manualPdfDataUrl
      ? [{ dataUrl: machineForm.manualPdfDataUrl, name: machineForm.manualPdfName || 'manuel.pdf' }]
      : [];
  }, [machineForm.machineManuals, machineForm.manualPdfDataUrl, machineForm.manualPdfName]);

  useEffect(() => {
    if (!open) return;
    const base = formFromMachine(initialMachine);
    const pre = formPrefill || {};
    let merged: Partial<Machine> = { ...base, ...pre };
    let flashClasse: 'classe' | null = null;
    const pCat = String(pre.machineCategory || '').trim();
    const pCl = String(pre.classe || '').trim();
    if (pCat && !pCl) {
      const sug = suggestClasseFromFamilyInput(pCat);
      if (sug) {
        merged = { ...merged, machineCategory: pCat, classe: sug };
        flashClasse = 'classe';
      }
    }
    const refUnified =
      (merged.name || '').trim() || (merged.matricule || '').trim() || '';
    merged = { ...merged, name: refUnified, matricule: refUnified };
    setMachineForm(merged);
    setErrors({ name: false, classe: false });
    setFileHint(null);
    setTypePickerOpen(false);
    setTypeMenuPos(null);
    setLinkFlash(flashClasse);
    setPhotoLightboxIndex(null);
    setBrandSuggestOpen(false);
  }, [open, initialMachine, formPrefill]);

  useEffect(() => {
    if (photoLightboxIndex === null) return;
    if (galleryPhotos.length === 0) {
      setPhotoLightboxIndex(null);
      return;
    }
    if (photoLightboxIndex >= galleryPhotos.length) {
      setPhotoLightboxIndex(galleryPhotos.length - 1);
    }
  }, [galleryPhotos.length, photoLightboxIndex]);

  useEffect(() => {
    if (photoLightboxIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      const n = galleryPhotos.length;
      if (n <= 0) return;
      if (e.key === 'Escape') {
        setPhotoLightboxIndex(null);
        return;
      }
      if (e.key === 'ArrowLeft') {
        setPhotoLightboxIndex(i => (i === null ? i : (i - 1 + n) % n));
      }
      if (e.key === 'ArrowRight') {
        setPhotoLightboxIndex(i => (i === null ? i : (i + 1) % n));
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [photoLightboxIndex, galleryPhotos.length]);

  if (!open) return null;

  const headerTitle =
    titleMode === 'classe'
      ? initialMachine
        ? tx(lang, {fr:'Modifier la classe',ar:'تعديل الفئة',en:'Edit class',es:'Editar clase',pt:'Editar classe',tr:'Sınıfı düzenle'})
        : tx(lang, {fr:'Nouvelle classe',ar:'فئة جديدة',en:'New class',es:'Nueva clase',pt:'Nova classe',tr:'Yeni sınıf'})
      : initialMachine
        ? tx(lang, {fr:'Modifier machine',ar:'تعديل الماكينة',en:'Edit machine',es:'Editar máquina',pt:'Editar máquina',tr:'Makineyi düzenle'})
        : tx(lang, {fr:'Ajouter machine',ar:'إضافة ماكينة',en:'Add machine',es:'Añadir máquina',pt:'Adicionar máquina',tr:'Makine ekle'});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors = {
      name: !((machineForm.name || machineForm.matricule || '').trim()),
      classe: !(machineForm.classe || '').trim(),
    };
    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.classe) return;

    const photos = (machineForm.machinePhotos || []).filter(Boolean);
    const manuals = (machineForm.machineManuals || []).filter(m => m.dataUrl);

    const refTrim =
      (machineForm.name ?? machineForm.matricule ?? '').trim();
    const toSave: Machine = {
      ...(machineForm as Machine),
      id: initialMachine?.id || Date.now().toString(),
      status: machineForm.status || 'OK',
      speed: Number.isFinite(Number(machineForm.speed)) ? Number(machineForm.speed) : 2000,
      speedMajor: Number.isFinite(Number(machineForm.speedMajor)) ? Number(machineForm.speedMajor) : 1.01,
      cofs: Number.isFinite(Number(machineForm.cofs)) ? Number(machineForm.cofs) : 1.0,
      machinePhotos: photos.length ? photos : undefined,
      photoDataUrl: photos[0] || '',
      machineManuals: manuals.length ? manuals : undefined,
      manualPdfDataUrl: manuals[0]?.dataUrl || '',
      manualPdfName: manuals[0]?.name || '',
      name: refTrim,
      matricule: refTrim || undefined,
    };
    onSave(toSave, { created: !initialMachine });
    onClose();
  };

  const onPickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) {
      setFileHint(tx(lang, {fr:'Choisissez une image (JPEG, PNG, WebP…).',ar:'اختر صورة (JPEG، PNG، WebP…).',en:'Choose an image (JPEG, PNG, WebP…).',es:'Elija una imagen (JPEG, PNG, WebP…).',pt:'Escolha uma imagem (JPEG, PNG, WebP…).',tr:'Bir görsel seçin (JPEG, PNG, WebP…).'}));
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file, IMG_MAX_BYTES);
      const f = machineFormRef.current;
      const prev = (f.machinePhotos?.length ? f.machinePhotos : f.photoDataUrl ? [f.photoDataUrl] : []).filter(
        Boolean
      ) as string[];
      if (prev.length >= MAX_PHOTOS) {
        setFileHint(tx(lang, {fr:`Maximum ${MAX_PHOTOS} photos par machine (stockage local).`,ar:`الحد الأقصى ${MAX_PHOTOS} صورة لكل ماكينة (تخزين محلي).`,en:`Maximum ${MAX_PHOTOS} photos per machine (local storage).`,es:`Máximo ${MAX_PHOTOS} fotos por máquina (almacenamiento local).`,pt:`Máximo ${MAX_PHOTOS} fotos por máquina (armazenamento local).`,tr:`Makine başına maksimum ${MAX_PHOTOS} fotoğraf (yerel depolama).`}));
        return;
      }
      const next = [...prev, dataUrl];
      setMachineForm({ ...f, machinePhotos: next, photoDataUrl: next[0] || '' });
      setFileHint(null);
    } catch {
      setFileHint(tx(lang, {fr:`Image trop volumineuse (max ~${formatMo(IMG_MAX_BYTES)} Mo).`,ar:`الصورة كبيرة جداً (الحد الأقصى ~${formatMo(IMG_MAX_BYTES)} MB).`,en:`Image too large (max ~${formatMo(IMG_MAX_BYTES)} MB).`,es:`Imagen demasiado grande (máx. ~${formatMo(IMG_MAX_BYTES)} MB).`,pt:`Imagem muito grande (máx. ~${formatMo(IMG_MAX_BYTES)} MB).`,tr:`Görsel çok büyük (maks. ~${formatMo(IMG_MAX_BYTES)} MB).`}));
    }
  };

  const onPickManual = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || file.type !== 'application/pdf') {
      setFileHint(tx(lang, {fr:'Choisissez un fichier PDF.',ar:'اختر ملف PDF.',en:'Choose a PDF file.',es:'Elija un archivo PDF.',pt:'Escolha um ficheiro PDF.',tr:'Bir PDF dosyası seçin.'}));
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file, PDF_MAX_BYTES);
      const f = machineFormRef.current;
      const prev = (f.machineManuals?.length ? f.machineManuals : f.manualPdfDataUrl
        ? [{ dataUrl: f.manualPdfDataUrl, name: f.manualPdfName || 'manuel.pdf' }]
        : []) as MachinePdfAttachment[];
      if (prev.length >= MAX_PDFS) {
        setFileHint(tx(lang, {fr:`Maximum ${MAX_PDFS} PDF par machine (stockage local).`,ar:`الحد الأقصى ${MAX_PDFS} PDF لكل ماكينة (تخزين محلي).`,en:`Maximum ${MAX_PDFS} PDF per machine (local storage).`,es:`Máximo ${MAX_PDFS} PDF por máquina (almacenamiento local).`,pt:`Máximo ${MAX_PDFS} PDF por máquina (armazenamento local).`,tr:`Makine başına maksimum ${MAX_PDFS} PDF (yerel depolama).`}));
        return;
      }
      const row: MachinePdfAttachment = { dataUrl, name: file.name || 'document.pdf' };
      const next = [...prev, row];
      setMachineForm({
        ...f,
        machineManuals: next,
        manualPdfDataUrl: next[0]?.dataUrl || '',
        manualPdfName: next[0]?.name || '',
      });
      setFileHint(null);
    } catch (err) {
      setFileHint(
        err instanceof Error && err.message === 'FILE_TOO_LARGE'
          ? tx(lang, {fr:`PDF trop volumineux (max ~${formatMo(PDF_MAX_BYTES)} Mo). Compressez le fichier si besoin.`,ar:`PDF كبير جداً (الحد الأقصى ~${formatMo(PDF_MAX_BYTES)} MB). قم بضغط الملف إذا لزم الأمر.`,en:`PDF too large (max ~${formatMo(PDF_MAX_BYTES)} MB). Compress the file if needed.`,es:`PDF demasiado grande (máx. ~${formatMo(PDF_MAX_BYTES)} MB). Comprima el archivo si es necesario.`,pt:`PDF muito grande (máx. ~${formatMo(PDF_MAX_BYTES)} MB). Comprima o ficheiro se necessário.`,tr:`PDF çok büyük (maks. ~${formatMo(PDF_MAX_BYTES)} MB). Gerekirse dosyayı sıkıştırın.`})
          : tx(lang, {fr:'Lecture du fichier impossible.',ar:'تعذر قراءة الملف.',en:'Could not read the file.',es:'No se pudo leer el archivo.',pt:'Não foi possível ler o ficheiro.',tr:'Dosya okunamadı.'})
      );
    }
  };

  const removePhotoAt = (index: number) => {
    setMachineForm(f => {
      const prev = (f.machinePhotos?.length ? f.machinePhotos : f.photoDataUrl ? [f.photoDataUrl] : []).filter(
        Boolean
      ) as string[];
      const next = prev.filter((_, j) => j !== index);
      return { ...f, machinePhotos: next, photoDataUrl: next[0] || '' };
    });
    setPhotoLightboxIndex(cur => {
      if (cur === null) return cur;
      if (cur === index) return null;
      if (cur > index) return cur - 1;
      return cur;
    });
  };

  const setPhotoAsThumbnail = (index: number) => {
    if (index <= 0) return;
    setMachineForm(f => {
      const prev = (f.machinePhotos?.length ? f.machinePhotos : f.photoDataUrl ? [f.photoDataUrl] : []).filter(
        Boolean
      ) as string[];
      if (index >= prev.length) return f;
      const next = [...prev];
      const [picked] = next.splice(index, 1);
      next.unshift(picked);
      return { ...f, machinePhotos: next, photoDataUrl: next[0] || '' };
    });
    setPhotoLightboxIndex(0);
  };

  const removeManualAt = (index: number) => {
    setMachineForm(f => {
      const prev = (f.machineManuals?.length ? f.machineManuals : f.manualPdfDataUrl
        ? [{ dataUrl: f.manualPdfDataUrl, name: f.manualPdfName || 'manuel.pdf' }]
        : []) as MachinePdfAttachment[];
      const next = prev.filter((_, j) => j !== index);
      return {
        ...f,
        machineManuals: next,
        manualPdfDataUrl: next[0]?.dataUrl || '',
        manualPdfName: next[0]?.name || '',
      };
    });
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/45 backdrop-blur-md" onClick={onClose} />
      <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-2xl dark:shadow-dk-lg w-full max-w-lg relative overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-slate-200/70 dark:border-dk-border/70 max-h-[90vh] flex flex-col">
        <div className="bg-slate-50 dark:bg-dk-bg px-6 py-4 border-b border-slate-100 dark:border-dk-border flex items-center justify-between shrink-0">
          <h3 className="font-bold text-slate-800 dark:text-dk-text flex items-center gap-2">
            {initialMachine ? <Edit2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> : <Plus className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
            {headerTitle}
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 dark:text-dk-text-muted hover:text-slate-600 p-1 hover:bg-slate-200 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">
          <form onSubmit={submit} className="space-y-5">
            <div className="rounded-xl border border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/80 p-4 space-y-3">
              <p className="text-[10px] font-black text-slate-500 dark:text-dk-text-muted uppercase tracking-wider">{tx(lang, {fr:'Identification',ar:'التعريف',en:'Identification',es:'Identificación',pt:'Identificação',tr:'Kimlik'})}</p>
              <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-dk-text-muted uppercase mb-1.5">
                    {tx(lang, {fr:'Référence / matricule',ar:'المرجع / الرقم التسلسلي',en:'Reference / serial number',es:'Referencia / matrícula',pt:'Referência / número de série',tr:'Referans / seri numarası'})} · رقم التعريف
                  </label>
                <input
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={(machineForm.name ?? machineForm.matricule) || ''}
                  onChange={e => {
                    const v = e.target.value;
                    setMachineForm({ ...machineForm, name: v, matricule: v });
                    if (errors.name) setErrors(prev => ({ ...prev, name: false }));
                  }}
                  placeholder={tx(lang, {fr:"Poste, ligne, n° série ou plaque — visible dans le parc et l'inventaire",ar:"المنصب، الخط، الرقم التسلسلي أو اللوحة — ظاهر في المخزون",en:"Station, line, serial or plate number — visible in inventory",es:"Puesto, línea, nº serie o placa — visible en el inventario",pt:"Posto, linha, nº série ou placa — visível no inventário",tr:"İstasyon, hat, seri veya plaka numarası — envanterde görünür"})}
                  className={`w-full rounded-xl px-3 py-2.5 text-slate-700 dark:text-dk-text outline-none transition-all placeholder:text-slate-400 font-mono text-sm ${
                    errors.name ? 'bg-rose-50 dark:bg-rose-900/30 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-700 focus:border-rose-500' : 'bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border focus:border-emerald-500 dark:focus:border-emerald-400'
                  }`}
                />
              </div>
              <div ref={brandSuggestWrapRef} className="relative min-w-0">
                  <label className="block text-xs font-semibold text-slate-500 dark:text-dk-text-muted uppercase mb-1.5">{tx(lang, {fr:'Marque',ar:'العلامة التجارية',en:'Brand',es:'Marca',pt:'Marca',tr:'Marka'})}</label>
                  <input
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={machineForm.brand || ''}
                    onChange={e => {
                      setMachineForm({ ...machineForm, brand: e.target.value });
                      setBrandSuggestOpen(true);
                    }}
                    onFocus={() => setBrandSuggestOpen(true)}
                    onKeyDown={e => {
                      if (e.key === 'Escape') setBrandSuggestOpen(false);
                    }}
                    className="w-full rounded-xl px-3 py-2.5 text-slate-700 dark:text-dk-text outline-none bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border focus:border-emerald-500 dark:focus:border-emerald-400 text-sm"
                    placeholder="ex: Brother, Juki…"
                    aria-expanded={brandSuggestOpen}
                    aria-controls="machine-editor-brand-suggest-list"
                    aria-autocomplete="list"
                  />
                  {brandSuggestOpen && brandComboFiltered.length > 0 && (
                    <ul
                      id="machine-editor-brand-suggest-list"
                      role="listbox"
                      className="mt-1 max-h-44 overflow-y-auto rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface py-1 shadow-md dark:shadow-dk-md z-20"
                    >
                      {brandComboFiltered.map(b => (
                        <li key={b} role="presentation">
                          <button
                            type="button"
                            role="option"
                            className="w-full px-3 py-2 text-left text-sm font-semibold text-slate-800 dark:text-dk-text hover:bg-emerald-50 active:bg-emerald-100/80 transition-colors"
                            onMouseDown={e => {
                              e.preventDefault();
                              setMachineForm(prev => ({ ...prev, brand: b }));
                              setBrandSuggestOpen(false);
                            }}
                          >
                            {b}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-dk-text-muted uppercase mb-1.5">{tx(lang, {fr:'Type (famille)',ar:'النوع (العائلة)',en:'Type (family)',es:'Tipo (familia)',pt:'Tipo (família)',tr:'Tip (aile)'})}</label>
                  <div
                    ref={typeAnchorRef}
                    className={`flex rounded-xl border bg-white dark:bg-dk-surface transition-[box-shadow,border-color] ${
                      typePickerOpen
                        ? 'border-emerald-500 ring-2 ring-emerald-500/25 shadow-sm dark:shadow-dk-sm'
                        : 'border-slate-200 dark:border-dk-border focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20'
                    }`}
                  >
                    <input
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      value={machineForm.machineCategory || ''}
                      onChange={e => setMachineForm({ ...machineForm, machineCategory: e.target.value })}
                      onBlur={() => {
                        const f = machineFormRef.current;
                        const cat = (f.machineCategory || '').trim();
                        const c = (f.classe || '').trim();
                        const sug = suggestClasseFromFamilyInput(cat);
                        if (sug && !c) {
                          setMachineForm(prev => ({ ...prev, classe: sug }));
                          setLinkFlash('classe');
                          setErrors(prev => ({ ...prev, classe: false }));
                        }
                      }}
                      className="min-w-0 flex-1 rounded-l-xl border-0 bg-transparent px-3 py-2.5 text-sm text-slate-700 dark:text-dk-text outline-none ring-0 placeholder:text-slate-400"
                      placeholder={tx(lang, {fr:'Saisie libre ou liste…',ar:'إدخال حر أو قائمة…',en:'Free input or list…',es:'Entrada libre o lista…',pt:'Entrada livre ou lista…',tr:'Serbest giriş veya liste…'})}
                    />
                    <button
                      type="button"
                      aria-expanded={typePickerOpen}
                      aria-haspopup="listbox"
                      title={tx(lang, {fr:'Ouvrir la liste des familles',ar:'فتح قائمة العائلات',en:'Open the family list',es:'Abrir la lista de familias',pt:'Abrir a lista de famílias',tr:'Aile listesini aç'})}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => setTypePickerOpen(o => !o)}
                      className="flex shrink-0 items-center justify-center border-l border-slate-100 dark:border-dk-border px-2.5 text-slate-500 dark:text-dk-text-muted hover:bg-slate-50 dark:hover:bg-dk-hover hover:text-slate-800 rounded-r-xl transition-colors"
                    >
                      <motion.span animate={{ rotate: typePickerOpen ? 180 : 0 }} transition={{ type: 'spring', stiffness: 320, damping: 22 }}>
                        <ChevronDown className="h-4 w-4" />
                      </motion.span>
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-dk-text-muted uppercase mb-1.5">{tx(lang, {fr:'Classe (code planning)',ar:'الفئة (رمز التخطيط)',en:'Class (planning code)',es:'Clase (código de planificación)',pt:'Classe (código de planeamento)',tr:'Sınıf (planlama kodu)'})}</label>
                  <motion.div
                    animate={
                      linkFlash === 'classe'
                        ? {
                            boxShadow: [
                              '0 0 0 0 rgba(16,185,129,0)',
                              '0 0 0 3px rgba(16,185,129,0.4)',
                              '0 0 0 0 rgba(16,185,129,0)',
                            ],
                          }
                        : { boxShadow: '0 0 0 0 rgba(0,0,0,0)' }
                    }
                    transition={{ duration: 0.78 }}
                    className="rounded-xl"
                  >
                    <input
                      type="text"
                      list="machine-editor-classe-suggestions"
                      value={machineForm.classe}
                      onChange={e => {
                        setMachineForm({ ...machineForm, classe: e.target.value });
                        if (errors.classe) setErrors(prev => ({ ...prev, classe: false }));
                      }}
                      onBlur={() => {
                        const f = machineFormRef.current;
                        const c = (f.classe || '').trim();
                        const cat = (f.machineCategory || '').trim();
                        const sug = suggestFamilyFromClasseInput(c);
                        if (sug && !cat) {
                          setMachineForm(prev => ({ ...prev, machineCategory: sug }));
                          setLinkFlash('type');
                        }
                      }}
                      className={`w-full rounded-xl px-3 py-2.5 text-slate-700 dark:text-dk-text outline-none transition-all ${
                        errors.classe
                          ? 'bg-rose-50 dark:bg-rose-900/30 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-700 focus:border-rose-500'
                          : 'bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border focus:border-emerald-500 dark:focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/25 dark:focus:ring-emerald-400/25'
                      }`}
                      placeholder="301, 504, BR…"
                    />
                  </motion.div>
                  <datalist id="machine-editor-classe-suggestions">
                    {classeDatalistOptions.map(code => (
                      <option key={code} value={code} />
                    ))}
                  </datalist>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-100 dark:border-dk-border bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20/30 p-4 space-y-3">
              <p className="text-[10px] font-black text-indigo-700 dark:text-dk-accent-text uppercase tracking-wider">{tx(lang, {fr:'Achat',ar:'شراء',en:'Purchase',es:'Compra',pt:'Compra',tr:'Satın alma'})}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-dk-text-muted uppercase mb-1.5">{tx(lang, {fr:"Date d'achat",ar:'تاريخ الشراء',en:'Purchase date',es:'Fecha de compra',pt:'Data de compra',tr:'Satın alma tarihi'})}</label>
                  <input
                    type="date"
                    value={machineForm.purchaseDate || ''}
                    onChange={e => setMachineForm({ ...machineForm, purchaseDate: e.target.value })}
                    className="w-full rounded-xl px-3 py-2.5 text-slate-700 dark:text-dk-text bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border focus:border-emerald-500 dark:focus:border-emerald-400 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-dk-text-muted uppercase mb-1.5">État à l&apos;achat</label>
                  <select
                    value={machineForm.purchaseCondition || 'NEW'}
                    onChange={e =>
                      setMachineForm({
                        ...machineForm,
                        purchaseCondition: e.target.value as Machine['purchaseCondition'],
                      })
                    }
                    className="w-full rounded-xl px-3 py-2.5 text-slate-700 dark:text-dk-text bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border focus:border-emerald-500 dark:focus:border-emerald-400 text-sm font-bold"
                  >
                    <option value="NEW">Neuve</option>
                    <option value="USED">Occasion</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-100 dark:border-dk-border bg-white dark:bg-dk-surface p-4 space-y-3">
              <p className="text-[10px] font-black text-slate-500 dark:text-dk-text-muted uppercase tracking-wider">Documents</p>
              <p className="text-[10px] text-slate-500 dark:text-dk-text-muted leading-snug">
                Photos et PDF sont enregistrés sur la fiche machine (identifiant + référence). La{' '}
                <span className="font-bold text-slate-700 dark:text-dk-text">1re photo</span> sert de vignette dans l&apos;inventaire — vous
                pouvez la changer avec l&apos;étoile. Cliquez une vignette pour l&apos;agrandir (galerie). PDF / images :{' '}
                <span className="font-bold text-slate-700 dark:text-dk-text">max ~{formatMo(IMG_MAX_BYTES)} Mo</span> chacun (stockage local).
              </p>
              <div className="flex flex-wrap gap-3">
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg cursor-pointer hover:bg-slate-100 dark:hover:bg-dk-hover text-sm font-bold text-slate-700 dark:text-dk-text">
                  <ImageIcon className="w-4 h-4 text-indigo-500" />
                  {tx(lang, {fr:'Ajouter une photo',ar:'إضافة صورة',en:'Add a photo',es:'Añadir una foto',pt:'Adicionar foto',tr:'Fotoğraf ekle'})}
                  <input type="file" accept="image/*" className="hidden" onChange={onPickPhoto} />
                </label>
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg cursor-pointer hover:bg-slate-100 dark:hover:bg-dk-hover text-sm font-bold text-slate-700 dark:text-dk-text">
                  <FileText className="w-4 h-4 text-indigo-500" />
                  {tx(lang, {fr:'Ajouter un PDF',ar:'إضافة PDF',en:'Add a PDF',es:'Añadir un PDF',pt:'Adicionar PDF',tr:'PDF ekle'})}
                  <input type="file" accept="application/pdf" className="hidden" onChange={onPickManual} />
                </label>
              </div>
              {galleryPhotos.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 dark:text-dk-text-muted uppercase">
                    Photos ({galleryPhotos.length}/{MAX_PHOTOS})
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {galleryPhotos.map((src, i) => (
                      <div key={`${i}-${src.slice(0, 32)}`} className="flex w-[5.5rem] flex-col gap-1">
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setPhotoLightboxIndex(i)}
                            className="block rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                            title="Agrandir (galerie)"
                          >
                            <img
                              src={src}
                              alt=""
                              className="h-20 w-20 cursor-zoom-in rounded-lg border border-slate-200 dark:border-dk-border object-cover"
                            />
                          </button>
                          {i === 0 && (
                            <span className="absolute bottom-1 left-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-black text-white shadow">
                              Vignette
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => removePhotoAt(i)}
                            className="absolute -right-1 -top-1 rounded-full bg-rose-600 p-1 text-white shadow opacity-90 hover:opacity-100"
                            aria-label="Retirer la photo"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="flex justify-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              downloadFromDataUrl(src, `photo-machine-${i + 1}.${extensionFromDataUrl(src, 'png')}`)
                            }
                            className="rounded-md border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface p-1 text-slate-600 dark:text-dk-text-secondary hover:bg-slate-50 dark:hover:bg-dk-hover"
                            title={tx(lang, {fr:'Télécharger',ar:'تحميل',en:'Download',es:'Descargar',pt:'Descarregar',tr:'İndir'})}
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden />
                          </button>
                          {i !== 0 ? (
                            <button
                              type="button"
                              onClick={() => setPhotoAsThumbnail(i)}
                              className="rounded-md border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface p-1 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:bg-amber-950/30 dark:hover:bg-dk-hover"
                              title={tx(lang, {fr:'Définir comme vignette',ar:'تعيين كصورة مصغرة',en:'Set as thumbnail',es:'Establecer como miniatura',pt:'Definir como miniatura',tr:'Küçük resim olarak ayarla'})}
                            >
                              <Star className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {galleryManuals.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 dark:text-dk-text-muted uppercase">
                    PDF ({galleryManuals.length}/{MAX_PDFS})
                  </p>
                  <ul className="space-y-2">
                    {galleryManuals.map((doc, i) => (
                      <li
                        key={`${i}-${doc.name}`}
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-bg px-3 py-2"
                      >
                        <a href={doc.dataUrl} target="_blank" rel="noreferrer" className="text-sm font-bold text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text truncate flex-1 min-w-0">
                          {doc.name}
                        </a>
                        <button
                          type="button"
                          onClick={() => downloadFromDataUrl(doc.dataUrl, doc.name.endsWith('.pdf') ? doc.name : `${doc.name}.pdf`)}
                          className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface px-2 py-1 text-[11px] font-bold text-slate-700 dark:text-dk-text hover:bg-slate-100 dark:hover:bg-dk-hover"
                          title={tx(lang, {fr:'Télécharger le PDF',ar:'تحميل PDF',en:'Download PDF',es:'Descargar PDF',pt:'Descarregar PDF',tr:'PDF İndir'})}
                        >
                          <Download className="h-3.5 w-3.5 text-indigo-500" aria-hidden />
                          {tx(lang, {fr:'Télécharger',ar:'تحميل',en:'Download',es:'Descargar',pt:'Descarregar',tr:'İndir'})}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeManualAt(i)}
                          className="text-xs font-bold text-rose-600 dark:text-rose-400 shrink-0"
                        >
                          Retirer
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {fileHint && <p className="text-xs font-semibold text-amber-700 bg-amber-50 dark:bg-amber-900/30 dark:bg-amber-950/30 border border-amber-100 rounded-lg px-3 py-2">{fileHint}</p>}
            </div>

            {(errors.name || errors.classe) && (
              <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 dark:bg-rose-950/30 border border-rose-100 rounded-lg px-3 py-2">
                Remplissez la référence et la classe (code planning).
              </p>
            )}
            <button type="submit" className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 shadow-lg dark:shadow-dk-lg shadow-emerald-200 transition-all">
              {tx(lang, {fr:'Enregistrer',ar:'حفظ',en:'Save',es:'Guardar',pt:'Salvar',tr:'Kaydet'})}
            </button>
          </form>
        </div>
      </div>
    </div>
    <AnimatePresence>
      {typePickerOpen && typeMenuPos && (
        <motion.ul
          key="machine-editor-type-menu"
          ref={typeMenuRef}
          role="listbox"
          aria-label="Familles de machines"
          className="max-h-52 overflow-y-auto rounded-xl border border-slate-200/90 dark:border-dk-border/90 bg-white/95 dark:bg-dk-surface/95 py-1.5 shadow-2xl dark:shadow-dk-lg shadow-slate-900/20 dark:shadow-black/30 backdrop-blur-md ring-1 ring-slate-200/60 dark:ring-dk-border/60"
          style={{ position: 'fixed', zIndex: 1100, top: typeMenuPos.top, left: typeMenuPos.left, width: typeMenuPos.width }}
          initial={{ opacity: 0, y: -8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.14 } }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        >
          {typeComboFiltered.length === 0 ? (
            <li className="list-none px-3 py-2 text-xs text-slate-400 dark:text-dk-text-muted">Aucune correspondance — la saisie libre reste possible.</li>
          ) : (
            typeComboFiltered.map((opt, i) => {
              const linked = suggestClasseFromFamilyInput(opt);
              return (
                <motion.li
                  key={opt}
                  className="list-none"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.022, 0.28), type: 'spring', stiffness: 380, damping: 26 }}
                >
                  <button
                    type="button"
                    role="option"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-slate-700 dark:text-dk-text transition-colors hover:bg-emerald-50/80 active:bg-emerald-100/80"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => commitTypeFamily(opt)}
                  >
                    <span className="truncate font-medium">{opt}</span>
                    {linked ? (
                      <span className="shrink-0 rounded-md bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200/80">
                        → {linked}
                      </span>
                    ) : null}
                  </button>
                </motion.li>
              );
            })
          )}
        </motion.ul>
      )}
    </AnimatePresence>
    {photoLightboxIndex !== null && galleryPhotos[photoLightboxIndex] ? (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tx(lang, {fr:'Aperçu photo',ar:'معاينة الصورة',en:'Photo preview',es:'Vista previa de foto',pt:'Pré-visualização da foto',tr:'Foto önizleme'})}
        className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/85 p-4"
        onClick={() => setPhotoLightboxIndex(null)}
      >
        <div className="pointer-events-none absolute left-4 top-4 flex flex-wrap gap-2 md:left-6 md:top-6">
          <span className="pointer-events-auto rounded-full bg-black/55 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm">
            {photoLightboxIndex + 1} / {galleryPhotos.length}
          </span>
        </div>
        <div className="pointer-events-none absolute right-4 top-4 flex gap-2 md:right-6 md:top-6">
          <button
            type="button"
            className="pointer-events-auto flex items-center gap-2 rounded-full bg-white dark:bg-dk-surface px-3 py-2 text-xs font-bold text-slate-800 dark:text-dk-text shadow-lg dark:shadow-dk-lg hover:bg-slate-50 dark:hover:bg-dk-hover"
            onClick={e => {
              e.stopPropagation();
              const src = galleryPhotos[photoLightboxIndex];
              downloadFromDataUrl(
                src,
                `photo-machine-${photoLightboxIndex + 1}.${extensionFromDataUrl(src, 'png')}`
              );
            }}
          >
            <Download className="h-4 w-4 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text" aria-hidden />
            {tx(lang, {fr:'Télécharger',ar:'تحميل',en:'Download',es:'Descargar',pt:'Descarregar',tr:'İndir'})}
          </button>
          <button
            type="button"
            className="pointer-events-auto rounded-full bg-white/15 dark:bg-dk-surface/15 p-2 text-white hover:bg-white/25"
            onClick={e => {
              e.stopPropagation();
              setPhotoLightboxIndex(null);
            }}
            aria-label={tx(lang, {fr:'Fermer la galerie',ar:'إغلاق المعرض',en:'Close gallery',es:'Cerrar galería',pt:'Fechar galeria',tr:'Galeriyi kapat'})}
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        {galleryPhotos.length > 1 ? (
          <>
            <button
              type="button"
              className="absolute left-1 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/15 dark:bg-dk-surface/15 p-2 text-white hover:bg-white/25 md:left-4"
              aria-label={tx(lang, {fr:'Photo précédente',ar:'الصورة السابقة',en:'Previous photo',es:'Foto anterior',pt:'Foto anterior',tr:'Önceki fotoğraf'})}
              onClick={e => {
                e.stopPropagation();
                const n = galleryPhotos.length;
                setPhotoLightboxIndex(i => (i === null ? i : (i - 1 + n) % n));
              }}
            >
              <ChevronLeft className="h-8 w-8 md:h-10 md:w-10" />
            </button>
            <button
              type="button"
              className="absolute right-1 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/15 dark:bg-dk-surface/15 p-2 text-white hover:bg-white/25 md:right-4"
              aria-label="Photo suivante"
              onClick={e => {
                e.stopPropagation();
                const n = galleryPhotos.length;
                setPhotoLightboxIndex(i => (i === null ? i : (i + 1) % n));
              }}
            >
              <ChevronRight className="h-8 w-8 md:h-10 md:w-10" />
            </button>
          </>
        ) : null}
        <div
          role="presentation"
          className="flex max-h-[88vh] max-w-full items-center justify-center"
          onClick={e => e.stopPropagation()}
        >
          <img
            src={galleryPhotos[photoLightboxIndex]}
            alt=""
            className="max-h-[88vh] max-w-full rounded-lg object-contain shadow-2xl dark:shadow-dk-lg"
          />
        </div>
        <p className="pointer-events-none absolute bottom-4 left-1/2 max-w-[90vw] -translate-x-1/2 rounded-full bg-black/45 px-3 py-1 text-center text-[11px] font-semibold text-white/95 backdrop-blur-sm">
          Échap pour fermer · ← → pour naviguer
        </p>
      </div>
    ) : null}
    </>,
    document.body
  );
}
