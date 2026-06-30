# خطة تنفيذ الوضع الليلي (Dark Mode) — BERAMETHODE

> **موجّهة إلى agent منفّذ.** هذه الوثيقة مكتفية بذاتها. **اقرأها كاملةً قبل أن تكتب سطراً واحداً.**
> **اللغة الإجبارية مع المستخدم:** العربية الفصحى. المصطلحات التقنية بالإنجليزية.

---

## 0. تعليمات أساسية للـ agent المنفّذ (اقرأ هذا أولاً)

1. **لا تفترض أن أي شيء مكتمل.** حتى `Planning` (الذي كان يُعدّ "المرجع") **غير مكتمل** — أُنجزت قشرته فقط، ومحتواه الكثيف (Gantt، البطاقات) لا يزال أبيض في الوضع الليلي. تحقّق بصرياً من كل صفحة بنفسك.
2. **احفر قبل أن تعدّل.** قبل كل ملف نفّذ:
   - `grep -n "style={{" <file>` (الأنماط السطرية لا تستجيب لـ `dark:`)
   - `grep -n "glass-" <file>` (أصناف زجاجية ثابتة)
   - `grep -n "#[0-9a-fA-F]\{6\}\|rgba(\|'#\|white\|fff" <file>` (ألوان hex ثابتة)
   - `grep -n "linear-gradient\|stroke=\|fill=" <file>` (تدرّجات + SVG/Recharts)
   - `grep -n "text-slate\|text-gray\|bg-white\|bg-slate-50\|border-slate" <file>` (الأصناف العادية)
3. **بصري فقط.** ممنوع لمس المنطق، الحسابات، الترجمات (`tx`/`useLang`)، الـ hooks، أو طلبات API. **الدقّة = الرزق** — أي تعديل يمسّ رقماً مرفوض.
4. **الإضافة لا الاستبدال:** `dark:` يُضاف **بجانب** الصنف النهاري، لا يحلّ محلّه.
5. **commit بعد كل صفحة/موجة** (تفادياً للتعارض مع agents أخرى).
6. **لا تستعمل `location.reload()` في المعاينة** — يمسح مسوّدات autosave وبيانات النماذج المفتوحة. اعتمد على HMR.
7. **مستندات الطباعة A4/التذاكر تبقى فاتحة دائماً.**
8. **ابحث عن skill مناسبة واستعملها** (قاعدة CLAUDE.md): قبل البدء، افحص قائمة الـ skills المتاحة عن أي مهارة تخصّ الوضع الليلي أو Tailwind أو أنظمة التصميم — مثل `tailwind-design-system`، `tailwind-patterns`، `ui-skills`، `ui-ux-pro-max`، `react-ui-patterns`. إن وُجدت skill ملائمة، فعّلها واسترشد بها. وإن لم تجد، تابع وفق هذه الوثيقة.
9. **⚠️ انتبه للعمل غير المثبّت (uncommitted WIP):** عند كتابة هذه الخطة كانت `App.tsx`، `components/Dashboard.tsx`، `components/VueGenerale.tsx`، `app/AppHeader.tsx` (وغيرها) تحمل تعديلات **غير مثبتة** على فرع `feat/desktop-foundation` — وهي نفس ملفّات الموجة 1–2. **قبل البدء:** شغّل `git status`، ونسّق مع المستخدم لتثبيت أو حفظ (stash) العمل الجاري حتى لا تدهسه. لا تعدّل ملفاً عليه تغييرات غير مثبتة دون موافقة.

---

## 1. الهدف

تطبيق الوضع الليلي على **كامل التطبيق** بنمط متّسق، **بصرياً فقط**: إضافة `dark:` + معالجة الألوان الثابتة (inline/glass/hex/SVG).

---

## 2. كيف يعمل المنطق (افهمه جيداً)

السلسلة:
1. `src/context/ThemeContext.tsx` يضيف/يزيل صنف `.dark` على `<html>` (light/dark/system، يحفظ في `localStorage('bera_theme')`، ويستمع لتغيّر النظام).
2. عندها Tailwind (CDN، `darkMode:'class'` في `index.html:15`) يفعّل كل أصناف `dark:` في DOM.
3. **لا شيء يتتالى تلقائياً** سوى لون النص الموروث. **كل عنصر يجب أن يصرّح بـ `dark:` بنفسه** → لهذا العمل صفحة بصفحة إجباري.

البنية التحتية جاهزة (ThemeContext + الإعداد + زرّ التبديل في `Configuration.tsx:797`) — **لا تلمسها**، باستثناء إصلاح FOUC أدناه (القسم 4.أ).

---

## 3. لوحة الألوان المرجعية — أخضر غابي `#1D2E28` (التزم بها حرفياً)

