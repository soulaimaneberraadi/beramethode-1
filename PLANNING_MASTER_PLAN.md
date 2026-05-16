# PLANNING_MASTER_PLAN — مرجع التخطيط (مايو 2026)

> **الغرض**: (1) تصحيحات إلزامية على مراجع الكود بعد التدقيق؛ (2) **ملخّص البنية المستهدفة (To-Be)** وحالة المراحل 0–7 مقابل المستودع. المنهج: واجهة أولاً، مراحل 0→7.

**فهرس سريع:** §1 تصحيحات المراجع · §2 إعادة الاستعمال والمرحلة 0 · §3 امتدادات الأنواع · §4 ربط السويفي · §5 البنية المستهدفة (To-Be) · §6 حالة المراحل 0→7

---

## 1. تصحيحات مراجع الكود (As-Is مُدقَّق)

| الموقع في الخطة القديمة | الواقع |
|---------------------------|--------|
| `calculateEndDate` في `utils/planning.ts` (~110) | الدالة كانت **داخل `components/Planning.tsx` فقط**؛ الهدف: **تصديرها من `utils/planning.ts`** (تم في التنفيذ). |
| استيراد `isWorkingDay` من `utils/planning.ts` | النسخة الداخلية القديمة كانت `const` غير مُصدَّرة؛ للتقويم الموحّد تُصدَّر **`isPlanningWorkingDay`** (تقويم محلي يطابق Planning). |
| صيغة الكفاءة RendementBoard ~51 + دقائق الحضور | `RendementBoard` كان يستخدم **480 ثابتة**؛ يُوحَّد الحضور مع **`getWorkMinutesPerDay`** من `utils/planning.ts`. |
| `MagasinProduct.fournisseurDelaiLivraisonJours` في `types.ts` | الحقل في **`components/Magasin.tsx`** (`MagasinProduct`). |
| «3 نوافذ date في Planning» | يوجد **5 حقول** `<input type="date">` (إضافة: lancement, DDS, fournisseur conditionnel؛ تعديل: lancement, DDS) — استُبدلت بـ `DateTimePicker` في التنفيذ. |
| `suivis` «ignored» في Planning | **`suivis` كان في props دون استخدام في الجسم**؛ التقدم يُحدَّث من **App** عبر مجموع `sorties` (انظر `utils/produced.ts`). |

### 1.4 لقطة التخطيط في المستودع (مايو 2026)

| عنصر | الموقع / السلوك |
|------|------------------|
| الواجهة الرئيسية | `components/Planning.tsx` — تقويم، glisser-déposer، تفاصيل OF، تبويبات Résumé / Lots / **Machines** |
| سعة يومية | `utils/capacity.ts` + `components/planning/CapacityRibbon.tsx` — جلب السعة، نسبة التحميل، تأكيد تجاوز السعة (`BlockingConfirm`) |
| تغطية الماكينات | `utils/machineMatch.ts` (عدّ العمليات لكل صنف، `machineClass`، استبعاد PANNE/MAINT) + `MachineCoverageTable` — تحقق عند الإنشاء / التعديل / السحب؛ `BlockingConfirm`؛ **إسناد `chainMachines` في `Configuration`**؛ حقول **`matricule` / `status` في `Machin`** |
| الربط من `App` | `<Planning … machines={machines} />` مع باقي الـ props (`models`, `planningEvents`, `suivis`, `settings`, …) |
| مكوّنات فرعية | `BlockingConfirm`, `LotsEditor`, `DateTimePicker` تحت `components/planning/` و `components/ui/` |

---

## 2. إعادة الاستعمال بعد التنفيذ

