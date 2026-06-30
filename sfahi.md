# 🌲 BERAMETHODE — شجرة الصفحات والفروع

> كل الوحدات مع فروعها الداخلية وروابط URL

---

## 📖 كيف تقرأ هذا المستند

```
🌐 الوحدة (اسم المسار)
│
├─ 📄 الصفحة الفرعية — الاسم
│  URL: #الوحدة/الفرع
│  المكوّن: ComponentName.tsx
│  الوظيفة: شرح مختصر
│
├─ 🪟 النافذة المنبثقة — الاسم
│  تظهر عند: حدث معين
```

---

## 1. 🔐 المصادقة — Auth

### 1.1 تسجيل الدخول

```
🌐 login
│
├─ 📄 تسجيل الدخول
│  URL: #login
│  المكوّن: Login.tsx (667 سطر)
│
├─ 📄 نسيت كلمة السر — الخطوة 1: البريد
│  URL: #login/forgot/1
│  ↳ showForgotPassword = true, resetStep = 1
│
├─ 📄 نسيت كلمة السر — الخطوة 2: OTP
│  URL: #login/forgot/2
│  ↳ resetStep = 2
│
└─ 📄 نسيت كلمة السر — الخطوة 3: كلمة جديدة
   URL: #login/forgot/3
   ↳ resetStep = 3
```

### 1.2 إنشاء حساب

```
🌐 signup
│
└─ 📄 إنشاء حساب
   URL: #signup
   المكوّن: Signup.tsx (288 سطر)
   ↳ بعد الإرسال → رسالة تأكيد (confirmationSent)
```

---

## 2. 📊 نظرة عامة — Vue Générale

```
🌐 vuegenerale
│
└─ 📄 نظرة عامة (صفحة واحدة)
   URL: #vuegenerale
   المكوّن: VueGenerale.tsx (343 سطر)
   ↳ تحتوي على: حالة الآلات + خطوط الإنتاج + ملخص التخطيط
```

---

## 3. 📈 لوحة القيادة — Dashboard

```
🌐 dashboard
│
├─ 📄 لوحة القيادة (صفحة واحدة)
│  URL: #dashboard
│  المكوّن: Dashboard.tsx (642 سطر)
│  ↳ تحتوي على:
│     ├─ Hero: إنتاج اليوم / TRS / OF قيد التنفيذ
│     ├─ بطاقات KPI الثانوية
│     ├─ شريط تنبيه المخزون
│     ├─ رسم بياني للإنتاج (Recharts)
│     ├─ مركز الإجراءات (Andon + المهام)
│     ├─ رسم بياني لمردودية الخطوط
│     └─ تقويم الشهر
│
└─ 🪟 نافذة تخطي المهمة
   ↳ skipReasonModal → إدخال سبب التخطي
```

---

## 4. 🏭 الهندسة — Ingénierie

```
🌐 ingenierie
│
├─ 📄 الملف التقني — Fiche Technique
│  URL: #ingenierie/fiche
│  ↳ currentStep = 'fiche'
│
├─ 📄 تسلسل العمليات — Gamme
│  URL: #ingenierie/gamme
│  ↳ currentStep = 'gamme'
│
├─ 📄 ضبط الوقت — Chronométrage
│  URL: #ingenierie/chrono
│  ↳ currentStep = 'chrono'
│  المكوّن: Chronometrage.tsx
│
├─ 📄 التحليل التقني — Analyse Technologique
│  URL: #ingenierie/analyse
│  ↳ currentStep = 'analyse'
│  المكوّن: AnalyseTechnologique.tsx
│
├─ 📄 التوازن ـ Équilibrage
│  URL: #ingenierie/equilibrage
│  ↳ currentStep = 'equilibrage'
│  المكوّن: Balancing.tsx
│
├─ 📄 التخطيط — Implantation
│  URL: #ingenierie/implantation
│  ↳ currentStep = 'implantation'
│  المكوّن: Implantation.tsx
│
├─ 📄 التكاليف والميزانية — Coûts & Budget
│  URL: #ingenierie/couts
│  ↳ currentStep = 'couts'
│  المكوّنات: CostCalculator.tsx + CostPartials.tsx + CostSanityCheck.tsx
│
└─ 📄 الطلبية — Pedido / Order
   URL: #ingenierie/pedido
   ↳ currentStep = 'pedido'
   المكوّن: Pedido.tsx
```

