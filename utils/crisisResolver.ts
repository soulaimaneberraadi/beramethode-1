import type { AppSettings, PlanningEvent, ModelData } from '../types';
import { addWorkingDays, parsePlanningDateAtNoon, planningLocalDateKey } from './planning';
import type { CRStatus } from './criticalRatio';

// ═══════════════════════════════════════════════════════════════════
// 🛠️ بروتوكول الطوارئ (Crisis Resolver)
//
// سلم القرارات الذكي — 3 مستويات تصاعدية:
//
//   1️⃣  Overtime      — ساعات إضافية (أقل تكلفة)
//   2️⃣  Load Balance  — فتح خطوط دعم داخلية
//   3️⃣  Outsource     — مناولة خارجية (أعلى تكلفة)
//
// كل مستوى كيتحسب بالتكلفة التقديرية باش المدير
// ياخد القرار التجاري الأنسب.
// ═══════════════════════════════════════════════════════════════════

/** تفاصيل اقتراح الساعات الإضافية */
export interface OvertimeDetails {
    chainId: string;
    /** ساعات إضافية مطلوبة إجمالاً */
    requiredHours: number;
    /** أيام عمل إضافية (max 2h/يوم) */
    requiredDays: number;
    /** قطع إضافية متوقعة */
    additionalPieces: number;
    /** تكلفة تقديرية (MAD) */
    costEstimate?: number;
    /** الصيغة المستخدمة */
    formula: string;
}

/** تفاصيل اقتراح توزيع الحمل بين الخطوط */
export interface LoadBalanceDetails {
    sourceChainId: string;
    targetChainId: string;
    targetChainName?: string;
    /** قطع مقترح تحويلها */
    piecesToTransfer: number;
    /** هل الماكينات متوافقة */
    machineCompatible: boolean;
    /** تاريخ فراغ الخط المستهدف */
    targetChainFreeDate?: string;
}

/** تفاصيل اقتراح المناولة الخارجية */
export interface OutsourceDetails {
    /** عدد القطع للتصنيع الخارجي */
    quantity: number;
    /** تاريخ التسليم المقترح (DDS - buffer) */
    suggestedDeliveryDate: string;
    /** هامش اللوجيستيك (أيام) */
    bufferDays: number;
    /** تكلفة لكل قطعة (MAD) */
    estimatedCostPerPiece?: number;
    /** مقارنة Overtime vs Outsource */
    comparisonWithOvertime?: {
        overtimeTotalCost: number;
        outsourceTotalCost: number;
        recommendation: 'OVERTIME' | 'OUTSOURCE';
    };
}

/** اقتراح حل لأزمة الإنتاج */
export interface CrisisProposal {
    /** مستوى التصعيد (1=Overtime, 2=Load Balance, 3=Outsource) */
    level: 1 | 2 | 3;
    type: 'OVERTIME' | 'LOAD_BALANCE' | 'OUTSOURCE';
    /** وصف بالفرنسية للمدير */
    description_fr: string;
    /** تكلفة تقديرية إجمالية */
    estimatedCost?: number;
    details: OvertimeDetails | LoadBalanceDetails | OutsourceDetails;
}

// ─────────────────────────────────────────────────────────────

/**
 * الحل 1 — الساعات الإضافية (Overtime).
 * 
 * Required_Hours = (Deficit × SAM) / (Operators × Q × 60)
 * Required_Days = ceil(hours / 2) — max 2h overtime/jour
 * 
 * @param deficitPieces — عدد القطع الناقصة
 * @param samMinutes — SAM بالدقائق
 * @param operators — عدد العمال
 * @param activityRate — معامل Q
 * @param chainId — معرف الخط
 * @param overtimeCostPerHour — تكلفة الساعة الإضافية (MAD)
 */
