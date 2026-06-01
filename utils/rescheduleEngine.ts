import type { AppSettings, PlanningEvent, SuiviData } from '../types';
import { parsePlanningDateAtNoon, planningLocalDateKey, isPlanningWorkingDay, getWorkMinutesPerDay, addWorkingDaysFromLaunchIso } from './planning';
import { computeCriticalRatio, countWorkingDaysBetween } from './criticalRatio';
import type { CriticalRatioResult } from './criticalRatio';

// ═══════════════════════════════════════════════════════════════════
// 🔄 محرك إعادة الجدولة (Re-scheduling Engine)
//
// بعد كل إدخال suivi يومي:
// 1. يحسب العجز اليومي (target - actual)
// 2. يراكم العجز عبر الأيام
// 3. يوزع العجز على الأيام المتبقية
// 4. يعيد حساب CR
// 5. إذا CR < 0.8 → يطلق بروتوكول الطوارئ
// ═══════════════════════════════════════════════════════════════════

/** سجل عجز يومي */
export interface DailyDeficit {
    planningId: string;
    date: string;
    /** الهدف اليومي (قطع) */
    target: number;
    /** الإنتاج الفعلي (قطع) */
    actual: number;
    /** العجز اليومي (موجب = تأخر) */
    deficit: number;
    /** العجز المتراكم */
    accumulatedDeficit: number;
    /** CR المحدّث في ذلك اليوم */
    newCR: number;
}

/** إجراء مقترح من محرك إعادة الجدولة */
export interface RescheduleAction {
    type: 'EXTEND_END_DATE' | 'INCREASE_DAILY_TARGET' | 'TRIGGER_CRISIS';
    planningId: string;
    details: {
        oldEndDate?: string;
        newEndDate?: string;
        dailyTargetIncrease?: number;
        deficitPieces?: number;
        crisisLevel?: 'OVERTIME' | 'LOAD_BALANCE' | 'OUTSOURCE';
    };
}

/** نتيجة إعادة الجدولة الشاملة */
export interface RescheduleResult {
    /** تفاصيل العجز يوماً بيوم */
    deficits: DailyDeficit[];
    /** إجمالي العجز المتراكم (قطع) */
    totalAccumulatedDeficit: number;
    /** الإجراءات المقترحة */
    actions: RescheduleAction[];
    /** CR المحدّث */
    updatedCR: CriticalRatioResult;
}

/**
 * يحسب الهدف اليومي الموزع على الأيام المتبقية.
 * 
 * @param qteTotal — الكمية الإجمالية
 * @param qteProduite — الكمية المنتجة
 * @param daysRemaining — الأيام المتبقية
 */
export function computeDailyTarget(
    qteTotal: number,
    qteProduite: number,
    daysRemaining: number
): number {
    const remaining = Math.max(0, qteTotal - (qteProduite || 0));
    if (remaining === 0) return 0;
    return Math.ceil(remaining / Math.max(1, daysRemaining));
}

/**
 * يوزع العجز المتراكم على الأيام المتبقية.
 * 
 * @param deficit — العجز المتراكم (قطع)
 * @param daysRemaining — الأيام المتبقية
 * @param baseTarget — الهدف اليومي الأصلي
 * @returns الهدف اليومي الجديد بعد التوزيع
 */
export function spreadDeficit(
    deficit: number,
    daysRemaining: number,
    baseTarget: number
): number {
    if (daysRemaining <= 0) return baseTarget + deficit;
    return Math.ceil((deficit + baseTarget * daysRemaining) / Math.max(1, daysRemaining));
}

/**
 * يجمع الإنتاج الفعلي من الساعات (sorties hourly).
 */
function sumSuiviOutput(s: SuiviData): number {
    if (typeof s.totalHeure === 'number' && s.totalHeure > 0) return s.totalHeure;
    return Object.values(s.sorties || {}).reduce<number>(
        (acc, v) => acc + (Number(v) || 0), 0
    );
}

/**
 * المحرك الرئيسي لإعادة الجدولة.
 * 
 * يحلل الـ suivi اليومي ويحسب العجز المتراكم ثم يقترح إجراءات.
 * 
 * @param event — أمر التصنيع (OF)
 * @param suivis — بيانات الـ suivi اليومية لهذا الـ OF
 * @param todayYmd — تاريخ اليوم
 * @param settings — إعدادات التطبيق
 * @param modelSAM — SAM بالدقائق
 * @param chainOperators — عدد العمال في الخط
 * @param chainEfficiency — كفاءة الخط
 * @param activityRate — معامل النشاط Q
 */
