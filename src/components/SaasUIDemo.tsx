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
            Composants Minimalist SaaS — Responsive, Dense, Professionnel
          </p>
        </div>
        <SaasButtonGroup>
          <SaasButton variant="secondary" icon={<Download className="w-3.5 h-3.5" />}>
            Exporter
          </SaasButton>
          <SaasButton variant="primary" icon={<Plus className="w-3.5 h-3.5" />}>
            Ajouter
          </SaasButton>
        </SaasButtonGroup>
      </div>

      {/* ─── Stats Grid ─── */}
      <SaasPanel title="Indicateurs" icon={BarChart3} compact>
        <SaasStatGrid cols={4}>
          <SaasStat
            label="Production"
            value="12,847"
            unit="pièces"
            icon={Package}
            variant="info"
            trend={{ direction: 'up', value: '+12%' }}
          />
          <SaasStat
            label="Effectifs"
            value="84"
            unit="agents"
            icon={Users}
            variant="default"
          />
          <SaasStat
            label="Rendement"
            value="94.2"
            unit="%"
            icon={TrendingUp}
            variant="success"
            trend={{ direction: 'up', value: '+2.1%' }}
          />
          <SaasStat
            label="Arrêts"
            value="3"
            unit="en cours"
            icon={Activity}
            variant="danger"
            trend={{ direction: 'down', value: '-1' }}
          />
        </SaasStatGrid>
      </SaasPanel>

      {/* ─── Cards Grid ─── */}
      <SaasPanel title="Cartes" icon={LayoutDashboard}>
        <SaasCardGrid cols={3}>
          <SaasCard variant="interactive" icon={Package} title="Magasin" subtitle="Gestion des stocks">
            <CardValue label="Articles" value="1,247" />
            <div className="mt-2"><CardValue label="Valeur" value="2.4M" unit="MAD" /></div>
          </SaasCard>
          <SaasCard variant="interactive" icon={Users} title="RH" subtitle="Effectifs & présence">
            <CardValue label="Présents" value="78" trend="up" trendValue="92%" />
          </SaasCard>
          <SaasCard variant="interactive" icon={Activity} title="Production" subtitle="Suivi en temps réel">
            <CardValue label="Taux" value="94.2" unit="%" trend="up" trendValue="+2.1%" />
          </SaasCard>
        </SaasCardGrid>
      </SaasPanel>

      {/* ─── Table + Form side by side ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Table */}
        <SaasPanel
          title="Machines"
          icon={Settings}
          className="lg:col-span-2"
          actions={
            <SaasButtonGroup>
              <SaasIconButton icon={<Filter className="w-3.5 h-3.5" />} tooltip="Filtrer" />
              <SaasButton size="sm" variant="secondary" icon={<Plus className="w-3 h-3" />}>
                Ajouter
              </SaasButton>
            </SaasButtonGroup>
          }
        >
          <SaasTable
            columns={columns}
            data={DEMO_ROWS}
            rowKey="id"
            searchable
            searchPlaceholder="Rechercher une machine..."
            selectable
            selectedRows={selectedRows}
            onSelectionChange={setSelectedRows}
            showRowNumbers
            compact
          />
        </SaasPanel>

        {/* Form Panel */}
        <SaasPanel title="Formulaire" icon={Edit3}>
          <div className="space-y-4">
            <SaasInput
              label="Nom"
              placeholder="Nom de la machine"
              icon={<Package className="w-3.5 h-3.5" />}
            />
            <SaasSelect
              label="Classe"
              placeholder="Sélectionner..."
              options={[
                { value: '516', label: '516 — Surjeteuse' },
                { value: '301', label: '301 — Casseuse' },
                { value: '402', label: '402 — Recouvreuse' },
              ]}
            />
            <SaasInput
              label="Vitesse"
              type="number"
              placeholder="5500"
              hint="Vitesse en courses par minute"
            />
            <SaasTextarea
              label="Observations"
              placeholder="Notes optionnelles..."
              rows={3}
            />
            <SaasDivider />
            <div className="space-y-3">
              <SaasToggle label="Machine active" checked={toggleA} onChange={setToggleA} />
              <SaasToggle label="Mode maintenance" checked={toggleB} onChange={setToggleB} />
            </div>
            <SaasDivider />
            <SaasButtonGroup className="justify-end">
              <SaasButton variant="ghost">Annuler</SaasButton>
              <SaasButton variant="primary" icon={<CheckCircle2 className="w-3.5 h-3.5" />}>
                Enregistrer
              </SaasButton>
            </SaasButtonGroup>
          </div>
        </SaasPanel>
      </div>

      {/* ─── Buttons Showcase ─── */}
      <SaasPanel title="Boutons" icon={Settings} compact>
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-medium text-slate-500 mb-2">Variants</p>
            <SaasButtonGroup>
              <SaasButton variant="primary">Primary</SaasButton>
              <SaasButton variant="secondary">Secondary</SaasButton>
              <SaasButton variant="ghost">Ghost</SaasButton>
              <SaasButton variant="danger">Danger</SaasButton>
            </SaasButtonGroup>
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-500 mb-2">Sizes</p>
            <SaasButtonGroup>
              <SaasButton size="sm">Small</SaasButton>
              <SaasButton size="md">Medium</SaasButton>
              <SaasButton size="lg">Large</SaasButton>
            </SaasButtonGroup>
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-500 mb-2">With Icons</p>
            <SaasButtonGroup>
              <SaasButton variant="primary" icon={<Plus className="w-3.5 h-3.5" />}>Ajouter</SaasButton>
              <SaasButton variant="secondary" icon={<Download className="w-3.5 h-3.5" />}>Exporter</SaasButton>
              <SaasButton variant="danger" icon={<Trash2 className="w-3.5 h-3.5" />}>Supprimer</SaasButton>
            </SaasButtonGroup>
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-500 mb-2">Loading</p>
            <SaasButtonGroup>
              <SaasButton variant="primary" loading>Chargement</SaasButton>
              <SaasButton variant="secondary" loading>Chargement</SaasButton>
            </SaasButtonGroup>
          </div>
        </div>
      </SaasPanel>

      {/* ─── Inline Stats ─── */}
      <SaasPanel title="Stats Inline" icon={BarChart3} compact>
        <div className="flex flex-wrap items-center gap-6">
          <SaasStat label="Production" value="12,847" unit="pcs" inline variant="info" />
          <SaasStat label="Rendement" value="94.2" unit="%" inline variant="success" />
          <SaasStat label="Arrêts" value="3" inline variant="danger" />
          <SaasStat
            label="Tendance"
            value="+12%"
            inline
            variant="success"
            trend={{ direction: 'up', value: 'vs hier' }}
          />
        </div>
      </SaasPanel>

      {/* ─── Empty State ─── */}
      <SaasPanel title="État Vide" icon={AlertTriangle}>
        <SaasEmpty
          icon={Package}
          message="Aucune donnée disponible. Ajoutez un élément pour commencer."
          action={
            <SaasButton size="sm" variant="secondary" icon={<Plus className="w-3 h-3" />}>
              Ajouter
            </SaasButton>
          }
        />
      </SaasPanel>

      {/* ─── Footer ─── */}
      <div className="text-center py-4">
        <p className="text-[10px] text-slate-400">
          BERAMETHODE Saas UI Kit — Minimalist, Responsive, Dense
        </p>
      </div>
    </div>
  );
}
