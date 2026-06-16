# BERAMETHODE — المعمارية وخارطة الطريق (Architecture & Roadmap)

> وثيقة مرجعية تجمع الرؤية المعمارية الكاملة لـ BERAMETHODE + خطة التنفيذ.
> **التاريخ:** 2026-06-16 · **المؤلف:** Soulaimane Berraadi (تصوّر) + توثيق تقني.
> **الجمهور:** المالك + أي مطوّر يشتغل على المشروع لاحقاً.

---

## 0. الغرض

هاد الوثيقة كتوثّق:
1. **الرؤية المعمارية** المستهدفة (local-first + توزيع + صلاحيات + سحابة خفيفة).
2. **حادثة الـ Egress** (يونيو 2026) والإصلاحات المطبّقة.
3. **خارطة طريق** بكل اللي خاصو يتبنى، مرتّب بالمراحل.

> ⚠️ قاعدة ذهبية للمشروع: **الدقّة = الرزق.** الحسابات مالية حرجة. كل تغيير يُختبَر قبل التالي. لا refactor كبير بلا backend حيّ للاختبار.

---

## 1. الرؤية العامة

**BERAMETHODE** = نظام ERP للصناعة النسيجية بالمغرب، يُوزَّع كـ **تطبيق سطح مكتب (.exe)** يُباع لعدّة شركات. كل شركة مستقلّة، والسحابة دور **ثانوي** (جسر + ترخيص + backup).

**الفلسفة:** **Local-First** — البرنامج يخدم على البيانات المحلية، والسحابة **إضافة ماشي شرط**. تقطع الإنترنت → البرنامج يكمّل.

```
┌─ شركة A ──────────────┐     ┌─ شركة B ──────────────┐
│  PC الأدمين (سيرفر)     │     │  PC الأدمين (سيرفر)     │
│  Express :7000 + SQLite │     │  Express :7000 + SQLite │
│   ▲   ▲   ▲ (LAN/WiFi)  │     │   ▲   ▲                 │
│  عامل عامل عامل          │     │  عامل عامل              │
└────────┬───────────────┘     └────────┬───────────────┘
         │                              │
         └──────── سحابة خفيفة ──────────┘
            (جسر للبعيد + backup + ترخيص + طبقة سمسار)
                          │
              Bera-master-admin (تراخيص + لوحة السمسار)
```

---

## 2. حادثة الـ Egress (يونيو 2026) + الإصلاحات

### السبب الجذري
المنظّمة على Supabase Free تجاوزت سقف **Egress = 5 GB** (وصلت 9.485 GB = 190%) → الخدمة مقيّدة (402) حتى تصفير الدورة (**12 يوليوز 2026**). التخزين كان سليم (DB = 37 MB). المشكل **تكرار التنزيل**، ماشي الحجم.

**مصدران:**
1. **المتصفّح** — `pullSnapshotFromCloud` كان ينزّل الـ blob كامل (~2.2 MB) في كل boot/إشارة، حتى بلا تغيير.
2. **السيرفر (الأكبر)** — `server/supabaseRealtime.ts` كان مازال يستعمل `postgres_changes` على `user_data` → Supabase يبعث الصف كامل (~2.2 MB) عبر WebSocket في **كل** كتابة، حتى push السيرفر نفسه + عاصفة reconnect كل ~5-10s.

### الإصلاحات المطبّقة (2026-06-16)
**كود:**
- `src/lib/cloudSync.ts` — **pull شرطي**: يقرأ `updated_at` (~30 بايت) قبل تنزيل الـ blob؛ ينزّل فقط إذا تغيّر. + `LAST_PULLED_AT_KEY`.
- `server/supabaseRealtime.ts` — استبدال `postgres_changes` بـ **Broadcast** + pull شرطي (`pullAndMerge`) + safety interval (5 دقائق) + reconnect backoff.
- `src/lib/supabaseClient.ts` + `server/supabaseRealtime.ts` — `realtime.reconnectAfterMs` تصاعدي محدود بـ 5 دقائق (بدل martèlement كل 10s) → حلّ فيضان الـ console (~50k رسالة).

