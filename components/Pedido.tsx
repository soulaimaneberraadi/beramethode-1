import React, { useRef, useState, useEffect, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    Calendar,
    Layers,
    Plus,
    Trash2,
    Edit,
    Grid3X3,
    ChevronDown,
    ChevronRight,
    AlertTriangle,
    CheckCircle,
    Clock,
    Package,
    Truck,
    Scissors
} from 'lucide-react';
import { FicheData, AppSettings, PlanningEvent } from '../types';
import DateTimePicker from './ui/DateTimePicker';
import RepartitionMatrix from './RepartitionMatrix';
import MaterialDetailModal from './MaterialDetailModal';
import { resolveStock } from '../lib/magasinMatch';
import { confirmReceptionLocal } from '../lib/confirmReception';
import FactureUploader from './FactureUploader';
import { fmt } from '../constants';
import { getMaterialAvailability } from './planning/hooks/usePlanningValidation';
import { tx, pickT } from '../lib/i18n';
import type { Lang } from '../app/constants';

const LAUNCH_HOUR_OPTS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const LAUNCH_MINUTE_OPTS = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

const PEDIDO_LABELS = {
    fr: {
        identification: 'Identification de la Commande',
        client: 'Client',
        clientPlaceholder: 'Nom du Client',
        modelRef: 'ModÃ¨le / RÃ©f',
        modelPlaceholder: 'RÃ©fÃ©rence ModÃ¨le',
        category: 'CatÃ©gorie',
        optional: 'facultatif',
        categoryPlaceholder: 'Famille produit (ex. T-Shirt)',
        categoryHelp: 'Laisse vide si besoin : tu peux passer aux Ã©tapes suivantes et enregistrer sans catÃ©gorie.',
        launchTitle: 'Date & heure de lancement',
        chooseDate: 'Choisir une date',
        pickLaunchTime: 'Choisir lâ€™heure de lancement',
        timePickerDialog: 'Grille heure et minutes',
        hoursHeading: 'Heures (24h)',
        minutesHeading: 'Minutes',
        badge24h: '24h',
        launchHelp: 'Heure en 24 h â€” alignÃ©e avec le Planning et le Suivi Ã  lâ€™enregistrement du modÃ¨le.',
    },
    ar: {
        identification: 'ØªØ¹Ø±ÙŠÙ Ø§Ù„Ø·Ù„Ø¨ÙŠØ©',
        client: 'Ø§Ù„Ø¹Ù…ÙŠÙ„',
        clientPlaceholder: 'Ø§Ø³Ù… Ø§Ù„Ø¹Ù…ÙŠÙ„',
        modelRef: 'Ø§Ù„Ù…ÙˆØ¯ÙŠÙ„ / Ø§Ù„Ù…Ø±Ø¬Ø¹',
        modelPlaceholder: 'Ù…Ø±Ø¬Ø¹ Ø§Ù„Ù…ÙˆØ¯ÙŠÙ„',
        category: 'Ø§Ù„ÙØ¦Ø©',
        optional: 'Ø§Ø®ØªÙŠØ§Ø±ÙŠ',
        categoryPlaceholder: 'Ø¹Ø§Ø¦Ù„Ø© Ø§Ù„Ù…Ù†ØªØ¬ (Ù…Ø«Ø§Ù„: T-Shirt)',
        categoryHelp: 'ÙŠÙ…ÙƒÙ† ØªØ±ÙƒÙ‡ ÙØ§Ø±ØºÙ‹Ø§: Ø§Ù„Ù…ØªØ§Ø¨Ø¹Ø© Ø¥Ù„Ù‰ Ø§Ù„Ù…Ø±Ø§Ø­Ù„ Ø§Ù„ØªØ§Ù„ÙŠØ© ÙˆØ§Ù„Ø­ÙØ¸ Ø¯ÙˆÙ† ÙØ¦Ø©.',
        launchTitle: 'ØªØ§Ø±ÙŠØ® ÙˆÙˆÙ‚Øª Ø§Ù„Ø§Ù†Ø·Ù„Ø§Ù‚',
        chooseDate: 'Ø§Ø®ØªØ± ØªØ§Ø±ÙŠØ®Ù‹Ø§',
        pickLaunchTime: 'Ø§Ø®ØªØ± ÙˆÙ‚Øª Ø§Ù„Ø§Ù†Ø·Ù„Ø§Ù‚',
        timePickerDialog: 'Ø¬Ø¯ÙˆÙ„ Ø§Ù„Ø³Ø§Ø¹Ø§Øª ÙˆØ§Ù„Ø¯Ù‚Ø§Ø¦Ù‚',
        hoursHeading: 'Ø³Ø§Ø¹Ø§Øª (24)',
        minutesHeading: 'Ø¯Ù‚Ø§Ø¦Ù‚',
        badge24h: '24',
        launchHelp: 'ØªÙˆÙ‚ÙŠØª 24 Ø³Ø§Ø¹Ø© â€” ÙŠØªÙˆØ§ÙÙ‚ Ù…Ø¹ Ø§Ù„ØªØ®Ø·ÙŠØ· ÙˆØ§Ù„Ù…ØªØ§Ø¨Ø¹Ø© Ø¹Ù†Ø¯ Ø­ÙØ¸ Ø§Ù„Ù†Ù…ÙˆØ°Ø¬.',
    },
    en: {
        identification: 'Order Identification',
        client: 'Client',
        clientPlaceholder: 'Client Name',
        modelRef: 'Model / Ref',
        modelPlaceholder: 'Model Reference',
        category: 'Category',
        optional: 'optional',
        categoryPlaceholder: 'Product family (e.g. T-Shirt)',
        categoryHelp: 'Leave empty if needed: you can move to the next steps and save without a category.',
        launchTitle: 'Launch date & time',
        chooseDate: 'Choose a date',
        pickLaunchTime: 'Choose the launch time',
        timePickerDialog: 'Hours and minutes grid',
        hoursHeading: 'Hours (24h)',
        minutesHeading: 'Minutes',
        badge24h: '24h',
        launchHelp: 'Time in 24h â€” aligned with the Planning and Tracking when the model is saved.',
    },
    es: {
        identification: 'IdentificaciÃ³n del Pedido',
        client: 'Cliente',
        clientPlaceholder: 'Nombre del Cliente',
        modelRef: 'Modelo / Ref',
        modelPlaceholder: 'Referencia del Modelo',
        category: 'CategorÃ­a',
        optional: 'opcional',
        categoryPlaceholder: 'Familia de producto (ej. T-Shirt)',
        categoryHelp: 'DÃ©jalo vacÃ­o si lo necesitas: puedes pasar a los siguientes pasos y guardar sin categorÃ­a.',
        launchTitle: 'Fecha y hora de lanzamiento',
        chooseDate: 'Elegir una fecha',
        pickLaunchTime: 'Elegir la hora de lanzamiento',
        timePickerDialog: 'CuadrÃ­cula de horas y minutos',
        hoursHeading: 'Horas (24h)',
        minutesHeading: 'Minutos',
        badge24h: '24h',
        launchHelp: 'Hora en 24h â€” alineada con la PlanificaciÃ³n y el Seguimiento al guardar el modelo.',
    },
    pt: {
        identification: 'IdentificaÃ§Ã£o do Pedido',
        client: 'Cliente',
        clientPlaceholder: 'Nome do Cliente',
        modelRef: 'Modelo / Ref',
        modelPlaceholder: 'ReferÃªncia do Modelo',
        category: 'Categoria',
        optional: 'opcional',
        categoryPlaceholder: 'FamÃ­lia de produto (ex. T-Shirt)',
        categoryHelp: 'Deixe vazio se necessÃ¡rio: pode passar para as etapas seguintes e guardar sem categoria.',
        launchTitle: 'Data e hora de lanÃ§amento',
        chooseDate: 'Escolher uma data',
        pickLaunchTime: 'Escolher a hora de lanÃ§amento',
        timePickerDialog: 'Grelha de horas e minutos',
        hoursHeading: 'Horas (24h)',
        minutesHeading: 'Minutos',
        badge24h: '24h',
        launchHelp: 'Hora em 24h â€” alinhada com o Planeamento e o Acompanhamento ao guardar o modelo.',
    },
    tr: {
        identification: 'SipariÅŸ TanÄ±mÄ±',
        client: 'MÃ¼ÅŸteri',
        clientPlaceholder: 'MÃ¼ÅŸteri AdÄ±',
        modelRef: 'Model / Ref',
        modelPlaceholder: 'Model ReferansÄ±',
        category: 'Kategori',
        optional: 'isteÄŸe baÄŸlÄ±',
        categoryPlaceholder: 'ÃœrÃ¼n ailesi (Ã¶rn. T-Shirt)',
        categoryHelp: 'Gerekirse boÅŸ bÄ±rak: sonraki adÄ±mlara geÃ§ip kategorisiz kaydedebilirsin.',
        launchTitle: 'BaÅŸlatma tarihi ve saati',
        chooseDate: 'Bir tarih seÃ§',
        pickLaunchTime: 'BaÅŸlatma saatini seÃ§',
        timePickerDialog: 'Saat ve dakika tablosu',
        hoursHeading: 'Saatler (24s)',
        minutesHeading: 'Dakikalar',
        badge24h: '24s',
        launchHelp: '24 saat formatÄ±nda â€” model kaydedildiÄŸinde Planlama ve Takip ile hizalÄ±.',
    },
} as const;

interface PedidoProps {
    data: FicheData;
    setData: React.Dispatch<React.SetStateAction<FicheData>>;
    articleName: string;
    setArticleName: (name: string) => void;
    lang?: Lang;
    articleNameError?: boolean;
    settings: AppSettings;
    currentModelId?: string | null;
    planningEvents?: PlanningEvent[];
    setPlanningEvents?: React.Dispatch<React.SetStateAction<PlanningEvent[]>>;
}

