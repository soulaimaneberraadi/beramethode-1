/**
 * جداول استهلاك الخيوط - Thread Consumption Tables
 * المستخرج من دليل تصنيع الملابس
 *
 * القاعدة الأساسية:
 *   استهلاك الخيط (متر) = طول الخياطة (متر) × معامل الاستهلاك حسب نوع النقاط
 *
 *   عدد البوبين المطلوب = إجمالي الاستهلاك (متر) / سعة البوبين (متر)
 */

// ============================================================
// 1. أنواع النقاط ومعاملات الاستهلاك (Conso par unité de couture)
//    المعامل = متر الخيط لكل متر خياطة
// ============================================================

export interface StitchType {
  code: string;
  name: string;
  nameAr: string;
  isoNumber: number;
  threadCount: number;
  consumptionFactor: number;
  observations?: string;
  machineCode?: string;
}

export const STITCH_TYPES: StitchType[] = [
  // --- سلسلة بسيطة / Chaînette ---
  { code: 'CHAINETTE_1F', name: 'Chaînette 1 fil', nameAr: 'سلسلة بسيطة - خيط واحد', isoNumber: 101, threadCount: 1, consumptionFactor: 3.8, machineCode: '101' },
  { code: 'CHAINETTE_2F', name: 'Double point de chaînette', nameAr: 'سلسلة مزدوجة', isoNumber: 401, threadCount: 2, consumptionFactor: 4.8, machineCode: '402' },
  { code: 'CHAINETTE_3F', name: 'Point chaînette à 3 fils', nameAr: 'سلسلة بثلاثة خيوط', isoNumber: 402, threadCount: 3, consumptionFactor: 8.9, observations: 'piqueuse à double point chaînette', machineCode: '402' },
  { code: 'CHAINETTE_SIMPLE', name: 'Point de chaînette simple', nameAr: 'سلسلة بسيطة', isoNumber: 101, threadCount: 1, consumptionFactor: 3.8 },

  // --- نقطة خفية / Point invisible ---
  { code: 'INVISIBLE', name: 'Point invisible 1 fil', nameAr: 'نقطة خفية - خيط واحد', isoNumber: 103, threadCount: 1, consumptionFactor: 4.5 },

  // --- نقطة عقدية / Point noué ---
  { code: 'NOUE', name: 'Point noué', nameAr: 'نقطة عقدية', isoNumber: 301, threadCount: 2, consumptionFactor: 2.8, machineCode: '301' },

  // --- زكزاك عقدية / Zig-zag noué ---
  { code: 'ZIGZAG_5', name: 'Point noué zig zag', nameAr: 'زكزاك عقدية - رمية 5 مم', isoNumber: 304, threadCount: 2, consumptionFactor: 5.3, observations: '2 points zig zag, Jetée 5 mm', machineCode: '304' },
  { code: 'ZIGZAG_8_4', name: 'Point noué zig zag', nameAr: 'زكزاك عقدية - رمية 8 مم (4 نقاط)', isoNumber: 308, threadCount: 2, consumptionFactor: 5.7, observations: '4 points zig zag, Jetée 8 mm', machineCode: '304' },
  { code: 'ZIGZAG_8_6', name: 'Point noué zig zag', nameAr: 'زكزاك عقدية - رمية 8 مم (6 نقاط)', isoNumber: 306, threadCount: 2, consumptionFactor: 7.4, observations: '6 points zig zag, Jetée 8 mm', machineCode: '304' },

  // --- سلسلة مزدوجة زكزاك ---
  { code: 'DOUBLE_CHAINETTE_ZZ_3', name: 'Double point de chaînette zig zag', nameAr: 'سلسلة مزدوجة زكزاك - رمية 3 مم', isoNumber: 404, threadCount: 2, consumptionFactor: 7.0, observations: 'jetée 3 mm', machineCode: '402' },
  { code: 'DOUBLE_CHAINETTE_ZZ_5', name: 'Double point de chaînette zig zag', nameAr: 'سلسلة مزدوجة زكزاك - رمية 5 مم', isoNumber: 404, threadCount: 2, consumptionFactor: 9.7, observations: 'jetée 5 mm', machineCode: '402' },

  // --- تغطية / Recouvrement ---
  { code: 'RECOUV_2AIG_3', name: 'Couture recouvrement 2 aig', nameAr: 'تغطية بابزرين - رمية 3 مم', isoNumber: 406, threadCount: 3, consumptionFactor: 11.9, observations: '1 fil recouv. Inférieur jetée 3 mm', machineCode: '256' },
  { code: 'RECOUV_2AIG_6', name: 'Couture recouvrement 2 aig', nameAr: 'تغطية بابزرين - رمية 6 مم', isoNumber: 406, threadCount: 3, consumptionFactor: 9.7, observations: '1 fil recouv. Inférieur jetée 6 mm', machineCode: '256' },
  { code: 'RECOUV_3AIG', name: 'Couture recouvrement 3 aig', nameAr: 'تغطية بثلاثة إبر', isoNumber: 407, threadCount: 4, consumptionFactor: 18.7, observations: 'jetée: 6 mm, distance aig: 3 mm', machineCode: '256' },
  { code: 'RECOUV_4F_4F', name: 'Couture de recouvrement 4 fils aig - 4 fils boucleur', nameAr: 'تغطية 4 خيوط إبر + 4 خيوط لوفر', isoNumber: 607, threadCount: 8, consumptionFactor: 31.9, observations: 'largeur couture 6 mm', machineCode: '256' },
  { code: 'RECOUV_602_3', name: 'Couture recouvrement à 2 aig', nameAr: 'تغطية بابزرين - عرض 3 مم', isoNumber: 602, threadCount: 3, consumptionFactor: 17.1, observations: 'largeur couture 3 mm', machineCode: '256' },
  { code: 'RECOUV_602_6', name: 'Couture recouvrement à 2 aig', nameAr: 'تغطية بابزرين - عرض 6 مم', isoNumber: 602, threadCount: 3, consumptionFactor: 22.1, observations: 'largeur couture 6 mm', machineCode: '256' },
  { code: 'RECOUV_604', name: 'Couture recouvrement à 3 aig', nameAr: 'تغطية بثلاثة إبر (604)', isoNumber: 604, threadCount: 4, consumptionFactor: 24.5, machineCode: '256' },
  { code: 'RECOUV_605', name: 'Couture recouvrement à 3 aig', nameAr: 'تغطية بثلاثة إبر (605)', isoNumber: 605, threadCount: 4, consumptionFactor: 26.7, observations: 'larg couture 6 mm - distance aig 3 mm', machineCode: '256' },

  // --- فلاتلوك / Flatlock ---
  { code: 'FLATLOCK', name: 'Couture flatlock', nameAr: 'فلاتلوك', isoNumber: 606, threadCount: 9, consumptionFactor: 40.1, observations: '4 fils aiguille + 4 fils boucleur + 1 fil recouvrement, largeur 6 mm', machineCode: '256' },

  // --- حزام / Surjeteuse ---
  { code: 'SURJET_1F', name: 'Surjeteuse 1 fil', nameAr: 'حزام بخيط واحد', isoNumber: 501, threadCount: 1, consumptionFactor: 21.2, observations: 'largeur de couture : 4 mm', machineCode: '504' },
  { code: 'SURJET_2F', name: 'Surjeteuse 2 fils', nameAr: 'حزام بخيطين', isoNumber: 502, threadCount: 2, consumptionFactor: 11.2, observations: 'largeur de couture : 4 mm', machineCode: '504' },
  { code: 'SURJET_3F_504', name: 'Surjeteuse 3 fils', nameAr: 'حزام بثلاثة خيوط (504)', isoNumber: 504, threadCount: 3, consumptionFactor: 13.8, observations: 'largeur de couture : 4 mm', machineCode: '504' },
  { code: 'SURJET_3F_505', name: 'Surjeteuse 3 fils', nameAr: 'حزام بثلاثة خيوط (505)', isoNumber: 505, threadCount: 3, consumptionFactor: 12.0, observations: 'largeur de couture : 4 mm', machineCode: '504' },
  { code: 'SURJET_4F', name: 'Surjeteuse 4 fils', nameAr: 'حزام بأربعة خيوط', isoNumber: 514, threadCount: 4, consumptionFactor: 19.6, observations: 'Distance aig 2mm jetée 6,5 mm', machineCode: '514' },
  { code: 'SECURITE_4F', name: 'Couture sécurité imitée 4 fils', nameAr: 'خياطة أمان محاكاة - 4 خيوط', isoNumber: 512, threadCount: 4, consumptionFactor: 16.5, observations: 'largeur couture: 6,5 mm', machineCode: '514' },

  // --- أمان مركبة / Sécurité combinée ---
  { code: 'SECURITE_4F_CHAINETTE', name: 'Couture sécurité 4 fils double point de chaînette + Surjeteuse 2 fils', nameAr: 'خياطة أمان 4 خيوط سلسلة + حزام خيطين', isoNumber: 515, threadCount: 6, consumptionFactor: 20.9, observations: '4,8 (chaînette) + 16,1 (surjet)', machineCode: '514' },
  { code: 'SECURITE_5F_CHAINETTE', name: 'Couture sécurité 5 fils double point de chaînette + surjeteuse 3 fils', nameAr: 'خياطة أمان 5 خيوط سلسلة + حزام 3 خيوط', isoNumber: 516, threadCount: 8, consumptionFactor: 23.4, observations: '4,8 (chaînette) + 18,6 (surjet)', machineCode: '516' },
  { code: 'SECURITE_5F_RECOUV', name: 'Couture sécurité 5 fils double point de chaînette + surjeteuse 3 fils', nameAr: 'خياطة أمان 5 خيوط سلسلة + تغطية', isoNumber: 516, threadCount: 8, consumptionFactor: 26.7, observations: '4,8 (chaînette) + 21,9 (recouvrement)', machineCode: '516' },

  // --- أزرار / Boutonnières ---
  { code: 'BOUTONNIERE_2F', name: 'Bouton point de chaînette 1 fil', nameAr: 'فتحة زر - سلسلة بخيط واحد', isoNumber: 107, threadCount: 1, consumptionFactor: 0.2, observations: '2 trous', machineCode: '107' },
  { code: 'BOUTONNIERE_4F', name: 'Bouton point de chaînette 1 fil', nameAr: 'فتحة زر - سلسلة بخيط واحد', isoNumber: 107, threadCount: 1, consumptionFactor: 0.4, observations: '4 trous' },
  { code: 'BOUTONNIERE_LINGERIE_N', name: 'Boutonnière lingerie point noué', nameAr: 'فتحة زر ملابس داخلية - عقدية', isoNumber: 304, threadCount: 2, consumptionFactor: 0.9, observations: 'boutonnière 2,5 cm - 180 points', machineCode: '304' },
  { code: 'BOUTONNIERE_LINGERIE_C', name: 'Boutonnière lingerie simple point de chaînette', nameAr: 'فتحة زر ملابس داخلية - سلسلة بسيطة', isoNumber: 107, threadCount: 1, consumptionFactor: 0.44, observations: 'boutonnière 1,4 cm', machineCode: '107' },
  { code: 'BOUTONNIERE_CEILLET', name: 'Boutonnières à ceillet ou façon double', nameAr: 'فتحة زر عينية أو مزدوجة', isoNumber: 401, threadCount: 2, consumptionFactor: 1.14, observations: 'Fil aiguille', machineCode: '402' },

  // --- طرف مزدوج / Bride ---
  { code: 'BRIDE_NOUE', name: 'Couture de bride point noué', nameAr: 'طرف بنقطة عقدية', isoNumber: 301, threadCount: 2, consumptionFactor: 3.14, observations: 'longueur bride 1,5 cm - 42 points', machineCode: '301' },
];