> **قرار المستخدم:** الوضع الليلي **أخضر غابي**، لا slate المحايد. كل الأسطح والحدود والنصوص مشتقّة من الأخضر، والـ accent **أخضر زمردي** (emerald).

### 3.أ — رموز اللوحة (تُعرَّف في `index.html` ضمن `tailwind.config` — الموجة 0)
أضِف داخل `theme.extend.colors` (بجانب `bera` و`n` الموجودين):
```js
dk: {
  bg:            '#14211C',  // خلفية الصفحة (الأغمق)
  surface:       '#1D2E28',  // بطاقة / سطح أساسي
  elevated:      '#26392F',  // سطح مرتفع (بطاقة فوق بطاقة)
  border:        '#2E463C',  // حدّ افتراضي
  'border-soft': '#243A31',  // حدّ خفيف
  text:          '#EAF1ED',  // نص أساسي
  'text-soft':   '#C2D2CA',  // نص ثانوي
  muted:         '#9DB5AB',  // نص خافت
  accent:        '#2F9E64',  // accent (أزرار/تحديد) — أخضر زمردي
  'accent-hover':'#37B473',
  'accent-text': '#6EE7B7',  // نص accent على خلفية داكنة
},
```
بعدها تستعمل: `dark:bg-dk-surface`, `dark:text-dk-text`, `dark:border-dk-border`, `dark:bg-dk-accent`... إلخ. **ميزة:** تعديل درجة الأخضر لاحقاً من مكان واحد.

> Tailwind CDN يقرأ الإعداد مرّة واحدة عند الإقلاع → بعد إضافة `dk` أعِد تحميل الصفحة مرّة واحدة (هذا تغيير على الـ config، ليس على الأصناف).

### 3.ب — جدول المطابقة

| العنصر | الوضع النهاري | يُضاف للوضع الليلي |
|---|---|---|
| خلفية الصفحة | `bg-slate-50` / `bg-gradient-to-tr from-slate-50 via-white to-indigo-50/20` | `dark:bg-dk-bg` / `dark:from-dk-bg dark:via-dk-bg dark:to-dk-bg` |
| سطح/بطاقة | `bg-white` | `dark:bg-dk-surface` |
| سطح مرتفع (بطاقة داخل بطاقة) | `bg-white` | `dark:bg-dk-elevated` |
| سطح ثانوي | `bg-slate-50/30` | `dark:bg-dk-bg/40` |
| حدود | `border-slate-200` | `dark:border-dk-border` |
| حدّ خفيف جداً | `border-slate-200/40` | `dark:border-dk-border/60` |
| نص أساسي | `text-slate-900` / `text-gray-900` | `dark:text-dk-text` |
| نص ثانوي | `text-slate-700` | `dark:text-dk-text-soft` |
| نص خافت | `text-slate-500` / `text-gray-500` | `dark:text-dk-muted` |
| نص باهت جداً | `text-slate-400` / `text-slate-300` | `dark:text-dk-muted` |
| شريط علوي (header) | `bg-white/80 border-b border-slate-200` | `dark:bg-dk-surface/80 dark:border-dk-border` |
| حقل إدخال (input) | `bg-slate-100/40 border-slate-200` | `dark:bg-dk-bg/40 dark:border-dk-border` |
| hover | `hover:bg-slate-50` | `dark:hover:bg-dk-elevated/60` |
| accent (نص) — كان indigo | `text-indigo-650` | `dark:text-dk-accent-text` |
| accent (خلفية/زر) — كان indigo | `bg-indigo-600` / `bg-indigo-50` | `dark:bg-dk-accent dark:hover:bg-dk-accent-hover` |
| تحديد/active (selected) | `bg-indigo-50 text-indigo-700` | `dark:bg-dk-accent/20 dark:text-dk-accent-text` |
| dropdown / modal | `bg-white border-slate-200` | `dark:bg-dk-surface dark:border-dk-border` |

**قرار الـ accent:** في الوضع الليلي يتحوّل تمييز `indigo` إلى الأخضر الزمردي (`dk-accent*`) لتناسق الثيم. الأزرار النهارية الزرقاء (`bera`) تبقى كما هي في النهار، وتصير `dk-accent` في الليل.

### 3.ج — الألوان الدلالية (status) — لا تُمسّ دلالتها
أبقِ اللون (له معنى وظيفي)، خفّف الخلفية فقط للوضع الليلي:
- `bg-green-50 text-green-700` → `dark:bg-green-900/30 dark:text-green-300`
- `bg-red-50 text-red-700` → `dark:bg-red-900/30 dark:text-red-300`
- نفس المنطق لـ amber / blue / sky.
> ⚠️ **لا تجعل لون النجاح (أخضر) يذوب في خلفية الثيم الخضراء** — استعمل درجات نقية فاتحة (`green-300/400`) وخلفية شفافة كي يبقى المؤشّر متمايزاً (راجع 9.أ).

