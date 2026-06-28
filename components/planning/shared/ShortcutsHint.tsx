import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard } from 'lucide-react';
import { useLang } from '../../../src/context/LanguageContext';
import { tx } from '../../../lib/i18n';

interface ShortcutGroup {
    title: string;
    items: { key: string; label: string }[];
}

function buildShortcutGroups(t: typeof tx, lang: string): ShortcutGroup[] {
    return [
        {
            title: t(lang, {fr:"Actions",ar:"إجراءات",en:"Actions",es:"Acciones",pt:"Ações",tr:"İşlemler"}),
            items: [
                { key: 'N', label: t(lang, {fr:"Nouvel ordre",ar:"أمر جديد",en:"New order",es:"Nueva orden",pt:"Nova ordem",tr:"Yeni emir"}) },
                { key: 'A', label: t(lang, {fr:"Planification automatique",ar:"تخطيط تلقائي",en:"Auto scheduling",es:"Planificación automática",pt:"Planejamento automático",tr:"Otomatik planlama"}) },
                { key: '⌘K', label: t(lang, {fr:"Palette de commandes",ar:"لوحة الأوامر",en:"Command palette",es:"Paleta de comandos",pt:"Paleta de comandos",tr:"Komut paleti"}) },
                { key: '⌘P', label: t(lang, {fr:"Imprimer / Exporter PDF",ar:"طباعة / تصدير PDF",en:"Print / Export PDF",es:"Imprimir / Exportar PDF",pt:"Imprimir / Exportar PDF",tr:"Yazdır / PDF Çıkar"}) },
            ],
        },
        {
            title: t(lang, {fr:"Historique",ar:"السجل",en:"History",es:"Historial",pt:"Histórico",tr:"Geçmiş"}),
            items: [
                { key: '⌘Z', label: t(lang, {fr:"Annuler la dernière action",ar:"تراجع عن آخر إجراء",en:"Undo last action",es:"Deshacer última acción",pt:"Desfazer última ação",tr:"Son işlemi geri al"}) },
                { key: '⌘Y', label: t(lang, {fr:"Rétablir",ar:"إعادة",en:"Redo",es:"Rehacer",pt:"Refazer",tr:"Yinele"}) },
                { key: '⌘⇧Z', label: t(lang, {fr:"Rétablir (alternative)",ar:"إعادة (بديل)",en:"Redo (alternative)",es:"Rehacer (alternativo)",pt:"Refazer (alternativo)",tr:"Yinele (alternatif)"}) },
            ],
        },
        {
            title: t(lang, {fr:"Sélection",ar:"تحديد",en:"Selection",es:"Selección",pt:"Seleção",tr:"Seçim"}),
            items: [
                { key: 'Clic', label: t(lang, {fr:"Sélectionner un OF",ar:"تحديد أمر تصنيع",en:"Select a WO",es:"Seleccionar OF",pt:"Selecionar OF",tr:"İş emri seç"}) },
                { key: '⌘ + Clic', label: t(lang, {fr:"Ajouter / retirer de la sélection",ar:"إضافة / إزالة من التحديد",en:"Add / remove from selection",es:"Añadir / quitar de selección",pt:"Adicionar / remover da seleção",tr:"Seçime ekle / çıkar"}) },
                { key: '⇧ + Clic', label: t(lang, {fr:"Sélectionner une plage",ar:"تحديد نطاق",en:"Select a range",es:"Seleccionar un rango",pt:"Selecionar um intervalo",tr:"Aralık seç"}) },
                { key: 'F', label: t(lang, {fr:"Mode focus sur l'OF sélectionné",ar:"وضع التركيز على أمر التصنيع المحدد",en:"Focus mode on selected WO",es:"Modo enfoque en OF seleccionado",pt:"Modo foco no OF selecionado",tr:"Seçili iş emrine odaklan"}) },
                { key: 'Esc', label: t(lang, {fr:"Tout désélectionner / Fermer",ar:"إلغاء تحديد الكل / إغلاق",en:"Deselect all / Close",es:"Deseleccionar todo / Cerrar",pt:"Desmarcar tudo / Fechar",tr:"Tüm seçimi kaldır / Kapat"}) },
            ],
        },
        {
            title: t(lang, {fr:"Navigation",ar:"التنقل",en:"Navigation",es:"Navegación",pt:"Navegação",tr:"Gezinme"}),
            items: [
                { key: '/', label: t(lang, {fr:"Rechercher un OF",ar:"البحث عن أمر تصنيع",en:"Search for a WO",es:"Buscar un OF",pt:"Procurar um OF",tr:"İş emri ara"}) },
            ],
        },
    ];
}

export default function ShortcutsHint() {
    const { lang } = useLang();
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);
    const groups = useMemo(() => buildShortcutGroups(tx, lang), [lang]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    return (
        <div ref={wrapRef} className="fixed bottom-4 right-4 z-30">
            {open && (
                <div className="absolute bottom-12 right-0 w-80 max-h-[70vh] overflow-y-auto bg-white dark:bg-dk-surface rounded-xl shadow-[0_8px_32px_rgba(15,23,42,0.10)] ring-1 ring-slate-200/60 dark:ring-dk-border p-3 mb-2 animate-[planning-fade-up_140ms_ease-out]">
                    <div className="text-[11px] font-semibold text-slate-900 dark:text-dk-text mb-2 px-1">
                        {tx(lang, {fr:"Raccourcis clavier",ar:"اختصارات لوحة المفاتيح",en:"Keyboard shortcuts",es:"Atajos de teclado",pt:"Atalhos de teclado",tr:"Klavye kısayolları"})}
                    </div>
                    {groups.map(group => (
                        <div key={group.title} className="mb-3 last:mb-0">
                            <div className="text-[9px] font-medium text-slate-400 dark:text-dk-muted uppercase tracking-wider mb-1 px-1">
                                {group.title}
                            </div>
                            <ul className="space-y-0.5">
                                {group.items.map(s => (
                                    <li key={`${group.title}-${s.key}`} className="flex items-center justify-between gap-3 px-1.5 py-1 rounded hover:bg-slate-50 dark:hover:bg-dk-elevated/60">
                                        <span className="text-[12px] text-slate-700 dark:text-dk-text-soft">{s.label}</span>
                                        <kbd className="text-[10px] font-medium text-slate-500 dark:text-dk-muted bg-slate-100 dark:bg-dk-bg border border-slate-200 dark:border-dk-border px-1.5 py-0.5 rounded shrink-0 tabular-nums">
                                            {s.key}
                                        </kbd>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            )}
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className={`w-9 h-9 flex items-center justify-center rounded-full transition-all ${
                    open
                        ? 'bg-slate-900 text-white shadow-[0_4px_16px_rgba(15,23,42,0.20)]'
                        : 'bg-white dark:bg-dk-surface text-slate-500 dark:text-dk-muted hover:text-slate-900 dark:hover:text-dk-text shadow-[0_2px_8px_rgba(15,23,42,0.08)] ring-1 ring-slate-200 dark:ring-dk-border'
                }`}
                title={tx(lang, {fr:"Raccourcis clavier",ar:"اختصارات لوحة المفاتيح",en:"Keyboard shortcuts",es:"Atajos de teclado",pt:"Atalhos de teclado",tr:"Klavye kısayolları"})}
                aria-label="Raccourcis"
            >
                <Keyboard className="w-4 h-4" strokeWidth={1.75} />
            </button>
        </div>
    );
}