---

## 5. 📚 المكتبة — Library

```
🌐 library
│
├─ 📄 عرض شبكي
│  URL: #library/grid
│  ↳ viewMode = 'grid'
│
├─ 📄 عرض جدولي
│  URL: #library/list
│  ↳ viewMode = 'list'
│
├─ 📄 فرز حسب التاريخ
│  URL: #library/grid?sort=date
│  ↳ sortBy = 'date'
│
├─ 📄 فرز حسب الاسم
│  URL: #library/grid?sort=name
│  ↳ sortBy = 'name'
│
└─ 🪟 قائمة السياق (ContextMenu)
   ↳ فتح, تعديل الاسم, تكرار, حذف, نقل
```

---

## 6. ✂️ القص — La Coupe

```
🌐 coupe
│
├─ 📄 عرض القائمة
│  URL: #coupe/list
│  ↳ viewMode = 'list'
│
├─ 📄 عرض اللوحة (Kanban)
│  URL: #coupe/board
│  ↳ viewMode = 'board'
│  ↳ سحب وإفلات حسب الحالة
│
├─ 📄 عرض التقويم
│  URL: #coupe/calendar
│  ↳ viewMode = 'calendar'
│
├─ 📄 عرض الإحصائيات
│  URL: #coupe/stats
│  ↳ viewMode = 'stats'
│
├─ 📄 لوحة التحرير الجانبية
│  URL: #coupe/board/{modelId}
│  ↳ selectedModel + sidebarOpen
│  ↳ تحتوي على: المصفوفة, الماطيلاس, المواد
│
└─ 🪟 مرشحات
   ↳ filterStatus: ALL, EN_PREPARATION, EN_COURS, SOUS_TRAITANCE, VALIDE, REJETE
```

---

## 7. 👥 التأطير — Effectifs

```
🌐 effectifs
│
├─ 📄 شبكة الإنتاج (جدول يومي)
│  URL: #effectifs/grid
│  ↳ activeTab = 'grid'
│
├─ 📄 التحليلات والرسوم البيانية
│  URL: #effectifs/analytics
│  ↳ activeTab = 'analytics'
│
└─ 🪟 ConfirmModal + DateTimePicker + ملاحظات
```

---

## 8. 👔 الموارد البشرية — Gestion RH

```
🌐 gestionRh
│
├─ 📄 دليل العمال — Annuaire
│  URL: #gestionRh/annuaire
│  ↳ tab = 'annuaire'
│
├─ 📄 الحضور — Pointage
│  URL: #gestionRh/pointage
│  ↳ tab = 'pointage'
│  ↳ pointageSearch, pointageChaine
│
├─ 📄 السلفات — Avances
│  URL: #gestionRh/avances
│  ↳ tab = 'avances'
│
├─ 📄 الإنتاج — Production
│  URL: #gestionRh/production
│  ↳ tab = 'production'
│
├─ 📄 تصدير Sage
│  URL: #gestionRh/sage
│  ↳ tab = 'sage'
│
└─ 🪟 لوحة ملف العامل
   ↳ HRWorkerProfilePanel
```

---

## 9. 📅 التخطيط — Planning

```
🌐 planning
│
├─ 📄 مخطط جانت — Gantt
│  URL: #planning/gantt
│  ↳ view = 'gantt'
│
├─ 📄 عرض التقويم — Calendar
│  URL: #planning/calendar
│  ↳ view = 'calendar'
│
├─ 📄 عرض البطاقات — Cards
│  URL: #planning/cards
│  ↳ view = 'cards'
│
├─ 📄 محاكي الإنتاج — Simulation
│  URL: #planning/simulation
│  ↳ view = 'simulation'
│
├─ 🪟 إنشاء/تعديل حدث
│  ↳ EventEditor (editorMode: create|edit)
│
├─ 🪟 تقسيم OF
│  ↳ SplitModal (mode: simple|lots)
│
├─ 🪟 تحسين بالذكاء الاصطناعي
│  ↳ AIOptimizationModal
│
├─ 🪟 لوحة المشكلات
│  ↳ IssuesPanel
│
└─ 🪟 لوحة تفاصيل الحدث
   ↳ EventDetailPanel (details|activity|notes|materials)
```