**مرجع حيّ للنسخ (للقشرة فقط):** `components/planning/header/PlanningHeader.tsx`.

---

## 4. الفخاخ الحرجة (هذا هو الجزء الصعب — 80% من العمل الحقيقي)

> القاعدة الذهبية: **`dark:` لا يصل إلى الأنماط السطرية ولا إلى SVG ولا إلى CSS الثابت في `index.html`.** هذه تُعالَج يدوياً أو عبر `useTheme()`.

### 🔴 4.أ — FOUC: وميض الثيم (أصلِحه أولاً، مرّة واحدة)
`ThemeContext` يضيف `.dark` داخل `useEffect`، أي **بعد أول رسم** → مستخدم الوضع الليلي يرى **ومضة بيضاء في كل تحميل**، تزداد وضوحاً بسبب `transition-colors` في قشرة `App.tsx:1320`.
**الحل:** أضف سكربت inline في `<head>` بـ `index.html` **قبل** `<script type="module">`:
```html
<script>
  (function(){try{var t=localStorage.getItem('bera_theme');
   var d=t==='dark'||((!t||t==='system')&&matchMedia('(prefers-color-scheme:dark)').matches);
   if(d)document.documentElement.classList.add('dark');}catch(e){}})();
</script>
```

### 🔴 4.ب — التدرّجات والتينتات السطرية (inline) — سبب "البطاقات البيضاء"
**مثال مثبت:** بطاقات صفوف Gantt في `components/planning/views/gantt/GanttRow.tsx:67-75` تستعمل تدرّجاً أبيض ثابتاً:
```js
'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 60%, #ECFDF5 100%)'
```
يُطبَّق inline (`GanttRow.tsx:216`) → يبقى أبيض ساطعاً على خلفية داكنة. ونفسه في `EventBar.tsx:102` (`accentBg = hexToRgba(accent,0.06)`).
**الوصفة القياسية (اشتقاق من `useTheme`):**
```js
import { useTheme } from '../../../src/context/ThemeContext'; // عدّل المسار
const { theme } = useTheme();
const isDark = theme==='dark' || (theme==='system' && matchMedia('(prefers-color-scheme:dark)').matches);

background: isDark
  ? 'linear-gradient(135deg, #1D2E28 0%, #14211C 60%, #14211C 100%)'  // dk-surface → dk-bg (أخضر غابي)
  : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 60%, #ECFDF5 100%)';
```
للتينتات الشفافة (`hexToRgba(accent,0.06)`): ارفع الـ alpha قليلاً في الوضع الليلي (~0.18) لتبقى مرئية فوق الأخضر الداكن.

### 🔴 4.ج — مخططات Recharts لا تتكيّف (15 ملفاً)
ألوان الشبكة/المحاور/الـ tooltip مكتوبة كـ props ثابتة. أمثلة من `Dashboard.tsx:574-605`:
`stroke="#f1f5f9"` (شبكة تختفي)، `tick={{fill:'#94a3b8'}}`، `RechartsTooltip contentStyle` بخلفية بيضاء و`boxShadow rgba(0,0,0,0.1)`.
**الملفات المتأثّرة:** Dashboard، VueGenerale، RendementBoard، Facturation، Effectifs، SuiviProduction، CostCalculator، Library، Implantation، Chronometrage، Balancing + `components/ui/ResponsiveChart.tsx`.
**الحل:** اشتقّ الألوان من `useTheme()`:
```js
const grid     = isDark ? '#2E463C' : '#f1f5f9';  // dk-border
const axisTick = isDark ? '#9DB5AB' : '#94a3b8';  // dk-muted
const tooltipBg= isDark ? '#1D2E28' : '#ffffff';  // dk-surface
const tooltipTx= isDark ? '#EAF1ED' : '#0f172a';  // dk-text
```

### 🔴 4.د — أصناف مبنية ديناميكياً تكسر Tailwind CDN
`Chronometrage.tsx:3506` و`:3555`: `` `bg-${section.theme}-600` ``. Tailwind CDN يمسح **النصوص الكاملة فقط**؛ الأصناف المقطّعة لا تُولَّد، و`` `dark:bg-${...}` `` يفشل قطعاً.
**القاعدة:** ممنوع بناء أصناف `dark:` بـ template literals. استعمل خريطة أصناف ثابتة:
```js
const themeMap = { blue:'bg-blue-600 dark:bg-blue-500', green:'bg-green-600 dark:bg-green-500', /* ... */ };
```