**قاعدة البيانات (عبر MCP):**
- `ALTER PUBLICATION supabase_realtime DROP TABLE public.user_data` (إيقاف فك WAL).
- migration `optimize_rls_initplan_auth_calls` — لفّ `auth.uid()/auth.jwt()` في `(select …)` (9 سياسات).
- migration `revoke_public_execute_on_internal_functions` — REVOKE EXECUTE على `rls_auto_enable()` + `touch_ticket_on_message()`.
- `VACUUM (FULL, ANALYZE) public.user_data` → 11 MB ⟶ 3.67 MB.
- إنشاء bucket `bera-assets` + سياسات Storage (`supabase_storage_setup.sql`).

**الأثر المتوقّع:** egress من ~9.5 GB/أيام ⟶ **~1–1.5 GB/شهر** (للحجم الحالي) → مريح داخل المجّاني.

**الحالة:** ✅ السبب مُصلَّح · ⏳ تحقّق حيّ معلّق (المشروع مقيّد حتى 12 يوليوز / أو منظّمة جديدة) · ❌ الـ egress المستهلَك لا يُسترجَع.

---

## 3. المبادئ المعمارية الأساسية

### 3.1 Local-First
الجهاز هو مصدر الحقيقة (SQLite محلي). السحابة طاحت → البرنامج يكمّل، المزامنة تُستأنف عند الرجوع. **السحابة لا تُوقِف العمل أبداً.**

### 3.2 الأدمين = سيرفر · العامل = client
- **الأدمين:** تطبيق ثقيل (Electron) فيه Express :7000 + SQLite → سيرفر الشركة، يحمل **الاتحاد الكامل** للبيانات.
- **العامل:** client خفيف (Capacitor mobile / web) يتّصل بسيرفر الأدمين عبر LAN أو السحابة.

### 3.3 Delta Sync (مزامنة تفاضلية) — *مختار: بناء مخصّص، تدريجي*
بدل بعث الـ snapshot الكامل، نبعث **فقط الصفوف اللي تبدّلت**:
- كل كيان = صفّ مستقل بـ `id`, `updated_at`, `deleted_at`.
- الجهاز يتذكّر `last_synced_at` ويجلب `where updated_at > last_synced_at`.
- **الأساس موجود:** `__schema_version` + `migrateSnapshot` (`dataVersion.ts`).

### 3.4 الوسائط في Buckets (ماشي inline)
الصور تُرفع لـ Storage (`bera-assets`) وتُخزَّن كـ **رابط** بدل base64 داخل الـ blob → الـ blob من ~2.2 MB ⟶ ~0.3 MB. (الكود يدعمه أصلاً؛ كان ينقصه الـ bucket — أُنشئ.)

### 3.5 RBAC عبر RLS (صلاحيات مفروضة في قاعدة البيانات)
دابا الصلاحيات (الأدوار/التقسيمات) **في الواجهة فقط = هشّة**. الهدف: فرضها بـ **RLS** على مستوى الـ DB:
- `partition_id` / `role` لكل صفّ → سياسة SELECT تكشف القسم المسموح.
- **أمان حقيقي** (لا يُتجاوَز حتى بالـ anon key).

### 3.6 الحذف بالملكية + Tombstones (نموذج WhatsApp)
- كل صفّ عندو `created_by` (الصاحب).
- **يمسح فقط ما عمّر هو** — RLS: `using ((select auth.uid()) = created_by)`.
- الحذف = **soft delete** (علامة `deleted_at`/tombstone، الصفّ يبقى **مخفي** ماشي ممحو).
- **نافذة استرجاع** قابلة للضبط (15 دقيقة / 1h) → Corbeille. بعدها purge حقيقي.
- غير المالك «يمسح نسختو» = إزالة محلية، يُعاد جلبها من السحابة (إن لم يمسحها المالك).
- **الأساس موجود:** `apiShim.ts` (tombstones + `beraCorbeille` + `purgeExpiredTombstones`).