| المكوّن / الدالة | الملف |
|------------------|--------|
| `calculateEndDate`, `parsePlanningDateAtNoon`, `planningLocalDateKey`, `getNetWorkHours`, `addWorkingDaysFromLaunchIso`, `isPlanningWorkingDay`, `getWorkMinutesPerDay` | `utils/planning.ts` |
| `sumPiecesFromSuiviForPlanning` | `utils/produced.ts` |
| `computeChainEfficiency` | `utils/efficiency.ts` |
| `DateTimePicker`, `MonthGrid`, `DateRangePicker` | `components/ui/` |
| `BlockingConfirm` | `components/planning/BlockingConfirm.tsx` |
| `LotsEditor`, `splitLotsFromModelGrid`, … | `components/planning/LotsEditor.tsx`, `utils/lots.ts` |
| `CapacityRibbon`, `MachineCoverageTable`, `MaterialArrivalTimeline` | `components/planning/` (السعة والماكينات مدمجان في `Planning`؛ التايم لاين جاهز للدمج) |
| سعة / ماكينات / مواد / مورد / مناولة (منطق الحساب) | `utils/capacity.ts`, `utils/machineMatch.ts`, `utils/materialNeeds.ts`, `utils/supplierLeadtime.ts`, `utils/subcontract.ts` + اختبارات |

### المرحلة الصفرية — تقويم موحّد (`DateTimePicker`)

| عنصر | الحالة |
|------|--------|
| `Planning.tsx` | حقول التاريخ على `DateTimePicker` (استبدال `<input type="date">`). |
| `FicheTechnique.tsx` | تاريخ الإطلاق — `DateTimePicker` + `settings` من `ModelWorkflow`. |
| `Magasin.tsx` | تاريخ متوقّع (أمر شراء) — `DateTimePicker` + `settings` من `App`، وإلا `lib/defaultCalendarSettings`. |
| `Effectifs.tsx` | تاريخ شريط الأدوات — `DateTimePicker` + نفس الاحتياطي. |
| القيم الافتراضية | **`lib/defaultCalendarSettings.ts`** (`DEFAULT_CALENDAR_APP_SETTINGS`) يطابق **`DEFAULT_SETTINGS`** في `App.tsx` (مصدر واحد). |

> شاشات أخرى ما زالت تستخدم `input type="date"` (مثلاً SuiviProduction، Configuration، GESTION-RH، Atelier، …) — توسيع اختياري خارج نطاق هذه المرحلة.

---

## 3. امتدادات الأنواع (`types.ts`)

- `Chaine`: حقول اختيارية `efficiency`, `efficiencySource`, `efficiencySampleSize` (للحساب الديناميكي لاحقاً مع الإعدادات).
- `Lot`: `producedQuantity?`, `modelId?` (حصص المرحلة 2).
- `Machine`: `matricule?`, `status?` (`OK`|`PANNE`|`MAINT`), `chainId?` (جرد / مرجع).
- `Operation`: `machineClass?` (يغلب على `machineId` لحساب التغطية عند الحاجة).

---

## 4. ربط السويفي بالتخطيط

- عند تغيّر `suivis`، يُعاد حساب **`producedQuantity` / `qteProduite`** لكل `planningId` في `App.tsx` (مجموع القطع من `sorties` الساعية).

- **حجم `Planning.tsx`**: يتغيّر مع التطوير — أعد قياس الأسطر عند تحديث الوثائق (قياس أداة السطر: **≈2134** سطراً، مايو 2026).
- **تكامل السعة والماكينات في الواجهة**: `utils/capacity.ts` (`maxDayLoadRatioInSpan`، `overloadDaysInSpan`، …)، `utils/machineMatch.ts` (`validateMachineCoverage`، `getChainMachineIds`، `operationRequiredClasse`، `isMachineOperational`)، `CapacityRibbon`، تبويب **Machines** في نافذة تفاصيل OF مع `MachineCoverageTable`، نوافذ `BlockingConfirm` للسعة ولتأكيد تغطية الماكينات؛ `App.tsx` يمرّر `machines={machines}` إلى `Planning` و**`Configuration`**.

---

## 5. البنية المستهدفة (To-Be)

**الهدف:** أن يبقى `PlanningEvent.id` **عقدة الربط** بين السويفي، الحصص، حجوزات المخزن (عند تنفيذها)، أوامر الشراء، مهام المناولة، و`raw_data` — مع بقاء التخطيط **مركز تنسيق** الواجهة بين المكتبة والإعدادات والمخزن والإنتاج الفعلي.

### 5.1 تدفّق منطقي (مختصر)

```
App (models, planningEvents, suivis, settings, machines, …)
  → Planning (KPIs، سايدبار، Gantt، نوافذ، سعة، ماكينات)
  → Library · Suivi · Magasin · …
  → حفظ: API / localStorage + raw_data (+ جداول SQLite لاحقاً عند الحاجة)
```

