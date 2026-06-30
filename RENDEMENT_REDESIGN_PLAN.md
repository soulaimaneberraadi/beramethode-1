# خطة إعادة تصميم صفحة العائد (Rendement) — للتسليم لوكيل منفّذ

> **الصفحة المستهدفة:** `http://localhost:7000/#rendement`
> **الملف الرئيسي:** `components/RendementBoard.tsx`
> **الهدف:** تحويل لوحة جداول نظرية إلى **هرم عائد موحّد** يُظهر الكفاءة الحقيقية على مستويات: الشركة → الصالة (Salle) → الخط (Chaîne) → النموذج (Modèle) → الآلة (Machine) → المحطة (Poste).

---

## 0. سياق إلزامي للوكيل المنفّذ (اقرأه أولاً)

- **اللغة:** كل النصوص الظاهرة للمستخدم تمرّ عبر `tx(lang, {...})` من `lib/i18n` بست لغات: `fr, ar, es, en, pt, tr`. ممنوع نص مباشر غير مترجم.
- **الوضع الليلي:** كل عنصر لوني يجب أن يحمل صنف `dark:` مطابقاً (أنماط `dk-bg`, `dk-surface`, `dk-border`, `dk-text`, `dk-muted`, `dk-elevated`, `dk-accent-text` المستعملة في الملف الحالي).
- **الرسوم البيانية:** استعمل `recharts` **عبر الغلاف** `components/ui/ResponsiveChart.tsx` فقط (يتجنّب تحذير width/height السالب). لا تستعمل `ResponsiveContainer` مباشرة.
- **أنيميشن:** Tailwind عبر CDN — أصناف `animate-in`/`tailwindcss-animate` **لا تعمل**. استعمل keyframes المعرّفة في `index.html` (مثل `fadeInUp`).
- **لغة التصميم:** نمط Planning الهادئ هو المرجع — `slate`، حواف خفيفة، بلا gradients مبالغ فيها، مدمج. (الترويسة الحالية فيها gradient violet→indigo؛ أبقِها أو خفّفها لكن لا تزد عليها.)
- **الدقّة مالية-حرجة:** حسابات العائد حسّاسة. **مصدر حساب واحد فقط** (دالة محرّك واحدة) يستهلكها كل المستويات. تحقّق من تطابق المجاميع بين المستويات (مجموع الخطوط = الصالة، مجموع الصالات = الشركة).
- **المنفذ المحلي 7000.** الفلو الأوتوماتيكي للبيانات إجباري — لا إدخال يدوي للأرقام المحسوبة.
- **ممنوع `location.reload()`** أثناء التطوير (يمسح المسوّدات) — اعتمد على HMR.

---

## 1. الوضع الحالي (ما يجب أن يُستبدل)

`RendementBoard.tsx` يستقبل `{ models, planningEvents, suivis, settings }` ويعرض 4 تبويبات جداول:

| التبويب | المشكلة |
|---|---|
| `jour` (حسب اليوم) | يعرض الكمية فقط، **بلا نسبة عائد** |
| `modele` (حسب النموذج) | الوحيد الذي يحسب `%R` فعلاً (السطر 55) |
| `poste` (حسب المحطة) | **نظري** — يقرأ `implantation`، لا الإنتاج الفعلي |
| `machine` (الآلة+الشركة) | **نظري** — يعدّ تعريفات الـ `gamme`، لا أداء الآلة |

**الفجوات:** لا KPI شركة، لا بُعد Salle، تبويبان نظريان، بيانات غنية مهدورة (`trs`, `downtimes`, `defauts`, `scrap_details`, `sectionEffectif`, المنحنى الساعي `sorties`)، لا فلترة زمنية، لا تصوّر بصري.

---

## 2. مصادر البيانات المتاحة (من `types.ts`)

### `SuiviData` (الإنتاج الفعلي — المصدر الأساسي للعائد)
- `planningId`, `modelId?`, `chaineId?`, `date`
- `sorties: HourlySuivi` (`Record<string, number>`) — الإنتاج بالساعة
- `totalWorkers`, `ouvriers_modele?`, `absent?`
- `sectionOutput?: { preparation, montage }`, `sectionEffectif?`
- `trs?` (نقاط OEE مخزّنة), `downtimes?: Record<string,string>`
- `downtime_events?: DowntimeEvent[]` (`{ code, minutes, notes }` — FK → `downtime_codes`)
- `defauts?: {type, quantity}[]`, `scrap_details?: ScrapDetail[]`