// ============================================================
// 2. جدول استهلاك الخيط التفصيلي حسب سُمك القماش وعدد النقاط
//    (متر خيط لكل متر خياطة)
// ============================================================

export interface ConsumptionEntry {
  fabricThicknessMm: number;
  stitchesPerCm: number;
  consumptionPerMeter: number;
}

// --- سلسلة مزدوجة / Point de Chaînette Double ---
export const CHAINETTE_DOUBLE_CONSUMPTION: ConsumptionEntry[] = [
  { fabricThicknessMm: 0.5, stitchesPerCm: 3, consumptionPerMeter: 4.65 },
  { fabricThicknessMm: 0.5, stitchesPerCm: 4, consumptionPerMeter: 5.02 },
  { fabricThicknessMm: 0.5, stitchesPerCm: 5, consumptionPerMeter: 5.39 },
  { fabricThicknessMm: 0.5, stitchesPerCm: 6, consumptionPerMeter: 5.76 },
  { fabricThicknessMm: 0.5, stitchesPerCm: 7, consumptionPerMeter: 6.12 },
  { fabricThicknessMm: 0.5, stitchesPerCm: 8, consumptionPerMeter: 6.48 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 3, consumptionPerMeter: 4.83 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 4, consumptionPerMeter: 5.26 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 5, consumptionPerMeter: 5.69 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 6, consumptionPerMeter: 6.12 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 7, consumptionPerMeter: 6.55 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 8, consumptionPerMeter: 6.97 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 3, consumptionPerMeter: 5.01 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 4, consumptionPerMeter: 5.50 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 5, consumptionPerMeter: 5.99 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 6, consumptionPerMeter: 6.48 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 7, consumptionPerMeter: 6.98 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 8, consumptionPerMeter: 7.46 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 3, consumptionPerMeter: 5.19 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 4, consumptionPerMeter: 5.74 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 5, consumptionPerMeter: 6.30 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 6, consumptionPerMeter: 6.85 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 7, consumptionPerMeter: 7.41 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 8, consumptionPerMeter: 7.95 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 3, consumptionPerMeter: 5.37 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 4, consumptionPerMeter: 5.91 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 5, consumptionPerMeter: 6.61 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 6, consumptionPerMeter: 7.31 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 7, consumptionPerMeter: 7.81 },
];