### 🟠 4.هـ — أصناف `glass-card` / `glass-surface` (CSS ثابت في index.html)
معرَّفة بخلفية بيضاء شفافة، لا تتغيّر مع `dark:`. أضف **مرّة واحدة** في `<style>` بـ `index.html`:
```css
/* أخضر غابي: dk-surface=#1D2E28, dk-bg=#14211C */
.dark .glass-surface,
.dark .glass-surface-interactive { background: rgba(29,46,40,0.72); border-color: rgba(157,181,171,0.12); }
.dark .glass-surface-elevated { background: rgba(38,57,47,0.85); border-color: rgba(157,181,171,0.18); }
.dark .glass-surface-interactive:hover { background: rgba(38,57,47,0.88); box-shadow: 0 4px 12px rgba(0,0,0,0.35); }
.dark .glass-card { background: rgba(20,33,28,0.72); border-color: rgba(157,181,171,0.10); }
```

### 🟠 4.و — CSS ثابت آخر في index.html (~سطر 166+)
- `.ptg-row:hover { background:#f8fafc }` → أضف `.dark .ptg-row:hover { background: rgba(38,57,47,0.6) }` (+ `td:first-child`).
- scrollbars (`::-webkit-scrollbar-thumb` بـ `rgba(0,0,0,0.1)`) → أضف نسخة `.dark` بـ `rgba(194,210,202,0.18)`.

### 🟠 4.ز — أنماط سطرية وثوابت hex منتشرة
- **439 موضع** أنماط سطرية + glass عبر 33 ملفاً.
- **101 موضع** `#fff`/`white` عبر 16 ملفاً.
- الأعلى كثافة: `GESTION-RH.tsx` (299)، `HRWorkerProfilePanel.tsx` (41)، `Chronometrage.tsx` (29)، `SuiviProduction.tsx` (9)، `ErrorBoundary.tsx` (9).
- تدرّجات/ظلال/حلقات ثابتة مثل `Dashboard.tsx:376` (`ring-white/50` تبدو غلطاً على داكن — راجع كل `ring-white` و`text-white`).

---

## 5. الأنماط الممنوعة (anti-patterns)

| ممنوع | الصواب |
|---|---|
| إضافة `dark:` لفرع واحد من ternary للحالة | أضِفها **لكلا الفرعين** (active + inactive) |
| `` className={`dark:bg-${x}`} `` | اسم كامل ثابت أو خريطة أصناف |
| محاولة تغطية `style={{background:'#fff'}}` بـ `dark:` | حوّله لصنف Tailwind أو اشتقّه من `useTheme()` |
| ألوان Recharts/SVG كثوابت | اشتقّها من `useTheme()` |
| افتراض أن صفحة "مكتملة" | افحصها بصرياً في الوضعين بنفسك |
| `text-white` فوق سطح يصير فاتحاً ليلاً | راجع كل `text-white`/`ring-white` بصرياً |
| `dark:` على محتوى الطباعة | افرض الأبيض صراحةً على الطباعة |

---

## 6. ترتيب العمل (موجات)

### الموجة 0 — التأسيس (إجباري أولاً)
- `index.html`: **تعريف رموز `dk` في `tailwind.config`** (3.أ) + FOUC (4.أ) + glass (4.هـ) + ptg-row + scrollbars (4.و) + `color-scheme` (10.أ) + meta theme-color (10.و).
- أنشئ المساعدَين المشتركَين: `useIsDark()` + `lib/themeColors.ts` (10.ب).

### الموجة 1 — القشرة + إكمال Planning الداخلي
- `App.tsx` (لاحظ `App.tsx:1320` + درج التنقل `App.tsx:1340`)، `app/AppHeader.tsx`.
- `GlobalLoader.tsx`، `ErrorBoundary.tsx`، `SyncIndicator.tsx`، `AnnouncementBar.tsx`، `SupportWidget.tsx`، `LicenseBanner.tsx`.
- **⚠️ إكمال داخليات Planning (غير مكتملة!):** `planning/views/gantt/GanttRow.tsx`، `EventBar.tsx`، `GanttView.tsx`، `GanttTimeline.tsx`، `MiniMap.tsx`، وكل `planning/views/**` (Calendar/Cards) + `planning/panels/**` + `planning/modals/**`. عالج التدرّجات/التينتات inline (4.ب) والنصوص `text-slate` الناقصة.

### الموجة 2 — صفحات عالية الاستعمال
`VueGenerale.tsx`، `Dashboard.tsx` (+ Recharts)، `GESTION-RH.tsx` (⚠️ 299)، `Magasin.tsx`، `SuiviProduction.tsx`.

