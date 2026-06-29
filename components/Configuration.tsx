import React, { useState, useCallback, useEffect } from 'react';
import { Settings, Clock, Calendar, Coins, Users, Shield, Save, Building, Plus, Trash2, CheckCircle, ListTodo, CalendarClock, AlertTriangle, Check, X, SkipForward, Factory, Zap, ChevronDown, Loader2 } from 'lucide-react';
import { AppSettings, AppTask, Machine } from '../types';
import { useTheme } from '../src/context/ThemeContext';
import { isMachineOperational } from '../utils/machineMatch';
import AgendaModal from './AgendaModal';
import LicenseActivation from './LicenseActivation';
import {
  buildPointageTranchesFromAppSettings,
  getDefaultPointageTranches,
  parsePointageTranchesFromSettings,
  type PointageTranchesConfig,
  type PointageTrancheSlot,
} from '../lib/pointageGrille';
import { tx, pickT } from '../lib/i18n';
import type { Lang } from '../app/constants';

interface ConfigurationProps {
    settings: AppSettings;
    setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
    lang: Lang;
    /** Parc machines — affectation par chaîne pour le planning (couverture gamme). */
    machines: Machine[];
    navConfig?: {
        enabled: boolean;
        style: 'dropdown' | 'flat' | 'mobile-only';
        order: string[];
        hidden: string[];
        categories: { id: string; name: string; views: string[] }[];
    };
    setNavConfig?: (cfg: any) => void;
    /** Langue active (code réel) + changement instantané de la langue de l'interface. */
    currentLang?: string;
    onSetLang?: (l: string) => void;
}

const TRANSLATIONS = {
    fr: {
        title: 'Configuration Globale',
        desc: 'Gérez les paramètres généraux de l\'entreprise et de production.',
        general: 'Paramètres Généraux',
        production: 'Horaires & Jours de Travail',
        structure: 'Structure & Encadrement',
        save: 'Enregistrer',
        saved: 'Sauvegardé !',
        currency: 'Devise par défaut',
        timeFormat: 'Format d\'affichage de l\'heure',
        workingHoursStart: 'Heure de début (Atelier)',
        workingHoursEnd: 'Heure de fin (Atelier)',
        chainsCount: 'Nombre de chaînes actives',
        workingDays: 'Jours ouvrables',
        costMinute: 'Coût Minute',
        pauses: 'Pauses & Interruptions',
        addPause: 'Ajouter une pause',
        pauseName: 'Nom',
        pauseStart: 'Début',
        pauseEnd: 'Fin',
        pauseDuration: 'Durée (min)',
        days: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
        generalManagers: 'Direction & Encadrement Général',
        chainStaff: 'Personnel par Chaîne',
        rhComptaTitle: 'RH — Pointage & comptabilité',
        rhAutoOvertime: 'Recalcul auto des heures (H.N. / sup.) depuis entrée, sortie et pause',
        rhAutoOvertimeHint: 'Si désactivé, vous pouvez saisir manuellement les heures normales et supplémentaires (onglet Pointage du dossier ou grille journalière).',
        rhComptaRef: 'Référence temps pour compta / valorisation (indicatif)',
        rhComptaRefPointees: 'Heures pointées (travaillées)',
        rhComptaRefNormales: 'Heures normales « paie » uniquement',
        rhComptaRefHint: 'Option documentaire : les exports paie utilisent déjà les lignes pointage ; ce réglage sert d’alignement avec la facturation ou la compta interne.',
        rhSageServerTitle: 'Règles d’heures « SAGE / paie » (serveur)',
        rhSageServerHint: 'L’enregistrement pousse `hr_sage_rounding` et `hr_sage_workday_start` vers la base (priorité : variables d’environnement si définies sur le serveur). Les heures affichées (pointeuse) restent brutes.',
        rhSageRounding: 'Arrondi (minutes, 1–60)',
        rhSageWorkday: 'Ancrage entrée (journée) — ex. 06:00',
        rhSageApply: 'Appliquer pour le calcul H.N. / H.S. / exports',
        rhSageSave: 'Enregistrer les règles SAGE (serveur)',
        rhTranchesTitle: 'Tranches (créneaux) — grille pointage',
        rhTranchesDesc: 'Colonnes du tableau Pointage. Si rien n’est enregistré côté serveur, la grille suit les heures atelier + pauses ci-dessus. Le bouton ci-dessous régénère les tranches à partir de cette même plage.',
        rhTranchesPause: 'Colonne « pause » (ligne —) après la tranche n°',
        rhTranchesNone: 'Aucune',
        rhTranchesLabel: 'Libellé',
        rhTranchesStart: 'Début',
        rhTranchesEnd: 'Fin',
        rhTranchesAdd: 'Ajouter une tranche',
        rhTranchesDel: 'Suppr.',
        rhTranchesReset: 'Générer depuis horaires atelier',
        rhTranchesSave: 'Enregistrer les tranches',
        apsTitle: 'Configuration Moteur APS (Advanced Planning)',
        apsDesc: 'Optimisation de la planification, des taux critiques et de la résolution des retards.',
        apsCapacityMode: 'Mode de calcul de la capacité',
        apsModeStatic: 'Statique (capacité fixe en pièces/jour)',
        apsModeDynamic: 'Dynamique (Opérateurs × Horaires × Efficacité × Q × Lc / SAM)',
        apsOvertimeCost: 'Coût horaire heures supplémentaires (MAD/h)',
        apsSubcontractCost: 'Coût sous-traitance par pièce par défaut (MAD/pc)',
        apsChainConfig: 'Paramètres APS par chaîne',
        apsOperators: 'Opérateurs',
        apsActivityRate: 'Taux Q (Activité)',
        machineModuleTitle: 'Module Machines',
        machineAlertsTitle: 'Alertes Machines',
        machineAlertsLabel: 'Activer les alertes liées aux machines',
        machineAlertsHint: 'Si désactivé, plus aucune alerte machine : couverture machines (Planning + auto-planification), compétences manquantes (Suivi), cartes & santé du parc (Vue Générale) et surlignage panne/maintenance (Gantt). La page Machines reste accessible.',
        machineHideLabel: 'Masquer la page Machines du menu',
        machineHideHint: 'Si activé, les pages Machines (Suivi & Catalogue) disparaissent complètement de la navigation, comme si le module n\'existait pas.',
    },
    ar: {
        title: 'الإعدادات العامة',
        desc: 'إدارة المعايير العامة للشركة والإنتاج.',
        general: 'إعدادات عامة',
        production: 'أوقات وأيام العمل',
        structure: 'الهيكلة والمسؤوليات',
        save: 'حفظ',
        saved: 'تم الحفظ!',
        currency: 'العملة الافتراضية',
        timeFormat: 'صيغة عرض الوقت',
        workingHoursStart: 'وقت بداية العمل',
        workingHoursEnd: 'وقت نهاية العمل',
        chainsCount: 'عدد السلاسل النشطة',
        workingDays: 'أيام العمل',
        costMinute: 'تكلفة الدقيقة الافتراضية',
        pauses: 'أوقات الراحة والفطور',
        addPause: 'إضافة وقت راحة',
        pauseName: 'الاسم',
        pauseStart: 'البداية',
        pauseEnd: 'النهاية',
        pauseDuration: 'المدة (د)',
        days: ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'],
        generalManagers: 'الإدارة والمسؤولين العامين (General)',
        chainStaff: 'المسؤولين في كل سلسلة (Chaine)',
        rhComptaTitle: 'الموارد البشرية — الحضور والمحاسبة',
        rhAutoOvertime: 'إعادة احتساب تلقائي للساعات (عادية / إضافية) من الدخول والخروج والاستراحة',
        rhAutoOvertimeHint: 'عند الإيقاف يمكن إدخال الساعات يدوياً.',
        rhComptaRef: 'مرجع الوقت للمحاسبة (إرشادي)',
        rhComptaRefPointees: 'ساعات العمل الفعلية',
        rhComptaRefNormales: 'الساعات العادية للأجر فقط',
        rhComptaRefHint: 'خيار توثيقي للتوافق مع الفوترة.',
        rhSageServerTitle: 'ساعات الأجر (مقارب لسAGE) — الخادم',
        rhSageServerHint: 'يُحفظ في قاعدة البيانات مع إمكانية تثبيت ENV على الخادم. عرض الوقت الفعلي دون تغييره.',
        rhSageRounding: 'التقريب (دقائق 1–60)',
        rhSageWorkday: 'بداية نهار دخول (مثال 06:00)',
        rhSageApply: 'تفعيل الاحتساب للساعات العادية/الفائضة/التصدير',
        rhSageSave: 'حفظ قواعد SAGE (الخادم)',
        rhTranchesTitle: 'الفترات (شرائح زمنية) — شبكة الحضور',
        rhTranchesDesc: 'أعمدة جدول الحضور. إن لم تُحفَظ شرائح في الخادم فالشبكة تُبنى من ساعات الوركشة ووقت الاستراحة أعلاه. الزر يُعيد توليد الشرائح من نفس النطاق.',
        rhTranchesPause: 'عمود « استراحة » (—) بعد الشريحة رقم',
        rhTranchesNone: 'بدون',
        rhTranchesLabel: 'الاسم',
        rhTranchesStart: 'البداية',
        rhTranchesEnd: 'النهاية',
        rhTranchesAdd: 'إضافة شريحة',
        rhTranchesDel: 'حذف',
        rhTranchesReset: 'توليد من ساعات الورشة',
        rhTranchesSave: 'حفظ الشرائح',
        apsTitle: 'إعدادات محرك التخطيط APS',
        apsDesc: 'تحسين الجدولة التلقائية وتتبع نسب التأخير وحلول الطوارئ.',
        apsCapacityMode: 'طريقة احتساب القدرة الإنتاجية',
        apsModeStatic: 'ثابت (عدد القطع/يوم لكل خط)',
        apsModeDynamic: 'ديناميكي (العمال × الدقائق × الكفاءة × Q × Lc / SAM)',
        apsOvertimeCost: 'تكلفة الساعة الإضافية (درهم/ساعة)',
        apsSubcontractCost: 'تكلفة المناولة/القطعة الافتراضية (درهم/قطعة)',
        apsChainConfig: 'إعدادات APS لكل خط إنتاج',
        apsOperators: 'العمال/الخياطين',
        apsActivityRate: 'معامل Q (النشاط)',
        machineModuleTitle: 'وحدة الآلات',
        machineAlertsTitle: 'تنبيهات الآلات',
        machineAlertsLabel: 'تفعيل التنبيهات المرتبطة بالآلات',
        machineAlertsHint: 'عند الإيقاف يختفي أي تنبيه آلات: تغطية الآلات (التخطيط والجدولة)، الكفاءات الناقصة (التتبع)، بطاقات وصحة الحظيرة (النظرة العامة)، وتظليل العطل/الصيانة (Gantt). تبقى صفحة الآلات متاحة.',
        machineHideLabel: 'إخفاء صفحة الآلات من القائمة',
        machineHideHint: 'عند التفعيل تختفي صفحات الآلات (التتبع والكتالوج) كلياً من التنقل، وكأن الوحدة غير موجودة.',
    },
    en: {
        title: 'Global Configuration',
        desc: 'Manage the general settings of the company and production.',
        general: 'General Settings',
        production: 'Working Hours & Days',
        structure: 'Structure & Management',
        save: 'Save',
        saved: 'Saved!',
        currency: 'Default currency',
        timeFormat: 'Time display format',
        workingHoursStart: 'Start time (Workshop)',
        workingHoursEnd: 'End time (Workshop)',
        chainsCount: 'Number of active chains',
        workingDays: 'Working days',
        costMinute: 'Cost per Minute',
        pauses: 'Breaks & Interruptions',
        addPause: 'Add a break',
        pauseName: 'Name',
        pauseStart: 'Start',
        pauseEnd: 'End',
        pauseDuration: 'Duration (min)',
        days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        generalManagers: 'General Management & Supervision',
        chainStaff: 'Staff per Chain',
        rhComptaTitle: 'HR — Attendance & accounting',
        rhAutoOvertime: 'Auto recalculation of hours (normal / overtime) from check-in, check-out and break',
        rhAutoOvertimeHint: 'If disabled, you can manually enter normal and overtime hours (Attendance tab of the file or daily grid).',
        rhComptaRef: 'Time reference for accounting / valuation (indicative)',
        rhComptaRefPointees: 'Clocked hours (worked)',
        rhComptaRefNormales: 'Normal "payroll" hours only',
        rhComptaRefHint: 'Documentary option: payroll exports already use the attendance lines; this setting serves to align with invoicing or internal accounting.',
        rhSageServerTitle: '"SAGE / payroll" hour rules (server)',
        rhSageServerHint: 'Saving pushes `hr_sage_rounding` and `hr_sage_workday_start` to the database (priority: environment variables if set on the server). Displayed hours (clock) stay raw.',
        rhSageRounding: 'Rounding (minutes, 1–60)',
        rhSageWorkday: 'Day-entry anchor — e.g. 06:00',
        rhSageApply: 'Apply for the calculation of normal / overtime hours / exports',
        rhSageSave: 'Save SAGE rules (server)',
        rhTranchesTitle: 'Time slots — attendance grid',
        rhTranchesDesc: 'Columns of the Attendance table. If nothing is saved on the server side, the grid follows the workshop hours + breaks above. The button below regenerates the slots from this same range.',
        rhTranchesPause: '"break" column (— row) after slot no.',
        rhTranchesNone: 'None',
        rhTranchesLabel: 'Label',
        rhTranchesStart: 'Start',
        rhTranchesEnd: 'End',
        rhTranchesAdd: 'Add a slot',
        rhTranchesDel: 'Delete',
        rhTranchesReset: 'Generate from workshop hours',
        rhTranchesSave: 'Save the slots',
        apsTitle: 'APS Engine Configuration (Advanced Planning)',
        apsDesc: 'Optimization of planning, critical rates and delay resolution.',
        apsCapacityMode: 'Capacity calculation mode',
        apsModeStatic: 'Static (fixed capacity in pieces/day)',
        apsModeDynamic: 'Dynamic (Operators × Hours × Efficiency × Q × Lc / SAM)',
        apsOvertimeCost: 'Overtime hourly cost (MAD/h)',
        apsSubcontractCost: 'Default subcontracting cost per piece (MAD/pc)',
        apsChainConfig: 'APS parameters per chain',
        apsOperators: 'Operators',
        apsActivityRate: 'Q rate (Activity)',
        machineModuleTitle: 'Machines Module',
        machineAlertsTitle: 'Machine Alerts',
        machineAlertsLabel: 'Enable machine-related alerts',
        machineAlertsHint: 'If disabled, no more machine alerts: machine coverage (Planning + auto-scheduling), missing skills (Tracking), parc cards & health (Overview) and breakdown/maintenance highlighting (Gantt). The Machines page stays accessible.',
        machineHideLabel: 'Hide the Machines page from the menu',
        machineHideHint: 'If enabled, the Machines pages (Tracking & Catalog) disappear completely from the navigation, as if the module did not exist.',
    },
    es: {
        title: 'Configuración Global',
        desc: 'Gestione los parámetros generales de la empresa y de la producción.',
        general: 'Parámetros Generales',
        production: 'Horarios y Días de Trabajo',
        structure: 'Estructura y Supervisión',
        save: 'Guardar',
        saved: '¡Guardado!',
        currency: 'Moneda por defecto',
        timeFormat: 'Formato de visualización de la hora',
        workingHoursStart: 'Hora de inicio (Taller)',
        workingHoursEnd: 'Hora de fin (Taller)',
        chainsCount: 'Número de cadenas activas',
        workingDays: 'Días laborables',
        costMinute: 'Coste por Minuto',
        pauses: 'Pausas e Interrupciones',
        addPause: 'Añadir una pausa',
        pauseName: 'Nombre',
        pauseStart: 'Inicio',
        pauseEnd: 'Fin',
        pauseDuration: 'Duración (min)',
        days: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
        generalManagers: 'Dirección y Supervisión General',
        chainStaff: 'Personal por Cadena',
        rhComptaTitle: 'RRHH — Fichaje y contabilidad',
        rhAutoOvertime: 'Recálculo automático de las horas (normales / extra) a partir de entrada, salida y pausa',
        rhAutoOvertimeHint: 'Si está desactivado, puede introducir manualmente las horas normales y extras (pestaña Fichaje del expediente o cuadrícula diaria).',
        rhComptaRef: 'Referencia de tiempo para contabilidad / valoración (indicativo)',
        rhComptaRefPointees: 'Horas fichadas (trabajadas)',
        rhComptaRefNormales: 'Solo horas normales "de nómina"',
        rhComptaRefHint: 'Opción documental: las exportaciones de nómina ya usan las líneas de fichaje; este ajuste sirve de alineación con la facturación o la contabilidad interna.',
        rhSageServerTitle: 'Reglas de horas "SAGE / nómina" (servidor)',
        rhSageServerHint: 'El guardado envía `hr_sage_rounding` y `hr_sage_workday_start` a la base de datos (prioridad: variables de entorno si están definidas en el servidor). Las horas mostradas (reloj) permanecen sin tratar.',
        rhSageRounding: 'Redondeo (minutos, 1–60)',
        rhSageWorkday: 'Anclaje de entrada (jornada) — p. ej. 06:00',
        rhSageApply: 'Aplicar para el cálculo de horas normales / extra / exportaciones',
        rhSageSave: 'Guardar las reglas SAGE (servidor)',
        rhTranchesTitle: 'Tramos (franjas) — cuadrícula de fichaje',
        rhTranchesDesc: 'Columnas de la tabla de Fichaje. Si no se guarda nada en el servidor, la cuadrícula sigue los horarios del taller + pausas anteriores. El botón de abajo regenera los tramos a partir de ese mismo rango.',
        rhTranchesPause: 'Columna "pausa" (fila —) después del tramo n.º',
        rhTranchesNone: 'Ninguna',
        rhTranchesLabel: 'Etiqueta',
        rhTranchesStart: 'Inicio',
        rhTranchesEnd: 'Fin',
        rhTranchesAdd: 'Añadir un tramo',
        rhTranchesDel: 'Eliminar',
        rhTranchesReset: 'Generar desde horarios del taller',
        rhTranchesSave: 'Guardar los tramos',
        apsTitle: 'Configuración del Motor APS (Advanced Planning)',
        apsDesc: 'Optimización de la planificación, de las tasas críticas y de la resolución de retrasos.',
        apsCapacityMode: 'Modo de cálculo de la capacidad',
        apsModeStatic: 'Estático (capacidad fija en piezas/día)',
        apsModeDynamic: 'Dinámico (Operarios × Horarios × Eficiencia × Q × Lc / SAM)',
        apsOvertimeCost: 'Coste horario de horas extra (MAD/h)',
        apsSubcontractCost: 'Coste de subcontratación por pieza por defecto (MAD/pc)',
        apsChainConfig: 'Parámetros APS por cadena',
        apsOperators: 'Operarios',
        apsActivityRate: 'Tasa Q (Actividad)',
        machineModuleTitle: 'Módulo Máquinas',
        machineAlertsTitle: 'Alertas de Máquinas',
        machineAlertsLabel: 'Activar las alertas relacionadas con las máquinas',
        machineAlertsHint: 'Si está desactivado, ya no hay alertas de máquinas: cobertura de máquinas (Planificación + auto-planificación), competencias faltantes (Seguimiento), tarjetas y salud del parque (Vista General) y resaltado de avería/mantenimiento (Gantt). La página Máquinas sigue accesible.',
        machineHideLabel: 'Ocultar la página Máquinas del menú',
        machineHideHint: 'Si está activado, las páginas Máquinas (Seguimiento y Catálogo) desaparecen por completo de la navegación, como si el módulo no existiera.',
    },
    pt: {
        title: 'Configuração Global',
        desc: 'Faça a gestão dos parâmetros gerais da empresa e da produção.',
        general: 'Parâmetros Gerais',
        production: 'Horários e Dias de Trabalho',
        structure: 'Estrutura e Supervisão',
        save: 'Guardar',
        saved: 'Guardado!',
        currency: 'Moeda por defeito',
        timeFormat: 'Formato de exibição da hora',
        workingHoursStart: 'Hora de início (Oficina)',
        workingHoursEnd: 'Hora de fim (Oficina)',
        chainsCount: 'Número de cadeias ativas',
        workingDays: 'Dias úteis',
        costMinute: 'Custo por Minuto',
        pauses: 'Pausas e Interrupções',
        addPause: 'Adicionar uma pausa',
        pauseName: 'Nome',
        pauseStart: 'Início',
        pauseEnd: 'Fim',
        pauseDuration: 'Duração (min)',
        days: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
        generalManagers: 'Direção e Supervisão Geral',
        chainStaff: 'Pessoal por Cadeia',
        rhComptaTitle: 'RH — Ponto e contabilidade',
        rhAutoOvertime: 'Recálculo automático das horas (normais / extra) a partir de entrada, saída e pausa',
        rhAutoOvertimeHint: 'Se desativado, pode introduzir manualmente as horas normais e extra (separador Ponto do processo ou grelha diária).',
        rhComptaRef: 'Referência de tempo para contabilidade / valorização (indicativo)',
        rhComptaRefPointees: 'Horas registadas (trabalhadas)',
        rhComptaRefNormales: 'Apenas horas normais "de salário"',
        rhComptaRefHint: 'Opção documental: as exportações de salário já usam as linhas de ponto; este ajuste serve para alinhamento com a faturação ou a contabilidade interna.',
        rhSageServerTitle: 'Regras de horas "SAGE / salário" (servidor)',
        rhSageServerHint: 'A gravação envia `hr_sage_rounding` e `hr_sage_workday_start` para a base de dados (prioridade: variáveis de ambiente se definidas no servidor). As horas exibidas (relógio de ponto) permanecem brutas.',
        rhSageRounding: 'Arredondamento (minutos, 1–60)',
        rhSageWorkday: 'Âncora de entrada (jornada) — ex. 06:00',
        rhSageApply: 'Aplicar para o cálculo de horas normais / extra / exportações',
        rhSageSave: 'Guardar as regras SAGE (servidor)',
        rhTranchesTitle: 'Intervalos (faixas) — grelha de ponto',
        rhTranchesDesc: 'Colunas da tabela de Ponto. Se nada for guardado no servidor, a grelha segue os horários da oficina + pausas acima. O botão abaixo regenera os intervalos a partir do mesmo período.',
        rhTranchesPause: 'Coluna "pausa" (linha —) após o intervalo n.º',
        rhTranchesNone: 'Nenhum',
        rhTranchesLabel: 'Rótulo',
        rhTranchesStart: 'Início',
        rhTranchesEnd: 'Fim',
        rhTranchesAdd: 'Adicionar um intervalo',
        rhTranchesDel: 'Eliminar',
        rhTranchesReset: 'Gerar a partir dos horários da oficina',
        rhTranchesSave: 'Guardar os intervalos',
        apsTitle: 'Configuração do Motor APS (Advanced Planning)',
        apsDesc: 'Otimização do planeamento, das taxas críticas e da resolução de atrasos.',
        apsCapacityMode: 'Modo de cálculo da capacidade',
        apsModeStatic: 'Estático (capacidade fixa em peças/dia)',
        apsModeDynamic: 'Dinâmico (Operadores × Horários × Eficiência × Q × Lc / SAM)',
        apsOvertimeCost: 'Custo horário de horas extra (MAD/h)',
        apsSubcontractCost: 'Custo de subcontratação por peça por defeito (MAD/pc)',
        apsChainConfig: 'Parâmetros APS por cadeia',
        apsOperators: 'Operadores',
        apsActivityRate: 'Taxa Q (Atividade)',
        machineModuleTitle: 'Módulo Máquinas',
        machineAlertsTitle: 'Alertas de Máquinas',
        machineAlertsLabel: 'Ativar os alertas relacionados com as máquinas',
        machineAlertsHint: 'Se desativado, deixa de haver alertas de máquinas: cobertura de máquinas (Planeamento + auto-planeamento), competências em falta (Acompanhamento), cartões e saúde do parque (Visão Geral) e realce de avaria/manutenção (Gantt). A página Máquinas permanece acessível.',
        machineHideLabel: 'Ocultar a página Máquinas do menu',
        machineHideHint: 'Se ativado, as páginas Máquinas (Acompanhamento e Catálogo) desaparecem completamente da navegação, como se o módulo não existisse.',
    },
    tr: {
        title: 'Genel Yapılandırma',
        desc: 'Şirketin ve üretimin genel parametrelerini yönetin.',
        general: 'Genel Ayarlar',
        production: 'Çalışma Saatleri ve Günleri',
        structure: 'Yapı ve Yönetim',
        save: 'Kaydet',
        saved: 'Kaydedildi!',
        currency: 'Varsayılan para birimi',
        timeFormat: 'Saat görüntüleme biçimi',
        workingHoursStart: 'Başlangıç saati (Atölye)',
        workingHoursEnd: 'Bitiş saati (Atölye)',
        chainsCount: 'Aktif hat sayısı',
        workingDays: 'Çalışma günleri',
        costMinute: 'Dakika Maliyeti',
        pauses: 'Molalar ve Kesintiler',
        addPause: 'Mola ekle',
        pauseName: 'Ad',
        pauseStart: 'Başlangıç',
        pauseEnd: 'Bitiş',
        pauseDuration: 'Süre (dk)',
        days: ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'],
        generalManagers: 'Genel Yönetim ve Denetim',
        chainStaff: 'Hat Başına Personel',
        rhComptaTitle: 'İK — Mesai takibi ve muhasebe',
        rhAutoOvertime: 'Giriş, çıkış ve moladan saatlerin (normal / fazla mesai) otomatik yeniden hesaplanması',
        rhAutoOvertimeHint: 'Devre dışı bırakılırsa, normal ve fazla mesai saatlerini elle girebilirsiniz (dosyanın Mesai sekmesi veya günlük ızgara).',
        rhComptaRef: 'Muhasebe / değerleme için zaman referansı (bilgilendirici)',
        rhComptaRefPointees: 'Kaydedilen saatler (çalışılan)',
        rhComptaRefNormales: 'Yalnızca "bordro" normal saatleri',
        rhComptaRefHint: 'Belgesel seçenek: bordro dışa aktarımları zaten mesai satırlarını kullanır; bu ayar faturalama veya iç muhasebe ile hizalama içindir.',
        rhSageServerTitle: '"SAGE / bordro" saat kuralları (sunucu)',
        rhSageServerHint: 'Kaydetme `hr_sage_rounding` ve `hr_sage_workday_start` değerlerini veritabanına gönderir (öncelik: sunucuda tanımlıysa ortam değişkenleri). Görüntülenen saatler (mesai saati) ham kalır.',
        rhSageRounding: 'Yuvarlama (dakika, 1–60)',
        rhSageWorkday: 'Giriş çıpası (gün) — örn. 06:00',
        rhSageApply: 'Normal / fazla mesai saatleri / dışa aktarımların hesabı için uygula',
        rhSageSave: 'SAGE kurallarını kaydet (sunucu)',
        rhTranchesTitle: 'Zaman dilimleri — mesai ızgarası',
        rhTranchesDesc: 'Mesai tablosunun sütunları. Sunucu tarafında hiçbir şey kaydedilmezse, ızgara yukarıdaki atölye saatleri + molaları izler. Aşağıdaki düğme dilimleri aynı aralıktan yeniden oluşturur.',
        rhTranchesPause: 'Dilim numarasından sonra "mola" sütunu (— satırı)',
        rhTranchesNone: 'Yok',
        rhTranchesLabel: 'Etiket',
        rhTranchesStart: 'Başlangıç',
        rhTranchesEnd: 'Bitiş',
        rhTranchesAdd: 'Dilim ekle',
        rhTranchesDel: 'Sil',
        rhTranchesReset: 'Atölye saatlerinden oluştur',
        rhTranchesSave: 'Dilimleri kaydet',
        apsTitle: 'APS Motoru Yapılandırması (Advanced Planning)',
        apsDesc: 'Planlamanın, kritik oranların ve gecikme çözümünün optimizasyonu.',
        apsCapacityMode: 'Kapasite hesaplama modu',
        apsModeStatic: 'Statik (parça/gün cinsinden sabit kapasite)',
        apsModeDynamic: 'Dinamik (Operatörler × Saatler × Verimlilik × Q × Lc / SAM)',
        apsOvertimeCost: 'Fazla mesai saatlik maliyeti (MAD/sa)',
        apsSubcontractCost: 'Varsayılan parça başına fason maliyeti (MAD/pc)',
        apsChainConfig: 'Hat başına APS parametreleri',
        apsOperators: 'Operatörler',
        apsActivityRate: 'Q oranı (Aktivite)',
        machineModuleTitle: 'Makineler Modülü',
        machineAlertsTitle: 'Makine Uyarıları',
        machineAlertsLabel: 'Makineyle ilgili uyarıları etkinleştir',
        machineAlertsHint: 'Devre dışı bırakılırsa, makine uyarısı kalmaz: makine kapsamı (Planlama + otomatik planlama), eksik yetkinlikler (Takip), park kartları ve sağlığı (Genel Bakış) ve arıza/bakım vurgulaması (Gantt). Makineler sayfası erişilebilir kalır.',
        machineHideLabel: 'Makineler sayfasını menüden gizle',
        machineHideHint: 'Etkinleştirilirse, Makineler sayfaları (Takip ve Katalog) gezinmeden tamamen kaybolur, sanki modül hiç yokmuş gibi.',
    }
};

