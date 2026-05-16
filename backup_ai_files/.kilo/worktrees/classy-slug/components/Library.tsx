
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    Search,
    FolderOpen,
    MoreVertical,
    FileJson,
    Clock,
    Users,
    Calendar,
    Download,
    Copy,
    Trash2,
    Edit2,
    SortAsc,
    Scissors,
    Filter,
    Upload,
    AlertTriangle,
    Plus,
    Share2,
    LayoutGrid,
    ZoomIn,
    ZoomOut,
    List as ListIcon,
    Database,
    UploadCloud,
    DownloadCloud,
    CheckCircle2,
    Loader2
} from 'lucide-react';
import { ModelData } from '../types';

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
}

export default function Library({
    models,
    onLoadModel,
    onImportModel,
    onDeleteModel,
    onDuplicateModel,
    onRenameModel,
    onCreateNewProject,
    onTransferToCoupe,
    onTransferToPlanning
}: LibraryProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState<"date" | "name" | "time">("date");
    const [cardSize, setCardSize] = useState(340); // Increased default card width
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

    // File Input Ref for Model Import
    const fileInputRef = useRef<HTMLInputElement>(null);

    // File Input Ref for DB Restore
    const dbInputRef = useRef<HTMLInputElement>(null);

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; modelId: string } | null>(null);

    // Rename State
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");

    // Delete Confirmation State
    const [deleteConfirm, setDeleteConfirm] = useState<{ id: string, name: string } | null>(null);

    // Status for Backup/Restore
    const [dbStatus, setDbStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');

    // Close context menu on global click
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener("click", handleClick);
        return () => window.removeEventListener("click", handleClick);
    }, []);

    // --- ACTIONS ---

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onImportModel(file);
        }
    };

    const triggerFileInput = () => {
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
            fileInputRef.current.click();
        }
    };

    // --- DATABASE BACKUP & RESTORE ---
    const handleBackupDatabase = () => {
        setDbStatus('processing');
        try {
            // 1. Gather all data
            const library = localStorage.getItem('beramethode_library');
            const autosave = localStorage.getItem('beramethode_autosave_v1');
            const layouts = localStorage.getItem('beramethode_layouts');

            const backupData = {
                type: 'BERAMETHODE_FULL_BACKUP',
                date: new Date().toISOString(),
                version: 1,
                data: {
                    library: library ? JSON.parse(library) : [],
                    autosave: autosave ? JSON.parse(autosave) : null,
                    layouts: layouts ? JSON.parse(layouts) : []
                }
            };

            // 2. Create Blob
            const jsonString = JSON.stringify(backupData, null, 2);
            const blob = new Blob([jsonString], { type: "application/json" });
            const url = URL.createObjectURL(blob);

            // 3. Download
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", url);
            const dateStr = new Date().toISOString().slice(0, 10);
            downloadAnchorNode.setAttribute("download", `beramethode_backup_${dateStr}.json`);
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();

            setTimeout(() => URL.revokeObjectURL(url), 100);
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

        if (!window.confirm("ATTENTION : Cette action va remplacer toutes vos données actuelles (modèles, sauvegarde auto, templates) par celles du fichier.\n\nVoulez-vous continuer ?")) {
            e.target.value = ''; // Reset
            return;
        }

        setDbStatus('processing');
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);

                if (json.type !== 'BERAMETHODE_FULL_BACKUP' || !json.data) {
                    throw new Error("Format de fichier invalide");
                }

                // Restore Items
                if (json.data.library) localStorage.setItem('beramethode_library', JSON.stringify(json.data.library));
                if (json.data.autosave) localStorage.setItem('beramethode_autosave_v1', JSON.stringify(json.data.autosave));
                if (json.data.layouts) localStorage.setItem('beramethode_layouts', JSON.stringify(json.data.layouts));

                setDbStatus('success');
                alert("Restauration terminée avec succès ! La page va se recharger.");
                window.location.reload();

            } catch (err) {
                console.error("Restore failed", err);
                alert("Erreur lors de la restauration. Vérifiez le fichier.");
                setDbStatus('error');
            } finally {
                setDbStatus('idle');
                if (dbInputRef.current) dbInputRef.current.value = '';
            }
        };
        reader.readAsText(file);
    };

    const handleRenameStart = (model: ModelData) => {
        setRenamingId(model.id);
        setRenameValue(model.meta_data.nom_modele);
        setContextMenu(null);
    };

    const handleRenameSubmit = (id: string) => {
        if (!renameValue.trim()) {
            setRenamingId(null);
            return;
        }
        onRenameModel(id, renameValue);
        setRenamingId(null);
    };

    const handleDuplicate = (model: ModelData) => {
        onDuplicateModel(model);
        setContextMenu(null);
    };

    const handleExport = (model: ModelData) => {
        // Create JSON blob to support large files (Base64 images)
        const jsonString = JSON.stringify(model, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", url);
        downloadAnchorNode.setAttribute("download", model.filename);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();

        // Clean up
        setTimeout(() => URL.revokeObjectURL(url), 100);
        setContextMenu(null);
    };

    const handleShare = async (model: ModelData) => {
        setContextMenu(null);
        try {
            const jsonString = JSON.stringify(model, null, 2);
            const file = new File([jsonString], model.filename, { type: 'application/json' });

            // Try native sharing first
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: model.meta_data.nom_modele,
                    text: `Fiche Technique: ${model.meta_data.nom_modele}`,
                    files: [file]
                });
            } else {
                // Force throw to trigger catch block
                throw new Error("Partage natif non supporté");
            }
        } catch (error) {
            // Fallback to export if sharing fails or is cancelled
            console.log('Share failed, falling back to download:', error);
            handleExport(model);
            // Optional: Add a toast notification here if needed
        }
    };

    // --- FILTER & SORT ---
    const filteredModels = models
        .filter(m => m.isPublishedToLibrary !== false)
        .filter(m =>
            m.meta_data.nom_modele.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (m.meta_data.category || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.filename.toLowerCase().includes(searchQuery.toLowerCase())
        )
        .sort((a, b) => {
            if (sortBy === 'date') return new Date(b.meta_data.date_creation).getTime() - new Date(a.meta_data.date_creation).getTime();
            if (sortBy === 'name') return a.meta_data.nom_modele.localeCompare(b.meta_data.nom_modele);
            if (sortBy === 'time') return b.meta_data.total_temps - a.meta_data.total_temps;
            return 0;
        });

    // Get active model for context menu
    const activeModel = models.find(m => m.id === contextMenu?.modelId);

    return (
        <div className="h-full overflow-y-auto bg-slate-50/50 custom-scrollbar flex flex-col">

            {/* HEADER - SCROLLS WITH CONTENT */}
            <div className="p-4 pb-2 shrink-0">
                <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
                    <div>
                        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <FolderOpen className="w-5 h-5 text-indigo-500" />
                            Bibliothèque
                        </h1>
                        <p className="text-slate-500 text-xs mt-0.5">Gérez vos modèles de production sauvegardés</p>
                    </div>

                    <div className="flex flex-wrap gap-2 w-full xl:w-auto items-center">

                        {/* NEW PROJECT BUTTON */}
                        <button
                            onClick={onCreateNewProject}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-md shadow-emerald-200 transition-all active:scale-95"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Nouveau Modèle</span>
                        </button>

                        <div className="h-6 w-px bg-slate-200 mx-1 hidden xl:block"></div>

                        {/* DB Management Group */}
                        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                            <button
                                onClick={handleBackupDatabase}
                                disabled={dbStatus === 'processing'}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${dbStatus === 'success' ? 'bg-emerald-500 text-white' : 'hover:bg-white text-slate-600'}`}
                                title="Sauvegarder toute la base de données (Backup)"
                            >
                                {dbStatus === 'processing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (dbStatus === 'success' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <DownloadCloud className="w-3.5 h-3.5" />)}
                                <span className="hidden sm:inline">Backup</span>
                            </button>

                            <div className="w-px h-4 bg-slate-300 mx-1"></div>

                            <button
                                onClick={() => dbInputRef.current?.click()}
                                disabled={dbStatus === 'processing'}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold hover:bg-white text-slate-600 transition-all"
                                title="Restaurer une base de données"
                            >
                                <UploadCloud className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Restaurer</span>
                            </button>
                            <input
                                type="file"
                                accept=".json"
                                ref={dbInputRef}
                                className="hidden"
                                onChange={handleRestoreDatabase}
                            />
                        </div>

                        {/* Import Single Model (Legacy) */}
                        <input
                            type="file"
                            accept=".json"
                            ref={fileInputRef}
                            className="hidden"
                            onChange={handleFileChange}
                        />
                        <button
                            onClick={triggerFileInput}
                            className="p-2 bg-white hover:bg-slate-50 text-slate-500 rounded-xl border border-slate-200 transition-colors"
                            title="Importer un modèle unique"
                        >
                            <Upload className="w-4 h-4" />
                        </button>

                        {/* VIEW MODE TOGGLE */}
                        <div className="flex bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                                title="Vue Grille"
                            >
                                <LayoutGrid className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                                title="Vue Liste"
                            >
                                <ListIcon className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        {/* Search */}
                        <div className="relative flex-1 min-w-[150px] xl:w-40">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Rechercher..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500 focus:bg-white transition-all"
                            />
                        </div>

                        {/* Sort */}
                        <div className="relative">
                            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                                <SortAsc className="w-3.5 h-3.5 text-slate-400" />
                            </div>
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value as any)}
                                className="pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 outline-none focus:border-indigo-500 cursor-pointer appearance-none"
                            >
                                <option value="date">Récent</option>
                                <option value="name">Nom</option>
                                <option value="time">Temps</option>
                            </select>
                            <Filter className="absolute right-2 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-slate-400 pointer-events-none" />
                        </div>
                    </div>
                </div>
            </div>

            {/* SCROLLABLE GRID CONTENT - Now part of the main flow */}
            <div className="flex-1 p-4 pt-0 pb-20">
                {filteredModels.length > 0 ? (
                    <>
                        {viewMode === 'grid' ? (
                            <div
                                className="grid gap-4 transition-all duration-200 ease-out"
                                style={{
                                    gridTemplateColumns: `repeat(auto-fill, minmax(${cardSize}px, 1fr))`
                                }}
                            >
                                {filteredModels.map((model) => (
                                    <div
                                        key={model.id}
                                        onDoubleClick={() => onLoadModel(model)}
                                        onContextMenu={(e) => {
                                            e.preventDefault();
                                            setContextMenu({ x: e.pageX, y: e.pageY, modelId: model.id });
                                        }}
                                        className="group bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 hover:-translate-y-1 transition-all duration-200 cursor-pointer overflow-hidden flex flex-col h-full"
                                    >
                                        {/* DYNAMIC IMAGE RATIO - Keeps image proportional as card resizes */}
                                        <div className="aspect-[4/3] bg-slate-50 border-b border-slate-100 flex items-center justify-center group-hover:bg-indigo-50/20 transition-colors relative overflow-hidden">
                                            {model.image ? (
                                                <img src={model.image} alt={model.meta_data.nom_modele} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                                            ) : (
                                                <div className="flex flex-col items-center gap-2 transform scale-75 origin-center">
                                                    <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
                                                        <FileJson className="w-6 h-6 text-slate-300 group-hover:text-indigo-400 transition-colors" />
                                                    </div>
                                                    <span className="text-xs text-slate-400 font-medium">Aucun aperçu</span>
                                                </div>
                                            )}

                                            {/* OVERLAY ACTIONS */}
                                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 flex gap-2">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setContextMenu({ x: e.pageX, y: e.pageY, modelId: model.id });
                                                    }}
                                                    className="p-1.5 bg-white/90 backdrop-blur-sm rounded-full shadow-sm text-slate-600 hover:text-indigo-600 hover:bg-white"
                                                >
                                                    <MoreVertical className="w-4 h-4" />
                                                </button>
                                            </div>

                                            {/* CATEGORY BADGE */}
                                            {model.meta_data.category && (
                                                <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-md text-white px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide flex items-center gap-1 shadow-sm max-w-[90%]">
                                                    <LayoutGrid className="w-2.5 h-2.5 shrink-0" />
                                                    <span className="truncate">{model.meta_data.category}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Card Body */}
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
                                                        className="w-full text-sm font-bold border-b-2 border-indigo-500 outline-none pb-1"
                                                    />
                                                ) : (
                                                    <h3 className="font-bold text-slate-800 text-sm truncate" title={model.meta_data.nom_modele}>
                                                        {model.meta_data.nom_modele}
                                                    </h3>
                                                )}
                                                {model.meta_data.date_lancement && (
                                                    <p className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
                                                        <Calendar className="w-3 h-3 text-slate-400" />
                                                        {new Date(model.meta_data.date_lancement).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                    </p>
                                                )}
                                            </div>

                                            <div className="mt-auto grid grid-cols-2 gap-2">
                                                <div className="bg-slate-50 rounded-lg p-1.5 border border-slate-100 flex flex-col items-center justify-center">
                                                    <Clock className="w-3 h-3 text-slate-400 mb-0.5" />
                                                    <span className="text-[10px] font-bold text-slate-700">{model.meta_data.total_temps.toFixed(2)}m</span>
                                                </div>
                                                <div className="bg-slate-50 rounded-lg p-1.5 border border-slate-100 flex flex-col items-center justify-center">
                                                    <Users className="w-3 h-3 text-slate-400 mb-0.5" />
                                                    <span className="text-[10px] font-bold text-slate-700">{model.meta_data.effectif} Op.</span>
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
                                        onDoubleClick={() => onLoadModel(model)}
                                        onContextMenu={(e) => {
                                            e.preventDefault();
                                            setContextMenu({ x: e.pageX, y: e.pageY, modelId: model.id });
                                        }}
                                        className="group bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 flex items-center p-2 gap-4 cursor-pointer transition-all duration-200"
                                    >
                                        {/* List View Image */}
                                        <div className="w-16 h-16 shrink-0 bg-slate-50 rounded-lg overflow-hidden border border-slate-100 flex items-center justify-center relative">
                                            {model.image ? (
                                                <img src={model.image} alt={model.meta_data.nom_modele} className="w-full h-full object-cover" />
                                            ) : (
                                                <FileJson className="w-6 h-6 text-slate-300" />
                                            )}
                                        </div>

                                        {/* List View Details */}
                                        <div className="flex-1 min-w-0">
                                            {renamingId === model.id ? (
                                                <input
                                                    type="text"
                                                    value={renameValue}
                                                    onChange={(e) => setRenameValue(e.target.value)}
                                                    onBlur={() => handleRenameSubmit(model.id)}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit(model.id)}
                                                    autoFocus
                                                    className="w-full max-w-xs text-sm font-bold border-b-2 border-indigo-500 outline-none pb-1"
                                                />
                                            ) : (
                                                <h3 className="font-bold text-slate-800 text-sm truncate">{model.meta_data.nom_modele}</h3>
                                            )}
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full font-bold uppercase tracking-wide">
                                                    {model.meta_data.category || "Standard"}
                                                </span>
                                                <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" />
                                                    {new Date(model.meta_data.date_creation).toLocaleDateString()}
                                                </span>
                                            </div>
                                        </div>

                                        {/* List View Stats */}
                                        <div className="flex items-center gap-6 mr-4 hidden sm:flex">
                                            <div className="flex flex-col items-center w-16">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase">Temps</span>
                                                <span className="text-sm font-bold text-slate-700">{model.meta_data.total_temps.toFixed(2)}m</span>
                                            </div>
                                            <div className="flex flex-col items-center w-16">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase">Effectif</span>
                                                <span className="text-sm font-bold text-slate-700">{model.meta_data.effectif} Op.</span>
                                            </div>
                                        </div>

                                        {/* List View Actions */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setContextMenu({ x: e.pageX, y: e.pageY, modelId: model.id });
                                            }}
                                            className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-indigo-600 transition-colors opacity-0 group-hover:opacity-100"
                                        >
                                            <MoreVertical className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 min-h-[400px] border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
                        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm">
                            <FolderOpen className="w-8 h-8 text-slate-300" />
                        </div>
                        <h3 className="font-bold text-slate-600 mb-1">Aucun modèle trouvé</h3>
                        <p className="text-sm mb-4">La bibliothèque est vide ou ne correspond pas à votre recherche.</p>
                        <div className="flex gap-3">
                            <button onClick={onCreateNewProject} className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg text-sm font-bold shadow-md transition-colors flex items-center gap-2">
                                <Plus className="w-4 h-4" /> Nouveau Modèle
                            </button>
                            <button onClick={triggerFileInput} className="px-4 py-2 bg-white text-slate-600 hover:bg-slate-50 rounded-lg text-sm font-bold border border-slate-200 transition-colors">
                                Importer
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* CONTEXT MENU PORTAL */}
            {contextMenu && createPortal(
                <div
                    className="fixed bg-white rounded-xl shadow-2xl border border-slate-100 w-56 z-[9999] py-1.5 animate-in fade-in zoom-in-95 duration-100 origin-top-left overflow-hidden"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {activeModel && (
                        <>
                            <button
                                type="button"
                                onClick={() => {
                                    onLoadModel(activeModel);
                                    setContextMenu(null);
                                }}
                                className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 flex items-center gap-3 transition-colors"
                            >
                                <FolderOpen className="w-4 h-4" /> Ouvrir dans l'Atelier / Méthodes
                            </button>

                            {onTransferToCoupe && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        onTransferToCoupe(activeModel);
                                        setContextMenu(null);
                                    }}
                                    className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-600 flex items-center gap-3 transition-colors"
                                >
                                    <Scissors className="w-4 h-4" /> Transférer vers La Coupe
                                </button>
                            )}

                            {onTransferToPlanning && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        onTransferToPlanning(activeModel);
                                        setContextMenu(null);
                                    }}
                                    className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-600 flex items-center gap-3 transition-colors"
                                >
                                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /></svg>
                                    Transférer vers Planning
                                </button>
                            )}

                            <div className="h-px bg-slate-100 my-1"></div>

                            <button
                                type="button"
                                onClick={() => handleRenameStart(activeModel)}
                                className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-3 transition-colors"
                            >
                                <Edit2 className="w-4 h-4" /> Renommer
                            </button>

                            <button
                                type="button"
                                onClick={() => handleDuplicate(activeModel)}
                                className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-3 transition-colors"
                            >
                                <Copy className="w-4 h-4" /> Dupliquer
                            </button>

                            <button
                                type="button"
                                onClick={() => handleShare(activeModel)}
                                className="w-full text-left px-4 py-2.5 text-xs font-bold text-emerald-600 hover:bg-emerald-50 flex items-center gap-3 transition-colors"
                            >
                                <Share2 className="w-4 h-4" /> Partager / Envoyer
                            </button>

                            <button
                                type="button"
                                onClick={() => handleExport(activeModel)}
                                className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-3 transition-colors"
                            >
                                <Download className="w-4 h-4" /> Exporter (JSON)
                            </button>

                            <div className="h-px bg-slate-100 my-1"></div>

                            <button
                                type="button"
                                onClick={() => {
                                    setDeleteConfirm({ id: activeModel.id, name: activeModel.meta_data.nom_modele });
                                    setContextMenu(null);
                                }}
                                className="w-full text-left px-4 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-3 transition-colors"
                            >
                                <Trash2 className="w-4 h-4" /> Supprimer
                            </button>
                        </>
                    )}
                </div>,
                document.body
            )}

            {/* DELETE CONFIRMATION MODAL */}
            {deleteConfirm && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden p-6 text-center transform scale-100 transition-all">
                        <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-600">
                            <Trash2 className="w-8 h-8" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-800 mb-2">Confirmer la suppression</h3>
                        <p className="text-slate-500 text-sm mb-6 leading-relaxed">
                            Êtes-vous sûr de vouloir supprimer le modèle <br />
                            <span className="font-bold text-slate-800">"{deleteConfirm.name}"</span> ? <br />
                            <span className="text-rose-500 font-medium text-xs">Cette action est irréversible.</span>
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-bold text-sm transition-colors"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={() => { onDeleteModel(deleteConfirm.id); setDeleteConfirm(null); }}
                                className="flex-1 px-4 py-2.5 bg-rose-600 text-white hover:bg-rose-700 rounded-xl font-bold text-sm shadow-lg shadow-rose-200 transition-colors"
                            >
                                Supprimer
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

        </div>
    );
}
