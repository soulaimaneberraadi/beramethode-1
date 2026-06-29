import React, { useState, useMemo } from 'react';
import { ShieldCheck, ShieldAlert, ChevronDown, ChevronUp, Check, AlertTriangle, Info } from 'lucide-react';
import { Material, PurchasingData, FicheData, AppSettings } from '../types';
import { fmt } from '../constants';
import { useLang } from '../src/context/LanguageContext';
import { useIsDark } from '../src/context/ThemeContext';
import { tx } from '../lib/i18n';

interface CostSanityCheckProps {
    currency: string;
    isExport: boolean;
    materials: Material[];
    totalMaterials: number;
    laborCost: number;
    costPrice: number;
    purchasingData: PurchasingData[];
    totalPurchasingMatCost: number;
    commandeQty: number;
    ficheData: FicheData;
    settings: AppSettings;
}

type CheckStatus = 'ok' | 'warn' | 'info';
interface CheckRow {
    status: CheckStatus;
    label: string;
    detail: string;
}

const STALE_THREAD = 20000;
const ABSURD_BUY = 500000;

const CostSanityCheck: React.FC<CostSanityCheckProps> = ({
    currency, isExport, materials, totalMaterials, laborCost, costPrice,
    purchasingData, totalPurchasingMatCost, commandeQty, ficheData, settings,
}) => {
    const { lang } = useLang();
    const isDark = useIsDark();
    const checks = useMemo<CheckRow[]>(() => {
        const rows: CheckRow[] = [];

        const expectedPR = isExport ? laborCost : totalMaterials + laborCost;
        rows.push({
            status: Math.abs(costPrice - expectedPR) < 0.01 ? 'ok' : 'warn',
            label: tx(lang, {fr:'Prix de Revient = Matières + Main d\'œuvre', ar:'سعر التكلفة = المواد + الأجور', en:'Cost price = Materials + Labor', es:'Precio de costo = Materiales + Mano de obra', pt:'Preço de custo = Materiais + Mão de obra', tr:'Maliyet fiyatı = Malzemeler + İşçilik'}),
            detail: `${fmt(costPrice)} = ${fmt(totalMaterials)} + ${fmt(laborCost)} ${currency}`,
        });

        rows.push({
            status: settings.costMinute > 0 ? 'ok' : 'warn',
            label: tx(lang, {fr:'Coût Minute défini', ar:'تكلفة الدقيقة محددة', en:'Cost per minute defined', es:'Costo minuto definido', pt:'Custo minuto definido', tr:'Dakika maliyeti tanımlı'}),
            detail: settings.costMinute > 0 ? `${fmt(settings.costMinute)} ${currency}/min` : tx(lang, {fr:'Coût Minute = 0 → main d\'œuvre nulle', ar:'تكلفة الدقيقة = 0 → أجور معدومة', en:'Cost per minute = 0 → zero labor cost', es:'Costo minuto = 0 → mano de obra nula', pt:'Custo minuto = 0 → mão de obra nula', tr:'Dakika maliyeti = 0 → işçilik maliyeti sıfır'}),
        });

        const staleThread = materials.filter(m => m.unit === 'bobine' && m.threadMeters > STALE_THREAD);
        rows.push({
            status: staleThread.length === 0 ? 'ok' : 'warn',
            label: tx(lang, {fr:'Consommation de fil réaliste (par pièce)', ar:'استهلاك الخيط واقعي (لكل قطعة)', en:'Realistic thread consumption (per piece)', es:'Consumo de hilo realista (por pieza)', pt:'Consumo de linha realista (por peça)', tr:'Gerçekçi iplik tüketimi (parça başına)'}),
            detail: staleThread.length === 0
                ? tx(lang, {fr:'Tous les fils ≤ 20000 m/pièce', ar:'جميع الخيوط ≤ 20000 م/قطعة', en:'All threads ≤ 20000 m/piece', es:'Todos los hilos ≤ 20000 m/pieza', pt:'Todos os fios ≤ 20000 m/peça', tr:'Tüm iplikler ≤ 20000 m/parça'})
                : `${staleThread.length} ${tx(lang, {fr:'fil(s) aberrant(s) (ex:', ar:'خيط/خيوط شاذة (مثال:', en:'aberrant thread(s) (e.g.', es:'hilo(s) aberrantes (ej:', pt:'fio(s) aberrante(s) (ex:', tr:'anormal iplik(ler) (örn:'})} ${staleThread[0].name} = ${fmt(staleThread[0].threadMeters)} m) → ${tx(lang, {fr:'relancez Calcul Fil', ar:'أعد تشغيل حساب الخيط', en:'rerun Thread Calculation', es:'vuelva a ejecutar Cálculo de Hilo', pt:'recalcule o Fio', tr:'İplik Hesaplamayı yeniden çalıştırın'})}`,
        });

        const zeroPrice = materials.filter(m => (m.name || '').trim() !== '' && m.unitPrice <= 0);
        rows.push({
            status: isExport || zeroPrice.length === 0 ? 'ok' : 'warn',
            label: tx(lang, {fr:'Prix des matières renseignés', ar:'أسعار المواد مدخلة', en:'Material prices entered', es:'Precios de materiales informados', pt:'Preços dos materiais informados', tr:'Malzeme fiyatları girilmiş'}),
            detail: isExport
                ? tx(lang, {fr:'Marché Export — matières fournies', ar:'سوق التصدير — المواد موفرة', en:'Export market — materials supplied', es:'Mercado Exportación — materiales suministrados', pt:'Mercado Exportação — materiais fornecidos', tr:'İhracat pazarı — malzemeler tedarik edilmiş'})
                : zeroPrice.length === 0 ? tx(lang, {fr:'Toutes les matières ont un prix', ar:'جميع المواد لها سعر', en:'All materials have a price', es:'Todos los materiales tienen precio', pt:'Todos os materiais têm preço', tr:'Tüm malzemelerin fiyatı var'}) : `${zeroPrice.length} ${tx(lang, {fr:'matière(s) à prix 0 (ex:', ar:'مادة/مواد بسعر 0 (مثال:', en:'material(s) at price 0 (e.g.', es:'material(es) a precio 0 (ej:', pt:'material(is) com preço 0 (ex:', tr:'fiyatı 0 olan malzeme(ler) (örn:'})} ${zeroPrice[0].name})`,
        });

        const sizeCount = (ficheData.sizes || []).length;
        const gq = ficheData.gridQuantities || {};
        const seen = new Set<string>();
        let gridSum = 0;
        (ficheData.colors || []).forEach(c => {
            if (seen.has(c.id)) return;
            seen.add(c.id);
            for (let s = 0; s < sizeCount; s++) gridSum += Number(gq[`${c.id}_${s}`] || 0);
        });
        const qtyMatches = gridSum === 0 || !ficheData.quantity || ficheData.quantity === gridSum;
        rows.push({
            status: qtyMatches ? 'ok' : 'warn',
            label: tx(lang, {fr:'Quantité = somme de la grille', ar:'الكمية = مجموع الجدول', en:'Quantity = grid sum', es:'Cantidad = suma de la cuadrícula', pt:'Quantidade = soma da grade', tr:'Miktar = tablo toplamı'}),
            detail: qtyMatches
                ? `${gridSum || ficheData.quantity || 0} ${tx(lang, {fr:'pièces', ar:'قطعة', en:'pcs', es:'piezas', pt:'peças', tr:'adet'})}`
                : `${tx(lang, {fr:'Modèle', ar:'النموذج', en:'Model', es:'Modelo', pt:'Modelo', tr:'Model'})}: ${ficheData.quantity} ≠ ${tx(lang, {fr:'grille', ar:'الجدول', en:'grid', es:'cuadrícula', pt:'grade', tr:'tablo'})}: ${gridSum} (${tx(lang, {fr:'couleur en double ?', ar:'لون مكرر؟', en:'duplicate color?', es:'¿color duplicado?', pt:'cor duplicada?', tr:'yinelenen renk?'})})`,
        });

        const ids = (ficheData.colors || []).map(c => c.id);
        const dup = ids.length - new Set(ids).size;
        rows.push({
            status: dup === 0 ? 'ok' : 'warn',
            label: tx(lang, {fr:'Couleurs sans doublon', ar:'الألوان بدون تكرار', en:'Colors without duplicates', es:'Colores sin duplicados', pt:'Cores sem duplicatas', tr:'Tekrarsız renkler'}),
            detail: dup === 0 ? `${ids.length} ${tx(lang, {fr:'couleur(s)', ar:'لون/ألوان', en:'color(s)', es:'color(es)', pt:'cor(es)', tr:'renk(ler)'})}` : `${dup} ${tx(lang, {fr:'couleur(s) en double → quantités gonflées', ar:'لون/ألوان مكررة → كميات مضخمة', en:'duplicate color(s) → inflated quantities', es:'color(es) duplicado(s) → cantidades infladas', pt:'cor(es) duplicada(s) → quantidades infladas', tr:'yinelenen renk(ler) → şişirilmiş miktarlar'})}`,
        });

        const absurd = purchasingData.filter(m => m.qtyToBuy > ABSURD_BUY);
        rows.push({
            status: absurd.length === 0 ? 'ok' : 'warn',
            label: tx(lang, {fr:'Quantités d\'achat réalistes', ar:'كميات الشراء واقعية', en:'Realistic purchase quantities', es:'Cantidades de compra realistas', pt:'Quantidades de compra realistas', tr:'Gerçekçi satın alma miktarları'}),
            detail: absurd.length === 0
                ? tx(lang, {fr:'Aucun besoin aberrant', ar:'لا توجد حاجة شاذة', en:'No aberrant requirement', es:'Ninguna necesidad aberrante', pt:'Nenhuma necessidade aberrante', tr:'Anormal ihtiyaç yok'})
                : `${absurd.length} ${tx(lang, {fr:'matière(s) >', ar:'مادة/مواد >', en:'material(s) >', es:'material(es) >', pt:'material(is) >', tr:'malzeme(ler) >'})} ${fmt(ABSURD_BUY)} (${tx(lang, {fr:'ex:', ar:'مثال:', en:'e.g.', es:'ej:', pt:'ex:', tr:'örn:'})} ${absurd[0].name} = ${fmt(absurd[0].qtyToBuy)})`,
        });

        const sumLine = purchasingData.reduce((a, m) => a + m.lineCost, 0);
        rows.push({
            status: Math.abs(totalPurchasingMatCost - sumLine) < 0.5 ? 'ok' : 'warn',
            label: tx(lang, {fr:'Budget Matière = Σ(achat × prix)', ar:'ميزانية المواد = Σ(شراء × سعر)', en:'Material budget = Σ(purchase × price)', es:'Presupuesto de materiales = Σ(compra × precio)', pt:'Orçamento de materiais = Σ(compra × preço)', tr:'Malzeme bütçesi = Σ(satın alma × fiyat)'}),
            detail: `${fmt(totalPurchasingMatCost)} ${currency} ${tx(lang, {fr:'sur', ar:'على', en:'on', es:'sobre', pt:'em', tr:'üzerinden'})} ${commandeQty} ${tx(lang, {fr:'pièces', ar:'قطعة', en:'pcs', es:'piezas', pt:'peças', tr:'adet'})}`,
        });

        return rows;
    }, [currency, isExport, materials, totalMaterials, laborCost, costPrice, purchasingData, totalPurchasingMatCost, commandeQty, ficheData, settings, lang]);

    const warnings = checks.filter(c => c.status === 'warn').length;
    const allOk = warnings === 0;
    const [open, setOpen] = useState(false);

    return (
        <div className={`rounded-lg border overflow-hidden ${allOk ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-900/40' : 'border-amber-300 bg-amber-50 dark:bg-amber-900/50'}`}>
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full px-4 h-11 flex items-center justify-between"
            >
                <div className="flex items-center gap-2">
                    {allOk
                        ? <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" strokeWidth={2} />
                        : <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400" strokeWidth={2} />}
                    <span className={`text-[13px] font-semibold ${allOk ? 'text-emerald-800' : 'text-amber-800'}`}>
                        {allOk ? tx(lang, {fr:'Vérification : tous les calculs sont cohérents', ar:'التحقق: جميع الحسابات متسقة', en:'Verification: all calculations are consistent', es:'Verificación: todos los cálculos son coherentes', pt:'Verificação: todos os cálculos são consistentes', tr:'Doğrulama: tüm hesaplamalar tutarlı'}) : tx(lang, {fr:`Vérification : ${warnings} point(s) à corriger`, ar:`التحقق: ${warnings} نقطة/نقاط للتصحيح`, en:`Verification: ${warnings} point(s) to fix`, es:`Verificación: ${warnings} punto(s) a corregir`, pt:`Verificação: ${warnings} ponto(s) a corrigir`, tr:`Doğrulama: ${warnings} düzeltilecek nokta`})}
                    </span>
                </div>
                {open ? <ChevronUp className="w-4 h-4 text-slate-400 dark:text-dk-muted" /> : <ChevronDown className="w-4 h-4 text-slate-400 dark:text-dk-muted" />}
            </button>

            {open && (
                <div className={`px-3 pb-3 pt-1 space-y-1 border-t ${isDark ? 'bg-dk-bg/60 border-dk-border' : 'bg-white dark:bg-dk-surface/60 border-slate-200 dark:border-dk-border/60'}`}>
                    {checks.map((c, i) => (
                        <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded-md">
                            <span className="mt-0.5 shrink-0">
                                {c.status === 'ok' && <Check className="w-3.5 h-3.5 text-emerald-500" strokeWidth={2.5} />}
                                {c.status === 'warn' && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" strokeWidth={2.5} />}
                                {c.status === 'info' && <Info className="w-3.5 h-3.5 text-slate-400 dark:text-dk-muted" strokeWidth={2.5} />}
                            </span>
                            <div className="min-w-0">
                                <div className={`text-[12px] font-medium ${c.status === 'warn' ? 'text-amber-800' : isDark ? 'text-dk-text' : 'text-slate-700 dark:text-dk-text-soft'}`}>{c.label}</div>
                                <div className={`text-[11px] tabular-nums ${isDark ? 'text-dk-muted' : 'text-slate-500 dark:text-dk-muted'}`}>{c.detail}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default CostSanityCheck;