// --- تغطية 5 خيوط / Point de Recouvrement (Supérieur et Inférieur 5 fils) ---
export const RECOUVREMENT_CONSUMPTION: ConsumptionEntry[] = [
  { fabricThicknessMm: 0.5, stitchesPerCm: 4, consumptionPerMeter: 23.72 },
  { fabricThicknessMm: 0.5, stitchesPerCm: 5, consumptionPerMeter: 25.92 },
  { fabricThicknessMm: 0.5, stitchesPerCm: 6, consumptionPerMeter: 28.12 },
  { fabricThicknessMm: 0.5, stitchesPerCm: 7, consumptionPerMeter: 30.32 },
  { fabricThicknessMm: 0.5, stitchesPerCm: 8, consumptionPerMeter: 32.52 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 4, consumptionPerMeter: 24.93 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 5, consumptionPerMeter: 27.39 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 6, consumptionPerMeter: 29.86 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 7, consumptionPerMeter: 32.33 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 8, consumptionPerMeter: 34.80 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 4, consumptionPerMeter: 26.14 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 5, consumptionPerMeter: 28.87 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 6, consumptionPerMeter: 31.60 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 7, consumptionPerMeter: 34.34 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 8, consumptionPerMeter: 37.09 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 4, consumptionPerMeter: 27.36 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 5, consumptionPerMeter: 30.36 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 6, consumptionPerMeter: 33.35 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 7, consumptionPerMeter: 36.36 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 8, consumptionPerMeter: 39.38 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 4, consumptionPerMeter: 28.58 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 5, consumptionPerMeter: 31.85 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 6, consumptionPerMeter: 35.12 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 7, consumptionPerMeter: 38.39 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 8, consumptionPerMeter: 41.67 },
];