export function computeReschedule(
    event: PlanningEvent,
    suivis: SuiviData[],
    todayYmd: string,
    settings: AppSettings,
    modelSAM: number,
    chainOperators: number,
    chainEfficiency: number,
    activityRate: number
): RescheduleResult {
    const dds = event.strictDeadline_DDS || event.dateExport;
    const workMin = getWorkMinutesPerDay(settings);

    // ترتيب الـ suivi حسب التاريخ
    const sortedSuivis = [...suivis]
        .filter(s => s.planningId === event.id)
        .sort((a, b) => a.date.localeCompare(b.date));

    // حساب الهدف اليومي الأصلي
    const totalDaysForOF = countWorkingDaysBetween(
        event.dateLancement, dds, settings
    );

    const deficits: DailyDeficit[] = [];
    let accumulated = 0;
    let totalProduced = event.qteProduite || 0;

    // إعادة حساب الإنتاج من الـ suivi إذا متاح
    if (sortedSuivis.length > 0) {
        totalProduced = 0;
        for (const s of sortedSuivis) {
            const actual = sumSuiviOutput(s);
            totalProduced += actual;

            // الهدف اليومي = ما تبقى / الأيام المتبقية (في ذلك اليوم)
            const daysRem = countWorkingDaysBetween(s.date, dds, settings);
            const remainingAtDay = Math.max(0, event.qteTotal - (totalProduced - actual));
            const dailyTarget = computeDailyTarget(event.qteTotal, totalProduced - actual, daysRem + 1);

            const deficit = dailyTarget - actual;
            accumulated += Math.max(0, deficit);

            // CR لذلك اليوم
            const crAtDay = computeCriticalRatio(
                s.date, dds, event.qteTotal, totalProduced,
                modelSAM, chainOperators, workMin, chainEfficiency, activityRate, settings
            );

            deficits.push({
                planningId: event.id,
                date: s.date,
                target: dailyTarget,
                actual,
                deficit,
                accumulatedDeficit: accumulated,
                newCR: crAtDay.cr,
            });
        }
    }

    // CR المحدّث (اليوم)
    const updatedCR = computeCriticalRatio(
        todayYmd, dds, event.qteTotal, totalProduced,
        modelSAM, chainOperators, workMin, chainEfficiency, activityRate, settings
    );

    // ──── الإجراءات المقترحة ────

    const actions: RescheduleAction[] = [];
    const daysRemaining = countWorkingDaysBetween(todayYmd, dds, settings);

    if (accumulated > 0 && updatedCR.status !== 'AHEAD') {
        // يلا كان العجز ممكن يتغطى بتمديد يوم أو يومين
        if (updatedCR.cr >= 0.8 && accumulated <= updatedCR.dailyCapacity * 2) {
            const extraDays = Math.ceil(accumulated / Math.max(1, updatedCR.dailyCapacity));
            const newEnd = addWorkingDaysFromLaunchIso(dds, extraDays, settings);
            actions.push({
                type: 'EXTEND_END_DATE',
                planningId: event.id,
                details: {
                    oldEndDate: dds,
                    newEndDate: planningLocalDateKey(newEnd),
                    deficitPieces: accumulated,
                },
            });
        }

        // يلا كان CR بين 0.8 و 1.0 → زيادة الهدف اليومي
        if (updatedCR.cr >= 0.8 && updatedCR.cr < 1.0) {
            const baseTarget = computeDailyTarget(event.qteTotal, totalProduced, daysRemaining);
            const newTarget = spreadDeficit(accumulated, daysRemaining, baseTarget);
            actions.push({
                type: 'INCREASE_DAILY_TARGET',
                planningId: event.id,
                details: {
                    dailyTargetIncrease: newTarget - baseTarget,
                    deficitPieces: accumulated,
                },
            });
        }

        // يلا كان CR < 0.8 → بروتوكول الطوارئ
        if (updatedCR.cr < 0.8) {
            // تحديد مستوى الأزمة
            let crisisLevel: 'OVERTIME' | 'LOAD_BALANCE' | 'OUTSOURCE';
            if (accumulated <= updatedCR.dailyCapacity * 3) {
                crisisLevel = 'OVERTIME';
            } else if (accumulated <= updatedCR.dailyCapacity * 7) {
                crisisLevel = 'LOAD_BALANCE';
            } else {
                crisisLevel = 'OUTSOURCE';
            }

            actions.push({
                type: 'TRIGGER_CRISIS',
                planningId: event.id,
                details: {
                    deficitPieces: accumulated,
                    crisisLevel,
                },
            });
        }
    }

    return {
        deficits: deficits.reverse(), // الأحدث أولاً
        totalAccumulatedDeficit: accumulated,
        actions,
        updatedCR,
    };
}
