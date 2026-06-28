import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../src/context/AuthContext';
import { useLang } from '../src/context/LanguageContext';
import { tx } from '../lib/i18n';
import { pushSnapshotToCloud } from '../src/lib/cloudSync';
import { Search, FolderOpen, MoreVertical, FileJson, Clock, Users, Calendar, Download, Copy, Trash2, Edit2, SortAsc, Scissors, Filter, Upload, AlertTriangle, Plus, Share2, LayoutGrid, ZoomIn, ZoomOut, List as ListIcon, Database, UploadCloud, DownloadCloud, CheckCircle2, Loader2 } from 'lucide-react';
import { ModelData } from '../types';

function getModelAbbrev(model: ModelData): string {
    if (model?.meta_data?.reference) return model.meta_data.reference.toUpperCase().slice(0, 6);
    const name = model?.meta_data?.nom_modele || '';
    return name.split(/[\s\-_]+/).filter(Boolean).map(w => w[0]?.toUpperCase() || '').join('').slice(0, 5) || '?';
}

function buildLibrarySearchHaystack(m: ModelData): string {
    const parts: string[] = [];
    const meta = m?.meta_data;
    const fd = m?.ficheData;
    parts.push(meta?.nom_modele || '', m?.filename || '', meta?.reference || '');
    parts.push(meta?.category || '', fd?.category || '');
    parts.push(fd?.client || '', fd?.designation || '', fd?.observations || '', fd?.chaine || '');
    if (fd?.sizes?.length) parts.push(fd.sizes.join(' '));
    if (fd?.colors?.length) parts.push(...fd.colors.map(c => c.name));
    parts.push(String(meta?.quantity ?? fd?.quantity ?? ''), String(meta?.effectif ?? ''), String(meta?.total_temps ?? ''), fd?.date ?? '');
    const ops = m.gamme_operatoire || [];
    for (const op of ops) {
        parts.push(op.description || '', op.machineName || '', op.machineId || '', op.guideName || '', String(op.time ?? ''), op.forcedTime != null ? String(op.forcedTime) : '');
    }
    return parts.join(' \n ');
}

function modelMatchesLibrarySearch(m: ModelData, rawQuery: string): boolean {
    const q = rawQuery.trim();
    if (!q) return true;
    const haystack = buildLibrarySearchHaystack(m).toLowerCase();
    const tokens = q.toLowerCase().split(/\s+/).map(t => t.replace(/[,;]+$/g, '')).filter(Boolean);
    return tokens.every(tok => haystack.includes(tok));
}

interface LibraryProps {
    models: ModelData[];
    onLoadModel: (model: ModelData) => void;
    onImportModel: (file: File) => void;
    onDeleteModel: (id: string) => void;
    onDuplicateModel: (model: ModelData) => void;
    onRenameModel: (id: string, newName: string) => void;
    onCreateNewProject: () => void;
    onTransferToCoupe?: (model: ModelData) => void;
    onTransferToPlanning?: (model: ModelData) => void;
    onStartSuivi?: (model: ModelData) => void;
}