### `PlanningEvent`
- `id`, `modelId`, `chaineId`, `qteTotal`, `qteProduite?`, `dateLancement`, `dateExport`, `sectionSplitEnabled?`

### `ModelData`
- `meta_data.nom_modele`, `meta_data.total_temps` (= SAM)
- `gamme_operatoire[]` (`{ id, time, machineName?, machineId? }`)
- `implantation: { postes[], assignments }`
- `ficheData.sectionSplitEnabled`

### `AppSettings`
- `chainNames?: Record<string,string>` (chaineId → اسم معروض)
- **لا يوجد** أي ربط chaineId→salle (انظر §3).

### أدوات حساب جاهزة (لإعادة الاستعمال — لا تُعِد كتابتها)
- `utils/planning.ts` → `getWorkMinutesPerDay(settings): number`
- المرجع الحسابي للعائد/OEE موجود في `components/SuiviProduction.tsx:820-846`:
  - `R% = (Σ produced × SAM) / (Σ totalWorkers × minutesPerDay) × 100`
  - `availability = activeMinutes / totalActiveMinutes`
  - `quality = (produced − defects) / produced`
  - `OEE/TRS = availability × R × quality`

---

## 3. قرار بُعد "Salle" (موصى به: ربط في الإعدادات + تدهور رشيق)

بما أن `salle` غير موجود في البيانات، **القرار الموصى به:**

1. **إضافة حقل اختياري في `AppSettings`:**
   ```ts
   // types.ts — داخل AppSettings
   salleNames?: Record<string, string>;        // salleId → اسم الصالة
   chaineToSalle?: Record<string, string>;      // chaineId → salleId
   ```
2. **تدهور رشيق (إلزامي):** إذا لم يُعرّف أي ربط، تُجمَّع كل الخطوط تحت صالة افتراضية واحدة `__default__` باسم مترجم ("الورشة" / "Atelier"). الصفحة تعمل كاملةً بلا إعداد.
3. **شاشة الإعداد** (في `components/Configuration.tsx`): محرّر بسيط يضيف صالات ويسحب كل `chaineId` (من مفاتيح `chainNames`) إلى صالة. **هذه مرحلة مستقلة (Phase 5) ويمكن تأجيلها** — الهرم يعمل قبلها بفضل التدهور الرشيق.

> هذا يجعل بنية الخمسة مستويات تعمل فوراً، وبُعد الصالة "يضيء" تلقائياً متى رُبطت الخطوط.

---

## 4. المعمارية المقترحة (هيكل الملفات)

```
lib/
  rendementEngine.ts        ← (جديد) محرّك الحساب الموحّد — مصدر الحقيقة الوحيد
components/
  RendementBoard.tsx        ← (إعادة كتابة) الحاوية: فلترة + التنقّل الهرمي
  rendement/                ← (جديد) مكوّنات فرعية
    RendementHeader.tsx     ← الترويسة + فلترة الفترة + مقارنة
    CompanyKpiRow.tsx       ← بطاقات KPI الشركة (R% · TRS · توفّر · جودة · إنتاج/هدف)
    RendementTrendChart.tsx ← منحنى اتجاه R%/TRS عبر الزمن (ResponsiveChart)
    SalleComparison.tsx     ← مقارنة الصالات (أشرطة أفقية مرتّبة)
    DrilldownTable.tsx      ← جدول قابل للتنقيب (صالة→خط→نموذج→آلة→محطة)
    DowntimePareto.tsx      ← Pareto لأسباب التوقف
    EfficiencyBadge.tsx     ← شارة عتبة لونية موحّدة (≥85 أخضر / 70-85 كهرماني / <70 أحمر)
```

> إن فضّل المالك ملفاً واحداً، يمكن إبقاء كل شيء في `RendementBoard.tsx`، لكن **محرّك الحساب يبقى منفصلاً** في `lib/rendementEngine.ts` إلزامياً.

---

## 5. محرّك الحساب الموحّد — `lib/rendementEngine.ts`

**العقد (Contract):** دالة واحدة تأخذ المدخلات + نطاق التاريخ وتُرجع هرماً مجمّعاً. كل المستويات تُشتقّ منها (لا حساب مكرّر في الـ UI).