### الموجة 3 — الإنتاج والهندسة
`ModelWorkflow.tsx`، `Atelier.tsx`، `Gamme.tsx`، `FicheTechnique.tsx`، `AnalyseTechnologique.tsx`، `Chronometrage.tsx` (⚠️ 29 + أصناف ديناميكية 4.د)، `Balancing.tsx`، `Implantation.tsx`، `LaCoupe.tsx`، `Effectifs.tsx`.

### الموجة 4 — المتابعة والآلات والعائد
`RendementBoard.tsx`، `PageMachine.tsx`، `Machin.tsx`، `MachineEditorModal.tsx`، `MachineExitModal.tsx`، `MachineQuickScanModal.tsx`، `CatalogueTemps.tsx`.

### الموجة 5 — المخزون والفوترة والتصدير
`StockExport.tsx`، `Facturation.tsx`، `FactureUploader.tsx`، `MaterialDetailModal.tsx`، `MaterialsList.tsx`، `MaterialAssignment.tsx`، `ProductDetailPanel.tsx`، `RepartitionMatrix.tsx`، `Pedido.tsx`، `OrderModelPage.tsx`، `OrderTablesPanel.tsx`.

### الموجة 6 — الموارد البشرية والملفات
`HRWorkerProfilePanel.tsx` (⚠️ 41)، `EmployeeProfile.tsx`، `Profil.tsx`، `TasksAndHR.tsx`، `SousTraitance.tsx`، `SousTraitanceModal.tsx`، `Library.tsx`.

### الموجة 7 — الإعدادات والمشتركة والمودالات
`Configuration.tsx`، `Setup.tsx`، `PermissionsManager.tsx`، `SettingsPanel.tsx`، `PdfSettingsModal.tsx`، `CostCalculator.tsx`، `CostPartials.tsx`، `CostSanityCheck.tsx`، `ThreadCalculator.tsx`، `OrderSimulation.tsx`، `ModelInfo.tsx`، `ExcelInput.tsx`، `AgendaModal.tsx`، `SuiviEffectifsModal.tsx` + باقي المودالات.

### استثناءات (تبقى فاتحة دائماً)
مستندات الطباعة: `A4DocumentView.tsx`، `A4ResponsiveFrame.tsx`، `TicketView.tsx`، `MachineQrTicket.tsx`، `CompactCostSheet.tsx` (للطباعة). لا تطبّق `dark:` على محتوى الطباعة.

---

## 7. Checklist لكل ملف

1. شغّل أوامر الحفر (القسم 0.2).
2. عالج الفخاخ inline/glass/hex/SVG/الديناميكية أولاً (القسم 4).
3. أضف `dark:` لكل صنف عادي حسب جدول القسم 3 (خلفية، نص، حدود، hover، input، ring).
4. عالج ثنائيات ternary في **كلا الفرعين**.
5. لا تلمس المنطق/الترجمة/الـ hooks.

### 7.أ — نموذج محلول (before / after) — عايِر كل قراراتك عليه
هذا بطاقة واقعية فيها سطح + حدّ + ارتفاع + نص أساسي + نص خافت + زر accent + حقل أصلي. **انسخ هذا النمط حرفياً** في كل مكان مشابه.

**قبل:**
```jsx
<div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
  <h3 className="text-slate-900 font-bold text-sm">العنوان</h3>
  <p className="text-slate-500 text-xs mt-1">وصف خافت</p>
  <button className="mt-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3 py-1.5 text-xs">حفظ</button>
  <input type="date" className="mt-2 border border-slate-200 rounded-lg px-2 py-1 text-sm" />
</div>
```
**بعد:**
```jsx
<div className="bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl p-4 shadow-sm dark:shadow-none dark:ring-1 dark:ring-dk-border">
  <h3 className="text-slate-900 dark:text-dk-text font-bold text-sm">العنوان</h3>
  <p className="text-slate-500 dark:text-dk-muted text-xs mt-1">وصف خافت</p>
  <button className="mt-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-dk-accent dark:hover:bg-dk-accent-hover text-white rounded-lg px-3 py-1.5 text-xs">حفظ</button>
  <input type="date" className="mt-2 border border-slate-200 dark:border-dk-border dark:bg-dk-bg dark:text-dk-text dark:[color-scheme:dark] rounded-lg px-2 py-1 text-sm" />
</div>
```
لاحظ: **الظلّ → حلقة** في الداكن (`shadow-sm dark:shadow-none dark:ring-1 dark:ring-dk-border`)، الزرّ accent يصير أخضر زمردي، والحقل الأصلي يأخذ `dark:[color-scheme:dark]`.

---

## 8. التحقّق (بعد كل صفحة)

