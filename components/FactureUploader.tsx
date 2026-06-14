import React, { useState, useEffect, useRef } from 'react';
import { FileText, Upload, Trash2, X, Receipt, Loader2, Camera } from 'lucide-react';
import { addFacture, listFactures, getFactureBlob, deleteFacture, FactureMeta } from '../lib/factureStore';

interface FactureUploaderProps {
    modelId?: string;
    materialName: string;
    /** Libellé court pour le bouton déclencheur. */
    label?: string;
}

/**
 * Compresse une image côté client pour réduire la consommation d'espace de stockage IndexedDB.
 */
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
                
                const MAX_DIM = 1200; // Dimension maximale de 1200px
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
                    0.6 // compression à 60% de qualité
                );
            };
            img.onerror = () => resolve(file);
            img.src = event.target?.result as string;
        };
        reader.onerror = () => resolve(file);
        reader.readAsDataURL(file);
    });
}

/**
 * Bouton « Facture » par matière : galerie où l'on téléverse des factures
 * (image / PDF) et où on les consulte / supprime. Les fichiers sont stockés en
 * IndexedDB (par appareil), keyés par modelId + materialName — voir lib/factureStore.
 */
const FactureUploader: React.FC<FactureUploaderProps> = ({ modelId, materialName, label = 'Facture' }) => {
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState<FactureMeta[]>([]);
    const [urls, setUrls] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const cameraRef = useRef<HTMLInputElement>(null);
    const urlsRef = useRef<Record<string, string>>({});

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
                
                // Compression d'image si applicable
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
                className="inline-flex items-center gap-1 h-6 px-2 text-[10px] font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 rounded-md transition-colors disabled:opacity-40 whitespace-nowrap"
                title={modelId ? 'Factures de cette matière' : 'Enregistrez le modèle pour gérer les factures'}
            >
                <Receipt className="w-3 h-3" /> {label}
            </button>

            {open && (
                <div className="fixed inset-0 z-[210] flex items-center justify-center p-2 sm:p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200" dir="ltr" onClick={() => setOpen(false)}>
                    <div className="bg-white rounded-xl border border-slate-100 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="px-4 sm:px-5 h-12 border-b border-slate-100 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-2 min-w-0">
                                <Receipt className="w-4 h-4 text-slate-400 shrink-0" strokeWidth={1.75} />
                                <div className="min-w-0">
                                    <h3 className="text-[13px] font-semibold text-slate-900 tracking-tight">Factures</h3>
                                    <p className="text-[11px] text-slate-400 truncate">{materialName}</p>
                                </div>
                            </div>
                            <button onClick={() => setOpen(false)} className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0">
                                <X className="w-4 h-4" strokeWidth={1.75} />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-3 sm:p-5 overflow-y-auto">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                                <button
                                    onClick={() => fileRef.current?.click()}
                                    disabled={uploading}
                                    className="flex flex-col items-center justify-center gap-1.5 py-4 rounded-lg border border-dashed border-slate-300 bg-zinc-50/80 hover:bg-slate-50 hover:border-slate-400 transition-colors text-slate-500 disabled:opacity-60"
                                >
                                    {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" strokeWidth={1.75} />}
                                    <span className="text-[12px] font-medium">{uploading ? 'Enregistrement…' : 'Importer image / PDF'}</span>
                                    <span className="text-[10px] text-slate-400">Fichier local</span>
                                </button>
                                
                                <button
                                    onClick={() => cameraRef.current?.click()}
                                    disabled={uploading}
                                    className="flex flex-col items-center justify-center gap-1.5 py-4 rounded-lg border border-dashed border-emerald-300 bg-emerald-50/20 hover:bg-emerald-50/40 hover:border-emerald-400 transition-colors text-emerald-700 disabled:opacity-60"
                                >
                                    {uploading ? <Loader2 className="w-5 h-5 animate-spin animate-spin-slow" /> : <Camera className="w-5 h-5" strokeWidth={1.75} />}
                                    <span className="text-[12px] font-medium">{uploading ? 'Enregistrement…' : 'Prendre une photo'}</span>
                                    <span className="text-[10px] text-emerald-600/80">Appareil photo mobile</span>
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
                                <div className="py-8 flex justify-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
                            ) : items.length === 0 ? (
                                <div className="py-6 text-center text-[12px] text-slate-400">Aucune facture pour cette matière.</div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    {items.map(it => {
                                        const isImg = it.mimeType.startsWith('image/');
                                        const url = urls[it.id];
                                        return (
                                            <div key={it.id} className="group relative rounded-lg border border-slate-100 overflow-hidden bg-white">
                                                <a href={url} target="_blank" rel="noopener noreferrer" className="block">
                                                    {isImg && url ? (
                                                        <img src={url} alt={it.fileName} className="w-full h-24 object-cover" />
                                                    ) : (
                                                        <div className="w-full h-24 flex flex-col items-center justify-center gap-1 bg-slate-50 text-slate-400">
                                                            <FileText className="w-7 h-7" strokeWidth={1.5} />
                                                            <span className="text-[9px] font-medium uppercase">{isImg ? 'IMAGE' : 'PDF'}</span>
                                                        </div>
                                                    )}
                                                </a>
                                                <div className="px-2 py-1.5 flex items-center justify-between gap-1 border-t border-slate-100">
                                                    <span className="text-[10px] text-slate-600 truncate" title={it.fileName}>{it.fileName}</span>
                                                    <button onClick={() => del(it.id)} className="shrink-0 p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors" title="Supprimer">
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