export function proposeOvertime(
    deficitPieces: number,
    samMinutes: number,
    operators: number,
    activityRate: number,
    chainId: string,
    overtimeCostPerHour?: number
): CrisisProposal {
    const effectiveOperators = Math.max(1, operators);
    const effectiveQ = Math.max(0.5, activityRate);

    // ساعات مطلوبة = (عجز × SAM) / (عمال × Q × 60)
    const requiredHours = (deficitPieces * samMinutes) / (effectiveOperators * effectiveQ * 60);
    const roundedHours = Math.ceil(requiredHours * 10) / 10;

    // أيام = hours / 2 (max 2h overtime/jour)
    const requiredDays = Math.ceil(roundedHours / 2);

    // قطع إضافية ممكنة
    const additionalPieces = deficitPieces;

    // تكلفة
    const costEstimate = overtimeCostPerHour
        ? Math.round(roundedHours * effectiveOperators * overtimeCostPerHour)
        : undefined;

    const formula = `(${deficitPieces} × ${samMinutes}min) / (${effectiveOperators} × ${effectiveQ} × 60) = ${roundedHours}h`;

    return {
        level: 1,
        type: 'OVERTIME',
        description_fr: `Ajouter ${roundedHours}h d'heures supplémentaires sur ${requiredDays} jour(s) pour la chaîne ${chainId}. Production supplémentaire estimée : ${additionalPieces} pièces.${costEstimate ? ` Coût estimé : ${costEstimate} MAD.` : ''}`,
        estimatedCost: costEstimate,
        details: {
            chainId,
            requiredHours: roundedHours,
            requiredDays,
            additionalPieces,
            costEstimate,
            formula,
        } as OvertimeDetails,
    };
}

/**
 * الحل 2 — فتح خطوط دعم (Load Balancing).
 * 
 * يبحث عن خط بـ CR > 1.3 (AHEAD) ومتوافق بالماكينات.
 * 
 * @param deficitPieces — عجز القطع
 * @param sourceChainId — الخط المتأخر
 * @param allEvents — كل الـ OFs
 * @param chainCRs — CR لكل خط (أعلى CR = أكثر فراغاً)
 * @param chainMachines — ماكينات كل خط
 * @param requiredMachineClasses — الماكينات المطلوبة للموديل
 * @param chainNames — أسماء الخطوط (اختياري)
 */
export function proposeLoadBalance(
    deficitPieces: number,
    sourceChainId: string,
    chainCRs: Record<string, number>,
    chainMachines: Record<string, string[]>,
    requiredMachineClasses: string[],
    chainNames?: Record<string, string>
): CrisisProposal | null {
    // البحث عن خط متاح ومتوافق
    let bestChain: string | null = null;
    let bestCR = 0;

    for (const [chainId, cr] of Object.entries(chainCRs)) {
        if (chainId === sourceChainId) continue;
        if (cr <= 1.3) continue; // يجب أن يكون AHEAD

        // فحص توافق الماكينات
        const chainMachineList = chainMachines[chainId] || [];
        const compatible = requiredMachineClasses.length === 0 ||
            requiredMachineClasses.every(cls =>
                chainMachineList.some(m => m.toLowerCase().includes(cls.toLowerCase()))
            );

        if (compatible && cr > bestCR) {
            bestCR = cr;
            bestChain = chainId;
        }
    }

    if (!bestChain) return null;

    const targetName = chainNames?.[bestChain] || bestChain;
    const piecesToTransfer = Math.ceil(deficitPieces / 2); // نقسم العجز على 2

    return {
        level: 2,
        type: 'LOAD_BALANCE',
        description_fr: `Transférer ${piecesToTransfer} pièces vers ${targetName} (CR=${bestCR.toFixed(2)}, machines compatibles). La chaîne ${targetName} a de la capacité disponible.`,
        details: {
            sourceChainId,
            targetChainId: bestChain,
            targetChainName: targetName,
            piecesToTransfer,
            machineCompatible: true,
        } as LoadBalanceDetails,
    };
}

/**
 * الحل 3 — المناولة الخارجية (Outsource / Sous-traitance).
 * 
 * الخط الوهمي = DDS - 2 أيام buffer.
 * يقارن تكلفة الـ Overtime مع تكلفة الـ Outsource.
 */