- `npm run dev` (5173) + `npm run dev:app` (7000)، بدّل المظهر من `Configuration` → Dark.
- افحص بصرياً: تباين النص (لا داكن على داكن، لا باهت)، البطاقات، الحدود، الحقول، القوائم، المودالات، **بطاقات/مخططات البيانات الكثيفة بالذات**.
- **هدف التباين (WCAG):** النص الأساسي ≥ 4.5:1 على خلفيته (نسب اللوحة المختارة آمنة: `dk-text` على `dk-surface` ≈ 11:1، `dk-muted` ≈ 4.8:1). لا تستعمل نصاً أخفت من `dk-muted` لمحتوى مهمّ.
- **ملاحظة أداء:** قشرة `App.tsx` فيها `transition-colors duration-300`؛ عند تبديل الثيم على DOM كبير قد يحدث وميض/بطء بسيط لحظة التبديل — مقبول، لكن لا تضِف `transition-colors` لعناصر كثيرة جديدة بلا داعٍ.
- `npm run type-check` (يجب أن يبقى نظيفاً).
- تأكّد أن مستندات الطباعة بقيت فاتحة.
- **ممنوع `location.reload()`** — استعمل HMR.

---

## 9. أفكار وتوصيات إضافية (مهمّة — اقرأها)

### 9.أ — سلامة الألوان الدلالية = سلامة البيانات (الأهمّ في ERP)
هذا تطبيق صناعي، الألوان تحمل **معنى وظيفياً** (متأخّر=أحمر، في الوقت=أخضر، عتبات KPI، حالات المخزون). في الوضع الليلي:
- **يجب أن تبقى هذه الألوان متمايزة وواضحة** — لا تخفّفها حتى تتشابه. خطأ في تمييز "متأخّر/في الوقت" = خطأ في القرار = خسارة مالية.
- استعمل درجات أفتح للنص الملوّن في الداكن (`text-red-400` بدل `text-red-700`)، وخلفيات داكنة شفافة (`dark:bg-red-900/30`)، مع إبقاء التباين كافياً.
- **تحقّق بصرياً من كل مؤشّر حالة بنفسك** بعد التحويل.

### 9.ب — الارتفاع (elevation) في الداكن يُظهَر بالسطوع لا بالظلال
الظلال شبه غير مرئية على خلفية داكنة. القاعدة: البطاقة المرتفعة تكون **أفتح** من خلفيتها (`dk-surface` فوق `dk-bg`)، والبطاقة داخل بطاقة تزداد فتوحاً تدريجياً (`dk-elevated`). استبدل الاعتماد على `shadow-*` بحدود/حلقات خفيفة (`dark:border-dk-border`, `dark:ring-1 dark:ring-dk-border`).

### 9.ج — لا تستعمل الأسود النقي ولا الأبيض النقي
الخلفية الأساسية = `dk-bg` (`#14211C`) لا `#000`. النص الأساسي = `dk-text` (`#EAF1ED`) لا `#fff`. الأسود/الأبيض النقي يُجهد العين ويبدو رخيصاً، ويكسر طابع الأخضر الغابي.

### 9.د — الصور والشعارات والصور المصغّرة
- **`BeraLogo.tsx`** والأيقونات SVG ذات `fill` أسود قد تختفي على داكن — تحتاج نسخة فاتحة عبر `dark:` أو `useTheme()`.
- صور الموديلات المرفوعة (thumbnails): أضف حدّاً خفيفاً (`dark:ring-1 dark:ring-dk-border`) كي لا "تطفو" بلا إطار على الخلفية الداكنة.

### 9.هـ — الحدود الخفيفة جداً تختفي
أصناف مثل `border-slate-200/40` تصبح غير مرئية على داكن. ارفع التعتيم في الداكن: `dark:border-dk-border/60` بدل `/40`.

### 9.و — الشرائط اللاصقة (sticky) والطبقات الشفافة
الرؤوس اللاصقة بخلفية `bg-white/80` يجب أن تأخذ `dark:bg-dk-surface/80` **وإلّا يظهر المحتوى من خلفها** عند التمرير. نفس الأمر لكل `backdrop-blur` مع خلفية شبه شفافة.

### 9.ز — كل الحالات التفاعلية لا الافتراضية فقط
لا تنسَ: `hover:`، `focus:`، `active:`، `disabled:`، `placeholder:`، `:checked`، صفوف الجداول المحدَّدة، وتظليل النص (selection). كثير من العطب يظهر فقط عند hover أو فتح dropdown.

### 9.ح — توصية المنهجية: pilot واحد كامل أولاً
أنجِز **صفحة واحدة من البداية للنهاية** (مثلاً `Dashboard` بكل مخططاتها) كنموذج مثبت ومراجَع، قبل توزيع الباقي. هذا يعايِر القرارات (درجات الألوان، الظلال، Recharts) ويصير قالباً للنسخ.