export default function Library({
    models, onLoadModel, onImportModel, onDeleteModel, onDuplicateModel, onRenameModel, onCreateNewProject, onTransferToCoupe, onTransferToPlanning, onStartSuivi
}: LibraryProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState<"date" | "name" | "time">("date");
    const [cardSize, setCardSize] = useState(340);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dbInputRef = useRef<HTMLInputElement>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; modelId: string } | null>(null);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const [deleteConfirm, setDeleteConfirm] = useState<{ id: string, name: string } | null>(null);
    const [dbStatus, setDbStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
    const [syncPhotoStatus, setSyncPhotoStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle');
    const { user } = useAuth();
    const { lang } = useLang();
    const IS_STATIC = import.meta.env.VITE_STATIC_MODE === 'true' || !window.location.hostname.includes('localhost');

    const handleSyncPhotos = async () => {
        if (!user || syncPhotoStatus === 'syncing') return;
        setSyncPhotoStatus('syncing');
        try { await pushSnapshotToCloud(String(user.id)); setSyncPhotoStatus('done'); } catch { setSyncPhotoStatus('error'); }
        finally { setTimeout(() => setSyncPhotoStatus('idle'), 3000); }
    };

    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener("click", handleClick);
        return () => window.removeEventListener("click", handleClick);
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) onImportModel(file);
    };

    const triggerFileInput = () => {
        if (fileInputRef.current) { fileInputRef.current.value = ''; fileInputRef.current.click(); }
    };

    const handleBackupDatabase = () => {
        setDbStatus('processing');
        try {
            const library = localStorage.getItem('beramethode_library');
            const autosave = localStorage.getItem('beramethode_autosave_v1');
            const layouts = localStorage.getItem('beramethode_layouts');
            const backupData = { type: 'BERAMETHODE_FULL_BACKUP', date: new Date().toISOString(), version: 1, data: { library: library ? JSON.parse(library) : [], autosave: autosave ? JSON.parse(autosave) : null, layouts: layouts ? JSON.parse(layouts) : [] } };
            const jsonString = JSON.stringify(backupData, null, 2);
            const blob = new Blob([jsonString], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", url);
            const dateStr = new Date().toISOString().slice(0, 10);
            downloadAnchorNode.setAttribute("download", `beramethode_backup_${dateStr}.json`);
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setDbStatus('success');
            setTimeout(() => setDbStatus('idle'), 2000);
        } catch (e) {
            console.error("Backup failed", e);
            setDbStatus('error');
            setTimeout(() => setDbStatus('idle'), 3000);
        }
    };

    const handleRestoreDatabase = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!window.confirm(tx(lang, {
            fr: "ATTENTION : Cette action va remplacer toutes vos données actuelles (modèles, sauvegarde auto, templates) par celles du fichier.\n\nVoulez-vous continuer ?",
            ar: "تنبيه: هذا الإجراء سيستبدل جميع بياناتكم الحالية (النماذج، الحفظ الآلي، القوالب) ببيانات الملف.\n\nهل تريدون الاستمرار؟",
            en: "WARNING: This action will replace all your current data (models, autosave, templates) with the file's data.\n\nDo you want to continue?",
            es: "ATENCIÓN: Esta acción reemplazará todos sus datos actuales (modelos, autoguardado, plantillas) por los del archivo.\n\n¿Desea continuar?",
            pt: "ATENÇÃO: Esta ação substituirá todos os seus dados atuais (modelos, salvamento automático, modelos de layout) pelos do arquivo.\n\nDeseja continuar?",
            tr: "UYARI: Bu işlem mevcut tüm verilerinizi (modeller, otomatik kayıt, şablonlar) dosyadakilerle değiştirecektir.\n\nDevam etmek istiyor musunuz?",
        }))) { e.target.value = ''; return; }
        setDbStatus('processing');
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                if (json.type !== 'BERAMETHODE_FULL_BACKUP' || !json.data) throw new Error(tx(lang, { fr: "Format de fichier invalide", ar: "صيغة الملف غير صالحة", en: "Invalid file format", es: "Formato de archivo no válido", pt: "Formato de arquivo inválido", tr: "Geçersiz dosya biçimi" }));
                if (json.data.library) localStorage.setItem('beramethode_library', JSON.stringify(json.data.library));
                if (json.data.autosave) localStorage.setItem('beramethode_autosave_v1', JSON.stringify(json.data.autosave));
                if (json.data.layouts) localStorage.setItem('beramethode_layouts', JSON.stringify(json.data.layouts));
                setDbStatus('success');
                alert(tx(lang, { fr: "Restauration terminée avec succès ! La page va se recharger.", ar: "تمت الاستعادة بنجاح! ستُعاد تحميل الصفحة.", en: "Restore completed successfully! The page will reload.", es: "¡Restauración completada con éxito! La página se recargará.", pt: "Restauração concluída com sucesso! A página será recarregada.", tr: "Geri yükleme başarıyla tamamlandı! Sayfa yeniden yüklenecek." }));
                window.location.reload();
            } catch (err) {
                console.error("Restore failed", err);
                alert(tx(lang, { fr: "Erreur lors de la restauration. Vérifiez le fichier.", ar: "خطأ خلال الاستعادة. تحقق من الملف.", en: "Error during restore. Check the file.", es: "Error durante la restauración. Verifique el archivo.", pt: "Erro durante a restauração. Verifique o arquivo.", tr: "Geri yükleme sırasında hata. Dosyayı kontrol edin." }));
                setDbStatus('error');
            } finally { setDbStatus('idle'); if (dbInputRef.current) dbInputRef.current.value = ''; }
        };
        reader.readAsText(file);
    };

    const handleRenameStart = (model: ModelData) => { setRenamingId(model.id); setRenameValue(model.meta_data.nom_modele); setContextMenu(null); };
    const handleRenameSubmit = (id: string) => { if (!renameValue.trim()) { setRenamingId(null); return; } onRenameModel(id, renameValue); setRenamingId(null); };
    const handleDuplicate = (model: ModelData) => { onDuplicateModel(model); setContextMenu(null); };

    const handleExport = (model: ModelData) => {
        const jsonString = JSON.stringify(model, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", url);
        downloadAnchorNode.setAttribute("download", model.filename);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        setTimeout(() => URL.revokeObjectURL(url), 100);
        setContextMenu(null);
    };

    const handleShare = async (model: ModelData) => {
        setContextMenu(null);
        try {
            const jsonString = JSON.stringify(model, null, 2);
            const file = new File([jsonString], model.filename, { type: 'application/json' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ title: model.meta_data.nom_modele, text: `${tx(lang, { fr: "Fiche Technique", ar: "البطاقة التقنية", en: "Technical Sheet", es: "Ficha Técnica", pt: "Ficha Técnica", tr: "Teknik Föy" })}: ${model.meta_data.nom_modele}`, files: [file] });
            } else { throw new Error(tx(lang, { fr: "Partage natif non supporté", ar: "المشاركة الأصلية غير مدعومة", en: "Native sharing not supported", es: "Uso compartido nativo no compatible", pt: "Compartilhamento nativo não suportado", tr: "Yerel paylaşım desteklenmiyor" })); }
        } catch (error) { console.log('Share failed, falling back to download:', error); handleExport(model); }
    };

    const filteredModels = models
        .filter(m => m && m.meta_data)
        .filter(m => m.isPublishedToLibrary !== false)
        .filter(m => modelMatchesLibrarySearch(m, searchQuery))
        .sort((a, b) => {
            if (sortBy === 'date') { const ta = a.meta_data.date_creation ? new Date(a.meta_data.date_creation).getTime() : 0; const tb = b.meta_data.date_creation ? new Date(b.meta_data.date_creation).getTime() : 0; return tb - ta; }
            if (sortBy === 'name') return (a.meta_data.nom_modele || '').localeCompare(b.meta_data.nom_modele || '');
            if (sortBy === 'time') return (b.meta_data.total_temps || 0) - (a.meta_data.total_temps || 0);
            return 0;
        });

    const activeModel = models.find(m => m.id === contextMenu?.modelId);

    return (
        <div className="h-full overflow-y-auto bg-slate-50 dark:bg-dk-bg/50 dark:bg-dk-bg/50 custom-scrollbar flex flex-col">
            <div className="p-4 pb-2 shrink-0">
                <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-3 bg-white dark:bg-dk-surface p-3 rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm dark:shadow-dk-elevated">
                    <div>
                        <h1 className="text-xl font-bold text-slate-800 dark:text-dk-text flex items-center gap-2">
                            <FolderOpen className="w-5 h-5 text-indigo-500 dark:text-dk-accent" />
                            {tx(lang, { fr: "Bibliothèque", ar: "المكتبة", en: "Library", es: "Biblioteca", pt: "Biblioteca", tr: "Kütüphane" })}
                        </h1>
                        <p className="text-slate-500 dark:text-dk-text-soft text-xs mt-0.5">{tx(lang, { fr: "Gérez vos modèles de production sauvegardés", ar: "أدِر نماذج الإنتاج المحفوظة", en: "Manage your saved production models", es: "Gestione sus modelos de producción guardados", pt: "Gerencie seus modelos de produção salvos", tr: "Kayıtlı üretim modellerinizi yönetin" })}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 w-full xl:w-auto items-center">
                        <button onClick={onCreateNewProject} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-md dark:shadow-dk-md shadow-emerald-200 dark:shadow-dk-elevated transition-all active:scale-95">
                            <Plus className="w-4 h-4" />
                            <span>{tx(lang, { fr: "Nouveau Modèle", ar: "نموذج جديد", en: "New Model", es: "Nuevo Modelo", pt: "Novo Modelo", tr: "Yeni Model" })}</span>
                        </button>
                        <div className="h-6 w-px bg-slate-200 dark:bg-dk-border mx-1 hidden xl:block"></div>
                        {IS_STATIC && user && (
                            <button
                                onClick={handleSyncPhotos}
                                disabled={syncPhotoStatus === 'syncing'}
                                title={tx(lang, { fr: "Resynchroniser les photos des modèles vers le cloud", ar: "إعادة مزامنة صور النماذج مع السحابة", en: "Resync model photos to the cloud", es: "Resincronizar las fotos de los modelos con la nube", pt: "Ressincronizar as fotos dos modelos com a nuvem", tr: "Model fotoğraflarını buluta yeniden senkronize et" })}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all active:scale-95 ${syncPhotoStatus === 'done' ? 'bg-emerald-500 text-white border-emerald-500' : syncPhotoStatus === 'error' ? 'bg-red-500 text-white border-red-500' : 'bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 dark:bg-dk-elevated text-indigo-700 dark:text-dk-accent-text dark:text-dk-accent border-indigo-200 dark:border-dk-border hover:bg-indigo-100 dark:hover:bg-dk-elevated'}`}
                            >
                                {syncPhotoStatus === 'syncing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : syncPhotoStatus === 'done' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <UploadCloud className="w-3.5 h-3.5" />}
                                <span className="hidden sm:inline">
                                    {syncPhotoStatus === 'syncing' ? tx(lang, { fr: 'Sync...', ar: 'مزامنة...', en: 'Sync...', es: 'Sync...', pt: 'Sync...', tr: 'Sync...' }) : syncPhotoStatus === 'done' ? tx(lang, { fr: 'Synced ✓', ar: 'تمت المزامنة ✓', en: 'Synced ✓', es: 'Synced ✓', pt: 'Synced ✓', tr: 'Synced ✓' }) : syncPhotoStatus === 'error' ? tx(lang, { fr: 'Erreur', ar: 'خطأ', en: 'Error', es: 'Error', pt: 'Erro', tr: 'Hata' }) : tx(lang, { fr: 'Sync Photos', ar: 'مزامنة الصور', en: 'Sync Photos', es: 'Sync Photos', pt: 'Sync Photos', tr: 'Sync Photos' })}
                                </span>
                            </button>
                        )}
                        <div className="flex items-center bg-slate-100 dark:bg-dk-elevated rounded-lg p-0.5 border border-slate-200 dark:border-dk-border">
                            <button
                                onClick={handleBackupDatabase}
                                disabled={dbStatus === 'processing'}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${dbStatus === 'success' ? 'bg-emerald-500 text-white' : 'hover:bg-white dark:hover:bg-dk-surface text-slate-600 dark:text-dk-text-soft'}`}
                                title={tx(lang, { fr: "Sauvegarder toute la base de données (Backup)", ar: "حفظ كامل قاعدة البيانات (Backup)", en: "Back up the entire database (Backup)", es: "Respaldar toda la base de datos (Backup)", pt: "Fazer backup de todo o banco de dados (Backup)", tr: "Tüm veritabanını yedekle (Backup)" })}
                            >
                                {dbStatus === 'processing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (dbStatus === 'success' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <DownloadCloud className="w-3.5 h-3.5" />)}
                                <span className="hidden sm:inline">Backup</span>
                            </button>
                            <div className="w-px h-4 bg-slate-300 dark:bg-dk-border mx-1"></div>
                            <button
                                onClick={() => dbInputRef.current?.click()}
                                disabled={dbStatus === 'processing'}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold hover:bg-white dark:hover:bg-dk-surface text-slate-600 dark:text-dk-text-soft transition-all"
                                title={tx(lang, { fr: "Restaurer une base de données", ar: "استعادة قاعدة بيانات", en: "Restore a database", es: "Restaurar una base de datos", pt: "Restaurar um banco de dados", tr: "Bir veritabanını geri yükle" })}
                            >
                                <UploadCloud className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">{tx(lang, { fr: "Restaurer", ar: "استعادة", en: "Restore", es: "Restaurar", pt: "Restaurar", tr: "Geri Yükle" })}</span>
                            </button>
                            <input type="file" accept=".json" ref={dbInputRef} className="hidden" onChange={handleRestoreDatabase} />
                        </div>
                        <input type="file" accept=".json" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
                        <button
                            onClick={triggerFileInput}
                            className="p-2 bg-white dark:bg-dk-surface hover:bg-slate-50 dark:hover:bg-dk-elevated/60 text-slate-500 dark:text-dk-text-soft rounded-xl border border-slate-200 dark:border-dk-border transition-colors"
                            title={tx(lang, { fr: "Importer un modèle unique", ar: "استيراد نموذج واحد", en: "Import a single model", es: "Importar un solo modelo", pt: "Importar um único modelo", tr: "Tek bir model içe aktar" })}
                        >
                            <Upload className="w-4 h-4" />
                        </button>
                        <div className="flex bg-slate-100 dark:bg-dk-elevated rounded-lg p-0.5 border border-slate-200 dark:border-dk-border">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-dk-surface shadow-sm dark:shadow-dk-sm dark:shadow-dk-elevated text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-dk-accent' : 'text-slate-400 dark:text-dk-muted hover:text-slate-600 dark:hover:text-dk-text-soft'}`}
                                title={tx(lang, { fr: "Vue Grille", ar: "عرض الشبكة", en: "Grid View", es: "Vista de Cuadrícula", pt: "Visualização em Grade", tr: "Izgara Görünümü" })}
                            >
                                <LayoutGrid className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white dark:bg-dk-surface shadow-sm dark:shadow-dk-sm dark:shadow-dk-elevated text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-dk-accent' : 'text-slate-400 dark:text-dk-muted hover:text-slate-600 dark:hover:text-dk-text-soft'}`}
                                title={tx(lang, { fr: "Vue Liste", ar: "عرض القائمة", en: "List View", es: "Vista de Lista", pt: "Visualização em Lista", tr: "Liste Görünümü" })}
                            >
                                <ListIcon className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        <div className="relative flex-1 min-w-[150px] xl:min-w-[220px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-dk-muted" />
                            <input
                                type="text"
                                placeholder={tx(lang, { fr: "Nom, client, mot gamme, chiffre…", ar: "الاسم، العميل، كلمة من الغامة، رقم…", en: "Name, client, routing word, number…", es: "Nombre, cliente, palabra de gama, número…", pt: "Nome, cliente, palavra da gama, número…", tr: "Ad, müşteri, rota kelimesi, sayı…" })}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                title={tx(lang, { fr: "Plusieurs mots : chaque mot doit être trouvé (fiche + lignes de gamme).", ar: "عدّة كلمات: يجب إيجاد كل كلمة (البطاقة + خطوط الغامة).", en: "Multiple words: each word must be found (sheet + routing lines).", es: "Varias palabras: cada palabra debe encontrarse (ficha + líneas de gama).", pt: "Várias palavras: cada palavra deve ser encontrada (ficha + linhas da gama).", tr: "Birden fazla kelime: her kelime bulunmalıdır (föy + rota satırları)." })}
                                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl text-xs outline-none focus:border-indigo-500 dark:focus:border-dk-accent focus:bg-white dark:focus:bg-dk-surface transition-all text-slate-700 dark:text-dk-text"
                            />
                        </div>
                        <div className="relative">
                            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                                <SortAsc className="w-3.5 h-3.5 text-slate-400 dark:text-dk-muted" />
                            </div>
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value as any)}
                                className="pl-8 pr-7 py-1.5 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl text-xs font-bold text-slate-600 dark:text-dk-text-soft outline-none focus:border-indigo-500 dark:focus:border-dk-accent cursor-pointer appearance-none"
                            >
                                <option value="date">{tx(lang, { fr: "Récent", ar: "الأحدث", en: "Recent", es: "Reciente", pt: "Recente", tr: "Son" })}</option>
                                <option value="name">{tx(lang, { fr: "Nom", ar: "الاسم", en: "Name", es: "Nombre", pt: "Nome", tr: "Ad" })}</option>
                                <option value="time">{tx(lang, { fr: "Temps", ar: "الوقت", en: "Time", es: "Tiempo", pt: "Tempo", tr: "Süre" })}</option>
                            </select>
                            <Filter className="absolute right-2 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-slate-400 dark:text-dk-muted pointer-events-none" />
                        </div>
                    </div>
                </div>
            </div>
            <div className="flex-1 p-4 pt-0 pb-20">
                {filteredModels.length > 0 ? (
                    <>
                        {viewMode === 'grid' ? (
                            <div className="grid gap-4 transition-all duration-200 ease-out"
                                style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardSize}px, 1fr))` }}
                            >
                                {filteredModels.map((model) => (
                                    <div
                                        key={model.id}
                                        onClick={() => { if (renamingId !== model.id) onLoadModel(model); }}
                                        onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.pageX, y: e.pageY, modelId: model.id }); }}
                                        className="group bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm dark:shadow-dk-elevated hover:shadow-md dark:hover:shadow-dk-elevated hover:border-indigo-300 dark:hover:border-dk-accent hover:-translate-y-1 transition-all duration-200 cursor-pointer overflow-hidden flex flex-col h-full"
                                    >
                                        <div className="aspect-[4/3] bg-slate-50 dark:bg-dk-bg border-b border-slate-100 dark:border-dk-border flex items-center justify-center group-hover:bg-indigo-50 dark:bg-dk-accent/20/20 dark:group-hover:bg-dk-elevated/20 transition-colors relative overflow-hidden">
                                            {model.image ? (
                                                <img src={model.image} alt={model.meta_data.nom_modele} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                                            ) : (
                                                <div className="flex flex-col items-center gap-2 transform scale-75 origin-center">
                                                    <div className="w-12 h-12 bg-slate-100 dark:bg-dk-elevated rounded-full flex items-center justify-center">
                                                        <FileJson className="w-6 h-6 text-slate-300 dark:text-dk-muted group-hover:text-indigo-400 dark:group-hover:text-dk-accent transition-colors" />
                                                    </div>
                                                    <span className="text-xs text-slate-400 dark:text-dk-muted font-medium">{tx(lang, { fr: "Aucun aperçu", ar: "لا توجد معاينة", en: "No preview", es: "Sin vista previa", pt: "Sem pré-visualização", tr: "Önizleme yok" })}</span>
                                                </div>
                                            )}
                                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 flex gap-2">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setContextMenu({ x: e.pageX, y: e.pageY, modelId: model.id }); }}
                                                    className="p-1.5 bg-white/90 dark:bg-dk-surface/90 backdrop-blur-sm rounded-full shadow-sm dark:shadow-dk-sm dark:shadow-dk-elevated text-slate-600 dark:text-dk-text-soft hover:text-indigo-600 dark:text-dk-accent-text dark:hover:text-dk-accent hover:bg-white dark:hover:bg-dk-surface"
                                                >
                                                    <MoreVertical className="w-4 h-4" />
                                                </button>
                                            </div>
                                            {model.meta_data.category && (
                                                <div className="absolute bottom-2 left-2 bg-black/60 dark:bg-black/80 backdrop-blur-md text-white px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide flex items-center gap-1 shadow-sm dark:shadow-dk-sm max-w-[90%]">
                                                    <LayoutGrid className="w-2.5 h-2.5 shrink-0" />
                                                    <span className="truncate">{model.meta_data.category}</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-3 flex-1 flex flex-col">
                                            <div className="mb-2">
                                                {renamingId === model.id ? (
                                                    <input
                                                        type="text"
                                                        value={renameValue}
                                                        onChange={(e) => setRenameValue(e.target.value)}
                                                        onBlur={() => handleRenameSubmit(model.id)}
                                                        onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit(model.id)}
                                                        autoFocus
                                                        className="w-full text-sm font-bold border-b-2 border-indigo-500 dark:border-dk-accent outline-none pb-1 text-slate-800 dark:text-dk-text bg-transparent"
                                                    />
                                                ) : (
                                                    <div className="flex items-center gap-1.5">
                                                        <h3 className="font-bold text-slate-800 dark:text-dk-text text-sm truncate flex-1" title={model.meta_data.nom_modele}>
                                                            {model.meta_data.nom_modele}
                                                        </h3>
                                                        <span className="shrink-0 text-[9px] font-black text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-dk-accent bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 dark:bg-dk-elevated border border-indigo-100 dark:border-dk-border px-1.5 py-0.5 rounded-md tracking-wide">
                                                            {getModelAbbrev(model)}
                                                        </span>
                                                    </div>
                                                )}
                                                {model.meta_data.date_lancement && (
                                                    <p className="text-[10px] text-slate-500 dark:text-dk-text-soft mt-0.5 flex items-center gap-1">
                                                        <Calendar className="w-3 h-3 text-slate-400 dark:text-dk-muted" />
                                                        {new Date(model.meta_data.date_lancement).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="mt-auto grid grid-cols-2 gap-2">
                                                <div className="bg-slate-50 dark:bg-dk-bg rounded-lg p-1.5 border border-slate-100 dark:border-dk-border flex flex-col items-center justify-center">
                                                    <Clock className="w-3 h-3 text-slate-400 dark:text-dk-muted mb-0.5" />
                                                    <span className="text-[10px] font-bold text-slate-700 dark:text-dk-text">{model.meta_data.total_temps.toFixed(2)}m</span>
                                                </div>
                                                <div className="bg-slate-50 dark:bg-dk-bg rounded-lg p-1.5 border border-slate-100 dark:border-dk-border flex flex-col items-center justify-center">
                                                    <Users className="w-3 h-3 text-slate-400 dark:text-dk-muted mb-0.5" />
                                                    <span className="text-[10px] font-bold text-slate-700 dark:text-dk-text">{model.meta_data.effectif} {tx(lang, { fr: "Op.", ar: "عامل", en: "Op.", es: "Op.", pt: "Op.", tr: "Op." })}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {filteredModels.map((model) => (
                                    <div
                                        key={model.id}
                                        onClick={() => { if (renamingId !== model.id) onLoadModel(model); }}
                                        onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.pageX, y: e.pageY, modelId: model.id }); }}
                                        className="group bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm dark:shadow-dk-elevated hover:shadow-md dark:hover:shadow-dk-elevated hover:border-indigo-300 dark:hover:border-dk-accent flex items-center p-2 gap-4 cursor-pointer transition-all duration-200"
                                    >
                                        <div className="w-16 h-16 shrink-0 bg-slate-50 dark:bg-dk-bg rounded-lg overflow-hidden border border-slate-100 dark:border-dk-border flex items-center justify-center relative">
                                            {model.image ? (
                                                <img src={model.image} alt={model.meta_data.nom_modele} className="w-full h-full object-cover" />
                                            ) : (
                                                <FileJson className="w-6 h-6 text-slate-300 dark:text-dk-muted" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            {renamingId === model.id ? (
                                                <input
                                                    type="text"
                                                    value={renameValue}
                                                    onChange={(e) => setRenameValue(e.target.value)}
                                                    onBlur={() => handleRenameSubmit(model.id)}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit(model.id)}
                                                    autoFocus
                                                    className="w-full max-w-xs text-sm font-bold border-b-2 border-indigo-500 dark:border-dk-accent outline-none pb-1 text-slate-800 dark:text-dk-text bg-transparent"
                                                />
                                            ) : (
                                                <h3 className="font-bold text-slate-800 dark:text-dk-text text-sm truncate">{model.meta_data.nom_modele}</h3>
                                            )}
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-dk-elevated text-slate-500 dark:text-dk-text-soft rounded-full font-bold uppercase tracking-wide">
                                                    {model.meta_data.category || tx(lang, { fr: "Standard", ar: "عادي", en: "Standard", es: "Estándar", pt: "Padrão", tr: "Standart" })}
                                                </span>
                                                <span className="text-[10px] text-slate-400 dark:text-dk-muted flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" />
                                                    {model.meta_data.date_creation ? new Date(model.meta_data.date_creation).toLocaleDateString() : '—'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-6 mr-4 hidden sm:flex">
                                            <div className="flex flex-col items-center w-16">
                                                <span className="text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase">{tx(lang, { fr: "Temps", ar: "الوقت", en: "Time", es: "Tiempo", pt: "Tempo", tr: "Süre" })}</span>
                                                <span className="text-sm font-bold text-slate-700 dark:text-dk-text">{model.meta_data.total_temps.toFixed(2)}m</span>
                                            </div>
                                            <div className="flex flex-col items-center w-16">
                                                <span className="text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase">{tx(lang, { fr: "Effectif", ar: "العدد", en: "Staff", es: "Personal", pt: "Efetivo", tr: "Personel" })}</span>
                                                <span className="text-sm font-bold text-slate-700 dark:text-dk-text">{model.meta_data.effectif} {tx(lang, { fr: "Op.", ar: "عامل", en: "Op.", es: "Op.", pt: "Op.", tr: "Op." })}</span>
                                            </div>
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setContextMenu({ x: e.pageX, y: e.pageY, modelId: model.id }); }}
                                            className="p-2 hover:bg-slate-100 dark:hover:bg-dk-elevated rounded-full text-slate-400 dark:text-dk-muted hover:text-indigo-600 dark:text-dk-accent-text dark:hover:text-dk-accent transition-colors opacity-0 group-hover:opacity-100"
                                        >
                                            <MoreVertical className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-dk-muted min-h-[400px] border-2 border-dashed border-slate-200 dark:border-dk-border rounded-3xl bg-slate-50 dark:bg-dk-bg/50 dark:bg-dk-bg/50">
                        <div className="w-16 h-16 bg-white dark:bg-dk-surface rounded-full flex items-center justify-center mb-4 shadow-sm dark:shadow-dk-sm dark:shadow-dk-elevated">
                            <FolderOpen className="w-8 h-8 text-slate-300 dark:text-dk-muted" />
                        </div>
                        <h3 className="font-bold text-slate-600 dark:text-dk-text mb-1">{tx(lang, { fr: "Aucun modèle trouvé", ar: "لم يتم العثور على أي نموذج", en: "No model found", es: "No se encontró ningún modelo", pt: "Nenhum modelo encontrado", tr: "Model bulunamadı" })}</h3>
                        <p className="text-sm mb-4">{tx(lang, { fr: "La bibliothèque est vide ou ne correspond pas à votre recherche.", ar: "المكتبة فارغة أو لا تطابق بحثك.", en: "The library is empty or doesn't match your search.", es: "La biblioteca está vacía o no coincide con su búsqueda.", pt: "A biblioteca está vazia ou não corresponde à sua pesquisa.", tr: "Kütüphane boş veya aramanızla eşleşmiyor." })}</p>
                        <div className="flex gap-3">
                            <button onClick={onCreateNewProject} className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg text-sm font-bold shadow-md dark:shadow-dk-md dark:shadow-dk-elevated transition-colors flex items-center gap-2">
                                <Plus className="w-4 h-4" /> {tx(lang, { fr: "Nouveau Modèle", ar: "نموذج جديد", en: "New Model", es: "Nuevo Modelo", pt: "Novo Modelo", tr: "Yeni Model" })}
                            </button>
                            <button onClick={triggerFileInput} className="px-4 py-2 bg-white dark:bg-dk-surface text-slate-600 dark:text-dk-text-soft hover:bg-slate-50 dark:hover:bg-dk-elevated/60 rounded-lg text-sm font-bold border border-slate-200 dark:border-dk-border transition-colors">
                                {tx(lang, { fr: "Importer", ar: "استيراد", en: "Import", es: "Importar", pt: "Importar", tr: "İçe Aktar" })}
                            </button>
                        </div>
                    </div>
                )}
            </div>
            {contextMenu && createPortal(
                <div
                    className="fixed bg-white dark:bg-dk-surface rounded-xl shadow-2xl dark:shadow-dk-lg dark:shadow-dk-elevated border border-slate-100 dark:border-dk-border w-56 z-[9999] py-1.5 animate-in fade-in zoom-in-95 duration-100 origin-top-left overflow-hidden"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {activeModel && (
                        <>
                            <button
                                type="button"
                                onClick={() => { onLoadModel(activeModel); setContextMenu(null); }}
                                className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-dk-text hover:bg-indigo-50 dark:bg-dk-accent/20 dark:hover:bg-dk-elevated hover:text-indigo-600 dark:text-dk-accent-text dark:hover:text-dk-accent flex items-center gap-3 transition-colors"
                            >
                                <FolderOpen className="w-4 h-4" /> {tx(lang, { fr: "Ouvrir dans l'Atelier / Méthodes", ar: "فتح في الورشة / المناهج", en: "Open in Workshop / Methods", es: "Abrir en Taller / Métodos", pt: "Abrir em Ateliê / Métodos", tr: "Atölye / Yöntemlerde Aç" })}
                            </button>
                            {onTransferToCoupe && (
                                <button
                                    type="button"
                                    onClick={() => { onTransferToCoupe(activeModel); setContextMenu(null); }}
                                    className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 dark:text-dk-text hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:text-rose-600 dark:hover:text-rose-300 flex items-center gap-3 transition-colors"
                                >
                                    <Scissors className="w-4 h-4" /> {tx(lang, { fr: "Transférer vers La Coupe", ar: "تحويل إلى القص", en: "Transfer to Cutting", es: "Transferir al Corte", pt: "Transferir para o Corte", tr: "Kesime Aktar" })}
                                </button>
                            )}
                            {onTransferToPlanning && (
                                <button
                                    type="button"
                                    onClick={() => { onTransferToPlanning(activeModel); setContextMenu(null); }}
                                    className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 dark:text-dk-text hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:text-emerald-600 dark:hover:text-emerald-300 flex items-center gap-3 transition-colors"
                                >
                                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /></svg>
                                    {tx(lang, { fr: "Transférer vers Planning", ar: "تحويل إلى التخطيط", en: "Transfer to Planning", es: "Transferir a Planificación", pt: "Transferir para Planejamento", tr: "Planlamaya Aktar" })}
                                </button>
                            )}
                            {onStartSuivi && (
                                <button
                                    type="button"
                                    onClick={() => { onStartSuivi(activeModel); setContextMenu(null); }}
                                    className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 dark:text-dk-text hover:bg-indigo-50 dark:bg-dk-accent/20 dark:hover:bg-dk-elevated hover:text-indigo-600 dark:text-dk-accent-text dark:hover:text-dk-accent flex items-center gap-3 transition-colors"
                                >
                                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-5"/></svg>
                                    {tx(lang, { fr: "Lancer Suivi", ar: "بدء المتابعة", en: "Start Tracking", es: "Iniciar Seguimiento", pt: "Iniciar Acompanhamento", tr: "Takibi Başlat" })}
                                </button>
                            )}
                            <div className="h-px bg-slate-100 dark:bg-dk-elevated dark:border-dk-border my-1"></div>
                            <button
                                type="button"
                                onClick={() => handleRenameStart(activeModel)}
                                className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-600 dark:text-dk-text-soft hover:bg-slate-50 dark:hover:bg-dk-elevated/60 flex items-center gap-3 transition-colors"
                            >
                                <Edit2 className="w-4 h-4" /> {tx(lang, { fr: "Renommer", ar: "إعادة تسمية", en: "Rename", es: "Renombrar", pt: "Renomear", tr: "Yeniden Adlandır" })}
                            </button>
                            <button
                                type="button"
                                onClick={() => handleDuplicate(activeModel)}
                                className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-600 dark:text-dk-text-soft hover:bg-slate-50 dark:hover:bg-dk-elevated/60 flex items-center gap-3 transition-colors"
                            >
                                <Copy className="w-4 h-4" /> {tx(lang, { fr: "Dupliquer", ar: "تكرار", en: "Duplicate", es: "Duplicar", pt: "Duplicar", tr: "Çoğalt" })}
                            </button>
                            <button
                                type="button"
                                onClick={() => handleShare(activeModel)}
                                className="w-full text-left px-4 py-2.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 flex items-center gap-3 transition-colors"
                            >
                                <Share2 className="w-4 h-4" /> {tx(lang, { fr: "Partager / Envoyer", ar: "مشاركة / إرسال", en: "Share / Send", es: "Compartir / Enviar", pt: "Compartilhar / Enviar", tr: "Paylaş / Gönder" })}
                            </button>
                            <button
                                type="button"
                                onClick={() => handleExport(activeModel)}
                                className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-600 dark:text-dk-text-soft hover:bg-slate-50 dark:hover:bg-dk-elevated/60 flex items-center gap-3 transition-colors"
                            >
                                <Download className="w-4 h-4" /> {tx(lang, { fr: "Exporter (JSON)", ar: "تصدير (JSON)", en: "Export (JSON)", es: "Exportar (JSON)", pt: "Exportar (JSON)", tr: "Dışa Aktar (JSON)" })}
                            </button>
                            <div className="h-px bg-slate-100 dark:bg-dk-elevated dark:border-dk-border my-1"></div>
                            <button
                                type="button"
                                onClick={() => { setDeleteConfirm({ id: activeModel.id, name: activeModel.meta_data?.nom_modele || '' }); setContextMenu(null); }}
                                className="w-full text-left px-4 py-2.5 text-xs font-bold text-rose-600 dark:text-rose-400 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/20 flex items-center gap-3 transition-colors"
                            >
                                <Trash2 className="w-4 h-4" /> {tx(lang, { fr: "Supprimer", ar: "حذف", en: "Delete", es: "Eliminar", pt: "Excluir", tr: "Sil" })}
                            </button>
                        </>
                    )}
                </div>,
                document.body
            )}
            {deleteConfirm && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 dark:bg-slate-950/70 backdrop-blur-sm dark:backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-2xl dark:shadow-dk-lg dark:shadow-dk-elevated w-full max-w-sm overflow-hidden p-6 text-center transform scale-100 transition-all">
                        <div className="w-16 h-16 bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-600 dark:text-rose-400 dark:text-rose-300">
                            <Trash2 className="w-8 h-8" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-800 dark:text-dk-text mb-2">{tx(lang, { fr: "Confirmer la suppression", ar: "تأكيد الحذف", en: "Confirm Deletion", es: "Confirmar la eliminación", pt: "Confirmar exclusão", tr: "Silmeyi Onayla" })}</h3>
                        <p className="text-slate-500 dark:text-dk-text-soft text-sm mb-6 leading-relaxed">
                            {tx(lang, { fr: "Êtes-vous sûr de vouloir supprimer le modèle", ar: "هل تريد بالتأكيد حذف النموذج", en: "Are you sure you want to delete the model", es: "¿Está seguro de que desea eliminar el modelo", pt: "Tem certeza de que deseja excluir o modelo", tr: "Modeli silmek istediğinizden emin misiniz" })} <br />
                            <span className="font-bold text-slate-800 dark:text-dk-text">"{deleteConfirm.name}"</span> ? <br />
                            <span className="text-rose-500 dark:text-rose-300 font-medium text-xs">{tx(lang, { fr: "Cette action est irréversible.", ar: "هذا الإجراء لا رجعة فيه.", en: "This action cannot be undone.", es: "Esta acción es irreversible.", pt: "Esta ação é irreversível.", tr: "Bu işlem geri alınamaz." })}</span>
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-dk-elevated text-slate-700 dark:text-dk-text hover:bg-slate-200 dark:hover:bg-dk-elevated rounded-xl font-bold text-sm transition-colors"
                            >
                                {tx(lang, { fr: "Annuler", ar: "إلغاء", en: "Cancel", es: "Cancelar", pt: "Cancelar", tr: "İptal" })}
                            </button>
                            <button
                                onClick={() => { onDeleteModel(deleteConfirm.id); setDeleteConfirm(null); }}
                                className="flex-1 px-4 py-2.5 bg-rose-600 text-white hover:bg-rose-700 rounded-xl font-bold text-sm shadow-lg dark:shadow-dk-lg shadow-rose-200 dark:shadow-dk-elevated transition-colors"
                            >
                                {tx(lang, { fr: "Supprimer", ar: "حذف", en: "Delete", es: "Eliminar", pt: "Excluir", tr: "Sil" })}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