---

## 10. 📊 متابعة الإنتاج — Suivi

```
🌐 suivi
│
├─ 📄 متابعة خط الإنتاج
│  URL: #suivi/{chainId}
│  ↳ selectedChaineId, weekStart
│  ↳ جدول الأسبوع × الساعات
│
├─ 📄 تفاصيل الخلية
│  URL: #suivi/{chainId}/{cellId}
│  ↳ activeCellModal → تعديل الكمية، العيوب، وقت التوقف
│
├─ 📄 عرض الجوال (أسبوعي)
│  URL: #suivi/{chainId}/mobile
│  ↳ mobileWeekView = true
│
└─ 🪟 تخصيص ألوان OF
   ↳ ofColorOverrides
```

---

## 11. 📈 العائد — Rendement

```
🌐 rendement
│
├─ 📄 حسب اليوم — Par Jour
│  URL: #rendement/jour
│  ↳ tab = 'jour'
│
├─ 📄 حسب النموذج — Par Modèle
│  URL: #rendement/modele
│  ↳ tab = 'modele'
│
├─ 📄 حسب المحطة — Par Poste
│  URL: #rendement/poste
│  ↳ tab = 'poste'
│
└─ 📄 الآلة والشركة — Machine
   URL: #rendement/machine
   ↳ tab = 'machine'
```

---

## 12. 📦 المخزن — Magasin

```
🌐 magasin
│
├─ 📄 لوحة القيادة — Dashboard
│  URL: #magasin/dashboard
│  ↳ tab = 'dashboard'
│
├─ 📄 قاعدة البيانات — DB
│  URL: #magasin/db
│  ↳ tab = 'db'
│
├─ 📄 مكتب المعاملات — Bureau
│  URL: #magasin/bureau
│  ↳ tab = 'bureau'
│  ↳ bMode: entree|sortie|rebut|retour_atelier
│
├─ 📄 طلبات الورشة — Demandes
│  URL: #magasin/demandes
│  ↳ tab = 'demandes'
│
├─ 📄 أوامر الشراء — Commandes
│  URL: #magasin/commandes
│  ↳ tab = 'commandes'
│
├─ 📄 تنبيهات المخزون — Alertes
│  URL: #magasin/alertes
│  ↳ tab = 'alertes'
│
├─ 📄 الجرد — Inventaire
│  URL: #magasin/inventaire
│  ↳ tab = 'inventaire'
│
├─ 📄 التتبع — Traçabilité
│  URL: #magasin/tracabilite
│  ↳ tab = 'tracabilite'
│
├─ 📄 إدارة المستودعات — WMS
│  URL: #magasin/wms
│  ↳ tab = 'wms'
│
├─ 📄 الموردين — Fournisseurs
│  URL: #magasin/fournisseurs
│  ↳ tab = 'fournisseurs'
│
├─ 📄 تقييم المخزون — Valorisation
│  URL: #magasin/valorisation
│  ↳ tab = 'valorisation'
│
├─ 📄 الاستلامات — Réceptions
│  URL: #magasin/receptions
│  ↳ tab = 'receptions'
│
├─ 📄 الفائض — Surplus
│  URL: #magasin/surplus
│  ↳ tab = 'surplus'
│
├─ 📄 فواتير — Factures
│  URL: #magasin/factures
│  ↳ tab = 'factures'
│
├─ 📄 المخزون التام — Stock PF
│  URL: #magasin/stockPF
│  ↳ tab = 'stockPF'
│
└─ 🪟 إعدادات الفاتورة
   ↳ InvoiceSettingsModal (identity|design|fields|visibility)
```

---

## 13. 📤 المخزون النهائي — Export / Stock Fini