export default function Pedido({
    data,
    setData,
    articleName,
    setArticleName,
    lang = 'fr',
    articleNameError,
    settings,
    currentModelId = null,
    planningEvents = [],
    setPlanningEvents,
}: PedidoProps) {
    const pt = pickT(PEDIDO_LABELS, lang);

    // Material detail modal state
    const [selectedMaterial, setSelectedMaterial] = useState<any>(null);
    const [magasinData, setMagasinData] = useState<any[]>([]);

    // Confirmation de rÃ©ception (entrÃ©e stock + BR pour le Planning)
    const [confirmModal, setConfirmModal] = useState<{ open: boolean; mat?: any; qty: string }>({ open: false, qty: '' });

    const handleConfirmReception = () => {
        const m = confirmModal.mat;
        const qty = Math.max(0, parseFloat(confirmModal.qty) || 0);
        if (!m || qty <= 0) return;
        const res = confirmReceptionLocal({
            materialName: m.name,
            qty,
            unit: m.unit,
            unitPrice: m.unitPrice,
            modelId: currentModelId || '',
            modelName: articleName,
            supplierName: m.fournisseur || null,
        });
        setMagasinData(res.updatedMagasin);
        setConfirmModal({ open: false, qty: '' });
    };

    useEffect(() => {
        try {
            const data = localStorage.getItem('beramethode_magasin');
            if (data) setMagasinData(JSON.parse(data));
        } catch (e) {
            console.error(e);
        }
    }, []);

    const modelEvents = useMemo(() => {
        if (!planningEvents) return [];
        const filtered = planningEvents.filter(e => {
            if (currentModelId && e.modelId === currentModelId) return true;
            if (articleName && e.modelName && e.modelName.toLowerCase().includes(articleName.toLowerCase())) return true;
            return false;
        });
        // Les pididos / lots sont affichÃ©s par ordre de livraison (le plus proche en premier).
        const livraisonKey = (e: typeof filtered[number]) =>
            (e.strictDeadline_DDS || e.dateExport || '9999-12-31').split('T')[0];
        return [...filtered].sort((a, b) => livraisonKey(a).localeCompare(livraisonKey(b)));
    }, [planningEvents, currentModelId, articleName]);

    /** Prochain code de lot auto-incrÃ©mentÃ© (L1 â†’ L2 â†’ â€¦ â†’ Ln+1) selon les lots existants du modÃ¨le. */
    const nextLotCode = useMemo(() => {
        let max = 0;
        modelEvents.forEach(e => {
            const name = e.modelName || '';
            const suffix = name.includes(' â€” ') ? name.split(' â€” ').slice(1).join(' â€” ') : name;
            const m = suffix.trim().match(/^L\s*(\d+)/i);
            if (m) max = Math.max(max, parseInt(m[1], 10));
        });
        return `L${max + 1}`;
    }, [modelEvents]);

    const getStatusMeta = (status: string | undefined) => {
        if (status === 'EXTERNAL_PROCESS') {
            return {
                label: tx(lang, { fr: 'Proc. Externe', ar: 'Ø¹Ù…Ù„ÙŠØ© Ø®Ø§Ø±Ø¬ÙŠØ©', en: 'Ext. Process', es: 'Proc. Externo', pt: 'Proc. Externo', tr: 'DÄ±ÅŸ Ä°ÅŸlem' }),
                dot: 'bg-amber-500',
                text: 'text-amber-700',
                bg: 'bg-amber-50 dark:bg-amber-900/30',
                border: 'border-amber-200'
            };
        }
        if (status === 'BLOCKED_STOCK') {
            return {
                label: tx(lang, { fr: 'BloquÃ© stock', ar: 'Ù…ØªÙˆÙ‚Ù / Ø­Ø§Ø¨Ø³', en: 'Stock blocked', es: 'Stock bloqueado', pt: 'Stock bloqueado', tr: 'Stok engelli' }),
                dot: 'bg-red-500',
                text: 'text-red-700',
                bg: 'bg-red-50 dark:bg-red-900/30',
                border: 'border-red-200'
            };
        }
        const s = status === 'DONE' ? 'DONE' : status === 'BLOCKED_STOCK' ? 'BLOCKED' : (status === 'IN_PROGRESS' || status === 'ON_TRACK' || status === 'AT_RISK' || status === 'OFF_TRACK') ? 'IN_PROGRESS' : 'READY';
        const meta = {
            READY: { label: tx(lang, { fr: 'PrÃªt', ar: 'Ø¬Ø§Ù‡Ø²', en: 'Ready', es: 'Listo', pt: 'Pronto', tr: 'HazÄ±r' }), dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50 dark:bg-emerald-900/30', border: 'border-emerald-200' },
            BLOCKED: { label: tx(lang, { fr: 'BloquÃ©', ar: 'Ù…ØªÙˆÙ‚Ù', en: 'Blocked', es: 'Bloqueado', pt: 'Bloqueado', tr: 'Engelli' }), dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50 dark:bg-red-900/30', border: 'border-red-200' },
            IN_PROGRESS: { label: tx(lang, { fr: 'En cours', ar: 'ÙÙŠ Ø·ÙˆØ± Ø§Ù„Ø¥Ù†Ø¬Ø§Ø²', en: 'In progress', es: 'En curso', pt: 'Em curso', tr: 'Devam ediyor' }), dot: 'bg-[#2149C1]', text: 'text-[#1a3ba5]', bg: 'bg-blue-50 dark:bg-blue-900/30', border: 'border-blue-200' },
            DONE: { label: tx(lang, { fr: 'TerminÃ©', ar: 'Ù…ÙƒØªÙ…Ù„', en: 'Done', es: 'Terminado', pt: 'ConcluÃ­do', tr: 'TamamlandÄ±' }), dot: 'bg-slate-400', text: 'text-slate-600 dark:text-dk-text-soft', bg: 'bg-slate-50 dark:bg-dk-bg', border: 'border-slate-200 dark:border-dk-border' },
        };
        return meta[s] || meta.READY;
    };

    // Accordion state: only one lot expanded at a time
    const [expandedLotId, setExpandedLotId] = useState<string | null>(null);

    // -- INLINE CLIENT SPLITS EDITOR STATES & HANDLERS --
    const [editingEventId, setEditingEventId] = useState<string | 'new' | null>(null);
    const [editDraft, setEditDraft] = useState<Partial<PlanningEvent> | null>(null);

    const startEditNew = () => {
        const initialDist: Record<string, Record<string, number>> = {};
        colors.forEach(c => {
            if (c.id !== 'total' && c.name.toLowerCase() !== 'total') {
                initialDist[c.id] = {};
                sizes.forEach(s => {
                    if (s.toLowerCase() !== 'total') {
                        initialDist[c.id][s] = 0;
                    }
                });
            }
        });

        const today = new Date().toISOString().split('T')[0];
        setEditDraft({
            id: `PE-${Date.now()}`,
            modelId: currentModelId || '',
            chaineId: 'CHAINE 1',
            dateLancement: today,
            dateExport: today,
            strictDeadline_DDS: today,
            startDate: today,
            fournisseurDate: '',
            clientName: data.client || '',
            status: 'READY',
            sizeColorDistribution: initialDist,
            qteTotal: 0,
            modelName: `${articleName || ''} â€” ${nextLotCode}`
        });
        setEditingEventId('new');
    };

    const startEditExisting = (evt: PlanningEvent) => {
        setEditDraft({ ...evt });
        setEditingEventId(evt.id);
    };

    const deleteEvent = (eventId: string) => {
        const confirmMsg = tx(lang, {
            fr: 'ÃŠtes-vous sÃ»r de vouloir supprimer ce lot ? Il sera Ã©galement retirÃ© du planning.',
            ar: 'Ù‡Ù„ Ø£Ù†Øª Ù…ØªØ£ÙƒØ¯ Ù…Ù† Ø±ØºØ¨ØªÙƒ ÙÙŠ Ø­Ø°Ù Ù‡Ø°Ù‡ Ø§Ù„Ø¯ÙØ¹Ø©ØŸ Ø³ÙŠØªÙ… Ø¥Ø²Ø§Ù„ØªÙ‡Ø§ Ù…Ù† Ø¬Ø¯ÙˆÙ„ Ø§Ù„ØªØ®Ø·ÙŠØ· Ø£ÙŠØ¶Ø§Ù‹.',
            en: 'Are you sure you want to delete this lot? It will also be removed from the planning.',
            es: 'Â¿Seguro que quieres eliminar este lote? TambiÃ©n se eliminarÃ¡ de la planificaciÃ³n.',
            pt: 'Tem a certeza de que deseja eliminar este lote? TambÃ©m serÃ¡ removido do planeamento.',
            tr: 'Bu partiyi silmek istediÄŸinizden emin misiniz? Planlamadan da kaldÄ±rÄ±lacaktÄ±r.',
        });
        if (window.confirm(confirmMsg)) {
            if (setPlanningEvents) {
                setPlanningEvents(prev => prev.filter(e => e.id !== eventId));
            }
        }
    };

    const handleSaveEdit = () => {
        if (!editDraft || !setPlanningEvents) return;
        
        const fullName = editDraft.modelName || '';
        const parts = fullName.split(' â€” ');
        const suffix = parts.length > 1 ? parts.slice(1).join(' â€” ').trim() : fullName.trim();
        
        if (!suffix) {
            alert(tx(lang, {
                fr: 'Veuillez saisir un libellÃ© ou suffixe pour le lot (ex: L1).',
                ar: 'ÙŠØ±Ø¬Ù‰ Ø¥Ø¯Ø®Ø§Ù„ Ø±Ù…Ø² Ø£Ùˆ Ø§Ø³Ù… Ø§Ù„Ø¯ÙØ¹Ø© (Ù…Ø«Ø§Ù„: L1)',
                en: 'Please enter a label or suffix for the lot (e.g. L1).',
                es: 'Introduce una etiqueta o sufijo para el lote (ej. L1).',
                pt: 'Introduza um rÃ³tulo ou sufixo para o lote (ex. L1).',
                tr: 'Parti iÃ§in bir etiket veya sonek girin (Ã¶rn. L1).',
            }));
            return;
        }

        let calculatedTotal = 0;
        if (editDraft.sizeColorDistribution) {
            Object.values(editDraft.sizeColorDistribution).forEach(sizeMap => {
                Object.values(sizeMap).forEach(qty => {
                    calculatedTotal += Number(qty) || 0;
                });
            });
        } else {
            calculatedTotal = editDraft.qteTotal || 0;
        }
        
        const finalDraft: PlanningEvent = {
            ...editDraft,
            modelId: editDraft.modelId || currentModelId || '',
            modelName: `${articleName || ''} â€” ${suffix}`,
            qteTotal: calculatedTotal,
            totalQuantity: calculatedTotal,
            startDate: editDraft.dateLancement,
            strictDeadline_DDS: editDraft.dateExport,
        } as PlanningEvent;

        setPlanningEvents(prev => {
            const exists = prev.some(e => e.id === finalDraft.id);
            if (exists) {
                return prev.map(e => e.id === finalDraft.id ? finalDraft : e);
            } else {
                return [...prev, finalDraft];
            }
        });

        setEditingEventId(null);
        setEditDraft(null);
    };

    const handleCancelEdit = () => {
        setEditingEventId(null);
        setEditDraft(null);
    };

    // -- MATRIX STATE (lecture seule ici ; l'Ã©dition se fait via <RepartitionMatrix />) --
    const sizes = data.sizes || [];
    const colors = data.colors || [];
    const gridQuantities = data.gridQuantities || {};

    const matrixStats = useMemo(() => {
        const rowTotals: Record<string, number> = {};
        const colTotals: Record<number, number> = {};
        let grandTotal = 0;

        colors.forEach(c => {
            rowTotals[c.id] = 0;
            sizes.forEach((_, sIdx) => {
                const key = `${c.id}_${sIdx}`;
                const val = gridQuantities[key] || 0;
                rowTotals[c.id] += val;
                colTotals[sIdx] = (colTotals[sIdx] || 0) + val;
                grandTotal += val;
            });
        });

        return { rowTotals, colTotals, grandTotal };
    }, [sizes, colors, gridQuantities]);

    // Update Global Quantity when matrix changes
    useEffect(() => {
        if (matrixStats.grandTotal > 0) {
            setData(prev => ({ ...prev, quantity: matrixStats.grandTotal }));
        }
    }, [matrixStats.grandTotal, setData]);

    const planifiedTotals = useMemo(() => {
        const totals: Record<string, Record<string, number>> = {};
        
        colors.forEach(c => {
            if (c.id !== 'total' && c.name.toLowerCase() !== 'total') {
                totals[c.id] = {};
                sizes.forEach(s => {
                    if (s.toLowerCase() !== 'total') {
                        totals[c.id][s] = 0;
                    }
                });
            }
        });

        modelEvents.forEach(evt => {
            const isEditingThis = evt.id === editingEventId;
            const dist = isEditingThis && editDraft ? editDraft.sizeColorDistribution : evt.sizeColorDistribution;
            if (dist) {
                Object.keys(dist).forEach(colorId => {
                    const sizeMap = dist[colorId];
                    if (sizeMap) {
                        Object.keys(sizeMap).forEach(sizeName => {
                            const qty = Number(sizeMap[sizeName]) || 0;
                            if (totals[colorId] && totals[colorId][sizeName] !== undefined) {
                                totals[colorId][sizeName] += qty;
                            }
                        });
                    }
                });
            }
        });

        if (editingEventId === 'new' && editDraft && editDraft.sizeColorDistribution) {
            const dist = editDraft.sizeColorDistribution;
            Object.keys(dist).forEach(colorId => {
                const sizeMap = dist[colorId];
                if (sizeMap) {
                    Object.keys(sizeMap).forEach(sizeName => {
                        const qty = Number(sizeMap[sizeName]) || 0;
                        if (totals[colorId] && totals[colorId][sizeName] !== undefined) {
                            totals[colorId][sizeName] += qty;
                        }
                    });
                }
            });
        }

        return totals;
    }, [modelEvents, editingEventId, editDraft, colors, sizes]);

    const reconciliationDiscrepancies = useMemo(() => {
        let hasErrors = false;
        const diffs: Record<string, Record<string, number>> = {};
        
        colors.forEach(c => {
            if (c.id !== 'total' && c.name.toLowerCase() !== 'total') {
                diffs[c.id] = {};
                sizes.forEach((s, sIdx) => {
                    if (s.toLowerCase() !== 'total') {
                        const targetVal = Number(gridQuantities[`${c.id}_${sIdx}`]) || 0;
                        const plannedVal = planifiedTotals[c.id]?.[s] || 0;
                        const diff = plannedVal - targetVal;
                        diffs[c.id][s] = diff;
                        if (diff !== 0) {
                            hasErrors = true;
                        }
                    }
                });
            }
        });

        return { hasErrors, diffs };
    }, [colors, sizes, gridQuantities, planifiedTotals]);

    const planifiedTotalsExcludingCurrent = useMemo(() => {
        const totals: Record<string, Record<string, number>> = {};
        
        colors.forEach(c => {
            if (c.id !== 'total' && c.name.toLowerCase() !== 'total') {
                totals[c.id] = {};
                sizes.forEach(s => {
                    if (s.toLowerCase() !== 'total') {
                        totals[c.id][s] = 0;
                    }
                });
            }
        });

        modelEvents.forEach(evt => {
            if (evt.id === editingEventId) return;
            const dist = evt.sizeColorDistribution;
            if (dist) {
                Object.keys(dist).forEach(colorId => {
                    const sizeMap = dist[colorId];
                    if (sizeMap) {
                        Object.keys(sizeMap).forEach(sizeName => {
                            const qty = Number(sizeMap[sizeName]) || 0;
                            if (totals[colorId] && totals[colorId][sizeName] !== undefined) {
                                totals[colorId][sizeName] += qty;
                            }
                        });
                    }
                });
            }
        });

        return totals;
    }, [modelEvents, editingEventId, colors, sizes]);

    const totalCible = useMemo(() => {
        return matrixStats.grandTotal || data.quantity || 0;
    }, [matrixStats.grandTotal, data.quantity]);

    const totalPlanified = useMemo(() => {
        return modelEvents.reduce((sum, e) => sum + (e.qteTotal || e.totalQuantity || 0), 0);
    }, [modelEvents]);

    const totalProduced = useMemo(() => {
        return modelEvents.reduce((sum, e) => sum + (e.qteProduite || e.producedQuantity || 0), 0);
    }, [modelEvents]);

    const plannedCoverPct = useMemo(() => {
        if (totalCible <= 0) return 0;
        return Math.round((totalPlanified / totalCible) * 100);
    }, [totalPlanified, totalCible]);

    const globalCompletionPct = useMemo(() => {
        if (totalCible <= 0) return 0;
        return Math.round((totalProduced / totalCible) * 100);
    }, [totalProduced, totalCible]);

    const handleChange = (field: keyof FicheData, value: any) => {
        setData(prev => ({ ...prev, [field]: value }));
    };

    const launchHM = useMemo(() => {
        const raw = (data.launchTime ?? '08:00').trim();
        const m = /^(\d{1,2}):(\d{2})$/.exec(raw);
        if (!m) return { h: '08', min: '00' };
        const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
        const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
        return { h: String(h).padStart(2, '0'), min: String(min).padStart(2, '0') };
    }, [data.launchTime]);

    const [launchTimeOpen, setLaunchTimeOpen] = useState(false);
    const [launchPopPos, setLaunchPopPos] = useState({ top: 0, left: 0, width: 280 });
    const launchTimePickerRef = useRef<HTMLDivElement>(null);
    const launchTimeBtnRef = useRef<HTMLButtonElement>(null);
    const launchTimePopRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        if (!launchTimeOpen || !launchTimeBtnRef.current) return;
        const update = () => {
            const el = launchTimeBtnRef.current;
            if (!el) return;
            const r = el.getBoundingClientRect();
            const w = 320;
            let left = r.left + (r.width - w) / 2;
            if (left < 12) left = 12;
            if (left + w > window.innerWidth - 12) left = window.innerWidth - w - 12;
            setLaunchPopPos({ top: r.bottom + 8, left, width: w });
        };
        update();
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        return () => {
            window.removeEventListener('scroll', update, true);
            window.removeEventListener('resize', update);
        };
    }, [launchTimeOpen]);

    useEffect(() => {
        if (!launchTimeOpen) return;
        const onDoc = (e: MouseEvent) => {
            const t = e.target as Node;
            if (launchTimePickerRef.current?.contains(t)) return;
            if (launchTimePopRef.current?.contains(t)) return;
            setLaunchTimeOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setLaunchTimeOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [launchTimeOpen]);


    const renderEditorForm = () => {
        if (!editDraft) return null;
        
        const fullName = editDraft.modelName || '';
        const parts = fullName.split(' â€” ');
        const suffix = parts.length > 1 ? parts.slice(1).join(' â€” ') : '';
        
        const filteredSizes = (sizes || []).filter(s => s.toLowerCase() !== 'total');
        const filteredColors = (colors || []).filter(c => c.name.toLowerCase() !== 'total' && c.id.toLowerCase() !== 'total');
        const hasGrid = filteredSizes.length > 0 && filteredColors.length > 0;

        return (
            <div className="border-2 border-indigo-500/30 rounded-xl p-5 bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20/10 space-y-5 animate-in fade-in duration-200 shadow-md dark:shadow-dk-md">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-dk-border pb-3">
                    <h4 className="font-black text-sm text-indigo-900 flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text" />
                        {editingEventId === 'new'
                            ? tx(lang, { fr: 'Nouveau lot de livraison', ar: 'Ø¥Ø¶Ø§ÙØ© Ø¯ÙØ¹Ø© ØªØ³Ù„ÙŠÙ… Ø¬Ø¯ÙŠØ¯Ø©', en: 'New delivery lot', es: 'Nuevo lote de entrega', pt: 'Novo lote de entrega', tr: 'Yeni teslimat partisi' })
                            : tx(lang, { fr: 'Modifier le lot de livraison', ar: 'ØªØ¹Ø¯ÙŠÙ„ Ø¯ÙØ¹Ø© Ø§Ù„ØªØ³Ù„ÙŠÙ…', en: 'Edit delivery lot', es: 'Editar lote de entrega', pt: 'Editar lote de entrega', tr: 'Teslimat partisini dÃ¼zenle' })
                        }
                    </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Client name */}
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wide">
                            {tx(lang, { fr: 'Client', ar: 'Ø§Ù„Ø¹Ù…ÙŠÙ„', en: 'Client', es: 'Cliente', pt: 'Cliente', tr: 'MÃ¼ÅŸteri' })}
                        </label>
                        <input
                            type="text"
                            value={editDraft.clientName || ''}
                            onChange={(e) => setEditDraft(prev => prev ? { ...prev, clientName: e.target.value } : prev)}
                            placeholder={tx(lang, { fr: 'Nom du Client', ar: 'Ø§Ø³Ù… Ø§Ù„Ø¹Ù…ÙŠÙ„', en: 'Client Name', es: 'Nombre del Cliente', pt: 'Nome do Cliente', tr: 'MÃ¼ÅŸteri AdÄ±' })}
                            className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 text-slate-800 dark:text-dk-text text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-sans"
                        />
                    </div>

                    {/* Suffix / Lot Code */}
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wide">
                            {tx(lang, { fr: 'Code / LibellÃ© du lot (ex: L1)', ar: 'Ø±Ù…Ø² / Ø§Ø³Ù… Ø§Ù„Ø¯ÙØ¹Ø© (Ù…Ø«Ø§Ù„: L1)', en: 'Lot code / label (e.g. L1)', es: 'CÃ³digo / etiqueta del lote (ej. L1)', pt: 'CÃ³digo / rÃ³tulo do lote (ex. L1)', tr: 'Parti kodu / etiketi (Ã¶rn. L1)' })}
                        </label>
                        <input
                            type="text"
                            value={suffix}
                            onChange={(e) => setEditDraft(prev => prev ? { ...prev, modelName: `${articleName || ''} â€” ${e.target.value}` } : prev)}
                            placeholder="L1"
                            className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 text-slate-800 dark:text-dk-text text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all tabular-nums"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Date de lancement */}
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wide">
                            {tx(lang, { fr: 'Date de lancement', ar: 'ØªØ§Ø±ÙŠØ® Ø§Ù„Ø¥Ø·Ù„Ø§Ù‚', en: 'Launch date', es: 'Fecha de lanzamiento', pt: 'Data de lanÃ§amento', tr: 'BaÅŸlatma tarihi' })}
                        </label>
                        <div className="flex items-center gap-2 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-3 py-1.5 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
                            <Calendar className="w-4 h-4 text-indigo-500 shrink-0" />
                            <DateTimePicker
                                value={editDraft.dateLancement || editDraft.startDate || ''}
                                onChange={(iso) => setEditDraft(prev => prev ? { 
                                    ...prev, 
                                    dateLancement: iso.split('T')[0], 
                                    startDate: iso.split('T')[0]
                                } : prev)}
                                mode="date"
                                settings={settings}
                                inputClassName="w-full min-w-0 border-0 bg-transparent shadow-none text-sm font-bold text-slate-700 dark:text-dk-text-soft outline-none focus:ring-0 py-0 px-0 tabular-nums"
                                showIcon={false}
                            />
                        </div>
                        <div className="flex items-center gap-1.5 pt-1.5">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={!!editDraft.isLocked}
                                    onChange={(e) => setEditDraft(prev => prev ? { 
                                        ...prev, 
                                        isLocked: e.target.checked 
                                    } : prev)}
                                    className="rounded border-slate-300 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text focus:ring-indigo-500 h-3.5 w-3.5"
                                />
                                <span className="text-[10px] font-bold text-slate-500 dark:text-dk-muted select-none">
                                    {tx(lang, { 
                                        fr: "Figer la date (ne pas dÃ©caler)", 
                                        ar: "ØªØ«Ø¨ÙŠØª Ø§Ù„ØªØ§Ø±ÙŠØ® (Ø¹Ø¯Ù… Ø§Ù„ØªØ­Ø±ÙŠÙƒ)", 
                                        en: "Lock date (do not shift)" 
                                    })}
                                </span>
                            </label>
                        </div>
                    </div>

                    {/* Delivery Date / DDS */}
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wide">
                            {tx(lang, { fr: 'Date de livraison (DDS)', ar: 'ØªØ§Ø±ÙŠØ® Ø§Ù„ØªØ³Ù„ÙŠÙ… (DDS)', en: 'Delivery date (DDS)', es: 'Fecha de entrega (DDS)', pt: 'Data de entrega (DDS)', tr: 'Teslimat tarihi (DDS)' })}
                        </label>
                        <div className="flex items-center gap-2 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-3 py-1.5 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
                            <Calendar className="w-4 h-4 text-emerald-500 shrink-0" />
                            <DateTimePicker
                                value={editDraft.dateExport || editDraft.strictDeadline_DDS || ''}
                                onChange={(iso) => setEditDraft(prev => prev ? { 
                                    ...prev, 
                                    dateExport: iso.split('T')[0], 
                                    strictDeadline_DDS: iso.split('T')[0]
                                } : prev)}
                                mode="date"
                                settings={settings}
                                inputClassName="w-full min-w-0 border-0 bg-transparent shadow-none text-sm font-bold text-slate-700 dark:text-dk-text-soft outline-none focus:ring-0 py-0 px-0 tabular-nums"
                                showIcon={false}
                            />
                        </div>
                    </div>

                    {/* Date d'arrivÃ©e des matiÃ¨res (fournisseurDate) */}
                    <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wide">
                            {tx(lang, { fr: 'ArrivÃ©e des matiÃ¨res', ar: 'ÙˆØµÙˆÙ„ Ø§Ù„Ù…ÙˆØ§Ø¯ (Ø§Ù„Ù…ÙˆØ±Ø¯)', en: 'Materials arrival', es: 'Llegada de materiales', pt: 'Chegada dos materiais', tr: 'Malzeme varÄ±ÅŸÄ±' })}
                        </label>
                        <div className="flex items-center gap-2 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-3 py-1.5 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
                            <Truck className="w-4 h-4 text-amber-500 shrink-0" />
                            <DateTimePicker
                                value={editDraft.fournisseurDate || ''}
                                onChange={(iso) => setEditDraft(prev => prev ? { 
                                    ...prev, 
                                    fournisseurDate: iso.split('T')[0]
                                } : prev)}
                                mode="date"
                                settings={settings}
                                inputClassName="w-full min-w-0 border-0 bg-transparent shadow-none text-sm font-bold text-slate-700 dark:text-dk-text-soft outline-none focus:ring-0 py-0 px-0 tabular-nums"
                                showIcon={false}
                            />
                        </div>
                    </div>
                </div>

                {/* Size Color distribution grid */}
                {hasGrid ? (
                    <div className="space-y-2">
                        <div className="text-[11px] font-bold text-slate-500 dark:text-dk-muted uppercase tracking-wide flex items-center gap-1.5 font-sans">
                            <Grid3X3 className="w-3.5 h-3.5" />
                            {tx(lang, { fr: 'RÃ©partition des quantitÃ©s du lot', ar: 'Ø§Ù„ØªÙˆØ²ÙŠØ¹ Ø¨Ø§Ù„ØªÙØµÙŠÙ„ Ù„Ù„Ø¯ÙØ¹Ø©', en: 'Lot quantity breakdown', es: 'DistribuciÃ³n de cantidades del lote', pt: 'DistribuiÃ§Ã£o das quantidades do lote', tr: 'Parti miktar daÄŸÄ±lÄ±mÄ±' })}
                        </div>
                        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface shadow-sm dark:shadow-dk-sm">
                            <table className="w-full text-xs border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-dk-bg text-slate-500 dark:text-dk-muted border-b border-slate-200 dark:border-dk-border font-bold">
                                        <th className="py-2.5 px-3 text-left border-r border-slate-100 dark:border-dk-border min-w-[120px]">Couleur / Taille</th>
                                        {filteredSizes.map((s, i) => (
                                            <th key={i} className="py-2 px-2 text-center border-r border-slate-100 dark:border-dk-border min-w-[60px]">
                                                {s}
                                            </th>
                                        ))}
                                        <th className="py-2 px-3 text-center bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20/50 text-indigo-800 w-20">TOTAL</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                                    {filteredColors.map((c, cIdx) => {
                                        let rowTotal = 0;
                                        return (
                                            <tr key={`${c.id}-${cIdx}`} className="hover:bg-slate-50/30">
                                                <td className="py-2 px-3 border-r border-slate-100 dark:border-dk-border font-semibold text-slate-700 dark:text-dk-text-soft flex items-center gap-2">
                                                    <div
                                                    className={`w-3 h-3 rounded-full flex-shrink-0 ${c.id && c.id.startsWith('#') ? '' : 'bg-slate-300'}`}
                                                        style={c.id && c.id.startsWith('#') ? { backgroundColor: c.id } : undefined}
                                                    />
                                                    <span className="truncate max-w-[100px]" title={c.name}>{c.name}</span>
                                                </td>
                                                {filteredSizes.map((s) => {
                                                    const qty = editDraft.sizeColorDistribution?.[c.id]?.[s] ?? 0;
                                                    rowTotal += qty;
                                                    
                                                    const sIdx = sizes.indexOf(s);
                                                    const targetVal = Number(gridQuantities[`${c.id}_${sIdx}`]) || 0;
                                                    const otherVal = planifiedTotalsExcludingCurrent[c.id]?.[s] || 0;
                                                    const totalVal = otherVal + qty;
                                                    const diff = totalVal - targetVal;
                                                    
                                                    return (
                                                        <td key={s} className="py-2 px-1.5 text-center border-r border-slate-100 dark:border-dk-border align-top">
                                                            <div className="flex flex-col items-center gap-1">
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    value={qty || ''}
                                                                    onChange={(e) => {
                                                                        const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                                                        setEditDraft(prev => {
                                                                            if (!prev) return prev;
                                                                            const dist = { ...prev.sizeColorDistribution };
                                                                            if (!dist[c.id]) dist[c.id] = {};
                                                                            dist[c.id] = { ...dist[c.id], [s]: val };
                                                                            return { ...prev, sizeColorDistribution: dist };
                                                                        });
                                                                    }}
                                                                    className={`w-14 text-center border rounded-lg py-1 tabular-nums text-xs font-semibold focus:ring-2 transition-all outline-none ${
                                                                        diff !== 0 
                                                                            ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-100 bg-rose-50 dark:bg-rose-900/30/20 text-rose-700' 
                                                                            : 'border-slate-200 dark:border-dk-border focus:border-indigo-500 focus:ring-indigo-100 text-slate-800 dark:text-dk-text'
                                                                    }`}
                                                                    placeholder="0"
                                                                />
                                                                <div className="flex flex-col items-center text-[9px] tabular-nums leading-none">
                                                                    <span className="text-slate-400 dark:text-dk-muted">/{targetVal}</span>
                                                                    {diff !== 0 ? (
                                                                        <span className="text-rose-600 dark:text-rose-400 font-bold mt-0.5" title={diff > 0 ? tx(lang, { fr: `${diff} de trop`, ar: `${diff} Ø²Ø§Ø¦Ø¯`, en: `${diff} too many`, es: `${diff} de mÃ¡s`, pt: `${diff} a mais`, tr: `${diff} fazla` }) : tx(lang, { fr: `${diff} manquant`, ar: `${diff} Ù†Ø§Ù‚Øµ`, en: `${diff} missing`, es: `${diff} faltante`, pt: `${diff} em falta`, tr: `${diff} eksik` })}>
                                                                            {diff > 0 ? `+${diff}` : diff}
                                                                        </span>
                                                                    ) : (
                                                                        qty > 0 && <span className="text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">âœ“</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </td>
                                                    );
                                                })}
                                                <td className="py-2 px-3 text-center tabular-nums font-bold bg-slate-50 dark:bg-dk-bg/50 text-slate-700 dark:text-dk-text-soft">
                                                    {rowTotal}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-1 max-w-xs">
                        <label className="text-[11px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wide">
                            {tx(lang, { fr: 'QuantitÃ© totale', ar: 'Ø§Ù„ÙƒÙ…ÙŠØ© Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠØ©', en: 'Total quantity', es: 'Cantidad total', pt: 'Quantidade total', tr: 'Toplam miktar' })}
                        </label>
                        <input
                            type="number"
                            min="0"
                            value={editDraft.qteTotal || ''}
                            onChange={(e) => setEditDraft(prev => prev ? { ...prev, qteTotal: Math.max(0, parseInt(e.target.value, 10) || 0) } : prev)}
                            className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 text-slate-800 dark:text-dk-text text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all tabular-nums"
                        />
                    </div>
                )}

                {/* Form Buttons */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-dk-border">
                    <div className="text-xs text-slate-400 dark:text-dk-muted font-bold">
                        {tx(lang, { fr: 'Total calculÃ©:', ar: 'Ø§Ù„Ù…Ø¬Ù…ÙˆØ¹ Ø§Ù„Ù…Ø­Ø³ÙˆØ¨:', en: 'Calculated total:', es: 'Total calculado:', pt: 'Total calculado:', tr: 'Hesaplanan toplam:' })} {' '}
                        <span className="text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text font-black tabular-nums">
                            {hasGrid 
                                ? Object.values(editDraft.sizeColorDistribution || {}).reduce(
                                    (sum, sizeMap) => sum + Object.values(sizeMap).reduce((s, val) => s + (val || 0), 0), 
                                    0
                                  )
                                : (editDraft.qteTotal || 0)
                            } pcs
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {editingEventId !== 'new' && (
                            <button
                                type="button"
                                onClick={() => deleteEvent(editDraft.id || '')}
                                className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-bold text-rose-600 dark:text-rose-400 border border-rose-200 bg-rose-50 dark:bg-rose-900/30 hover:bg-rose-100 rounded-lg transition-colors"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                {tx(lang, { fr: 'Supprimer', ar: 'Ø­Ø°Ù', en: 'Delete', es: 'Eliminar', pt: 'Eliminar', tr: 'Sil' })}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handleCancelEdit}
                            className="inline-flex items-center h-8 px-3 text-xs font-bold text-slate-600 dark:text-dk-text-soft bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border hover:bg-slate-50 dark:hover:bg-dk-elevated/60 rounded-lg transition-colors"
                        >
                            {tx(lang, { fr: 'Annuler', ar: 'Ø¥Ù„ØºØ§Ø¡', en: 'Cancel', es: 'Cancelar', pt: 'Cancelar', tr: 'Ä°ptal' })}
                        </button>
                        <button
                            type="button"
                            onClick={handleSaveEdit}
                            className="inline-flex items-center gap-1.5 h-8 px-4 text-xs font-bold text-white bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-700 dark:hover:bg-dk-accent-hover rounded-lg transition-colors shadow-sm dark:shadow-dk-sm"
                        >
                            {tx(lang, { fr: 'Enregistrer', ar: 'Ø­ÙØ¸ Ø§Ù„Ø¯ÙØ¹Ø©', en: 'Save', es: 'Guardar', pt: 'Guardar', tr: 'Kaydet' })}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-5 pb-24 animate-in fade-in slide-in-from-bottom-2 duration-300 relative bg-zinc-50/80 -mx-4 -my-4 px-4 py-4 sm:-mx-6 sm:-my-6 sm:px-6 sm:py-6 lg:-mx-8 lg:-my-8 lg:px-8 lg:py-8 min-h-full overflow-x-hidden">
            
            {/* INDUSTRIAL DASHBOARD OVERVIEW */}
            <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-100 dark:border-dk-border overflow-hidden">
                <div className="bg-zinc-50/80 px-5 py-3 border-b border-slate-100 dark:border-dk-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-indigo-500 shrink-0" />
                        <h3 className="font-semibold text-slate-900 dark:text-dk-text text-xs uppercase tracking-wide">
                            {tx(lang, { fr: 'Tableau de Bord Suivi Commande (Pedido)', ar: 'Ù„ÙˆØ­Ø© ØªØªØ¨Ø¹ Ø§Ù„Ø·Ù„Ø¨ÙŠØ© (Pedido)', en: 'Order Tracking Dashboard (Pedido)', es: 'Panel de Seguimiento del Pedido (Pedido)', pt: 'Painel de Acompanhamento do Pedido (Pedido)', tr: 'SipariÅŸ Takip Panosu (Pedido)' })}
                        </h3>
                    </div>
                    <div className="shrink-0">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border uppercase tracking-wider whitespace-nowrap ${
                            totalPlanified === totalCible && totalCible > 0
                                ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 border-emerald-200'
                                : totalPlanified > totalCible && totalCible > 0
                                ? 'bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 text-indigo-700 dark:text-dk-accent-text border-indigo-200'
                                : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 border-amber-200'
                        }`}>
                            {totalPlanified === totalCible && totalCible > 0
                                ? tx(lang, { fr: 'Plan AlignÃ©e 100%', ar: 'ØªØºØ·ÙŠØ© ÙƒØ§Ù…Ù„Ø© 100%', en: 'Plan Aligned 100%', es: 'Plan Alineado 100%', pt: 'Plano Alinhado 100%', tr: 'Plan HizalÄ± %100' })
                                : tx(lang, { fr: `Couverture : ${plannedCoverPct}%`, ar: `Ø§Ù„ØªØºØ·ÙŠØ©: ${plannedCoverPct}%`, en: `Coverage: ${plannedCoverPct}%`, es: `Cobertura: ${plannedCoverPct}%`, pt: `Cobertura: ${plannedCoverPct}%`, tr: `Kapsama: %${plannedCoverPct}` })
                            }
                        </span>
                    </div>
                </div>

                <div className="p-5 space-y-4">
                    {/* 3 KPI cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* CARD 1: Cible CommandÃ© */}
                        <div className="bg-white dark:bg-dk-surface border border-slate-100 dark:border-dk-border rounded-xl p-4 flex items-center justify-between">
                            <div className="space-y-0.5">
                                <span className="text-[10px] text-slate-500 dark:text-dk-muted font-semibold uppercase tracking-wider block">
                                    {tx(lang, { fr: 'Total CommandÃ© (Cible)', ar: 'Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø·Ù„Ø¨ Ø§Ù„Ø£ØµÙ„ÙŠ', en: 'Total Ordered (Target)', es: 'Total Pedido (Objetivo)', pt: 'Total Encomendado (Alvo)', tr: 'Toplam SipariÅŸ (Hedef)' })}
                                </span>
                                <span className="text-lg font-bold text-slate-900 dark:text-dk-text tabular-nums block">
                                    {totalCible.toLocaleString()} <span className="text-xs font-medium text-slate-400 dark:text-dk-muted">pcs</span>
                                </span>
                            </div>
                            <div className="bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20/80 p-2.5 rounded-xl text-indigo-500">
                                <Grid3X3 className="w-4 h-4" />
                            </div>
                        </div>

                        {/* CARD 2: PlanifiÃ© */}
                        <div className="bg-white dark:bg-dk-surface border border-slate-100 dark:border-dk-border rounded-xl p-4 flex items-center justify-between">
                            <div className="space-y-0.5">
                                <span className="text-[10px] text-slate-500 dark:text-dk-muted font-semibold uppercase tracking-wider block">
                                    {tx(lang, { fr: 'Total PlanifiÃ© (Lots)', ar: 'Ø§Ù„ÙƒÙ…ÙŠØ© Ø§Ù„Ù…Ø®Ø·Ø·Ø©', en: 'Total Planned (Lots)', es: 'Total Planificado (Lotes)', pt: 'Total Planeado (Lotes)', tr: 'Toplam Planlanan (Partiler)' })}
                                </span>
                                <span className="text-lg font-bold text-slate-900 dark:text-dk-text tabular-nums block">
                                    {totalPlanified.toLocaleString()} <span className="text-xs font-medium text-slate-400 dark:text-dk-muted">pcs</span>
                                </span>
                                <span className="text-[9px] block font-medium leading-none">
                                    {totalPlanified === totalCible
                                        ? <span className="text-emerald-600 dark:text-emerald-400">âœ“ {tx(lang, { fr: 'AlignÃ©', ar: 'Ù…Ø·Ø§Ø¨Ù‚', en: 'Aligned', es: 'Alineado', pt: 'Alinhado', tr: 'HizalÄ±' })}</span>
                                        : <span className="text-amber-600 dark:text-amber-400">{tx(lang, { fr: `Ã‰cart : ${totalPlanified - totalCible}`, ar: `ÙØ±Ù‚: ${totalPlanified - totalCible}`, en: `Gap: ${totalPlanified - totalCible}`, es: `Diferencia: ${totalPlanified - totalCible}`, pt: `DiferenÃ§a: ${totalPlanified - totalCible}`, tr: `Fark: ${totalPlanified - totalCible}` })}</span>
                                    }
                                </span>
                            </div>
                            <div className="bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20/80 p-2.5 rounded-xl text-indigo-500">
                                <Calendar className="w-4 h-4" />
                            </div>
                        </div>

                        {/* CARD 3: RÃ©alisÃ© */}
                        <div className="bg-white dark:bg-dk-surface border border-slate-100 dark:border-dk-border rounded-xl p-4 flex items-center justify-between">
                            <div className="space-y-0.5">
                                <span className="text-[10px] text-slate-500 dark:text-dk-muted font-semibold uppercase tracking-wider block">
                                    {tx(lang, { fr: 'Total Produit (RÃ©alisÃ©)', ar: 'Ø§Ù„ÙƒÙ…ÙŠØ© Ø§Ù„Ù…Ù†ØªØ¬Ø©', en: 'Total Produced (Done)', es: 'Total Producido (Realizado)', pt: 'Total Produzido (Realizado)', tr: 'Toplam Ãœretilen (GerÃ§ekleÅŸen)' })}
                                </span>
                                <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums block">
                                    {totalProduced.toLocaleString()} <span className="text-xs font-medium text-emerald-400">pcs</span>
                                </span>
                                <span className="text-[9px] text-indigo-500 font-medium block leading-none">
                                    {globalCompletionPct}% {tx(lang, { fr: 'PrÃªt', ar: 'Ø¬Ø§Ù‡Ø²', en: 'Ready', es: 'Listo', pt: 'Pronto', tr: 'HazÄ±r' })}
                                </span>
                            </div>
                            <div className="bg-emerald-50 dark:bg-emerald-900/30/80 p-2.5 rounded-xl text-emerald-600 dark:text-emerald-400">
                                <CheckCircle className="w-4 h-4" />
                            </div>
                        </div>
                    </div>

                    {/* Overall progress bar */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-dk-muted">
                            <span>{tx(lang, { fr: 'Avancement de la commande globale', ar: 'Ù†Ø³Ø¨Ø© ØªÙ‚Ø¯Ù… Ø¥Ù†Ø¬Ø§Ø² Ø§Ù„Ø·Ù„Ø¨ÙŠØ©', en: 'Overall order progress', es: 'Avance del pedido global', pt: 'Progresso global do pedido', tr: 'Genel sipariÅŸ ilerlemesi' })}</span>
                            <span className="tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">{globalCompletionPct}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 dark:bg-dk-elevated rounded-full overflow-hidden">
                            <div
                                className="h-full bg-indigo-500 rounded-full transition-all duration-1000"
                                style={{ width: `${Math.min(100, globalCompletionPct)}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* LEFT COLUMN: IDENTIFICATION & REPARTITION (7 Cols) */}
                <div className="lg:col-span-7 space-y-6">

                    {/* 1. GENERAL INFO CARD - ONLY DATE & HEURE DE LANCEMENT */}
                    <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-100 dark:border-dk-border overflow-hidden">
                        <div className="bg-zinc-50/80 px-5 py-3 border-b border-slate-100 dark:border-dk-border flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-indigo-500" />
                                <h3 className="font-semibold text-slate-900 dark:text-dk-text text-xs uppercase tracking-wide">{pt.launchTitle}</h3>
                            </div>
                        </div>
                        <div className="p-5">
                            <div className="space-y-1">
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <div className="flex flex-1 min-w-0 items-center gap-3 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400 transition-all">
                                        <div className="shrink-0 p-1.5 bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20/80 rounded-md text-indigo-500 pointer-events-none" aria-hidden>
                                            <Calendar className="w-4 h-4" />
                                        </div>
                                        <DateTimePicker
                                            value={data.date || ''}
                                            onChange={(iso) => handleChange('date', iso.split('T')[0])}
                                            mode="date"
                                            settings={settings}
                                            inputClassName="w-full min-w-0 border-0 bg-transparent shadow-none text-sm font-semibold text-slate-700 dark:text-dk-text-soft outline-none focus:ring-0 py-0 px-0 tabular-nums"
                                            showIcon={false}
                                        />
                                    </div>
                                    <div
                                        ref={launchTimePickerRef}
                                        className={`relative flex flex-1 min-w-0 items-center gap-2 sm:gap-3 rounded-lg border bg-white dark:bg-dk-surface px-3 py-2.5 transition ${launchTimeOpen ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200 dark:border-dk-border'}`}
                                    >
                                        <Clock className="h-4 w-4 shrink-0 text-indigo-500" aria-hidden />
                                        <div className="relative min-w-0 flex-1">
                                            <button
                                                ref={launchTimeBtnRef}
                                                type="button"
                                                aria-expanded={launchTimeOpen}
                                                aria-haspopup="dialog"
                                                aria-label={pt.pickLaunchTime}
                                                onClick={() => setLaunchTimeOpen((o) => !o)}
                                                className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface py-2 pl-3 pr-2 outline-none transition hover:border-indigo-200 focus-visible:border-indigo-400 focus-visible:ring-2 focus-visible:ring-indigo-100"
                                            >
                                                <span className="tabular-nums text-sm font-semibold tracking-tight text-slate-800 dark:text-dk-text">
                                                    {launchHM.h}:{launchHM.min}
                                                </span>
                                                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 dark:text-dk-muted transition-transform ${launchTimeOpen ? 'rotate-180' : ''}`} aria-hidden />
                                            </button>
                                        </div>
                                        <span className="hidden shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-dk-muted sm:inline">{pt.badge24h}</span>
                                    </div>
                                </div>
                                {launchTimeOpen && createPortal(
                                    <div
                                        ref={launchTimePopRef}
                                        role="dialog"
                                        aria-label={pt.timePickerDialog}
                                        style={{
                                            position: 'fixed',
                                            top: launchPopPos.top,
                                            left: launchPopPos.left,
                                            width: Math.max(launchPopPos.width, 300),
                                            zIndex: 9999
                                        }}
                                        className="overflow-hidden rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface shadow-xl dark:shadow-dk-elevated ring-1 ring-black/5"
                                    >
                                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-dk-border bg-zinc-50/80 px-4 py-2">
                                            <div>
                                                <span className="text-[10px] font-semibold uppercase text-slate-500 dark:text-dk-muted tracking-widest font-sans">HEURE DE LANCEMENT</span>
                                            </div>
                                            <div className="tabular-nums text-lg font-semibold text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text bg-white dark:bg-dk-surface px-3 py-0.5 rounded-lg border border-slate-200 dark:border-dk-border">
                                                {launchHM.h}:{launchHM.min}
                                            </div>
                                        </div>

                                        <div className="p-4 space-y-4">
                                            <div>
                                                <label className="text-[10px] font-semibold text-slate-500 dark:text-dk-muted uppercase block mb-1.5 font-sans">Saisie directe</label>
                                                <input
                                                    type="time"
                                                    step={300}
                                                    value={`${launchHM.h}:${launchHM.min}`}
                                                    onChange={(e) => handleChange('launchTime', e.target.value)}
                                                    className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border focus:border-indigo-500 rounded-lg px-4 py-2.5 tabular-nums font-semibold text-lg text-center text-slate-800 dark:text-dk-text outline-none transition-colors"
                                                />
                                                <p className="text-[10px] text-slate-400 dark:text-dk-muted mt-1 text-center font-sans">Pas de 5 minutes</p>
                                            </div>

                                            <div>
                                                <label className="text-[10px] font-semibold text-slate-500 dark:text-dk-muted uppercase block mb-1.5 font-sans">Raccourcis</label>
                                                <div className="grid grid-cols-3 gap-1.5 font-sans">
                                                    {['06:00', '07:00', '08:00', '08:30', '09:00', '14:00'].map(t => {
                                                        const active = `${launchHM.h}:${launchHM.min}` === t;
                                                        return (
                                                            <button
                                                                key={t}
                                                                onClick={() => { handleChange('launchTime', t); setLaunchTimeOpen(false); }}
                                                                className={`py-2 text-xs tabular-nums font-semibold rounded-lg transition-all ${active
                                                                    ? 'bg-indigo-600 dark:bg-dk-accent text-white'
                                                                    : 'bg-slate-100 hover:bg-indigo-50 dark:bg-dk-accent/20 text-slate-700 hover:text-indigo-700 dark:text-dk-accent-text'}`}
                                                            >
                                                                {t}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-dk-muted py-2 px-4 border-t border-slate-100 dark:border-dk-border bg-zinc-50/80 font-sans">
                                            <span>{tx(lang, { fr: 'Tab/flÃ¨ches pour ajuster', ar: 'Ø¹Ù„Ø§Ù…Ø© Ø§Ù„ØªØ¨ÙˆÙŠØ¨/Ø§Ù„Ø£Ø³Ù‡Ù… Ù„Ù„Ø¶Ø¨Ø·', en: 'Tab/arrows to adjust', es: 'Tabulador/flechas para ajustar', pt: 'Tab/setas para ajustar', tr: 'Sekme/oklarla ayarla' })}</span>
                                            <button
                                                onClick={() => setLaunchTimeOpen(false)}
                                                className="px-2 py-0.5 rounded bg-indigo-600 dark:bg-dk-accent text-white text-[10px] font-bold hover:bg-indigo-500"
                                            >
                                                OK
                                            </button>
                                        </div>
                                    </div>,
                                    document.body
                                )}
                                <p className="text-[10px] text-slate-400 dark:text-dk-muted mt-2 font-medium">
                                    {pt.launchHelp}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* 2. RÃ‰PARTITION (TAILLES / COULEURS) CARD â€” composant partagÃ© avec la Fiche Technique */}
                    <RepartitionMatrix data={data} setData={setData} lang={lang as 'fr' | 'ar'} syncQuantity={false} />

                </div>

                {/* RIGHT COLUMN: PLANIFIED LOTS & OFs â€” ACCORDION (5 Cols) */}
                <div className="lg:col-span-5">
                    <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-100 dark:border-dk-border overflow-hidden flex flex-col">
                        <div className="bg-zinc-50/80 px-5 py-3 border-b border-slate-100 dark:border-dk-border flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-indigo-500" />
                                <h3 className="font-semibold text-slate-900 dark:text-dk-text text-xs uppercase tracking-wide">
                                    {tx(lang, { fr: 'Lots & OFs PlanifiÃ©s', ar: 'Ø¯ÙØ¹Ø§Øª Ø§Ù„ØªØ³Ù„ÙŠÙ…', en: 'Planned Lots & OFs', es: 'Lotes y OF Planificados', pt: 'Lotes e OFs Planeados', tr: 'Planlanan Partiler ve OF' })}
                                </h3>
                            </div>
                            <div className="flex items-center gap-2">
                                {currentModelId && editingEventId === null && (
                                    <button
                                        type="button"
                                        onClick={startEditNew}
                                        className="inline-flex items-center gap-1.5 h-8 px-3 bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-700 dark:hover:bg-dk-accent-hover text-white text-xs font-semibold rounded-lg transition-all"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        {tx(lang, { fr: 'Ajouter', ar: 'Ø¥Ø¶Ø§ÙØ© Ø¯ÙØ¹Ø©', en: 'Add', es: 'AÃ±adir', pt: 'Adicionar', tr: 'Ekle' })}
                                    </button>
                                )}
                                <span className="inline-flex items-center justify-center h-6 min-w-[24px] px-2 bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text text-xs font-semibold rounded-full tabular-nums">
                                    {modelEvents.length}
                                </span>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto max-h-[680px]">
                            {!currentModelId && (
                                <div className="m-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-200/60 rounded-lg p-4 text-amber-800 text-xs font-medium flex items-center gap-2 font-sans">
                                    <Calendar className="w-5 h-5 text-amber-500 shrink-0" />
                                    <span>
                                        {tx(lang, {
                                            fr: 'Veuillez d\'abord enregistrer le modÃ¨le pour pouvoir planifier et diviser les commandes.',
                                            ar: 'ÙŠØ±Ø¬Ù‰ Ø­ÙØ¸ Ø§Ù„Ù†Ù…ÙˆØ°Ø¬ Ø£ÙˆÙ„Ø§Ù‹ Ù„ØªØªÙ…ÙƒÙ† Ù…Ù† Ø¥Ø¶Ø§ÙØ© ÙˆØªÙ‚Ø³ÙŠÙ… Ø·Ù„Ø¨ÙŠØ§Øª Ù‡Ø°Ø§ Ø§Ù„Ù…ÙˆØ¯ÙŠÙ„.',
                                            en: 'Please save the model first to be able to plan and split the orders.',
                                            es: 'Guarda primero el modelo para poder planificar y dividir los pedidos.',
                                            pt: 'Guarde primeiro o modelo para poder planear e dividir as encomendas.',
                                            tr: 'SipariÅŸleri planlayÄ±p bÃ¶lebilmek iÃ§in Ã¶nce modeli kaydedin.',
                                        })}
                                    </span>
                                </div>
                            )}

                            {currentModelId && editingEventId === 'new' && (
                                <div className="p-5 border-b border-slate-100 dark:border-dk-border">
                                    {renderEditorForm()}
                                </div>
                            )}

                            {modelEvents.length === 0 ? (
                                editingEventId !== 'new' && (
                                    <div className="text-center py-16 text-slate-400 dark:text-dk-muted text-xs italic flex flex-col items-center justify-center gap-2 font-sans">
                                        <Calendar className="w-8 h-8 text-slate-300 dark:text-dk-muted" />
                                        <span>
                                            {tx(lang, {
                                                fr: 'Aucune commande ou lot de livraison planifiÃ© pour ce modÃ¨le.',
                                                ar: 'Ù„Ø§ ØªÙˆØ¬Ø¯ Ø·Ù„Ø¨ÙŠØ§Øª Ø£Ùˆ Ø¯ÙØ¹Ø§Øª ØªØ³Ù„ÙŠÙ… Ù…Ø¨Ø±Ù…Ø¬Ø© Ù„Ù‡Ø°Ø§ Ø§Ù„Ù…ÙˆØ¯ÙŠÙ„ Ø­Ø§Ù„ÙŠØ§Ù‹ ÙÙŠ Ø¬Ø¯ÙˆÙ„ Ø§Ù„ØªØ®Ø·ÙŠØ·.',
                                                en: 'No order or delivery lot planned for this model.',
                                                es: 'NingÃºn pedido o lote de entrega planificado para este modelo.',
                                                pt: 'Nenhuma encomenda ou lote de entrega planeado para este modelo.',
                                                tr: 'Bu model iÃ§in planlanmÄ±ÅŸ sipariÅŸ veya teslimat partisi yok.',
                                            })}
                                        </span>
                                    </div>
                                )
                            ) : (
                                modelEvents.map((evt) => {
                                    if (editingEventId === evt.id) {
                                        return (
                                            <div key={evt.id} className="p-5 border-b border-slate-100 dark:border-dk-border">
                                                {renderEditorForm()}
                                            </div>
                                        );
                                    }

                                    const statusMeta = getStatusMeta(evt.status);
                                    const hasDistribution = evt.sizeColorDistribution && Object.keys(evt.sizeColorDistribution).length > 0;
                                    const filteredSizes = sizes.filter(s => s.toLowerCase() !== 'total');
                                    const filteredColors = colors.filter(c => c.name.toLowerCase() !== 'total' && c.id.toLowerCase() !== 'total');

                                    const isSplit = evt.modelName?.includes(' â€” ') || (evt.lots_data && evt.lots_data.length > 0);
                                    const lotSuffix = evt.modelName?.includes(' â€” ') ? evt.modelName.split(' â€” ').slice(1).join(' â€” ') : '';
                                    const displayModelName = evt.modelName?.includes(' â€” ') ? evt.modelName.split(' â€” ')[0] : (evt.modelName || articleName);
                                    
                                    const matAv = getMaterialAvailability(lang, evt.modelId, [{ id: evt.modelId, ficheData: data } as any], evt.qteTotal, evt.qteTotal);
                                    
                                    const launchDateStr = (evt.startDate || evt.dateLancement || '').split('T')[0];
                                    const matArrivalDateStr = (evt.fournisseurDate || '').split('T')[0];
                                    const hasConflict = launchDateStr && matArrivalDateStr && launchDateStr < matArrivalDateStr;

                                    const isExpanded = expandedLotId === evt.id;
                                    const produced = evt.producedQuantity ?? evt.qteProduite ?? 0;
                                    const pct = evt.qteTotal > 0 ? Math.round((produced / evt.qteTotal) * 1000) / 10 : 0;

                                    return (
                                        <div key={evt.id} className={`relative border-b border-slate-100 dark:border-dk-border last:border-b-0 transition-colors ${isExpanded ? 'bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20/20' : 'hover:bg-slate-50/50'}`}>
                                            {/* ACCORDION HEADER */}
                                            <button
                                                type="button"
                                                onClick={() => setExpandedLotId(isExpanded ? null : evt.id)}
                                                className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors hover:bg-slate-50/50 sticky top-0 z-30 bg-white dark:bg-dk-surface ${isExpanded ? 'border-b border-slate-100 dark:border-dk-border shadow-sm dark:shadow-dk-sm' : ''}`}
                                            >
                                                <div className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center transition-all ${isExpanded ? 'bg-indigo-100 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text rotate-90' : 'bg-slate-100 dark:bg-dk-elevated text-slate-400 dark:text-dk-muted'}`}>
                                                    <ChevronRight className="w-3.5 h-3.5" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20/80 px-1.5 py-0.5 rounded text-[10px] font-semibold">OF</span>
                                                        <span className="text-sm font-semibold text-slate-800 dark:text-dk-text truncate">{displayModelName}</span>
                                                        {isSplit && (
                                                            <span className="inline-flex items-center gap-0.5 bg-amber-50 dark:bg-amber-900/30 text-amber-700 border border-amber-200/60 px-1.5 py-0.5 rounded text-[10px] font-semibold">
                                                                <Scissors className="w-2.5 h-2.5" />{lotSuffix}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusMeta.bg} ${statusMeta.text} ${statusMeta.border}`}>
                                                            <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dot}`} />
                                                            {statusMeta.label}
                                                        </span>
                                                        <span className="text-[11px] tabular-nums font-semibold text-slate-500 dark:text-dk-muted">{evt.qteTotal} pcs</span>
                                                        {pct > 0 && (
                                                            <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text tabular-nums">{pct}%</span>
                                                        )}
                                                    </div>
                                                </div>
                                                {currentModelId && (
                                                    <div
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={(e) => { e.stopPropagation(); startEditExisting(evt); }}
                                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); startEditExisting(evt); } }}
                                                        className="shrink-0 p-1.5 text-slate-400 hover:text-indigo-600 dark:text-dk-accent-text hover:bg-indigo-50 dark:bg-dk-accent/20 rounded-lg transition-all cursor-pointer"
                                                        title={tx(lang, { fr: 'Modifier le lot', ar: 'ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„Ø¯ÙØ¹Ø©', en: 'Edit lot', es: 'Editar lote', pt: 'Editar lote', tr: 'Partiyi dÃ¼zenle' })}
                                                    >
                                                        <Edit className="w-3.5 h-3.5" />
                                                    </div>
                                                )}
                                            </button>

                                            {/* ACCORDION BODY (expanded) */}
                                            {isExpanded && (
                                                <div className="px-4 pb-4 space-y-3 animate-in slide-in-from-top-1 duration-200">
                                                    {/* Quick info pills */}
                                                    <div className="grid grid-cols-3 gap-1.5">
                                                        <div className="bg-white dark:bg-dk-surface border border-slate-100 dark:border-dk-border rounded-md p-2 flex items-center gap-1.5">
                                                            <div className="bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20/80 p-1 rounded-md text-indigo-500">
                                                                <Calendar className="w-3.5 h-3.5" />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <span className="text-[8px] text-slate-400 dark:text-dk-muted font-semibold uppercase block leading-none">
                                                                    {tx(lang, { fr: 'Lancement', ar: 'Ø§Ù„Ø¥Ø·Ù„Ø§Ù‚', en: 'Launch', es: 'Lanzamiento', pt: 'LanÃ§amento', tr: 'BaÅŸlatma' })}
                                                                </span>
                                                                <span className="font-semibold text-slate-700 dark:text-dk-text-soft tabular-nums text-[11px] block truncate">
                                                                    {(evt.startDate || evt.dateLancement || '-').split('T')[0]}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="bg-white dark:bg-dk-surface border border-slate-100 dark:border-dk-border rounded-md p-2 flex items-center gap-1.5">
                                                            <div className="bg-blue-50 dark:bg-blue-900/30/80 p-1 rounded-md text-blue-500">
                                                                <Clock className="w-3.5 h-3.5" />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <span className="text-[8px] text-slate-400 dark:text-dk-muted font-semibold uppercase block leading-none">
                                                                    {tx(lang, { fr: 'Fin estimÃ©e', ar: 'Ø§Ù„Ø§Ù†ØªÙ‡Ø§Ø¡', en: 'Est. end', es: 'Fin estimado', pt: 'Fim estimado', tr: 'Tahmini bitiÅŸ' })}
                                                                </span>
                                                                <span className="font-semibold text-slate-700 dark:text-dk-text-soft tabular-nums text-[11px] block truncate">
                                                                    {evt.estimatedEndDate ? evt.estimatedEndDate.split('T')[0] : '-'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="bg-white dark:bg-dk-surface border border-slate-100 dark:border-dk-border rounded-md p-2 flex items-center gap-1.5">
                                                            <div className="bg-emerald-50 dark:bg-emerald-900/30/80 p-1 rounded-md text-emerald-500">
                                                                <Calendar className="w-3.5 h-3.5" />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <span className="text-[8px] text-slate-400 dark:text-dk-muted font-semibold uppercase block leading-none">
                                                                    {tx(lang, { fr: 'DDS', ar: 'Ø§Ù„ØªØ³Ù„ÙŠÙ…', en: 'DDS', es: 'DDS', pt: 'DDS', tr: 'DDS' })}
                                                                </span>
                                                                <span className="font-semibold text-slate-700 dark:text-dk-text-soft tabular-nums text-[11px] block truncate">
                                                                    {(evt.strictDeadline_DDS || evt.dateExport || '-').split('T')[0]}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Client & Material arrival */}
                                                    <div className="bg-white dark:bg-dk-surface border border-slate-100 dark:border-dk-border rounded-md px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs font-sans">
                                                        <div className="flex items-center gap-2">
                                                            <Truck className="w-3.5 h-3.5 text-amber-500" />
                                                            <span className="font-semibold text-slate-700 dark:text-dk-text-soft tabular-nums text-[11px]">
                                                                {evt.fournisseurDate ? evt.fournisseurDate.split('T')[0] : tx(lang, { fr: 'Non dÃ©finie', ar: 'ØºÙŠØ± Ù…Ø­Ø¯Ø¯', en: 'Not defined', es: 'No definida', pt: 'NÃ£o definida', tr: 'TanÄ±msÄ±z' })}
                                                            </span>
                                                            {matAv && (
                                                                <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                                                                    matAv.color === 'green' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 border-emerald-200' :
                                                                    matAv.color === 'yellow' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 border-amber-200' :
                                                                    matAv.color === 'red' ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 border-rose-200' : 'bg-slate-50 dark:bg-dk-bg text-slate-500 dark:text-dk-muted border-slate-200 dark:border-dk-border'
                                                                }`}>
                                                                    <span>{matAv.emoji}</span>
                                                                    <span>{matAv.label}</span>
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span className="font-semibold text-slate-700 dark:text-dk-text-soft bg-slate-50 dark:bg-dk-bg px-2 py-0.5 rounded border border-slate-100 dark:border-dk-border text-[11px]">
                                                            {evt.clientName || (evt as any).client || '-'}
                                                        </span>
                                                    </div>

                                                    {/* Conflict alert */}
                                                    {hasConflict && (
                                                        <div className="flex items-start gap-2 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 rounded-lg p-3 text-[11px] font-sans text-rose-800">
                                                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                                                            <p className="font-bold">
                                                                {tx(lang, {
                                                                    fr: `Conflit : lancement ${launchDateStr} < arrivÃ©e ${matArrivalDateStr}`,
                                                                    ar: `ØªØ¹Ø§Ø±Ø¶: Ø§Ù„Ø¥Ø·Ù„Ø§Ù‚ (${launchDateStr}) ÙŠØ³Ø¨Ù‚ Ø§Ù„ÙˆØµÙˆÙ„ (${matArrivalDateStr})`,
                                                                    en: `Conflict: launch ${launchDateStr} < arrival ${matArrivalDateStr}`,
                                                                    es: `Conflicto: lanzamiento ${launchDateStr} < llegada ${matArrivalDateStr}`,
                                                                    pt: `Conflito: lanÃ§amento ${launchDateStr} < chegada ${matArrivalDateStr}`,
                                                                    tr: `Ã‡akÄ±ÅŸma: baÅŸlatma ${launchDateStr} < varÄ±ÅŸ ${matArrivalDateStr}`,
                                                                })}
                                                            </p>
                                                        </div>
                                                    )}

                                                    {/* Progress bar */}
                                                    <div className="bg-white dark:bg-dk-surface border border-slate-100 dark:border-dk-border rounded-md p-2.5 space-y-1">
                                                        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-dk-muted">
                                                            <span>{tx(lang, { fr: 'Production', ar: 'Ø§Ù„ØªÙ‚Ø¯Ù…', en: 'Production', es: 'ProducciÃ³n', pt: 'ProduÃ§Ã£o', tr: 'Ãœretim' })}</span>
                                                            <span className="tabular-nums text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text">
                                                                {produced.toLocaleString()} / {evt.qteTotal.toLocaleString()} ({pct}%)
                                                            </span>
                                                        </div>
                                                        <div className="w-full h-1.5 bg-slate-100 dark:bg-dk-elevated rounded-full overflow-hidden">
                                                            <div 
                                                                className="h-full bg-indigo-600 dark:bg-dk-accent rounded-full transition-all duration-500" 
                                                                style={{ width: `${Math.min(100, pct)}%` }}
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Distribution table */}
                                                    {hasDistribution && (
                                                        <div className="space-y-1.5">
                                                            <div className="text-[10px] font-semibold text-slate-500 dark:text-dk-muted uppercase tracking-wider flex items-center gap-1.5">
                                                                <Grid3X3 className="w-3 h-3 text-slate-400 dark:text-dk-muted" />
                                                                {tx(lang, { fr: 'RÃ©partition', ar: 'Ø§Ù„ØªÙˆØ²ÙŠØ¹', en: 'Distribution', es: 'DistribuciÃ³n', pt: 'DistribuiÃ§Ã£o', tr: 'DaÄŸÄ±lÄ±m' })}
                                                            </div>
                                                            <div className="overflow-x-auto rounded-lg border border-slate-100 dark:border-dk-border bg-white dark:bg-dk-surface">
                                                                <table className="w-full text-[11px] border-collapse">
                                                                    <thead>
                                                                        <tr className="bg-zinc-50/80 text-slate-500 dark:text-dk-muted border-b border-slate-100 dark:border-dk-border font-semibold">
                                                                            <th className="py-2 px-2.5 text-left font-semibold border-r border-slate-100 dark:border-dk-border">Couleur</th>
                                                                            {filteredSizes.map((s, i) => (
                                                                                <th key={i} className="py-2 px-2 text-center font-semibold border-r border-slate-100 dark:border-dk-border">{s}</th>
                                                                            ))}
                                                                            <th className="py-2 px-2.5 text-center font-semibold bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20/30 text-indigo-700 dark:text-dk-accent-text">TOT</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                                                                        {filteredColors.map((c, cIdx) => {
                                                                            let rowTotal = 0;
                                                                            return (
                                                                                <tr key={`${c.id}-${cIdx}`} className="hover:bg-slate-50/30">
                                                                                    <td className="py-1.5 px-2.5 border-r border-slate-100 dark:border-dk-border font-semibold text-slate-600 dark:text-dk-text-soft flex items-center gap-1.5">
                                                                                        <div
                                                                                            className={`w-2 h-2 rounded-full flex-shrink-0 ${c.id && c.id.startsWith('#') ? '' : 'bg-slate-300'}`}
                                                                                            style={c.id && c.id.startsWith('#') ? { backgroundColor: c.id } : undefined}
                                                                                        />
                                                                                        <span className="truncate max-w-[80px]" title={c.name}>{c.name}</span>
                                                                                    </td>
                                                                                    {filteredSizes.map((s) => {
                                                                                        const qty = evt.sizeColorDistribution?.[c.id]?.[s] || 0;
                                                                                        rowTotal += qty;
                                                                                        return (
                                                                                            <td key={s} className="py-1.5 px-1.5 text-center tabular-nums text-slate-600 dark:text-dk-text-soft border-r border-slate-100 dark:border-dk-border">
                                                                                                {qty || <span className="text-slate-300 dark:text-dk-muted">-</span>}
                                                                                            </td>
                                                                                        );
                                                                                    })}
                                                                                    <td className="py-1.5 px-2.5 text-center tabular-nums font-bold bg-slate-50 dark:bg-dk-bg/40 text-slate-700 dark:text-dk-text-soft">
                                                                                        {rowTotal}
                                                                                    </td>
                                                                                </tr>
                                                                            );
                                                                        })}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    )}

                                                     {/* Materials Need â€” clean table with no overflow */}
                                                    <div className="space-y-1.5">
                                                        <div className="text-[10px] font-semibold text-slate-500 dark:text-dk-muted uppercase tracking-wider flex items-center gap-1.5">
                                                            <Package className="w-3 h-3 text-slate-400 dark:text-dk-muted" />
                                                            {tx(lang, { fr: 'Besoin MatiÃ¨res', ar: 'Ø§Ù„Ù…ÙˆØ§Ø¯', en: 'Material Needs', es: 'Necesidad de Materiales', pt: 'Necessidade de Materiais', tr: 'Malzeme Ä°htiyacÄ±' })}
                                                        </div>
                                                        <div className="rounded-lg border border-slate-100 dark:border-dk-border overflow-hidden">
                                                            {(() => {
                                                                const gq = evt.sizeColorDistribution || {};
                                                                const materials = data.materials || [];
                                                                if (materials.length === 0) {
                                                                    return (
                                                                        <p className="text-[11px] text-slate-400 dark:text-dk-muted italic text-center py-3 bg-amber-50 dark:bg-amber-900/30/20">
                                                                            {tx(lang, { fr: 'Aucune matiÃ¨re dÃ©finie', ar: 'Ù„Ø§ ØªÙˆØ¬Ø¯ Ù…ÙˆØ§Ø¯ Ù…Ø­Ø¯Ø¯Ø©', en: 'No material defined', es: 'NingÃºn material definido', pt: 'Nenhum material definido', tr: 'TanÄ±mlÄ± malzeme yok' })}
                                                                        </p>
                                                                    );
                                                                }

                                                                const colorGroups = filteredColors.map(c => {
                                                                    let colorPieces = 0;
                                                                    filteredSizes.forEach(s => {
                                                                        colorPieces += Number(gq[c.id]?.[s] || 0);
                                                                    });
                                                                    if (colorPieces <= 0) return null;

                                                                    const colorMats = materials.filter(m => {
                                                                        if (m.scope?.colors?.length) return m.scope.colors.includes(c.id);
                                                                        if (m.threadColor) return m.threadColor === c.name;
                                                                        return true;
                                                                    }).map(m => {
                                                                        const baseQty = m.qty * colorPieces;
                                                                        const buyQty = Math.ceil(baseQty * 1.05);
                                                                        const cost = buyQty * m.unitPrice;
                                                                        const st = resolveStock(m, magasinData, buyQty, 0, colorPieces);
                                                                        return {
                                                                            ...m, colorPieces, buyQty, cost,
                                                                            stockActuel: st.stockActuel, manque: st.manque, piecesCouvertes: st.piecesCouvertes,
                                                                            fournisseur: st.fournisseur, isDelivered: st.isDelivered, isPartial: st.isPartial,
                                                                        };
                                                                    }).filter(m => m.buyQty > 0);

                                                                    if (colorMats.length === 0) return null;
                                                                    const colorTotal = colorMats.reduce((s, m) => s + m.cost, 0);
                                                                    return { colorId: c.id, colorName: c.name, colorPieces, colorMats, colorTotal };
                                                                }).filter(Boolean) as Array<{
                                                                    colorId: string; colorName: string; colorPieces: number;
                                                                    colorMats: any[]; colorTotal: number;
                                                                }>;

                                                                if (colorGroups.length === 0) {
                                                                    return (
                                                                        <p className="text-[11px] text-slate-400 dark:text-dk-muted italic text-center py-3 bg-amber-50 dark:bg-amber-900/30/20">
                                                                            {tx(lang, { fr: 'Aucune matiÃ¨re pour ce lot', ar: 'Ù„Ø§ ØªÙˆØ¬Ø¯ Ù…ÙˆØ§Ø¯ Ù„Ù‡Ø°Ø§ Ø§Ù„Ø¯ÙØ¹Ø©', en: 'No material for this lot', es: 'NingÃºn material para este lote', pt: 'Nenhum material para este lote', tr: 'Bu parti iÃ§in malzeme yok' })}
                                                                        </p>
                                                                    );
                                                                }

                                                                const grandTotal = colorGroups.reduce((s, g) => s + g.colorTotal, 0);

                                                                return (
                                                                    <div className="space-y-0">
                                                                        <div className="flex items-center justify-between px-3 py-2 bg-amber-50 dark:bg-amber-900/30/40 border-b border-amber-100/50">
                                                                            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-100 px-2 py-0.5 rounded-full">
                                                                                {colorGroups.length} couleur(s)
                                                                            </span>
                                                                            <span className="text-[10px] font-bold text-amber-700 tabular-nums">
                                                                                {fmt(grandTotal)} DH
                                                                            </span>
                                                                        </div>
                                                                        {colorGroups.map((cg, cgIdx) => {
                                                                            const cHex = cg.colorId && cg.colorId.startsWith('#') ? cg.colorId : null;
                                                                            return (
                                                                                <div key={cg.colorId} className={`${cgIdx > 0 ? 'border-t border-amber-100/50' : ''}`}>
                                                                                    <div className="px-3 py-2 bg-white dark:bg-dk-surface/60 flex items-center justify-between">
                                                                                        <div className="flex items-center gap-2">
                                                                                            <div className={`w-2 h-2 rounded-full shadow-sm dark:shadow-dk-sm ${cHex ? '' : 'bg-slate-300'}`} style={cHex ? { backgroundColor: cHex } : undefined} />
                                                                                            <span className="text-[11px] font-bold text-slate-700 dark:text-dk-text-soft">{cg.colorName}</span>
                                                                                            <span className="text-[9px] text-slate-400 dark:text-dk-muted font-medium">{cg.colorPieces} pcs</span>
                                                                                        </div>
                                                                                        <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text tabular-nums">{fmt(cg.colorTotal)} DH</span>
                                                                                    </div>
                                                                                    <div className="overflow-x-auto bg-amber-50 dark:bg-amber-900/30/20">
                                                                                        <table className="w-full text-[11px] border-collapse">
                                                                                            <thead>
                                                                                                <tr className="text-[9px] uppercase tracking-wider text-slate-400 dark:text-dk-muted border-b border-amber-100/30">
                                                                                                    <th className="sticky left-0 bg-slate-50 dark:bg-dk-bg border-r border-amber-100/30 z-20 text-left px-3 py-1.5 font-medium min-w-[80px]">{tx(lang, { fr: 'MatiÃ¨re', ar: 'Ø§Ù„Ù…Ø§Ø¯Ø©', en: 'Material', es: 'Material', pt: 'Material', tr: 'Malzeme' })}</th>
                                                                                                    <th className="text-center px-2 py-1.5 font-medium min-w-[50px]">{tx(lang, { fr: 'QtÃ©', ar: 'Ø§Ù„ÙƒÙ…ÙŠØ©', en: 'Qty', es: 'Cant.', pt: 'Qtd', tr: 'Miktar' })}</th>
                                                                                                    <th className="text-center px-2 py-1.5 font-medium min-w-[60px]">Fournisseur</th>
                                                                                                    <th className="text-center px-2 py-1.5 font-medium min-w-[70px]">Statut</th>
                                                                                                    <th className="text-right px-3 py-1.5 font-medium min-w-[60px]">{tx(lang, { fr: 'CoÃ»t HT', ar: 'Ø§Ù„ØªÙƒÙ„ÙØ© Ø¨Ø¯ÙˆÙ† Ø¶Ø±ÙŠØ¨Ø©', en: 'Cost (excl. tax)', es: 'Costo (sin IVA)', pt: 'Custo (s/ IVA)', tr: 'Maliyet (KDV hariÃ§)' })}</th>
                                                                                                    <th className="text-center px-2 py-1.5 font-medium min-w-[90px]">Actions</th>
                                                                                                </tr>
                                                                                            </thead>
                                                                                            <tbody className="divide-y divide-amber-50/50">
                                                                                                {cg.colorMats.map((m: any, idx: number) => (
                                                                                                    <tr key={`${m.id}-${idx}`} className="group hover:bg-amber-50/30 transition-colors cursor-pointer" onClick={() => setSelectedMaterial({ ...m, colorName: cg.colorName })}>
                                                                                                        <td className="sticky left-0 bg-white dark:bg-dk-surface group-hover:bg-[#fffcf4] z-10 border-r border-amber-100/30 px-3 py-1.5 font-medium text-slate-700 dark:text-dk-text-soft truncate max-w-[100px]" title={m.name}>{m.name}</td>
                                                                                                        <td className="px-2 py-1.5 text-center tabular-nums text-slate-600 dark:text-dk-text-soft whitespace-nowrap">{m.buyQty} {m.unit}</td>
                                                                                                        <td className="px-2 py-1.5 text-center">
                                                                                                            {m.fournisseur ? (
                                                                                                                <span className="text-[9px] font-bold bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 text-indigo-700 dark:text-dk-accent-text px-1.5 py-0.5 rounded whitespace-nowrap">{m.fournisseur}</span>
                                                                                                            ) : <span className="text-slate-300 dark:text-dk-muted">â€”</span>}
                                                                                                        </td>
                                                                                                        <td className="px-2 py-1.5 text-center">
                                                                                                            {m.isDelivered ? (
                                                                                                                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap"><CheckCircle className="w-2.5 h-2.5" /> OK</span>
                                                                                                            ) : m.isPartial ? (
                                                                                                                <span className="inline-flex flex-col items-center leading-tight">
                                                                                                                    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-600 dark:text-amber-400 whitespace-nowrap"><AlertTriangle className="w-2.5 h-2.5" /> Partiel</span>
                                                                                                                    <span className="text-[8px] text-amber-600 dark:text-amber-400/80 font-medium whitespace-nowrap">{fmt(m.piecesCouvertes)} pcs</span>
                                                                                                                </span>
                                                                                                            ) : (
                                                                                                                <span className="inline-flex flex-col items-center leading-tight">
                                                                                                                    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-rose-600 dark:text-rose-400 whitespace-nowrap"><Clock className="w-2.5 h-2.5" /> Attente</span>
                                                                                                                    <span className="text-[8px] text-rose-500/80 font-medium whitespace-nowrap">-{fmt(m.manque)}{m.unit}</span>
                                                                                                                </span>
                                                                                                            )}
                                                                                                        </td>
                                                                                                        <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-slate-800 dark:text-dk-text whitespace-nowrap">{fmt(m.cost)} DH</td>
                                                                                                        <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                                                                                                            <div className="flex items-center justify-end gap-1">
                                                                                                                {!m.isDelivered && currentModelId && (
                                                                                                                    <button
                                                                                                                        onClick={(e) => { e.stopPropagation(); setConfirmModal({ open: true, mat: m, qty: String(Math.round(m.buyQty)) }); }}
                                                                                                                        className="inline-flex items-center gap-1 h-6 px-2 text-[10px] font-bold text-emerald-700 border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 rounded-md transition-colors whitespace-nowrap"
                                                                                                                        title={tx(lang, { fr: 'Confirmer rÃ©ception', ar: 'ØªØ£ÙƒÙŠØ¯ Ø§Ù„Ø§Ø³ØªÙ„Ø§Ù…', en: 'Confirm reception', es: 'Confirmar recepciÃ³n', pt: 'Confirmar receÃ§Ã£o', tr: 'TeslimatÄ± onayla' })}
                                                                                                                    >
                                                                                                                        <CheckCircle className="w-3 h-3" /> {tx(lang, { fr: 'ReÃ§u', ar: 'ØªÙ… Ø§Ù„Ø§Ø³ØªÙ„Ø§Ù…', en: 'Received', es: 'Recibido', pt: 'Recebido', tr: 'AlÄ±ndÄ±' })}
                                                                                                                    </button>
                                                                                                                )}
                                                                                                                <FactureUploader modelId={currentModelId || undefined} materialName={m.name} />
                                                                                                            </div>
                                                                                                        </td>
                                                                                                    </tr>
                                                                                                ))}
                                                                                            </tbody>
                                                                                        </table>
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

            </div>

            {/* RECONCILIATION SUMMARY TABLE (AT BOTTOM, SPANS FULL WIDTH) */}
            {(modelEvents.length > 0 || editingEventId !== null) && (
                <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-100 dark:border-dk-border overflow-hidden p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-sans">
                        <div className="space-y-0.5">
                            <h4 className="font-semibold text-sm text-slate-900 dark:text-dk-text flex items-center gap-2">
                                <Grid3X3 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text" />
                                {tx(lang, { fr: 'Tableau de RÃ©conciliation & Suivi des DÃ©lais', ar: 'Ø¬Ø¯ÙˆÙ„ Ù…Ø·Ø§Ø¨Ù‚Ø© Ø§Ù„ÙƒÙ…ÙŠØ§Øª Ù…Ø¹ Ø§Ù„ØªÙˆØ²ÙŠØ¹ Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ', en: 'Reconciliation & Deadline Tracking Table', es: 'Tabla de ConciliaciÃ³n y Seguimiento de Plazos', pt: 'Tabela de ReconciliaÃ§Ã£o e Acompanhamento de Prazos', tr: 'Mutabakat ve Termin Takip Tablosu' })}
                            </h4>
                            <p className="text-xs text-slate-500 dark:text-dk-muted font-medium">
                                {tx(lang, {
                                    fr: 'Comparaison des quantitÃ©s rÃ©parties par lots avec la rÃ©partition globale du modÃ¨le.',
                                    ar: 'Ù…Ù‚Ø§Ø±Ù†Ø© Ø§Ù„ÙƒÙ…ÙŠØ§Øª Ø§Ù„Ù…ÙˆØ²Ø¹Ø© Ø¹Ù„Ù‰ Ø¯ÙØ¹Ø§Øª Ø§Ù„ØªØ³Ù„ÙŠÙ… Ù…Ø¹ Ø§Ù„ØªÙˆØ²ÙŠØ¹ Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ù„Ù„Ù…ÙˆØ¯ÙŠÙ„ (Ø§Ù„Ù…Ù‚Ø§Ø³Ø§Øª ÙˆØ§Ù„Ø£Ù„ÙˆØ§Ù†).',
                                    en: 'Comparison of the quantities split across lots with the overall model distribution.',
                                    es: 'ComparaciÃ³n de las cantidades repartidas por lotes con la distribuciÃ³n global del modelo.',
                                    pt: 'ComparaÃ§Ã£o das quantidades distribuÃ­das por lotes com a distribuiÃ§Ã£o global do modelo.',
                                    tr: 'Partilere daÄŸÄ±tÄ±lan miktarlarÄ±n modelin genel daÄŸÄ±lÄ±mÄ±yla karÅŸÄ±laÅŸtÄ±rÄ±lmasÄ±.',
                                })}
                            </p>
                        </div>
                        {reconciliationDiscrepancies.hasErrors ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-900/30 text-rose-700 border border-rose-200/60 animate-pulse">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                {tx(lang, { fr: 'Attention : Ã‰cart dÃ©tectÃ© !', ar: 'Ø§Ù†ØªØ¨Ø§Ù‡: Ù‡Ù†Ø§Ùƒ ÙØ±ÙˆÙ‚Ø§Øª!', en: 'Warning: Discrepancy detected!', es: 'Â¡AtenciÃ³n: discrepancia detectada!', pt: 'AtenÃ§Ã£o: discrepÃ¢ncia detetada!', tr: 'Dikkat: TutarsÄ±zlÄ±k tespit edildi!' })}
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 border border-emerald-200/60">
                                <CheckCircle className="w-3.5 h-3.5" />
                                {tx(lang, { fr: 'Correspondance parfaite 100%', ar: 'Ù…Ø·Ø§Ø¨Ù‚Ø© ØªØ§Ù…Ø© 100%', en: 'Perfect match 100%', es: 'Coincidencia perfecta 100%', pt: 'CorrespondÃªncia perfeita 100%', tr: 'Tam eÅŸleÅŸme %100' })}
                            </span>
                        )}
                    </div>

                    {reconciliationDiscrepancies.hasErrors && (
                        <div className="bg-rose-50 dark:bg-rose-900/30 border border-rose-200/60 rounded-lg p-4 text-rose-900 text-xs font-medium flex items-start gap-3 font-sans">
                            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="font-semibold text-rose-950">
                                    {tx(lang, {
                                        fr: 'Veuillez ajuster les cases indiquÃ©es en rouge. Le total des lots ne correspond pas Ã  la cible :',
                                        ar: 'ÙŠØ±Ø¬Ù‰ Ù…Ø±Ø§Ø¬Ø¹Ø© Ø§Ù„Ø®Ø§Ù†Ø§Øª Ø§Ù„Ù…Ø´Ø§Ø± Ø¥Ù„ÙŠÙ‡Ø§ Ø¨Ø§Ù„Ù„ÙˆÙ† Ø§Ù„Ø£Ø­Ù…Ø±. Ù…Ø¬Ù…ÙˆØ¹ ÙƒÙ…ÙŠØ§Øª Ø§Ù„Ø¯ÙØ¹Ø§Øª Ù„Ø§ ÙŠØ·Ø§Ø¨Ù‚ Ø§Ù„ØªÙˆØ²ÙŠØ¹ Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠ:',
                                        en: 'Please adjust the cells highlighted in red. The lot total does not match the target:',
                                        es: 'Ajuste las casillas marcadas en rojo. El total de los lotes no coincide con el objetivo:',
                                        pt: 'Ajuste as cÃ©lulas assinaladas a vermelho. O total dos lotes nÃ£o corresponde ao alvo:',
                                        tr: 'KÄ±rmÄ±zÄ± iÅŸaretli hÃ¼creleri dÃ¼zeltin. Parti toplamÄ± hedefle uyuÅŸmuyor:',
                                    })}
                                </p>
                                <ul className="list-disc pl-5 space-y-0.5 tabular-nums text-[10px] text-rose-700 font-medium">
                                    {colors.filter(c => c.name.toLowerCase() !== 'total' && c.id.toLowerCase() !== 'total').map(c => {
                                        return sizes.filter(s => s.toLowerCase() !== 'total').map((s, sIdx) => {
                                            const diffVal = reconciliationDiscrepancies.diffs[c.id]?.[s] || 0;
                                            if (diffVal !== 0) {
                                                 const targetVal = Number(gridQuantities[`${c.id}_${sIdx}`]) || 0;
                                                 const plannedVal = planifiedTotals[c.id]?.[s] || 0;
                                                 return (
                                                    <li key={`${c.id}_${s}`}>
                                                        {c.name} ({s}) : {plannedVal} {tx(lang, { fr: 'planifiÃ©', ar: 'Ù…Ø®Ø·Ø·', en: 'planned', es: 'planificado', pt: 'planeado', tr: 'planlanan' })} / {targetVal} {tx(lang, { fr: 'cible', ar: 'Ø§Ù„Ù‡Ø¯Ù', en: 'target', es: 'objetivo', pt: 'alvo', tr: 'hedef' })} ({diffVal > 0 ? tx(lang, { fr: `+${diffVal} de trop`, ar: `+${diffVal} Ø²Ø§Ø¦Ø¯`, en: `+${diffVal} too many`, es: `+${diffVal} de mÃ¡s`, pt: `+${diffVal} a mais`, tr: `+${diffVal} fazla` }) : tx(lang, { fr: `${diffVal} manquant`, ar: `${diffVal} Ù†Ø§Ù‚Øµ`, en: `${diffVal} missing`, es: `${diffVal} faltante`, pt: `${diffVal} em falta`, tr: `${diffVal} eksik` })})
                                                    </li>
                                                 );
                                            }
                                            return null;
                                        });
                                    })}
                                </ul>
                            </div>
                        </div>
                    )}

                    <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-dk-border bg-white dark:bg-dk-surface">
                        <table className="w-full text-xs border-collapse">
                            <thead>
                                <tr className="bg-zinc-50/80 border-b border-slate-100 dark:border-dk-border text-slate-700 dark:text-dk-text-soft font-sans">
                                    <th className="py-3 px-3 text-left font-semibold border-r border-slate-100 dark:border-dk-border min-w-[120px] text-[10px] uppercase tracking-wider">Couleur \ Taille</th>
                                    {sizes.filter(s => s.toLowerCase() !== 'total').map((s, i) => (
                                        <th key={i} className="py-2 px-2 text-center font-semibold border-r border-slate-100 dark:border-dk-border min-w-[80px] text-[10px] uppercase tracking-wider">
                                            {s}
                                        </th>
                                    ))}
                                    <th className="py-2 px-3 text-center font-semibold bg-slate-200/80 text-slate-800 dark:text-dk-text w-28 text-[10px] uppercase tracking-wider border-l border-slate-200 dark:border-dk-border">TOTAL</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                                {colors.filter(c => c.name.toLowerCase() !== 'total' && c.id.toLowerCase() !== 'total').map((c, cIdx) => {
                                    const targetRowTotal = matrixStats.rowTotals[c.id] || 0;
                                    const plannedRowTotal = Object.values(planifiedTotals[c.id] || {}).reduce((a, b) => a + b, 0);
                                    const rowDiff = plannedRowTotal - targetRowTotal;
                                    
                                    const isRowMatching = rowDiff === 0;
                                    const hasRowPlanned = plannedRowTotal > 0;
                                    
                                    let rowCellBg = "bg-slate-50 dark:bg-dk-bg/30";
                                    let rowPlannedColor = "text-slate-700 dark:text-dk-text-soft font-bold";
                                    if (!isRowMatching) {
                                        rowCellBg = "bg-rose-50 dark:bg-rose-900/30/40 hover:bg-rose-50/60 transition-colors";
                                        rowPlannedColor = "text-rose-700 font-black";
                                    } else if (hasRowPlanned) {
                                        rowCellBg = "bg-emerald-50 dark:bg-emerald-900/30/30 hover:bg-emerald-50/45 transition-colors";
                                        rowPlannedColor = "text-emerald-700 font-extrabold";
                                    }

                                    return (
                                        <tr key={`${c.id}-${cIdx}`} className="hover:bg-slate-50/30 transition-colors">
                                            <td className="py-2.5 px-3 border-r border-slate-100 dark:border-dk-border font-semibold text-slate-700 dark:text-dk-text-soft flex items-center gap-2 bg-slate-50 dark:bg-dk-bg/20 font-sans">
                                                <div
                                                    className={`w-3 h-3 rounded-full flex-shrink-0 shadow-sm dark:shadow-dk-sm ${c.id && c.id.startsWith('#') ? '' : 'bg-slate-300'}`}
                                                    style={c.id && c.id.startsWith('#') ? { backgroundColor: c.id } : undefined}
                                                />
                                                <span className="truncate max-w-[150px]" title={c.name}>{c.name}</span>
                                            </td>
                                            {sizes.filter(s => s.toLowerCase() !== 'total').map((s, sIdx) => {
                                                const targetVal = Number(gridQuantities[`${c.id}_${sIdx}`]) || 0;
                                                const plannedVal = planifiedTotals[c.id]?.[s] || 0;
                                                const diff = plannedVal - targetVal;
                                                const isMatching = diff === 0;
                                                const hasPlanned = plannedVal > 0;

                                                let cellBg = "bg-white dark:bg-dk-surface";
                                                let plannedColor = "text-slate-700 dark:text-dk-text-soft font-bold";
                                                if (!isMatching) {
                                                    cellBg = "bg-rose-50 dark:bg-rose-900/30/20 hover:bg-rose-50/40 transition-colors";
                                                    plannedColor = "text-rose-700 font-black";
                                                } else if (hasPlanned) {
                                                    cellBg = "bg-emerald-50 dark:bg-emerald-900/30/15 hover:bg-emerald-50/30 transition-colors";
                                                    plannedColor = "text-emerald-700 font-extrabold";
                                                } else {
                                                    plannedColor = "text-slate-400 dark:text-dk-muted font-medium";
                                                }
                                                
                                            return (
                                                <td key={s} className={`py-2 px-2 border-r border-slate-100 dark:border-dk-border text-center tabular-nums ${cellBg}`}>
                                                        <div className="flex flex-col items-center">
                                                            <span className="text-[9px] text-slate-400 dark:text-dk-muted font-medium font-sans">
                                                                {tx(lang, { fr: 'Cible:', ar: 'Ø§Ù„Ù‡Ø¯Ù:', en: 'Target:', es: 'Objetivo:', pt: 'Alvo:', tr: 'Hedef:' })} {targetVal}
                                                            </span>
                                                            <span className={`text-xs ${plannedColor}`}>
                                                                {plannedVal}
                                                            </span>
                                                            {diff !== 0 && (
                                                                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md mt-0.5 border ${
                                                                    diff > 0 
                                                                        ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 border-rose-100/60' 
                                                                        : 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border-amber-100/60'
                                                                }`}>
                                                                    {diff > 0 ? `+${diff}` : diff}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                            <td className={`py-2 px-3 text-center tabular-nums border-l border-slate-200 dark:border-dk-border ${rowCellBg}`}>
                                                <div className="flex flex-col items-center justify-center">
                                                    <span className="text-[9px] text-slate-400 dark:text-dk-muted font-medium font-sans">{targetRowTotal}</span>
                                                    <span className={`text-xs ${rowPlannedColor}`}>{plannedRowTotal}</span>
                                                    {rowDiff !== 0 && (
                                                        <span className="text-[9px] font-black text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 px-1.5 py-0.5 rounded-md mt-0.5 border border-rose-100 animate-pulse">
                                                            {rowDiff > 0 ? `+${rowDiff}` : rowDiff}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="border-t-2 border-slate-200 dark:border-dk-border font-semibold bg-zinc-50/80 font-sans">
                                <tr>
                                    <td className="py-2.5 px-3 text-right uppercase text-[10px] tracking-wider text-slate-500 dark:text-dk-muted border-r border-slate-100 dark:border-dk-border">Total</td>
                                    {sizes.filter(s => s.toLowerCase() !== 'total').map((s, sIdx) => {
                                        const targetColTotal = matrixStats.colTotals[sIdx] || 0;
                                        const plannedColTotal = colors.filter(c => c.name.toLowerCase() !== 'total' && c.id.toLowerCase() !== 'total').reduce((sum, c) => sum + (planifiedTotals[c.id]?.[s] || 0), 0);
                                        const colDiff = plannedColTotal - targetColTotal;
                                        
                                        const isColMatching = colDiff === 0;
                                        const hasColPlanned = plannedColTotal > 0;
                                        
                                        let colCellBg = "bg-slate-50 dark:bg-dk-bg/40";
                                        let colPlannedColor = "text-slate-700 dark:text-dk-text-soft font-bold";
                                        if (!isColMatching) {
                                            colCellBg = "bg-rose-50 dark:bg-rose-900/30/30 hover:bg-rose-50/45 transition-colors";
                                            colPlannedColor = "text-rose-700 font-black";
                                        } else if (hasColPlanned) {
                                            colCellBg = "bg-emerald-50 dark:bg-emerald-900/30/20 hover:bg-emerald-50/35 transition-colors";
                                            colPlannedColor = "text-emerald-700 font-extrabold";
                                        }
                                        
                                        return (
                                            <td key={sIdx} className={`py-2 px-2 text-center border-r border-slate-100 dark:border-dk-border tabular-nums ${colCellBg}`}>
                                                <div className="flex flex-col items-center justify-center">
                                                    <span className="text-[9px] text-slate-400 dark:text-dk-muted font-medium font-sans">{targetColTotal}</span>
                                                    <span className={`text-xs ${colPlannedColor}`}>{plannedColTotal}</span>
                                                    {colDiff !== 0 && (
                                                        <span className="text-[9px] font-black text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 px-1.5 py-0.5 rounded-md mt-0.5 border border-rose-100 animate-pulse">
                                                            {colDiff > 0 ? `+${colDiff}` : colDiff}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        );
                                    })}
                                    {(() => {
                                        const targetGrandTotal = matrixStats.grandTotal;
                                        const plannedGrandTotal = Object.values(planifiedTotals).reduce((sum, sizeMap) => sum + Object.values(sizeMap).reduce((s, val) => s + (val || 0), 0), 0);
                                        const grandDiff = plannedGrandTotal - targetGrandTotal;
                                        
                                        const isGrandMatching = grandDiff === 0;
                                        const hasGrandPlanned = plannedGrandTotal > 0;
                                        
                                        let grandCellClass = "";
                                        if (!isGrandMatching) {
                                            grandCellClass = "bg-gradient-to-br from-rose-500 to-rose-600 text-white animate-pulse shadow-md dark:shadow-dk-md rounded-br-xl";
                                        } else if (hasGrandPlanned) {
                                            grandCellClass = "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md dark:shadow-dk-md rounded-br-xl";
                                        } else {
                                            grandCellClass = "bg-slate-200 text-slate-700 dark:text-dk-text-soft";
                                        }
                                        
                                        return (
                                            <td className={`py-2.5 px-3 text-center border-l border-slate-200 dark:border-dk-border ${grandCellClass}`}>
                                                <div className="flex flex-col items-center justify-center tabular-nums">
                                                    <span className="text-[9px] opacity-75 font-semibold font-sans">{targetGrandTotal}</span>
                                                    <span className="text-sm font-black">{plannedGrandTotal}</span>
                                                    {grandDiff !== 0 && (
                                                        <span className="text-[9px] font-black bg-white dark:bg-dk-surface/20 px-1.5 py-0.5 rounded-md mt-0.5 border border-white/10">
                                                            {grandDiff > 0 ? `+${grandDiff}` : grandDiff}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        );
                                    })()}
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}

            {/* Material Detail Modal */}
            {confirmModal.open && confirmModal.mat && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200" dir="ltr" onClick={() => setConfirmModal({ open: false, qty: '' })}>
                    <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-100 dark:border-dk-border w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="px-5 h-12 border-b border-slate-100 dark:border-dk-border flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} />
                            <div>
                                <h3 className="text-[13px] font-semibold text-slate-900 dark:text-dk-text tracking-tight">{tx(lang, { fr: 'Confirmer rÃ©ception', ar: 'ØªØ£ÙƒÙŠØ¯ Ø§Ù„Ø§Ø³ØªÙ„Ø§Ù…', en: 'Confirm reception', es: 'Confirmar recepciÃ³n', pt: 'Confirmar receÃ§Ã£o', tr: 'TeslimatÄ± onayla' })}</h3>
                                <p className="text-[11px] text-slate-400 dark:text-dk-muted truncate max-w-[280px]">{confirmModal.mat.name}</p>
                            </div>
                        </div>
                        <div className="p-5">
                            <label className="block text-[11px] font-medium text-slate-500 dark:text-dk-muted mb-1.5">{tx(lang, { fr: 'QuantitÃ© reÃ§ue', ar: 'Ø§Ù„ÙƒÙ…ÙŠØ© Ø§Ù„Ù…Ø³ØªÙ„Ù…Ø©', en: 'Quantity received', es: 'Cantidad recibida', pt: 'Quantidade recebida', tr: 'AlÄ±nan miktar' })} ({confirmModal.mat.unit})</label>
                            <input
                                type="number" min="0" step="0.01" autoFocus
                                value={confirmModal.qty}
                                onChange={(e) => setConfirmModal(c => ({ ...c, qty: e.target.value }))}
                                className="w-full h-9 px-3 bg-white dark:bg-dk-surface hover:bg-slate-50 dark:hover:bg-dk-elevated/60 focus:bg-white border border-slate-200 dark:border-dk-border focus:border-slate-300 rounded-md text-[13px] font-semibold text-slate-700 dark:text-dk-text-soft focus:ring-2 focus:ring-slate-100 outline-none transition-all tabular-nums"
                            />
                            <p className="text-[10.5px] text-slate-400 dark:text-dk-muted mt-1.5">{tx(lang, { fr: `Besoin : ${fmt(confirmModal.mat.buyQty)} ${confirmModal.mat.unit}. S'ajoute au stock et lÃ¨ve Â« Attente Â» (BR pour le Planning).`, ar: `Ø§Ù„Ø§Ø­ØªÙŠØ§Ø¬: ${fmt(confirmModal.mat.buyQty)} ${confirmModal.mat.unit}. ÙŠØ¶Ø§Ù Ø¥Ù„Ù‰ Ø§Ù„Ù…Ø®Ø²ÙˆÙ† ÙˆÙŠØ±ÙØ¹ Â« Ø§Ù†ØªØ¸Ø§Ø± Â» (BR Ù„Ù„ØªØ®Ø·ÙŠØ·).`, en: `Need: ${fmt(confirmModal.mat.buyQty)} ${confirmModal.mat.unit}. Adds to stock and removes "Waiting" (BR for Planning).`, es: `Necesidad: ${fmt(confirmModal.mat.buyQty)} ${confirmModal.mat.unit}. Se agrega al stock y elimina Â« Espera Â» (BR para PlanificaciÃ³n).`, pt: `Necessidade: ${fmt(confirmModal.mat.buyQty)} ${confirmModal.mat.unit}. Adiciona ao stock e remove Â« Espera Â» (BR para Planeamento).`, tr: `Ä°htiyaÃ§: ${fmt(confirmModal.mat.buyQty)} ${confirmModal.mat.unit}. Stoka eklenir ve Â« Bekleme Â» kaldÄ±rÄ±lÄ±r (Planlama iÃ§in BR).` })}</p>
                        </div>
                        <div className="bg-zinc-50/80 px-5 py-4 flex justify-end gap-2.5 border-t border-slate-100 dark:border-dk-border">
<button onClick={() => setConfirmModal({ open: false, qty: '' })} className="px-4 h-9 text-[12px] font-medium text-slate-600 dark:text-dk-text-soft bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-md hover:bg-slate-50 dark:hover:bg-dk-elevated/60 transition-colors">{tx(lang, { fr: 'Annuler', ar: 'Ø¥Ù„ØºØ§Ø¡', en: 'Cancel', es: 'Cancelar', pt: 'Cancelar', tr: 'Ä°ptal' })}</button>
                                                                                            <button onClick={handleConfirmReception} className="inline-flex items-center gap-1.5 px-4 h-9 text-[12px] font-medium text-white bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-700 dark:hover:bg-dk-accent-hover rounded-md transition-colors">
                                                                                                <CheckCircle className="w-3.5 h-3.5" strokeWidth={2} /> {tx(lang, { fr: 'Confirmer', ar: 'ØªØ£ÙƒÙŠØ¯', en: 'Confirm', es: 'Confirmar', pt: 'Confirmar', tr: 'Onayla' })}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {selectedMaterial && (
                <MaterialDetailModal
                    material={{
                        name: selectedMaterial.name,
                        unitPrice: selectedMaterial.unitPrice,
                        qtyToBuy: selectedMaterial.buyQty || selectedMaterial.qtyToBuy,
                        unit: selectedMaterial.unit,
                        lineCost: selectedMaterial.cost || selectedMaterial.lineCost,
                        fournisseur: selectedMaterial.fournisseur || undefined,
                        threadMeters: selectedMaterial.threadMeters,
                        colorName: selectedMaterial.colorName,
                        pieces: selectedMaterial.colorPieces || selectedMaterial.applicablePieces || selectedMaterial.pieces,
                        magasinId: selectedMaterial.magasinId,
                        threadReference: selectedMaterial.threadReference,
                    }}
                    currency="DH"
                    magasinData={magasinData}
                    onClose={() => setSelectedMaterial(null)}
                />
            )}
        </div>
    );
}
