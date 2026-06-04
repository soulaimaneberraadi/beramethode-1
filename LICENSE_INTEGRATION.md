# تكامل BERAMETHODE مع منصة BERA MASTER (الترخيص)

هذه الطبقة تربط BERAMETHODE بمنصة التراخيص `Bera-master-admin`. **مصمّمة لتكون آمنة:**
الإنفاذ **مُطفأ افتراضياً**، فلا تُغيّر سلوك البرنامج إطلاقاً ما لم تُفعّله صراحةً.

## الملفات المضافة
- `src/lib/licenseClient.ts` — يستدعي Edge Function `verify-license`، يخزّن النتيجة في `bera_license` (عمل أوفلاين بفترة سماح 7 أيام).
- `src/context/LicenseContext.tsx` — مزوّد يوفّر حالة الترخيص: `readOnly`, `hiddenModules`, `maxWorkers`.
- `components/AnnouncementBar.tsx` — شريط إعلانات المنصة (يقرأ جدول `announcements`).
- `components/LicenseBanner.tsx` — شريط القراءة فقط / تنبيه التجديد.
- تعديلات `index.tsx` (لفّ المزوّد + الشريطين) و`App.tsx` (إخفاء الوحدات عبر `effectiveNavConfig`).

## ما يعمل الآن (عند التفعيل)
1. **إخفاء الوحدات** غير المسموحة في باقة المصنع (القائمة الجانبية + الهيدر + الموبايل).
2. **شريط الإعلانات** من لوحة Master.
3. **شريط القراءة فقط** عند انتهاء/إيقاف الترخيص + **تنبيه التجديد** قبل 5 أيام.
4. **العمل أوفلاين** ضمن فترة سماح، وإعادة تحقق عند عودة الاتصال.

## كيف تُفعّل الإنفاذ
1. **انشر Edge Function** من مجلد المنصة:
   ```bash
   supabase functions deploy verify-license --no-verify-jwt
   supabase secrets set LICENSE_SIGN_SECRET=<نفس السر> SERVICE_ROLE_KEY=<service_role>
   ```
2. **شغّل** `supabase/schema.sql` (من المنصة) لإنشاء الجداول.
3. **ولّد ترخيصاً للمصنع** من لوحة Bera Master (مرتبطاً ببريد مدير المصنع).
4. في BERAMETHODE، أضِف للمتغيرات (`.env` / متغيرات Vercel):
   ```
   VITE_LICENSE_ENFORCE=true
   ```
5. أعد البناء/التشغيل. الآن يُطبَّق الترخيص.

> ⚠️ قبل وضع `VITE_LICENSE_ENFORCE=true` في الإنتاج، تأكّد من وجود ترخيص صالح
> لحسابك، وإلا ستدخل في وضع القراءة فقط. أمان إضافي مبني: إذا لم يوجد ترخيص
> إطلاقاً (`source==='none'`) لا يُقفل البرنامج.

## ما تبقّى (إنفاذ دقيق اختياري — مرحلة لاحقة)
- **سقف عدد العمال** (`useLicense().maxWorkers`): اقرأه في `components/GESTION-RH.tsx` لمنع إضافة عامل فوق الحد.
- **القراءة فقط على مستوى الأزرار**: استعمل `useLicense().readOnly` لتعطيل أزرار الإضافة/الحفظ في الوحدات الحساسة (المكتبة، التخطيط، المخزن...). البنية جاهزة؛ التطبيق على كل زرّ متروك حسب الأولوية.