### 3.7 Multi-Transport (LAN-first + جسر سحابي)
- **نفس الشبكة (WiFi المصنع):** الأجهزة تزامن مباشرة مع سيرفر الأدمين المحلي (LAN) — سريع، بلا إنترنت.
- **جهاز بعيد / شبكة مختلفة:** يبدّل للجسر السحابي تلقائياً.
- **منطق الاختيار:** جرّب LAN (mDNS/discovery) → إن فشل → سحابة. **لا جهاز يتوقّف.**
- يعالج حالة «5 routers»: إن كانت شبكة واحدة → LAN في كل مكان؛ إن منفصلة → الأجهزة البعيدة تستعمل السحابة.

### 3.8 طبقات الـ Backup
1. **Local export** (زرّ → ملف) — فوري، الأساس.
2. **Git/GitHub (repo خاص)** — للنصّ (JSON): تاريخ كامل + diff + استرجاع أي تاريخ («آلة زمن»). ⭐
3. **Google Drive (المالك)** — backups/أرشيف ثقيل (نموذج WhatsApp: على حساب المستخدم).
- الصور **ماشي في Git** (تضخّم) → Storage/Drive.
- **Backup إجباري** لأن PC الأدمين = نقطة فشل وحيدة.

### 3.9 طبقة السمسار (مشاركة بموافقة — consent-based)
- المالك (سمسار) يرى **فقط** ما وافقت الشركة على مشاركته.
- **صنفان للبيانات:** خاصّة (لا يراها السمسار، تبقى معزولة) · مشتركة بموافقة (تُزامَن للسحابة بعلامة `shared`).
- RLS تفرضها: `to broker using (shared_with_broker = true)` → مستحيل تقنياً رؤية غير المشترك.
- granular + revocable + auditable. (الثقة = التبنّي.)

### 3.10 استقلالية المزوّد (Config Indirection) — *قرار مبكّر مهمّ*
**لا تكتب عنوان السحابة في الكود.** البرنامج يجلب إعداد الـ backend من **نقطة ثابتة تتحكّم فيها** (مثلاً `config.beramethode.com`) أو من **API gateway خاص بك**. → تبديل المزوّد (Supabase → سحابة أخرى → سيرفر agence) = تعديل **نقطة واحدة**، بلا إعادة تثبيت. Local-first يجعل البيانات غير محبوسة (المصدر محلي).

### 3.11 توافق النسخ + التحديثات
- **تحديث بموافقة الأدمين:** إشعار «نسخة جديدة → تحدّث؟» (electron-updater notify mode).
- **توافق النسخ:** تغييرات إضافية فقط + `schema_version` + قراءة متسامحة + migrations → نسخ مختلفة تشتغل معاً.
- واقعياً: دعم **مجال** من النسخ الحديثة + **نسخة دنيا** (تحتها تحديث إجباري، نادر — كما WhatsApp).
- التحكّم في «النسخة الدنيا المدعومة» عبر Bera-master-admin.

---

## 4. نموذج النشر (Deployment)

| المنصّة | التقنية | الحجم التقريبي | الدور |
|---|---|---|---|
| Windows `.exe` | Electron (بديل: Tauri ~10MB) | ~70–120 MB | الأدمين (سيرفر كامل) |
| Mac `.dmg` | Electron / Tauri | ~80–150 MB / ~10MB | الأدمين |
| Android `.apk` | Capacitor | ~10–25 MB | العامل (client) |
| iOS `.ipa` | Capacitor | ~15–30 MB | العامل (client) |

> **كود BERAMETHODE الصافي ≈ 4 MB.** الباقي = المحرّك (Chromium/Node/WebView).

**سيناريو التثبيت:** مفتاح من Bera-master-admin → تثبيت `.exe` على PC الأدمين → إدخال المفتاح (تحقّق online) → تشغيل تلقائي للسيرفر + إنشاء DB + حساب الأدمين → إضافة العمّال (أدوار/أقسام) → العمّال يتّصلون عبر QR/كود ربط (LAN) → backup تلقائي.

---

## 5. نموذج البيانات المستهدف (Data Model)

الانتقال من **blob واحد** (`user_data.data`) إلى **جداول حقيقية**، صفّ لكل كيان:

```
<entity> (models, workers, suivi, magasin, planning, ...)
  ├── id            (PK)
  ├── tenant_id     (الشركة / workspace)
  ├── created_by    (الصاحب — للحذف بالملكية)
  ├── partition_id  (القسم/الدور — للرؤية)
  ├── data          (محتوى الكيان)
  ├── updated_at    (للـ delta sync) + trigger
  ├── deleted_at    (tombstone / soft delete)
  └── shared_with_broker (bool — لطبقة السمسار)
```