### 5.2 جداول SQLite اختيارية (مرجع المراحل 4–7)

| جدول | مرحلة | دور مختصر |
|------|--------|-----------|
| `chain_efficiency_cache` | 1 (اختياري) | تخزين كفاءة عند الحاجة |
| `machines`, `chain_machines` | 4 | persistence للماكينات وتخصيص السلسلة |
| `planning_reservations` | 5 | حجز مواد لكل OF |
| `purchase_orders` | 6 | أوامر شراء مرتبطة بالتخطيط |
| `subcontractors`, `subcontract_jobs` | 7 | المناولة |

### 5.3 To-Be مقابل الكود الحالي (لقطة مايو 2026)

| محور | حالة تقريبية |
|------|----------------|
| سويفي → `producedQuantity` / `qteProduite` من `App.tsx` | منجز |
| كفاءة سلسلة ديناميكية + احتياط `0.85` في بعض المسارات | جزئي |
| `DateTimePicker`، `LotsEditor`، `BlockingConfirm` في التخطيط | منجز |
| شريط سعة + تحذير/تأكيد تجاوز طاقة (`CapacityRibbon`، `capacity.ts`) | **منجز في Planning** |
| تغطية ماكينات + جدول تفاصيل OF + إسناد خط (`machineMatch`، `MachineCoverageTable`، `Configuration.chainMachines`) | **منجز** |
| حجز مخزن آلي، `BLOCKED_STOCK` من مسار الحفظ، `planning_reservations` | **جزئي** — `applyMaterialStock` + API magasin في Planning؛ جدول Matières + معاينة سحب؛ حجز lots و SQLite ⏳ |
| `MaterialArrivalTimeline`، `purchase_orders`، استنتاج `fournisseurDate` كاملاً | غير مدمج كاملاً |
| مناولة كاملة (علامات Gantt، حركات مخزن، `subcontract_jobs`) | غير مدمج كاملاً |

### 5.4 تسلسل التحقق المستهدف (عند اكتمال المخزن والمورد والمناولة)

بعد اكتمال المراحل 5–7 يُستحسن: **ماكينات (4) → طاقة (3) → مواد/مخزن (5) → مورد (6) → مناولة (7)** مع إبقاء ما هو **منجز** اليوم (3–4) كطبقة حماية أولى.

---

## 6. حالة المراحل 0 → 7

| # | الموضوع | حالة في المستودع |
|---|---------|------------------|
| 0 | تقويم موحّد (`DateTimePicker` + امتدادات جزئية لشاشات أخرى) | منجز (التخطيط + FicheTechnique + Magasin + Effectifs؛ بقية الشاشات اختياري) |
| 1 | سويفي + كفاءة ديناميكية | منجز (واجهة + App + `utils/efficiency`؛ API اختياري) |
| 2 | حصص `lots_data` | منجز (`LotsEditor` + `utils/lots`) |
| 3 | طاقة + تحذير/تأكيد | **منجز في Planning** (`CapacityRibbon`، `BlockingConfirm`) |
| 4 | ماكينات + تغطية gamme + إسناد خط | **منجز** — Planning + Configuration (`chainMachines`) + Machin (جرد matricule/status) |
| 5 | حجز مخزن، نقص، `BLOCKED_STOCK` آلياً | **جزئي** — `materialNeeds` + `applyMaterialStock` في مسارات OF؛ تبويب Matières + معاينة سحب؛ `planning_reservations` / `deductLots` ⏳ |
| 6 | مورد، آجال، `MaterialArrivalTimeline` | مكوّن/Utils موجودان — **تكامل كامل مع OF ⏳** |
| 7 | مناولة، حركات، Gantt | تصميم + `utils/subcontract` — **⏳** |

---

*للسياق العام للمنتج: [`BERA_MASTER_PLAN.md`](BERA_MASTER_PLAN.md). للخطة التفصيلية (مخططات، سيناريوهات E2E، مهام T0.x–T7.x): نسخة التدقيق في Cursor (`تدقيق_خطة_التخطيط_*.plan.md`) أو تصديرها إلى المستودع إن رغبت بمرجع Git واحد.*