```
🌐 export
│
├─ 📄 التشطيب — Finition
│  URL: #export/finition
│  ↳ activeTab = 'finition'
│
├─ 📄 التعبئة — Emballage
│  URL: #export/emballage
│  ↳ activeTab = 'emballage'
│
├─ 📄 الكامل — Complet
│  URL: #export/complet
│  ↳ activeTab = 'complet'
│
├─ 📄 إدخال يومي
│  URL: #export/{tab}/jour
│  ↳ entryMode = 'jour'
│
└─ 📄 إدخال بالساعة
   URL: #export/{tab}/heure
   ↳ entryMode = 'heure'
```

---

## 14. 💰 الفوترة — Facturation

```
🌐 facturation
│
├─ 📄 فواتير البيع — VENTE
│  URL: #facturation/vente
│  ↳ activeTab = 'VENTE'
│
├─ 📄 فواتير الشراء — ACHAT
│  URL: #facturation/achat
│  ↳ activeTab = 'ACHAT'
│
├─ 📄 عروض الأسعار — DEVIS
│  URL: #facturation/devis
│  ↳ activeTab = 'DEVIS'
│
└─ 📄 إيصالات التسليم — BL
   URL: #facturation/bl
   ↳ activeTab = 'BL'
```

---

## 15. ⚙️ الإعدادات — Configuration

```
🌐 config
│
├─ 📄 الإعدادات العامة
│  URL: #config/general
│  ↳ العملة، تنسيق الوقت
│
├─ 📄 الموارد البشرية — RH
│  URL: #config/rh
│  ↳ الحضور والمحاسبة
│
├─ 📄 أوقات العمل — Horaires
│  URL: #config/horaires
│  ↳ أيام وساعات العمل
│
├─ 📄 أنظمة المقاسات — Tailles
│  URL: #config/tailles
│
├─ 📄 الهيكل — Structure
│  URL: #config/structure
│  ↳ المدراء العامون، موظفو كل خط
│
├─ 📄 محرك التخطيط — APS
│  URL: #config/aps
│  ↳ إعدادات APS Engine
│
├─ 📄 الآلات — Machines
│  URL: #config/machines
│
├─ 📄 المهام — Tâches
│  URL: #config/taches
│
└─ 🪟 نافذة الأجندة
   ↳ AgendaModal
```

---

## 16. 👤 الملف الشخصي — Profil

```
🌐 profil
│
├─ 📄 بطاقة الملف الشخصي
│  URL: #profil
│  ↳ الاسم، البريد، الدور
│
├─ 📄 تعديل المعلومات
│  URL: #profil/edit
│  ↳ الاسم، الهاتف، المهنة
│
└─ 📄 الفريق والصلاحيات (للمشرف فقط)
   URL: #profil/team
   ↳ showAccess = true + PermissionsManager
```

---

## 17. 🔧 متابعة الآلات — PageMachine

```
🌐 pageMachine
│
├─ 📄 نظرة عامة على الأسطول
│  URL: #pageMachine/overview
│  ↳ activeTab = 'OVERVIEW'
│
├─ 📄 الصيانة — Maintenance
│  URL: #pageMachine/maintenance
│  ↳ activeTab = 'MAINTENANCE'
│
├─ 📄 سجل الأسطول — History
│  URL: #pageMachine/history
│  ↳ activeTab = 'HISTORY'
│
├─ 🪟 محرر الآلة
│  ↳ instanceEditorOpen
│
├─ 🪟 تسجيل خروج آلة
│  ↳ exitModalOpen
│
├─ 🪟 مسح QR
│  ↳ scanOpen
│
└─ 🪟 اختصار التصنيف
   ↳ classShortcutOpen
```

---

## 18. 🏗️ كتالوج الآلات — Machin

```
🌐 machin
│
├─ 📄 القائمة الرئيسية — Menu
│  URL: #machin/menu
│  ↳ currentView = 'menu'
│
├─ 📄 كتالوج الآلات — Machines
│  URL: #machin/machines
│  ↳ currentView = 'machines'
│
├─ 📄 الأوقات القياسية — Standards
│  URL: #machin/standards
│  ↳ currentView = 'standards'
│  ↳ SpeedFactors + ComplexityFactors + StandardTimes
│
├─ 📄 الأدلة — Guides
│  URL: #machin/guides
│  ↳ currentView = 'guides'
│
└─ 📄 أنواع الغرز — Fil
   URL: #machin/fil
   ↳ currentView = 'fil'
```