const CURRENCIES = [
    { code: 'MAD', label: 'MAD - Dirham Marocain' },
    { code: 'EUR', label: 'EUR - Euro (Europe, Espagne, Allemagne...)' },
    { code: 'USD', label: 'USD - US Dollar' },
    { code: 'DZD', label: 'DZD - Dinar Algérien' },
    { code: 'TND', label: 'TND - Dinar Tunisien' },
    { code: 'TRY', label: 'TRY - Livre Turque' },
    { code: 'XOF', label: 'XOF - Franc CFA (BCEAO)' },
    { code: 'XAF', label: 'XAF - Franc CFA (BEAC)' },
    { code: 'SAR', label: 'SAR - Riyal Saoudien' },
    { code: 'AED', label: 'AED - Dirham EAU' },
    { code: 'QAR', label: 'QAR - Riyal Qatari' },
    { code: 'KWD', label: 'KWD - Dinar Koweïtien' },
    { code: 'BHD', label: 'BHD - Dinar Bahreïni' },
    { code: 'OMR', label: 'OMR - Rial Omanais' },
    { code: 'ZAR', label: 'ZAR - Rand Sud-Africain' },
];

const VIEW_LABELS: Record<string, Partial<Record<Lang, string>> & { fr: string }> = {
    dashboard: { fr: 'Tableau de bord', ar: 'لوحة التحكم', en: 'Dashboard', es: 'Panel de control', pt: 'Painel de controlo', tr: 'Gösterge paneli' },
    planning: { fr: 'Planning', ar: 'التخطيط', en: 'Planning', es: 'Planificación', pt: 'Planeamento', tr: 'Planlama' },
    suivi: { fr: 'Suivi Production', ar: 'تتبع الإنتاج', en: 'Production Tracking', es: 'Seguimiento de Producción', pt: 'Acompanhamento de Produção', tr: 'Üretim Takibi' },
    rendement: { fr: 'Rendement', ar: 'المردودية', en: 'Yield', es: 'Rendimiento', pt: 'Rendimento', tr: 'Verim' },
    ingenierie: { fr: 'Ingénierie', ar: 'الهندسة', en: 'Engineering', es: 'Ingeniería', pt: 'Engenharia', tr: 'Mühendislik' },
    atelier: { fr: 'Atelier Méthodes', ar: 'ورشة الأساليب', en: 'Methods Workshop', es: 'Taller de Métodos', pt: 'Oficina de Métodos', tr: 'Metot Atölyesi' },
    atelierProd: { fr: 'Atelier P°', ar: 'ورشة الإنتاج', en: 'Prod. Workshop', es: 'Taller de Prod.', pt: 'Oficina de Prod.', tr: 'Üretim Atölyesi' },
    coupe: { fr: 'La Coupe', ar: 'القص', en: 'Cutting', es: 'El Corte', pt: 'O Corte', tr: 'Kesim' },
    sousTraitance: { fr: 'Sous-traitance', ar: 'التعاقد الفرعي', en: 'Subcontracting', es: 'Subcontratación', pt: 'Subcontratação', tr: 'Fason' },
    effectifs: { fr: 'Effectifs', ar: 'الموارد البشرية', en: 'Workforce', es: 'Plantilla', pt: 'Efetivos', tr: 'İş Gücü' },
    gestionRh: { fr: 'Gestion RH', ar: 'إدارة الموارد البشرية', en: 'HR Management', es: 'Gestión de RRHH', pt: 'Gestão de RH', tr: 'İK Yönetimi' },
    magasin: { fr: 'Magasin', ar: 'المخزن', en: 'Warehouse', es: 'Almacén', pt: 'Armazém', tr: 'Depo' },
    export: { fr: 'Stock Fini', ar: 'تصدير المخزون', en: 'Finished Stock', es: 'Stock Terminado', pt: 'Stock Acabado', tr: 'Bitmiş Stok' },
    facturation: { fr: 'Facturation', ar: 'الفوترة', en: 'Invoicing', es: 'Facturación', pt: 'Faturação', tr: 'Faturalama' },
    library: { fr: 'Bibliothèque', ar: 'المكتبة', en: 'Library', es: 'Biblioteca', pt: 'Biblioteca', tr: 'Kütüphane' },
    pageMachine: { fr: 'Suivi des Machines', ar: 'تتبع الآلات', en: 'Machine Tracking', es: 'Seguimiento de Máquinas', pt: 'Acompanhamento de Máquinas', tr: 'Makine Takibi' },
    machin: { fr: 'Catalogue & Paramètres', ar: 'كتالوج و إعدادات', en: 'Catalog & Settings', es: 'Catálogo y Parámetros', pt: 'Catálogo e Parâmetros', tr: 'Katalog ve Ayarlar' },
    objectifs: { fr: 'Objectifs', ar: 'الأهداف', en: 'Objectives', es: 'Objetivos', pt: 'Objetivos', tr: 'Hedefler' },
    config: { fr: 'Configuration', ar: 'الإعدادات العامة', en: 'Configuration', es: 'Configuración', pt: 'Configuração', tr: 'Yapılandırma' },
    paramètres: { fr: 'Paramètres', ar: 'الإعدادات', en: 'Settings', es: 'Parámetros', pt: 'Parâmetros', tr: 'Ayarlar' },
    admin: { fr: 'Admin', ar: 'المشرف', en: 'Admin', es: 'Admin', pt: 'Admin', tr: 'Yönetici' },
};