### 9.ط — تنسيق مع i18n والـ RTL
- التطبيق متعدّد اللغات (6 لغات) و**RTL للعربية**: تأكّد أن إضافاتك لا تفترض LTR.
- **فكرة توفير:** للملفّات التي لم تُترجَم بعد، نفّذ i18n + dark في **تمريرة واحدة** لتفادي مرور وكيلين على نفس الملف (راجع حالة i18n قبل البدء لتفادي التعارض).

### 9.ي — قائمة فحص الحالات عالية الخطورة (افحصها في الوضعين)
empty states · loading/skeletons · toasts/إشعارات الخطأ · tooltips · dropdowns مفتوحة · modals + backdrop · جداول برؤوس لاصقة · مخططات Recharts (شبكة/محاور/tooltip/legend) · بطاقات Gantt · مؤشّرات الحالة الملوّنة · حقول disabled.

---

## 10. إضافات تقنية ملموسة (مبنية على فحص الكود)

### 10.أ — عناصر النماذج الأصلية (native controls) — فخّ خفيّ ومنتشر
وجدتُ **80 عنصراً** أصلياً (`<input type="date|time|month|range|checkbox">`, `<select>`) عبر 15 ملفاً (الأعلى: `GESTION-RH.tsx`=26، `Configuration.tsx`=17، `Effectifs.tsx`=6، `FicheTechnique.tsx`=6). هذه العناصر **يرسمها المتصفّح بألوان فاتحة افتراضياً** (تقويم date picker أبيض، أسهم select داكنة، خانات checkbox) ولا تتأثّر بـ `dark:` على الإطلاق.
**الحل:** أضف `color-scheme` ليتكيّف المتصفّح تلقائياً:
- الأبسط (عام، مرّة واحدة) في `index.html` داخل `<style>`:
  ```css
  :root { color-scheme: light; }
  .dark { color-scheme: dark; }
  ```
  هذا وحده يصلح معظم date pickers و selects و scrollbars الأصلية.
- للعناصر العنيدة، أضف الصنف على العنصر نفسه: `className="... dark:[color-scheme:dark]"`.

### 10.ب — أنشئ مساعدَين مشتركَين أولاً (يوفّران تكراراً ضخماً)
بدل تكرار منطق `useTheme + matchMedia` في كل ملف، أنشئ:

1. **`src/context/ThemeContext.tsx`** → صدّر hook صغيراً:
   ```ts
   export function useIsDark(): boolean {
     const { theme } = useTheme();
     const [sys, setSys] = useState(() => matchMedia('(prefers-color-scheme:dark)').matches);
     useEffect(() => {
       const m = matchMedia('(prefers-color-scheme:dark)');
       const h = () => setSys(m.matches); m.addEventListener('change', h);
       return () => m.removeEventListener('change', h);
     }, []);
     return theme === 'dark' || (theme === 'system' && sys);
   }
   ```
   استعمله في كل مكان تحتاج فيه لون inline أو Recharts.

2. **`lib/themeColors.ts`** → مصدر واحد لألوان المخططات/الـ inline (تجنّب التشتّت):
   ```ts
   // أخضر غابي #1D2E28 — يطابق رموز dk في tailwind.config
   export const chartColors = (dark: boolean) => ({
     grid:    dark ? '#2E463C' : '#f1f5f9',   // dk-border
     axis:    dark ? '#9DB5AB' : '#94a3b8',   // dk-muted
     tooltipBg:   dark ? '#1D2E28' : '#ffffff',
     tooltipText: dark ? '#EAF1ED' : '#0f172a',
     surface: dark ? '#1D2E28' : '#ffffff',
     accent:  dark ? '#2F9E64' : '#3B6BE8',   // أخضر زمردي ليلاً / أزرق BERA نهاراً
     surfaceGrad: dark
       ? 'linear-gradient(135deg,#1D2E28 0%,#14211C 60%,#14211C 100%)'
       : 'linear-gradient(135deg,#FFFFFF 0%,#F8FAFC 60%,#ECFDF5 100%)',
   });
   ```
   كل المخططات والبطاقات inline تستهلك من هنا → تناسق مضمون وتعديل مركزي لاحقاً.

### 10.ج — خريطة الاستبدال السريع (للحالات الميكانيكية الشائعة)
طبّقها كبحث/استبدال **بحذر** (راجِع كل نتيجة)، ثم عالج الباقي يدوياً:

| ابحث عن (يظهر بمفرده) | استبدل بـ (أضِف الجزء الثاني) |
|---|---|
| `bg-white` | `bg-white dark:bg-dk-surface` |
| `bg-white` (بطاقة داخل بطاقة) | `bg-white dark:bg-dk-elevated` |
| `bg-slate-50` / `bg-gray-50` | `… dark:bg-dk-bg` |
| `text-slate-900` / `text-gray-900` | `… dark:text-dk-text` |
| `text-slate-700` / `text-gray-700` | `… dark:text-dk-text-soft` |
| `text-slate-500` / `text-gray-500` | `… dark:text-dk-muted` |
| `text-slate-400` / `text-slate-300` | `… dark:text-dk-muted` |
| `border-slate-200` / `border-gray-200` | `… dark:border-dk-border` |
| `divide-slate-200` | `… dark:divide-dk-border` |
| `hover:bg-slate-50` / `hover:bg-gray-50` | `… dark:hover:bg-dk-elevated/60` |
| `placeholder:text-slate-400` | `… dark:placeholder:text-dk-muted` |
| `text-indigo-600/650/700` (تمييز) | `… dark:text-dk-accent-text` |
| `bg-indigo-600` (زر) | `… dark:bg-dk-accent dark:hover:bg-dk-accent-hover` |

> **تحذير:** لا تطبّقها على ملفّات الطباعة (القسم 6 — الاستثناءات)، ولا على نصوص داخل `style={{}}`.

### 10.د — Framer Motion بألوان متحرّكة
`components/Setup.tsx` يستعمل `animate`/`whileHover` بقيم لون inline → لا تستجيب لـ `dark:`. مرّر القيم من `useIsDark()` عند الحاجة، أو حوّلها لأصناف Tailwind متحرّكة.

### 10.هـ — حماية الطباعة (مؤكَّدة)
يوجد منطق طباعة في `components/planning/hooks/usePlanningPrint.ts` و`CompactCostSheet.tsx` و`Magasin.tsx` وغيرها. أضف حارساً عاماً في `index.html`:
```css
@media print { :root, .dark { color-scheme: light; } .dark * { background: #fff !important; color: #000 !important; } }
```
> راجِع هذا بحذر مع كل مكوّن طباعة — الهدف أن تخرج المستندات بيضاء دائماً مهما كان وضع الشاشة.

### 10.و — لون شريط المتصفّح (mobile)
أضف في `<head>` بـ `index.html`:
```html
<meta name="theme-color" content="#f8fafc" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0f172a" media="(prefers-color-scheme: dark)">
```

### 10.ز — تعريف "منجَز" (Definition of Done) لكل صفحة
الصفحة لا تُعدّ منجزة إلا إذا تحقّق كل ما يلي بصرياً في **الوضعين**:
- [ ] لا نص منخفض التباين (داكن على داكن / باهت).
- [ ] لا بطاقة/سطح/شريط لاصق بقي أبيض.
- [ ] الحقول الأصلية (date/select/checkbox) متكيّفة.
- [ ] المخططات (إن وُجدت): شبكة/محاور/tooltip/legend مقروءة.
- [ ] مؤشّرات الحالة الملوّنة متمايزة وصحيحة.
- [ ] الحالات التفاعلية (hover/focus/disabled/مفتوح) سليمة.
- [ ] `npm run type-check` نظيف.
- [ ] مستندات الطباعة (إن وُجدت) بقيت بيضاء.

### 10.ح — سير العمل (workflow)
- اشتغل على الفرع الحالي `feat/desktop-foundation` (أو فرع مخصّص `feat/dark-mode`).
- commit بعد **كل صفحة**، برسالة واضحة (`dark: <ComponentName>`)، لتفادي التعارض ولتسهيل المراجعة/التراجع.
- إن وُزّع العمل على عدّة وكلاء: وكيل واحد لكل مجموعة ملفّات منفصلة، والمساعدَان المشتركان (10.ب) يُنشآن **أولاً** قبل التوزيع.

---

## 11. ملخّص النطاق

| البند | العدد |
|---|---|
| ملفات بحاجة لعمل | ~60 (+ داخليات Planning التي ظُنّت مكتملة) |
| أنماط سطرية/glass للمعالجة اليدوية | 439 موضعاً / 33 ملفاً |
| ثوابت `#fff`/white | 101 موضعاً / 16 ملفاً |
| عناصر نماذج أصلية (color-scheme) | 80 موضعاً / 15 ملفاً |
| ملفات Recharts | 15 |
| مساعدان مشتركان يُنشآن أولاً | `useIsDark()` + `lib/themeColors.ts` |
| موجات | 8 (0 → 7) |

**التذكير الأخير للـ agent:** لا تثق بأي ادّعاء "مكتمل" — احفر، تحقّق بصرياً، وعالج الأنماط السطرية يدوياً. الفشل الأكثر شيوعاً = نص/بطاقة بيضاء بقيت فاتحة لأنها inline.