**RLS نموذجية:**
- SELECT: `tenant_id = mine AND partition مسموح لدوري` (+ السمسار: `shared_with_broker = true`).
- UPDATE/DELETE: `created_by = (select auth.uid())` (يمسح فقط ما عمّر).

---

## 6. Plan B / الصمود (Graceful Degradation)

| الطبقة | تعتمد على | تحلّ |
|---|---|---|
| 0. محلي-أولاً | SQLite محلي | السحابة طاحت → يكمّل |
| 0.5. مصادقة محلية ✅ | Express JWT (بلا Supabase) | **موجودة ديجا** في وضع Express (`authController.ts`) |
| 1. طابور offline | تخزين محلي للتغييرات | يُدفَع عند الرجوع |
| 2. backups | Git/Drive/export | استرجاع |
| 3. relay بديل (LAN/P2P) | الشبكة المحلية | مزامنة بلا سحابة |

> **اكتشاف مهمّ (2026-06-16):** المصادقة المحلية **موجودة بالكامل** في وضع Express (`VITE_STATIC_MODE` غير مفعّل): `server/authController.ts` = login/register عبر bcrypt + JWT cookie + جدول SQLite `users`، **صفر اعتماد على Supabase**. → الـ **.exe (وضع Express) يدخل محلياً حتى بلا إنترنت/سحابة**. العطل وقع فقط لأن نسخة **الويب (Vercel static, `VITE_STATIC_MODE=true`)** تستعمل Supabase auth حصرياً — وهذا قيد جوهري للاستضافة الساكنة (لا سيرفر/DB محلي). **الإجراء = أولوية شحن الـ .exe (وضع Express)، ماشي كتابة كود مصادقة جديد.** نسخة الويب تبقى cloud-dependent بطبيعتها (لكنها تتدهور بلطف: timeout + رسالة "service injoignable" واضحة بدل تجميد).

---

## 7. ما هو جاهز vs ما يحتاج بناء

| القطعة | الحالة |
|---|---|
| الواجهة + المنطق + SQLite محلي | ✅ موجود |
| نظام tombstones + Corbeille | ✅ موجود (`apiShim.ts`) |
| الأدوار/الأقسام (`BERA_CUSTOM_ROLES`...) | ✅ موجود (واجهة فقط) |
| `__schema_version` + migrations | ✅ موجود |
| التراخيص (Bera-master-admin) | ✅ مشروع 2 |
| إصلاحات Egress + RLS + bucket | ✅ مطبّق (2026-06-16) |
| تغليف `.exe` (Electron) + auto-start | 🔨 خاص يتبنى |
| ربط LAN + QR pairing | 🔨 خاص يتبنى |
| Delta sync + جداول حقيقية + RLS كامل | 🔨 خاص يتبنى (تدريجياً) |
| `created_by` + الحذف بالملكية (RLS) | 🔨 خاص يتبنى |
| طبقة السمسار (مشاركة بموافقة) | 🔨 خاص يتبنى |
| backup تلقائي (Git/Drive) | 🔨 خاص يتبنى |
| مصادقة محلية fallback | ✅ موجودة (وضع Express، `authController.ts`) — الإجراء = شحن الـ .exe |
| Config indirection (استقلالية المزوّد) | 🔨 قرار مبكّر |
| auto-update (electron-updater) | 🔨 خاص يتبنى |

---

## 8. خارطة الطريق (Roadmap)

> مبدأ: **تدريجي + مختبر.** كل مرحلة تُختبَر على بيانات حقيقية قبل التالية. كيان بكيان.

### المرحلة 0 — رجوع للخدمة (فوري) 🔴
- [ ] منظّمة Supabase جديدة (quota صافية) **أو** انتظار 12 يوليوز.
- [ ] ربط المشروع الجديد: تشغيل `supabase_schema.sql` + `supabase_storage_setup.sql`.
- [ ] تحديث `.env` + الـ fallbacks (URL + anon key) + متغيّرات Vercel.
- [ ] إعادة ربط Google OAuth (callback URL الجديد + client id/secret).
- [ ] **تبديل `service_role` key** (شُورِك بالخطأ).
- [ ] تفعيل Leaked Password Protection (Dashboard → Auth).
- [ ] **تحقّق حيّ:** الخدمة ترجع + الـ egress يبقى منخفض.