export default function Configuration({ settings, setSettings, lang, machines, navConfig, setNavConfig, currentLang, onSetLang }: ConfigurationProps) {
    const t = pickT(TRANSLATIONS, lang);
    const [showSaveToast, setShowSaveToast] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showAgenda, setShowAgenda] = useState(false);

    // Mode "brouillon" : les modifications restent locales à cette page et ne touchent
    // au reste de l'app (ni ne sont persistées) qu'au clic explicite sur "Enregistrer".
    const [draft, setDraftState] = useState<AppSettings>(settings);
    const [isDirty, setIsDirty] = useState(false);
    useEffect(() => {
        if (!isDirty) setDraftState(settings);
    }, [settings, isDirty]);
    const setDraft: typeof setSettings = (updater) => {
        setDraftState(prev => (typeof updater === 'function' ? (updater as (p: AppSettings) => AppSettings)(prev) : updater));
        setIsDirty(true);
    };

    // Sections repliables (mobile/tablette < xl) — repliées par défaut, toujours ouvertes en desktop (xl)
    const [openSec, setOpenSec] = useState<Record<string, boolean>>({});
    const toggleSec = (k: string) => setOpenSec(prev => ({ ...prev, [k]: !prev[k] }));
    const [sageR, setSageR] = useState(15);
    const [sageW, setSageW] = useState('06:00');
    const [sageA, setSageA] = useState(true);
    const [sageBusy, setSageBusy] = useState(false);
    const [trCfg, setTrCfg] = useState<PointageTranchesConfig>(() => getDefaultPointageTranches());
    const [trBusy, setTrBusy] = useState(false);
    const loadSage = useCallback(() => {
        fetch('/api/settings', { credentials: 'include' })
            .then(r => (r.ok ? r.json() : null))
            .then((d: Record<string, unknown> | null) => {
                if (!d) return;
                const r0 = d.hr_sage_rounding;
                const w0 = d.hr_sage_workday_start;
                const a0 = d.hr_sage_apply;
                if (r0 != null) setSageR(Math.min(60, Math.max(1, parseInt(String(r0), 10) || 15)));
                if (w0 != null && /^\d{1,2}:\d{2}/.test(String(w0))) setSageW(String(w0).match(/^\d{1,2}:\d{2}/)![0]);
                if (a0 !== undefined) setSageA(a0 !== 'false' && a0 !== false);
                setTrCfg(parsePointageTranchesFromSettings(d.hr_pointage_tranches, draft));
            })
            .catch(() => {});
    }, [draft]);
    useEffect(() => { loadSage(); }, [loadSage]);
    const saveSage = () => {
        setSageBusy(true);
        fetch('/api/settings', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                hr_sage_rounding: String(sageR),
                hr_sage_workday_start: sageW,
                hr_sage_apply: sageA ? 'true' : 'false',
            }),
        })
            .then(r => {
                if (r.ok) {
                    setSettings(prev => ({ ...prev, hrSageRounding: sageR, hrSageWorkdayStart: sageW, hrSageApply: sageA }));
                }
            })
            .catch(() => {})
            .finally(() => setSageBusy(false));
    };

    const saveTranches = () => {
        setTrBusy(true);
        fetch('/api/settings', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hr_pointage_tranches: trCfg }),
        })
            .then(r => {
                if (r.ok) {
                    setShowSaveToast(true);
                    setTimeout(() => setShowSaveToast(false), 3000);
                }
            })
            .catch(() => {})
            .finally(() => setTrBusy(false));
    };

    const updateTrSlot = (index: number, patch: Partial<PointageTrancheSlot>) => {
        setTrCfg(c => {
            const slots = c.slots.map((s, i) => (i === index ? { ...s, ...patch } : s));
            return { ...c, slots };
        });
    };

    const removeTrSlot = (index: number) => {
        setTrCfg(c => {
            if (c.slots.length <= 2) return c;
            const slots = c.slots.filter((_, i) => i !== index);
            let sep = c.sepAfterIndex;
            if (sep > slots.length - 2) sep = Math.max(-1, slots.length - 2);
            return { slots, sepAfterIndex: sep };
        });
    };

    const addTrSlot = () => {
        setTrCfg(c => {
            const n = c.slots.length + 1;
            const slots = [...c.slots, { label: `T${n}`, start: '08:00', end: '09:00' }];
            return { ...c, slots };
        });
    };

    const resetTranches = () => {
        setTrCfg(buildPointageTranchesFromAppSettings(draft));
    };

    // --- TASK STATE ---
    const [newTaskText, setNewTaskText] = useState('');
    const [newTaskDate, setNewTaskDate] = useState(new Date().toISOString().split('T')[0]);
    const [newTaskAssignee, setNewTaskAssignee] = useState(''); // FORMAT: "Name|Role"

    const handleAddTask = () => {
        if (!newTaskText || !newTaskAssignee || !newTaskDate) return;

        const [name, role] = newTaskAssignee.split('|');

        const newTask: AppTask = {
            id: Date.now().toString(),
            text: newTaskText,
            assigneeName: name,
            assigneeRole: role,
            status: 'PENDING',
            date: newTaskDate,
            isDone: false, // Legacy
            createdAt: new Date().toISOString()
        };

        setDraft(prev => ({
            ...prev,
            tasks: [...(prev.tasks || []), newTask]
        }));

        setNewTaskText('');
        // Keep date and assignee for multi-entry convenience
    };

    const handleDeleteTask = (taskId: string) => {
        if (confirm('Êtes-vous sûr de vouloir supprimer cette tâche ?')) {
            setDraft(prev => ({
                ...prev,
                tasks: prev.tasks?.filter(t => t.id !== taskId) || []
            }));
        }
    };

    const updateTaskStatus = (taskId: string, newStatus: 'PENDING' | 'DONE_OK' | 'DONE_NOT_OK' | 'SKIPPED', reason?: string) => {
        setDraft(prev => ({
            ...prev,
            tasks: prev.tasks?.map(t => {
                if (t.id === taskId) {
                    return { ...t, status: newStatus as any, skipReason: reason, isDone: newStatus === 'DONE_OK' };
                }
                return t;
            }) || []
        }));
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        setDraft(prev => ({
            ...prev,
            [name]: type === 'number' ? (value === '' ? '' : Number(value)) : value
        }));
    };

    const toggleWorkingDay = (dayIndex: number) => {
        setDraft(prev => {
            const current = prev.workingDays || [];
            const days = current.includes(dayIndex)
                ? current.filter(d => d !== dayIndex)
                : [...current, dayIndex].sort((a, b) => a - b);
            return { ...prev, workingDays: days };
        });
    };

    const addPause = () => {
        setDraft(prev => ({
            ...prev,
            pauses: [...(prev.pauses || []), { id: Date.now().toString(), name: 'Nouvelle Pause', start: '12:00', end: '13:00', durationMin: 60 }]
        }));
    };

    const updatePause = (id: string, field: 'start' | 'end' | 'name', value: string) => {
        setDraft(prev => ({
            ...prev,
            pauses: (prev.pauses || []).map(p => {
                if (p.id !== id) return p;
                const updated = { ...p, [field]: value };
                if ((field === 'start' || field === 'end') && updated.start && updated.end) {
                    const [sh, sm] = updated.start.split(':').map(Number);
                    const [eh, em] = updated.end.split(':').map(Number);
                    let diffMinutes = (eh * 60 + em) - (sh * 60 + sm);
                    if (diffMinutes < 0) diffMinutes += 24 * 60;
                    updated.durationMin = diffMinutes;
                }
                return updated;
            })
        }));
    };

    const removePause = (id: string) => {
        setDraft(prev => ({
            ...prev,
            pauses: (prev.pauses || []).filter(p => p.id !== id)
        }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ global_settings: draft }),
            });
            if (!res.ok) throw new Error('save failed');
            setSettings(draft); // applique le brouillon au reste de l'app seulement maintenant
            setIsDirty(false);
            setShowSaveToast(true);
            setTimeout(() => setShowSaveToast(false), 3000);
        } catch (e) {
            console.error('Erreur sauvegarde settings:', e);
        } finally {
            setIsSaving(false);
        }
    };

    React.useEffect(() => {
        const handleOpenAgenda = () => {
            setShowAgenda(true);
        };
        window.addEventListener('open-agenda-modal', handleOpenAgenda);
        return () => window.removeEventListener('open-agenda-modal', handleOpenAgenda);
    }, []);

    return (
        <div className="p-4 md:p-8 w-full max-w-none mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24" dir={lang === 'ar' ? 'rtl' : 'ltr'}>

            {/* Success Toast */}
            {showSaveToast && (
                <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] bg-emerald-500 text-white px-6 py-3 rounded-full shadow-lg dark:shadow-dk-lg flex items-center gap-3 animate-in slide-in-from-top-5 duration-300">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-bold text-sm tracking-wide">{t.saved}</span>
                </div>
            )}

            {/* Header */}
            <div className="bg-white dark:bg-dk-surface p-4 sm:p-6 rounded-2xl shadow-sm dark:shadow-dk-sm border border-slate-200 dark:border-dk-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sticky top-0 z-50">
                <div className="flex items-center gap-4 w-full sm:w-auto">
                    <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text border border-indigo-100 shrink-0">
                        <Settings className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-dk-text tracking-tight">{t.title}</h1>
                        <p className="text-xs sm:text-sm text-slate-500 dark:text-dk-muted font-medium mt-1">{t.desc}</p>
                        {isDirty && !isSaving && (
                            <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                {tx(lang, { fr: 'Modifications non enregistrées', ar: 'تعديلات غير محفوظة', en: 'Unsaved changes', es: 'Cambios sin guardar', pt: 'Alterações não guardadas', tr: 'Kaydedilmemiş değişiklikler' })}
                            </p>
                        )}
                    </div>
                </div>
                <button onClick={handleSave} disabled={isSaving} className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 sm:px-8 py-3 bg-indigo-600 dark:bg-dk-accent hover:bg-indigo-700 dark:hover:bg-dk-accent-hover disabled:opacity-70 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-lg dark:shadow-dk-lg shadow-indigo-600/30 active:scale-95 group relative overflow-hidden">
                    <span className="absolute inset-0 w-full h-full bg-white dark:bg-dk-surface/20 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></span>
                    {isSaving ? (
                        <Loader2 className="w-5 h-5 relative z-10 animate-spin" />
                    ) : (
                        <Save className="w-5 h-5 relative z-10 group-hover:scale-110 transition-transform" />
                    )}
                    <span className="relative z-10">{isSaving ? '...' : t.save}</span>
                    {isDirty && !isSaving && (
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    )}
                </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 w-full">

                {/* LEFT COLUMN: General & Structure Placeholder */}
                <div className="space-y-6">
                    {/* General Settings */}
                    <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-sm dark:shadow-dk-sm border border-slate-200 dark:border-dk-border overflow-hidden flex flex-col">
                        <div onClick={() => toggleSec('gen')} className={`px-5 py-4 bg-slate-50 dark:bg-dk-bg flex items-center gap-2 cursor-pointer select-none ${openSec['gen'] ? 'border-b border-slate-100 dark:border-dk-border' : ''}`}>
                            <Building className="w-5 h-5 text-slate-500 dark:text-dk-muted" />
                            <h2 className="font-bold text-slate-800 dark:text-dk-text">{t.general}</h2>
                            <ChevronDown className={`w-5 h-5 text-slate-400 dark:text-dk-muted ml-auto shrink-0 transition-transform ${openSec['gen'] ? 'rotate-180' : ''}`} />
                        </div>
                        <div className={`p-5 space-y-6 flex-1 ${openSec['gen'] ? '' : 'hidden'}`}>
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 dark:text-dk-muted mb-2">{t.currency}</label>
                                <select name="currency" value={draft.currency} onChange={handleChange} className="w-full bg-slate-50 dark:bg-dk-bg border-2 border-slate-200 dark:border-dk-border rounded-xl px-4 py-3 outline-none focus:border-indigo-500 font-bold text-slate-700 dark:text-dk-text-soft transition-all cursor-pointer">
                                    {CURRENCIES.map(c => (
                                        <option key={c.code} value={c.code}>{c.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 dark:text-dk-muted mb-2">{t.costMinute}</label>
                                <div className="relative">
                                    <input type="number" step="0.01" name="costMinute" value={draft.costMinute} onChange={handleChange} className="w-full bg-slate-50 dark:bg-dk-bg border-2 border-slate-200 dark:border-dk-border rounded-xl pl-11 pr-4 py-3 outline-none focus:border-indigo-500 font-black text-lg text-slate-800 dark:text-dk-text transition-all" />
                                    <Coins className="w-5 h-5 text-slate-400 dark:text-dk-muted absolute left-4 top-3.5" />
                                </div>
                            </div>

                            <div className="pt-4 border-t border-slate-100 dark:border-dk-border">
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-100 shrink-0">
                                        <Factory className="w-5 h-5" />
                                    </div>
                                    <span className="font-bold text-slate-800 dark:text-dk-text text-sm">{t.machineModuleTitle}</span>
                                </div>

                                {/* Option 1 — Désactiver les alertes */}
                                <div className="flex items-start justify-between gap-4 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl p-3">
                                    <div>
                                        <span className="font-bold text-slate-800 dark:text-dk-text text-sm block">{t.machineAlertsTitle}</span>
                                        <span className="text-xs text-slate-500 dark:text-dk-muted block mt-0.5">{t.machineAlertsLabel}</span>
                                        <span className="text-[11px] text-slate-400 dark:text-dk-muted block mt-1 leading-relaxed">{t.machineAlertsHint}</span>
                                    </div>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={draft.machineAlertsEnabled !== false}
                                        onClick={() => setDraft(prev => ({ ...prev, machineAlertsEnabled: prev.machineAlertsEnabled === false ? true : false }))}
                                        className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${draft.machineAlertsEnabled !== false ? 'bg-indigo-600 dark:bg-dk-accent' : 'bg-slate-300'}`}
                                    >
                                        <span className={`absolute top-1 w-5 h-5 bg-white dark:bg-dk-surface rounded-full shadow transition-all ${draft.machineAlertsEnabled !== false ? 'left-6' : 'left-1'}`}></span>
                                    </button>
                                </div>

                                {/* Option 2 — Masquer la page Machines du menu */}
                                {navConfig && setNavConfig && (() => {
                                    const MACHINE_VIEWS = ['pageMachine', 'machin'];
                                    const isHidden = MACHINE_VIEWS.every(v => navConfig.hidden.includes(v));
                                    return (
                                        <div className="flex items-start justify-between gap-4 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl p-3 mt-3">
                                            <div>
                                                <span className="font-bold text-slate-800 dark:text-dk-text text-sm block">{t.machineHideLabel}</span>
                                                <span className="text-[11px] text-slate-400 dark:text-dk-muted block mt-1 leading-relaxed">{t.machineHideHint}</span>
                                            </div>
                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={isHidden}
                                                onClick={() => {
                                                    const hidden = isHidden
                                                        ? navConfig.hidden.filter(v => !MACHINE_VIEWS.includes(v))
                                                        : [...new Set([...navConfig.hidden, ...MACHINE_VIEWS])];
                                                    setNavConfig({ ...navConfig, hidden });
                                                }}
                                                className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${isHidden ? 'bg-rose-600' : 'bg-slate-300'}`}
                                            >
                                                <span className={`absolute top-1 w-5 h-5 bg-white dark:bg-dk-surface rounded-full shadow transition-all ${isHidden ? 'left-6' : 'left-1'}`}></span>
                                            </button>
                                        </div>
                                    );
                                })()}

                                {/* Thème (Light / Dark / System) */}
                                {(() => {
                                    const { theme: currentTheme, setTheme } = useTheme();
                                    return (
                                        <div className="flex flex-col gap-2 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl p-3 mt-3">
                                            <div>
                                                <span className="font-bold text-slate-800 dark:text-dk-text text-sm block text-start">{tx(lang, { fr: "Thème de l'application", ar: 'مظهر التطبيق', en: 'Application theme', es: 'Tema de la aplicación', pt: 'Tema da aplicação', tr: 'Uygulama teması' })}</span>
                                                <span className="text-[11px] text-slate-400 dark:text-dk-muted block mt-1 leading-relaxed text-start">
                                                    {tx(lang, { fr: "Choisissez le style visuel de l'application (Clair, Sombre, ou calqué sur le Système).", ar: 'اختر مظهر التطبيق المفضل لديك (فاتح، داكن، أو متوافق مع النظام)', en: 'Choose the visual style of the application (Light, Dark, or matched to the System).', es: 'Elija el estilo visual de la aplicación (Claro, Oscuro o ajustado al Sistema).', pt: 'Escolha o estilo visual da aplicação (Claro, Escuro ou conforme o Sistema).', tr: 'Uygulamanın görsel stilini seçin (Açık, Koyu veya Sisteme uyumlu).' })}
                                                </span>
                                            </div>
                                            <div className="flex gap-2 mt-2">
                                                {(['light', 'dark', 'system'] as const).map(mode => (
                                                    <button
                                                        key={mode}
                                                        type="button"
                                                        onClick={() => setTheme(mode)}
                                                        className={`flex-1 py-2 px-3 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all border ${
                                                            currentTheme === mode
                                                                ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                                                                : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border text-slate-650 hover:bg-slate-50 dark:hover:bg-dk-elevated/60'
                                                        }`}
                                                    >
                                                        {mode === 'light' ? tx(lang, { fr: 'Clair ☀️', ar: 'فاتح ☀️', en: 'Light ☀️', es: 'Claro ☀️', pt: 'Claro ☀️', tr: 'Açık ☀️' }) : mode === 'dark' ? tx(lang, { fr: 'Sombre 🌙', ar: 'داكن 🌙', en: 'Dark 🌙', es: 'Oscuro 🌙', pt: 'Escuro 🌙', tr: 'Koyu 🌙' }) : tx(lang, { fr: 'Système 🖥️', ar: 'النظام 🖥️', en: 'System 🖥️', es: 'Sistema 🖥️', pt: 'Sistema 🖥️', tr: 'Sistem 🖥️' })}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Langue de l'interface (changement instantané) */}
                                {(() => {
                                    const isAr = lang === 'ar';
                                    const active = currentLang || lang;
                                    const LANGS: { code: string; label: string }[] = [
                                        { code: 'fr', label: 'Français' },
                                        { code: 'ar', label: 'العربية' },
                                        { code: 'en', label: 'English' },
                                        { code: 'es', label: 'Español' },
                                        { code: 'pt', label: 'Português' },
                                        { code: 'tr', label: 'Türkçe' },
                                    ];
                                    return (
                                        <div className="flex flex-col gap-2 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl p-3 mt-3">
                                            <div>
                                                <span className="font-bold text-slate-800 dark:text-dk-text text-sm block text-start">{isAr ? 'لغة الواجهة' : "Langue de l'interface"}</span>
                                                <span className="text-[11px] text-slate-400 dark:text-dk-muted block mt-1 leading-relaxed text-start">
                                                    {isAr ? 'يتبدّل العرض فوراً. الترجمة الكاملة للصفحات تتوسّع تدريجياً.' : "Le changement est instantané. La traduction complète des pages s'étend progressivement."}
                                                </span>
                                            </div>
                                            <div className="flex gap-2 flex-wrap mt-2">
                                                {LANGS.map(l => (
                                                    <button
                                                        key={l.code}
                                                        type="button"
                                                        onClick={() => { try { localStorage.setItem('bera_lang', l.code); } catch {} onSetLang?.(l.code); }}
                                                        className={`py-2 px-3 rounded-lg text-[11px] font-bold transition-all border ${
                                                            active === l.code
                                                                ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                                                                : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border text-slate-650 hover:bg-slate-50 dark:hover:bg-dk-elevated/60'
                                                        }`}
                                                    >
                                                        {l.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>

                            <div className="mt-auto pt-4 border-t border-slate-100 dark:border-dk-border">
                                <div className="bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 text-indigo-700 dark:text-dk-accent-text p-4 rounded-xl text-sm font-medium border border-indigo-100 flex items-start gap-3">
                                    <Settings className="w-5 h-5 shrink-0 mt-0.5" />
                                    <p>Les paramètres globaux (Devise, Coût Minute, Horaires) sont synchronisés instantanément sur toutes les pages de l'application.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-sm dark:shadow-dk-sm border border-slate-200 dark:border-dk-border overflow-hidden flex flex-col">
                        <div onClick={() => toggleSec('rh')} className={`px-5 py-4 bg-slate-50 dark:bg-dk-bg flex items-center gap-2 cursor-pointer select-none ${openSec['rh'] ? 'border-b border-slate-100 dark:border-dk-border' : ''}`}>
                            <Users className="w-5 h-5 text-slate-500 dark:text-dk-muted" />
                            <h2 className="font-bold text-slate-800 dark:text-dk-text">{t.rhComptaTitle}</h2>
                            <ChevronDown className={`w-5 h-5 text-slate-400 dark:text-dk-muted ml-auto shrink-0 transition-transform ${openSec['rh'] ? 'rotate-180' : ''}`} />
                        </div>
                        <div className={`p-5 space-y-4 ${openSec['rh'] ? '' : 'hidden'}`}>
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="mt-1 rounded border-slate-300 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text focus:ring-indigo-500"
                                    checked={draft.hrAutoOvertime !== false}
                                    onChange={e => setDraft(prev => ({ ...prev, hrAutoOvertime: e.target.checked }))}
                                />
                                <span>
                                    <span className="font-bold text-slate-800 dark:text-dk-text text-sm block">{t.rhAutoOvertime}</span>
                                    <span className="text-xs text-slate-500 dark:text-dk-muted">{t.rhAutoOvertimeHint}</span>
                                </span>
                            </label>
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 dark:text-dk-muted mb-2">{t.rhComptaRef}</label>
                                <select
                                    name="hrComptaPointageRef"
                                    value={draft.hrComptaPointageRef === 'normales_paie' ? 'normales_paie' : 'pointees'}
                                    onChange={e =>
                                        setDraft(prev => ({
                                            ...prev,
                                            hrComptaPointageRef: e.target.value === 'normales_paie' ? 'normales_paie' : 'pointees',
                                        }))
                                    }
                                    className="w-full bg-slate-50 dark:bg-dk-bg border-2 border-slate-200 dark:border-dk-border rounded-xl px-4 py-3 outline-none focus:border-indigo-500 font-medium text-slate-700 dark:text-dk-text-soft transition-all cursor-pointer text-sm"
                                >
                                    <option value="pointees">{t.rhComptaRefPointees}</option>
                                    <option value="normales_paie">{t.rhComptaRefNormales}</option>
                                </select>
                                <p className="text-xs text-slate-500 dark:text-dk-muted mt-2">{t.rhComptaRefHint}</p>
                            </div>
                            <div className="pt-2 border-t border-slate-100 dark:border-dk-border">
                                <p className="text-xs font-bold text-slate-500 dark:text-dk-muted uppercase tracking-wide mb-2">{t.rhSageServerTitle}</p>
                                <p className="text-xs text-slate-500 dark:text-dk-muted mb-3">{t.rhSageServerHint}</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-600 dark:text-dk-text-soft mb-1">{t.rhSageRounding}</label>
                                        <input
                                            type="number"
                                            min={1}
                                            max={60}
                                            value={sageR}
                                            onChange={e => setSageR(Math.min(60, Math.max(1, parseInt(e.target.value, 10) || 15)))}
                                            className="w-full bg-slate-50 dark:bg-dk-bg border-2 border-slate-200 dark:border-dk-border rounded-lg px-3 py-2 text-sm font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-600 dark:text-dk-text-soft mb-1">{t.rhSageWorkday}</label>
                                        <input
                                            type="time"
                                            value={sageW}
                                            onChange={e => setSageW(e.target.value || '06:00')}
                                            className="w-full bg-slate-50 dark:bg-dk-bg border-2 border-slate-200 dark:border-dk-border rounded-lg px-3 py-2 text-sm font-mono"
                                        />
                                    </div>
                                </div>
                                <label className="flex items-start gap-2 mt-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="mt-0.5 rounded border-slate-300 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text"
                                        checked={sageA}
                                        onChange={e => setSageA(e.target.checked)}
                                    />
                                    <span className="text-sm text-slate-800 dark:text-dk-text">{t.rhSageApply}</span>
                                </label>
                                <button
                                    type="button"
                                    onClick={saveSage}
                                    disabled={sageBusy}
                                    className="mt-3 w-full sm:w-auto px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-bold disabled:opacity-50"
                                >
                                    {sageBusy ? '…' : t.rhSageSave}
                                </button>
                            </div>

                            <div className="pt-4 mt-4 border-t border-slate-200 dark:border-dk-border">
                                <p className="text-xs font-bold text-slate-500 dark:text-dk-muted uppercase tracking-wide mb-1">{t.rhTranchesTitle}</p>
                                <p className="text-xs text-slate-500 dark:text-dk-muted mb-3">{t.rhTranchesDesc}</p>
                                <div className="mb-3">
                                    <label className="block text-xs font-bold text-slate-600 dark:text-dk-text-soft mb-1">{t.rhTranchesPause}</label>
                                    <select
                                        value={trCfg.sepAfterIndex}
                                        onChange={e => {
                                            const v = parseInt(e.target.value, 10);
                                            setTrCfg(c => ({ ...c, sepAfterIndex: Number.isFinite(v) ? v : -1 }));
                                        }}
                                        className="w-full max-w-xs bg-slate-50 dark:bg-dk-bg border-2 border-slate-200 dark:border-dk-border rounded-lg px-3 py-2 text-sm"
                                    >
                                        <option value={-1}>{t.rhTranchesNone}</option>
                                        {Array.from({ length: Math.max(0, trCfg.slots.length - 1) }, (_, i) => {
                                            const s = trCfg.slots[i];
                                            return (
                                                <option key={i} value={i}>
                                                    {i + 1} — {s?.label ?? ''} (colonne « — » avant la tranche suivante)
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                    {trCfg.slots.map((row, idx) => (
                                        <div key={idx} className="flex flex-wrap items-end gap-2 bg-slate-50 dark:bg-dk-bg/80 border border-slate-200 dark:border-dk-border rounded-lg p-2">
                                            <div className="min-w-[100px] flex-1">
                                                <label className="block text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase">{t.rhTranchesLabel}</label>
                                                <input
                                                    value={row.label}
                                                    onChange={e => updateTrSlot(idx, { label: e.target.value })}
                                                    className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded px-2 py-1.5 text-sm"
                                                />
                                            </div>
                                            <div className="w-24">
                                                <label className="block text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase">{t.rhTranchesStart}</label>
                                                <input
                                                    type="time"
                                                    value={row.start}
                                                    onChange={e => updateTrSlot(idx, { start: e.target.value })}
                                                    className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded px-2 py-1.5 text-sm font-mono"
                                                />
                                            </div>
                                            <div className="w-24">
                                                <label className="block text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase">{t.rhTranchesEnd}</label>
                                                <input
                                                    type="time"
                                                    value={row.end}
                                                    onChange={e => updateTrSlot(idx, { end: e.target.value })}
                                                    className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded px-2 py-1.5 text-sm font-mono"
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeTrSlot(idx)}
                                                disabled={trCfg.slots.length <= 2}
                                                className="p-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 disabled:opacity-30"
                                                title={t.rhTranchesDel}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex flex-wrap gap-2 mt-3">
                                    <button
                                        type="button"
                                        onClick={addTrSlot}
                                        className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 text-indigo-800 text-xs font-bold border border-indigo-200"
                                    >
                                        <Plus className="w-4 h-4" />
                                        {t.rhTranchesAdd}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={resetTranches}
                                        className="px-3 py-2 rounded-lg border border-slate-300 text-slate-700 dark:text-dk-text-soft text-xs font-bold"
                                    >
                                        {t.rhTranchesReset}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={saveTranches}
                                        disabled={trBusy}
                                        className="px-4 py-2 rounded-lg bg-slate-800 text-white text-xs font-bold disabled:opacity-50"
                                    >
                                        {trBusy ? '…' : t.rhTranchesSave}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

                {/* RIGHT COLUMN: Production Schedule */}
                <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-sm dark:shadow-dk-sm border border-slate-200 dark:border-dk-border overflow-hidden flex flex-col h-fit">
                    <div onClick={() => toggleSec('prod')} className={`px-5 py-4 bg-slate-50 dark:bg-dk-bg flex items-center gap-2 cursor-pointer select-none ${openSec['prod'] ? 'border-b border-slate-100 dark:border-dk-border' : ''}`}>
                        <Clock className="w-5 h-5 text-slate-500 dark:text-dk-muted" />
                        <h2 className="font-bold text-slate-800 dark:text-dk-text">{t.production}</h2>
                        <ChevronDown className={`w-5 h-5 text-slate-400 dark:text-dk-muted ml-auto shrink-0 transition-transform ${openSec['prod'] ? 'rotate-180' : ''}`} />
                    </div>
                    <div className={`p-5 space-y-6 flex-1 ${openSec['prod'] ? '' : 'hidden'}`}>

                        {/* Time Format */}
                        <div>
                            <label className="block text-xs font-bold uppercase text-slate-500 dark:text-dk-muted mb-2">{t.timeFormat}</label>
                            <div className="flex p-1 bg-slate-100 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border rounded-xl relative overflow-hidden">
                                <div className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white dark:bg-dk-surface rounded-lg shadow-sm dark:shadow-dk-sm border border-slate-200 dark:border-dk-border transition-all duration-300 ${draft.timeFormat === '12h' ? 'left-[calc(50%+2px)]' : 'left-1'}`}></div>
                                <button onClick={() => setDraft(prev => ({ ...prev, timeFormat: '24h' }))} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors relative z-10 ${draft.timeFormat === '24h' ? 'text-indigo-700 dark:text-dk-accent-text' : 'text-slate-500 hover:text-slate-700'}`}>{tx(lang, { fr: '24 Heures', ar: '24 ساعة', en: '24 Hours', es: '24 Horas', pt: '24 Horas', tr: '24 Saat' })}</button>
                                <button onClick={() => setDraft(prev => ({ ...prev, timeFormat: '12h' }))} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors relative z-10 ${draft.timeFormat === '12h' ? 'text-indigo-700 dark:text-dk-accent-text' : 'text-slate-500 hover:text-slate-700'}`}>{tx(lang, { fr: '12 Heures (AM/PM)', ar: '12 ساعة (AM/PM)', en: '12 Hours (AM/PM)', es: '12 Horas (AM/PM)', pt: '12 Horas (AM/PM)', tr: '12 Saat (AM/PM)' })}</button>
                            </div>
                        </div>

                        {/* Working Hours */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 dark:text-dk-muted mb-2">{t.workingHoursStart}</label>
                                <input type="time" name="workingHoursStart" value={draft.workingHoursStart} onChange={handleChange} className="w-full bg-slate-50 dark:bg-dk-bg border-2 border-slate-200 dark:border-dk-border rounded-xl px-4 py-3 outline-none focus:border-indigo-500 font-bold text-lg text-slate-700 dark:text-dk-text-soft transition-all text-center" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 dark:text-dk-muted mb-2">{t.workingHoursEnd}</label>
                                <input type="time" name="workingHoursEnd" value={draft.workingHoursEnd} onChange={handleChange} className="w-full bg-slate-50 dark:bg-dk-bg border-2 border-slate-200 dark:border-dk-border rounded-xl px-4 py-3 outline-none focus:border-indigo-500 font-bold text-lg text-slate-700 dark:text-dk-text-soft transition-all text-center" />
                            </div>
                        </div>

                        {/* Working Days */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="flex items-center gap-2 block text-xs font-bold uppercase text-slate-500 dark:text-dk-muted">{t.workingDays} <span className="text-[10px] text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 px-2 py-0.5 rounded-full border border-indigo-100 font-black tracking-widest">{(draft.workingDays || []).length}/7</span></label>
                                <div className="flex gap-2">
                                    <button onClick={() => setDraft(prev => ({ ...prev, workingDays: [1, 2, 3, 4, 5, 6, 7] }))} className="text-xs font-bold text-slate-500 hover:text-indigo-600 dark:text-dk-accent-text transition-colors uppercase pr-2 border-r border-slate-200 dark:border-dk-border hidden sm:block">{tx(lang, { fr: 'Tous', ar: 'الكل', en: 'All', es: 'Todos', pt: 'Todos', tr: 'Tümü' })}</button>
                                    <button onClick={() => setShowAgenda(true)} className="text-[11px] font-bold bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text hover:text-indigo-700 dark:text-dk-accent-text hover:bg-indigo-100 border border-indigo-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm dark:shadow-dk-sm active:scale-95">
                                        <Calendar className="w-3.5 h-3.5" /> {tx(lang, { fr: 'Agenda', ar: 'التقويم', en: 'Calendar', es: 'Agenda', pt: 'Agenda', tr: 'Takvim' })}
                                    </button>
                                </div>
                            </div>
                            <div className="grid grid-cols-4 sm:flex sm:flex-wrap gap-2">
                                {[1, 2, 3, 4, 5, 6, 7].map((dayCode, idx) => {
                                    const isActive = (draft.workingDays || []).includes(dayCode);
                                    return (
                                        <button
                                            key={dayCode}
                                            onClick={() => toggleWorkingDay(dayCode)}
                                            className={`flex-1 min-w-[3.5rem] py-2.5 rounded-lg font-bold text-xs sm:text-sm transition-all border-2 active:scale-95 ${isActive
                                                ? 'bg-indigo-600 dark:bg-dk-accent text-white border-indigo-600 shadow-md shadow-indigo-600/20'
                                                : 'bg-white dark:bg-dk-surface text-slate-400 border-slate-200 dark:border-dk-border hover:border-indigo-300 hover:text-indigo-600 dark:text-dk-accent-text'
                                                }`}
                                        >
                                            {t.days[idx].substring(0, 3)}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Breaks / Pauses */}
                        <div className="pt-6 border-t border-slate-100 dark:border-dk-border">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-500 dark:text-dk-muted">{t.pauses}</label>
                                    <span className="text-[10px] text-slate-400 dark:text-dk-muted">Ces temps seront déduits des temps de présence.</span>
                                </div>
                                <button onClick={addPause} className="text-xs font-bold bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text flex items-center gap-1 hover:text-indigo-700 dark:text-dk-accent-text hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors border border-indigo-100">
                                    <Plus className="w-3.5 h-3.5" /> {t.addPause}
                                </button>
                            </div>

                            <div className="space-y-3">
                                {(draft.pauses || []).map((pause, index) => (
                                    <div key={pause.id} className="flex flex-col sm:flex-row items-center gap-3 bg-slate-50 dark:bg-dk-bg p-3 rounded-xl border border-slate-200 dark:border-dk-border hover:border-indigo-200 transition-colors">
                                        <span className="text-xs font-bold text-slate-400 dark:text-dk-muted w-6 text-center">{index + 1}.</span>
                                        <div className="flex-1 flex flex-col xl:flex-row gap-3 w-full">
                                            <div className="flex-[1.5]">
                                                <span className="text-[10px] uppercase text-slate-400 dark:text-dk-muted font-bold block mb-1">{t.pauseName}</span>
                                                <input type="text" value={pause.name || ''} onChange={(e) => updatePause(pause.id, 'name', e.target.value)} className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500 text-sm font-bold text-slate-700 dark:text-dk-text-soft placeholder:text-slate-300" placeholder={tx(lang, { fr: 'Ex: Déjeuner', ar: 'مثال: غداء', en: 'Ex: Lunch', es: 'Ej: Almuerzo', pt: 'Ex: Almoço', tr: 'Örn: Öğle yemeği' })} />
                                            </div>
                                            <div className="flex-1">
                                                <span className="text-[10px] uppercase text-slate-400 dark:text-dk-muted font-bold block mb-1">{t.pauseStart}</span>
                                                <input type="time" value={pause.start} onChange={(e) => updatePause(pause.id, 'start', e.target.value)} className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-2 py-1.5 outline-none focus:border-indigo-500 text-sm font-bold text-slate-700 dark:text-dk-text-soft text-center" />
                                            </div>
                                            <div className="flex-1">
                                                <span className="text-[10px] uppercase text-slate-400 dark:text-dk-muted font-bold block mb-1">{t.pauseEnd}</span>
                                                <input type="time" value={pause.end} onChange={(e) => updatePause(pause.id, 'end', e.target.value)} className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-2 py-1.5 outline-none focus:border-indigo-500 text-sm font-bold text-slate-700 dark:text-dk-text-soft text-center" />
                                            </div>
                                            <div className="w-20">
                                                <span className="text-[10px] uppercase text-slate-400 dark:text-dk-muted font-bold block mb-1">{t.pauseDuration}</span>
                                                <div className="w-full bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 border border-indigo-100 rounded-lg px-2 py-1.5 text-center text-sm font-bold text-indigo-700 dark:text-dk-accent-text select-none">
                                                    {pause.durationMin} m
                                                </div>
                                            </div>
                                        </div>
                                        <button onClick={() => removePause(pause.id)} className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 border border-transparent hover:border-rose-100 rounded-lg transition-colors Shrink-0 mt-4 sm:mt-0" title={tx(lang, { fr: 'Supprimer cette pause', ar: 'حذف هذا الاستراحة', en: 'Delete this break', es: 'Eliminar esta pausa', pt: 'Eliminar esta pausa', tr: 'Bu molayı sil' })}>
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                                {(draft.pauses || []).length === 0 && (
                                    <p className="text-sm text-slate-500 dark:text-dk-muted italic text-center py-4 bg-slate-50 dark:bg-dk-bg rounded-lg border border-dashed border-slate-200 dark:border-dk-border">{tx(lang, { fr: 'Aucune pause définie pour le moment.', ar: 'لا توجد أي استراحة معرفة حالياً.', en: 'No break defined at the moment.', es: 'Ninguna pausa definida por el momento.', pt: 'Nenhuma pausa definida de momento.', tr: 'Henüz mola tanımlanmamış.' })}</p>
                                )}
                            </div>
                        </div>

                    </div>
                </div>

            </div>

            {/* FULL WIDTH BLOCK: Systèmes de tailles */}
            <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-sm dark:shadow-dk-sm border border-slate-200 dark:border-dk-border overflow-hidden flex flex-col mt-6">
                <div onClick={() => toggleSec('tailles')} className={`px-5 py-4 bg-slate-50 dark:bg-dk-bg flex items-center justify-between cursor-pointer select-none ${openSec['tailles'] ? 'border-b border-slate-100 dark:border-dk-border' : ''}`}>
                    <div className="flex items-center gap-2">
                        <ListTodo className="w-5 h-5 text-slate-500 dark:text-dk-muted" />
                        <h2 className="font-bold text-slate-800 dark:text-dk-text">{tx(lang, { fr: 'Systèmes de tailles', ar: 'أنظمة المقاسات', en: 'Size systems', es: 'Sistemas de tallas', pt: 'Sistemas de tamanhos', tr: 'Beden sistemleri' })}</h2>
                        <span className="text-[10px] font-black uppercase tracking-wider bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded">Beta</span>
                    </div>
                    <ChevronDown className={`w-5 h-5 text-slate-400 dark:text-dk-muted shrink-0 transition-transform ${openSec['tailles'] ? 'rotate-180' : ''}`} />
                </div>
                <div className={`p-6 md:p-8 space-y-4 ${openSec['tailles'] ? '' : 'hidden'}`}>
                    {/* Activation de la fonctionnalité (Beta) */}
                    <div className="flex items-center justify-between gap-3 bg-amber-50 dark:bg-amber-900/50 border border-amber-100 rounded-xl p-3">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
                            <span className="text-sm font-bold text-slate-700 dark:text-dk-text-soft">{tx(lang, { fr: 'Activer la fonctionnalité (Beta)', ar: 'تفعيل ميزة أنظمة المقاسات (تجريبية)', en: 'Enable the feature (Beta)', es: 'Activar la funcionalidad (Beta)', pt: 'Ativar a funcionalidade (Beta)', tr: 'Özelliği etkinleştir (Beta)' })}</span>
                        </div>
                        <button
                            onClick={() => setDraft(prev => ({ ...prev, tailleSystemsEnabled: prev.tailleSystemsEnabled === false ? true : false }))}
                            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${draft.tailleSystemsEnabled !== false ? 'bg-emerald-500' : 'bg-slate-300'}`}
                            title={draft.tailleSystemsEnabled !== false ? 'Désactiver' : 'Activer'}
                        >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white dark:bg-dk-surface rounded-full shadow transition-transform ${draft.tailleSystemsEnabled !== false ? 'translate-x-5' : ''}`} />
                        </button>
                    </div>

                    {draft.tailleSystemsEnabled === false ? (
                        <p className="text-sm text-slate-400 dark:text-dk-muted italic text-center py-6 bg-slate-50 dark:bg-dk-bg rounded-lg border border-dashed border-slate-200 dark:border-dk-border">
                            {tx(lang, { fr: 'Fonctionnalité désactivée. Activez-la pour définir des systèmes de tailles.', ar: 'الميزة موقوفة. فعّلها للتعريف بأنظمة المقاسات.', en: 'Feature disabled. Enable it to define size systems.', es: 'Funcionalidad desactivada. Actívela para definir sistemas de tallas.', pt: 'Funcionalidade desativada. Ative-a para definir sistemas de tamanhos.', tr: 'Özellik devre dışı. Beden sistemlerini tanımlamak için etkinleştirin.' })}
                        </p>
                    ) : (
                    <>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <p className="text-sm text-slate-500 dark:text-dk-muted font-medium">Définissez les systèmes de tailles de l'usine : alpha (S/M/L), numérique (36-44), en gros (sans tailles) ou personnalisé.</p>
                        <div className="flex items-center gap-2 shrink-0">
                            {(draft.tailleSystems || []).length === 0 && (
                                <button
                                    onClick={() => setDraft(prev => ({ ...prev, tailleSystems: [
                                        { id: 'sys_alpha', label: 'Alpha', mode: 'alpha', sizes: ['S', 'M', 'L', 'XL', 'XXL'] },
                                        { id: 'sys_num', label: 'Numérique', mode: 'numerique', sizes: ['36', '38', '40', '42', '44'] },
                                        { id: 'sys_gros', label: 'En gros', mode: 'gros', sizes: [] },
                                    ] }))}
                                    className="text-xs font-bold bg-slate-50 dark:bg-dk-bg text-slate-600 dark:text-dk-text-soft hover:bg-slate-100 px-3 py-1.5 rounded-lg transition-colors border border-slate-200 dark:border-dk-border"
                                >
                                    Charger par défaut
                                </button>
                            )}
                            <button
                                onClick={() => setDraft(prev => ({ ...prev, tailleSystems: [...(prev.tailleSystems || []), { id: Date.now().toString(), label: '', mode: 'alpha', sizes: [] }] }))}
                                className="text-xs font-bold bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text flex items-center gap-1 hover:text-indigo-700 dark:text-dk-accent-text hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors border border-indigo-100"
                            >
                                <Plus className="w-3.5 h-3.5" /> Ajouter un système
                            </button>
                        </div>
                    </div>

                    {(draft.tailleSystems || []).map(sys => (
                        <div key={sys.id} className="flex flex-col sm:flex-row sm:items-end gap-3 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl p-3">
                            <div className="flex-1">
                                <label className="block text-[11px] font-black text-slate-500 dark:text-dk-muted mb-1">{tx(lang, { fr: 'Nom', ar: 'الاسم', en: 'Name', es: 'Nombre', pt: 'Nome', tr: 'Ad' })}</label>
                                <input
                                    value={sys.label}
                                    onChange={e => setDraft(prev => ({ ...prev, tailleSystems: (prev.tailleSystems || []).map(s => s.id === sys.id ? { ...s, label: e.target.value } : s) }))}
                                    placeholder={tx(lang, { fr: 'ex: Alpha', ar: 'مثال: ألفا', en: 'e.g., Alpha', es: 'ej: Alpha', pt: 'ex: Alpha', tr: 'örn: Alfa' })}
                                    className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-black text-slate-500 dark:text-dk-muted mb-1">{tx(lang, { fr: 'Type', ar: 'النوع', en: 'Type', es: 'Tipo', pt: 'Tipo', tr: 'Tür' })}</label>
                                <select
                                    value={sys.mode}
                                    onChange={e => { const mode = e.target.value as 'alpha' | 'numerique' | 'gros' | 'custom'; setDraft(prev => ({ ...prev, tailleSystems: (prev.tailleSystems || []).map(s => s.id === sys.id ? { ...s, mode, sizes: mode === 'gros' ? [] : s.sizes } : s) })); }}
                                    className="bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-indigo-500"
                                >
                                    <option value="alpha">{tx(lang, { fr: 'Alpha (S/M/L)', ar: 'ألفا (S/M/L)', en: 'Alpha (S/M/L)', es: 'Alfa (S/M/L)', pt: 'Alfa (S/M/L)', tr: 'Alfa (S/M/L)' })}</option>
                                    <option value="numerique">{tx(lang, { fr: 'Numérique (36-44)', ar: 'رقمي (36-44)', en: 'Numeric (36-44)', es: 'Numérico (36-44)', pt: 'Numérico (36-44)', tr: 'Sayısal (36-44)' })}</option>
                                    <option value="gros">{tx(lang, { fr: 'En gros (sans tailles)', ar: 'بالجملة (بدون مقاسات)', en: 'Bulk (no sizes)', es: 'Al por mayor (sin tallas)', pt: 'Por grosso (sem tamanhos)', tr: 'Toplu (bedensiz)' })}</option>
                                    <option value="custom">{tx(lang, { fr: 'Personnalisé', ar: 'مخصص', en: 'Custom', es: 'Personalizado', pt: 'Personalizado', tr: 'Özel' })}</option>
                                </select>
                            </div>
                            <div className="flex-[2]">
                                <label className="block text-[11px] font-black text-slate-500 dark:text-dk-muted mb-1">{tx(lang, { fr: 'Tailles (séparées par un espace)', ar: 'المقاسات (مفصولة بمسافة)', en: 'Sizes (space-separated)', es: 'Tallas (separadas por espacio)', pt: 'Tamanhos (separados por espaço)', tr: 'Bedenler (boşlukla ayrılmış)' })}</label>
                                <input
                                    disabled={sys.mode === 'gros'}
                                    value={sys.sizes.join(' ')}
                                    onChange={e => setDraft(prev => ({ ...prev, tailleSystems: (prev.tailleSystems || []).map(s => s.id === sys.id ? { ...s, sizes: e.target.value.trim().split(/\s+/).filter(Boolean) } : s) }))}
                                    placeholder={sys.mode === 'gros' ? tx(lang, { fr: '— aucune taille —', ar: '— بدون مقاسات —', en: '— no sizes —', es: '— sin tallas —', pt: '— sem tamanhos —', tr: '— beden yok —' }) : 'S M L XL XXL'}
                                    className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-400"
                                />
                            </div>
                            <button
                                onClick={() => setDraft(prev => ({ ...prev, tailleSystems: (prev.tailleSystems || []).filter(s => s.id !== sys.id) }))}
                                className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 border border-transparent hover:border-rose-100 rounded-lg transition-colors shrink-0"
                                title={tx(lang, { fr: 'Supprimer ce système', ar: 'حذف هذا النظام', en: 'Delete this system', es: 'Eliminar este sistema', pt: 'Eliminar este sistema', tr: 'Bu sistemi sil' })}
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}

                    {(draft.tailleSystems || []).length === 0 && (
                        <p className="text-sm text-slate-500 dark:text-dk-muted italic text-center py-4 bg-slate-50 dark:bg-dk-bg rounded-lg border border-dashed border-slate-200 dark:border-dk-border">{tx(lang, { fr: 'Aucun système de tailles défini.', ar: 'لا يوجد أي نظام مقاسات معرف.', en: 'No size system defined.', es: 'Ningún sistema de tallas definido.', pt: 'Nenhum sistema de tamanhos definido.', tr: 'Beden sistemi tanımlanmamış.' })}</p>
                    )}
                    </>
                    )}
                </div>
            </div>

            {/* FULL WIDTH BLOCK: Structure & Encadrement */}
            <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-sm dark:shadow-dk-sm border border-slate-200 dark:border-dk-border overflow-hidden flex flex-col mt-6">
                <div onClick={() => toggleSec('struct')} className={`px-5 py-4 bg-slate-50 dark:bg-dk-bg flex items-center justify-between cursor-pointer select-none ${openSec['struct'] ? 'border-b border-slate-100 dark:border-dk-border' : ''}`}>
                    <div className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-slate-500 dark:text-dk-muted" />
                        <h2 className="font-bold text-slate-800 dark:text-dk-text">{t.structure}</h2>
                    </div>
                    <ChevronDown className={`w-5 h-5 text-slate-400 dark:text-dk-muted shrink-0 transition-transform ${openSec['struct'] ? 'rotate-180' : ''}`} />
                </div>
                <div className={`p-6 md:p-8 space-y-10 ${openSec['struct'] ? '' : 'hidden'}`}>

                    {/* Encadrement Général */}
                    <div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-100 shadow-sm dark:shadow-dk-sm shrink-0">
                                    <Shield className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-slate-800 dark:text-dk-text tracking-tight">{t.generalManagers}</h3>
                                    <p className="text-sm text-slate-500 dark:text-dk-muted mt-0.5 font-medium">{tx(lang, { fr: 'Direction, administration, pointeurs, chronométreurs...', ar: 'الإدارة، الإشراف، مراقبو الوقت...', en: 'Management, administration, timekeepers...', es: 'Dirección, administración, cronometradores...', pt: 'Direção, administração, cronometristas...', tr: 'Yönetim, idare, zaman hakemleri...' })}</p>
                                </div>
                            </div>
                            <button onClick={() => setDraft(prev => ({ ...prev, organigram: [...(prev.organigram || []), { id: Date.now().toString(), name: '', role: '' }] }))} className="w-full sm:w-auto text-sm font-bold bg-white dark:bg-dk-surface text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text flex items-center justify-center gap-2 hover:text-indigo-700 dark:text-dk-accent-text hover:bg-indigo-50 dark:bg-dk-accent/20 px-5 py-2.5 rounded-xl transition-all border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm active:scale-95">
                                <Plus className="w-4 h-4" /> {tx(lang, { fr: 'Ajouter Un Membre', ar: 'إضافة عضو', en: 'Add a Member', es: 'Añadir un miembro', pt: 'Adicionar um membro', tr: 'Üye Ekle' })}
                            </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {(draft.organigram || []).map((person) => (
                                <div key={person.id} className="flex flex-col gap-3 bg-white dark:bg-dk-surface p-5 rounded-2xl border border-slate-200 dark:border-dk-border hover:border-blue-300 hover:shadow-md dark:hover:shadow-dk-md transition-all relative group overflow-hidden">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    <button onClick={() => setDraft(prev => ({ ...prev, organigram: prev.organigram.filter(p => p.id !== person.id) }))} className="absolute top-3 right-3 p-1.5 bg-rose-50 dark:bg-rose-900/30 text-rose-500 hover:text-rose-600 hover:bg-rose-100 rounded-lg shadow-sm dark:shadow-dk-sm border border-rose-100 opacity-0 group-hover:opacity-100 transition-all active:scale-90" title={tx(lang, { fr: 'Supprimer', ar: 'حذف', en: 'Delete', es: 'Eliminar', pt: 'Excluir', tr: 'Sil' })}>
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-dk-muted mb-1 block">{tx(lang, { fr: 'Nom Complet', ar: 'الاسم الكامل', en: 'Full Name', es: 'Nombre Completo', pt: 'Nome Completo', tr: 'Tam Ad' })}</label>
                                        <input type="text" value={person.name} onChange={(e) => setDraft(prev => ({ ...prev, organigram: prev.organigram.map(p => p.id === person.id ? { ...p, name: e.target.value } : p) }))} className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm font-bold text-slate-800 dark:text-dk-text placeholder:text-slate-300 transition-all font-sans" placeholder={tx(lang, { fr: 'ex: Ahmed', ar: 'مثال: أحمد', en: 'e.g., Ahmed', es: 'ej: Ahmed', pt: 'ex: Ahmed', tr: 'örn: Ahmed' })} />
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-slate-400 dark:text-dk-muted mb-1 block">{tx(lang, { fr: 'Rôle / Poste', ar: 'الدور / المنصب', en: 'Role / Position', es: 'Rol / Puesto', pt: 'Função / Cargo', tr: 'Rol / Pozisyon' })}</label>
                                        <input type="text" value={person.role} onChange={(e) => setDraft(prev => ({ ...prev, organigram: prev.organigram.map(p => p.id === person.id ? { ...p, role: e.target.value } : p) }))} className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm font-medium text-slate-600 dark:text-dk-text-soft placeholder:text-slate-300 transition-all" placeholder={tx(lang, { fr: 'ex: Directeur', ar: 'مثال: مدير', en: 'e.g., Director', es: 'ej: Director', pt: 'ex: Diretor', tr: 'örn: Müdür' })} />
                                    </div>
                                </div>
                            ))}
                            {(!draft.organigram || draft.organigram.length === 0) && (
                                <div className="sm:col-span-2 lg:col-span-3 xl:col-span-4 p-8 border-2 border-dashed border-slate-200 dark:border-dk-border rounded-3xl text-center flex flex-col items-center justify-center gap-3 bg-slate-50 dark:bg-dk-bg">
                                    <Shield className="w-10 h-10 text-slate-300 dark:text-dk-muted" />
                                    <span className="text-slate-500 dark:text-dk-muted font-bold text-sm">{tx(lang, { fr: 'Aucun responsable général défini.', ar: 'لا يوجد أي مسؤول عام معرف.', en: 'No supervisor defined.', es: 'Ningún responsable general definido.', pt: 'Nenhum responsável geral definido.', tr: 'Hiçbir yönetici tanımlanmamış.' })}</span>
                                    <span className="text-slate-400 dark:text-dk-muted text-xs">{tx(lang, { fr: 'Cliquez sur « Ajouter un membre » pour commencer.', ar: 'انقر على « إضافة عضو » للبدء.', en: 'Click "Add a member" to get started.', es: 'Haga clic en « Añadir un miembro » para comenzar.', pt: 'Clique em « Adicionar um membro » para começar.', tr: 'Başlamak için « Üye Ekle »ye tıklayın.' })}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <hr className="border-slate-100 dark:border-dk-border" />

                    {/* Number of Chains Config */}
                    <div className="bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 border border-indigo-100 rounded-2xl p-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/3"></div>
                        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-6">
                            <div className="flex-1">
                                <label className="block text-lg font-black text-indigo-900 dark:text-indigo-300 mb-1">{t.chainsCount}</label>
                                <p className="text-sm text-indigo-700 dark:text-dk-accent-text/70 font-medium">Modifier ce nombre mettra à jour l'usine numérique (Effet immédiat sur Suivi, Planning, Effectifs).</p>
                            </div>
                            <div className="relative w-40 shrink-0">
                                <input type="number" min="1" max="50" name="chainsCount" value={draft.chainsCount !== undefined ? draft.chainsCount : 4} onChange={handleChange} className="w-full bg-white dark:bg-dk-surface border-2 border-indigo-200 rounded-xl pl-12 pr-4 py-3 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 font-black text-xl text-indigo-900 dark:text-indigo-300 transition-all" />
                                <Building className="w-6 h-6 text-indigo-400 absolute left-4 top-3.5" />
                            </div>
                        </div>
                    </div>

                    {/* Effectifs par Chaîne */}
                    <div>
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-100"><Users className="w-5 h-5" /></div>
                            <div>
                                <h3 className="text-base font-black text-slate-800 dark:text-dk-text tracking-tight">{t.chainStaff}</h3>
                                <p className="text-xs text-slate-500 dark:text-dk-muted mt-0.5 font-medium">Chef de groupe, moniteur, qualiticien de ligne...</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
                            {Array.from({ length: draft.chainsCount || 4 }).map((_, i) => {
                                const chainKey = `CHAINE ${i + 1}`;
                                const staff = draft.chainStaff?.[chainKey] || [];
                                return (
                                    <div key={chainKey} className="bg-white dark:bg-dk-surface border-2 border-slate-100 dark:border-dk-border rounded-3xl overflow-hidden shadow-sm dark:shadow-dk-sm hover:border-emerald-200 transition-colors flex flex-col">
                                        <div className="bg-emerald-50 dark:bg-emerald-900/50 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between border-b border-emerald-100 gap-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-xl bg-white dark:bg-dk-surface border border-emerald-200 shadow-sm dark:shadow-dk-sm flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-black text-sm">{i + 1}</div>
                                                <input
                                                    type="text"
                                                    value={draft.chainNames?.[chainKey] || chainKey}
                                                    onChange={(e) => setDraft(prev => ({
                                                        ...prev,
                                                        chainNames: { ...(prev.chainNames || {}), [chainKey]: e.target.value || chainKey }
                                                    }))}
                                                    className="font-black text-slate-800 dark:text-dk-text tracking-wider text-base bg-transparent border-b-2 border-transparent hover:border-emerald-300 focus:border-emerald-500 focus:bg-white px-1 outline-none transition-all w-32"
                                                    placeholder={tx(lang, { fr: 'Nom de la chaîne...', ar: 'اسم الخط...', en: 'Chain name...', es: 'Nombre de la cadena...', pt: 'Nome da cadeia...', tr: 'Hat adı...' })}
                                                />
                                            </div>
                                            <button onClick={() => setDraft(prev => ({
                                                ...prev,
                                                chainStaff: {
                                                    ...(prev.chainStaff || {}),
                                                    [chainKey]: [...staff, { id: Date.now().toString(), name: '', role: 'Chef de chaîne' }]
                                                }
                                            }))} className="w-full sm:w-auto text-[11px] font-bold uppercase tracking-wider bg-white dark:bg-dk-surface text-slate-600 dark:text-dk-text-soft hover:text-emerald-700 px-4 py-2 rounded-xl shadow-sm dark:shadow-dk-sm border border-slate-200 dark:border-dk-border hover:border-emerald-300 transition-all flex items-center justify-center gap-1.5 active:scale-95">
                                                <Plus className="w-3.5 h-3.5" /> Ajouter
                                            </button>
                                        </div>
                                        <div className="p-5 bg-white dark:bg-dk-surface flex-1 flex flex-col">
                                            {staff.length > 0 ? (
                                                <div className="space-y-4">
                                                    {staff.map((person) => (
                                                        <div key={person.id} className="flex flex-col sm:flex-row items-center gap-3 group relative bg-slate-50 dark:bg-dk-bg p-3 rounded-2xl border border-slate-100 dark:border-dk-border hover:border-emerald-200 transition-colors">
                                                            <div className="flex-1 w-full">
                                                                <input type="text" value={person.name} onChange={(e) => setDraft(prev => ({ ...prev, chainStaff: { ...prev.chainStaff, [chainKey]: prev.chainStaff[chainKey].map(p => p.id === person.id ? { ...p, name: e.target.value } : p) } }))} className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-4 py-2.5 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 text-sm font-bold text-slate-700 dark:text-dk-text-soft transition-all" placeholder={tx(lang, { fr: 'Nom Complet', ar: 'الاسم الكامل', en: 'Full Name', es: 'Nombre Completo', pt: 'Nome Completo', tr: 'Tam Ad' })} />
                                                            </div>
                                                            <div className="flex-1 w-full">
                                                                <input type="text" value={person.role} onChange={(e) => setDraft(prev => ({ ...prev, chainStaff: { ...prev.chainStaff, [chainKey]: prev.chainStaff[chainKey].map(p => p.id === person.id ? { ...p, role: e.target.value } : p) } }))} className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-4 py-2.5 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 text-sm font-medium text-slate-600 dark:text-dk-text-soft transition-all" placeholder={tx(lang, { fr: 'Rôle (ex: Qualité)', ar: 'الدور (مثال: الجودة)', en: 'Role (ex: Quality)', es: 'Rol (ej: Calidad)', pt: 'Função (ex: Qualidade)', tr: 'Rol (örn: Kalite)' })} />
                                                            </div>
                                                             <button onClick={() => setDraft(prev => ({ ...prev, chainStaff: { ...prev.chainStaff, [chainKey]: prev.chainStaff[chainKey].filter(p => p.id !== person.id) } }))} className="w-full sm:w-10 sm:h-10 text-rose-400 hover:text-rose-600 bg-white dark:bg-dk-surface hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-xl border border-slate-200 dark:border-dk-border hover:border-rose-300 shadow-sm dark:shadow-dk-sm transition-all focus:outline-none shrink-0 flex items-center justify-center active:scale-90 py-2 sm:py-0" title={tx(lang, { fr: 'Supprimer', ar: 'حذف', en: 'Delete', es: 'Eliminar', pt: 'Excluir', tr: 'Sil' })}>
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="flex-1 flex flex-col items-center justify-center py-8">
                                                    <div className="w-12 h-12 bg-slate-50 dark:bg-dk-bg rounded-full flex items-center justify-center mb-3">
                                                        <Users className="w-6 h-6 text-slate-300 dark:text-dk-muted" />
                                                    </div>
                                                    <span className="text-sm text-slate-400 dark:text-dk-muted font-bold bg-slate-50 dark:bg-dk-bg px-5 py-2 rounded-full border border-slate-100 dark:border-dk-border">{tx(lang, { fr: 'Aucun personnel affecté', ar: 'لا يوجد موظفون معينون', en: 'No staff assigned', es: 'Ningún personal asignado', pt: 'Nenhum pessoal atribuído', tr: 'Atanmış personel yok' })}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <hr className="border-slate-100 dark:border-dk-border" />

                    <div className="mt-10">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text flex items-center justify-center border border-indigo-100">
                                <Factory className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-base font-black text-slate-800 dark:text-dk-text tracking-tight">
                                    {tx(lang, { fr: 'Machines par chaîne (planning)', ar: 'الماكينات حسب الخط (التخطيط)', en: 'Machines per chain (planning)', es: 'Máquinas por cadena (planificación)', pt: 'Máquinas por cadeia (planeamento)', tr: 'Hat başına makineler (planlama)' })}
                                </h3>
                                <p className="text-xs text-slate-500 dark:text-dk-muted mt-0.5 font-medium max-w-3xl">
                                    {tx(lang, {
                                        fr: 'Cochez les machines réellement sur chaque ligne. Par défaut (aucune sélection enregistrée), le planning utilise tout le parc actif hors panne / maintenance. Réduire la liste force la vérification « gamme vs machines » sur ce sous-ensemble.',
                                        ar: 'اختر الماكينات الفعلية لكل خط. بدون اختيار محفوظ يستخدم التخطيط كامل الماكينات النشطة الصالحة.',
                                        en: 'Check the machines actually present on each line. By default (no selection saved), planning uses the entire active parc excluding breakdown / maintenance. Reducing the list forces the "operation range vs machines" check on this subset.',
                                        es: 'Marque las máquinas realmente presentes en cada línea. Por defecto (sin selección guardada), la planificación usa todo el parque activo excepto avería / mantenimiento. Reducir la lista fuerza la verificación «gama vs máquinas» sobre este subconjunto.',
                                        pt: 'Marque as máquinas realmente presentes em cada linha. Por defeito (sem seleção guardada), o planeamento usa todo o parque ativo exceto avaria / manutenção. Reduzir a lista força a verificação «gama vs máquinas» sobre este subconjunto.',
                                        tr: 'Her hatta gerçekten bulunan makineleri işaretleyin. Varsayılan olarak (kayıtlı seçim yoksa), planlama arıza / bakım hariç tüm aktif parkı kullanır. Listeyi daraltmak bu alt kümede "operasyon dizisi vs makineler" kontrolünü zorunlu kılar.',
                                    })}
                                </p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
                            {Array.from({ length: draft.chainsCount || 4 }).map((_, i) => {
                                const chainKey = `CHAINE ${i + 1}`;
                                const baseIds = machines.filter(isMachineOperational).map(m => m.id);
                                const explicit = draft.chainMachines?.[chainKey];
                                const selected =
                                    explicit != null && explicit.length > 0 ? explicit.filter(id => baseIds.includes(id)) : baseIds;
                                const chainDisplayName = draft.chainNames?.[chainKey] || chainKey;
                                return (
                                    <div
                                        key={`cm-${chainKey}`}
                                        className="bg-white dark:bg-dk-surface border-2 border-slate-100 dark:border-dk-border rounded-3xl overflow-hidden shadow-sm dark:shadow-dk-sm p-5 flex flex-col gap-3"
                                    >
                                        <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-dk-border pb-3">
                                            <span className="font-black text-slate-800 dark:text-dk-text text-sm">{chainDisplayName}</span>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setDraft(prev => {
                                                        const cm = { ...(prev.chainMachines || {}) };
                                                        delete cm[chainKey];
                                                        const keys = Object.keys(cm);
                                                        return { ...prev, chainMachines: keys.length ? cm : undefined };
                                                    })
                                                }
                                                className="text-[10px] font-bold uppercase text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text hover:text-indigo-800 px-2 py-1 rounded-lg hover:bg-indigo-50 dark:bg-dk-accent/20"
                                            >
                                                {tx(lang, { fr: 'Tout le parc', ar: 'الكل', en: 'Whole parc', es: 'Todo el parque', pt: 'Todo o parque', tr: 'Tüm park' })}
                                            </button>
                                        </div>
                                        <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto custom-scrollbar">
                                            {machines
                                                .filter(m => m.active)
                                                .map(m => {
                                                    const usable = isMachineOperational(m);
                                                    const checked = usable && selected.includes(m.id);
                                                    return (
                                                        <label
                                                            key={`${chainKey}-${m.id}`}
                                                            className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold cursor-pointer select-none ${
                                                                usable
                                                                    ? 'border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg hover:border-indigo-200'
                                                                    : 'border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/60 text-slate-400 dark:text-dk-muted cursor-not-allowed'
                                                            }`}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                className="rounded border-slate-300 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text focus:ring-indigo-500"
                                                                checked={checked}
                                                                disabled={!usable}
                                                                onChange={() => {
                                                                    if (!usable) return;
                                                                    setDraft(prev => {
                                                                        const b = machines.filter(isMachineOperational).map(x => x.id);
                                                                        const cur =
                                                                            prev.chainMachines?.[chainKey]?.length
                                                                                ? prev.chainMachines![chainKey]!
                                                                                : [...b];
                                                                        const on = cur.includes(m.id);
                                                                        const next = on
                                                                            ? cur.filter(id => id !== m.id)
                                                                            : [...cur, m.id];
                                                                        const sortedB = [...b].sort().join(',');
                                                                        const sortedN = [...next].sort().join(',');
                                                                        const cm = { ...(prev.chainMachines || {}) };
                                                                        if (next.length === 0 || sortedB === sortedN) {
                                                                            delete cm[chainKey];
                                                                        } else {
                                                                            cm[chainKey] = next;
                                                                        }
                                                                        const keys = Object.keys(cm);
                                                                        return {
                                                                            ...prev,
                                                                            chainMachines: keys.length ? cm : undefined,
                                                                        };
                                                                    });
                                                                }}
                                                            />
                                                            <span className="font-mono text-slate-700 dark:text-dk-text-soft">{m.classe}</span>
                                                            <span className="text-slate-500 dark:text-dk-muted font-medium truncate max-w-[100px]">{m.name}</span>
                                                            {!usable && m.status && (
                                                                <span className="text-[9px] uppercase text-amber-600 dark:text-amber-400">{m.status}</span>
                                                            )}
                                                        </label>
                                                    );
                                                })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                </div>
            </div>

            {/* FULL WIDTH BLOCK: Config Moteur APS */}
            <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-sm dark:shadow-dk-sm border border-slate-200 dark:border-dk-border overflow-hidden flex flex-col mt-6">
                <div onClick={() => toggleSec('aps')} className={`px-5 py-4 bg-slate-50 dark:bg-dk-bg flex items-center justify-between cursor-pointer select-none ${openSec['aps'] ? 'border-b border-slate-100 dark:border-dk-border' : ''}`}>
                    <div className="flex items-center gap-2">
                        <Zap className="w-5 h-5 text-amber-500 dark:text-amber-400" />
                        <h2 className="font-bold text-slate-800 dark:text-dk-text">{t.apsTitle}</h2>
                    </div>
                    <ChevronDown className={`w-5 h-5 text-slate-400 dark:text-dk-muted shrink-0 transition-transform ${openSec['aps'] ? 'rotate-180' : ''}`} />
                </div>
                <div className={`p-6 md:p-8 space-y-6 ${openSec['aps'] ? '' : 'hidden'}`}>
                    <p className="text-sm text-slate-500 dark:text-dk-muted font-medium">
                        {t.apsDesc}
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Mode de calcul */}
                        <div className="space-y-2">
                            <label className="block text-xs font-bold uppercase text-slate-500 dark:text-dk-muted tracking-wider">
                                {t.apsCapacityMode}
                            </label>
                            <div className="flex flex-col gap-2">
                                <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-dk-text-soft cursor-pointer">
                                    <input
                                        type="radio"
                                        name="capacityMode"
                                        value="STATIC"
                                        checked={(draft.capacityMode || 'STATIC') === 'STATIC'}
                                        onChange={() => setDraft(prev => ({ ...prev, capacityMode: 'STATIC' }))}
                                        className="text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text focus:ring-indigo-500"
                                    />
                                    <span>{t.apsModeStatic}</span>
                                </label>
                                <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-dk-text-soft cursor-pointer">
                                    <input
                                        type="radio"
                                        name="capacityMode"
                                        value="DYNAMIC"
                                        checked={draft.capacityMode === 'DYNAMIC'}
                                        onChange={() => setDraft(prev => ({ ...prev, capacityMode: 'DYNAMIC' }))}
                                        className="text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text focus:ring-indigo-500"
                                    />
                                    <span>{t.apsModeDynamic}</span>
                                </label>
                            </div>
                        </div>

                        {/* Coût heures supp */}
                        <div className="space-y-2">
                            <label className="block text-xs font-bold uppercase text-slate-500 dark:text-dk-muted tracking-wider">
                                {t.apsOvertimeCost}
                            </label>
                            <input
                                type="number"
                                value={draft.overtimeCostPerHour ?? 25}
                                onChange={e => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setDraft(prev => ({ ...prev, overtimeCostPerHour: val }));
                                }}
                                className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-sm font-bold text-slate-700 dark:text-dk-text-soft transition-all"
                                min={0}
                            />
                        </div>

                        {/* Coût sous-traitance */}
                        <div className="space-y-2">
                            <label className="block text-xs font-bold uppercase text-slate-500 dark:text-dk-muted tracking-wider">
                                {t.apsSubcontractCost}
                            </label>
                            <input
                                type="number"
                                value={draft.subcontractDefaultCostPerPiece ?? 15}
                                onChange={e => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setDraft(prev => ({ ...prev, subcontractDefaultCostPerPiece: val }));
                                }}
                                className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-4 py-2.5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-sm font-bold text-slate-700 dark:text-dk-text-soft transition-all"
                                min={0}
                            />
                        </div>
                    </div>

                    <hr className="border-slate-100 dark:border-dk-border" />

                    {/* Paramètres APS par chaîne */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-slate-700 dark:text-dk-text-soft">{t.apsChainConfig}</h3>
                        <div className="overflow-x-auto border border-slate-200 dark:border-dk-border rounded-xl">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-dk-bg border-b border-slate-200 dark:border-dk-border text-xs font-bold uppercase text-slate-500 dark:text-dk-muted tracking-wider">
                                        <th className="px-6 py-3">{tx(lang, { fr: 'Chaîne', ar: 'الخط', en: 'Chain', es: 'Cadena', pt: 'Cadeia', tr: 'Hat' })}</th>
                                        <th className="px-6 py-3">{t.apsOperators}</th>
                                        <th className="px-6 py-3">{t.apsActivityRate}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-dk-border text-sm font-medium text-slate-700 dark:text-dk-text-soft">
                                    {Array.from({ length: draft.chainsCount || 4 }).map((_, i) => {
                                        const chainKey = `CHAINE ${i + 1}`;
                                        const chainDisplayName = draft.chainNames?.[chainKey] || chainKey;
                                        const operators = draft.chainOperators?.[chainKey] ?? 30;
                                        const rate = draft.chainActivityRate?.[chainKey] ?? 0.85;

                                        return (
                                            <tr key={chainKey} className="hover:bg-slate-50/50 dark:hover:bg-dk-elevated/60">
                                                <td className="px-6 py-4 font-bold">{chainDisplayName}</td>
                                                <td className="px-6 py-4">
                                                    <input
                                                        type="number"
                                                        value={operators}
                                                        onChange={e => {
                                                            const val = parseInt(e.target.value, 10) || 0;
                                                            setDraft(prev => ({
                                                                ...prev,
                                                                chainOperators: {
                                                                    ...(prev.chainOperators || {}),
                                                                    [chainKey]: val,
                                                                },
                                                            }));
                                                        }}
                                                        className="w-24 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500 text-sm font-bold text-slate-700 dark:text-dk-text-soft"
                                                        min={0}
                                                    />
                                                </td>
                                                <td className="px-6 py-4">
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        value={rate}
                                                        onChange={e => {
                                                            const val = parseFloat(e.target.value) || 0;
                                                            setDraft(prev => ({
                                                                ...prev,
                                                                chainActivityRate: {
                                                                    ...(prev.chainActivityRate || {}),
                                                                    [chainKey]: val,
                                                                },
                                                            }));
                                                        }}
                                                        className="w-24 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500 text-sm font-bold text-slate-700 dark:text-dk-text-soft"
                                                        min={0}
                                                        max={1}
                                                    />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* FULL WIDTH BLOCK: Personnalisation du Menu de Navigation */}
            {navConfig && setNavConfig && (
                <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-sm dark:shadow-dk-sm border border-slate-200 dark:border-dk-border overflow-hidden flex flex-col mt-6">
                    <div onClick={() => toggleSec('nav')} className={`px-5 py-4 bg-slate-50 dark:bg-dk-bg flex items-center justify-between cursor-pointer select-none ${openSec['nav'] ? 'border-b border-slate-100 dark:border-dk-border' : ''}`}>
                        <div className="flex items-center gap-2">
                            <ListTodo className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
                            <h2 className="font-bold text-slate-800 dark:text-dk-text">
                                {tx(lang, { fr: 'Configuration de la barre de navigation', ar: 'إعدادات شريط التنقل', en: 'Navigation bar configuration', es: 'Configuración de la barra de navegación', pt: 'Configuração da barra de navegação', tr: 'Gezinme çubuğu yapılandırması' })}
                            </h2>
                            <ChevronDown className={`w-5 h-5 text-slate-400 dark:text-dk-muted shrink-0 transition-transform ${openSec['nav'] ? 'rotate-180' : ''}`} />
                        </div>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(tx(lang, { fr: 'Voulez-vous vraiment réinitialiser la navigation ?', ar: 'هل تريد حقًا إعادة تعيين القائمة؟', en: 'Do you really want to reset the navigation?', es: '¿Realmente desea restablecer la navegación?', pt: 'Deseja mesmo repor a navegação?', tr: 'Gezinmeyi gerçekten sıfırlamak istiyor musunuz?' }))) {
                                    const defaultCategories = [
                                        { id: 'principal', name: 'Principal', views: ['dashboard', 'library', 'suivi', 'planning'] },
                                        { id: 'production', name: 'Production', views: ['effectifs', 'coupe', 'sousTraitance'] },
                                        { id: 'rh', name: 'RH', views: ['gestionRh', 'catalogTemps'] },
                                        { id: 'logistique', name: 'Logistique', views: ['magasin', 'export', 'facturation'] },
                                        { id: 'config', name: 'Config', views: ['machin', 'rendement', 'pageMachine', 'config'] }
                                    ];
                                    const defaultNavOrder = ['dashboard', 'library', 'suivi', 'planning', 'effectifs', 'magasin', 'gestionRh', 'catalogTemps', 'machin', 'coupe', 'rendement', 'export', 'facturation', 'config', 'pageMachine', 'admin', 'sousTraitance'];
                                    setNavConfig({
                                        enabled: true,
                                        style: 'dropdown',
                                        order: defaultNavOrder,
                                        hidden: [],
                                        categories: defaultCategories
                                    });
                                }
                            }}
                            className="text-xs font-bold text-red-600 dark:text-red-400 hover:text-red-700 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 px-3 py-1.5 rounded-lg border border-red-100 transition-colors"
                        >
                            {tx(lang, { fr: 'Réinitialiser', ar: 'إعادة تعيين', en: 'Reset', es: 'Restablecer', pt: 'Repor', tr: 'Sıfırla' })}
                        </button>
                    </div>
                    <div className={`p-6 md:p-8 space-y-6 ${openSec['nav'] ? '' : 'hidden'}`}>
                        <p className="text-sm text-slate-500 dark:text-dk-muted font-medium">
                            {tx(lang, {
                                fr: 'Configurez le type d\'affichage des menus (dropdowns ou ruban plat), modifiez les titres des catégories ou déplacez librement les pages.',
                                ar: 'تخصيص نمط القائمة (منسدلة أو مسطحة)، تعديل أسماء الفئات، أو نقل الصفحات بحرية.',
                                en: 'Configure the menu display type (dropdowns or flat ribbon), edit the category titles or move the pages freely.',
                                es: 'Configure el tipo de visualización de los menús (desplegables o cinta plana), edite los títulos de las categorías o mueva las páginas libremente.',
                                pt: 'Configure o tipo de exibição dos menus (suspensos ou faixa plana), edite os títulos das categorias ou mova as páginas livremente.',
                                tr: 'Menü görüntüleme türünü (açılır menüler veya düz şerit) yapılandırın, kategori başlıklarını düzenleyin veya sayfaları serbestçe taşıyın.',
                            })}
                        </p>

                        {/* Layout Style Selector */}
                        <div className="space-y-3">
                            <label className="block text-xs font-bold uppercase text-slate-500 dark:text-dk-muted tracking-wider">
                                {tx(lang, { fr: "Type d'affichage", ar: 'نمط العرض', en: 'Display type', es: 'Tipo de visualización', pt: 'Tipo de exibição', tr: 'Görüntüleme türü' })}
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {[
                                    { key: 'dropdown', label: { fr: 'Menus Déroulants Groupés', ar: 'قوائم منسدلة مجموعة', en: 'Grouped Dropdown Menus', es: 'Menús Desplegables Agrupados', pt: 'Menus Suspensos Agrupados', tr: 'Gruplandırılmış Açılır Menüler' } },
                                    { key: 'flat', label: { fr: 'Ruban Plat Horizontal', ar: 'شريط أفقي مسطح', en: 'Horizontal Flat Ribbon', es: 'Cinta Plana Horizontal', pt: 'Faixa Plana Horizontal', tr: 'Yatay Düz Şerit' } },
                                    { key: 'mobile-only', label: { fr: 'Hamburger / Menu Latéral Uniquement', ar: 'زر القائمة الجانبية فقط', en: 'Hamburger / Side Menu Only', es: 'Hamburguesa / Solo Menú Lateral', pt: 'Hambúrguer / Apenas Menu Lateral', tr: 'Hamburger / Yalnızca Yan Menü' } }
                                ].map((item) => (
                                    <button
                                        key={item.key}
                                        onClick={() => setNavConfig({ ...navConfig, style: item.key as any })}
                                        className={`p-4 rounded-xl border-2 font-bold text-sm transition-all text-start flex flex-col gap-1 hover:border-indigo-300 active:scale-98 ${
                                            navConfig.style === item.key
                                                ? 'bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 border-indigo-500 text-indigo-700 dark:text-dk-accent-text shadow-sm dark:shadow-dk-sm'
                                                : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft'
                                        }`}
                                    >
                                        <span>{tx(lang, item.label)}</span>
                                        <span className="text-[10px] font-normal text-slate-400 dark:text-dk-muted">
                                            {item.key === 'dropdown' && tx(lang, { fr: 'Regroupe les 20 modules dans 5 menus compacts', ar: 'تجميع 20 موديول في 5 قوائم مدمجة', en: 'Groups the 20 modules into 5 compact menus', es: 'Agrupa los 20 módulos en 5 menús compactos', pt: 'Agrupa os 20 módulos em 5 menus compactos', tr: '20 modülü 5 kompakt menüde gruplar' })}
                                            {item.key === 'flat' && tx(lang, { fr: "Affiche tous les boutons l'un après l'autre", ar: 'عرض جميع الأزرار متتالية', en: 'Displays all the buttons one after another', es: 'Muestra todos los botones uno tras otro', pt: 'Mostra todos os botões um após o outro', tr: 'Tüm düğmeleri art arda gösterir' })}
                                            {item.key === 'mobile-only' && tx(lang, { fr: "Idéal pour maximiser l'espace de travail", ar: 'مثالي لزيادة مساحة العمل', en: 'Ideal for maximizing the workspace', es: 'Ideal para maximizar el espacio de trabajo', pt: 'Ideal para maximizar o espaço de trabalho', tr: 'Çalışma alanını en üst düzeye çıkarmak için ideal' })}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Hamburger Enable Switch (Only if not mobile-only) */}
                        {navConfig.style !== 'mobile-only' && (
                            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-dk-bg border border-slate-100 dark:border-dk-border">
                                <div>
                                    <span className="text-sm font-bold text-slate-700 dark:text-dk-text-soft">
                                        {tx(lang, { fr: 'Bouton Hamburger (☰)', ar: 'زر القائمة الجانبية (☰)', en: 'Hamburger Button (☰)', es: 'Botón Hamburguesa (☰)', pt: 'Botão Hambúrguer (☰)', tr: 'Hamburger Düğmesi (☰)' })}
                                    </span>
                                    <p className="text-[11px] text-slate-400 dark:text-dk-muted">
                                        {tx(lang, { fr: 'Afficher également le menu hamburger rapide à gauche', ar: 'عرض زر القائمة السريعة الجانبية على اليسار أيضاً', en: 'Also show the quick hamburger menu on the left', es: 'Mostrar también el menú hamburguesa rápido a la izquierda', pt: 'Mostrar também o menu hambúrguer rápido à esquerda', tr: 'Hızlı hamburger menüyü solda da göster' })}
                                    </p>
                                </div>
                                <button 
                                    onClick={() => setNavConfig({ ...navConfig, enabled: !navConfig.enabled })}
                                    className={`w-10 h-5 rounded-full p-0.5 transition-colors relative flex items-center ${navConfig.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                >
                                    <div className={`w-4 h-4 bg-white dark:bg-dk-surface rounded-full shadow-sm dark:shadow-dk-sm transition-transform duration-300 ${navConfig.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                                </button>
                            </div>
                        )}

                        {/* Categories Organization (Only relevant if dropdown style is active) */}
                        {navConfig.style === 'dropdown' && (
                            <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-dk-border">
                                <label className="block text-xs font-bold uppercase text-slate-500 dark:text-dk-muted tracking-wider">
                                    {tx(lang, { fr: 'Renommer et organiser les catégories', ar: 'تعديل أسماء وتنظيم الفئات', en: 'Rename and organize the categories', es: 'Renombrar y organizar las categorías', pt: 'Renomear e organizar as categorias', tr: 'Kategorileri yeniden adlandır ve düzenle' })}
                                </label>
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    {navConfig.categories?.map((category, catIdx) => (
                                        <div key={category.id} className="bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-2xl p-4 space-y-3">
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    value={category.name}
                                                    onChange={(e) => {
                                                        const updated = [...navConfig.categories];
                                                        updated[catIdx] = { ...category, name: e.target.value };
                                                        setNavConfig({ ...navConfig, categories: updated });
                                                    }}
                                                    className="bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border hover:border-indigo-300 focus:border-indigo-500 outline-none rounded-xl px-3 py-2 text-sm font-bold text-slate-800 dark:text-dk-text flex-1 shadow-sm dark:shadow-dk-sm transition-all"
                                                    placeholder={tx(lang, { fr: 'Nom de la catégorie', ar: 'اسم الفئة', en: 'Category name', es: 'Nombre de la categoría', pt: 'Nome da categoria', tr: 'Kategori adı' })}
                                                />
                                                <span className="text-[10px] font-black uppercase bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 text-indigo-700 dark:text-dk-accent-text px-2 py-1 rounded border border-indigo-100">
                                                    {category.views.length} {tx(lang, { fr: 'Pages', ar: 'صفحات', en: 'Pages', es: 'Páginas', pt: 'Páginas', tr: 'Sayfa' })}
                                                </span>
                                            </div>
                                            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                                                {category.views.map((view) => {
                                                    const isHidden = navConfig.hidden.includes(view);
                                                    return (
                                                        <div key={view} className="flex items-center justify-between gap-2 bg-white dark:bg-dk-surface px-3 py-2 rounded-lg border border-slate-200 dark:border-dk-border text-xs font-semibold text-slate-700 dark:text-dk-text-soft shadow-sm dark:shadow-dk-sm">
                                                            <span className="truncate">{VIEW_LABELS[view]?.[lang] || view}</span>
                                                            <div className="flex items-center gap-1.5 shrink-0">
                                                                {/* Category Mover selector */}
                                                                <select
                                                                    value={category.id}
                                                                    onChange={(e) => {
                                                                        const targetCatId = e.target.value;
                                                                        const updatedCats = navConfig.categories.map(c => {
                                                                            if (c.id === category.id) {
                                                                                return { ...c, views: c.views.filter(v => v !== view) };
                                                                            }
                                                                            if (c.id === targetCatId) {
                                                                                return { ...c, views: [...c.views, view] };
                                                                            }
                                                                            return c;
                                                                        });
                                                                        setNavConfig({ ...navConfig, categories: updatedCats });
                                                                    }}
                                                                    className="bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:text-dk-text-soft"
                                                                >
                                                                    {navConfig.categories.map(c => (
                                                                        <option key={c.id} value={c.id}>{c.name}</option>
                                                                    ))}
                                                                </select>

                                                                {/* Visibility toggle button */}
                                                                <button
                                                                    onClick={() => {
                                                                        const hidden = isHidden
                                                                            ? navConfig.hidden.filter(v => v !== view)
                                                                            : [...navConfig.hidden, view];
                                                                        setNavConfig({ ...navConfig, hidden });
                                                                    }}
                                                                    className={`px-2 py-0.5 text-[9px] font-bold rounded-full border transition-all ${
                                                                        isHidden
                                                                            ? 'bg-slate-100 dark:bg-dk-elevated border-slate-200 dark:border-dk-border text-slate-400 dark:text-dk-muted'
                                                                            : 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 text-emerald-600 dark:text-emerald-400'
                                                                    }`}
                                                                >
                                                                    {isHidden ? tx(lang, { fr: 'Masqué', ar: 'مخفي', en: 'Hidden', es: 'Oculto', pt: 'Oculto', tr: 'Gizli' }) : tx(lang, { fr: 'Visible', ar: 'مرئي', en: 'Visible', es: 'Visible', pt: 'Visível', tr: 'Görünür' })}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Flat Order and Visibility List (Only relevant if flat style is active) */}
                        {navConfig.style === 'flat' && (
                            <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-dk-border">
                                <label className="block text-xs font-bold uppercase text-slate-500 dark:text-dk-muted tracking-wider">
                                    {tx(lang, { fr: 'Ordre et visibilité des modules', ar: 'ترتيب وظهور الوحدات', en: 'Order and visibility of modules', es: 'Orden y visibilidad de los módulos', pt: 'Ordem e visibilidade dos módulos', tr: 'Modüllerin sırası ve görünürlüğü' })}
                                </label>
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                                    {navConfig.order.map((view, idx) => {
                                        const isHidden = navConfig.hidden.includes(view);
                                        return (
                                            <div key={view} className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${
                                                isHidden ? 'bg-slate-50 dark:bg-dk-bg border-slate-100 dark:border-dk-border opacity-60' : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm'
                                            }`}>
                                                {/* Reorder Buttons */}
                                                <div className="flex flex-col gap-0.5 shrink-0">
                                                    <button
                                                        disabled={idx === 0}
                                                        onClick={() => {
                                                            const newOrder = [...navConfig.order];
                                                            [newOrder[idx], newOrder[idx - 1]] = [newOrder[idx - 1], newOrder[idx]];
                                                            setNavConfig({ ...navConfig, order: newOrder });
                                                        }}
                                                        className="text-[10px] text-slate-400 hover:text-slate-700 disabled:opacity-20 leading-none"
                                                    >
                                                        ▲
                                                    </button>
                                                    <button
                                                        disabled={idx === navConfig.order.length - 1}
                                                        onClick={() => {
                                                            const newOrder = [...navConfig.order];
                                                            [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
                                                            setNavConfig({ ...navConfig, order: newOrder });
                                                        }}
                                                        className="text-[10px] text-slate-400 hover:text-slate-700 disabled:opacity-20 leading-none"
                                                    >
                                                        ▼
                                                    </button>
                                                </div>
                                                <span className="text-sm font-bold text-slate-700 dark:text-dk-text-soft flex-1 truncate">{VIEW_LABELS[view]?.[lang] || view}</span>
                                                <button
                                                    onClick={() => {
                                                        const hidden = isHidden
                                                            ? navConfig.hidden.filter(v => v !== view)
                                                            : [...navConfig.hidden, view];
                                                        setNavConfig({ ...navConfig, hidden });
                                                    }}
                                                    className={`px-2.5 py-1 text-[10px] font-bold rounded-full border transition-all shrink-0 ${
                                                        isHidden
                                                            ? 'bg-slate-100 dark:bg-dk-elevated border-slate-200 dark:border-dk-border text-slate-400 dark:text-dk-muted'
                                                            : 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 text-emerald-600 dark:text-emerald-400'
                                                    }`}
                                                >
                                                    {isHidden ? tx(lang, { fr: 'Masqué', ar: 'مخفي', en: 'Hidden', es: 'Oculto', pt: 'Oculto', tr: 'Gizli' }) : tx(lang, { fr: 'Visible', ar: 'مرئي', en: 'Visible', es: 'Visible', pt: 'Visível', tr: 'Görünür' })}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* FULL WIDTH BLOCK: Gestion des Tâches (Phase 24) */}
            <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-sm dark:shadow-dk-sm border border-slate-200 dark:border-dk-border overflow-hidden flex flex-col mt-6">
                <div onClick={() => toggleSec('tasks')} className={`px-5 py-4 bg-slate-50 dark:bg-dk-bg flex items-center justify-between cursor-pointer select-none ${openSec['tasks'] ? 'border-b border-slate-100 dark:border-dk-border' : ''}`}>
                    <div className="flex items-center gap-2">
                        <ListTodo className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
                        <h2 className="font-bold text-slate-800 dark:text-dk-text">{tx(lang, { fr: 'Gestion des Tâches', ar: 'إدارة المهام', en: 'Task Management', es: 'Gestión de Tareas', pt: 'Gestão de Tarefas', tr: 'Görev Yönetimi' })}</h2>
                    </div>
                    <ChevronDown className={`w-5 h-5 text-slate-400 dark:text-dk-muted shrink-0 transition-transform ${openSec['tasks'] ? 'rotate-180' : ''}`} />
                </div>
                <div className={`p-6 md:p-8 space-y-6 ${openSec['tasks'] ? '' : 'hidden'}`}>
                    {/* Add New Task Form */}
                    <div className="bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl p-4 flex flex-col sm:flex-row gap-4 items-end">
                        <div className="flex-1 w-full relative">
                            <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-dk-muted mb-1">{tx(lang, { fr: 'Description de la tâche', ar: 'وصف المهمة', en: 'Task description', es: 'Descripción de la tarea', pt: 'Descrição da tarefa', tr: 'Görev açıklaması' })}</label>
                            <input
                                type="text"
                                value={newTaskText}
                                onChange={e => setNewTaskText(e.target.value)}
                                className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-indigo-500"
                                placeholder={tx(lang, { fr: 'Nouvelle tâche...', ar: 'مهمة جديدة...', en: 'New task...', es: 'Nueva tarea...', pt: 'Nova tarefa...', tr: 'Yeni görev...' })}
                            />
                        </div>
                        <div className="w-full sm:w-40 relative">
                            <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-dk-muted mb-1">{tx(lang, { fr: 'Date', ar: 'التاريخ', en: 'Date', es: 'Fecha', pt: 'Data', tr: 'Tarih' })}</label>
                            <input
                                type="date"
                                value={newTaskDate}
                                onChange={e => setNewTaskDate(e.target.value)}
                                className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-indigo-500 text-slate-600 dark:text-dk-text-soft"
                            />
                        </div>
                        <div className="w-full sm:w-64 relative">
                            <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-dk-muted mb-1">{tx(lang, { fr: 'Assigner à', ar: 'تعيين إلى', en: 'Assign to', es: 'Asignar a', pt: 'Atribuir a', tr: 'Ata' })}</label>
                            <select
                                value={newTaskAssignee}
                                onChange={e => setNewTaskAssignee(e.target.value)}
                                className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-indigo-500"
                            >
                                <option value="">{tx(lang, { fr: 'Choisir un responsable...', ar: 'اختر مسؤولاً...', en: 'Choose a person...', es: 'Elegir un responsable...', pt: 'Escolher um responsável...', tr: 'Bir sorumlu seçin...' })}</option>
                                <optgroup label={tx(lang, { fr: 'Direction', ar: 'الإدارة', en: 'Management', es: 'Dirección', pt: 'Direção', tr: 'Yönetim' })}>
                                    {draft.organigram?.map(p => (
                                        <option key={p.id} value={`${p.name}|${p.role}`}>{p.name} ({p.role})</option>
                                    ))}
                                </optgroup>
                                {Array.from({ length: draft.chainsCount || 4 }).map((_, i) => {
                                    const chainKey = `CHAINE ${i + 1}`;
                                    const staff = draft.chainStaff?.[chainKey] || [];
                                    if (staff.length === 0) return null;
                                    return (
                                        <optgroup key={chainKey} label={chainKey}>
                                            {staff.map(p => (
                                                <option key={p.id} value={`${p.name}|${p.role} - ${chainKey}`}>{p.name} ({p.role})</option>
                                            ))}
                                        </optgroup>
                                    );
                                })}
                            </select>
                        </div>
                        <button
                            onClick={handleAddTask}
                            disabled={!newTaskText || !newTaskAssignee || !newTaskDate}
                            className="w-full sm:w-auto px-6 py-2 bg-indigo-600 dark:bg-dk-accent text-white text-sm font-bold rounded-lg hover:bg-indigo-700 dark:hover:bg-dk-accent-hover transition-colors disabled:opacity-50 flex items-center justify-center gap-2 h-[38px] shrink-0"
                        >
                            <Plus className="w-4 h-4" /> {tx(lang, { fr: 'Ajouter', ar: 'إضافة', en: 'Add', es: 'Añadir', pt: 'Adicionar', tr: 'Ekle' })}
                        </button>
                    </div>

                    {/* Tasks List (Admin View) */}
                    <div className="space-y-3 mt-6">
                        <h3 className="text-sm font-bold text-slate-700 dark:text-dk-text-soft mb-4">{tx(lang, { fr: 'Toutes les tâches', ar: 'جميع المهام', en: 'All tasks', es: 'Todas las tareas', pt: 'Todas as tarefas', tr: 'Tüm görevler' })} ({draft.tasks?.length || 0})</h3>
                        {(!draft.tasks || draft.tasks.length === 0) && (
                            <p className="text-sm text-slate-500 dark:text-dk-muted italic bg-white dark:bg-dk-surface p-4 rounded-xl border border-dashed border-slate-200 dark:border-dk-border text-center">{tx(lang, { fr: 'Aucune tâche active.', ar: 'لا توجد أي مهمة نشطة.', en: 'No active task.', es: 'Ninguna tarea activa.', pt: 'Nenhuma tarefa ativa.', tr: 'Aktif görev yok.' })}</p>
                        )}
                        <div className="max-h-96 overflow-y-auto pr-2 custom-scrollbar space-y-2">
                            {draft.tasks?.slice().reverse().map(task => (
                                <div key={task.id} className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border p-3 rounded-xl gap-4 hover:border-indigo-200 transition-colors group">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-dk-muted bg-slate-100 dark:bg-dk-elevated px-2 py-0.5 rounded">{task.assigneeName} {task.assigneeRole ? `(${task.assigneeRole})` : ''}</span>
                                            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded flex items-center gap-1"><CalendarClock className="w-3 h-3" /> {task.date}</span>

                                            {/* Status Badge */}
                                            {task.status === 'PENDING' && <span className="text-[10px] font-bold text-slate-500 dark:text-dk-muted bg-slate-100 dark:bg-dk-elevated px-2 py-0.5 rounded border border-slate-200 dark:border-dk-border">PENDING</span>}
                                            {task.status === 'DONE_OK' && <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded border border-emerald-100">OK</span>}
                                            {task.status === 'DONE_NOT_OK' && <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 px-2 py-0.5 rounded border border-rose-100">NOT OK</span>}
                                            {task.status === 'SKIPPED' && <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded border border-amber-100">SKIPPED</span>}
                                        </div>
                                        <p className="text-sm font-bold text-slate-700 dark:text-dk-text-soft">{task.text}</p>
                                        {task.status === 'SKIPPED' && task.skipReason && (
                                            <p className="mt-1 flex items-start gap-1 text-xs text-amber-700 font-medium bg-amber-50 dark:bg-amber-900/30 p-2 rounded-lg inline-block w-full">
                                                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                                Motif d'annulation: {task.skipReason}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                        {task.status === 'PENDING' && (
                                            <>
                                                <button onClick={() => updateTaskStatus(task.id, 'DONE_OK')} className="p-1.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 rounded-lg border border-emerald-100 transition-colors" title={tx(lang, { fr: 'Marquer comme OK', ar: 'تحديد كمقبول', en: 'Mark as OK', es: 'Marcar como OK', pt: 'Marcar como OK', tr: 'OK olarak işaretle' })}><Check className="w-3.5 h-3.5" /></button>
                                                <button onClick={() => updateTaskStatus(task.id, 'DONE_NOT_OK')} className="p-1.5 bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 hover:bg-rose-100 rounded-lg border border-rose-100 transition-colors" title={tx(lang, { fr: 'Marquer comme NOT OK', ar: 'تحديد كغير مقبول', en: 'Mark as NOT OK', es: 'Marcar como NOT OK', pt: 'Marcar como NOT OK', tr: 'OK değil olarak işaretle' })}><X className="w-3.5 h-3.5" /></button>
                                                <button onClick={() => {
                                                    const reason = prompt(tx(lang, { fr: 'Motif d\'annulation ?', ar: 'سبب الإلغاء؟', en: 'Cancellation reason?', es: '¿Motivo de cancelación?', pt: 'Motivo de cancelamento?', tr: 'İptal sebebi?' }));
                                                    if (reason) updateTaskStatus(task.id, 'SKIPPED', reason);
                                                }} className="p-1.5 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 hover:bg-amber-100 rounded-lg border border-amber-100 transition-colors" title={tx(lang, { fr: 'Ignorer / Annuler', ar: 'تخطي / إلغاء', en: 'Skip / Cancel', es: 'Omitir / Cancelar', pt: 'Ignorar / Cancelar', tr: 'Atla / İptal' })}><SkipForward className="w-3.5 h-3.5" /></button>
                                            </>
                                        )}
                                        <button
                                            onClick={() => handleDeleteTask(task.id)}
                                            className="p-1.5 bg-slate-50 dark:bg-dk-bg text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg border border-slate-200 dark:border-dk-border hover:border-rose-200 transition-colors"
                                            title={tx(lang, { fr: 'Supprimer la tâche', ar: 'حذف المهمة', en: 'Delete task', es: 'Eliminar tarea', pt: 'Eliminar tarefa', tr: 'Görevi sil' })}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Licence / Abonnement — activation par clé (n'impacte pas le démarrage de l'app) */}
            <div className="mt-6">
                <LicenseActivation lang={lang === 'ar' ? 'ar' : 'fr'} />
            </div>

            <AgendaModal isOpen={showAgenda} onClose={() => setShowAgenda(false)} settings={draft} setSettings={setDraft} lang={lang} />
        </div >
    );
}