// --- نقطة عقدية / Point Noué ---
export const NOUE_CONSUMPTION: ConsumptionEntry[] = [
  { fabricThicknessMm: 0.5, stitchesPerCm: 3, consumptionPerMeter: 2.20 },
  { fabricThicknessMm: 0.5, stitchesPerCm: 4, consumptionPerMeter: 2.45 },
  { fabricThicknessMm: 0.5, stitchesPerCm: 5, consumptionPerMeter: 2.70 },
  { fabricThicknessMm: 0.5, stitchesPerCm: 6, consumptionPerMeter: 2.95 },
  { fabricThicknessMm: 0.5, stitchesPerCm: 7, consumptionPerMeter: 3.20 },
  { fabricThicknessMm: 0.5, stitchesPerCm: 8, consumptionPerMeter: 3.45 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 3, consumptionPerMeter: 2.45 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 4, consumptionPerMeter: 2.72 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 5, consumptionPerMeter: 3.00 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 6, consumptionPerMeter: 3.27 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 7, consumptionPerMeter: 3.54 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 8, consumptionPerMeter: 3.81 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 3, consumptionPerMeter: 2.70 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 4, consumptionPerMeter: 2.99 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 5, consumptionPerMeter: 3.30 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 6, consumptionPerMeter: 3.59 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 7, consumptionPerMeter: 3.88 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 8, consumptionPerMeter: 4.18 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 3, consumptionPerMeter: 2.96 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 4, consumptionPerMeter: 3.27 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 5, consumptionPerMeter: 3.60 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 6, consumptionPerMeter: 3.91 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 7, consumptionPerMeter: 4.23 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 8, consumptionPerMeter: 4.55 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 3, consumptionPerMeter: 3.22 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 4, consumptionPerMeter: 3.56 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 5, consumptionPerMeter: 3.90 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 6, consumptionPerMeter: 4.24 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 7, consumptionPerMeter: 4.58 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 8, consumptionPerMeter: 4.92 },
];

// --- زكزاك عقدية / Point Zig-Zag Noué ---
// حسب عرض الرمية (Jetée)
export interface ZigZagConsumptionEntry {
  fabricThicknessMm: number;
  stitchesPerCm: number;
  jetee_1_5mm: number;
  jetee_4_5mm: number;
  jetee_8mm: number;
}

export const ZIGZAG_NOUE_CONSUMPTION: ZigZagConsumptionEntry[] = [
  { fabricThicknessMm: 0.5, stitchesPerCm: 4, jetee_1_5mm: 2.72, jetee_4_5mm: 4.42, jetee_8mm: 4.80 },
  { fabricThicknessMm: 0.5, stitchesPerCm: 6, jetee_1_5mm: 3.26, jetee_4_5mm: 6.41, jetee_8mm: 8.20 },
  { fabricThicknessMm: 0.5, stitchesPerCm: 8, jetee_1_5mm: 4.04, jetee_4_5mm: 8.40, jetee_8mm: 10.19 },
  { fabricThicknessMm: 0.5, stitchesPerCm: 10, jetee_1_5mm: 4.82, jetee_4_5mm: 10.56, jetee_8mm: 12.08 },
  { fabricThicknessMm: 0.5, stitchesPerCm: 12, jetee_1_5mm: 6.05, jetee_4_5mm: 12.73, jetee_8mm: 13.98 },
  { fabricThicknessMm: 0.5, stitchesPerCm: 14, jetee_1_5mm: 7.28, jetee_4_5mm: 14.90, jetee_8mm: 17.20 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 4, jetee_1_5mm: 2.91, jetee_4_5mm: 4.64, jetee_8mm: 4.90 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 6, jetee_1_5mm: 3.54, jetee_4_5mm: 6.75, jetee_8mm: 8.32 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 8, jetee_1_5mm: 4.52, jetee_4_5mm: 8.87, jetee_8mm: 10.60 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 10, jetee_1_5mm: 5.50, jetee_4_5mm: 11.06, jetee_8mm: 12.88 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 12, jetee_1_5mm: 6.79, jetee_4_5mm: 13.27, jetee_8mm: 15.17 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 14, jetee_1_5mm: 8.09, jetee_4_5mm: 15.47, jetee_8mm: 18.46 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 4, jetee_1_5mm: 3.10, jetee_4_5mm: 4.86, jetee_8mm: 5.00 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 6, jetee_1_5mm: 3.82, jetee_4_5mm: 7.09, jetee_8mm: 8.44 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 8, jetee_1_5mm: 5.00, jetee_4_5mm: 9.34, jetee_8mm: 11.01 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 10, jetee_1_5mm: 6.18, jetee_4_5mm: 11.56, jetee_8mm: 13.68 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 12, jetee_1_5mm: 7.53, jetee_4_5mm: 13.81, jetee_8mm: 16.36 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 14, jetee_1_5mm: 8.87, jetee_4_5mm: 16.04, jetee_8mm: 19.72 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 4, jetee_1_5mm: 3.29, jetee_4_5mm: 5.05, jetee_8mm: 5.10 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 6, jetee_1_5mm: 4.10, jetee_4_5mm: 7.44, jetee_8mm: 8.57 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 8, jetee_1_5mm: 5.49, jetee_4_5mm: 9.81, jetee_8mm: 11.42 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 10, jetee_1_5mm: 6.87, jetee_4_5mm: 12.07, jetee_8mm: 14.49 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 12, jetee_1_5mm: 8.28, jetee_4_5mm: 14.35, jetee_8mm: 17.56 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 14, jetee_1_5mm: 9.68, jetee_4_5mm: 16.62, jetee_8mm: 20.98 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 4, jetee_1_5mm: 3.48, jetee_4_5mm: 5.15, jetee_8mm: 5.20 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 6, jetee_1_5mm: 4.38, jetee_4_5mm: 7.79, jetee_8mm: 8.70 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 8, jetee_1_5mm: 5.97, jetee_4_5mm: 10.28, jetee_8mm: 11.82 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 10, jetee_1_5mm: 7.56, jetee_4_5mm: 12.58, jetee_8mm: 15.29 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 12, jetee_1_5mm: 9.02, jetee_4_5mm: 14.89, jetee_8mm: 18.76 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 14, jetee_1_5mm: 10.48, jetee_4_5mm: 17.20, jetee_8mm: 22.24 },
];