### المرحلة 1 — تخفيف فوري آمن (بعد الرجوع) 🟠
- [ ] التأكّد أن الصور تمشي للـ bucket (الكود يدعمه) → الـ blob يصغر.
- [x] ~~مصادقة محلية fallback~~ — **موجودة ديجا** في وضع Express (`authController.ts`). الإجراء البديل: **أولوية شحن الـ .exe** (وضع Express) كمنتج أساسي → Plan B يتحقّق تلقائياً.
- [ ] طابور offline موثّق.

### المرحلة 2 — Config Indirection (قرار مبكّر) 🟡
- [ ] نقطة config تتحكّم فيها (عنوان backend) بدل hardcode.
- [ ] (اختياري) API gateway خاص للاستقلال الكامل عن المزوّد.

### المرحلة 3 — Delta Sync (تدريجي، كيان بكيان) 🟢
- [ ] جدول `models` حقيقي + `created_by/updated_at/deleted_at` + trigger.
- [ ] push يبعث الصفّ المتغيّر فقط · pull يجلب الفرق فقط.
- [ ] RLS: عزل + ملكية الحذف. **اختبار دقيق.**
- [ ] تكرار نفس النمط: `workers` → `suivi` → `magasin` → ...
- [ ] حلّ التعارض (آخر كتابة تربح، أو أذكى).

### المرحلة 4 — RBAC كامل (صلاحيات في DB) 🟢
- [ ] `partition_id`/`role` لكل صفّ + سياسات RLS للرؤية.
- [ ] نقل الأدوار/الأقسام من الواجهة إلى فرض RLS.

### المرحلة 5 — التغليف Desktop/Mobile 🔵
- [ ] Electron للأدمين (auto-start السيرفر + DB) + auto-update (electron-updater).
- [ ] Capacitor للعمّال (client).
- [ ] LAN discovery + QR pairing.

### المرحلة 6 — backups + طبقة السمسار 🔵
- [ ] backup تلقائي (Git repo خاص + Drive).
- [ ] صنفا البيانات (خاص/مشترك) + لوحة السمسار + RLS `broker`.

### المرحلة 7 — Plan B متقدّم (اختياري) ⚪
- [ ] relay بديل LAN/P2P عند انقطاع السحابة.

---

## 9. قرارات معمارية مبكّرة (افعلها قبل ما يكثر العملاء)

1. **Config indirection** — لا تكتب عنوان السحابة في الكود (وإلا تبديل المزوّد لاحقاً يتطلّب تحديث إجباري للجميع).
2. **مصادقة محلية fallback** — الدخول لا يعتمد على السحابة وحدها.
3. **schema versioning صارم** — كل تغيير بيانات إضافي + migration، لضمان توافق النسخ.
4. **Backup إجباري من اليوم** — PC الأدمين نقطة فشل وحيدة.

---

## 10. مسرد المصطلحات

| المصطلح | المعنى |
|---|---|
| Local-First | الجهاز مصدر الحقيقة؛ السحابة إضافة |
| Egress | البيانات الصادرة من السحابة (التنزيل) — سقف Supabase Free = 5 GB |
| Delta Sync | مزامنة الفرق فقط، ماشي الحالة كاملة |
| Tombstone | علامة حذف (soft delete) تنتشر بدل المحو الفوري |
| RLS | Row Level Security — صلاحيات على مستوى الصفّ في Postgres |
| RBAC | صلاحيات بالأدوار |
| Broadcast | قناة Realtime WebSocket خفيفة (بلا فك WAL) |
| Store-and-Forward | السيرفر يرحّل ويخزّن مؤقتاً حتى التسليم (نموذج WhatsApp) |
| Config Indirection | جلب إعداد الـ backend من نقطة قابلة للتبديل |

---

*آخر تحديث: 2026-06-16. هذه وثيقة حيّة — تُحدَّث مع كل قرار معماري.*