---

## 19. 🏭 ورشة الإنتاج — Atelier

```
🌐 atelierProd
│
├─ 📄 لوحة قيادة اليوم
│  URL: #atelierProd/dashboard
│  ↳ tab = 'dashboard'
│  ↳ عرض OF الجارية
│
├─ 📄 طلبات المواد — Demandes
│  URL: #atelierProd/demandes
│  ↳ tab = 'demandes'
│  ↳ إرسال طلب توريد
│
└─ 📄 إغلاق OF — Clôture
   URL: #atelierProd/cloture
   ↳ tab = 'cloture'
   ↳ إرجاع المواد
```

---

## 20. 🤝 المقاولة — Sous-Traitance

```
🌐 sousTraitance
│
├─ 📄 الطلبيات — Orders
│  URL: #sousTraitance/orders
│  ↳ activeTab = 'orders'
│  ↳ viewMode: card|table
│  ↳ searchQuery + statusFilter + subcontractorFilter
│
├─ 📄 المقاولون — Subcontractors
│  URL: #sousTraitance/subcontractors
│  ↳ activeTab = 'subcontractors'
│
├─ 📄 المخزون — Stock
│  URL: #sousTraitance/stock
│  ↳ activeTab = 'stock'
│
├─ 📄 المجموعات — Groups
│  URL: #sousTraitance/groups
│  ↳ activeTab = 'groups'
│
└─ 🪟 نوافذ الإضافة/التعديل/التفاصيل
   ↳ isAddModalOpen, isEditModalOpen, isDetailModalOpen
```

---

## 21. ⏱️ كتالوج الأوقات — Catalogue Temps

```
🌐 catalogTemps
│
└─ 📄 كتالوج الأوقات (صفحة واحدة)
   URL: #catalogTemps
   المكوّن: CatalogueTemps.tsx (861 سطر)
   ↳ تحتوي على: بحث، تصنيف، فرز، تجميع تلقائي
```

---

## 22. 🛡️ المشرف — Admin

```
🌐 admin
│
├─ 📄 الشركة — Company
│  URL: #admin/company
│  ↳ tab = 'company'
│  ↳ الاسم، الشعار، التخصص، نوع الحساب
│
├─ 📄 الفريق والأدوار — Team
│  URL: #admin/team
│  ↳ tab = 'team'
│  ↳ PermissionsManager
│
├─ 📄 المستخدمون — Users
│  URL: #admin/users
│  ↳ tab = 'users'
│  ↳ قائمة وإدارة المستخدمين
│
└─ 📄 البيانات — Data
   URL: #admin/data
   ↳ tab = 'data'
   ↳ النسخ الاحتياطي والاستيراد/التصدير
```

---

## 📊 إحصائيات عامة

| القياس | العدد |
|---|---|
| الوحدات الرئيسية | 23 |
| الصفحات الفرعية (sub-pages) | 75+ |
| النوافذ المنبثقة (modals) | 20+ |
| أكبر وحدة (Magasin) | 15 تابة |
| وحدة متعددة الخطوات (Ingenierie) | 8 خطوات |
| وحدة متعددة طرق العرض (Planning) | 4 عروض |

## 🧭 كيف تتنقل بالفروع

```
المستخدم الحالي: setTab / activeTab / view (تغيير داخلي فقط)
─────────────────────────────────────────────────────────────
مثلاً فـ Magasin:
  → المستخدم يضغط على "Bureau"
  → setTab('bureau') ← تغيير الحالة فقط
  → الـ URL ما يتغيرش (#magasin)

المستخدم المطلوب: navigate('magasin', 'bureau') (تغيير داخلي + URL)
─────────────────────────────────────────────────────────────────────
  → المستخدم يضغط على "Bureau"
  → setTab('bureau')
  → navigate('magasin', 'bureau')
  → الـ URL يتغير: #magasin/bureau
  → المستخدم يقدر يشارك الرابط أو يرجع له
```

**هذا هو الهيكل الكامل.** كل وحدة، كل صفحة فرعية، وكل رابط URL ممكن.