```ts
export interface RendementInputs {
  models: ModelData[];
  planningEvents: PlanningEvent[];
  suivis: SuiviData[];
  settings: AppSettings;
  range?: { from: string; to: string }; // YYYY-MM-DD ضمناً؛ افتراضياً كل التواريخ
}

export interface RendementNode {
  id: string;
  label: string;
  level: 'societe' | 'salle' | 'chaine' | 'modele' | 'machine' | 'poste';
  produced: number;       // Σ sorties (القطع المُنتَجة)
  target: number;         // Σ qteTotal من PlanningEvents ذات الصلة
  earnedMinutes: number;  // Σ produced × SAM
  presenceMinutes: number;// Σ totalWorkers × minutesPerDay
  defects: number;        // Σ defauts.quantity + scrap
  downtimeMinutes: number;// Σ downtime_events.minutes
  effectif: number;       // Σ totalWorkers (متوسط/مجموع حسب المستوى)
  rPercent: number;       // earnedMinutes / presenceMinutes × 100
  availability: number;   // (planned − downtime) / planned × 100
  quality: number;        // (produced − defects) / produced × 100
  trs: number;            // availability × rPercent × quality / 10000
  children?: RendementNode[];
  prep?: number; montage?: number; // عند توفّر sectionOutput
}

export function computeRendement(inputs: RendementInputs): RendementNode; // الجذر = الشركة
```

**قواعد التجميع (إلزامية للدقّة):**
- اربط كل `SuiviData` بـ `PlanningEvent` عبر `planningId` لاستخراج `chaineId`/`modelId` عند غياب الحقول المباشرة في الـ suivi (الكود الحالي يفعل ذلك في `byDay`).
- `SAM = model.meta_data.total_temps`.
- `minutesPerDay = getWorkMinutesPerDay(settings)`.
- `salleId = settings.chaineToSalle?.[chaineId] ?? '__default__'`.
- **التحقّق:** `node.produced === Σ children.produced` (اكتب اختبار يدوياً عبر console أو وحدة صغيرة). إذا اختلّ المجموع، أوقف وأبلغ.
- مستوى **الآلة الفعلي:** بدل عدّ تعريفات الـ gamme، اربط إنتاج النموذج بآلات الـ gamme الخاصة به (نِسَب الزمن `op.time`) — أو، إن تعذّر التوزيع الدقيق، اعرض "Charge آلة" (الحمولة = Σ SAM للعمليات على تلك الآلة عبر النماذج المنتَجة فعلاً) بدل العدّ النظري الحالي.
- مستوى **المحطة (Poste):** ميّز **الاختناق** (أبطأ poste = أعلى `samExpected` نسبةً إلى السعة) بصرياً.

---

## 6. مواصفات الواجهة (UI Spec)

### 6.1 الترويسة + الفلترة (`RendementHeader`)
- العنوان الحالي + أيقونة `TrendingUp` (أبقِها).
- **مبدّل الفترة:** اليوم · الأسبوع · الشهر · مدى مخصّص (date pickers). الافتراضي: الشهر الحالي.
- **مقارنة بالفترة السابقة:** سهم ↑↓ ونسبة التغيّر بجانب كل KPI.
- **مسار التنقّل (Breadcrumb):** الشركة › الصالة › الخط … مع إمكانية الرجوع.

### 6.2 صف KPI الشركة (`CompanyKpiRow`)
خمس بطاقات على نمط `Dashboard.tsx`:
1. **العائد R%** (الرئيسي، أكبر) — لون عتبة.
2. **TRS / OEE**.
3. **التوفّر (Disponibilité)**.
4. **الجودة (Qualité)**.
5. **الإنتاج / الهدف** (مع شريط تقدّم).

عتبات اللون الموحّدة (`EfficiencyBadge`): `≥85` أخضر (`emerald`), `70–85` كهرماني (`amber`), `<70` أحمر (`rose`).

### 6.3 منحنى الاتجاه (`RendementTrendChart`)
- `LineChart`/`AreaChart` داخل `ResponsiveChart`.
- محور س: التاريخ ضمن الفترة؛ خطّان: `R%` و`TRS`.
- خطّ هدف أفقي عند 85%.

### 6.4 مقارنة الصالات (`SalleComparison`)
- أشرطة أفقية مرتّبة من الأفضل للأسوأ (`R%` لكل صالة).
- نقر على صالة → تنقيب إلى خطوطها.

### 6.5 الجدول القابل للتنقيب (`DrilldownTable`)
- صفوف قابلة للطيّ: صالة ▸ خطوط ▸ نماذج ▸ آلات ▸ محطات.
- أعمدة: الاسم · الإنتاج · الهدف · `R%` (شارة) · `TRS` · التوفّر · الجودة · العدد.
- عند تفعيل `split`: عمودا تحضير/تركيب (موجودان في الكود الحالي).

