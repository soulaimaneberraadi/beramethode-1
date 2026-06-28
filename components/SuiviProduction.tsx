import React, { useMemo, useState, useEffect } from 'react';
import type { AppSettings, ModelData, PlanningEvent, SuiviData, MaterialReceipt, InventoryMovement, MouvementStock, PlanningStatus } from '../types';
import { deriveHourGrid } from './suivi/shared/hours';
import { getOFColor, OF_COLOR_CHOICES, type OFStyle } from './suivi/shared/ofColors';
import { useIsMobile } from './planning/shared/useIsMobile';
import { 
    Activity, Clock, ChevronLeft, ChevronRight, Plus, 
    User, Settings, ToggleLeft, ToggleRight, Info, AlertCircle, CheckCircle, Save,
    ShieldAlert, Sparkles, Sliders, Layers, BarChart2, CheckSquare, Trash2,
    Package, TrendingDown, AlertTriangle, X, Image as ImageIcon, CalendarDays, CalendarRange, MoreVertical
} from 'lucide-react';
import DateTimePicker from './ui/DateTimePicker';
import { DEFAULT_CALENDAR_APP_SETTINGS } from '../lib/defaultCalendarSettings';
import { tx } from '../lib/i18n';
import { useLang } from '../src/context/LanguageContext';

interface Props {
    models: ModelData[];
    suivis: SuiviData[];
    setSuivis: React.Dispatch<React.SetStateAction<SuiviData[]>>;
    planningEvents?: PlanningEvent[];
    setPlanningEvents?: React.Dispatch<React.SetStateAction<PlanningEvent[]>>;
    settings: AppSettings;
    directModelId?: string | null;
    clearDirectModel?: () => void;
    machines?: any[];
    selectedChaineId?: string;
    setSelectedChaineId?: (chaineId: string) => void;
    globalDate?: string;
    setGlobalDate?: (date: string) => void;
}

const SUIVI_LABELS = {
    title: { fr: 'Suivi de Production', ar: 'تتبع الإنتاج', en: 'Production Tracking', es: 'Seguimiento de Producción', pt: 'Acompanhamento da Produção', tr: 'Üretim Takibi' },
    subtitle: { fr: 'Relevés horaires et effectifs saisissables directement sur la grille', ar: 'تسجيل الإنتاج بالساعة والموارد البشرية مباشرة على الجدول', en: 'Hourly production and workforce entries directly on the grid', es: 'Registros horarios y personal editables directamente en la tabla', pt: 'Registos horários e efetivos editáveis diretamente na grelha', tr: 'Saatlik üretim ve personel kayıtları doğrudan tabloda' },
    activeModel: { fr: 'Modèle Actif', ar: 'النموذج النشط', en: 'Active Model', es: 'Modelo activo', pt: 'Modelo ativo', tr: 'Aktif model' },
    chain: { fr: 'Séquence', ar: 'السلسلة', en: 'Line', es: 'Línea', pt: 'Linha', tr: 'Hat' },
    week: { fr: 'Semaine', ar: 'الأسبوع', en: 'Week', es: 'Semana', pt: 'Semana', tr: 'Hafta' },
    supervisor: { fr: 'Responsable ligne', ar: 'مسؤول الخط', en: 'Line supervisor', es: 'Responsable de línea', pt: 'Responsável da linha', tr: 'Hat sorumlusu' },
    activeModels: { fr: 'Modèles Actifs', ar: 'النماذج النشطة', en: 'Active Models', es: 'Modelos activos', pt: 'Modelos ativos', tr: 'Aktif modeller' },
    yieldAvg: { fr: 'M.R Moyen Hebdomadaire', ar: 'متوسط M.R الأسبوعي', en: 'Weekly average M.R', es: 'M.R medio semanal', pt: 'M.R médio semanal', tr: 'Haftalık ortalama M.R' },
    date: { fr: 'Date', ar: 'التاريخ', en: 'Date', es: 'Fecha', pt: 'Data', tr: 'Tarih' },
    day: { fr: 'Jour', ar: 'اليوم', en: 'Day', es: 'Día', pt: 'Dia', tr: 'Gün' },
    pJournaliere: { fr: 'P. Journ.', ar: 'الإنتاج اليومي', en: 'Daily output', es: 'Prod. diaria', pt: 'Prod. diária', tr: 'Günlük üretim' },
    totalHours: { fr: 'Total H', ar: 'إجمالي الساعات', en: 'Total H', es: 'Total H', pt: 'Total H', tr: 'Toplam saat' },
    effectif: { fr: 'Effectif', ar: 'العمالة', en: 'Workforce', es: 'Efectivo', pt: 'Efetivo', tr: 'Personel' },
    yieldDay: { fr: 'R. TOTAL DAY', ar: 'المردودية اليومية الإجمالية', en: 'Total daily efficiency', es: 'Rendimiento diario total', pt: 'Rendimento diário total', tr: 'Toplam günlük verim' },
    yieldHour: { fr: 'Rendement Horaire', ar: 'المردودية بالساعة', en: 'Hourly efficiency', es: 'Rendimiento horario', pt: 'Rendimento horário', tr: 'Saatlik verim' },
    trs: { fr: 'Taux TRS Synthétique', ar: 'مؤشر TRS التركيبي', en: 'Synthetic TRS rate', es: 'Tasa TRS sintética', pt: 'Taxa TRS sintética', tr: 'Sentetik TRS oranı' },
    dispo: { fr: 'Dispo.', ar: 'التوفر', en: 'Availability', es: 'Disponibilidad', pt: 'Disponibilidade', tr: 'Kullanılabilirlik' },
    perf: { fr: 'Perf.', ar: 'الأداء', en: 'Performance', es: 'Rendimiento', pt: 'Desempenho', tr: 'Performans' },
    quality: { fr: 'Qualité', ar: 'الجودة', en: 'Quality', es: 'Calidad', pt: 'Qualidade', tr: 'Kalite' },
    timeline: { fr: 'Chronologie de la journée', ar: 'التسلسل الزمني لليوم', en: 'Daily timeline', es: 'Cronología del día', pt: 'Cronologia do dia', tr: 'Gün zaman çizelgesi' },
    wip: { fr: 'Suivi des Tailles & Encours (WIP)', ar: 'تتبع المقاسات والمنتجات قيد الإنجاز (WIP)', en: 'Sizes & WIP tracking', es: 'Seguimiento de tallas y WIP', pt: 'Acompanhamento de tamanhos e WIP', tr: 'Beden ve WIP takibi' },
    size: { fr: 'Taille', ar: 'المقاس', en: 'Size', es: 'Talla', pt: 'Tamanho', tr: 'Beden' },
    inputs: { fr: 'Total Entrées', ar: 'إجمالي الإدخالات', en: 'Total inputs', es: 'Total entradas', pt: 'Total entradas', tr: 'Toplam giriş' },
    outputs: { fr: 'Total Sorties', ar: 'إجمالي المخرجات', en: 'Total outputs', es: 'Total salidas', pt: 'Total saídas', tr: 'Toplam çıkış' },
    bottleneck: { fr: "Goulot d'étranglement", ar: 'عنق الزجاجة', en: 'Bottleneck', es: 'Cuello de botella', pt: 'Gargalo', tr: 'Darboğaz' },
    fluid: { fr: 'Fluide', ar: 'سلس', en: 'Smooth', es: 'Fluido', pt: 'Fluido', tr: 'Akıcı' },
    gamme: { fr: 'Gamme de Montage & Adéquation RH', ar: 'غامة التركيب وملاءمة الموارد البشرية', en: 'Assembly routing & HR matching', es: 'Gama de montaje y adecuación RH', pt: 'Gama de montagem e adequação RH', tr: 'Montaj rotası ve İK uyumu' },
    requiredSkills: { fr: 'Machines requises vs qualifications RH', ar: 'الآلات المطلوبة مقابل مؤهلات الموارد البشرية', en: 'Required machines vs HR qualifications', es: 'Máquinas requeridas vs cualificaciones RH', pt: 'Máquinas exigidas vs qualificações RH', tr: 'Gerekli makineler ve İK nitelikleri' },
    save: { fr: 'Enregistrer', ar: 'حفظ', en: 'Save', es: 'Guardar', pt: 'Guardar', tr: 'Kaydet' },
    saving: { fr: 'Sauvegarde...', ar: 'جار الحفظ...', en: 'Saving...', es: 'Guardando...', pt: 'A guardar...', tr: 'Kaydediliyor...' },
    saved: { fr: 'Enregistré', ar: 'تم الحفظ', en: 'Saved', es: 'Guardado', pt: 'Guardado', tr: 'Kaydedildi' },
    error: { fr: 'Erreur', ar: 'خطأ', en: 'Error', es: 'Error', pt: 'Erro', tr: 'Hata' },
    downtimes: { fr: 'Légende downtimes', ar: 'دليل أوقات التوقف', en: 'Downtime legend', es: 'Leyenda de paradas', pt: 'Legenda de paragens', tr: 'Duruş açıklamaları' },
    overrideMode: { fr: 'Mode Modification', ar: 'وضع التعديل', en: 'Edit mode', es: 'Modo edición', pt: 'Modo edição', tr: 'Düzenleme modu' },
    doubleClick: { fr: 'Double-cliquez pour plus de détails', ar: 'انقر مرتين لعرض التفاصيل', en: 'Double-click for details', es: 'Doble clic para ver detalles', pt: 'Duplo clique para ver detalhes', tr: 'Ayrıntılar için çift tıklayın' },
    cellModalTitle: { fr: "Détails de l'heure de travail", ar: 'تفاصيل ساعة العمل', en: 'Work hour details', es: 'Detalles de la hora de trabajo', pt: 'Detalhes da hora de trabalho', tr: 'Çalışma saati ayrıntıları' },
    quantity: { fr: 'Quantité produite', ar: 'الكمية المنتجة', en: 'Produced quantity', es: 'Cantidad producida', pt: 'Quantidade produzida', tr: 'Üretilen miktar' },
    defects: { fr: 'Nombre de défauts', ar: 'عدد العيوب', en: 'Defect count', es: 'Número de defectos', pt: 'Número de defeitos', tr: 'Hata sayısı' },
    defectType: { fr: 'Type de défaut', ar: 'نوع العيب', en: 'Defect type', es: 'Tipo de defecto', pt: 'Tipo de defeito', tr: 'Hata türü' },
    close: { fr: 'Fermer', ar: 'إغلاق', en: 'Close', es: 'Cerrar', pt: 'Fechar', tr: 'Kapat' },
    none: { fr: 'Aucun', ar: 'لا يوجد', en: 'None', es: 'Ninguno', pt: 'Nenhum', tr: 'Yok' },
    lunch: { fr: 'Déjeuner (L)', ar: 'غداء (L)', en: 'Lunch (L)', es: 'Almuerzo (L)', pt: 'Almoço (L)', tr: 'Öğle yemeği (L)' },
    pause: { fr: 'Pause (P)', ar: 'استراحة (P)', en: 'Break (P)', es: 'Pausa (P)', pt: 'Pausa (P)', tr: 'Mola (P)' },
    breakdown: { fr: 'Panne Machine (M)', ar: 'عطل آلة (M)', en: 'Machine breakdown (M)', es: 'Avería de máquina (M)', pt: 'Avaria de máquina (M)', tr: 'Makine arızası (M)' },
    rupture: { fr: 'Rupture Appro (S)', ar: 'نقص في التزويد (S)', en: 'Supply shortage (S)', es: 'Ruptura de suministro (S)', pt: 'Rutura de abastecimento (S)', tr: 'Tedarik kesintisi (S)' },
    sewing: { fr: 'Couture', ar: 'الخياطة', en: 'Sewing', es: 'Costura', pt: 'Costura', tr: 'Dikiş' },
    fabric: { fr: 'Tissu', ar: 'القماش', en: 'Fabric', es: 'Tejido', pt: 'Tecido', tr: 'Kumaş' },
    cut: { fr: 'Coupe', ar: 'القص', en: 'Cutting', es: 'Corte', pt: 'Corte', tr: 'Kesim' },
    other: { fr: 'Autre', ar: 'أخرى', en: 'Other', es: 'Otro', pt: 'Outro', tr: 'Diğer' },
};

type SuiviLabels = Record<keyof typeof SUIVI_LABELS, string>;

function buildSuiviLabels(lang: string): SuiviLabels {
    return Object.fromEntries(
        Object.entries(SUIVI_LABELS).map(([key, value]) => [key, tx(lang, value)])
    ) as SuiviLabels;
}