// --- حزام / Point de Surjet ---
// 3 خيوط (عرض 4 مم) / 4 خيوط (عرض 5.5 مم)
export const SURJET_CONSUMPTION: ConsumptionEntry[] = [
  { fabricThicknessMm: 0.5, stitchesPerCm: 2.5, consumptionPerMeter: 8.58 },
  { fabricThicknessMm: 0.5, stitchesPerCm: 3, consumptionPerMeter: 9.81 },
  { fabricThicknessMm: 0.5, stitchesPerCm: 3.5, consumptionPerMeter: 10.91 },
  { fabricThicknessMm: 0.5, stitchesPerCm: 4, consumptionPerMeter: 12.02 },
  { fabricThicknessMm: 0.5, stitchesPerCm: 5, consumptionPerMeter: 12.73 },
  { fabricThicknessMm: 0.5, stitchesPerCm: 6, consumptionPerMeter: 17.46 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 2.5, consumptionPerMeter: 9.15 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 3, consumptionPerMeter: 10.31 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 3.5, consumptionPerMeter: 11.58 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 4, consumptionPerMeter: 12.87 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 5, consumptionPerMeter: 13.97 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 6, consumptionPerMeter: 18.35 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 2.5, consumptionPerMeter: 9.72 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 3, consumptionPerMeter: 10.81 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 3.5, consumptionPerMeter: 12.25 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 4, consumptionPerMeter: 13.72 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 5, consumptionPerMeter: 15.21 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 6, consumptionPerMeter: 19.24 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 2.5, consumptionPerMeter: 10.29 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 3, consumptionPerMeter: 11.32 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 3.5, consumptionPerMeter: 12.94 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 4, consumptionPerMeter: 14.57 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 5, consumptionPerMeter: 16.46 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 6, consumptionPerMeter: 20.13 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 2.5, consumptionPerMeter: 10.86 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 3, consumptionPerMeter: 11.82 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 3.5, consumptionPerMeter: 13.62 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 4, consumptionPerMeter: 15.42 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 5, consumptionPerMeter: 17.72 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 6, consumptionPerMeter: 21.02 },
];

// --- حزام 4 خيوط (عرض 5.5 مم) / Surjeteuse 4 fils ---
export const SURJET_4F_CONSUMPTION: ConsumptionEntry[] = [
  { fabricThicknessMm: 0.5, stitchesPerCm: 2.5, consumptionPerMeter: 11.07 },
  { fabricThicknessMm: 0.5, stitchesPerCm: 3, consumptionPerMeter: 12.44 },
  { fabricThicknessMm: 0.5, stitchesPerCm: 3.5, consumptionPerMeter: 13.87 },
  { fabricThicknessMm: 0.5, stitchesPerCm: 4, consumptionPerMeter: 15.32 },
  { fabricThicknessMm: 0.5, stitchesPerCm: 5, consumptionPerMeter: 17.00 },
  { fabricThicknessMm: 0.5, stitchesPerCm: 6, consumptionPerMeter: 21.95 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 2.5, consumptionPerMeter: 12.01 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 3, consumptionPerMeter: 13.31 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 3.5, consumptionPerMeter: 14.99 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 4, consumptionPerMeter: 16.68 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 5, consumptionPerMeter: 18.69 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 6, consumptionPerMeter: 24.11 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 2.5, consumptionPerMeter: 12.95 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 3, consumptionPerMeter: 14.19 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 3.5, consumptionPerMeter: 16.11 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 4, consumptionPerMeter: 18.04 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 5, consumptionPerMeter: 20.38 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 6, consumptionPerMeter: 26.27 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 2.5, consumptionPerMeter: 13.89 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 3, consumptionPerMeter: 15.69 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 3.5, consumptionPerMeter: 17.25 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 4, consumptionPerMeter: 19.41 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 5, consumptionPerMeter: 22.03 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 6, consumptionPerMeter: 28.45 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 2.5, consumptionPerMeter: 14.84 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 3, consumptionPerMeter: 15.98 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 3.5, consumptionPerMeter: 18.39 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 4, consumptionPerMeter: 20.80 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 5, consumptionPerMeter: 23.70 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 6, consumptionPerMeter: 30.65 },
];

// --- سلسلة بسيطة / Point de Chaînette Simple ---
export const CHAINETTE_SIMPLE_CONSUMPTION: ConsumptionEntry[] = [
  { fabricThicknessMm: 0.5, stitchesPerCm: 1, consumptionPerMeter: 3.10 },
  { fabricThicknessMm: 0.5, stitchesPerCm: 1.5, consumptionPerMeter: 3.15 },
  { fabricThicknessMm: 0.5, stitchesPerCm: 2, consumptionPerMeter: 3.20 },
  { fabricThicknessMm: 0.5, stitchesPerCm: 2.5, consumptionPerMeter: 3.23 },
  { fabricThicknessMm: 0.5, stitchesPerCm: 3, consumptionPerMeter: 3.26 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 1, consumptionPerMeter: 3.22 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 1.5, consumptionPerMeter: 3.31 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 2, consumptionPerMeter: 3.40 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 2.5, consumptionPerMeter: 3.44 },
  { fabricThicknessMm: 1.0, stitchesPerCm: 3, consumptionPerMeter: 3.49 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 1, consumptionPerMeter: 3.34 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 1.5, consumptionPerMeter: 3.47 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 2, consumptionPerMeter: 3.60 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 2.5, consumptionPerMeter: 3.65 },
  { fabricThicknessMm: 1.5, stitchesPerCm: 3, consumptionPerMeter: 3.72 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 1, consumptionPerMeter: 3.47 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 1.5, consumptionPerMeter: 3.63 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 2, consumptionPerMeter: 3.80 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 2.5, consumptionPerMeter: 3.87 },
  { fabricThicknessMm: 2.0, stitchesPerCm: 3, consumptionPerMeter: 3.96 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 1, consumptionPerMeter: 3.60 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 1.5, consumptionPerMeter: 3.80 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 2, consumptionPerMeter: 4.00 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 2.5, consumptionPerMeter: 4.10 },
  { fabricThicknessMm: 2.5, stitchesPerCm: 3, consumptionPerMeter: 4.20 },
];

