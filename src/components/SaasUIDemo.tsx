import React, { useState } from 'react';
import {
  LayoutDashboard,
  Package,
  Users,
  TrendingUp,
  Activity,
  Settings,
  Search,
  Plus,
  Edit3,
  Trash2,
  Download,
  Filter,
  BarChart3,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { tx } from '../../lib/i18n';
import { useLang } from '../../src/context/LanguageContext';
import {
  SaasPanel,
  SaasEmpty,
  SaasDivider,
  SaasCard,
  SaasCardGrid,
  CardValue,
  SaasStat,
  SaasStatGrid,
  SaasButton,
  SaasButtonGroup,
  SaasIconButton,
  SaasInput,
  SaasSelect,
  SaasTextarea,
  SaasToggle,
  SaasTable,
  type SaasColumn,
} from './ui';

/* ─── Demo Data ─── */
const DEMO_ROWS = [
  { id: '1', nom: 'Surjeteuse 516', classe: '516', vitesse: 5500, statut: 'OK', atelier: 'A1' },
  { id: '2', nom: 'Casseuse 301', classe: '301', vitesse: 4200, statut: 'PANNE', atelier: 'B2' },
  { id: '3', nom: 'Recouvreuse 402', classe: '402', vitesse: 3800, statut: 'OK', atelier: 'A2' },
  { id: '4', nom: 'Piqueuse 700', classe: '700', vitesse: 6000, statut: 'MAINT', atelier: 'C1' },
  { id: '5', nom: 'Brodeuse 801', classe: '801', vitesse: 1200, statut: 'OK', atelier: 'A3' },
];

/* ─── Demo Component ─── */
export default function SaasUIDemo() {
  const { lang } = useLang();
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [toggleA, setToggleA] = useState(true);
  const [toggleB, setToggleB] = useState(false);

  const columns: SaasColumn[] = [
    { key: 'nom', label: 'Machine', sortable: true, truncate: true },
    { key: 'classe', label: 'Classe', sortable: true, align: 'center' },
    { key: 'vitesse', label: 'Vitesse', sortable: true, align: 'right', tabular: true, render: (v) => `${v.toLocaleString('fr')} cpm` },
    {
      key: 'statut',
      label: 'Statut',
      sortable: true,
      align: 'center',
      render: (v: string) => {
        const colors: Record<string, string> = {
          OK: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          PANNE: 'bg-red-50 text-red-600 border-red-200',
          MAINT: 'bg-amber-50 text-amber-600 border-amber-200',
        };
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${colors[v] || ''}`}>
            {v}
          </span>
        );
      },
    },
    { key: 'atelier', label: 'Atelier', align: 'center' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* ─── Page Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[18px] font-semibold text-slate-900">Saas UI Kit</h1>
          <p className="text-[12px] text-slate-500 mt-0.5">
            {tx(lang, { fr: 'Composants Minimalist SaaS — Responsive, Dense, Professionnel', ar: 'مكونات SaaS بسيطة — سريعة الاستجابة، كثيفة، احترافية', en: 'Minimalist SaaS Components — Responsive, Dense, Professional', es: 'Componentes SaaS Minimalistas — Adaptables, Densos, Profesionales', pt: 'Componentes SaaS Minimalistas — Responsivos, Densos, Profissionais', tr: 'Minimalist SaaS Bileşenleri — Duyarlı, Yoğun, Profesyonel' })}
          </p>
        </div>
        <SaasButtonGroup>
          <SaasButton variant="secondary" icon={<Download className="w-3.5 h-3.5" />}>
            {tx(lang, { fr: 'Exporter', ar: 'تصدير', en: 'Export', es: 'Exportar', pt: 'Exportar', tr: 'Dışa Aktar' })}
          </SaasButton>
          <SaasButton variant="primary" icon={<Plus className="w-3.5 h-3.5" />}>
            {tx(lang, { fr: 'Ajouter', ar: 'إضافة', en: 'Add', es: 'Añadir', pt: 'Adicionar', tr: 'Ekle' })}
          </SaasButton>
        </SaasButtonGroup>
      </div>

      {/* ─── Stats Grid ─── */}
      <SaasPanel title={tx(lang, { fr: 'Indicateurs', ar: 'المؤشرات', en: 'Indicators', es: 'Indicadores', pt: 'Indicadores', tr: 'Göstergeler' })} icon={BarChart3} compact>
        <SaasStatGrid cols={4}>
          <SaasStat
            label={tx(lang, { fr: 'Production', ar: 'الإنتاج', en: 'Production', es: 'Producción', pt: 'Produção', tr: 'Üretim' })}
            value="12,847"
            unit={tx(lang, { fr: 'pièces', ar: 'قطعة', en: 'pieces', es: 'piezas', pt: 'peças', tr: 'adet' })}
            icon={Package}
            variant="info"
            trend={{ direction: 'up', value: '+12%' }}
          />
          <SaasStat
            label={tx(lang, { fr: 'Effectifs', ar: 'التأطير', en: 'Staff', es: 'Personal', pt: 'Efetivos', tr: 'Personel' })}
            value="84"
            unit={tx(lang, { fr: 'agents', ar: 'عامل', en: 'agents', es: 'agentes', pt: 'agentes', tr: 'çalışan' })}
            icon={Users}
            variant="default"
          />
          <SaasStat
            label={tx(lang, { fr: 'Rendement', ar: 'الإنتاجية', en: 'Yield', es: 'Rendimiento', pt: 'Rendimento', tr: 'Verim' })}
            value="94.2"
            unit="%"
            icon={TrendingUp}
            variant="success"
            trend={{ direction: 'up', value: '+2.1%' }}
          />
          <SaasStat
            label={tx(lang, { fr: 'Arrêts', ar: 'التوقفات', en: 'Stops', es: 'Paradas', pt: 'Paragens', tr: 'Duruşlar' })}
            value="3"
            unit={tx(lang, { fr: 'en cours', ar: 'جارية', en: 'ongoing', es: 'en curso', pt: 'em curso', tr: 'devam eden' })}
            icon={Activity}
            variant="danger"
            trend={{ direction: 'down', value: '-1' }}
          />
        </SaasStatGrid>
      </SaasPanel>

      {/* ─── Cards Grid ─── */}
      <SaasPanel title={tx(lang, { fr: 'Cartes', ar: 'البطاقات', en: 'Cards', es: 'Tarjetas', pt: 'Cartões', tr: 'Kartlar' })} icon={LayoutDashboard}>
        <SaasCardGrid cols={3}>
          <SaasCard variant="interactive" icon={Package} title={tx(lang, { fr: 'Magasin', ar: 'المخزن', en: 'Warehouse', es: 'Almacén', pt: 'Armazém', tr: 'Depo' })} subtitle={tx(lang, { fr: 'Gestion des stocks', ar: 'إدارة المخزون', en: 'Stock management', es: 'Gestión de stocks', pt: 'Gestão de stocks', tr: 'Stok yönetimi' })}>
            <CardValue label={tx(lang, { fr: 'Articles', ar: 'المواد', en: 'Items', es: 'Artículos', pt: 'Artigos', tr: 'Ürünler' })} value="1,247" />
            <div className="mt-2"><CardValue label={tx(lang, { fr: 'Valeur', ar: 'القيمة', en: 'Value', es: 'Valor', pt: 'Valor', tr: 'Değer' })} value="2.4M" unit="MAD" /></div>
          </SaasCard>
          <SaasCard variant="interactive" icon={Users} title={tx(lang, { fr: 'RH', ar: 'الموارد البشرية', en: 'HR', es: 'RRHH', pt: 'RH', tr: 'İK' })} subtitle={tx(lang, { fr: 'Effectifs & présence', ar: 'التأطير والحضور', en: 'Staff & attendance', es: 'Personal y asistencia', pt: 'Efetivos e presença', tr: 'Personel ve devam' })}>
            <CardValue label={tx(lang, { fr: 'Présents', ar: 'الحاضرون', en: 'Present', es: 'Presentes', pt: 'Presentes', tr: 'Mevcut' })} value="78" trend="up" trendValue="92%" />
          </SaasCard>
          <SaasCard variant="interactive" icon={Activity} title={tx(lang, { fr: 'Production', ar: 'الإنتاج', en: 'Production', es: 'Producción', pt: 'Produção', tr: 'Üretim' })} subtitle={tx(lang, { fr: 'Suivi en temps réel', ar: 'متابعة فورية', en: 'Real-time tracking', es: 'Seguimiento en tiempo real', pt: 'Acompanhamento em tempo real', tr: 'Gerçek zamanlı takip' })}>
            <CardValue label={tx(lang, { fr: 'Taux', ar: 'المعدل', en: 'Rate', es: 'Tasa', pt: 'Taxa', tr: 'Oran' })} value="94.2" unit="%" trend="up" trendValue="+2.1%" />
          </SaasCard>
        </SaasCardGrid>
      </SaasPanel>

      {/* ─── Table + Form side by side ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Table */}
        <SaasPanel
          title={tx(lang, { fr: 'Machines', ar: 'الآلات', en: 'Machines', es: 'Máquinas', pt: 'Máquinas', tr: 'Makineler' })}
          icon={Settings}
          className="lg:col-span-2"
          actions={
            <SaasButtonGroup>
              <SaasIconButton icon={<Filter className="w-3.5 h-3.5" />} tooltip={tx(lang, { fr: 'Filtrer', ar: 'تصفية', en: 'Filter', es: 'Filtrar', pt: 'Filtrar', tr: 'Filtrele' })} />
              <SaasButton size="sm" variant="secondary" icon={<Plus className="w-3 h-3" />}>
                {tx(lang, { fr: 'Ajouter', ar: 'إضافة', en: 'Add', es: 'Añadir', pt: 'Adicionar', tr: 'Ekle' })}
              </SaasButton>
            </SaasButtonGroup>
          }
        >
          <SaasTable
            columns={columns}
            data={DEMO_ROWS}
            rowKey="id"
            searchable
            searchPlaceholder={tx(lang, { fr: 'Rechercher une machine...', ar: 'ابحث عن آلة...', en: 'Search a machine...', es: 'Buscar una máquina...', pt: 'Procurar uma máquina...', tr: 'Makine ara...' })}
            selectable
            selectedRows={selectedRows}
            onSelectionChange={setSelectedRows}
            showRowNumbers
            compact
          />
        </SaasPanel>

        {/* Form Panel */}
        <SaasPanel title={tx(lang, { fr: 'Formulaire', ar: 'نموذج', en: 'Form', es: 'Formulario', pt: 'Formulário', tr: 'Form' })} icon={Edit3}>
          <div className="space-y-4">
            <SaasInput
              label={tx(lang, { fr: 'Nom', ar: 'الاسم', en: 'Name', es: 'Nombre', pt: 'Nome', tr: 'Ad' })}
              placeholder={tx(lang, { fr: 'Nom de la machine', ar: 'اسم الآلة', en: 'Machine name', es: 'Nombre de la máquina', pt: 'Nome da máquina', tr: 'Makine adı' })}
              icon={<Package className="w-3.5 h-3.5" />}
            />
            <SaasSelect
              label={tx(lang, { fr: 'Classe', ar: 'الفئة', en: 'Class', es: 'Clase', pt: 'Classe', tr: 'Sınıf' })}
              placeholder={tx(lang, { fr: 'Sélectionner...', ar: 'اختر...', en: 'Select...', es: 'Seleccionar...', pt: 'Selecionar...', tr: 'Seç...' })}
              options={[
                { value: '516', label: '516 — Surjeteuse' },
                { value: '301', label: '301 — Casseuse' },
                { value: '402', label: '402 — Recouvreuse' },
              ]}
            />
            <SaasInput
              label={tx(lang, { fr: 'Vitesse', ar: 'السرعة', en: 'Speed', es: 'Velocidad', pt: 'Velocidade', tr: 'Hız' })}
              type="number"
              placeholder="5500"
              hint={tx(lang, { fr: 'Vitesse en courses par minute', ar: 'السرعة بعدد الغرز في الدقيقة', en: 'Speed in stitches per minute', es: 'Velocidad en puntadas por minuto', pt: 'Velocidade em pontos por minuto', tr: 'Dakikadaki dikiş sayısı' })}
            />
            <SaasTextarea
              label={tx(lang, { fr: 'Observations', ar: 'ملاحظات', en: 'Observations', es: 'Observaciones', pt: 'Observações', tr: 'Gözlemler' })}
              placeholder={tx(lang, { fr: 'Notes optionnelles...', ar: 'ملاحظات اختيارية...', en: 'Optional notes...', es: 'Notas opcionales...', pt: 'Notas opcionais...', tr: 'İsteğe bağlı notlar...' })}
              rows={3}
            />
            <SaasDivider />
            <div className="space-y-3">
              <SaasToggle label={tx(lang, { fr: 'Machine active', ar: 'آلة نشطة', en: 'Active machine', es: 'Máquina activa', pt: 'Máquina ativa', tr: 'Aktif makine' })} checked={toggleA} onChange={setToggleA} />
              <SaasToggle label={tx(lang, { fr: 'Mode maintenance', ar: 'وضع الصيانة', en: 'Maintenance mode', es: 'Modo mantenimiento', pt: 'Modo manutenção', tr: 'Bakım modu' })} checked={toggleB} onChange={setToggleB} />
            </div>
            <SaasDivider />
            <SaasButtonGroup className="justify-end">
              <SaasButton variant="ghost">{tx(lang, { fr: 'Annuler', ar: 'إلغاء', en: 'Cancel', es: 'Cancelar', pt: 'Cancelar', tr: 'İptal' })}</SaasButton>
              <SaasButton variant="primary" icon={<CheckCircle2 className="w-3.5 h-3.5" />}>
                {tx(lang, { fr: 'Enregistrer', ar: 'حفظ', en: 'Save', es: 'Guardar', pt: 'Guardar', tr: 'Kaydet' })}
              </SaasButton>
            </SaasButtonGroup>
          </div>
        </SaasPanel>
      </div>

      {/* ─── Buttons Showcase ─── */}
      <SaasPanel title={tx(lang, { fr: 'Boutons', ar: 'الأزرار', en: 'Buttons', es: 'Botones', pt: 'Botões', tr: 'Düğmeler' })} icon={Settings} compact>
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-medium text-slate-500 mb-2">{tx(lang, { fr: 'Variants', ar: 'الأنواع', en: 'Variants', es: 'Variantes', pt: 'Variantes', tr: 'Çeşitler' })}</p>
            <SaasButtonGroup>
              <SaasButton variant="primary">Primary</SaasButton>
              <SaasButton variant="secondary">Secondary</SaasButton>
              <SaasButton variant="ghost">Ghost</SaasButton>
              <SaasButton variant="danger">Danger</SaasButton>
            </SaasButtonGroup>
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-500 mb-2">{tx(lang, { fr: 'Tailles', ar: 'الأحجام', en: 'Sizes', es: 'Tamaños', pt: 'Tamanhos', tr: 'Boyutlar' })}</p>
            <SaasButtonGroup>
              <SaasButton size="sm">Small</SaasButton>
              <SaasButton size="md">Medium</SaasButton>
              <SaasButton size="lg">Large</SaasButton>
            </SaasButtonGroup>
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-500 mb-2">{tx(lang, { fr: 'Avec icônes', ar: 'مع الأيقونات', en: 'With Icons', es: 'Con iconos', pt: 'Com ícones', tr: 'Simgelerle' })}</p>
            <SaasButtonGroup>
              <SaasButton variant="primary" icon={<Plus className="w-3.5 h-3.5" />}>{tx(lang, { fr: 'Ajouter', ar: 'إضافة', en: 'Add', es: 'Añadir', pt: 'Adicionar', tr: 'Ekle' })}</SaasButton>
              <SaasButton variant="secondary" icon={<Download className="w-3.5 h-3.5" />}>{tx(lang, { fr: 'Exporter', ar: 'تصدير', en: 'Export', es: 'Exportar', pt: 'Exportar', tr: 'Dışa Aktar' })}</SaasButton>
              <SaasButton variant="danger" icon={<Trash2 className="w-3.5 h-3.5" />}>{tx(lang, { fr: 'Supprimer', ar: 'حذف', en: 'Delete', es: 'Eliminar', pt: 'Eliminar', tr: 'Sil' })}</SaasButton>
            </SaasButtonGroup>
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-500 mb-2">Loading</p>
            <SaasButtonGroup>
              <SaasButton variant="primary" loading>{tx(lang, { fr: 'Chargement', ar: 'جارٍ التحميل', en: 'Loading', es: 'Cargando', pt: 'A carregar', tr: 'Yükleniyor' })}</SaasButton>
              <SaasButton variant="secondary" loading>{tx(lang, { fr: 'Chargement', ar: 'جارٍ التحميل', en: 'Loading', es: 'Cargando', pt: 'A carregar', tr: 'Yükleniyor' })}</SaasButton>
            </SaasButtonGroup>
          </div>
        </div>
      </SaasPanel>

      {/* ─── Inline Stats ─── */}
      <SaasPanel title={tx(lang, { fr: 'Stats Inline', ar: 'إحصائيات سريعة', en: 'Inline Stats', es: 'Estadísticas en línea', pt: 'Estatísticas em linha', tr: 'Satır İçi İstatistikler' })} icon={BarChart3} compact>
        <div className="flex flex-wrap items-center gap-6">
          <SaasStat label={tx(lang, { fr: 'Production', ar: 'الإنتاج', en: 'Production', es: 'Producción', pt: 'Produção', tr: 'Üretim' })} value="12,847" unit="pcs" inline variant="info" />
          <SaasStat label={tx(lang, { fr: 'Rendement', ar: 'الإنتاجية', en: 'Yield', es: 'Rendimiento', pt: 'Rendimento', tr: 'Verim' })} value="94.2" unit="%" inline variant="success" />
          <SaasStat label={tx(lang, { fr: 'Arrêts', ar: 'التوقفات', en: 'Stops', es: 'Paradas', pt: 'Paragens', tr: 'Duruşlar' })} value="3" inline variant="danger" />
          <SaasStat
            label={tx(lang, { fr: 'Tendance', ar: 'الاتجاه', en: 'Trend', es: 'Tendencia', pt: 'Tendência', tr: 'Eğilim' })}
            value="+12%"
            inline
            variant="success"
            trend={{ direction: 'up', value: tx(lang, { fr: 'vs hier', ar: 'مقارنة بالأمس', en: 'vs yesterday', es: 'vs ayer', pt: 'vs ontem', tr: 'düne göre' }) }}
          />
        </div>
      </SaasPanel>

      {/* ─── Empty State ─── */}
      <SaasPanel title={tx(lang, { fr: 'État Vide', ar: 'حالة فارغة', en: 'Empty State', es: 'Estado vacío', pt: 'Estado vazio', tr: 'Boş Durum' })} icon={AlertTriangle}>
        <SaasEmpty
          icon={Package}
          message={tx(lang, { fr: 'Aucune donnée disponible. Ajoutez un élément pour commencer.', ar: 'لا توجد بيانات متاحة. أضف عنصراً للبدء.', en: 'No data available. Add an item to start.', es: 'No hay datos disponibles. Añada un elemento para empezar.', pt: 'Nenhum dado disponível. Adicione um elemento para começar.', tr: 'Veri yok. Başlamak için bir öğe ekleyin.' })}
          action={
            <SaasButton size="sm" variant="secondary" icon={<Plus className="w-3 h-3" />}>
              {tx(lang, { fr: 'Ajouter', ar: 'إضافة', en: 'Add', es: 'Añadir', pt: 'Adicionar', tr: 'Ekle' })}
            </SaasButton>
          }
        />
      </SaasPanel>

      {/* ─── Footer ─── */}
      <div className="text-center py-4">
        <p className="text-[10px] text-slate-400">
          BERAMETHODE Saas UI Kit — {tx(lang, { fr: 'Minimalist, Responsive, Dense', ar: 'بسيط، متجاوب، كثيف', en: 'Minimalist, Responsive, Dense', es: 'Minimalista, Adaptable, Denso', pt: 'Minimalista, Responsivo, Denso', tr: 'Minimalist, Duyarlı, Yoğun' })}
        </p>
      </div>
    </div>
  );
}