export function proposeOutsource(
    deficitPieces: number,
    ddsYmd: string,
    settings: AppSettings,
    subcontractCostPerPiece?: number,
    overtimeCostPerHour?: number,
    overtimeHoursNeeded?: number,
    operators?: number
): CrisisProposal {
    const bufferDays = 2;
    const ddsDate = parsePlanningDateAtNoon(ddsYmd);

    // DDS - 2 أيام عمل = تاريخ التسليم المقترح للمناول
    const deliveryDate = new Date(ddsDate);
    let daysToSubtract = bufferDays;
    let safety = 0;
    while (daysToSubtract > 0 && safety < 1000) {
        safety++;
        deliveryDate.setDate(deliveryDate.getDate() - 1);
        if (isPlanningWorkingDay(deliveryDate, settings)) daysToSubtract--;
    }
    const suggestedDeliveryDate = planningLocalDateKey(deliveryDate);

    // مقارنة التكاليف
    let comparison: OutsourceDetails['comparisonWithOvertime'];
    if (subcontractCostPerPiece && overtimeCostPerHour && overtimeHoursNeeded && operators) {
        const overtimeTotalCost = Math.round(overtimeHoursNeeded * operators * overtimeCostPerHour);
        const outsourceTotalCost = Math.round(deficitPieces * subcontractCostPerPiece);
        comparison = {
            overtimeTotalCost,
            outsourceTotalCost,
            recommendation: outsourceTotalCost < overtimeTotalCost ? 'OUTSOURCE' : 'OVERTIME',
        };
    }

    const estimatedCost = subcontractCostPerPiece
        ? Math.round(deficitPieces * subcontractCostPerPiece)
        : undefined;

    return {
        level: 3,
        type: 'OUTSOURCE',
        description_fr: `Sous-traiter ${deficitPieces} pièces. Livraison demandée avant le ${suggestedDeliveryDate} (buffer logistique ${bufferDays}j).${estimatedCost ? ` Coût estimé : ${estimatedCost} MAD.` : ''}${comparison ? ` Recommandation : ${comparison.recommendation === 'OUTSOURCE' ? 'sous-traitance' : 'heures supplémentaires'} (${comparison.recommendation === 'OUTSOURCE' ? comparison.outsourceTotalCost : comparison.overtimeTotalCost} MAD).` : ''}`,
        estimatedCost,
        details: {
            quantity: deficitPieces,
            suggestedDeliveryDate,
            bufferDays,
            estimatedCostPerPiece: subcontractCostPerPiece,
            comparisonWithOvertime: comparison,
        } as OutsourceDetails,
    };
}

// ──── Helper interne ────
function isPlanningWorkingDay(d: Date, settings: AppSettings): boolean {
    const iso = planningLocalDateKey(d);
    const exc = settings.calendarExceptions?.[iso];
    if (exc) return exc.isWorking;
    const dow = d.getDay() === 0 ? 7 : d.getDay();
    const wDays = settings.workingDays && settings.workingDays.length > 0 ? settings.workingDays : [1, 2, 3, 4, 5];
    return wDays.includes(dow);
}

/**
 * المحلل الشامل للأزمات — يعيد قائمة الحلول بالترتيب التصاعدي.
 * 
 * @param deficitPieces — عدد القطع الناقصة
 * @param sourceChainId — الخط المتأخر
 * @param ddsYmd — تاريخ التسليم
 * @param chainCRs — CR لكل خط
 * @param chainMachines — ماكينات كل خط
 * @param requiredMachineClasses — ماكينات الموديل
 * @param samMinutes — SAM بالدقائق
 * @param operators — عدد العمال
 * @param activityRate — Q
 * @param settings — إعدادات التطبيق
 * @param costs — تكاليف (اختياري)
 */
export function resolveCrisis(
    deficitPieces: number,
    sourceChainId: string,
    ddsYmd: string,
    chainCRs: Record<string, number>,
    chainMachines: Record<string, string[]>,
    requiredMachineClasses: string[],
    samMinutes: number,
    operators: number,
    activityRate: number,
    settings: AppSettings,
    costs?: {
        overtimePerHour?: number;
        subcontractPerPiece?: number;
    },
    chainNames?: Record<string, string>
): CrisisProposal[] {
    const proposals: CrisisProposal[] = [];

    // 1️⃣ Overtime
    const overtime = proposeOvertime(
        deficitPieces, samMinutes, operators, activityRate,
        sourceChainId, costs?.overtimePerHour
    );
    proposals.push(overtime);

    // 2️⃣ Load Balance (nullable)
    const loadBalance = proposeLoadBalance(
        deficitPieces, sourceChainId, chainCRs,
        chainMachines, requiredMachineClasses, chainNames
    );
    if (loadBalance) proposals.push(loadBalance);

    // 3️⃣ Outsource
    const outsource = proposeOutsource(
        deficitPieces, ddsYmd, settings,
        costs?.subcontractPerPiece,
        costs?.overtimePerHour,
        (overtime.details as OvertimeDetails).requiredHours,
        operators
    );
    proposals.push(outsource);

    return proposals;
}