// ============================================================
// 3. جدول مطابقة أرقام الخيوط
// ============================================================

export interface ThreadNumbering {
  nm: number;       // Numéro Métrique: عدد الكيلومترات في الكيلوغرام
  tex: number;      // Tex: الغرامات في 1000 متر
  nCot: number;     // Numéro Coton: عدد الأشكال (10 yds) في الرطل
  deniers: number;  // Deniers: الغرامات في 9000 متر
  description?: string;
}

export const THREAD_NUMBERING: ThreadNumbering[] = [
  { nm: 10.00, tex: 100, nCot: 5.905, deniers: 900 },
  { nm: 10.71, tex: 93, nCot: 6.327, deniers: 840 },
  { nm: 10.88, tex: 92, nCot: 6.426, deniers: 827 },
  { nm: 12.00, tex: 83, nCot: 7.086, deniers: 750 },
  { nm: 13.54, tex: 72, nCot: 8.000, deniers: 664 },
  { nm: 14.28, tex: 70, nCot: 8.436, deniers: 630 },
  { nm: 18.30, tex: 55, nCot: 10.81, deniers: 496 },
  { nm: 20.32, tex: 50, nCot: 12.00, deniers: 442 },
  { nm: 21.16, tex: 47, nCot: 12.50, deniers: 425 },
  { nm: 22.00, tex: 46, nCot: 12.99, deniers: 409 },
  { nm: 24.18, tex: 42, nCot: 14.28, deniers: 368 },
  { nm: 30.23, tex: 33, nCot: 17.86, deniers: 298 },
  { nm: 33.87, tex: 30, nCot: 20.00, deniers: 265 },
  { nm: 36.28, tex: 28, nCot: 21.43, deniers: 248 },
  { nm: 40.64, tex: 25, nCot: 24.00, deniers: 221 },
  { nm: 42.85, tex: 23, nCot: 25.31, deniers: 210 },
  { nm: 47.41, tex: 21, nCot: 28.00, deniers: 190 },
  { nm: 54.19, tex: 18, nCot: 32.00, deniers: 166 },
  { nm: 60.96, tex: 16, nCot: 36.00, deniers: 147 },
  { nm: 67.73, tex: 15, nCot: 40.00, deniers: 140 },
  { nm: 77.89, tex: 13, nCot: 46.00, deniers: 115 },
  { nm: 84.64, tex: 12, nCot: 50.00, deniers: 106 },
  { nm: 101.6, tex: 10, nCot: 60.00, deniers: 89 },
  { nm: 135.5, tex: 7.5, nCot: 80.00, deniers: 66 },
  { nm: 169.3, tex: 6, nCot: 100.00, deniers: 53 },
];

/**
 * تعريفات الأرقام:
 * - NM (Numéro Métrique): عدد الكيلومترات من الخيط البسيط في 1 كيلوغرام
 *   كلما كبر الرقم = خيط أنحف
 *
 * - TEX: عدد الغرامات التي يزنها 1000 متر من الخيط البسيط
 *   كلما صغر الرقم = خيط أنحف
 *
 * - N. COTON: عدد الأشكال (écheveaux) من النمط 10 yds (459.1 متر)
 *   المكافئة لرطل إنجليزي واحد (0.4535 كغ)
 *
 * - DENIERS: عدد الغرامات التي يزنها 9000 متر من الخيط البسيط
 *   كلما صغر الرقم = خيط أنحف
 */

// ============================================================
// 4. تحويل بين أنظمة الأرقام
// ============================================================

/** تحويل NM إلى TEX */
export function nmToTex(nm: number): number {
  return 1000 / nm;
}

/** تحويل TEX إلى NM */
export function texToNm(tex: number): number {
  return 1000 / tex;
}

/** تحويل DENIERS إلى TEX */
export function deniersToTex(deniers: number): number {
  return deniers / 9;
}

/** تحويل TEX إلى DENIERS */
export function texToDeniers(tex: number): number {
  return tex * 9;
}

/** البحث عن أقرب رقم خيط في الجدول */
export function findClosestThreadNumber(nm: number): ThreadNumbering {
  let closest = THREAD_NUMBERING[0];
  let minDiff = Math.abs(nm - closest.nm);
  for (const entry of THREAD_NUMBERING) {
    const diff = Math.abs(nm - entry.nm);
    if (diff < minDiff) {
      minDiff = diff;
      closest = entry;
    }
  }
  return closest;
}

// ============================================================
// 5. حساب استهلاك الخيط لكل موديل
// ============================================================

export interface SewingOperation {
  stitchTypeCode: string;
  seamLengthCm: number;
  stitchesPerCm?: number;  // عدد النقاط في السنتيمتر (اختياري - يستعمل المعامل الأساسي)
  threadCount?: number;    // عدد الخيوط في هذا الإجراء
}

export interface ThreadConsumptionResult {
  operationCode: string;
  stitchType: string;
  seamLengthM: number;
  consumptionFactor: number;
  threadMeters: number;
  threadCount: number;
}

/**
 * حساب استهلاك الخيط لإجراء خياطة واحد
 */
