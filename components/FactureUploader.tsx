import React, { useState, useEffect, useRef } from 'react';
import { FileText, Upload, Trash2, X, Receipt, Loader2, Camera } from 'lucide-react';
import { addFacture, listFactures, getFactureBlob, deleteFacture, FactureMeta } from '../lib/factureStore';
import { useLang } from '../src/context/LanguageContext';
import { tx } from '../lib/i18n';

interface FactureUploaderProps {
    modelId?: string;
    materialName: string;
    label?: string;
}

function compressImage(file: File): Promise<Blob | File> {
    return new Promise((resolve) => {
        if (!file.type.startsWith('image/')) {
            resolve(file);
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                const MAX_DIM = 1200;
                if (width > MAX_DIM || height > MAX_DIM) {
                    if (width > height) {
                        height = Math.round((height * MAX_DIM) / width);
                        width = MAX_DIM;
                    } else {
                        width = Math.round((width * MAX_DIM) / height);
                        height = MAX_DIM;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    resolve(file);
                    return;
                }

                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            resolve(file);
                        }
                    },
                    'image/jpeg',
                    0.6
                );
            };
            img.onerror = () => resolve(file);
            img.src = event.target?.result as string;
        };
        reader.onerror = () => resolve(file);
        reader.readAsDataURL(file);
    });
}

