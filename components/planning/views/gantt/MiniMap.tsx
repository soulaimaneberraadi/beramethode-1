import React, { useMemo, useRef } from 'react';
import type { PlanningEvent, ModelData } from '../../../../types';
import { evClientName, evEndYmd, evModelName, evStartYmd } from '../../shared/eventAccessors';
import { getClientColor } from '../../shared/clientColors';
import { getModelColor } from '../../shared/modelColors';
import { parsePlanningDateAtNoon, planningLocalDateKey } from '../../../../utils/planning';
import type { PlanningChain } from '../../hooks/usePlanningChains';
import { tx } from '../../../../lib/i18n';
import { useLang } from '../../../../src/context/LanguageContext';

interface Props {
    chains: PlanningChain[];
    events: PlanningEvent[];
    models: ModelData[];
    timelineDates: Date[];
    dayWidth: number;
    scrollLeft: number;
    viewportWidth: number;
    contentWidth: number;
    /** Largeur de la colonne latérale sticky (exclue de la piste temporelle). */
    sidebarWidth?: number;
    onJumpTo: (scrollLeft: number) => void;
}

/** Mini-map en bas du Gantt — vue d'oiseau du planning. */
export default function MiniMap({
    chains, events, models, timelineDates, dayWidth,
    scrollLeft, viewportWidth, contentWidth, sidebarWidth = 0, onJumpTo,
}: Props) {
    const { lang } = useLang();
    const isRtl = lang === 'ar';
    const ref = useRef<HTMLDivElement>(null);
    const MAP_HEIGHT = 36;

    const first = timelineDates[0];
    const dayCount = timelineDates.length || 1;

    // ── Repère unique : la piste temporelle (hors colonne latérale sticky).
    // Tout (barres, ligne du jour, fenêtre) est exprimé en "jours / dayCount".
    const timelineWidth = dayCount * dayWidth;
    // La colonne latérale est sticky : elle masque les `sidebarWidth` premiers px du viewport.
    const visibleTimelinePx = Math.max(0, viewportWidth - sidebarWidth);
    const viewportRatio = timelineWidth > 0 ? visibleTimelinePx / timelineWidth : 1;
    const rawScrollRatio = timelineWidth > 0 ? scrollLeft / timelineWidth : 0;
    const scrollRatio = Math.max(0, Math.min(1 - Math.min(1, viewportRatio), rawScrollRatio));

    const todayKey = planningLocalDateKey(new Date());
    const todayPos = useMemo(() => {
        for (let i = 0; i < timelineDates.length; i++) {
            if (planningLocalDateKey(timelineDates[i]) === todayKey) {
                return (i + 0.5) / dayCount;
            }
        }
        return -1;
    }, [timelineDates, todayKey, dayCount]);

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const baseRatio = x / rect.width;
        const ratio = isRtl ? 1 - baseRatio : baseRatio;
        // centrer la vue sur ce point
        const maxScroll = Math.max(0, contentWidth - viewportWidth);
        const target = ratio * timelineWidth - visibleTimelinePx / 2;
        onJumpTo(Math.max(0, Math.min(maxScroll, target)));
    };

    return (
        <div className="shrink-0 border-t border-slate-100 dark:border-dk-border bg-white dark:bg-dk-surface px-6 py-2">
            <div className="flex items-center gap-3">
                <span className="text-[10px] font-medium text-slate-400 dark:text-dk-muted uppercase tracking-wider shrink-0">
{tx(lang, { fr: "Vue d'ensemble", ar: 'نظرة عامة', en: 'Overview', es: 'Vista general', pt: 'Visão geral', tr: 'Genel bakış' })}
                </span>
                <div
                    ref={ref}
                    onClick={handleClick}
                    className="relative flex-1 bg-slate-50 dark:bg-dk-bg dark:bg-slate-800 rounded-md cursor-pointer overflow-hidden"
                    style={{ height: MAP_HEIGHT }}
                    title={tx(lang, { fr: 'Cliquez pour naviguer', ar: 'انقر للتنقل', en: 'Click to navigate', es: 'Haga clic para navegar', pt: 'Clique para navegar', tr: 'Gezinmek için tıklayın' })}
                >
                    {/* Lignes de chaînes en arrière-plan */}
                    {chains.map((_, i) => (
                        <div
                            key={i}
                            className="absolute left-0 right-0 border-b border-slate-100/50 dark:border-dk-border/30"
                            style={{ top: ((i + 1) / chains.length) * MAP_HEIGHT }}
                        />
                    ))}

                    {/* Barres OF — chacune positionnée selon son timestamp */}
                    {events.map(ev => {
                        const start = evStartYmd(ev);
                        const end = evEndYmd(ev) || start;
                        if (!start || !first) return null;
                        const origin = new Date(first.getFullYear(), first.getMonth(), first.getDate(), 12, 0, 0, 0).getTime();
                        const s = parsePlanningDateAtNoon(start).getTime();
                        const e = parsePlanningDateAtNoon(end).getTime();
                        const startDay = (s - origin) / 86400000;
                        const endDay = (e - origin) / 86400000 + 1; // fin inclusive
                        if (endDay <= 0 || startDay >= dayCount) return null;
                        const clampedStart = Math.max(0, startDay);
                        const clampedEnd = Math.min(dayCount, endDay);
                        const leftRatio = clampedStart / dayCount;
                        const widthRatio = Math.max(0.004, (clampedEnd - clampedStart) / dayCount);

                        const chainIndex = chains.findIndex(c => c.id === ev.chaineId);
                        if (chainIndex === -1) return null;
                        
                        const topRatio = chainIndex / chains.length;
                        const color = getModelColor(ev.modelId || evModelName(ev, models));
                        
                        return (
                            <div
                                key={ev.id}
                                className="absolute rounded-[1px]"
                                style={{
                                    left: isRtl ? 'auto' : `${leftRatio * 100}%`,
                                    right: isRtl ? `${leftRatio * 100}%` : 'auto',
                                    width: `${widthRatio * 100}%`,
                                    top: `${topRatio * 100}%`,
                                    height: `${(1 / chains.length) * MAP_HEIGHT - 1}px`,
                                    background: color,
                                    opacity: 0.7,
                                }}
                            />
                        );
                    })}

                    {/* Ligne aujourd'hui */}
                    {todayPos >= 0 && (
                        <div
                            className="absolute top-0 bottom-0 w-px bg-orange-500"
                            style={{
                                left: isRtl ? 'auto' : `${todayPos * 100}%`,
                                right: isRtl ? `${todayPos * 100}%` : 'auto',
                            }}
                        />
                    )}

                    {/* Viewport indicator */}
                    <div
                        className="absolute top-0 bottom-0 border-2 border-slate-900/70 dark:border-dk-accent/70 rounded-md bg-white/20 dark:bg-dk-accent/20 pointer-events-none"
                        style={{
                            left: isRtl ? 'auto' : `${scrollRatio * 100}%`,
                            right: isRtl ? `${scrollRatio * 100}%` : 'auto',
                            width: `${Math.min(100, viewportRatio * 100)}%`,
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