export function calculateOperationThreadConsumption(
  operation: SewingOperation
): ThreadConsumptionResult {
  const stitchType = STITCH_TYPES.find(s => s.code === operation.stitchTypeCode);
  if (!stitchType) {
    throw new Error(`نوع النقاط غير موجود: ${operation.stitchTypeCode}`);
  }

  const seamLengthM = operation.seamLengthCm / 100;
  const threadMeters = seamLengthM * stitchType.consumptionFactor;
  const threadCount = operation.threadCount || stitchType.threadCount;

  return {
    operationCode: operation.stitchTypeCode,
    stitchType: stitchType.name,
    seamLengthM,
    consumptionFactor: stitchType.consumptionFactor,
    threadMeters,
    threadCount,
  };
}

/**
 * حساب إجمالي استهلاك الخيط لموديل واحد (كل الإجراءات)
 */
export function calculateModelThreadConsumption(
  operations: SewingOperation[]
): { totalThreadMeters: number; details: ThreadConsumptionResult[] } {
  const details = operations.map(op => calculateOperationThreadConsumption(op));
  const totalThreadMeters = details.reduce((sum, d) => sum + d.threadMeters, 0);
  return { totalThreadMeters, details };
}

// ============================================================
// 6. حساب عدد البوبين حسب الحجم
// ============================================================

export interface BobbinSize {
  label: string;
  capacityMeters: number;
}

export const BOBBIN_SIZES: BobbinSize[] = [
  { label: 'Bobine 1000m', capacityMeters: 1000 },
  { label: 'Bobine 2500m', capacityMeters: 2500 },
  { label: 'Bobine 3000m', capacityMeters: 3000 },
  { label: 'Bobine 5000m', capacityMeters: 5000 },
];

export interface BobbinCalculation {
  bobbinSize: BobbinSize;
  totalConsumptionMeters: number;
  bobbinsNeeded: number;
  bobbinsRoundedUp: number;
  wasteMeters: number;
  wastePercent: number;
}

/**
 * حساب عدد البوبين المطلوبة لكل حجم بوبين
 */
export function calculateBobbins(
  totalConsumptionMeters: number,
  safetyPercent: number = 10 // احتياطي 10%
): BobbinCalculation[] {
  const withSafety = totalConsumptionMeters * (1 + safetyPercent / 100);

  return BOBBIN_SIZES.map(size => {
    const exact = withSafety / size.capacityMeters;
    const rounded = Math.ceil(exact);
    const used = rounded * size.capacityMeters;
    const waste = used - totalConsumptionMeters;

    return {
      bobbinSize: size,
      totalConsumptionMeters,
      bobbinsNeeded: exact,
      bobbinsRoundedUp: rounded,
      wasteMeters: waste,
      wastePercent: (waste / used) * 100,
    };
  });
}

/**
 * حساب عدد البوبين لإنتاج كامل (عدة موديلات × عدة وحدات)
 */
export function calculateProductionThreadConsumption(
  modelThreadMeters: number,   // استهلاك الموديل الواحد (متر)
  quantityPerModel: number,     // عدد الوحدات لكل موديل
  numberOfModels: number = 1,   // عدد الموديلات
  safetyPercent: number = 10
): {
  totalMeters: number;
  bobbinsBySize: BobbinCalculation[];
  costPerMeter?: number;
  totalCost?: number;
} {
  const totalMeters = modelThreadMeters * quantityPerModel * numberOfModels;
  const bobbinsBySize = calculateBobbins(totalMeters, safetyPercent);

  return {
    totalMeters,
    bobbinsBySize,
  };
}

// ============================================================
// 7. ربط أنواع النقاط بالماكينات
// ============================================================

export interface MachineThreadConfig {
  machineCode: string;
  machineName: string;
  machineNameAr: string;
  isoStitchNumber: number;
  threadPositions: string[];
  defaultThreadNumber: string;  // رقم الخيط الافتراضي (NM)
  threadCount: number;
}