export default function SuiviProduction({
    models, suivis = [], setSuivis, planningEvents = [], setPlanningEvents, settings,
    directModelId, clearDirectModel, machines,
    selectedChaineId: propSelectedChaineId,
    setSelectedChaineId: propSetSelectedChaineId,
    globalDate,
    setGlobalDate,
}: Props) {
    // 1. Core States
    const { lang } = useLang();
    const isMobile = useIsMobile();
    const [localSelectedChaineId, localSetSelectedChaineId] = useState<string>('CHAINE 1');
    const selectedChaineId = propSelectedChaineId !== undefined ? propSelectedChaineId : localSelectedChaineId;
    const setSelectedChaineId = propSetSelectedChaineId !== undefined ? propSetSelectedChaineId : localSetSelectedChaineId;

    const weekStart = useMemo(() => {
        const targetDate = new Date(globalDate || new Date().toISOString().split('T')[0]);
        const day = targetDate.getDay();
        const diff = targetDate.getDate() - day + (day === 0 ? -6 : 1); // Get Monday of that week
        return new Date(targetDate.setDate(diff)).toISOString().split('T')[0];
    }, [globalDate]);

    // 3. Derive Week Days (Monday to Saturday)
    const weekDays = useMemo(() => {
        const days = [];
        const start = new Date(weekStart);
        const weekdayNames = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
        for (let i = 0; i < 6; i++) {
            const current = new Date(start);
            current.setDate(start.getDate() + i);
            days.push({
                dateStr: current.toISOString().split('T')[0],
                label: weekdayNames[i],
                displayDate: current.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
            });
        }
        return days;
    }, [weekStart]);

    // Édition toujours active + sauvegarde automatique (plus de bouton "Mode Modification").
    const [isOverrideMode] = useState<boolean>(true);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [selectedActiveModelId, setSelectedActiveModelId] = useState<string>('');
    const [activeCellModal, setActiveCellModal] = useState<{ dateStr: string; hourKey: string; hourLabel: string; } | null>(null);

    // Couleurs choisies manuellement par OF (key = planningId/OF). Priorité sur l'auto + event.color.
    const [ofColorOverrides, setOfColorOverrides] = useState<Record<string, string>>(() => {
        try {
            const saved = localStorage.getItem('beramethode_of_colors');
            return saved ? JSON.parse(saved) : {};
        } catch (_) {
            return {};
        }
    });
    useEffect(() => {
        try {
            localStorage.setItem('beramethode_of_colors', JSON.stringify(ofColorOverrides));
        } catch (_) {}
    }, [ofColorOverrides]);
    const [colorPickerOpen, setColorPickerOpen] = useState<boolean>(false);
    const [modelDropdownOpen, setModelDropdownOpen] = useState<boolean>(false);
    const [editingStatusEvent, setEditingStatusEvent] = useState<PlanningEvent | null>(null);
    const [mobileWeekView, setMobileWeekView] = useState<boolean>(false);

    const [showStatsHeader, setShowStatsHeader] = useState<boolean>(() => {
        try {
            const saved = localStorage.getItem('beramethode_show_stats_header');
            return saved ? JSON.parse(saved) : false;
        } catch (_) {
            return false;
        }
    });



    useEffect(() => {
        try {
            localStorage.setItem('beramethode_show_stats_header', JSON.stringify(showStatsHeader));
        } catch (_) {}
    }, [showStatsHeader]);

    const handleOpenCellModal = (dateStr: string, hourKey: string, hourLabel: string) =>
        setActiveCellModal({ dateStr, hourKey, hourLabel });

    // Active translation dictionary
    const l = useMemo(() => buildSuiviLabels(lang), [lang]);

    // Redirection effect for direct model tracking
    useEffect(() => {
        if (directModelId) {
            const plan = planningEvents.find(p => p.modelId === directModelId);
            let targetChaineId = selectedChaineId;
            let targetDate: Date | null = null;

            if (plan) {
                if (plan.chaineId) targetChaineId = plan.chaineId;
                if (plan.startDate) targetDate = new Date(plan.startDate);
                else if (plan.dateLancement) targetDate = new Date(plan.dateLancement);
                setSelectedActiveModelId(plan.id);
            } else {
                const suivi = suivis.find(s => s.modelId === directModelId);
                if (suivi) {
                    if (suivi.chaineId) targetChaineId = suivi.chaineId;
                    if (suivi.date) targetDate = new Date(suivi.date);
                    setSelectedActiveModelId(entryOFKey(suivi));
                } else {
                    setSelectedActiveModelId(directModelId);
                }
            }

            setSelectedChaineId(targetChaineId);

            if (targetDate && !isNaN(targetDate.getTime())) {
                const ymd = targetDate.toISOString().split('T')[0];
                if (setGlobalDate) setGlobalDate(ymd);
            }

            if (clearDirectModel) {
                clearDirectModel();
            }
        }
    }, [directModelId, planningEvents, suivis, clearDirectModel, setGlobalDate]);

    // States for overconsumption tracking (real movements and products)
    const [mvts, setMvts] = useState<MouvementStock[]>([]);
    const [products, setProducts] = useState<any[]>([]);

    useEffect(() => {
        const fetchMagasinData = async () => {
            try {
                const [resMvts, resProd] = await Promise.all([
                    fetch('/api/magasin/mouvements', { credentials: 'include' }),
                    fetch('/api/magasin/products', { credentials: 'include' })
                ]);
                if (resMvts.ok) {
                    setMvts(await resMvts.json());
                } else {
                    const raw = localStorage.getItem('beramethode_mouvements');
                    if (raw) setMvts(JSON.parse(raw));
                }
                if (resProd.ok) {
                    setProducts(await resProd.json());
                } else {
                    const raw = localStorage.getItem('beramethode_magasin');
                    if (raw) setProducts(JSON.parse(raw));
                }
            } catch (e) {
                try {
                    const rawMvts = localStorage.getItem('beramethode_mouvements');
                    if (rawMvts) setMvts(JSON.parse(rawMvts));
                    const rawProd = localStorage.getItem('beramethode_magasin');
                    if (rawProd) setProducts(JSON.parse(rawProd));
                } catch (_) {}
            }
        };
        fetchMagasinData();
    }, [weekStart, selectedChaineId]);

    // Selected day for the graphic rendering (defaults to Monday)
    const [selectedChartDate, setSelectedChartDate] = useState<string>('');

    // Sélection d'un jour : met à jour le local + pousse vers globalDate (sur action utilisateur).
    // On évite la boucle infinie en NE synchronisant PAS automatiquement local → global dans un effet.
    const selectChartDate = React.useCallback((d: string) => {
        setSelectedChartDate(d);
        if (setGlobalDate && d !== globalDate) setGlobalDate(d);
    }, [setGlobalDate, globalDate]);

    // Sync descendante seulement : globalDate (parent) → selectedChartDate quand il tombe dans la semaine.
    useEffect(() => {
        if (globalDate && globalDate !== selectedChartDate) {
            const weekDates = weekDays.map(d => d.dateStr);
            if (weekDates.includes(globalDate)) {
                setSelectedChartDate(globalDate);
            }
        }
    }, [globalDate, weekDays, selectedChartDate]);

    // Supervisors map
    const [supervisors, setSupervisors] = useState<Record<string, string>>({
        'CHAINE 2': 'REDA',
        'CHAINE 3': 'MOHAMED',
    });

    // Audio chime helper
    const playChime = () => {
        try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContextClass) return;
            const ctx = new AudioContextClass();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
            osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
            
            gain.gain.setValueAtTime(0.04, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.start();
            osc.stop(ctx.currentTime + 0.3);
        } catch (e) {
            // Audio context blocked
        }
    };

    // 2. Derive Dynamic Shift Hours from settings
    const hourBlocks = useMemo(() => {
        const { hours: rawHours, keys: rawKeys } = deriveHourGrid(settings);
        return rawHours.map((h, i) => {
            const [hStr, mStr] = h.split(':').map(Number);
            const startMin = (hStr || 8) * 60 + (mStr || 0);
            
            // Custom shift rules matching lunch gap in Excel sheet
            let duration = 60;
            if (rawHours[i] === '15:00' || rawKeys[i] === 'h1500') {
                duration = 30; // last block is 30 mins
            }
            
            const endMin = startMin + duration;
            const hEnd = Math.floor(endMin / 60).toString().padStart(2, '0');
            const mEnd = (endMin % 60).toString().padStart(2, '0');

            return {
                key: rawKeys[i],
                label: `${h}/${hEnd}:${mEnd}`,
                duration,
            };
        });
    }, [settings]);



    // Dynamic chains list based on settings and active data
    const chainsList = useMemo(() => {
        const count = settings?.chainsCount || 4;
        const list: string[] = [];
        for (let i = 1; i <= count; i++) {
            list.push(`CHAINE ${i}`);
        }
        if (selectedChaineId && !list.includes(selectedChaineId)) {
            list.push(selectedChaineId);
        }
        return list;
    }, [settings?.chainsCount, selectedChaineId]);

    // Set default chart date to Monday of the week
    useEffect(() => {
        if (weekDays.length > 0 && (!selectedChartDate || !weekDays.some(d => d.dateStr === selectedChartDate))) {
            setSelectedChartDate(weekDays[0].dateStr);
        }
    }, [weekDays, selectedChartDate]);

    // Clé OF stable pour un suivi : planningId si l'OF existe encore, sinon legacy `plan_<modelId>`.
    const entryOFKey = React.useCallback((s: SuiviData): string => {
        if (s.planningId && planningEvents.some(p => p.id === s.planningId)) return s.planningId;
        if (s.modelId) return `plan_${s.modelId}`;
        return s.planningId || '';
    }, [planningEvents]);

    // 4. Active Models list — UNE entrée par OF/Pedido (clé = planningId), pas par modèle.
    // Deux Pedidos du même modèle = deux entrées distinctes avec deux couleurs.
    const activeModels = useMemo(() => {
        const weekDates = weekDays.map(d => d.dateStr);
        const weekSuivis = suivis.filter(s => s.chaineId === selectedChaineId && weekDates.includes(s.date));

        const byOF = new Map<string, {
            id: string; name: string; reference: string; sam: number; target: number;
            produced: number; remaining: number; restPerHour: string; style: OFStyle;
            planningId: string; modelId: string; ofTag?: string; image?: string | null; gamme: any[];
            producedThisWeek: number;
        }>();

        const addEntry = (ofKey: string, modelId: string | undefined, planningId: string, ev?: PlanningEvent) => {
            if (!ofKey || byOF.has(ofKey)) return;
            const m = models.find(x => x.id === modelId);
            const name = ev?.modelName || m?.meta_data?.nom_modele || m?.filename || 'Modèle Inconnu';
            const ref = m?.meta_data?.reference || (modelId || '').substring(0, 8) || ofKey.substring(0, 8);
            const sam = m?.meta_data?.total_temps || 12;
            const override = ofColorOverrides[ofKey] || ev?.color || null;
            const style = getOFColor(ofKey, override);
            const target = ev?.qteTotal || m?.meta_data?.quantity || 1500;
            const image = m?.image || m?.images?.front || m?.meta_data?.photo_url || null;
            byOF.set(ofKey, {
                id: ofKey,
                name,
                reference: ref,
                sam,
                target,
                produced: 0,
                producedThisWeek: 0,
                remaining: target,
                restPerHour: '0.00',
                style,
                planningId,
                modelId: modelId || '',
                ofTag: undefined,
                image,
                gamme: m?.gamme_operatoire || [],
            });
        };

        // a) Tous les OF planifiés sur cette chaîne et qui chevauchent la semaine sélectionnée.
        const weekStartStr = weekDates[0];
        const weekEndStr = weekDates[weekDates.length - 1];

        planningEvents.filter(p => {
            if (p.chaineId !== selectedChaineId) return false;
            
            const evStart = p.startDate || p.dateLancement || '';
            const evEnd = p.estimatedEndDate || p.dateExport || p.dateFin || evStart;
            
            const startYmd = evStart.split('T')[0];
            const endYmd = evEnd.split('T')[0];
            
            return startYmd <= weekEndStr && endYmd >= weekStartStr;
        }).forEach(ev => {
            addEntry(ev.id, ev.modelId, ev.id, ev);
        });

        // b) OF présents dans les suivis de la semaine (couvre legacy + données orphelines).
        weekSuivis.forEach(s => {
            const ofKey = entryOFKey(s);
            if (!ofKey) return;
            const ev = planningEvents.find(p => p.id === s.planningId);
            addEntry(ofKey, s.modelId || ev?.modelId, ev?.id || ofKey, ev);
        });

        const list = Array.from(byOF.values());

        // Tag OF court (ex: OF-1a2b) uniquement quand 2+ OF partagent la même référence,
        // pour les distinguer sans les confondre.
        const refCounts = new Map<string, number>();
        list.forEach(am => refCounts.set(am.reference, (refCounts.get(am.reference) || 0) + 1));
        list.forEach(am => {
            if ((refCounts.get(am.reference) || 0) > 1) {
                am.ofTag = `OF-${am.id.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase()}`;
            }
        });

        // Production cumulée par OF (globale et cette semaine).
        list.forEach(am => {
            const globalProd = suivis
                .filter(s => entryOFKey(s) === am.id)
                .reduce((acc, curr) => acc + (curr.totalHeure || 0), 0);
            
            const weekProd = weekSuivis
                .filter(s => entryOFKey(s) === am.id)
                .reduce((acc, curr) => acc + (curr.totalHeure || 0), 0);

            am.produced = globalProd;
            am.producedThisWeek = weekProd;
            am.remaining = am.target - globalProd;
            am.restPerHour = (am.target - globalProd) > 0 ? ((am.target - globalProd) / 48).toFixed(2) : '0.00';
        });

        return list;
    }, [selectedChaineId, weekDays, suivis, planningEvents, models, ofColorOverrides, entryOFKey]);

    // Keep selected active model synchronized
    useEffect(() => {
        if (activeModels.length > 0) {
            if (!selectedActiveModelId || !activeModels.some(m => m.id === selectedActiveModelId)) {
                setSelectedActiveModelId(activeModels[0].id);
            }
        } else {
            setSelectedActiveModelId('');
        }
    }, [activeModels, selectedActiveModelId]);

    // Save/Sync database call
    const handleSave = async (updatedSuivis = suivis) => {
        setSaveStatus('saving');
        try {
            const res = await fetch('/api/suivi', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ suivis: updatedSuivis }),
            });
            if (res.ok) {
                setSaveStatus('saved');
                setTimeout(() => setSaveStatus('idle'), 2000);
            } else {
                setSaveStatus('error');
            }
        } catch (e) {
            setSaveStatus('error');
        }
    };

    // Change current week
    const changeWeek = (offsetWeeks: number) => {
        const currentRef = globalDate || new Date().toISOString().split('T')[0];
        const d = new Date(currentRef);
        d.setDate(d.getDate() + offsetWeeks * 7);
        const nextYmd = d.toISOString().split('T')[0];
        if (setGlobalDate) setGlobalDate(nextYmd);
    };

    // Get value & model metadata for a cell
    const getCellMeta = React.useCallback((dateStr: string, hourKey: string) => {
        const dayEntries = suivis.filter(s => s.chaineId === selectedChaineId && s.date === dateStr);
        for (const entry of dayEntries) {
            const val = entry.sorties?.[hourKey];
            if (val !== undefined && val !== null) {
                const ofKey = entryOFKey(entry);
                const mInfo = activeModels.find(x => x.id === ofKey);
                const defectsForHour = entry.defauts?.filter(d => d.hour === hourKey) || [];
                const defectsQty = defectsForHour.reduce((acc, d) => acc + d.quantity, 0);
                
                return {
                    value: val,
                    model: mInfo,
                    entry,
                    downtime: entry.downtimes?.[hourKey] || null,
                    defectsQty,
                    defects: defectsForHour,
                };
            }
        }
        return null;
    }, [suivis, selectedChaineId, activeModels, entryOFKey]);

    // Handle cell updates (quantity, model, downtime, defects)
    const handleSaveCell = (
        dateStr: string,
        hourKey: string,
        quantity: number,
        ofId: string,            // clé OF (= activeModel.id)
        downtime: string | null,
        defectsQty = 0,
        defectType = 'Couture'
    ) => {
        const mInfo = activeModels.find(x => x.id === ofId);
        if (!mInfo) return;

        let newSuivis = [...suivis];

        // 1. Remove this hour slot from other models on this chain and date
        newSuivis = newSuivis.map(s => {
            if (s.chaineId === selectedChaineId && s.date === dateStr) {
                const updatedSorties = { ...s.sorties };
                delete updatedSorties[hourKey];
                
                const updatedDowntimes = { ...s.downtimes };
                delete updatedDowntimes[hourKey];

                const updatedDefauts = s.defauts?.filter(d => d.hour !== hourKey) || [];

                const totalHeure = Object.values(updatedSorties).reduce((acc: number, v) => acc + (typeof v === 'number' ? v : 0), 0);
                return { ...s, sorties: updatedSorties, downtimes: updatedDowntimes, defauts: updatedDefauts, totalHeure };
            }
            return s;
        });

        // 2. Get or initialize entry — on identifie l'OF par planningId.
        let targetEntry = newSuivis.find(s => s.chaineId === selectedChaineId && s.date === dateStr && entryOFKey(s) === mInfo.id);

        if (!targetEntry) {
            targetEntry = {
                id: `sv_${selectedChaineId}_${mInfo.modelId}_${dateStr}_${Date.now()}`,
                planningId: mInfo.planningId,
                modelId: mInfo.modelId,
                chaineId: selectedChaineId,
                date: dateStr,
                entrer: 0,
                sorties: {},
                totalHeure: 0,
                pJournaliere: 0,
                enCour: 0,
                resteEntrer: 0,
                resteSortie: 0,
                chaf: 1,
                recta: 15,
                sujet: 6,
                transp: 1,
                man: 2,
                sp: 0,
                stager: 0,
                totalWorkers: 0,
                downtimes: {},
                defauts: [],
                source: 'PLANNING',
            };
            newSuivis.push(targetEntry);
        }

        // 3. Set sorties values
        const updatedSorties = { ...targetEntry.sorties };
        const updatedDowntimes = { ...targetEntry.downtimes };
        let updatedDefauts = targetEntry.defauts?.filter(d => d.hour !== hourKey) || [];

        if (downtime) {
            updatedSorties[hourKey] = 0;
            updatedDowntimes[hourKey] = downtime;
        } else {
            updatedSorties[hourKey] = quantity;
            delete updatedDowntimes[hourKey];
            
            // Add defects if any
            if (defectsQty > 0) {
                updatedDefauts.push({
                    id: `df_${hourKey}_${Date.now()}`,
                    hour: hourKey,
                    type: defectType || 'Couture',
                    quantity: defectsQty,
                    notes: '',
                });
            }
        }

        const totalHeure = Object.values(updatedSorties).reduce((acc: number, v) => acc + (typeof v === 'number' ? v : 0), 0);
        const totalWorkers = targetEntry.totalWorkers !== undefined ? targetEntry.totalWorkers : ((targetEntry.chaf || 0) + (targetEntry.recta || 0) + (targetEntry.sujet || 0) + (targetEntry.transp || 0) + (targetEntry.man || 0) + (targetEntry.sp || 0) + (targetEntry.stager || 0) || 25);

        newSuivis = newSuivis.map(s => {
            if (s.id === targetEntry!.id) {
                return { 
                    ...s, 
                    sorties: updatedSorties, 
                    downtimes: updatedDowntimes, 
                    defauts: updatedDefauts,
                    totalHeure,
                    totalWorkers
                };
            }
            return s;
        });

        setSuivis(newSuivis);
        handleSave(newSuivis);
    };

    // Save inline workers allocation
    const handleSaveWorkers = (dateStr: string, workerFields: Partial<SuiviData>) => {
        let newSuivis = [...suivis];
        const dayEntries = newSuivis.filter(s => s.chaineId === selectedChaineId && s.date === dateStr);
        
        const existing = dayEntries[0] || {
            totalWorkers: 0,
            chaf: 0, recta: 0, sujet: 0, transp: 0, man: 0, sp: 0, stager: 0
        };

        const totalWorkers = workerFields.totalWorkers !== undefined 
            ? workerFields.totalWorkers 
            : (existing.totalWorkers !== undefined ? existing.totalWorkers : 25);

        if (dayEntries.length === 0) {
            const mInfo = activeModels[0];
            if (!mInfo) return;
            const newEntry: SuiviData = {
                id: `sv_${selectedChaineId}_${mInfo.modelId}_${dateStr}_${Date.now()}`,
                planningId: mInfo.planningId,
                modelId: mInfo.modelId,
                chaineId: selectedChaineId,
                date: dateStr,
                entrer: 0,
                sorties: {},
                totalHeure: 0,
                pJournaliere: 0,
                enCour: 0,
                resteEntrer: 0,
                resteSortie: 0,
                totalWorkers,
                chaf: existing.chaf || 0,
                recta: existing.recta || 0,
                sujet: existing.sujet || 0,
                transp: existing.transp || 0,
                man: existing.man || 0,
                sp: existing.sp || 0,
                stager: existing.stager || 0,
                source: 'PLANNING',
            };
            newSuivis.push(newEntry);
        } else {
            newSuivis = newSuivis.map(s => {
                if (s.chaineId === selectedChaineId && s.date === dateStr) {
                    return {
                        ...s,
                        totalWorkers,
                    };
                }
                return s;
            });
        }

        setSuivis(newSuivis);
        handleSave(newSuivis);
    };

    // Sizing & WIP edits — ofId = clé OF (activeModel.id)
    const handleSaveSizes = (ofId: string, sizeKey: string, type: 'entree' | 'sortie', val: number) => {
        let newSuivis = [...suivis];
        const weekDates = weekDays.map(d => d.dateStr);
        const latestDate = weekDates[weekDates.length - 1];
        const mInfo = activeModels.find(x => x.id === ofId) || activeModels[0];
        if (!mInfo) return;

        let entry = newSuivis.find(s => s.chaineId === selectedChaineId && entryOFKey(s) === ofId);
        if (!entry) {
            entry = {
                id: `sv_${selectedChaineId}_${mInfo.modelId}_${latestDate}_${Date.now()}`,
                planningId: mInfo.planningId,
                modelId: mInfo.modelId,
                chaineId: selectedChaineId,
                date: latestDate,
                entrer: 0,
                sorties: {},
                totalHeure: 0,
                pJournaliere: 0,
                enCour: 0,
                resteEntrer: 0,
                resteSortie: 0,
                totalWorkers: 0,
                source: 'PLANNING',
            };
            newSuivis.push(entry);
        }

        const sizeData: any = (entry as any).sizeData || {};
        if (!sizeData[sizeKey]) {
            sizeData[sizeKey] = { entree: 0, sortie: 0 };
        }
        
        sizeData[sizeKey][type] = val;
        
        const totalEntree = Object.values(sizeData).reduce((acc: number, item: any) => acc + (item.entree || 0), 0);

        newSuivis = newSuivis.map(s => {
            if (s.id === entry!.id) {
                return {
                    ...s,
                    entrer: totalEntree,
                    sizeData,
                } as any;
            }
            return s;
        });

        setSuivis(newSuivis);
        handleSave(newSuivis);
    };

    // Calculations for Daily Rows
    const getDailyMetrics = (dateStr: string) => {
        const dayEntries = suivis.filter(s => s.chaineId === selectedChaineId && s.date === dateStr);
        const totalPiece = dayEntries.reduce((acc, s) => acc + (s.totalHeure || 0), 0);
        const totalDefects = dayEntries.reduce((acc, s) => acc + (s.defauts?.reduce((a, d) => a + d.quantity, 0) || 0), 0);

        const firstEntry = dayEntries[0] || {
            chaf: 0, recta: 0, sujet: 0, transp: 0, man: 0, sp: 0, stager: 0, totalWorkers: 0
        };
        // L'effectif est saisi UNIQUEMENT dans la page Effectifs (source de vérité).
        // Suivi le lit avec la MÊME logique de rattachement chaîne que la page Effectifs :
        // (plan.chaineId || s.chaineId) === chaîne sélectionnée — sinon une saisie liée à
        // l'OF (planningId) ne serait pas retrouvée. On prend le plus grand totalWorkers.
        const effectifEntries = suivis.filter(s => {
            if (s.date !== dateStr) return false;
            const plan = planningEvents.find(p => p.id === s.planningId);
            return (plan?.chaineId || s.chaineId) === selectedChaineId;
        });
        const totalM = effectifEntries.reduce((max, s) => {
            const w = typeof s.totalWorkers === 'number' ? s.totalWorkers : 0;
            return w > max ? w : max;
        }, 0);

        let totalActiveMinutes = 0;
        let downtimeMinutes = 0;
        
        hourBlocks.forEach(h => {
            const cellMeta = getCellMeta(dateStr, h.key);
            if (cellMeta) {
                totalActiveMinutes += h.duration;
                if (cellMeta.downtime) {
                    const dtCode = cellMeta.downtime;
                    if (dtCode === 'L') downtimeMinutes += 60;
                    else if (dtCode === 'P') downtimeMinutes += 15;
                    else if (dtCode === 'M') downtimeMinutes += 30;
                    else if (dtCode === 'S') downtimeMinutes += 45;
                }
            } else {
                if (dayEntries.length > 0) totalActiveMinutes += h.duration;
            }
        });

        const activeMinutes = Math.max(0, totalActiveMinutes - downtimeMinutes);
        const totalHeur = (activeMinutes / 60);

        const yields: { modelName: string; efficiency: number; style: any }[] = [];
        
        dayEntries.forEach(s => {
            const mInfo = activeModels.find(x => x.id === entryOFKey(s));
            if (!mInfo) return;

            let modelMinutes = 0;
            let modelDowntime = 0;
            hourBlocks.forEach(h => {
                const val = s.sorties?.[h.key];
                if (val !== undefined && val !== null) {
                    modelMinutes += h.duration;
                    const dt = s.downtimes?.[h.key];
                    if (dt === 'L') modelDowntime += 60;
                    else if (dt === 'P') modelDowntime += 15;
                    else if (dt === 'M') modelDowntime += 30;
                    else if (dt === 'S') modelDowntime += 45;
                }
            });

            const modelActiveMins = Math.max(0, modelMinutes - modelDowntime);
            if (modelActiveMins > 0 && totalM > 0 && s.totalHeure > 0) {
                const earnedMinutes = s.totalHeure * mInfo.sam;
                const presenceMinutes = totalM * modelActiveMins;
                const eff = Math.round((earnedMinutes / presenceMinutes) * 100);
                yields.push({
                    modelName: mInfo.reference,
                    efficiency: eff,
                    style: mInfo.style,
                });
            }
        });

        let rTotalDay = 0;
        if (totalM > 0 && activeMinutes > 0 && totalPiece > 0) {
            let totalEarnedMinutes = 0;
            dayEntries.forEach(s => {
                const mInfo = activeModels.find(x => x.id === entryOFKey(s));
                if (mInfo) {
                    totalEarnedMinutes += (s.totalHeure || 0) * mInfo.sam;
                }
            });
            const totalPresenceMinutes = totalM * activeMinutes;
            rTotalDay = Math.round((totalEarnedMinutes / totalPresenceMinutes) * 100);
        }

        // Advanced OEE/TRS calculation values
        const availability = totalActiveMinutes > 0 ? Math.round((activeMinutes / totalActiveMinutes) * 100) : 100;
        const quality = totalPiece > 0 ? Math.round(((totalPiece - totalDefects) / totalPiece) * 100) : 100;
        const oee = Math.round((availability * rTotalDay * quality) / 10000);

        return {
            totalPiece,
            totalDefects,
            totalHeur: totalHeur.toFixed(2),
            firstEntry,
            totalM,
            yields,
            rTotalDay,
            availability,
            quality,
            oee,
            totalActiveMinutes,
            activeMinutes,
        };
    };

    // Selected Active Model Memo
    const activeModel = useMemo(() => {
        return activeModels.find(m => m.id === selectedActiveModelId) || activeModels[0];
    }, [activeModels, selectedActiveModelId]);

    // Sizing & WIP calculations
    const sizingData = useMemo(() => {
        const defaultSizes = ['S', 'M', 'L', 'XL'];
        if (!selectedActiveModelId) return [];

        const chainSuivis = suivis.filter(s => s.chaineId === selectedChaineId && entryOFKey(s) === selectedActiveModelId);
        const sizeMap: Record<string, { entree: number; sortie: number }> = {};
        defaultSizes.forEach(s => { sizeMap[s] = { entree: 0, sortie: 0 }; });

        chainSuivis.forEach(s => {
            const customData = (s as any).sizeData;
            if (customData) {
                Object.keys(customData).forEach(sz => {
                    if (!sizeMap[sz]) sizeMap[sz] = { entree: 0, sortie: 0 };
                    sizeMap[sz].entree += customData[sz].entree || 0;
                    sizeMap[sz].sortie += customData[sz].sortie || 0;
                });
            }
        });

        return Object.entries(sizeMap).map(([size, vals]) => {
            const encours = vals.entree - vals.sortie;
            return {
                size,
                entree: vals.entree,
                sortie: vals.sortie,
                encours,
                isBottleneck: encours > 50,
            };
        });
    }, [selectedActiveModelId, selectedChaineId, suivis, entryOFKey]);

    // Skill Matching Verification
    const skillCheckResults = useMemo(() => {
        if (!activeModel) return { status: 'OK', errors: [] };

        const requiredMachines = activeModel.gamme.map(o => o.machineName || '').filter(Boolean);
        const chainWorkers = settings.chainStaff?.[selectedChaineId] || [];
        const workerSpecialties = chainWorkers.map(w => w.role || '').filter(Boolean);

        const missing: string[] = [];
        requiredMachines.forEach(machine => {
            const match = workerSpecialties.some(s => s.toLowerCase().includes(machine.toLowerCase()));
            if (!match && !missing.includes(machine)) {
                missing.push(machine);
            }
        });

        return {
            status: missing.length > 0 ? 'WARNING' : 'OK',
            errors: missing,
        };
    }, [activeModel, selectedChaineId, settings]);

    // Generate SVG Sparkline coordinates for hourly production
    const chartPathData = useMemo(() => {
        if (!selectedChartDate) return '';
        
        const outputs = hourBlocks.map(h => {
            const cell = getCellMeta(selectedChartDate, h.key);
            return cell?.value || 0;
        });

        const maxVal = Math.max(120, ...outputs);
        const width = 500;
        const height = 120;
        const padding = 15;
        
        const points = outputs.map((val, i) => {
            const x = padding + (i * (width - padding * 2)) / (outputs.length - 1);
            const y = height - padding - (val * (height - padding * 2)) / maxVal;
            return `${x},${y}`;
        });

        return points.length > 0 ? `M ${points.join(' L ')}` : '';
    }, [selectedChartDate, hourBlocks, suivis, getCellMeta]);

    const activeChartMetrics = useMemo(() => {
        return selectedChartDate ? getDailyMetrics(selectedChartDate) : null;
    }, [selectedChartDate, suivis]);

    // Weekly yield summary calculation
    const weeklyAverageYield = useMemo(() => {
        let sum = 0;
        let count = 0;
        weekDays.forEach(day => {
            const metrics = getDailyMetrics(day.dateStr);
            if (metrics.rTotalDay > 0) {
                sum += metrics.rTotalDay;
                count++;
            }
        });
        return count > 0 ? Math.round(sum / count) : 0;
    }, [weekDays, suivis]);

    // ═══════════════════════════════════════════════════════════
    // LOGISTICS MRP: Consumption Deviation Alerts (Alerte Surconsommation)
    // Écart = Sorties_réelles - (Quantité_produite × Consommation_unitaire_théorique)
    // ═══════════════════════════════════════════════════════════
    const consumptionAlerts = useMemo(() => {
        if (mvts.length === 0 || products.length === 0) return [];

        const alerts: {
            modelId: string;
            modelName: string;
            modelRef: string;
            materialName: string;
            totalReceived: number; // Will represent totalSorties
            consumed: number;      // Theoretical consumed
            remainingStock: number;// Material left on floor (totalSorties - consumed)
            remainingNeed: number; // Remaining need (max(0, am.remaining) * unitCons)
            ecart: number;         // Waste/gaspillage (totalSorties - consumed)
            severity: 'critical' | 'warning';
            unit: string;
            style: any;
        }[] = [];

        activeModels.forEach(am => {
            const model = models.find(m => m.id === am.modelId);
            if (!model?.ficheData?.materials?.length) return;

            model.ficheData.materials.forEach(mat => {
                const product = products.find(
                    p => (p.designation || '').toLowerCase().trim() === (mat.name || '').toLowerCase().trim() ||
                         (p.nom || '').toLowerCase().trim() === (mat.name || '').toLowerCase().trim()
                );
                if (!product) return;

                const modelSorties = mvts.filter(
                    m => m.type === 'sortie' &&
                         m.productId === product.id &&
                         (m.modeleRef === am.reference || m.chaineId === selectedChaineId)
                );
                const totalSorties = modelSorties.reduce((s, m) => s + m.quantite, 0);
                if (totalSorties === 0) return; // No sorties logged for this material yet

                const unitCons = mat.qty || 0;
                if (unitCons <= 0) return;

                // Theoretical consumption based on actual produced pieces
                const consumed = am.produced * unitCons;
                // What remains on the shop floor
                const remainingStock = Math.max(0, totalSorties - consumed);
                // What we still need to finish the order
                const remainingNeed = Math.max(0, am.remaining) * unitCons;
                // Ecart represents the overconsumption (actual sorties minus theoretical consumed so far)
                const ecart = totalSorties - consumed;

                let severity: 'critical' | 'warning' | null = null;
                // Overconsumption / gaspillage trigger:
                // If actual sorties exceed theoretical consumed so far by more than 20% -> critical (Red flash)
                // If actual sorties exceed theoretical consumed so far by more than 10% -> warning
                if (am.produced > 0) {
                    if (totalSorties > consumed * 1.20) {
                        severity = 'critical';
                    } else if (totalSorties > consumed * 1.10) {
                        severity = 'warning';
                    }
                }

                if (severity) {
                    alerts.push({
                        modelId: am.modelId,
                        modelName: am.name,
                        modelRef: am.reference,
                        materialName: mat.name,
                        totalReceived: totalSorties,
                        consumed: Math.round(consumed),
                        remainingStock: Math.round(remainingStock),
                        remainingNeed: Math.round(remainingNeed),
                        ecart: Math.round(ecart),
                        severity,
                        unit: mat.unit || 'u',
                        style: am.style,
                    });
                }
            });
        });

        return alerts;
    }, [activeModels, models, mvts, products, selectedChaineId]);

    return (
        <div className="flex flex-col h-full bg-[#fafbfe] overflow-hidden font-sans antialiased text-slate-800 dark:text-dk-text">
            
            {/* Top SaaS Header Bar */}
            <div className="bg-white dark:bg-dk-surface border-b border-slate-200 dark:border-dk-border/60 px-3 py-2.5 sm:px-6 sm:py-4 flex flex-wrap items-center justify-between gap-2 sm:gap-4 shrink-0 shadow-sm z-20">
                <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-indigo-600 dark:bg-indigo-700 flex items-center justify-center text-white shadow-sm shrink-0">
                        <Activity className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <div>
                        <h1 className="text-[15px] sm:text-lg font-black tracking-tight flex items-center gap-2">
                            {l.title} <span className="hidden sm:inline text-xs bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/50 text-indigo-700 dark:text-indigo-300 dark:text-indigo-200 px-2 py-0.5 rounded-lg font-bold">{tx(lang, { fr: 'Grille Directe', ar: 'الجدول المباشر', en: 'Live Grid', es: 'Tabla directa', pt: 'Grelha direta', tr: 'Canlı tablo' })}</span>
                        </h1>
                        <p className="hidden sm:block text-xs text-slate-400 dark:text-dk-muted font-medium">{l.subtitle}</p>
                    </div>
                </div>

                {/* Filters Row */}
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-3">
                    
                    {activeModels.length > 0 ? (
                        <div className="relative flex items-center gap-2 bg-indigo-50 dark:bg-indigo-900/30/50 border border-indigo-100 dark:border-indigo-800/50 rounded-xl px-3 py-1.5 shadow-sm">
                            <span className="text-[10px] font-black text-indigo-700 dark:text-indigo-300 dark:text-indigo-200 uppercase tracking-widest">
                                {l.activeModel} :
                            </span>
                            {/* Color swatch — clic pour changer la couleur de l'OF */}
                            <button
                                type="button"
                                onClick={() => setColorPickerOpen(o => !o)}
                                title={tx(lang, { fr: 'Changer la couleur du modèle', ar: 'تغيير لون النموذج', en: 'Change model color', es: 'Cambiar color del modelo', pt: 'Alterar cor do modelo', tr: 'Model rengini değiştir' })}
                                className="w-4 h-4 rounded-md border shrink-0 shadow-sm transition-transform hover:scale-110"
                                style={{ backgroundColor: activeModel?.style.base, borderColor: activeModel?.style.border }}
                            />
                            {/* Custom dropdown avec vignette photo du modèle */}
                            <button
                                type="button"
                                onClick={() => { setModelDropdownOpen(o => !o); setColorPickerOpen(false); }}
                                className="flex items-center gap-2 bg-transparent text-xs font-black text-indigo-900 dark:text-indigo-200 outline-none cursor-pointer max-w-[260px]"
                            >
                                {activeModel?.image ? (
                                    <img src={activeModel.image} alt="" className="w-7 h-7 rounded-lg object-cover border border-indigo-100 dark:border-indigo-800/50 shrink-0" />
                                ) : (
                                    <span className="w-7 h-7 rounded-lg border border-indigo-100 dark:border-indigo-800/50 bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0 text-indigo-300 dark:text-indigo-200">
                                        <ImageIcon className="w-3.5 h-3.5" />
                                    </span>
                                )}
                                <span className="truncate">
                                    {activeModel?.reference}{activeModel?.ofTag ? ` · ${activeModel.ofTag}` : ''}
                                </span>
                                <ChevronRight className={`w-3.5 h-3.5 shrink-0 text-indigo-400 dark:text-indigo-300 dark:text-indigo-200 transition-transform ${modelDropdownOpen ? 'rotate-90' : ''}`} />
                            </button>

                            {/* Model dropdown popover */}
                            {modelDropdownOpen && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setModelDropdownOpen(false)} />
                                    <div className="absolute top-full left-0 mt-2 z-50 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-2xl shadow-xl p-1.5 w-72 max-h-80 overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
                                        {activeModels.map(m => {
                                            const ev = planningEvents.find(p => p.id === m.planningId);
                                            return (
                                                <div
                                                    key={m.id}
                                                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded-xl transition-colors ${
                                                        m.id === selectedActiveModelId ? 'bg-indigo-50 dark:bg-indigo-900/30 ring-1 ring-indigo-200 dark:ring-indigo-900/50' : 'hover:bg-slate-50 dark:bg-dk-bg'
                                                    }`}
                                                >
                                                    <div
                                                        onClick={() => { setSelectedActiveModelId(m.id); setModelDropdownOpen(false); }}
                                                        className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer"
                                                    >
                                                        {m.image ? (
                                                            <img src={m.image} alt="" className="w-9 h-9 rounded-lg object-cover border border-slate-100 dark:border-dk-border/60 shrink-0" />
                                                        ) : (
                                                            <span className="w-9 h-9 rounded-lg border border-slate-100 dark:border-dk-border/60 bg-slate-50 dark:bg-dk-bg flex items-center justify-center shrink-0 text-slate-300 dark:text-dk-muted">
                                                                <ImageIcon className="w-4 h-4" />
                                                            </span>
                                                        )}
                                                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: m.style.base }} />
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-xs font-black text-slate-800 dark:text-dk-text truncate">
                                                                {m.reference}{m.ofTag ? ` · ${m.ofTag}` : ''}
                                                            </p>
                                                            <p className="text-[10px] text-slate-400 dark:text-dk-muted font-bold truncate">{m.name}</p>
                                                        </div>
                                                    </div>
                                                    {ev && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setEditingStatusEvent(ev);
                                                            }}
                                                            className="p-1.5 rounded-lg text-slate-400 dark:text-dk-muted hover:text-slate-600 dark:text-dk-text-soft hover:bg-slate-100 dark:bg-dk-elevated/60 transition-colors"
                                                            title={tx(lang, { fr: 'Modifier le statut', ar: 'تعديل الحالة', en: 'Change status', es: 'Modificar estado', pt: 'Alterar estado', tr: 'Durumu değiştir' })}
                                                        >
                                                            <MoreVertical className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}

                            {/* Palette popover */}
                            {colorPickerOpen && activeModel && (
                                <div className="absolute top-full left-0 mt-2 z-50 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-2xl shadow-xl p-3 w-56 animate-in fade-in zoom-in-95 duration-150">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-dk-muted">
                                            {tx(lang, { fr: 'Couleur du modèle', ar: 'لون النموذج', en: 'Model color', es: 'Color del modelo', pt: 'Cor do modelo', tr: 'Model rengi' })}
                                        </span>
                                        <button onClick={() => setColorPickerOpen(false)} className="text-slate-300 dark:text-dk-muted hover:text-slate-500 dark:text-dk-muted">
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-6 gap-1.5">
                                        {OF_COLOR_CHOICES.map(c => (
                                            <button
                                                key={c}
                                                type="button"
                                                onClick={() => { setOfColorOverrides(prev => ({ ...prev, [activeModel.id]: c })); setColorPickerOpen(false); }}
                                                className={`w-6 h-6 rounded-lg border transition-transform hover:scale-110 ${activeModel.style.base === c.toLowerCase() ? 'ring-2 ring-offset-1 ring-indigo-500 dark:ring-indigo-800' : ''}`}
                                                style={{ backgroundColor: c, borderColor: c }}
                                                title={c}
                                            />
                                        ))}
                                    </div>
                                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100 dark:border-dk-border/60">
                                        <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 dark:text-dk-muted cursor-pointer">
                                            <input
                                                type="color"
                                                value={activeModel.style.base}
                                                onChange={(e) => setOfColorOverrides(prev => ({ ...prev, [activeModel.id]: e.target.value }))}
                                                className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0"
                                            />
                                            {tx(lang, { fr: 'Personnalisé', ar: 'مخصص', en: 'Custom', es: 'Personalizado', pt: 'Personalizado', tr: 'Özel' })}
                                        </label>
                                        {ofColorOverrides[activeModel.id] && (
                                            <button
                                                onClick={() => { setOfColorOverrides(prev => { const n = { ...prev }; delete n[activeModel.id]; return n; }); setColorPickerOpen(false); }}
                                                className="text-[10px] font-bold text-rose-500 dark:text-rose-300 hover:text-rose-700 dark:text-rose-300"
                                            >
                                                {tx(lang, { fr: 'Réinitialiser', ar: 'إعادة التعيين', en: 'Reset', es: 'Restablecer', pt: 'Repor', tr: 'Sıfırla' })}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 bg-slate-100 dark:bg-dk-elevated/60 border border-slate-200 dark:border-dk-border/60 rounded-xl px-3 py-1.5 shadow-sm select-none opacity-60">
                            <span className="w-7 h-7 rounded-lg border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg flex items-center justify-center shrink-0 text-slate-400 dark:text-dk-muted">
                                <ImageIcon className="w-3.5 h-3.5" />
                            </span>
                            <span className="text-xs font-bold text-slate-500 dark:text-dk-muted">
                                {tx(lang, { fr: 'Aucun modèle planifié', ar: 'لا يوجد أي نموذج مخطط', en: 'No planned model', es: 'Ningún modelo planificado', pt: 'Nenhum modelo planeado', tr: 'Planlanmış model yok' })}
                            </span>
                        </div>
                    )}

                    {/* Chain Picker */}
                    <div className="bg-slate-100 dark:bg-dk-elevated/60/80 p-0.5 rounded-xl border border-slate-200 dark:border-dk-border/50 flex gap-0.5 overflow-x-auto max-w-[280px] sm:max-w-[400px] md:max-w-md no-scrollbar">
                        {chainsList.map(cId => (
                            <button
                                key={cId}
                                onClick={() => setSelectedChaineId(cId)}
                                className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all shrink-0 ${
                                    selectedChaineId === cId
                                        ? 'bg-white dark:bg-dk-surface text-indigo-900 dark:text-indigo-200 shadow-sm border border-indigo-100 dark:border-indigo-800/50/50'
                                        : 'text-slate-500 dark:text-dk-muted hover:text-slate-900'
                                    }`}
                            >
                                {cId}
                            </button>
                        ))}
                    </div>

                    {/* Week Selector */}
                    <div className="flex items-center bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-1.5 sm:px-2.5 py-1 shadow-sm gap-1 sm:gap-2">
                        <button onClick={() => changeWeek(-1)} className="p-1 hover:bg-slate-50 dark:bg-dk-bg rounded-lg text-slate-500 dark:text-dk-muted hover:text-slate-900 transition-colors z-10">
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <DateTimePicker
                            value={globalDate || new Date().toISOString().split('T')[0]}
                            onChange={(iso) => {
                                if (setGlobalDate) {
                                    setGlobalDate(iso.split('T')[0]);
                                }
                            }}
                            mode="date"
                            settings={settings || DEFAULT_CALENDAR_APP_SETTINGS}
                            showIcon={false}
                            className="relative flex items-center justify-center min-w-0"
                            inputClassName="min-h-0 w-full border-0 bg-transparent text-center text-[11px] sm:text-xs font-bold text-slate-700 dark:text-dk-text shadow-none outline-none hover:bg-slate-50 dark:bg-dk-bg px-2 py-0.5 rounded-lg transition-colors cursor-pointer select-none"
                            displayValue={
                                <span className="text-[11px] sm:text-xs font-bold text-slate-700 dark:text-dk-text tabular-nums select-none">
                                    <span className="hidden sm:inline">{tx(lang, { fr: 'Semaine du', ar: 'أسبوع من', en: 'Week from', es: 'Semana del', pt: 'Semana de', tr: 'Hafta başlangıcı' })} </span>
                                    {weekDays[0]?.displayDate.substring(0, 5)} <span className="hidden sm:inline">{tx(lang, { fr: 'au', ar: 'إلى', en: 'to', es: 'al', pt: 'a', tr: 'ile' })} {weekDays[5]?.displayDate}</span><span className="sm:hidden">–{weekDays[5]?.displayDate.substring(0, 5)}</span>
                                </span>
                            }
                        />
                        <button onClick={() => changeWeek(1)} className="p-1 hover:bg-slate-50 dark:bg-dk-bg rounded-lg text-slate-500 dark:text-dk-muted hover:text-slate-900 transition-colors z-10">
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Compact Supervisor & Yield Badges when stats are collapsed */}
                    {!showStatsHeader && (
                        <div className="flex items-center gap-1.5">
                            {/* Supervisor Badge */}
                            {supervisors[selectedChaineId] && (
                                <div className="flex items-center gap-1 bg-slate-100 dark:bg-dk-elevated/60 border border-slate-200 dark:border-dk-border rounded-xl px-2.5 py-1.5 shadow-sm text-xs font-bold text-slate-600 dark:text-dk-text-soft">
                                    <User className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-300 dark:text-indigo-200" />
                                    <span>{supervisors[selectedChaineId]}</span>
                                </div>
                            )}
                            {/* Yield Badge */}
                            {weeklyAverageYield > 0 && (
                                <div className={`flex items-center gap-1 border rounded-xl px-2.5 py-1.5 shadow-sm text-xs font-bold ${
                                    weeklyAverageYield >= 90 
                                        ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-100 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-300' 
                                        : weeklyAverageYield >= 80 
                                            ? 'bg-orange-50 dark:bg-orange-900/30 border-orange-100 text-orange-700 dark:text-orange-300' 
                                            : 'bg-rose-50 dark:bg-rose-900/30 border-rose-100 dark:border-rose-800/50 text-rose-700 dark:text-rose-300'
                                }`}>
                                    <Activity className="w-3.5 h-3.5" />
                                    <span>{weeklyAverageYield}%</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Toggle Jour / Semaine (mobile uniquement) */}
                    {isMobile && (
                        <button
                            onClick={() => setMobileWeekView(v => !v)}
                            title={mobileWeekView ? tx(lang, { fr: 'Vue jour', ar: 'عرض اليوم', en: 'Day view', es: 'Vista día', pt: 'Vista dia', tr: 'Gün görünümü' }) : tx(lang, { fr: 'Vue semaine', ar: 'عرض الأسبوع', en: 'Week view', es: 'Vista semana', pt: 'Vista semana', tr: 'Hafta görünümü' })}
                            className={`flex items-center gap-1.5 px-2 py-1.5 border rounded-xl text-xs font-bold transition-all shadow-sm ${
                                mobileWeekView
                                    ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800 ring-2 ring-indigo-500 dark:ring-indigo-800/10'
                                    : 'bg-white dark:bg-dk-surface text-slate-500 dark:text-dk-muted border-slate-200 dark:border-dk-border hover:bg-slate-50 dark:bg-dk-bg'
                            }`}
                        >
                            {mobileWeekView ? <CalendarDays className="w-4 h-4 text-indigo-600 dark:text-indigo-300 dark:text-indigo-200" /> : <CalendarRange className="w-4 h-4 text-indigo-600 dark:text-indigo-300 dark:text-indigo-200" />}
                            <span>{mobileWeekView ? tx(lang, { fr: 'Jour', ar: 'يوم', en: 'Day', es: 'Día', pt: 'Dia', tr: 'Gün' }) : tx(lang, { fr: 'Semaine', ar: 'أسبوع', en: 'Week', es: 'Semana', pt: 'Semana', tr: 'Hafta' })}</span>
                        </button>
                    )}

                    {/* Stats Toggle Button */}
                    <button
                        onClick={() => setShowStatsHeader(!showStatsHeader)}
                        title={tx(lang, { fr: 'Stats', ar: 'المؤشرات', en: 'Stats', es: 'Estadísticas', pt: 'Estatísticas', tr: 'İstatistikler' })}
                        className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 border rounded-xl text-xs font-bold transition-all shadow-sm ${
                            showStatsHeader
                                ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800 ring-2 ring-indigo-500 dark:ring-indigo-800/10'
                                : 'bg-white dark:bg-dk-surface text-slate-500 dark:text-dk-muted border-slate-200 dark:border-dk-border hover:bg-slate-50 dark:bg-dk-bg'
                        }`}
                    >
                        <BarChart2 className="w-4 h-4 text-indigo-600 dark:text-indigo-300 dark:text-indigo-200" />
                        <span className="hidden sm:inline">{tx(lang, { fr: 'Stats', ar: 'المؤشرات', en: 'Stats', es: 'Estadísticas', pt: 'Estatísticas', tr: 'İstatistikler' })}</span>
                    </button>

                    {/* Save State Indicator */}
                    {saveStatus === 'saving' && <span className="text-xs text-indigo-600 dark:text-indigo-300 dark:text-indigo-200 font-semibold animate-pulse">{l.saving}</span>}
                    {saveStatus === 'saved' && <span className="text-xs text-emerald-600 dark:text-emerald-300 font-semibold flex items-center gap-1"><CheckCircle className="w-4 h-4" /> {l.saved}</span>}
                    {saveStatus === 'error' && <span className="text-xs text-rose-600 dark:text-rose-300 font-semibold">{l.error}</span>}
                </div>
            </div>

            {/* Scrollable Container */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-6">

                {/* Upper Cards: Supervisor & Active Models & Yield Summary */}
                {showStatsHeader && (
                    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                        
                        {/* Supervisor Card */}
                        <div className="bg-white dark:bg-dk-surface border border-slate-100 dark:border-dk-border/60 rounded-3xl p-5 shadow-sm flex flex-col justify-between relative overflow-hidden group">
                            <div className="absolute right-0 top-0 w-24 h-24 bg-gradient-to-bl from-indigo-500/5 to-transparent rounded-full blur-xl pointer-events-none"></div>
                            <div className="flex items-center justify-between">
                                <div className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-dk-muted flex items-center gap-1.5">
                                    <User className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-300 dark:text-indigo-200" /> 
                                    <span>{l.supervisor}</span>
                                </div>
                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-50 dark:bg-emerald-900/300 animate-pulse"></span>
                            </div>
                            <div className="mt-4">
                                <input
                                    type="text"
                                    value={supervisors[selectedChaineId] || ''}
                                    onChange={(e) => setSupervisors({ ...supervisors, [selectedChaineId]: e.target.value.toUpperCase() })}
                                    className="text-2xl font-black text-slate-800 dark:text-dk-text uppercase tracking-tight bg-slate-50 dark:bg-dk-bg border border-slate-100 dark:border-dk-border/60 hover:border-slate-200 dark:border-dk-border focus:border-indigo-500 focus:bg-white dark:bg-dk-surface rounded-2xl px-4 py-2 w-full transition-all outline-none"
                                    placeholder={tx(lang, { fr: 'Entrer responsable', ar: 'إدخال مسؤول الخط', en: 'Enter supervisor', es: 'Introducir responsable', pt: 'Inserir responsável', tr: 'Sorumlu girin' })}
                                />
                            </div>
                            <p className="text-[10px] text-slate-400 dark:text-dk-muted font-medium mt-3">{tx(lang, { fr: "Chef d'équipe affecté pour le contrôle hebdomadaire", ar: 'مسؤول الفريق المكلف بالمراقبة الأسبوعية', en: 'Team lead assigned for weekly control', es: 'Jefe de equipo asignado al control semanal', pt: 'Chefe de equipa atribuído ao controlo semanal', tr: 'Haftalık kontrol için atanmış ekip lideri' })}</p>
                        </div>

                        {/* Active Models List Strip */}
                        <div className="xl:col-span-2 bg-white dark:bg-dk-surface border border-slate-100 dark:border-dk-border/60 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
                            <div className="flex items-center justify-between border-b border-slate-50 dark:border-dk-border/40 pb-2">
                                <span className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-dk-muted flex items-center gap-1.5">
                                    <span>{l.activeModels}</span>
                                </span>
                                <span className="text-[10px] bg-slate-100 dark:bg-dk-elevated/60 text-slate-600 dark:text-dk-text-soft px-2.5 py-0.5 rounded-full font-bold">{tx(lang, { fr: 'Semaine en cours', ar: 'الأسبوع الجاري', en: 'Current week', es: 'Semana actual', pt: 'Semana atual', tr: 'Geçerli hafta' })}</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 flex-1 overflow-y-auto max-h-28 pr-1 no-scrollbar">
                                {activeModels.map(m => (
                                    <div key={m.id} className="rounded-2xl border border-slate-100 dark:border-dk-border/60 p-3 bg-slate-50 dark:bg-dk-bg/50 flex items-center justify-between hover:border-slate-200 dark:border-dk-border transition-colors">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <span className="w-3.5 h-3.5 rounded-lg shrink-0 border" style={{ backgroundColor: m.style.bg, borderColor: m.style.border }} />
                                            <div className="min-w-0">
                                                <p className="text-xs font-black text-slate-800 dark:text-dk-text truncate" title={m.name}>{m.name}</p>
                                                <p className="text-[10px] text-slate-400 dark:text-dk-muted font-bold truncate">Réf: {m.reference} · SAM: {m.sam} min</p>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-xs font-black text-indigo-600 dark:text-indigo-300 dark:text-indigo-200 tabular-nums">{m.produced} / {m.target} pcs</p>
                                            <p className="text-[9px] font-bold text-slate-400 dark:text-dk-muted">Reste per H: {m.restPerHour}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Weekly Performance Yield Summary */}
                        <div className="bg-white dark:bg-dk-surface border border-slate-100 dark:border-dk-border/60 rounded-3xl p-5 shadow-sm flex flex-col justify-between relative overflow-hidden">
                            <div className="absolute right-0 top-0 w-32 h-32 bg-gradient-to-bl from-indigo-500/10 to-transparent rounded-full blur-2xl pointer-events-none"></div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-dk-muted flex items-center gap-1.5">
                                    <span>{l.yieldAvg}</span>
                                </span>
                                <Info className="w-4 h-4 text-slate-300 dark:text-dk-muted" />
                            </div>
                            <div className="mt-2 flex items-baseline gap-2">
                                <span className={`text-4xl font-black tracking-tight ${
                                    weeklyAverageYield >= 90 ? 'text-emerald-600 dark:text-emerald-300' : weeklyAverageYield >= 80 ? 'text-orange-500 dark:text-orange-300' : 'text-rose-600 dark:text-rose-300'
                                }`}>
                                    {weeklyAverageYield > 0 ? `${weeklyAverageYield}%` : '—'}
                                </span>
                                <span className="text-xs font-bold text-slate-400 dark:text-dk-muted">{tx(lang, { fr: "d'efficience", ar: 'من الكفاءة', en: 'efficiency', es: 'de eficiencia', pt: 'de eficiência', tr: 'verimlilik' })}</span>
                            </div>
                            <div className="mt-3">
                                <div className="w-full bg-slate-100 dark:bg-dk-elevated/60 h-2 rounded-full overflow-hidden">
                                    <div 
                                        className={`h-full rounded-full transition-all duration-1000 ${
                                            weeklyAverageYield >= 90 ? 'bg-emerald-50 dark:bg-emerald-900/300' : weeklyAverageYield >= 80 ? 'bg-orange-50 dark:bg-orange-900/300' : 'bg-rose-50 dark:bg-rose-900/300'
                                        }`}
                                        style={{ width: `${Math.min(100, weeklyAverageYield)}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Primary Weekly Grid Table */}
                <div className="bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border/60 rounded-2xl shadow-sm overflow-hidden z-10 relative">
                    {/* ─── Tableau hebdomadaire complet (desktop, ou mobile si vue semaine) ─── */}
                    {(!isMobile || mobileWeekView) && (
                    <div className="overflow-x-auto scrollbar-thin">
                        <table className="w-full text-left border-collapse min-w-[1300px] sm:min-w-[1700px]">
                            <thead>
                                <tr className="border-b border-slate-100 dark:border-dk-border/60 bg-slate-50 dark:bg-dk-bg/50">
                                    <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-dk-muted w-28 sticky left-0 bg-slate-50 dark:bg-dk-bg z-20 border-r border-slate-100 dark:border-dk-border/60/50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">{l.date}</th>
                                    <th className="py-4 px-4 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-dk-muted w-24 sticky left-[112px] bg-slate-50 dark:bg-dk-bg z-20 border-r border-slate-100 dark:border-dk-border/60/50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">{l.day}</th>
                                    
                                    {/* Hour Headers (Dynamic Shift hours) */}
                                    {hourBlocks.map(h => (
                                        <th key={h.key} className="py-4 px-2 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-dk-muted text-center w-28 border-r border-slate-100 dark:border-dk-border/60/50">
                                            {h.label}
                                        </th>
                                    ))}
                                    <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-dk-muted text-center w-24">{l.pJournaliere}</th>
                                    <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-dk-muted text-center w-20">{l.totalHours}</th>
                                    
                                    <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-indigo-500 dark:text-indigo-300 dark:text-indigo-200/80 text-center w-24 border-l border-slate-100 dark:border-dk-border/60">
                                        {l.effectif}
                                    </th>
 
                                    <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-dk-muted text-center w-32 border-l border-slate-100 dark:border-dk-border/60">{tx(lang, { fr: 'R1 / R2 %', ar: 'مردودية R1 / R2 %', en: 'R1 / R2 %', es: 'R1 / R2 %', pt: 'R1 / R2 %', tr: 'R1 / R2 %' })}</th>
                                    <th className="py-4 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-dk-muted text-center w-28">{l.yieldDay}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {weekDays.map(day => {
                                    const metrics = getDailyMetrics(day.dateStr);
 
                                    return (
                                        <tr key={day.dateStr} className={`hover:bg-slate-50 dark:bg-dk-bg/30 transition-colors ${selectedChartDate === day.dateStr ? 'bg-indigo-50 dark:bg-indigo-900/30/20' : ''}`}>
                                            {/* Date */}
                                            <td className={`py-4 px-4 font-mono text-xs text-slate-500 dark:text-dk-muted font-bold sticky left-0 z-10 border-r border-slate-100 dark:border-dk-border/60 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] ${selectedChartDate === day.dateStr ? 'bg-[#f4f6fe]' : 'bg-white dark:bg-dk-surface'}`}>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => selectChartDate(day.dateStr)}
                                                        className={`w-3 h-3 rounded-full border ${selectedChartDate === day.dateStr ? 'bg-indigo-600 dark:bg-indigo-700 border-indigo-600 dark:border-indigo-800' : 'border-slate-300 dark:border-dk-border'}`}
                                                        title="Sélectionner pour le graphique"
                                                    />
                                                    {day.displayDate}
                                                </div>
                                            </td>
                                            
                                            {/* Day Name */}
                                            <td className={`py-4 px-4 font-black text-xs text-slate-800 dark:text-dk-text sticky left-[112px] z-10 border-r border-slate-100 dark:border-dk-border/60 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] ${selectedChartDate === day.dateStr ? 'bg-[#f4f6fe]' : 'bg-white dark:bg-dk-surface'}`}>
                                                {day.label}
                                            </td>

                                            {/* Shift hour cells */}
                                            {hourBlocks.map(h => {
                                                const cell = getCellMeta(day.dateStr, h.key);
                                                const cellStyle = (() => {
                                                    if (cell?.downtime) {
                                                        const dt = cell.downtime;
                                                        if (dt === 'L') return { backgroundColor: '#f1f5f9', color: '#475569', borderColor: '#cbd5e1' };
                                                        if (dt === 'P') return { backgroundColor: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' };
                                                        if (dt === 'M') return { backgroundColor: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca', fontWeight: 'bold' };
                                                        if (dt === 'S') return { backgroundColor: '#fffbeb', color: '#b45309', borderColor: '#fde68a', fontWeight: 'bold' };
                                                    }
                                                    if (cell?.model) {
                                                        return { backgroundColor: cell.model.style.bg, color: cell.model.style.text, borderColor: cell.model.style.border };
                                                    }
                                                    return null;
                                                })();

                                                const hourBlockLimit = parseInt(h.label.split('/')[1]?.split(':')[0] || '18');
                                                const isFutureHour = new Date(day.dateStr).setHours(hourBlockLimit) > Date.now();
                                                const isCellLocked = isFutureHour && !isOverrideMode;
                                                const ofId = selectedActiveModelId;
                                                const displayValue = cell?.downtime || (cell?.value !== undefined && cell?.value !== null && cell.value !== 0 ? cell.value : '');

                                                return (
                                                    <td key={h.key} className="p-1 border-r border-slate-100 dark:border-dk-border/60 text-center relative w-28 group">
                                                        <input
                                                            type="text"
                                                            inputMode="numeric"
                                                            disabled={isCellLocked || !ofId}
                                                            value={displayValue}
                                                            onDoubleClick={() => !isCellLocked && ofId && handleOpenCellModal(day.dateStr, h.key, h.label)}
                                                            onChange={(e) => {
                                                                if (!ofId) return;
                                                                const valStr = e.target.value.trim().toUpperCase();
                                                                if (['L', 'P', 'M', 'S'].includes(valStr)) {
                                                                    handleSaveCell(day.dateStr, h.key, 0, ofId, valStr, 0, 'Couture');
                                                                } else {
                                                                    const parsedVal = valStr === '' ? 0 : parseInt(valStr) || 0;
                                                                    handleSaveCell(day.dateStr, h.key, parsedVal, ofId, null, 0, 'Couture');
                                                                }
                                                            }}
                                                            style={cellStyle ? { backgroundColor: cellStyle.backgroundColor, color: cellStyle.color, borderColor: cellStyle.borderColor } : {}}
                                                            className={`w-full h-10 text-center text-xs font-black outline-none border transition-all rounded-lg ${
                                                                cellStyle 
                                                                    ? 'shadow-sm font-bold border-transparent' 
                                                                    : (isCellLocked || !ofId)
                                                                        ? 'bg-slate-50 dark:bg-dk-bg/50 border-slate-100 dark:border-dk-border/60 text-slate-300 dark:text-dk-muted' 
                                                                        : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border hover:border-indigo-400 focus:border-indigo-600 dark:border-indigo-800 focus:ring-1 focus:ring-indigo-600'
                                                            } ${cell?.downtime === 'M' ? 'animate-pulse' : ''}`}
                                                            placeholder="—"
                                                            title={!isCellLocked ? l.doubleClick : undefined}
                                                        />
                                                        {cell?.defectsQty !== undefined && cell.defectsQty > 0 && (
                                                            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-rose-50 dark:bg-rose-900/300 animate-ping" title={`Défauts: ${cell.defectsQty}`} />
                                                        )}
                                                    </td>
                                                );
                                            })}

                                            {/* P. Journaliere */}
                                            <td className="py-4 px-3 text-center font-black text-slate-800 dark:text-dk-text tabular-nums">
                                                {metrics.totalPiece}
                                                {metrics.totalDefects > 0 && (
                                                    <span className="block text-[9px] text-rose-500 dark:text-rose-300 font-bold">Def: {metrics.totalDefects}</span>
                                                )}
                                            </td>

                                            {/* Total Heure */}
                                            <td className="py-4 px-3 text-center font-mono text-xs text-slate-500 dark:text-dk-muted font-bold tabular-nums">{metrics.totalHeur}</td>

                                            {/* Effectif (lecture seule — saisi dans la page Effectifs) */}
                                            <td className="p-1 text-center border-l border-slate-100 dark:border-dk-border/60 w-24">
                                                <div
                                                    className="w-full text-center font-black text-xs bg-slate-50 dark:bg-dk-bg border border-slate-100 dark:border-dk-border/60 rounded-lg py-1.5 tabular-nums text-slate-700 dark:text-dk-text"
                                                    title={tx(lang, { fr: 'Saisir dans la page Effectifs', ar: 'يتم إدخاله في صفحة Effectifs', en: 'Enter on the Effectifs page', es: 'Introducir en la página Effectifs', pt: 'Inserir na página Effectifs', tr: 'Effectifs sayfasında girilir' })}
                                                >
                                                    {metrics.totalM || 0}
                                                </div>
                                            </td>

                                            {/* R1 / R2 % */}
                                            <td className="py-4 px-3 text-center border-l border-slate-100 dark:border-dk-border/60">
                                                {metrics.yields.length === 0 ? (
                                                    <span className="text-slate-300 dark:text-dk-muted font-bold">—</span>
                                                ) : (
                                                    <div className="flex flex-col gap-1 items-center justify-center">
                                                        {metrics.yields.map((y, idx) => (
                                                            <div key={idx} className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-lg border" style={{ backgroundColor: y.style.bg, color: y.style.text, borderColor: y.style.border }}>
                                                                <span>{y.modelName}</span>
                                                                <span>:</span>
                                                                <span className="tabular-nums">{y.efficiency}%</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>

                                            {/* R. TOTAL DAY */}
                                            <td className="py-4 px-3 text-center">
                                                {metrics.rTotalDay > 0 ? (
                                                    <span className={`px-4 py-1.5 rounded-2xl text-xs font-black shadow-sm ${
                                                        metrics.rTotalDay >= 90 
                                                            ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200/50' 
                                                            : metrics.rTotalDay >= 80 
                                                                ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 border border-orange-200/50' 
                                                                : 'bg-rose-100 dark:bg-rose-900/40 text-rose-800 border border-rose-200 dark:border-rose-800/50'
                                                    }`}>
                                                        {metrics.rTotalDay}%
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-300 dark:text-dk-muted font-bold">0%</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    )}

                    {/* ─── Mobile : vue jour unique (jour sélectionné, heures verticales) ─── */}
                    {isMobile && !mobileWeekView && (
                        <div className="p-3 space-y-3">
                            {/* Day pills */}
                            <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
                                {weekDays.map(day => {
                                    const isSel = selectedChartDate === day.dateStr;
                                    const dm = getDailyMetrics(day.dateStr);
                                    return (
                                        <button
                                            key={day.dateStr}
                                            type="button"
                                            onClick={() => selectChartDate(day.dateStr)}
                                            className={`shrink-0 flex flex-col items-center justify-center rounded-xl border px-3 py-1.5 transition-all ${
                                                isSel ? 'bg-indigo-600 dark:bg-indigo-700 text-white border-indigo-600 dark:border-indigo-800 shadow-sm' : 'bg-white dark:bg-dk-surface text-slate-600 dark:text-dk-text-soft border-slate-200 dark:border-dk-border hover:bg-slate-50 dark:bg-dk-bg'
                                            }`}
                                        >
                                            <span className="text-[11px] font-black leading-tight">{day.label.substring(0, 3)}</span>
                                            <span className={`text-[9px] font-bold tabular-nums ${isSel ? 'text-indigo-100 dark:text-indigo-200' : 'text-slate-400 dark:text-dk-muted'}`}>{day.displayDate.substring(0, 5)}</span>
                                            {dm.totalPiece > 0 && (
                                                <span className={`mt-0.5 text-[9px] font-black tabular-nums ${isSel ? 'text-white' : 'text-indigo-600 dark:text-indigo-300 dark:text-indigo-200'}`}>{dm.totalPiece}</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {selectedChartDate && (() => {
                                const dm = getDailyMetrics(selectedChartDate);
                                return (
                                    <>
                                        {/* Résumé jour compact */}
                                        <div className="grid grid-cols-4 gap-1.5">
                                            {[
                                                { lbl: l.pJournaliere, val: dm.totalPiece, accent: 'text-slate-800 dark:text-dk-text' },
                                                { lbl: l.totalHours, val: dm.totalHeur, accent: 'text-slate-800 dark:text-dk-text' },
                                                { lbl: l.effectif, val: dm.totalM, accent: 'text-slate-800 dark:text-dk-text' },
                                                { lbl: 'R.Day', val: dm.rTotalDay > 0 ? `${dm.rTotalDay}%` : '—', accent: dm.rTotalDay >= 90 ? 'text-emerald-600 dark:text-emerald-300' : dm.rTotalDay >= 80 ? 'text-orange-500 dark:text-orange-300' : 'text-rose-600 dark:text-rose-300' },
                                            ].map((c, i) => (
                                                <div key={i} className="bg-slate-50 dark:bg-dk-bg border border-slate-100 dark:border-dk-border/60 rounded-xl px-2 py-1.5 text-center">
                                                    <span className="block text-[8px] font-black uppercase tracking-wider text-slate-400 dark:text-dk-muted">{c.lbl}</span>
                                                    <span className={`block text-[13px] font-black tabular-nums ${c.accent}`}>{c.val}</span>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Liste verticale des heures */}
                                        <div className="space-y-1.5">
                                            {hourBlocks.map(h => {
                                                const cell = getCellMeta(selectedChartDate, h.key);
                                                const cellStyle = cell?.model ? { backgroundColor: cell.model.style.bg, color: cell.model.style.text, borderColor: cell.model.style.border } : null;
                                                const hourBlockLimit = parseInt(h.label.split('/')[1]?.split(':')[0] || '18');
                                                const isFutureHour = new Date(selectedChartDate).setHours(hourBlockLimit) > Date.now();
                                                const isCellLocked = isFutureHour && !isOverrideMode;
                                                const displayValue = cell?.downtime || (cell?.value !== undefined && cell?.value !== null && cell.value !== 0 ? cell.value : '');
                                                const ofId = selectedActiveModelId || activeModels[0]?.id;
                                                return (
                                                    <div key={h.key} className="flex items-center gap-2">
                                                        <span className="w-[88px] shrink-0 text-[11px] font-bold text-slate-500 dark:text-dk-muted tabular-nums">{h.label}</span>
                                                        <input
                                                            type="text"
                                                            inputMode="numeric"
                                                            disabled={isCellLocked || !ofId}
                                                            value={displayValue}
                                                            onDoubleClick={() => !isCellLocked && ofId && handleOpenCellModal(selectedChartDate, h.key, h.label)}
                                                            onChange={(e) => {
                                                                const valStr = e.target.value.trim().toUpperCase();
                                                                if (['L', 'P', 'M', 'S'].includes(valStr)) {
                                                                    handleSaveCell(selectedChartDate, h.key, 0, ofId, valStr, 0, 'Couture');
                                                                } else {
                                                                    const parsedVal = valStr === '' ? 0 : parseInt(valStr) || 0;
                                                                    handleSaveCell(selectedChartDate, h.key, parsedVal, ofId, null, 0, 'Couture');
                                                                }
                                                            }}
                                                            style={cellStyle ? { backgroundColor: cellStyle.backgroundColor, color: cellStyle.color, borderColor: cellStyle.borderColor } : {}}
                                                            className={`flex-1 h-9 text-center text-[13px] font-black outline-none border transition-all rounded-lg ${
                                                                cellStyle 
                                                                    ? 'shadow-sm border-transparent' 
                                                                    : (isCellLocked || !ofId)
                                                                        ? 'bg-slate-50 dark:bg-dk-bg/50 border-slate-100 dark:border-dk-border/60 text-slate-300 dark:text-dk-muted' 
                                                                        : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border focus:border-indigo-600 dark:border-indigo-800 focus:ring-1 focus:ring-indigo-600'
                                                            }`}
                                                            placeholder="—"
                                                        />
                                                        {cell?.defectsQty !== undefined && cell.defectsQty > 0 && (
                                                            <span className="w-1.5 h-1.5 rounded-full bg-rose-50 dark:bg-rose-900/300 shrink-0" title={`Défauts: ${cell.defectsQty}`} />
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => !isCellLocked && ofId && handleOpenCellModal(selectedChartDate, h.key, h.label)}
                                                            disabled={isCellLocked || !ofId}
                                                            className="w-8 h-9 shrink-0 flex items-center justify-center rounded-lg text-slate-400 dark:text-dk-muted hover:bg-slate-50 dark:bg-dk-bg disabled:opacity-30"
                                                            title={tx(lang, { fr: 'Détails', ar: 'التفاصيل', en: 'Details', es: 'Detalles', pt: 'Detalhes', tr: 'Ayrıntılar' })}
                                                        >
                                                            <Sliders className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    )}

                    {/* ═══ Ligne TOTAL : production par modèle (OF) + total général ═══ */}
                    <div className="border-t border-slate-100 dark:border-dk-border/60 bg-slate-50 dark:bg-dk-bg/60 px-4 py-3 flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-dk-muted mr-1">
                            {tx(lang, { fr: 'Total production', ar: 'إجمالي الإنتاج', en: 'Total production', es: 'Producción total', pt: 'Produção total', tr: 'Toplam üretim' })} :
                        </span>
                        {activeModels.filter(m => m.producedThisWeek > 0).length === 0 ? (
                            <span className="text-[11px] text-slate-400 dark:text-dk-muted font-medium">
                                {tx(lang, { fr: 'Aucune production enregistrée cette semaine', ar: 'لا يوجد أي إنتاج مسجل هذا الأسبوع', en: 'No production recorded this week', es: 'No hay producción registrada esta semana', pt: 'Nenhuma produção registada esta semana', tr: 'Bu hafta kayıtlı üretim yok' })}
                            </span>
                        ) : (
                            <>
                                {activeModels.filter(m => m.producedThisWeek > 0).map(m => (
                                    <span
                                        key={m.id}
                                        className="inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[11px] font-bold tabular-nums"
                                        style={{ backgroundColor: m.style.bg, borderColor: m.style.border, color: m.style.text }}
                                        title={`${m.name} — ${m.ofTag || ''}`}
                                    >
                                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: m.style.base }} />
                                        <span className="truncate max-w-[140px]">{m.reference}{m.ofTag ? ` · ${m.ofTag}` : ''}</span>
                                        <span className="font-black">{m.producedThisWeek} pcs</span>
                                    </span>
                                ))}
                                <span className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 dark:bg-indigo-700 text-white px-2.5 py-0.5 text-[11px] font-black tabular-nums shadow-sm">
                                    {tx(lang, { fr: 'TOTAL', ar: 'الإجمالي', en: 'TOTAL', es: 'TOTAL', pt: 'TOTAL', tr: 'TOPLAM' })} : {activeModels.reduce((acc, m) => acc + m.producedThisWeek, 0)} pcs
                                </span>
                            </>
                        )}
                    </div>
                </div>

                {/* SVG Live sparkline chart & OEE/TRS KPI dashboard */}
                {selectedChartDate && activeChartMetrics && (
                  <Section isMobile={isMobile} title={tx(lang, { fr: 'Rendement & TRS', ar: 'المردودية و TRS', en: 'Efficiency & TRS', es: 'Rendimiento y TRS', pt: 'Rendimento e TRS', tr: 'Verimlilik ve TRS' })} icon={<BarChart2 className="w-4 h-4 text-indigo-600 dark:text-indigo-300 dark:text-indigo-200 shrink-0" />}>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-6 animate-in fade-in duration-300">
                        
                        {/* Sparkline chart */}
                        <div className="lg:col-span-2 bg-white dark:bg-dk-surface border border-slate-100 dark:border-dk-border/60 rounded-3xl p-5 shadow-sm">
                            <div className="flex items-center justify-between border-b border-slate-50 dark:border-dk-border/40 pb-3 mb-4">
                                <div className="flex items-center gap-2">
                                    <BarChart2 className="w-5 h-5 text-indigo-600 dark:text-indigo-300 dark:text-indigo-200" />
                                    <div>
                                        <h3 className="text-sm font-black text-slate-800 dark:text-dk-text">{l.yieldHour} — {weekDays.find(d => d.dateStr === selectedChartDate)?.label}</h3>
                                        <p className="text-[10px] text-slate-400 dark:text-dk-muted font-medium">{tx(lang, { fr: 'Visualisation de la production par heure de travail', ar: 'عرض الإنتاج حسب كل ساعة عمل', en: 'Production view by work hour', es: 'Visualización de la producción por hora de trabajo', pt: 'Visualização da produção por hora de trabalho', tr: 'Çalışma saatine göre üretim görünümü' })}</p>
                                    </div>
                                </div>
                                <span className="text-xs bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/50 text-indigo-700 dark:text-indigo-300 dark:text-indigo-200 px-2.5 py-0.5 rounded-xl font-black">
                                    {activeChartMetrics.totalPiece} {tx(lang, { fr: 'pièces produites', ar: 'قطعة منتجة', en: 'pieces produced', es: 'piezas producidas', pt: 'peças produzidas', tr: 'adet üretildi' })}
                                </span>
                            </div>

                            {/* SVG Sparkline drawing */}
                            <div className="relative h-32 bg-slate-50 dark:bg-dk-bg/50 rounded-2xl border border-slate-100 dark:border-dk-border/60 overflow-hidden flex items-end">
                                {chartPathData ? (
                                    <svg className="w-full h-full" viewBox="0 0 500 120" preserveAspectRatio="none">
                                        <defs>
                                            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.2"/>
                                                <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.0"/>
                                            </linearGradient>
                                        </defs>
                                        {/* Filled Area */}
                                        <path 
                                            d={`${chartPathData} L 485,105 L 15,105 Z`} 
                                            fill="url(#chartGradient)"
                                        />
                                        {/* Stroke line */}
                                        <path 
                                            d={chartPathData} 
                                            fill="none" 
                                            stroke="#4f46e5" 
                                            strokeWidth="3"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                    </svg>
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-xs text-slate-400 dark:text-dk-muted">{tx(lang, { fr: 'Aucune production enregistrée pour ce jour.', ar: 'لا يوجد إنتاج مسجل لهذا اليوم.', en: 'No production recorded for this day.', es: 'No hay producción registrada para este día.', pt: 'Nenhuma produção registada para este dia.', tr: 'Bu gün için kayıtlı üretim yok.' })}</div>
                                )}
                            </div>
                            
                            {/* X-axis labels */}
                            <div className="flex justify-between px-3 mt-2 text-[8px] font-black text-slate-400 dark:text-dk-muted uppercase tracking-wider">
                                {hourBlocks.map(h => <span key={h.key}>{h.label.split('/')[0]}</span>)}
                            </div>
                        </div>

                        {/* OEE / TRS KPI Dashboard */}
                        <div className="bg-white dark:bg-dk-surface border border-slate-100 dark:border-dk-border/60 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
                            <div className="border-b border-slate-50 dark:border-dk-border/40 pb-3 mb-4">
                                <h3 className="text-sm font-black text-slate-800 dark:text-dk-text flex items-center gap-1.5">
                                    <span>{l.trs}</span>
                                </h3>
                                <p className="text-[10px] text-slate-400 dark:text-dk-muted font-medium">{tx(lang, { fr: 'Disponibilité × Performance × Qualité', ar: 'التوفر × الأداء × الجودة', en: 'Availability × Performance × Quality', es: 'Disponibilidad × Rendimiento × Calidad', pt: 'Disponibilidade × Desempenho × Qualidade', tr: 'Kullanılabilirlik × Performans × Kalite' })}</p>
                            </div>
                            
                            <div className="grid grid-cols-3 gap-2">
                                <div className="p-3 bg-slate-50 dark:bg-dk-bg border border-slate-100 dark:border-dk-border/60 rounded-2xl text-center">
                                    <span className="text-[9px] font-black text-slate-400 dark:text-dk-muted uppercase block">{l.dispo}</span>
                                    <span className="text-lg font-black text-slate-700 dark:text-dk-text block mt-1 tabular-nums">{activeChartMetrics.availability}%</span>
                                </div>
                                <div className="p-3 bg-slate-50 dark:bg-dk-bg border border-slate-100 dark:border-dk-border/60 rounded-2xl text-center">
                                    <span className="text-[9px] font-black text-slate-400 dark:text-dk-muted uppercase block">{l.perf}</span>
                                    <span className="text-lg font-black text-slate-700 dark:text-dk-text block mt-1 tabular-nums">{activeChartMetrics.rTotalDay}%</span>
                                </div>
                                <div className="p-3 bg-slate-50 dark:bg-dk-bg border border-slate-100 dark:border-dk-border/60 rounded-2xl text-center">
                                    <span className="text-[9px] font-black text-slate-400 dark:text-dk-muted uppercase block">{l.quality}</span>
                                    <span className="text-lg font-black text-slate-700 dark:text-dk-text block mt-1 tabular-nums">{activeChartMetrics.quality}%</span>
                                </div>
                            </div>

                            <div className="mt-4 flex items-center justify-between bg-indigo-50 dark:bg-indigo-900/30/50 border border-indigo-100 dark:border-indigo-800/50 rounded-2xl p-4">
                                <div>
                                    <span className="text-[9px] font-black text-indigo-700 dark:text-indigo-300 dark:text-indigo-200 uppercase tracking-widest block">TRS Score</span>
                                    <span className="text-3xl font-black text-indigo-800 dark:text-indigo-200 block mt-1 tabular-nums">{activeChartMetrics.oee}%</span>
                                </div>
                                <div className="text-right">
                                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase ${
                                        activeChartMetrics.oee >= 85 ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-800'
                                    }`}>
                                        {activeChartMetrics.oee >= 85 ? tx(lang, { fr: 'Excellent', ar: 'ممتاز', en: 'Excellent', es: 'Excelente', pt: 'Excelente', tr: 'Mükemmel' }) : tx(lang, { fr: 'A optimiser', ar: 'قابل للتحسين', en: 'To optimize', es: 'A optimizar', pt: 'A otimizar', tr: 'İyileştirilmeli' })}
                                    </span>
                                    <p className="text-[9px] text-slate-400 dark:text-dk-muted font-bold mt-1">Norme mondiale: 85%</p>
                                </div>
                            </div>

                            {/* Chronologie Visuelle de la Journée */}
                            <div className="mt-4 border-t border-slate-100 dark:border-dk-border/60 pt-4">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-dk-muted block mb-2">
                                    {l.timeline} ({weekDays.find(d => d.dateStr === selectedChartDate)?.label})
                                </span>
                                <div className="flex items-stretch gap-1 h-8 w-full bg-slate-50 dark:bg-dk-bg border border-slate-100 dark:border-dk-border/60 rounded-xl p-1 overflow-hidden">
                                    {hourBlocks.map(h => {
                                        const cellMeta = getCellMeta(selectedChartDate, h.key);
                                        const qty = cellMeta?.value || 0;
                                        const dt = cellMeta?.downtime;
                                        
                                        let bgClass = 'bg-slate-200 dark:bg-dk-border/50 border border-dashed border-slate-300 dark:border-dk-border/30 text-slate-400 dark:text-dk-muted';
                                        let label = '—';
                                        let tooltipText = `${h.label}: Inactif`;
                                        
                                        if (dt === 'L') {
                                            bgClass = 'bg-slate-400/20 text-slate-600 dark:text-dk-text-soft border border-slate-300 dark:border-dk-border/30';
                                            label = 'L';
                                            tooltipText = `${h.label}: Déjeuner (60m)`;
                                        } else if (dt === 'P') {
                                            bgClass = 'bg-blue-500 dark:bg-blue-700/20 text-blue-700 dark:text-blue-300 border border-blue-300/30';
                                            label = 'P';
                                            tooltipText = `${h.label}: Pause (15m)`;
                                        } else if (dt === 'M') {
                                            bgClass = 'bg-rose-50 dark:bg-rose-900/300/20 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800/30 animate-pulse';
                                            label = tx(lang, { fr: 'Panne', ar: 'عطل', en: 'Breakdown', es: 'Avería', pt: 'Avaria', tr: 'Arıza' });
                                            tooltipText = `${h.label}: Panne (30m)`;
                                        } else if (dt === 'S') {
                                            bgClass = 'bg-amber-50 dark:bg-amber-900/300/20 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800/30';
                                            label = tx(lang, { fr: 'Rupt.', ar: 'انقطاع', en: 'Shortage', es: 'Rupt.', pt: 'Rupt.', tr: 'Kesinti' });
                                            tooltipText = `${h.label}: Rupture appro (45m)`;
                                        } else if (qty > 0) {
                                            bgClass = 'bg-indigo-600 dark:bg-indigo-700/10 text-indigo-700 dark:text-indigo-300 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800/40 font-black';
                                            label = `${qty} p`;
                                            tooltipText = `${h.label}: Production (${qty} pcs)`;
                                        }
                                        
                                        return (
                                            <div 
                                                key={h.key}
                                                style={{ flex: h.duration }}
                                                className={`rounded-lg flex items-center justify-center text-[9px] select-none cursor-pointer relative group transition-all hover:scale-[1.02] ${bgClass}`}
                                                title={tooltipText}
                                            >
                                                <span>{label}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="flex justify-between px-1 mt-1 text-[8px] font-bold text-slate-400 dark:text-dk-muted">
                                    <span>{hourBlocks[0]?.label.split('/')[0]}</span>
                                    <span>{hourBlocks[hourBlocks.length - 1]?.label.split('/')[1]}</span>
                                </div>
                            </div>
                        </div>

                    </div>
                  </Section>
                )}

                {/* Expandable Sidebar Grid: Sizes & WIP Matrix & Skills Check */}
                <Section isMobile={isMobile} title={tx(lang, { fr: 'Tailles, WIP & Compétences', ar: 'المقاسات و WIP والكفاءات', en: 'Sizes, WIP & Skills', es: 'Tallas, WIP y competencias', pt: 'Tamanhos, WIP e competências', tr: 'Bedenler, WIP ve yetkinlikler' })} icon={<Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-300 dark:text-indigo-200 shrink-0" />}>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-6">

                    {/* WIP & Sizing Control Box */}
                    <div className="lg:col-span-2 bg-white dark:bg-dk-surface border border-slate-100 dark:border-dk-border/60 rounded-3xl p-5 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between border-b border-slate-50 dark:border-dk-border/40 pb-3 mb-4 gap-3">
                            <div className="flex items-center gap-2">
                                <Layers className="w-5 h-5 text-indigo-600 dark:text-indigo-300 dark:text-indigo-200" />
                                <div>
                                    <h3 className="text-sm font-black text-slate-800 dark:text-dk-text flex items-center gap-1.5">
                                        <span>{l.wip}</span>
                                    </h3>
                                    <p className="text-[10px] text-slate-400 dark:text-dk-muted font-medium">{tx(lang, { fr: "Contrôle des flux d'entrées/sorties par taille S, M, L, XL", ar: 'مراقبة تدفقات الإدخال والإخراج حسب المقاسات S و M و L و XL', en: 'Input/output flow control by size S, M, L, XL', es: 'Control de flujos de entrada/salida por talla S, M, L, XL', pt: 'Controlo dos fluxos de entrada/saída por tamanho S, M, L, XL', tr: 'S, M, L, XL bedenlerine göre giriş/çıkış akış kontrolü' })}</p>
                                </div>
                            </div>
                        </div>

                        {/* Size Table Matrix */}
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-dk-bg/50 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-dk-muted border-b border-slate-100 dark:border-dk-border/60">
                                        <th className="py-2.5 px-3">{l.size}</th>
                                        <th className="py-2.5 px-3 text-center">{l.inputs}</th>
                                        <th className="py-2.5 px-3 text-center">{l.outputs}</th>
                                        <th className="py-2.5 px-3 text-center">L'encours (WIP)</th>
                                        <th className="py-2.5 px-3 text-right">Alerte Goulot</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {sizingData.map(row => (
                                        <tr key={row.size} className="hover:bg-slate-50 dark:bg-dk-bg/40 transition-colors">
                                            <td className="py-3 px-3 font-black text-slate-800 dark:text-dk-text">{row.size}</td>
                                            
                                            {/* Entree Input */}
                                            <td className="py-3 px-3 text-center">
                                                <input 
                                                    type="number"
                                                    inputMode="numeric"
                                                    value={row.entree}
                                                    onChange={(e) => handleSaveSizes(selectedActiveModelId, row.size, 'entree', Math.max(0, parseInt(e.target.value) || 0))}
                                                    className="w-20 text-center font-black text-xs bg-slate-50 dark:bg-dk-bg border border-slate-100 dark:border-dk-border/60 rounded-lg py-1 focus:bg-white dark:bg-dk-surface focus:border-indigo-500 outline-none transition-all tabular-nums"
                                                />
                                            </td>

                                            {/* Sortie Input */}
                                            <td className="py-3 px-3 text-center">
                                                <input 
                                                    type="number"
                                                    inputMode="numeric"
                                                    value={row.sortie}
                                                    onChange={(e) => handleSaveSizes(selectedActiveModelId, row.size, 'sortie', Math.max(0, parseInt(e.target.value) || 0))}
                                                    className="w-20 text-center font-black text-xs bg-slate-50 dark:bg-dk-bg border border-slate-100 dark:border-dk-border/60 rounded-lg py-1 focus:bg-white dark:bg-dk-surface focus:border-indigo-500 outline-none transition-all tabular-nums"
                                                />
                                            </td>

                                            {/* Calculated WIP */}
                                            <td className={`py-3 px-3 text-center font-black text-sm tabular-nums ${row.encours > 0 ? 'text-indigo-600 dark:text-indigo-300 dark:text-indigo-200' : 'text-slate-400 dark:text-dk-muted'}`}>
                                                {row.encours} pcs
                                            </td>

                                            {/* Bottleneck indicator */}
                                            <td className="py-3 px-3 text-right">
                                                {row.isBottleneck ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-50 dark:bg-rose-900/30 border border-rose-100 dark:border-rose-800/50 text-rose-600 dark:text-rose-300 text-[10px] font-black uppercase tracking-wider animate-pulse">
                                                        ⚠️ Goulot d'étranglement
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300 text-[10px] font-black uppercase tracking-wider">
                                                        ✅ Fluide
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Skill Matching & Machine Certification Box — masqué si les alertes machines sont désactivées (Configuration) */}
                    {settings.machineAlertsEnabled !== false && (
                    <div className="bg-white dark:bg-dk-surface border border-slate-100 dark:border-dk-border/60 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
                        <div>
                            <div className="flex items-center gap-2 border-b border-slate-50 dark:border-dk-border/40 pb-3 mb-4">
                                <ShieldAlert className="w-5 h-5 text-indigo-600 dark:text-indigo-300 dark:text-indigo-200" />
                                <div>
                                    <h3 className="text-sm font-black text-slate-800 dark:text-dk-text flex items-center gap-1.5">
                                        <span>{tx(lang, { fr: 'Compétences & Gamme', ar: 'الكفاءات و Gamme', en: 'Skills & Routing', es: 'Competencias y gama', pt: 'Competências e gama', tr: 'Yetkinlikler ve rota' })}</span>
                                    </h3>
                                    <p className="text-[10px] text-slate-400 dark:text-dk-muted font-medium">{tx(lang, { fr: "Contrôle de certification d'opératrices par machine", ar: 'مراقبة تأهيل العاملات حسب الآلة', en: 'Operator certification control by machine', es: 'Control de certificación de operarias por máquina', pt: 'Controlo de certificação de operadoras por máquina', tr: 'Makineye göre operatör sertifika kontrolü' })}</p>
                                </div>
                            </div>

                            {/* Skills Verification Status */}
                            {skillCheckResults.status === 'OK' ? (
                                <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800/50 p-4 text-emerald-800 dark:text-emerald-200 flex items-start gap-3">
                                    <CheckCircle className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-300" />
                                    <div>
                                        <p className="text-xs font-black uppercase tracking-wider">{tx(lang, { fr: 'Couverture Complète', ar: 'تغطية كاملة', en: 'Complete coverage', es: 'Cobertura completa', pt: 'Cobertura completa', tr: 'Tam kapsama' })}</p>
                                        <p className="text-[10px] text-emerald-700 dark:text-emerald-300/80 font-medium mt-1">{tx(lang, { fr: "L'effectif actuel possède toutes les qualifications machine requises dans la gamme opératoire du modèle.", ar: 'يمتلك الفريق الحالي جميع مؤهلات الآلات المطلوبة في غامة عمليات النموذج.', en: 'The current workforce has all machine qualifications required by the model routing.', es: 'El efectivo actual posee todas las cualificaciones de máquina requeridas por la gama del modelo.', pt: 'O efetivo atual possui todas as qualificações de máquina exigidas pela gama do modelo.', tr: 'Mevcut personel, model rotasında gereken tüm makine niteliklerine sahiptir.' })}</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="rounded-2xl bg-amber-50 dark:bg-amber-900/30 border border-amber-100 dark:border-amber-800/50 p-4 text-amber-900 dark:text-amber-200 flex items-start gap-3">
                                        <AlertCircle className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-300" />
                                        <div>
                                            <p className="text-xs font-black uppercase tracking-wider">{tx(lang, { fr: 'Compétences Manquantes', ar: 'كفاءات ناقصة', en: 'Missing skills', es: 'Competencias faltantes', pt: 'Competências em falta', tr: 'Eksik yetkinlikler' })}</p>
                                            <p className="text-[10px] text-amber-800/80 font-medium mt-1">{tx(lang, { fr: "Certaines machines requises par la gamme opératoire n'ont pas d'opérateurs certifiés affectés sur la ligne.", ar: 'بعض الآلات المطلوبة في غامة العمليات لا تملك عاملين مؤهلين مخصصين على الخط.', en: 'Some machines required by the routing do not have certified operators assigned to the line.', es: 'Algunas máquinas requeridas por la gama no tienen operarios certificados asignados a la línea.', pt: 'Algumas máquinas exigidas pela gama não têm operadores certificados atribuídos à linha.', tr: 'Rotada gereken bazı makineler için hatta atanmış sertifikalı operatör yok.' })}</p>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5 mt-2">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-dk-muted">{tx(lang, { fr: 'Postes non couverts :', ar: 'المراكز غير المغطاة:', en: 'Uncovered stations:', es: 'Puestos no cubiertos:', pt: 'Postos não cobertos:', tr: 'Kapsanmayan istasyonlar:' })}</p>
                                        {skillCheckResults.errors.map((machine, idx) => (
                                            <div key={idx} className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-dk-text bg-slate-50 dark:bg-dk-bg border border-slate-100 dark:border-dk-border/60 px-3 py-1.5 rounded-xl">
                                                <span>Machine: <strong className="text-indigo-600 dark:text-indigo-300 dark:text-indigo-200">{machine}</strong></span>
                                                <span className="text-[9px] bg-rose-50 dark:bg-rose-900/30 text-rose-500 dark:text-rose-300 px-2 py-0.5 rounded font-black uppercase">{tx(lang, { fr: 'Requis', ar: 'مطلوب', en: 'Required', es: 'Requerido', pt: 'Exigido', tr: 'Gerekli' })}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Horizontal Operations Flow */}
                            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-dk-border/60">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-dk-muted block mb-2">
                                    {tx(lang, { fr: 'Flux de Gamme Opératoire', ar: 'تدفق غامة العمليات', en: 'Operating routing flow', es: 'Flujo de gama operativa', pt: 'Fluxo da gama operacional', tr: 'Operasyon rotası akışı' })}
                                </span>
                                <div className="flex gap-2 items-center overflow-x-auto pb-3 pt-1 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                                    {activeModel && activeModel.gamme && activeModel.gamme.length > 0 ? (
                                        activeModel.gamme.map((op, idx) => {
                                            const machine = op.machineName || op.machineId || 'Piqueuse';
                                            const isMissing = skillCheckResults.errors.some(
                                                err => err.toLowerCase() === machine.toLowerCase()
                                            );
                                            
                                            return (
                                                <div key={op.id || idx} className="flex items-center shrink-0">
                                                    <div 
                                                        className={`p-2 rounded-xl border text-left min-w-[110px] max-w-[130px] relative transition-all duration-200 hover:shadow-sm ${
                                                            isMissing 
                                                                ? 'bg-rose-50 dark:bg-rose-900/30/50 border-rose-200 dark:border-rose-800 ring-1 ring-rose-500/10' 
                                                                : 'bg-indigo-50 dark:bg-indigo-900/30/20 border-slate-100 dark:border-dk-border/60 hover:border-indigo-200 dark:border-indigo-800'
                                                        }`}
                                                    >
                                                        <span className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-slate-100 dark:bg-dk-elevated/60 border border-slate-200 dark:border-dk-border flex items-center justify-center text-[8px] font-black text-slate-500 dark:text-dk-muted shadow-sm">
                                                            {op.order || idx + 1}
                                                        </span>
                                                        <div className="font-black text-[9px] text-slate-800 dark:text-dk-text truncate" title={op.description}>
                                                            {op.description || `Op. ${op.order}`}
                                                        </div>
                                                        <div className="flex items-center justify-between gap-1 mt-1 text-[8px] font-bold text-slate-400 dark:text-dk-muted">
                                                            <span className={`truncate ${isMissing ? 'text-rose-600 dark:text-rose-300' : 'text-indigo-600 dark:text-indigo-300 dark:text-indigo-200'}`}>{machine}</span>
                                                            <span className="tabular-nums font-mono text-[7px] bg-slate-100 dark:bg-dk-elevated/60 px-0.5 rounded shrink-0">{(op.time || 0).toFixed(1)}s</span>
                                                        </div>
                                                    </div>
                                                    {idx < activeModel.gamme.length - 1 && (
                                                        <span className={`h-0.5 w-3 shrink-0 ${isMissing ? 'bg-rose-200 dark:bg-rose-900/50 border-dashed border-t-2' : 'bg-slate-200 dark:bg-dk-border'}`} />
                                                    )}
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="text-[10px] text-slate-400 dark:text-dk-muted py-2 italic">Aucune gamme opératoire enregistrée.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                        
                        <p className="text-[10px] text-slate-400 dark:text-dk-muted font-medium leading-relaxed border-t border-slate-50 dark:border-dk-border/40 pt-3 mt-4">
                            Relie la gamme de montage aux qualifications enregistrées dans la base RH de l'usine pour éviter les baisses de rendement liées au mauvais placement des ouvrières.
                        </p>
                    </div>
                    )}

                </div>
                </Section>

                {/* ═══ LOGISTICS: Overconsumption Alert Banner (Alerte Surconsommation) ═══ */}
                {consumptionAlerts.length > 0 && (
                    <div className={`rounded-3xl border-2 overflow-hidden shadow-lg ${
                        consumptionAlerts.some(a => a.severity === 'critical')
                            ? 'border-rose-300 dark:border-rose-800 bg-gradient-to-r from-rose-50 via-rose-100/50 to-rose-50'
                            : 'border-amber-300 dark:border-amber-800 bg-gradient-to-r from-amber-50 via-amber-100/50 to-amber-50'
                    }`}>
                        {/* Animated top stripe */}
                        <div className={`h-1.5 w-full ${
                            consumptionAlerts.some(a => a.severity === 'critical')
                                ? 'bg-gradient-to-r from-rose-500 via-red-600 to-rose-500 animate-pulse'
                                : 'bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400'
                        }`} />

                        <div className="p-5">
                            <div className="flex items-center gap-3 mb-4">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-md ${
                                    consumptionAlerts.some(a => a.severity === 'critical')
                                        ? 'bg-rose-50 dark:bg-rose-900/300 text-white animate-pulse'
                                        : 'bg-amber-50 dark:bg-amber-900/300 text-white'
                                }`}>
                                    <AlertTriangle className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="text-base font-black text-slate-800 dark:text-dk-text flex items-center gap-2">
                                        {tx(lang, { fr: 'Alerte Surconsommation', ar: 'تنبيه الاستهلاك الزائد', en: 'Overconsumption alert', es: 'Alerta de sobreconsumo', pt: 'Alerta de sobreconsumo', tr: 'Fazla tüketim uyarısı' })}
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider ${
                                            consumptionAlerts.some(a => a.severity === 'critical')
                                                ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 animate-pulse'
                                                : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                                        }`}>
                                            {consumptionAlerts.filter(a => a.severity === 'critical').length} critique(s)
                                        </span>
                                    </h3>
                                    <p className="text-xs text-slate-500 dark:text-dk-muted font-medium">
                                        {tx(lang, { fr: 'Le stock restant ne suffira pas à terminer la commande !', ar: 'المخزون المتبقي غير كاف لإتمام الطلبية.', en: 'Remaining stock will not be enough to complete the order.', es: 'El stock restante no bastará para terminar el pedido.', pt: 'O stock restante não será suficiente para concluir a encomenda.', tr: 'Kalan stok siparişi tamamlamak için yeterli olmayacak.' })}
                                    </p>
                                </div>
                            </div>

                            {/* Alert Cards Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {consumptionAlerts.map((alert, idx) => (
                                    <div
                                        key={`${alert.modelId}-${alert.materialName}-${idx}`}
                                        className={`rounded-2xl border p-4 transition-all hover:shadow-md ${
                                            alert.severity === 'critical'
                                                ? 'bg-white dark:bg-dk-surface border-rose-200 dark:border-rose-800 shadow-sm shadow-rose-100/50'
                                                : 'bg-white dark:bg-dk-surface border-amber-200 dark:border-amber-800 shadow-sm shadow-amber-100/50'
                                        }`}
                                    >
                                        {/* Card header */}
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <span className="w-3 h-3 rounded-md border" style={{ backgroundColor: alert.style.bg, borderColor: alert.style.border }} />
                                                <span className="text-xs font-black text-slate-800 dark:text-dk-text">{alert.modelRef}</span>
                                            </div>
                                            <span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase ${
                                                alert.severity === 'critical'
                                                    ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300'
                                                    : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                                            }`}>
                                                {alert.severity === 'critical'
                                                    ? tx(lang, { fr: 'Critique', ar: 'حرج', en: 'Critical', es: 'Crítico', pt: 'Crítico', tr: 'Kritik' })
                                                    : tx(lang, { fr: 'Attention', ar: 'تنبيه', en: 'Warning', es: 'Atención', pt: 'Atenção', tr: 'Uyarı' })}
                                            </span>
                                        </div>

                                        {/* Material name */}
                                        <div className="flex items-center gap-2 mb-3">
                                            <Package className="w-4 h-4 text-slate-400 dark:text-dk-muted" />
                                            <span className="text-sm font-black text-indigo-700 dark:text-indigo-300 dark:text-indigo-200">{alert.materialName}</span>
                                        </div>

                                        {/* KPI Grid */}
                                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                                            <div className="bg-slate-50 dark:bg-dk-bg rounded-xl p-2 text-center">
                                                <span className="block text-slate-400 dark:text-dk-muted font-bold uppercase">{tx(lang, { fr: 'Sorti Magasin', ar: 'خارج من المخزن', en: 'Issued from stock', es: 'Salida de almacén', pt: 'Saído do armazém', tr: 'Depodan çıkan' })}</span>
                                                <span className="block text-sm font-black text-slate-700 dark:text-dk-text tabular-nums">{alert.totalReceived.toLocaleString()} {alert.unit}</span>
                                            </div>
                                            <div className="bg-slate-50 dark:bg-dk-bg rounded-xl p-2 text-center">
                                                <span className="block text-slate-400 dark:text-dk-muted font-bold uppercase">{tx(lang, { fr: 'Cons. Théor.', ar: 'الاستهلاك النظري', en: 'Theoretical cons.', es: 'Cons. teórica', pt: 'Cons. teórica', tr: 'Teorik tüketim' })}</span>
                                                <span className="block text-sm font-black text-slate-700 dark:text-dk-text tabular-nums">{alert.consumed.toLocaleString()} {alert.unit}</span>
                                            </div>
                                            <div className={`rounded-xl p-2 text-center ${alert.remainingStock <= 0 ? 'bg-rose-50 dark:bg-rose-900/30' : 'bg-emerald-50 dark:bg-emerald-900/30'}`}>
                                                <span className="block text-slate-400 dark:text-dk-muted font-bold uppercase">{tx(lang, { fr: 'Sur la chaîne', ar: 'على الخط', en: 'On the line', es: 'En la línea', pt: 'Na linha', tr: 'Hatta' })}</span>
                                                <span className={`block text-sm font-black tabular-nums ${alert.remainingStock <= 0 ? 'text-rose-600 dark:text-rose-300' : 'text-emerald-600 dark:text-emerald-300'}`}>{alert.remainingStock.toLocaleString()} {alert.unit}</span>
                                            </div>
                                            <div className="bg-indigo-50 dark:bg-indigo-900/30 rounded-xl p-2 text-center">
                                                <span className="block text-slate-400 dark:text-dk-muted font-bold uppercase">{tx(lang, { fr: 'Besoin Rest.', ar: 'الاحتياج المتبقي', en: 'Remaining need', es: 'Necesidad restante', pt: 'Necessidade restante', tr: 'Kalan ihtiyaç' })}</span>
                                                <span className="block text-sm font-black text-indigo-600 dark:text-indigo-300 dark:text-indigo-200 tabular-nums">{alert.remainingNeed.toLocaleString()} {alert.unit}</span>
                                            </div>
                                        </div>

                                        {/* Écart (Deviation) bar */}
                                        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-dk-border/60">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-black text-slate-400 dark:text-dk-muted uppercase flex items-center gap-1">
                                                    <TrendingDown className="w-3 h-3" />
                                                    {tx(lang, { fr: 'Surconsommation (Perte)', ar: 'الاستهلاك الزائد (الهدر)', en: 'Overconsumption (loss)', es: 'Sobreconsumo (pérdida)', pt: 'Sobreconsumo (perda)', tr: 'Fazla tüketim (kayıp)' })}
                                                </span>
                                                <span className="text-sm font-black tabular-nums text-rose-600 dark:text-rose-300">
                                                    +{alert.ecart.toLocaleString()} {alert.unit}
                                                </span>
                                            </div>
                                            <div className="w-full bg-slate-100 dark:bg-dk-elevated/60 h-2 rounded-full mt-1.5 overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-500 ${
                                                        alert.severity === 'critical' ? 'bg-rose-50 dark:bg-rose-900/300 animate-pulse' : 'bg-amber-400 dark:bg-amber-800'
                                                    }`}
                                                    style={{ width: `${Math.min(100, Math.max(5, alert.totalReceived > 0 ? (alert.consumed / alert.totalReceived) * 100 : 100))}%` }}
                                                />
                                            </div>
                                            <p className="text-[9px] text-slate-400 dark:text-dk-muted font-medium mt-1">
                                                {alert.severity === 'critical'
                                                    ? tx(lang, { fr: 'Gaspillage critique constaté sur la chaîne ! (>20%)', ar: 'تم رصد هدر حرج على الخط (>20%).', en: 'Critical waste detected on the line! (>20%)', es: 'Desperdicio crítico detectado en la línea (>20%).', pt: 'Desperdício crítico detetado na linha (>20%).', tr: 'Hatta kritik fire tespit edildi! (>20%)' })
                                                    : tx(lang, { fr: 'Légère surconsommation constatée (>10%)', ar: 'تم رصد استهلاك زائد طفيف (>10%).', en: 'Slight overconsumption detected (>10%)', es: 'Sobreconsumo ligero detectado (>10%)', pt: 'Sobreconsumo ligeiro detetado (>10%)', tr: 'Hafif fazla tüketim tespit edildi (>10%)' })}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Legend & Instructions footer */}
                <Section isMobile={isMobile} title={l.downtimes} icon={<Info className="w-4 h-4 text-indigo-600 dark:text-indigo-300 dark:text-indigo-200 shrink-0" />}>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border/60 rounded-2xl p-3 sm:p-5 shadow-sm text-xs font-semibold text-slate-500 dark:text-dk-muted">
                    <div className="flex flex-wrap items-center gap-4">
                        <span className="font-bold">{l.downtimes} :</span>
                        <span className="flex items-center gap-1.5"><span className="w-6 py-0.5 rounded text-[10px] font-black bg-slate-50 dark:bg-dk-bg0 text-white text-center">L</span> {l.lunch}</span>
                        <span className="flex items-center gap-1.5"><span className="w-6 py-0.5 rounded text-[10px] font-black bg-blue-500 dark:bg-blue-700 text-white text-center">P</span> {l.pause}</span>
                        <span className="flex items-center gap-1.5"><span className="w-6 py-0.5 rounded text-[10px] font-black bg-rose-50 dark:bg-rose-900/300 text-white text-center">M</span> {l.breakdown}</span>
                        <span className="flex items-center gap-1.5"><span className="w-6 py-0.5 rounded text-[10px] font-black bg-amber-50 dark:bg-amber-900/300 text-white text-center">S</span> {l.rupture}</span>
                    </div>
                    <p className="text-slate-400 dark:text-dk-muted font-medium">{tx(lang, { fr: 'Les pannes et pauses réduisent automatiquement le temps de travail effectif utilisé pour calculer le rendement (R%).', ar: 'تُخصم الأعطال والاستراحات تلقائياً من وقت العمل الفعلي لحساب المردودية (R%) بدقة.', en: 'Breakdowns and breaks automatically reduce effective work time used to calculate efficiency (R%).', es: 'Las averías y pausas reducen automáticamente el tiempo efectivo usado para calcular el rendimiento (R%).', pt: 'Avarias e pausas reduzem automaticamente o tempo efetivo usado para calcular o rendimento (R%).', tr: 'Arızalar ve molalar, verimlilik (R%) hesabında kullanılan etkin çalışma süresini otomatik olarak azaltır.' })}</p>
                </div>
                </Section>

            </div>

            {/* Cell Details Modal */}
            {activeCellModal && (
                <CellDetailsModal
                    isOpen={true}
                    dateStr={activeCellModal.dateStr}
                    hourKey={activeCellModal.hourKey}
                    hourLabel={activeCellModal.hourLabel}
                    cellData={getCellMeta(activeCellModal.dateStr, activeCellModal.hourKey)}
                    activeModels={activeModels}
                    selectedActiveModelId={selectedActiveModelId || activeModels[0]?.id}
                    lang={lang}
                    onClose={() => setActiveCellModal(null)}
                    onSave={(qty, modelId, downtime, defectsQty, defectType) => {
                        handleSaveCell(activeCellModal.dateStr, activeCellModal.hourKey, qty, modelId, downtime, defectsQty, defectType);
                        setActiveCellModal(null);
                    }}
                />
            )}

            {/* Status Change Modal */}
            {editingStatusEvent && (
                <StatusChangeModal
                    isOpen={true}
                    event={editingStatusEvent}
                    lang={lang}
                    onClose={() => setEditingStatusEvent(null)}
                    onSave={(newStatus) => {
                        if (setPlanningEvents) {
                            setPlanningEvents(prev => prev.map(p => p.id === editingStatusEvent.id ? { ...p, status: newStatus } : p));
                        }
                        setEditingStatusEvent(null);
                        setModelDropdownOpen(false);
                    }}
                />
            )}

        </div>
    );
}

// Cell details popup modal (ultra-premium design)
interface CellDetailsModalProps {
    isOpen: boolean;
    dateStr: string;
    hourKey: string;
    hourLabel: string;
    cellData: any;
    activeModels: any[];
    selectedActiveModelId: string;
    lang: string;
    onClose: () => void;
    onSave: (quantity: number, modelId: string, downtime: string | null, defectsQty: number, defectType: string) => void;
}

function CellDetailsModal({
    isOpen, dateStr, hourKey, hourLabel, cellData, activeModels, selectedActiveModelId, lang, onClose, onSave
}: CellDetailsModalProps) {
    const l = useMemo(() => buildSuiviLabels(lang), [lang]);
    
    // Draft states
    const [modelId, setModelId] = useState(cellData?.model?.id || selectedActiveModelId);
    const [quantity, setQuantity] = useState<number>(cellData?.value || 0);
    const [downtime, setDowntime] = useState<string | null>(cellData?.downtime || null);
    const [defectsQty, setDefectsQty] = useState<number>(cellData?.defectsQty || 0);
    const [defectType, setDefectType] = useState<string>(cellData?.defects?.[0]?.type || 'Couture');

    const handleConfirm = () => {
        onSave(quantity, modelId, downtime, defectsQty, defectType);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-dk-surface rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-100 dark:border-dk-border/60 animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50 dark:border-dk-border/40 bg-slate-50 dark:bg-dk-bg/50">
                    <div>
                        <h3 className="text-base font-black text-slate-800 dark:text-dk-text tracking-tight">
                            {l.cellModalTitle}
                        </h3>
                        <p className="text-[10px] text-slate-400 dark:text-dk-muted font-bold uppercase mt-0.5">
                            {dateStr} · {hourLabel}
                        </p>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="p-1.5 rounded-lg text-slate-400 dark:text-dk-muted hover:text-slate-600 dark:text-dk-text-soft hover:bg-slate-100 dark:bg-dk-elevated/60 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4 text-xs">
                    
                    {/* Model Select */}
                    <div className="space-y-1">
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-dk-muted">
                            {l.activeModel}
                        </label>
                        <select
                            value={modelId}
                            onChange={(e) => setModelId(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3.5 py-2.5 font-bold text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 focus:bg-white dark:bg-dk-surface transition-all"
                        >
                            {activeModels.map(m => (
                                <option key={m.id} value={m.id}>
                                    {m.reference}{m.ofTag ? ` · ${m.ofTag}` : ''} ({m.name})
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Quantity & Downtime row */}
                    <div className="grid grid-cols-2 gap-4">
                        {/* Quantity */}
                        <div className="space-y-1">
                            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-dk-muted">
                                {l.quantity}
                            </label>
                            <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                value={quantity || ''}
                                onChange={(e) => {
                                    setQuantity(Math.max(0, parseInt(e.target.value) || 0));
                                    if (downtime) setDowntime(null); // Clear downtime if quantity entered
                                }}
                                className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3.5 py-2 font-bold text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 focus:bg-white dark:bg-dk-surface transition-all"
                                placeholder="0"
                            />
                        </div>

                        {/* Downtime */}
                        <div className="space-y-1">
                            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-dk-muted">
                                {l.downtimes}
                            </label>
                            <select
                                value={downtime || ''}
                                onChange={(e) => {
                                    const val = e.target.value || null;
                                    setDowntime(val);
                                    if (val) setQuantity(0); // Reset quantity if downtime selected
                                }}
                                className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3.5 py-2 font-bold text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 focus:bg-white dark:bg-dk-surface transition-all"
                            >
                                <option value="">{l.none}</option>
                                <option value="L">{l.lunch}</option>
                                <option value="P">{l.pause}</option>
                                <option value="M">{l.breakdown}</option>
                                <option value="S">{l.rupture}</option>
                            </select>
                        </div>
                    </div>

                    {/* Defects row */}
                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-50 dark:border-dk-border/40">
                        {/* Defects Qty */}
                        <div className="space-y-1">
                            <label className="block text-[10px] font-black uppercase tracking-wider text-rose-500 dark:text-rose-300 font-bold">
                                {l.defects}
                            </label>
                            <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                value={defectsQty || ''}
                                onChange={(e) => setDefectsQty(Math.max(0, parseInt(e.target.value) || 0))}
                                className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3.5 py-2 font-bold text-slate-800 dark:text-dk-text outline-none focus:border-rose-500 focus:bg-white dark:bg-dk-surface transition-all"
                                placeholder="0"
                            />
                        </div>

                        {/* Defect Type */}
                        <div className="space-y-1">
                            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-dk-muted">
                                {l.defectType}
                            </label>
                            <select
                                value={defectType}
                                onChange={(e) => setDefectType(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3.5 py-2 font-bold text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 focus:bg-white dark:bg-dk-surface transition-all"
                            >
                                <option value="Couture">{l.sewing}</option>
                                <option value="Tissu">{l.fabric}</option>
                                <option value="Coupe">{l.cut}</option>
                                <option value="Autre">{l.other}</option>
                            </select>
                        </div>
                    </div>

                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-end gap-2 border-t border-slate-50 dark:border-dk-border/40 px-6 py-4 bg-slate-50 dark:bg-dk-bg/50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 dark:text-dk-muted hover:bg-slate-200 dark:bg-dk-border/50 transition-colors"
                    >
                        {l.close}
                    </button>
                    <button
                        onClick={handleConfirm}
                        className="px-5 py-2 rounded-xl text-xs font-black bg-indigo-600 dark:bg-indigo-700 text-white hover:bg-indigo-700 shadow-sm transition-colors"
                    >
                        {l.save}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Section repliable — sur mobile: header cliquable + contenu fermé par défaut.
// Sur desktop: rendu normal (toujours ouvert, sans toggle).
interface SectionProps {
    title: string;
    isMobile: boolean;
    children: React.ReactNode;
    defaultOpen?: boolean;
    icon?: React.ReactNode;
    badge?: React.ReactNode;
}
function Section({ title, isMobile, children, defaultOpen = false, icon, badge }: SectionProps) {
    const [open, setOpen] = useState<boolean>(defaultOpen);
    if (!isMobile) return <>{children}</>;
    return (
        <div>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border/60 rounded-2xl shadow-sm"
            >
                {icon}
                <span className="text-[13px] font-black text-slate-800 dark:text-dk-text flex-1 truncate">{title}</span>
                {badge}
                <ChevronRight className={`w-4 h-4 text-slate-400 dark:text-dk-muted shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
            </button>
            {open && <div className="mt-1.5 animate-in fade-in duration-200">{children}</div>}
        </div>
    );
}

// Custom Modal to change Planning Status for an active model
interface StatusChangeModalProps {
    isOpen: boolean;
    event: PlanningEvent;
    lang: string;
    onClose: () => void;
    onSave: (newStatus: PlanningStatus) => void;
}

function StatusChangeModal({
    isOpen, event, lang, onClose, onSave
}: StatusChangeModalProps) {
    const [selectedStatus, setSelectedStatus] = useState<PlanningStatus>(event.status as PlanningStatus);

    if (!isOpen) return null;

    const statusesList: { key: PlanningStatus; label: string; color: string }[] = [
        { key: 'READY', label: tx(lang, { fr: 'Prêt', ar: 'جاهز', en: 'Ready', es: 'Listo', pt: 'Pronto', tr: 'Hazır' }), color: '#10B981' },
        { key: 'IN_PROGRESS', label: tx(lang, { fr: 'En cours', ar: 'قيد التنفيذ', en: 'In progress', es: 'En curso', pt: 'Em curso', tr: 'Devam ediyor' }), color: '#3B82F6' },
        { key: 'BLOCKED_STOCK', label: tx(lang, { fr: 'Bloqué stock', ar: 'متوقف بسبب المخزون', en: 'Stock blocked', es: 'Bloqueado por stock', pt: 'Bloqueado por stock', tr: 'Stok nedeniyle bloke' }), color: '#EF4444' },
        { key: 'EXTERNAL_PROCESS', label: tx(lang, { fr: 'Proc. Externe', ar: 'معالجة خارجية', en: 'External process', es: 'Proceso externo', pt: 'Processo externo', tr: 'Harici süreç' }), color: '#F59E0B' },
        { key: 'DONE', label: tx(lang, { fr: 'Terminé', ar: 'منتهٍ', en: 'Done', es: 'Terminado', pt: 'Concluído', tr: 'Tamamlandı' }), color: '#6B7280' },
    ];

    const title = tx(lang, { fr: 'CHANGER LE STATUT', ar: 'تغيير الحالة', en: 'CHANGE STATUS', es: 'CAMBIAR ESTADO', pt: 'ALTERAR ESTADO', tr: 'DURUMU DEĞİŞTİR' });
    const confirmLabel = tx(lang, { fr: 'Confirmer', ar: 'تأكيد', en: 'Confirm', es: 'Confirmar', pt: 'Confirmar', tr: 'Onayla' });
    const cancelLabel = tx(lang, { fr: 'Annuler', ar: 'إلغاء', en: 'Cancel', es: 'Cancelar', pt: 'Cancelar', tr: 'İptal' });

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-dk-surface rounded-3xl max-w-sm w-full shadow-2xl overflow-hidden border border-slate-100 dark:border-dk-border/60 animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50 dark:border-dk-border/40 bg-slate-50 dark:bg-dk-bg/50">
                    <div>
                        <h3 className="text-sm font-black text-slate-800 dark:text-dk-text tracking-tight uppercase">
                            {title}
                        </h3>
                        <p className="text-[10px] text-slate-400 dark:text-dk-muted font-bold uppercase mt-0.5 mt-1">
                            {event.modelName || 'Modèle'} {event.qteTotal ? `· ${event.qteTotal} pcs` : ''}
                        </p>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="p-1.5 rounded-lg text-slate-400 dark:text-dk-muted hover:text-slate-600 dark:text-dk-text-soft hover:bg-slate-100 dark:bg-dk-elevated/60 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                        {statusesList.map(s => {
                            const isSelected = selectedStatus === s.key;
                            return (
                                <button
                                    key={s.key}
                                    type="button"
                                    onClick={() => setSelectedStatus(s.key)}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-xs transition-all text-left ${
                                        isSelected 
                                            ? 'bg-slate-950 dark:bg-dk-bg text-white shadow-md scale-[1.01]' 
                                            : 'bg-slate-50 dark:bg-dk-bg hover:bg-slate-100 dark:bg-dk-elevated/60 text-slate-700 dark:text-dk-text border border-slate-100 dark:border-dk-border/60/80'
                                    }`}
                                >
                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: isSelected ? '#E2E8F0' : s.color }} />
                                    <span>{s.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-50 dark:border-dk-border/40 bg-slate-50 dark:bg-dk-bg/30 flex justify-end gap-2 text-xs">
                    <button 
                        type="button" 
                        onClick={onClose} 
                        className="rounded-xl px-4 py-2 font-bold text-slate-500 dark:text-dk-muted hover:bg-slate-100 dark:bg-dk-elevated/60 transition-colors"
                    >
                        {cancelLabel}
                    </button>
                    <button 
                        type="button" 
                        onClick={() => onSave(selectedStatus)} 
                        className="rounded-xl bg-[#2149C1] hover:bg-[#1a3ba5] text-white px-5 py-2 font-black shadow-sm transition-colors"
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