### 6.6 Pareto أسباب التوقّف (`DowntimePareto`)
- من `downtime_events` مجمّعة حسب `code` (الاسم من جدول `downtime_codes`).
- أعمدة تنازلية + خطّ تراكمي — "أين نخسر الوقت؟".

---

## 7. الأفكار الإضافية (موافَق عليها للإدراج)

- **مؤشّر الاختناق (Goulot):** إبراز أبطأ poste في الخط بصرياً.
- **العائد التراكمي مقابل الهدف:** خطّ الإنجاز الفعلي ضد منحنى الطلب المخطّط.
- **تنبيه الانحراف:** وسم بصري عندما يهبط خط/صالة تحت العتبة ضمن الفترة.
- **تصدير التقرير:** زر تصدير PDF/Excel للوحة العائد (متاح عبر مهارات `xlsx`/`pdf`). *(اختياري، مرحلة أخيرة.)*

---

## 8. مراحل التنفيذ (للوكيل — بالترتيب)

| المرحلة | المحتوى | معيار الإنجاز |
|---|---|---|
| **P1** | `lib/rendementEngine.ts` — المحرّك + التجميع الهرمي + التحقّق من تطابق المجاميع | الأرقام مطابقة لتبويب `modele` الحالي للنماذج نفسها |
| **P2** | إعادة كتابة `RendementBoard.tsx`: الترويسة + الفلترة الزمنية + KPI الشركة | KPI الشركة يظهر ويتغيّر مع الفترة |
| **P3** | `DrilldownTable` بالتنقّل الهرمي (صالة→…→محطة) مع التدهور الرشيق للصالة | التنقيب يعمل؛ بلا إعداد صالة يظهر "الورشة" واحدة |
| **P4** | الرسوم: `RendementTrendChart` + `SalleComparison` + `DowntimePareto` | الرسوم تُحمَّل بلا تحذير recharts، dark mode سليم |
| **P5** | (اختياري) محرّر Salle في `Configuration.tsx` + حقول `AppSettings` | ربط خط↔صالة يُحفظ ويُعكَس في الهرم |
| **P6** | (اختياري) تصدير التقرير + تنبيهات الانحراف | — |

> يمكن تسليم P1–P4 كحزمة أولى. P5/P6 منفصلتان.

---

## 9. معايير القبول (Acceptance Criteria)

- [ ] كل النصوص مترجمة بالست لغات عبر `tx()`.
- [ ] dark mode سليم على كل العناصر (افحص بصرياً عبر preview، بلا `location.reload`).
- [ ] الرسوم بلا تحذير `width(-1)/height(-1)` (استعمال `ResponsiveChart`).
- [ ] **تطابق المجاميع:** Σ الخطوط = الصالة، Σ الصالات = الشركة (تحقّق رقمي).
- [ ] الصفحة تعمل كاملةً **بلا** أي إعداد صالة (تدهور رشيق).
- [ ] الفلترة الزمنية تعيد حساب كل المستويات.
- [ ] `npm run type-check` ينجح.
- [ ] لا regression في تمرير الـ props من `App.tsx` (نفس التوقيع `{ models, planningEvents, suivis, settings }`؛ أي إضافة props تتطلب تعديل `App.tsx:1697`).

---

## 10. مزالق يجب تفاديها (Gotchas)

- **توقيع الـ props:** `App.tsx` يمرّر 4 props فقط. إن احتجت بيانات إضافية (مثل `downtime_codes`)، عدّل موضع الاستدعاء في `App.tsx` (حوالي السطر 1697) ومرّرها.
- **ربط suivi↔event:** بعض الـ suivis تحمل `chaineId`/`modelId` مباشرة، وبعضها لا — اعتمد على `planningId` كمصدر احتياطي (كما في الكود الحالي).
- **القسمة على صفر:** كل النِسَب تحتاج حارس (`presenceMinutes > 0 ? … : 0`).
- **`total_temps` قد يكون 0** لنماذج بلا gamme — استبعدها من حساب R% لا من العرض.
- **لا تُعِد كتابة** `getWorkMinutesPerDay` أو منطق OEE — أعد استعمال الموجود.
- **أداء:** `computeRendement` داخل `useMemo` بمفاتيح `[models, planningEvents, suivis, settings, range]`.