export const MACHINE_THREAD_CONFIG: MachineThreadConfig[] = [
  {
    machineCode: '101',
    machineName: 'Point Invisible',
    machineNameAr: 'نقطة خفية',
    isoStitchNumber: 101,
    threadPositions: ['fil aiguille'],
    defaultThreadNumber: 'NM 50-80',
    threadCount: 1,
  },
  {
    machineCode: '301',
    machineName: 'Piqueuse Plate',
    machineNameAr: 'ماكينة پيك平坦',
    isoStitchNumber: 301,
    threadPositions: ['fil aiguille', 'fil canette'],
    defaultThreadNumber: 'NM 30-50',
    threadCount: 2,
  },
  {
    machineCode: '304',
    machineName: 'ZigZag',
    machineNameAr: 'زكزاك',
    isoStitchNumber: 304,
    threadPositions: ['fil aiguille', 'fil canette'],
    defaultThreadNumber: 'NM 30-50',
    threadCount: 2,
  },
  {
    machineCode: '402',
    machineName: 'Chainette 2 Aig',
    machineNameAr: 'سلسلة بابزرين',
    isoStitchNumber: 402,
    threadPositions: ['fil aiguille supérieur', 'fil aiguille inférieur', 'fil boucleur'],
    defaultThreadNumber: 'NM 40-60',
    threadCount: 3,
  },
  {
    machineCode: '504',
    machineName: 'Surjeteuse 3 Fils',
    machineNameAr: 'حزام بثلاثة خيوط',
    isoStitchNumber: 504,
    threadPositions: ['fil aiguille', 'fil boucleur supérieur', 'fil boucleur inférieur'],
    defaultThreadNumber: 'NM 80-120',
    threadCount: 3,
  },
  {
    machineCode: '514',
    machineName: 'Surjeteuse 4 Fils',
    machineNameAr: 'حزام بأربعة خيوط',
    isoStitchNumber: 514,
    threadPositions: ['fil aiguille 1', 'fil aiguille 2', 'fil boucleur supérieur', 'fil boucleur inférieur'],
    defaultThreadNumber: 'NM 80-120',
    threadCount: 4,
  },
  {
    machineCode: '516',
    machineName: 'Surjeteuse 5 Fils',
    machineNameAr: 'حزام بخمسة خيوط',
    isoStitchNumber: 516,
    threadPositions: ['fil chaînette', 'fil aiguille 1', 'fil aiguille 2', 'fil boucleur supérieur', 'fil boucleur inférieur'],
    defaultThreadNumber: 'NM 40-80',
    threadCount: 5,
  },
  {
    machineCode: '256',
    machineName: 'Recouvreuse',
    machineNameAr: 'ماكينة التغطية',
    isoStitchNumber: 256,
    threadPositions: ['fil aiguille 1', 'fil aiguille 2', 'fil aiguille 3', 'fil boucleur', 'fil recouvrement'],
    defaultThreadNumber: 'NM 50-80',
    threadCount: 5,
  },
  {
    machineCode: '602',
    machineName: 'Colleteuse',
    machineNameAr: 'كوليتيوز',
    isoStitchNumber: 602,
    threadPositions: ['fil aiguille 1', 'fil aiguille 2', 'fil boucleur'],
    defaultThreadNumber: 'NM 50-80',
    threadCount: 3,
  },
  {
    machineCode: '107',
    machineName: 'Pose Bouton',
    machineNameAr: 'ماكينة الزر',
    isoStitchNumber: 107,
    threadPositions: ['fil aiguille'],
    defaultThreadNumber: 'NM 40-60',
    threadCount: 1,
  },
  {
    machineCode: '304B',
    machineName: 'Boutonnière Droite',
    machineNameAr: 'فتحة زر مستقيمة',
    isoStitchNumber: 304,
    threadPositions: ['fil aiguille', 'fil canette'],
    defaultThreadNumber: 'NM 30-50',
    threadCount: 2,
  },
  {
    machineCode: 'BR',
    machineName: 'Brideuse',
    machineNameAr: 'بريدوز',
    isoStitchNumber: 301,
    threadPositions: ['fil aiguille', 'fil canette'],
    defaultThreadNumber: 'NM 30-50',
    threadCount: 2,
  },
];

// ============================================================
// 8. دوال مساعدة لبحث الجداول التفصيلية
// ============================================================

/**
 * البحث في جدول سلسلة مزدوجة
 */
export function lookupChainetteDouble(fabricThicknessMm: number, stitchesPerCm: number): number | null {
  const entry = CHAINETTE_DOUBLE_CONSUMPTION.find(
    e => e.fabricThicknessMm === fabricThicknessMm && e.stitchesPerCm === stitchesPerCm
  );
  return entry?.consumptionPerMeter ?? null;
}

/**
 * البحث في جدول التغطية
 */
export function lookupRecouvrement(fabricThicknessMm: number, stitchesPerCm: number): number | null {
  const entry = RECOUVREMENT_CONSUMPTION.find(
    e => e.fabricThicknessMm === fabricThicknessMm && e.stitchesPerCm === stitchesPerCm
  );
  return entry?.consumptionPerMeter ?? null;
}

/**
 * البحث في جدول نقطة عقدية
 */
export function lookupNoeud(fabricThicknessMm: number, stitchesPerCm: number): number | null {
  const entry = NOUE_CONSUMPTION.find(
    e => e.fabricThicknessMm === fabricThicknessMm && e.stitchesPerCm === stitchesPerCm
  );
  return entry?.consumptionPerMeter ?? null;
}

/**
 * البحث في جدول زكزاك عقدية
 */
export function lookupZigZagNoeud(
  fabricThicknessMm: number,
  stitchesPerCm: number,
  jeteeWidth: 1.5 | 4.5 | 8
): number | null {
  const entry = ZIGZAG_NOUE_CONSUMPTION.find(
    e => e.fabricThicknessMm === fabricThicknessMm && e.stitchesPerCm === stitchesPerCm
  );
  if (!entry) return null;
  switch (jeteeWidth) {
    case 1.5: return entry.jetee_1_5mm;
    case 4.5: return entry.jetee_4_5mm;
    case 8: return entry.jetee_8mm;
  }
}

/**
 * البحث في جدول حزام 3 خيوط
 */
export function lookupSurjet3F(fabricThicknessMm: number, stitchesPerCm: number): number | null {
  const entry = SURJET_CONSUMPTION.find(
    e => e.fabricThicknessMm === fabricThicknessMm && e.stitchesPerCm === stitchesPerCm
  );
  return entry?.consumptionPerMeter ?? null;
}

/**
 * البحث في جدول حزام 4 خيوط
 */
export function lookupSurjet4F(fabricThicknessMm: number, stitchesPerCm: number): number | null {
  const entry = SURJET_4F_CONSUMPTION.find(
    e => e.fabricThicknessMm === fabricThicknessMm && e.stitchesPerCm === stitchesPerCm
  );
  return entry?.consumptionPerMeter ?? null;
}

/**
 * البحث في جدول سلسلة بسيطة
 */
export function lookupChainetteSimple(fabricThicknessMm: number, stitchesPerCm: number): number | null {
  const entry = CHAINETTE_SIMPLE_CONSUMPTION.find(
    e => e.fabricThicknessMm === fabricThicknessMm && e.stitchesPerCm === stitchesPerCm
  );
  return entry?.consumptionPerMeter ?? null;
}