const FactureUploader: React.FC<FactureUploaderProps> = ({ modelId, materialName, label = '' }) => {
    const { lang } = useLang();
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState<FactureMeta[]>([]);
    const [urls, setUrls] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const cameraRef = useRef<HTMLInputElement>(null);
    const urlsRef = useRef<Record<string, string>>({});

    const btnLabel = label || tx(lang, {fr:'Facture', ar:'فاتورة', en:'Invoice', es:'Factura', pt:'Fatura', tr:'Fatura'});

    const revokeAll = () => {
        Object.values(urlsRef.current).forEach(u => { try { URL.revokeObjectURL(u); } catch { /* ignore */ } });
        urlsRef.current = {};
    };

    const load = async () => {
        if (!modelId) return;
        setLoading(true);
        try {
            const metas = await listFactures(modelId, materialName);
            revokeAll();
            const map: Record<string, string> = {};
            for (const m of metas) {
                const blob = await getFactureBlob(m.id);
                if (blob) map[m.id] = URL.createObjectURL(blob);
            }
            urlsRef.current = map;
            setUrls(map);
            setItems(metas);
        } catch { /* ignore */ } finally { setLoading(false); }
    };

    useEffect(() => { if (open) load(); return () => { if (!open) revokeAll(); }; /* eslint-disable-next-line */ }, [open, modelId, materialName]);
    useEffect(() => () => revokeAll(), []);

    const handleFiles = async (files: FileList | null) => {
        if (!files || files.length === 0 || !modelId) return;
        setUploading(true);
        for (const file of Array.from(files)) {
            try {
                let fileToSave: Blob | File = file;
                let fileName = file.name;

                if (file.type.startsWith('image/')) {
                    fileToSave = await compressImage(file);
                    if (!fileName.toLowerCase().endsWith('.jpg') && !fileName.toLowerCase().endsWith('.jpeg')) {
                        fileName = fileName.includes('.')
                            ? `${fileName.slice(0, fileName.lastIndexOf('.'))}.jpg`
                            : `${fileName}.jpg`;
                    }
                }

                await addFacture({
                    id: `INV-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
                    modelId,
                    materialName,
                    fileName,
                    mimeType: fileToSave.type || 'image/jpeg',
                    blob: fileToSave,
                });
            } catch { /* ignore single file failure */ }
        }
        setUploading(false);
        if (fileRef.current) fileRef.current.value = '';
        if (cameraRef.current) cameraRef.current.value = '';
        load();
    };

    const del = async (id: string) => {
        await deleteFacture(id).catch(() => {});
        if (urlsRef.current[id]) { try { URL.revokeObjectURL(urlsRef.current[id]); } catch { /* ignore */ } delete urlsRef.current[id]; }
        setItems(prev => prev.filter(i => i.id !== id));
    };

    return (
        <>
            <button
                onClick={(e) => { e.stopPropagation(); setOpen(true); }}
                disabled={!modelId}
                className="inline-flex items-center gap-1 h-6 px-2 text-[10px] font-semibold text-slate-600 dark:text-dk-text-soft border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface hover:bg-slate-50 dark:hover:bg-dk-elevated/60 rounded-md transition-colors disabled:opacity-40 whitespace-nowrap"
                title={modelId ? tx(lang, {fr:'Factures de cette matière', ar:'فواتير هذه المادة', en:'Invoices for this material', es:'Facturas de este material', pt:'Faturas deste material', tr:'Bu malzemenin faturaları'}) : tx(lang, {fr:'Enregistrez le modèle pour gérer les factures', ar:'احفظ النموذج لإدارة الفواتير', en:'Save the model to manage invoices', es:'Guarde el modelo para gestionar facturas', pt:'Salve o modelo para gerenciar faturas', tr:'Faturaları yönetmek için modeli kaydedin'})}
            >
                <Receipt className="w-3 h-3" /> {btnLabel}
            </button>

            {open && (
                <div className="fixed inset-0 z-[210] flex items-center justify-center p-2 sm:p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200" dir="ltr" onClick={() => setOpen(false)}>
                    <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-100 dark:border-dk-border w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
                        <div className="px-4 sm:px-5 h-12 border-b border-slate-100 dark:border-dk-border flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-2 min-w-0">
                                <Receipt className="w-4 h-4 text-slate-400 dark:text-dk-muted shrink-0" strokeWidth={1.75} />
                                <div className="min-w-0">
                                    <h3 className="text-[13px] font-semibold text-slate-900 dark:text-dk-text tracking-tight">{tx(lang, {fr:'Factures', ar:'الفواتير', en:'Invoices', es:'Facturas', pt:'Faturas', tr:'Faturalar'})}</h3>
                                    <p className="text-[11px] text-slate-400 dark:text-dk-muted truncate">{materialName}</p>
                                </div>
                            </div>
                            <button onClick={() => setOpen(false)} className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0">
                                <X className="w-4 h-4" strokeWidth={1.75} />
                            </button>
                        </div>

                        <div className="p-3 sm:p-5 overflow-y-auto">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                                <button
                                    onClick={() => fileRef.current?.click()}
                                    disabled={uploading}
                                    className="flex flex-col items-center justify-center gap-1.5 py-4 rounded-lg border border-dashed border-slate-300 bg-zinc-50/80 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 hover:border-slate-400 transition-colors text-slate-500 dark:text-dk-muted disabled:opacity-60"
                                >
                                    {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" strokeWidth={1.75} />}
                                    <span className="text-[12px] font-medium">{uploading ? tx(lang, {fr:'Enregistrement…', ar:'جارٍ الحفظ…', en:'Saving…', es:'Guardando…', pt:'Salvando…', tr:'Kaydediliyor…'}) : tx(lang, {fr:'Importer image / PDF', ar:'استيراد صورة / PDF', en:'Import image / PDF', es:'Importar imagen / PDF', pt:'Importar imagem / PDF', tr:'Resim / PDF içe aktar'})}</span>
                                    <span className="text-[10px] text-slate-400 dark:text-dk-muted">{tx(lang, {fr:'Fichier local', ar:'ملف محلي', en:'Local file', es:'Archivo local', pt:'Arquivo local', tr:'Yerel dosya'})}</span>
                                </button>

                                <button
                                    onClick={() => cameraRef.current?.click()}
                                    disabled={uploading}
                                    className="flex flex-col items-center justify-center gap-1.5 py-4 rounded-lg border border-dashed border-emerald-300 bg-emerald-50/20 hover:bg-emerald-50/40 hover:border-emerald-400 transition-colors text-emerald-700 disabled:opacity-60"
                                >
                                    {uploading ? <Loader2 className="w-5 h-5 animate-spin animate-spin-slow" /> : <Camera className="w-5 h-5" strokeWidth={1.75} />}
                                    <span className="text-[12px] font-medium">{uploading ? tx(lang, {fr:'Enregistrement…', ar:'جارٍ الحفظ…', en:'Saving…', es:'Guardando…', pt:'Salvando…', tr:'Kaydediliyor…'}) : tx(lang, {fr:'Prendre une photo', ar:'التقاط صورة', en:'Take a photo', es:'Tomar una foto', pt:'Tirar uma foto', tr:'Fotoğraf çek'})}</span>
                                    <span className="text-[10px] text-emerald-600/80">{tx(lang, {fr:'Appareil photo mobile', ar:'كاميرا الجوال', en:'Mobile camera', es:'Cámara móvil', pt:'Câmera do celular', tr:'Mobil kamera'})}</span>
                                </button>
                            </div>

                            <input
                                ref={fileRef}
                                type="file"
                                accept="image/*,application/pdf"
                                multiple
                                className="hidden"
                                onChange={(e) => handleFiles(e.target.files)}
                            />

                            <input
                                ref={cameraRef}
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="hidden"
                                onChange={(e) => handleFiles(e.target.files)}
                            />

                            {loading ? (
                                <div className="py-8 flex justify-center text-slate-400 dark:text-dk-muted"><Loader2 className="w-5 h-5 animate-spin" /></div>
                            ) : items.length === 0 ? (
                                <div className="py-6 text-center text-[12px] text-slate-400 dark:text-dk-muted">{tx(lang, {fr:'Aucune facture pour cette matière.', ar:'لا توجد فواتير لهذه المادة.', en:'No invoices for this material.', es:'No hay facturas para este material.', pt:'Nenhuma fatura para este material.', tr:'Bu malzeme için fatura yok.'})}</div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {items.map(it => {
                                        const isImg = it.mimeType.startsWith('image/');
                                        const url = urls[it.id];
                                        return (
                                            <div key={it.id} className="group relative rounded-lg border border-slate-100 dark:border-dk-border overflow-hidden bg-white dark:bg-dk-surface">
                                                <a href={url} target="_blank" rel="noopener noreferrer" className="block">
                                                    {isImg && url ? (
                                                        <img src={url} alt={it.fileName} className="w-full h-24 object-cover" />
                                                    ) : (
                                                        <div className="w-full h-24 flex flex-col items-center justify-center gap-1 bg-slate-50 dark:bg-dk-bg text-slate-400 dark:text-dk-muted">
                                                            <FileText className="w-7 h-7" strokeWidth={1.5} />
                                                            <span className="text-[9px] font-medium uppercase">{isImg ? 'IMAGE' : 'PDF'}</span>
                                                        </div>
                                                    )}
                                                </a>
                                                <div className="px-2 py-1.5 flex items-center justify-between gap-1 border-t border-slate-100 dark:border-dk-border">
                                                    <span className="text-[10px] text-slate-600 dark:text-dk-text-soft truncate" title={it.fileName}>{it.fileName}</span>
                                                    <button onClick={() => del(it.id)} className="shrink-0 p-1 rounded text-slate-400 dark:text-dk-muted hover:text-rose-600 hover:bg-rose-50 transition-colors" title={tx(lang, {fr:'Supprimer', ar:'حذف', en:'Delete', es:'Eliminar', pt:'Excluir', tr:'Sil'})}>
                                                        <Trash2 className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default FactureUploader;
