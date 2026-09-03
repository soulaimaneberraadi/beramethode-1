/**
 * Tableau de bord des ventes.
 *
 * Trois décisions, et rien d'autre :
 *   1. quel modèle relancer en production,
 *   2. quel modèle solder avant qu'il ne dorme au dépôt,
 *   3. qui doit de l'argent avant qu'on le resserve.
 *
 * Tout vient des mouvements réellement enregistrés (`/api/ventes/dashboard`) :
 * aucune moyenne n'est calculée ici, pour qu'un chiffre à l'écran soit
 * exactement celui de la base — c'est de l'argent, il ne se recalcule pas en
 * deux endroits.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    TrendingUp, PackageX, AlertTriangle, RefreshCw, Users, Wallet, Boxes, Search, Filter, Receipt, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { tx } from '../lib/i18n';
import { aujourdhui, jourLocal, ChampListe, ChampDate } from './ventes/champs';
import EncoursDetail from './ventes/EncoursDetail';
import PanneauDetail from './ventes/PanneauDetail';
import { teinteDe } from './ventes/articles';

/** Sans serveur (deploiement statique), il n'y a ni sorties de stock ni
 *  clients a agreger : le tableau de bord le DIT, au lieu d'afficher une
 *  erreur reseau qui laisse croire a une panne. */
const IS_STATIC = import.meta.env.VITE_STATIC_MODE === 'true';

/** Cle du panneau de detail ouvert par une tuile (ou aucun). */
export type VentesDetailKey = null | 'encours' | 'ca' | 'pieces' | 'tickets' | 'panier';

interface Props {
    lang: string;
    currency?: string;
    /** Pilotage externe du detail ouvert (routage) — optionnel. Sans ces deux
     *  props, le composant garde son etat local (cas Facturation.tsx). */
    detail?: VentesDetailKey;
    onDetailChange?: (detail: VentesDetailKey) => void;
    /** Le parent (SousTraitance) seul sait ouvrir la fiche client complete. */
    onOuvrirFicheClient?: (c: { clientId: string | null; nom: string }) => void;
}

type Modele = {
    modelId: string; nom: string; reference: string | null; image: string | null;
    canaux: Array<{ canal: string; pieces: number; ca: number }>;
    canalFort: string | null; partCanalFort: number | null;
    produit: number; vendu: number; stock: number;
    piecesPeriode: number; caPeriode: number; ticketsPeriode: number;
    ageJours: number | null; ecoule: number; parJour: number;
    joursAvantRupture: number | null;
    statut: 'TOP' | 'OK' | 'LENT' | 'MORT' | 'NEUF';
};

type ClientLigne = {
    id: string; nom: string; type: string | null; tel: string | null; ville: string | null;
    pieces: number; ca: number; tickets: number; derniere: string | null;
    encours: number; facturesEnRetard: number;
    statut: 'RETARD' | 'ENCOURS' | 'ACTIF' | 'DORMANT';
};

type Donnees = {
    jours: number; depuis: string;
    serie: Array<{ jour: string; ca: number; pieces: number; tickets: number }>;
    /** La meme serie, decomposee : une ligne par canal / par segment. */
    serieCanal: Array<{ jour: string; cle: string; ca: number; pieces: number; tickets: number }>;
    serieSegment: Array<{ jour: string; cle: string; ca: number; pieces: number; tickets: number }>;
    precedent: { du: string; au: string; ca: number; pieces: number; tickets: number };
    parJourSemaine: Array<{ jour: number; ca: number; pieces: number }>;
    concentration: { partTop3: number; clientsActifs: number };
    tailles: Array<{ taille: string; pieces: number; ca: number }>;
    couleurs: Array<{ couleur: string; pieces: number; ca: number }>;
    qualite: {
        tauxDefaut: number;
        parEtat: Array<{ qualite: string; pieces: number }>;
        parModele: Array<{ modelId: string; nom: string; ok: number; defauts: number; taux: number }>;
    };
    kpis: { ca: number; pieces: number; tickets: number; panierMoyen: number; encoursTotal: number };
    parCanal: Array<{ canal: string; pieces: number; ca: number; tickets: number }>;
    parSegment: Array<{ segment: string; pieces: number; ca: number; tickets: number }>;
    /** Ce que la moyenne cache : mediane, tranches et extremes. */
    paniers: {
        mediane: number;
        tranches: Array<{ libelle: string; tickets: number; ca: number; pieces: number }>;
        plusGros: { jour: string | null; client: string | null; pieces: number; montant: number } | null;
        plusPetit: { jour: string | null; client: string | null; pieces: number; montant: number } | null;
        piecesParTicket: number;
    };
    parPaiement: Array<{ mode: string; ca: number; tickets: number }>;
    modeles: Modele[];
    clients: ClientLigne[];
};

const nf = (n: number) => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 });

/** Les couleurs des courbes : lisibles cote a cote, et distinctes meme pour
 *  un oeil qui confond le rouge et le vert (bleu / ambre / violet en tete). */
const PALETTE_SERIES = ['#1e293b', '#2563eb', '#f59e0b', '#7c3aed', '#0d9488', '#e11d48', '#65a30d'];

const TEINTE_STATUT: Record<Modele['statut'], string> = {
    TOP: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800/50',
    OK: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-dk-elevated dark:text-dk-muted dark:border-dk-border',
    LENT: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800/50',
    MORT: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800/50',
    NEUF: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-800/50',
};

const TEINTE_CLIENT: Record<ClientLigne['statut'], string> = {
    RETARD: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800/50',
    ENCOURS: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800/50',
    ACTIF: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800/50',
    DORMANT: 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-dk-elevated dark:text-dk-muted dark:border-dk-border',
};

export default function VentesDashboard({ lang, currency = 'MAD', detail: detailControlled, onDetailChange, onOuvrirFicheClient }: Props) {
    const [jours, setJours] = useState(30);
    /* Filtres : la même question posée à toute la page. Un total en haut qui
     * ne répondrait pas au même filtre que le détail en dessous serait un
     * chiffre faux, pas une nuance. */
    const [du, setDu] = useState('');
    const [au, setAu] = useState('');
    const [canal, setCanal] = useState('');
    const [segment, setSegment] = useState('');
    const [clientId, setClientId] = useState('');
    /** Liste des clients pour le filtre : figée au premier chargement sans
     *  filtre client, sinon choisir un client viderait la liste où on l'a pris. */
    const [annuaire, setAnnuaire] = useState<ClientLigne[]>([]);
    const [data, setData] = useState<Donnees | null>(null);
    const [chargement, setChargement] = useState(false);
    const [erreur, setErreur] = useState<string | null>(null);
    const [recherche, setRecherche] = useState('');
    const [filtreModele, setFiltreModele] = useState<'TOUS' | Modele['statut']>('TOUS');
    const [filtresOuverts, setFiltresOuverts] = useState(false);
    /** L'axe de decomposition de la courbe : une ligne par canal (boutique,
     *  vente en ligne, atelier) ou par segment (detail, gros). Une courbe
     *  unique dit que ca monte ; trois disent LAQUELLE monte. */
    const [axeCourbe, setAxeCourbe] = useState<'canal' | 'segment'>('canal');
    const [sansSerie, setSansSerie] = useState<string[]>([]);
    const [cumule, setCumule] = useState(false);
    // Une tuile ne dit qu un total : le detail s ouvre par-dessus la page.
    // Pilote par l URL quand le parent le controle (voir Props), sinon local.
    const [detailLocal, setDetailLocal] = useState<VentesDetailKey>(null);
    const detail = detailControlled !== undefined ? detailControlled : detailLocal;
    const setDetail = onDetailChange || setDetailLocal;

    const charger = useCallback(async (n: number) => {
        if (IS_STATIC) { setData(null); setErreur(null); return; }
        setChargement(true);
        setErreur(null);
        try {
            const p = new URLSearchParams({ jours: String(n) });
            if (du) p.set('du', du);
            if (au) p.set('au', au);
            if (canal) p.set('canal', canal);
            if (segment) p.set('segment', segment);
            if (clientId) p.set('clientId', clientId);
            const res = await fetch(`/api/ventes/dashboard?${p.toString()}`, { credentials: 'include' });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
            if (!body || !Array.isArray(body.modeles) || !Array.isArray(body.clients)) {
                throw new Error('Reponse inattendue du serveur.');
            }
            setData({
                ...body,
                serie: Array.isArray(body.serie) ? body.serie : [],
                // Un serveur d'avant cette version ne decompose pas la courbe :
                // l'ecran retombe alors sur la ligne unique, sans tomber.
                serieCanal: Array.isArray(body.serieCanal) ? body.serieCanal : [],
                serieSegment: Array.isArray(body.serieSegment) ? body.serieSegment : [],
                precedent: body.precedent || { du: '', au: '', ca: 0, pieces: 0, tickets: 0 },
                parJourSemaine: Array.isArray(body.parJourSemaine) ? body.parJourSemaine : [],
                concentration: body.concentration || { partTop3: 0, clientsActifs: 0 },
                kpis: body.kpis || { ca: 0, pieces: 0, tickets: 0, panierMoyen: 0, encoursTotal: 0 },
                parCanal: Array.isArray(body.parCanal) ? body.parCanal : [],
                parSegment: Array.isArray(body.parSegment) ? body.parSegment : [],
            // Un serveur d'avant cette version ne renvoie pas `paniers` :
            // l'ecran doit s'afficher vide plutot que tomber.
            paniers: body.paniers || { mediane: 0, tranches: [], plusGros: null, plusPetit: null, piecesParTicket: 0 },
                parPaiement: Array.isArray(body.parPaiement) ? body.parPaiement : [],
            } as Donnees);
        } catch (e: any) {
            setData(null);
            setErreur(e?.message || String(e));
        } finally {
            setChargement(false);
        }
    }, [du, au, canal, segment, clientId]);

    useEffect(() => { void charger(jours); }, [jours, charger]);

    // Retour depuis l annuaire : on rouvre le panneau d ou l on etait parti,
    // sinon le voyage aller n a pas de retour.
    useEffect(() => {
        const revenir = () => setDetail('encours');
        window.addEventListener('bera:retour-encours', revenir);
        return () => window.removeEventListener('bera:retour-encours', revenir);
    }, []);
    useEffect(() => {
        if (data && !clientId && annuaire.length === 0 && data.clients.length > 0) setAnnuaire(data.clients);
    }, [data, clientId, annuaire.length]);

    const T = {
        titre: tx(lang, { fr: 'Ventes', ar: 'المبيعات', en: 'Sales', es: 'Ventas', pt: 'Vendas', tr: 'Satislar' }),
        ca: tx(lang, { fr: "Chiffre d'affaires", ar: 'رقم المعاملات', en: 'Revenue', es: 'Facturacion', pt: 'Faturacao', tr: 'Ciro' }),
        pieces: tx(lang, { fr: 'Pieces vendues', ar: 'القطع المبيوعة', en: 'Items sold', es: 'Piezas vendidas', pt: 'Pecas vendidas', tr: 'Satilan parca' }),
        tickets: tx(lang, { fr: 'Ventes', ar: 'البيعات', en: 'Sales', es: 'Ventas', pt: 'Vendas', tr: 'Satis' }),
        panier: tx(lang, { fr: 'Panier moyen', ar: 'معدّل السلّة', en: 'Average sale', es: 'Ticket medio', pt: 'Venda media', tr: 'Ortalama sepet' }),
        encours: tx(lang, { fr: 'Encours client', ar: 'ما بقا فذمّة الزبناء', en: 'Outstanding', es: 'Pendiente', pt: 'Em divida', tr: 'Acik hesap' }),
        parCanal: tx(lang, { fr: 'Par canal', ar: 'حسب القناة', en: 'By channel', es: 'Por canal', pt: 'Por canal', tr: 'Kanala gore' }),
        parSegment: tx(lang, { fr: 'Par segment', ar: 'حسب الصنف', en: 'By segment', es: 'Por segmento', pt: 'Por segmento', tr: 'Segmente gore' }),
        parPaiement: tx(lang, { fr: 'Par reglement', ar: 'حسب الأداء', en: 'By payment', es: 'Por pago', pt: 'Por pagamento', tr: 'Odemeye gore' }),
        modeles: tx(lang, { fr: 'Modeles', ar: 'الموديلات', en: 'Models', es: 'Modelos', pt: 'Modelos', tr: 'Modeller' }),
        clients: tx(lang, { fr: 'Clients', ar: 'الزبناء', en: 'Customers', es: 'Clientes', pt: 'Clientes', tr: 'Musteriler' }),
        chercher: tx(lang, { fr: 'Chercher…', ar: 'قلّب…', en: 'Search…', es: 'Buscar…', pt: 'Procurar…', tr: 'Ara…' }),
        aRelancer: tx(lang, { fr: 'A relancer', ar: 'خاصو يعاود يتصنع', en: 'Reorder', es: 'Reponer', pt: 'Repor', tr: 'Yeniden uret' }),
        dort: tx(lang, { fr: 'Dort au depot', ar: 'نعسان فالمخزن', en: 'Sitting in stock', es: 'Parado en stock', pt: 'Parado em stock', tr: 'Stokta bekliyor' }),
        rien: tx(lang, { fr: 'Aucun mouvement sur la periode.', ar: 'ما كاين حتى حركة فهاد المدّة.', en: 'No movement in this period.', es: 'Sin movimientos en el periodo.', pt: 'Sem movimentos no periodo.', tr: 'Bu donemde hareket yok.' }),
        ecoule: tx(lang, { fr: 'Ecoule', ar: 'اللي تباع', en: 'Sold through', es: 'Vendido', pt: 'Vendido', tr: 'Satilan' }),
        stock: tx(lang, { fr: 'Stock', ar: 'الستوك', en: 'Stock', es: 'Stock', pt: 'Stock', tr: 'Stok' }),
        rupture: tx(lang, { fr: 'Rupture dans', ar: 'غادي يسالي فـ', en: 'Runs out in', es: 'Se agota en', pt: 'Acaba em', tr: 'Bitis' }),
        jours: tx(lang, { fr: 'jours', ar: 'يوم', en: 'days', es: 'dias', pt: 'dias', tr: 'gun' }),
        statique: tx(lang, {
            fr: "Cette version en ligne n'a pas de serveur : les ventes, le stock et les clients vivent dans l'installation locale. Ouvrez le tableau de bord depuis le poste ou tourne BERAMETHODE.",
            ar: 'هاد النسخة اللي أونلاين ما عندهاش سيرفر: البيعات والستوك والزبناء كاينين فالتنصيب المحلي. حلّ الداشبورد من الجهاز اللي خدّام فيه BERAMETHODE.',
            en: 'This online build has no server: sales, stock and customers live in the local installation. Open the dashboard from the machine running BERAMETHODE.',
            es: 'Esta version en linea no tiene servidor: las ventas y el stock estan en la instalacion local.',
            pt: 'Esta versao online nao tem servidor: as vendas e o stock estao na instalacao local.',
            tr: 'Bu cevrimici surumde sunucu yok: satislar ve stok yerel kurulumda.',
        }),
        du: tx(lang, { fr: 'Du', ar: 'من', en: 'From', es: 'Desde', pt: 'De', tr: 'Baslangic' }),
        au: tx(lang, { fr: 'Au', ar: 'إلى', en: 'To', es: 'Hasta', pt: 'Ate', tr: 'Bitis' }),
        tousCanaux: tx(lang, { fr: 'Tous canaux', ar: 'كل القنوات', en: 'All channels', es: 'Todos los canales', pt: 'Todos os canais', tr: 'Tum kanallar' }),
        tousSegments: tx(lang, { fr: 'Tous segments', ar: 'كل الأصناف', en: 'All segments', es: 'Todos los segmentos', pt: 'Todos os segmentos', tr: 'Tum segmentler' }),
        tousClients: tx(lang, { fr: 'Tous clients', ar: 'كل الزبناء', en: 'All customers', es: 'Todos los clientes', pt: 'Todos os clientes', tr: 'Tum musteriler' }),
        effacer: tx(lang, { fr: 'Effacer', ar: 'مسح', en: 'Clear', es: 'Borrar', pt: 'Limpar', tr: 'Temizle' }),
        tailles: tx(lang, { fr: 'Tailles demandees', ar: 'المقاسات المطلوبة', en: 'Sizes in demand', es: 'Tallas demandadas', pt: 'Tamanhos pedidos', tr: 'Talep edilen bedenler' }),
        couleurs: tx(lang, { fr: 'Couleurs demandees', ar: 'الألوان المطلوبة', en: 'Colours in demand', es: 'Colores demandados', pt: 'Cores pedidas', tr: 'Talep edilen renkler' }),
        qualite: tx(lang, { fr: 'Qualite atelier', ar: 'جودة الورشة', en: 'Workshop quality', es: 'Calidad del taller', pt: 'Qualidade da oficina', tr: 'Atolye kalitesi' }),
        tauxDefaut: tx(lang, { fr: 'Taux de defaut', ar: 'نسبة العيوب', en: 'Defect rate', es: 'Tasa de defectos', pt: 'Taxa de defeitos', tr: 'Hata orani' }),
        canalFort: tx(lang, { fr: 'Part du canal principal', ar: 'حصّة القناة الأولى', en: 'Main channel share', es: 'Cuota del canal principal', pt: 'Quota do canal principal', tr: 'Ana kanal payi' }),
        tendance: tx(lang, { fr: 'Tendance', ar: 'المنحنى', en: 'Trend', es: 'Tendencia', pt: 'Tendencia', tr: 'Egilim' }),
        joursAvecVente: tx(lang, { fr: 'jours avec vente', ar: 'أيام فيها بيع', en: 'days with sales', es: 'dias con venta', pt: 'dias com venda', tr: 'satisli gun' }),
        meilleurJour: tx(lang, { fr: 'Meilleur jour', ar: 'أحسن نهار', en: 'Best day', es: 'Mejor dia', pt: 'Melhor dia', tr: 'En iyi gun' }),
        rythme: tx(lang, { fr: 'Rythme de la semaine', ar: 'إيقاع الأسبوع', en: 'Weekly rhythm', es: 'Ritmo semanal', pt: 'Ritmo da semana', tr: 'Haftalik ritim' }),
        joursSemaine: (lang === 'ar' ? ['إث', 'ثل', 'أر', 'خم', 'جم', 'سب', 'أح'] : ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di']),
        concentration: tx(lang, { fr: 'Top 3 =', ar: 'أوّل 3 =', en: 'Top 3 =', es: 'Top 3 =', pt: 'Top 3 =', tr: 'Ilk 3 =' }),
        actifs: tx(lang, { fr: 'actifs', ar: 'نشيطين', en: 'active', es: 'activos', pt: 'ativos', tr: 'aktif' }),
        filtres: tx(lang, { fr: 'Filtres', ar: 'فلاتر', en: 'Filters', es: 'Filtros', pt: 'Filtros', tr: 'Filtreler' }),
        actualiser: tx(lang, { fr: 'Actualiser', ar: 'تحديث', en: 'Refresh', es: 'Actualizar', pt: 'Atualizar', tr: 'Yenile' }),
        mediane: tx(lang, { fr: 'Panier median', ar: 'وسيط السلّة', en: 'Median sale', es: 'Ticket mediano', pt: 'Venda mediana', tr: 'Ortanca sepet' }),
        piecesParVente: tx(lang, { fr: 'Pieces par vente', ar: 'قطع في البيعة', en: 'Items per sale', es: 'Piezas por venta', pt: 'Pecas por venda', tr: 'Satis basina parca' }),
        parTranche: tx(lang, { fr: 'Par tranche de montant', ar: 'حسب شريحة المبلغ', en: 'By amount bracket', es: 'Por tramo de importe', pt: 'Por faixa de valor', tr: 'Tutar dilimine gore' }),
        extremes: tx(lang, { fr: 'La plus grosse et la plus petite vente', ar: 'أكبر وأصغر بيعة', en: 'Largest and smallest sale', es: 'Venta mayor y menor', pt: 'Maior e menor venda', tr: 'En buyuk ve en kucuk satis' }),
        plusGros: tx(lang, { fr: 'Plus grosse vente', ar: 'أكبر بيعة', en: 'Largest sale', es: 'Venta mayor', pt: 'Maior venda', tr: 'En buyuk satis' }),
        plusPetit: tx(lang, { fr: 'Plus petite vente', ar: 'أصغر بيعة', en: 'Smallest sale', es: 'Venta menor', pt: 'Menor venda', tr: 'En kucuk satis' }),
        versusPrecedent: tx(lang, { fr: 'vs periode precedente', ar: 'مقابل المدّة السابقة', en: 'vs previous period', es: 'vs periodo anterior', pt: 'vs periodo anterior', tr: 'onceki doneme gore' }),
        horsNorme: tx(lang, { fr: 'Jour hors norme : ce panier ne ressemble pas aux autres.', ar: 'يوم شاذّ: هاد المعدّل ماشي بحال باقي الأيام.', en: 'Outlier day: this basket is unlike the others.', es: 'Dia atipico: este ticket no se parece a los demas.', pt: 'Dia atipico: este cesto nao se parece com os outros.', tr: 'Aykiri gun: bu sepet digerlerine benzemiyor.' }),
        moyenneTrompe: tx(lang, { fr: 'Ce que la moyenne cache', ar: 'ما يخفيه المعدّل', en: 'What the average hides', es: 'Lo que oculta la media', pt: 'O que a media esconde', tr: 'Ortalamanin gizledigi' }),
        majoriteNonRenseigne: tx(lang, {
            fr: 'La plupart des ventes n\u2019ont pas cette information : la repartition ci-dessus ne represente qu\u2019une minorite.',
            ar: '\u0623\u063a\u0644\u0628 \u0627\u0644\u0628\u064a\u0639\u0627\u062a \u0628\u0644\u0627 \u0647\u0627\u062f \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0629: \u0627\u0644\u062a\u0648\u0632\u064a\u0639 \u0641\u0648\u0642 \u0643\u064a\u0645\u062b\u0644 \u063a\u064a\u0631 \u0623\u0642\u0644\u064a\u0629.',
            en: 'Most sales lack this information: the split above covers a minority only.',
            es: 'La mayoria de las ventas no tienen este dato: el reparto anterior solo cubre una minoria.',
            pt: 'A maioria das vendas nao tem esta informacao: a reparticao acima cobre apenas uma minoria.',
            tr: 'Satislarin cogunda bu bilgi yok: yukaridaki dagilim yalnizca bir azinligi kapsar.',
        }),
        taillesChiffrees: tx(lang, { fr: 'Tailles chiffrees (36, 38, 40\u2026)', ar: '\u0645\u0642\u0627\u0633\u0627\u062a \u0628\u0627\u0644\u0623\u0631\u0642\u0627\u0645 (36\u060c 38\u060c 40\u2026)', en: 'Numeric sizes (36, 38, 40\u2026)', es: 'Tallas numericas (36, 38, 40\u2026)', pt: 'Tamanhos numericos (36, 38, 40\u2026)', tr: 'Sayisal bedenler (36, 38, 40\u2026)' }),
        taillesLettres: tx(lang, { fr: 'Tailles en lettres (S, M, L\u2026)', ar: '\u0645\u0642\u0627\u0633\u0627\u062a \u0628\u0627\u0644\u062d\u0631\u0648\u0641 (S\u060c M\u060c L\u2026)', en: 'Letter sizes (S, M, L\u2026)', es: 'Tallas en letras (S, M, L\u2026)', pt: 'Tamanhos em letras (S, M, L\u2026)', tr: 'Harf bedenleri (S, M, L\u2026)' }),
        sansPrix: tx(lang, {
            fr: 'Des pieces sont sorties sans prix de vente : le chiffre de cette ligne est incomplet.',
            ar: 'كاين قطع خرجات بلا ثمن بيع: رقم هاد السطر ناقص.',
            en: 'Some items left stock without a sale price: this line total is incomplete.',
            es: 'Hay piezas que salieron sin precio de venta: el total de esta linea esta incompleto.',
            pt: 'Ha pecas que sairam sem preco de venda: o total desta linha esta incompleto.',
            tr: 'Bazi parcalar satis fiyati olmadan cikti: bu satirin toplami eksik.',
        }),
        sansPrixCourt: tx(lang, { fr: 'sans prix', ar: 'بلا ثمن', en: 'no price', es: 'sin precio', pt: 'sem preco', tr: 'fiyatsiz' }),
        nonRenseigne: tx(lang, { fr: 'Non renseigne', ar: 'غير محدّد', en: 'Not recorded', es: 'Sin indicar', pt: 'Nao indicado', tr: 'Belirtilmemis' }),
        piecesCourt: tx(lang, { fr: 'pcs', ar: 'قطعة', en: 'pcs', es: 'uds', pt: 'pcs', tr: 'adet' }),
        ventesCourt: tx(lang, { fr: 'ventes', ar: 'بيعة', en: 'sales', es: 'ventas', pt: 'vendas', tr: 'satis' }),
        parJourCourt: tx(lang, { fr: '/jour', ar: '/يوم', en: '/day', es: '/dia', pt: '/dia', tr: '/gun' }),
        aucunDefaut: tx(lang, { fr: 'Aucun defaut releve.', ar: 'ما تسجّل حتى عيب.', en: 'No defect recorded.', es: 'Ningun defecto.', pt: 'Nenhum defeito.', tr: 'Hata kaydi yok.' }),
        doit: tx(lang, { fr: 'doit', ar: 'عليه', en: 'owes', es: 'debe', pt: 'deve', tr: 'borclu' }),
        moisNoms: (lang === "ar"
            ? ["يناير","فبراير","مارس","أبريل","ماي","يونيو","يوليوز","غشت","شتنبر","أكتوبر","نونبر","دجنبر"]
            : ["Janvier","Fevrier","Mars","Avril","Mai","Juin","Juillet","Aout","Septembre","Octobre","Novembre","Decembre"]),
        jourParJour: tx(lang, { fr: 'Jour par jour', ar: 'يوماً بيوم', en: 'Day by day', es: 'Dia a dia', pt: 'Dia a dia', tr: 'Gun gun' }),
        jourColonne: tx(lang, { fr: 'Jour', ar: 'اليوم', en: 'Day', es: 'Dia', pt: 'Dia', tr: 'Gun' }),
        parVente: tx(lang, { fr: '/vente', ar: '/بيعة', en: '/sale', es: '/venta', pt: '/venda', tr: '/satis' }),
        periodePrecedente: tx(lang, { fr: 'Periode precedente', ar: 'المدّة السابقة', en: 'Previous period', es: 'Periodo anterior', pt: 'Periodo anterior', tr: 'Onceki donem' }),
        aujourdhuiCourt: tx(lang, { fr: "Auj.", ar: "اليوم", en: "Today", es: "Hoy", pt: "Hoje", tr: "Bugun" }),
        aujourdhui: tx(lang, { fr: "Aujourd hui", ar: "اليوم", en: "Today", es: "Hoy", pt: "Hoje", tr: "Bugun" }),
        choisir: tx(lang, { fr: 'jj/mm/aaaa', ar: 'يوم/شهر/عام', en: 'dd/mm/yyyy', es: 'dd/mm/aaaa', pt: 'dd/mm/aaaa', tr: 'gg/aa/yyyy' }),
        parMois: tx(lang, { fr: 'Mois', ar: 'شهر', en: 'Month', es: 'Mes', pt: 'Mes', tr: 'Ay' }),
        parAnnee: tx(lang, { fr: 'Annee', ar: 'عام', en: 'Year', es: 'Ano', pt: 'Ano', tr: 'Yil' }),
        precedent: tx(lang, { fr: 'Precedent', ar: 'السابق', en: 'Previous', es: 'Anterior', pt: 'Anterior', tr: 'Onceki' }),
        suivant: tx(lang, { fr: 'Suivant', ar: 'التالي', en: 'Next', es: 'Siguiente', pt: 'Seguinte', tr: 'Sonraki' }),
        total: tx(lang, { fr: 'Total', ar: 'المجموع', en: 'Total', es: 'Total', pt: 'Total', tr: 'Toplam' }),
        comparer: tx(lang, { fr: 'Comparer', ar: 'قارن', en: 'Compare', es: 'Comparar', pt: 'Comparar', tr: 'Karsilastir' }),
        cumule: tx(lang, { fr: 'Cumul', ar: 'التراكم', en: 'Cumulative', es: 'Acumulado', pt: 'Acumulado', tr: 'Kumulatif' }),
        retard: tx(lang, { fr: 'facture(s) en retard', ar: 'فاتورة متأخّرة', en: 'overdue invoice(s)', es: 'factura(s) vencida(s)', pt: 'fatura(s) vencida(s)', tr: 'gecikmis fatura' }),
    };

    const agendaLabels = { mois: T.moisNoms, jours: T.joursSemaine, aujourdhui: T.aujourdhui, effacer: T.effacer };

    // La courbe doit couvrir toute la periode, pas seulement les jours
    // ou il y a eu une vente : 4 barres sur 30 jours ne sont pas une
    // tendance, ce sont 4 blocs. On remplit les trous a zero.
    const serieComplete = useMemo(() => {
        type Pt = { jour: string; ca: number; pieces: number; tickets: number; vide: boolean };
        if (!data) return [] as Pt[];
        // Le fuseau, pas Greenwich : avec `toISOString()` le dernier jour
        // manquait et la vente du jour n'apparaissait ni dans la courbe ni
        // dans le jour par jour.
        const iso = (d: Date) => jourLocal(d);
        const debut = du || data.depuis || data.serie[0]?.jour;
        const fin = au || iso(new Date());
        if (!debut) return [] as Pt[];
        const parJour = new Map(data.serie.map(x => [x.jour, x]));
        const out: Pt[] = [];
        const curseur = new Date(debut + 'T00:00:00');
        const stop = new Date(fin + 'T00:00:00');
        let garde = 0;
        while (curseur <= stop && garde++ < 400) {
            const k = iso(curseur);
            const v = parJour.get(k);
            out.push({ jour: k, ca: v?.ca || 0, pieces: v?.pieces || 0, tickets: v?.tickets || 0, vide: !v });
            curseur.setDate(curseur.getDate() + 1);
        }
        return out.length ? out : data.serie.map(x => ({ ...x, vide: false }));
    }, [data, du, au]);

    /** Une ligne par valeur de l'axe, alignee sur les MEMES jours que la
     *  courbe : deux lignes qui ne partagent pas leur axe des x ne se
     *  comparent pas, elles se superposent par hasard. */
    const seriesAxe = useMemo(() => {
        if (!data || serieComplete.length === 0) return [] as Array<{ cle: string; couleur: string; total: number; points: number[] }>;
        const src = (axeCourbe === 'canal' ? data.serieCanal : data.serieSegment) || [];
        const parCle = new Map<string, Map<string, number>>();
        for (const r of src) {
            if (!parCle.has(r.cle)) parCle.set(r.cle, new Map());
            const m = parCle.get(r.cle)!;
            m.set(r.jour, (m.get(r.jour) || 0) + (Number(r.ca) || 0));
        }
        return [...parCle.entries()]
            .map(([cle, m]) => ({
                cle,
                total: [...m.values()].reduce((a, b) => a + b, 0),
                points: serieComplete.map(j => m.get(j.jour) || 0),
            }))
            .sort((a, b) => b.total - a.total)
            .map((x, i) => ({ ...x, couleur: PALETTE_SERIES[i % PALETTE_SERIES.length] }));
    }, [data, axeCourbe, serieComplete]);

    const seriesVisibles = useMemo(
        () => seriesAxe.filter(x => !sansSerie.includes(x.cle)),
        [seriesAxe, sansSerie],
    );

    const modelesFiltres = useMemo(() => {
        if (!data) return [];
        const q = recherche.trim().toLowerCase();
        return (data.modeles || []).filter(m => {
            if (filtreModele !== 'TOUS' && m.statut !== filtreModele) return false;
            if (!q) return true;
            return `${m.nom} ${m.reference || ''}`.toLowerCase().includes(q);
        });
    }, [data, recherche, filtreModele]);

    const clientsFiltres = useMemo(() => {
        if (!data) return [];
        const q = recherche.trim().toLowerCase();
        if (!q) return (data.clients || []).slice(0, 25);
        return (data.clients || []).filter(c => `${c.nom} ${c.tel || ''} ${c.ville || ''}`.toLowerCase().includes(q)).slice(0, 25);
    }, [data, recherche]);

    /* ── Vocabulaire visuel ───────────────────────────────────────────────
     * Une seule carte, un seul en-tete, une seule facon d'aligner un chiffre.
     * Un tableau de bord ou chaque bloc a son style se lit comme trois
     * documents differents poses l'un sur l'autre.
     */
    const Carte: React.FC<{ titre: string; droite?: React.ReactNode; children: React.ReactNode; className?: string }> =
        ({ titre, droite, children, className = '' }) => (
            <section className={`border border-slate-200 dark:border-dk-border rounded-xl bg-white dark:bg-dk-surface overflow-hidden ${className}`}>
                <header className="h-9 px-3.5 flex items-center justify-between gap-2 border-b border-slate-100 dark:border-dk-border">
                    <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400 dark:text-dk-muted truncate">{titre}</span>
                    {droite}
                </header>
                {children}
            </section>
        );

    /** La courbe multi-lignes.
     *
     *  Le viewBox est en pourcentage d'aire (100x100) et les traits gardent
     *  leur epaisseur reelle (`vector-effect`) : la meme courbe reste lisible
     *  sur un telephone de 360 px et sur un ecran de bureau, sans recalcul.
     *  Un seul jour n'a pas de segment a tracer : on pose un point, sinon la
     *  ligne serait invisible et l'ecran paraitrait vide alors qu'il y a bien
     *  une vente. */
    const Courbes: React.FC<{
        jours: string[];
        series: Array<{ cle: string; couleur: string; points: number[] }>;
        cumul: boolean;
    }> = ({ jours, series, cumul }) => {
        const cumuler = (p: number[]) => { let a = 0; return p.map(v => (a += v)); };
        const traces = series.map(s => ({ ...s, valeurs: cumul ? cumuler(s.points) : s.points }));
        const max = Math.max(1, ...traces.flatMap(t => t.valeurs));
        const n = jours.length;
        const x = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
        const y = (v: number) => 100 - (v / max) * 92 - 4;
        return (
            <div className="relative">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-28 sm:h-40 overflow-visible">
                    {[0, 25, 50, 75, 100].map(g => (
                        <line key={g} x1="0" x2="100" y1={y((max * g) / 100)} y2={y((max * g) / 100)}
                            className="stroke-slate-100 dark:stroke-dk-border" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                    ))}
                    {traces.map(t => (
                        <g key={t.cle}>
                            <polyline
                                points={t.valeurs.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
                                fill="none" stroke={t.couleur} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
                                vectorEffect="non-scaling-stroke"
                            />
                            {/* Les jours a vente sont marques : sur 90 jours, une
                                journee isolee se perd sinon dans la ligne plate. */}
                            {t.valeurs.map((v, i) => (v > 0 ? (
                                <circle key={i} cx={x(i)} cy={y(v)} r="2.5" fill={t.couleur} vectorEffect="non-scaling-stroke">
                                    <title>{`${jours[i]} · ${libelle(t.cle)} · ${nf(v)} ${currency}`}</title>
                                </circle>
                            ) : null))}
                        </g>
                    ))}
                </svg>
                {/* L'echelle : une courbe sans son maximum ne dit pas si le pic
                    vaut 800 ou 80 000. */}
                <span className="absolute top-0 left-0 text-[9px] font-bold tabular-nums text-slate-300 dark:text-dk-muted pointer-events-none">
                    {nf(max)} {currency}
                </span>
            </div>
        );
    };

    /** « NON_PRECISE » vient des ventes anterieures au suivi du canal : on le
     *  nomme au lieu de laisser un mot de base de donnees a l'ecran. */
    const libelle = (v: string) => (v === 'NON_PRECISE' || v === '—' ? T.nonRenseigne : v);

    /** Une variation par rapport à la même durée, juste avant. Sans elle,
     *  « 145 000 » ne dit pas si l'atelier monte ou retombe. Une période
     *  précédente vide ne produit AUCUN pourcentage : « +∞ % » n'informe
     *  personne, et un premier mois n'est pas une progression. */
    const Delta = ({ actuel, avant }: { actuel: number; avant: number }) => {
        if (!avant) return null;
        const pct = ((actuel - avant) / avant) * 100;
        const monte = pct >= 0;
        return (
            <span
                title={`${T.periodePrecedente} : ${nf(avant)}`}
                className={`inline-flex items-center gap-0.5 whitespace-nowrap text-[10px] font-black tabular-nums ${monte ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}
            >
                {monte ? <ArrowUpRight className="w-3 h-3 shrink-0" /> : <ArrowDownRight className="w-3 h-3 shrink-0" />}
                {/* Deux decimales sur un ecart de 97 % ne changent aucune
                    decision : elles cassent la ligne en deux, c'est tout. */}
                {Math.abs(pct) >= 10 ? Math.round(Math.abs(pct)) : nf(Math.abs(pct))}&nbsp;%
            </span>
        );
    };

    const Tuile = ({ titre, valeur, icone, alerte = false, delta, onOuvrir }: { titre: string; valeur: string; icone: React.ReactNode; alerte?: boolean; delta?: React.ReactNode; onOuvrir?: () => void }) => (
        <div
            onClick={onOuvrir}
            role={onOuvrir ? 'button' : undefined}
            tabIndex={onOuvrir ? 0 : undefined}
            onKeyDown={onOuvrir ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOuvrir(); } } : undefined}
            className={`border border-slate-200 dark:border-dk-border rounded-xl bg-white dark:bg-dk-surface px-3.5 py-3 ${onOuvrir ? 'cursor-pointer transition-colors hover:border-slate-400 dark:hover:border-dk-muted' : ''}`}
        >
            <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400 dark:text-dk-muted">
                {icone}<span className="truncate">{titre}</span>
            </span>
            {/* Le montant garde sa ligne : mis cote a cote, « 145 794,47 MAD »
                et son ecart se coupaient tous les deux en deux morceaux. */}
            <p className={`mt-1 text-[17px] font-black tabular-nums leading-tight whitespace-nowrap overflow-hidden text-ellipsis ${alerte ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-dk-text'}`}>
                {valeur}
            </p>
            {delta && <p className="mt-0.5 leading-none">{delta}</p>}
        </div>
    );

    /** Une repartition : le libelle, la part, et une barre fine. La part en
     *  POURCENTAGE d'abord — « 142 297 MAD » ne dit pas si c'est beaucoup.
     *
     *  `mesure` dit sur QUOI la part se calcule. L'argent pour les canaux (on
     *  veut savoir d'ou vient le chiffre), les PIECES pour les tailles et les
     *  couleurs : une taille sortie 30 fois a prix nul est la plus demandee,
     *  pas la moins — la mesurer en argent la faisait afficher « 0 % ». */
    /**
     * `valeur` est le CHIFFRE AFFICHE, `poids` ce que mesure la barre.
     *
     * Les deux etaient confondus : sur le panier moyen, la barre additionnait
     * des MOYENNES pour en faire un pourcentage — « ce canal represente 92 %
     * de la somme des paniers moyens ». Une somme de moyennes ne veut rien
     * dire, et le chiffre affiche etait donc faux. Une part se calcule sur une
     * grandeur qui s'additionne : un chiffre d'affaires, un nombre de ventes.
     */
    /** La photo du modele, reprise de sa fiche. A defaut, ses initiales : un
     *  carre vide ferait croire a une image qui ne charge pas. */
    const Vignette: React.FC<{ image: string | null; nom: string }> = ({ image, nom }) => (
        image
            ? <img src={image} alt="" className="w-7 h-7 rounded-md object-cover border border-slate-200 dark:border-dk-border shrink-0" />
            : (
                <span className="w-7 h-7 rounded-md shrink-0 flex items-center justify-center bg-slate-100 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border text-[9px] font-black text-slate-400 dark:text-dk-muted">
                    {nom.slice(0, 2).toUpperCase()}
                </span>
            )
    );

    /** « Bleu Marine » et « Bleu Ciel » se ressemblent en texte et pas du tout
     *  en rayon : on teinte la pastille avec le meme dictionnaire que les
     *  factures, jamais un second. Sans correspondance, elle reste grise —
     *  mieux vaut ne rien dire que mentir sur la teinte. */
    const PastilleCouleur: React.FC<{ nom: string }> = ({ nom }) => {
        const hex = teinteDe(nom);
        return (
            <span
                title={nom}
                className="w-3.5 h-3.5 rounded-full shrink-0 border border-slate-300 dark:border-dk-border"
                style={{ background: hex || 'transparent' }}
            >
                {!hex && <span className="block w-full h-full rounded-full bg-slate-200 dark:bg-dk-elevated" />}
            </span>
        );
    };

    const EtiquetteTaille: React.FC<{ taille: string }> = ({ taille }) => (
        <span className="min-w-[26px] h-5 px-1.5 shrink-0 inline-flex items-center justify-center rounded-md bg-slate-100 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border text-[9px] font-black uppercase text-slate-500 dark:text-dk-muted">
            {taille}
        </span>
    );

    const Repartition = ({ titre, lignes, unite }: { titre: string; lignes: Array<{ cle: string; ca: number; valeur?: number; poids?: number; detail: string; vignette?: React.ReactNode; sansPrix?: boolean }>; unite?: string }) => {
        const valeurDe = (l: { ca: number; valeur?: number }) => (l.valeur == null ? l.ca : l.valeur);
        const poidsDe = (l: { ca: number; poids?: number }) => (l.poids == null ? l.ca : l.poids);
        const total = lignes.reduce((a, l) => a + poidsDe(l), 0);
        return (
            <Carte titre={titre}>
                <div className="p-3.5 space-y-2.5">
                    {lignes.length === 0 && <p className="text-[11px] text-slate-400 dark:text-dk-muted">{T.rien}</p>}
                    {lignes.map(l => {
                        const part = total > 0 ? (poidsDe(l) / total) * 100 : 0;
                        const flou = l.cle === 'NON_PRECISE' || l.cle === '—';
                        return (
                            <div key={l.cle}>
                                <div className="flex items-center justify-between gap-2 text-[11px]">
                                    <span className="flex items-center gap-2 min-w-0">
                                        {/* Reconnaitre a l'oeil : une photo, une
                                            pastille de couleur ou une taille se
                                            lisent plus vite qu'un nom. */}
                                        {l.vignette}
                                        <span className={`font-bold truncate ${flou ? 'text-slate-400 dark:text-dk-muted italic' : 'text-slate-700 dark:text-dk-text-soft'}`}>
                                            {libelle(l.cle)}
                                        </span>
                                        {/* Des pieces sorties sans prix : ni erreur
                                            ni normalite, mais le chiffre d'affaires
                                            de cette ligne est faux tant qu'on ne
                                            l'a pas tranche. */}
                                        {l.sansPrix && (
                                            <span title={T.sansPrix} className="shrink-0 inline-flex items-center gap-0.5 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800/50">
                                                <AlertTriangle className="w-2.5 h-2.5" />{T.sansPrixCourt}
                                            </span>
                                        )}
                                    </span>
                                    <span className="shrink-0 tabular-nums">
                                        <span className="font-black text-slate-800 dark:text-dk-text">{nf(part)} %</span>
                                        <span className="ml-1.5 text-[10px] text-slate-400 dark:text-dk-muted">
                                            {nf(valeurDe(l))}{unite ? ` ${unite}` : ''}
                                        </span>
                                    </span>
                                </div>
                                <div className="h-1 rounded-full bg-slate-100 dark:bg-dk-elevated mt-1 overflow-hidden">
                                    <div className={`h-full rounded-full ${flou ? 'bg-slate-300 dark:bg-dk-border' : 'bg-slate-800 dark:bg-dk-accent'}`} style={{ width: `${Math.max(1.5, part)}%` }} />
                                </div>
                                <span className="block mt-0.5 text-[10px] text-slate-400 dark:text-dk-muted">{l.detail}</span>
                            </div>
                        );
                    })}
                    {/* Quand l'inconnu domine, la repartition ne decrit plus
                        l'activite : elle decrit un defaut de saisie. Le dire
                        vaut mieux que laisser lire un graphique faux. */}
                    {(() => {
                        const flous = lignes.filter(l => l.cle === 'NON_PRECISE' || l.cle === '\u2014');
                        const partFlou = total > 0 ? (flous.reduce((a, l) => a + poidsDe(l), 0) / total) * 100 : 0;
                        if (partFlou < 50) return null;
                        return (
                            <p className="flex items-start gap-1.5 text-[10px] text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50 bg-amber-50/70 dark:bg-amber-950/20 rounded-lg px-2.5 py-1.5">
                                <AlertTriangle className="w-3 h-3 shrink-0 mt-px" />
                                {T.majoriteNonRenseigne}
                            </p>
                        );
                    })()}
                </div>
            </Carte>
        );
    };

    /** Le jour par jour, du plus recent au plus ancien : sur telephone il
     *  defile a l'interieur de son cadre, il ne pousse pas la page. */
    const TableauJours = ({ colonnes, lignes }: { colonnes: string[]; lignes: Array<{ jour: string; cellules: string[]; alerte?: string }> }) => (
        <Carte titre={T.jourParJour}>
            <div className="overflow-x-auto">
                <table className="w-full text-[11px] tabular-nums">
                    <thead>
                        <tr className="text-[9px] font-black uppercase tracking-[0.06em] text-slate-400 dark:text-dk-muted">
                            <th className="text-left font-black px-3.5 py-1.5">{T.jourColonne}</th>
                            {colonnes.map(c => <th key={c} className="text-right font-black px-3.5 py-1.5 whitespace-nowrap">{c}</th>)}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                        {lignes.length === 0 && (
                            <tr><td colSpan={colonnes.length + 1} className="px-3.5 py-4 text-center text-slate-400 dark:text-dk-muted">{T.rien}</td></tr>
                        )}
                        {lignes.map(l => (
                            <tr key={l.jour} className={l.alerte ? 'bg-amber-50/60 dark:bg-amber-950/20' : undefined}>
                                <td className="px-3.5 py-1.5 font-bold text-slate-500 dark:text-dk-muted whitespace-nowrap">
                                    {l.jour.slice(8, 10)}/{l.jour.slice(5, 7)}
                                    {/* Un jour hors norme se signale : sans cela, il
                                        faut comparer les lignes une a une pour voir
                                        que la moyenne du mois vient de la. */}
                                    {l.alerte && (
                                        <span title={l.alerte} className="ml-1.5 inline-flex align-middle text-amber-600 dark:text-amber-400">
                                            <AlertTriangle className="w-3 h-3" />
                                        </span>
                                    )}
                                </td>
                                {l.cellules.map((v, i) => (
                                    <td key={i} className={`px-3.5 py-1.5 text-right whitespace-nowrap ${i === 0 ? 'font-black text-slate-800 dark:text-dk-text' : 'text-slate-500 dark:text-dk-text-soft'}`}>{v}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Carte>
    );

    /* -- La periode : jour, mois, annee -----------------------------------
     * Un mois se choisit par son nom, pas par deux dates saisies a la main.
     * Les bornes restent des dates : le serveur, lui, ne connait que du/au. */
    const dernierJourDuMois = (a: number, m: number) => new Date(a, m + 1, 0);
    const poserMois = (d: Date) => {
        const a = d.getFullYear(), m = d.getMonth();
        const fin = dernierJourDuMois(a, m);
        setDu(jourLocal(new Date(a, m, 1)));
        setAu(jourLocal(fin > new Date() ? new Date() : fin));
    };
    const poserAnnee = (a: number) => {
        const fin = new Date(a, 11, 31);
        setDu(jourLocal(new Date(a, 0, 1)));
        setAu(jourLocal(fin > new Date() ? new Date() : fin));
    };

    /** Le mode se DEDUIT des bornes : un seul etat a tenir, donc jamais de
     *  bouton allume sur une periode qui n'est plus la sienne. */
    const modePeriode: 'jour' | 'mois' | 'annee' | 'perso' | 'fenetre' = useMemo(() => {
        if (!du || !au) return 'fenetre';
        if (du === au) return 'jour';
        const d = new Date(du + 'T00:00:00');
        const finMois = jourLocal(dernierJourDuMois(d.getFullYear(), d.getMonth()));
        const finAnnee = jourLocal(new Date(d.getFullYear(), 11, 31));
        const clot = (f: string) => au === f || au === aujourdhui();
        if (d.getDate() === 1 && d.getMonth() === 0 && clot(finAnnee) && au >= jourLocal(new Date(d.getFullYear(), 0, 31))) return 'annee';
        if (d.getDate() === 1 && clot(finMois)) return 'mois';
        return 'perso';
    }, [du, au]);

    const etiquettePeriode = useMemo(() => {
        if (!du) return '';
        const d = new Date(du + 'T00:00:00');
        if (modePeriode === 'annee') return String(d.getFullYear());
        if (modePeriode === 'mois') return `${T.moisNoms[d.getMonth()]} ${d.getFullYear()}`;
        if (modePeriode === 'jour') return `${du.slice(8, 10)}/${du.slice(5, 7)}/${du.slice(0, 4)}`;
        return `${du.slice(8, 10)}/${du.slice(5, 7)} - ${au.slice(8, 10)}/${au.slice(5, 7)}`;
    }, [du, au, modePeriode, T.moisNoms]);

    /** Reculer d'un cran garde la NATURE de la periode : un mois recule d'un
     *  mois, pas de trente jours - sinon fevrier deborde sur janvier. */
    const decalerPeriode = (sens: 1 | -1) => {
        if (!du) return;
        const d = new Date(du + 'T00:00:00');
        if (modePeriode === 'annee') return poserAnnee(d.getFullYear() + sens);
        if (modePeriode === 'mois') return poserMois(new Date(d.getFullYear(), d.getMonth() + sens, 1));
        if (modePeriode === 'jour') {
            const n = new Date(d); n.setDate(n.getDate() + sens);
            if (jourLocal(n) > aujourdhui()) return;
            setDu(jourLocal(n)); setAu(jourLocal(n));
            return;
        }
        // Periode libre : on la deplace de sa propre longueur.
        const f = new Date(au + 'T00:00:00');
        const largeur = Math.round((f.getTime() - d.getTime()) / 86400000) + 1;
        const nd = new Date(d), nfin = new Date(f);
        nd.setDate(nd.getDate() + sens * largeur);
        nfin.setDate(nfin.getDate() + sens * largeur);
        if (jourLocal(nd) > aujourdhui()) return;
        setDu(jourLocal(nd));
        setAu(jourLocal(nfin) > aujourdhui() ? aujourdhui() : jourLocal(nfin));
    };

    const peutAvancer = !!au && au < aujourdhui();

    const periodeLisible = serieComplete.length
        ? `${serieComplete[0].jour} → ${serieComplete[serieComplete.length - 1].jour}`
        : undefined;

    const filtresActifs = [du, au, canal, segment, clientId].filter(Boolean).length;

    return (
        <div className="space-y-3 min-w-0 max-w-full overflow-x-hidden">
            {/* Barre unique : la periode a gauche, le reste derriere un bouton.
                Huit contrôles alignes de front donnent une barre qu'on ne lit
                plus — et un filtre qu'on ne lit pas est un chiffre mal
                interprete. */}
            <div className="flex flex-wrap items-center gap-2 min-w-0">
                <h2 className="text-[13px] font-black uppercase tracking-[0.08em] text-slate-900 dark:text-dk-text mr-1">{T.titre}</h2>

                {/* La periode : un jour, un mois, une annee - et les fleches
                    pour reculer. Comparer septembre a aout demandait jusqu'ici
                    de taper deux dates a la main, ce que personne ne fait. */}
                <div className="bg-slate-100/70 dark:bg-dk-elevated rounded-lg p-0.5 inline-flex">
                    <button
                        onClick={() => { setDu(aujourdhui()); setAu(aujourdhui()); }}
                        className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-colors ${modePeriode === 'jour'
                            ? 'bg-white dark:bg-dk-surface text-slate-900 dark:text-dk-text shadow-sm'
                            : 'text-slate-500 dark:text-dk-muted hover:text-slate-700'}`}
                    >
                        {T.aujourdhuiCourt}
                    </button>
                    {[7, 30, 90].map(n => (
                        <button
                            key={n}
                            onClick={() => { setDu(''); setAu(''); setJours(n); }}
                            className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-colors ${jours === n && !du && !au
                                ? 'bg-white dark:bg-dk-surface text-slate-900 dark:text-dk-text shadow-sm'
                                : 'text-slate-500 dark:text-dk-muted hover:text-slate-700'}`}
                        >
                            {n}{T.jours.slice(0, 1)}
                        </button>
                    ))}
                    <button
                        onClick={() => poserMois(new Date())}
                        className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-colors ${modePeriode === 'mois'
                            ? 'bg-white dark:bg-dk-surface text-slate-900 dark:text-dk-text shadow-sm'
                            : 'text-slate-500 dark:text-dk-muted hover:text-slate-700'}`}
                    >
                        {T.parMois}
                    </button>
                    <button
                        onClick={() => poserAnnee(new Date().getFullYear())}
                        className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-colors ${modePeriode === 'annee'
                            ? 'bg-white dark:bg-dk-surface text-slate-900 dark:text-dk-text shadow-sm'
                            : 'text-slate-500 dark:text-dk-muted hover:text-slate-700'}`}
                    >
                        {T.parAnnee}
                    </button>
                </div>

                {/* Le pas de recul : la meme fenetre, un cran plus tot. Elle ne
                    depasse jamais aujourd'hui - un mois a venir n'a pas de
                    ventes, seulement un tableau vide qui inquiete. */}
                {modePeriode !== 'fenetre' && (
                    <div className="inline-flex items-center gap-0.5 border border-slate-200 dark:border-dk-border rounded-lg bg-white dark:bg-dk-surface h-8 px-0.5">
                        <button onClick={() => decalerPeriode(-1)} title={T.precedent}
                            className="w-7 h-7 rounded-md text-slate-400 hover:text-slate-900 dark:hover:text-dk-text">&lsaquo;</button>
                        <span className="px-1.5 text-[11px] font-bold tabular-nums text-slate-700 dark:text-dk-text whitespace-nowrap">
                            {etiquettePeriode}
                        </span>
                        <button onClick={() => decalerPeriode(1)} title={T.suivant} disabled={!peutAvancer}
                            className="w-7 h-7 rounded-md text-slate-400 enabled:hover:text-slate-900 dark:enabled:hover:text-dk-text disabled:opacity-30">&rsaquo;</button>
                    </div>
                )}

                <button
                    onClick={() => setFiltresOuverts(v => !v)}
                    className={`h-8 px-2.5 rounded-lg text-[11px] font-bold border inline-flex items-center gap-1.5 transition-colors ${filtresOuverts || filtresActifs
                        ? 'bg-slate-900 dark:bg-dk-accent text-white border-transparent'
                        : 'bg-white dark:bg-dk-surface text-slate-600 dark:text-dk-text-soft border-slate-200 dark:border-dk-border'}`}
                >
                    <Filter className="w-3.5 h-3.5" />
                    {T.filtres}
                    {filtresActifs > 0 && <span className="px-1.5 rounded-full bg-white/20 tabular-nums">{filtresActifs}</span>}
                </button>

                <div className="relative order-last sm:order-none w-full sm:w-auto sm:flex-1 sm:min-w-[160px] sm:max-w-[260px]">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        value={recherche}
                        onChange={e => setRecherche(e.target.value)}
                        placeholder={T.chercher}
                        className="w-full h-8 pl-8 pr-3 rounded-lg bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border text-[12px] text-slate-700 dark:text-dk-text placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-slate-200 dark:focus:ring-dk-border"
                    />
                </div>

                <button
                    onClick={() => charger(jours)}
                    title={T.actualiser}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-400 hover:text-slate-900 dark:hover:text-dk-text"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${chargement ? 'opacity-40' : ''}`} />
                </button>
            </div>

            {filtresOuverts && (
                <div className="border border-slate-200 dark:border-dk-border rounded-xl bg-white dark:bg-dk-surface p-3 grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap sm:items-end sm:gap-3">
                    {/* Choisir DU tout seul ne veut rien dire : la periode se
                        ferme d'elle-meme a aujourd'hui, et AU ne peut jamais
                        remonter avant DU. */}
                    <ChampDate
                        label={T.du}
                        value={du}
                        vide={T.choisir}
                        labels={agendaLabels}
                        max={au || aujourdhui()}
                        onChange={v => { setDu(v); if (v && (!au || au < v)) setAu(aujourdhui() >= v ? aujourdhui() : v); }}
                    />
                    <ChampDate
                        label={T.au}
                        value={au}
                        vide={T.choisir}
                        labels={agendaLabels}
                        min={du || undefined}
                        max={aujourdhui()}
                        onChange={v => { setAu(v); if (v && du && du > v) setDu(v); }}
                    />
                    <ChampListe
                        label={T.parCanal}
                        value={canal}
                        onChange={setCanal}
                        options={[{ valeur: '', texte: T.tousCanaux }, { valeur: 'MAGASIN', texte: 'MAGASIN' }, { valeur: 'ONLINE', texte: 'ONLINE' }, { valeur: 'ATELIER', texte: 'ATELIER' }]}
                    />
                    <ChampListe
                        label={T.parSegment}
                        value={segment}
                        onChange={setSegment}
                        options={[{ valeur: '', texte: T.tousSegments }, { valeur: 'BOUTIQUE', texte: 'BOUTIQUE' }, { valeur: 'DETAIL', texte: 'DETAIL' }, { valeur: 'GROS', texte: 'GROS' }]}
                    />
                    <ChampListe
                        label={T.clients}
                        value={clientId}
                        onChange={setClientId}
                        largeur="sm:min-w-[190px] sm:max-w-[220px]"
                        classe="col-span-2 sm:col-span-1"
                        placeholderRecherche={T.chercher}
                        rechercheToujours
                        options={[
                            { valeur: '', texte: T.tousClients },
                            // Trois clients portent le meme prenom : ce qui les
                            // separe, c'est le telephone et ce qu'ils doivent.
                            ...[...annuaire]
                                .sort((a, b) => b.encours - a.encours || b.ca - a.ca)
                                .map(c => ({
                                    valeur: c.id,
                                    texte: c.nom,
                                    sous: [c.tel, c.ville].filter(Boolean).join(' · ') || undefined,
                                    droite: c.encours > 0 ? `${nf(c.encours)} ${currency}` : (c.ca > 0 ? `${nf(c.ca)} ${currency}` : undefined),
                                    alerte: c.encours > 0,
                                    recherche: c.type || undefined,
                                })),
                        ]}
                    />
                    {filtresActifs > 0 && (
                        <button
                            onClick={() => { setDu(''); setAu(''); setCanal(''); setSegment(''); setClientId(''); }}
                            className="col-span-2 sm:col-span-1 h-9 sm:h-8 px-3 rounded-lg text-[11px] font-bold text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50"
                        >
                            {T.effacer}
                        </button>
                    )}
                </div>
            )}

            {IS_STATIC && (
                <p className="text-[12px] text-slate-500 dark:text-dk-muted flex items-start gap-1.5 border border-slate-200 dark:border-dk-border rounded-xl p-3 bg-white dark:bg-dk-surface">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-px text-amber-500" />
                    <span>{T.statique}</span>
                </p>
            )}

            {erreur && (
                <p className="text-[12px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5 border border-rose-200 dark:border-rose-800/50 rounded-xl p-3 bg-rose-50/50 dark:bg-rose-950/20">
                    <AlertTriangle className="w-4 h-4" /> {erreur}
                </p>
            )}

            {data && (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                        <Tuile titre={T.ca} valeur={`${nf(data.kpis.ca)} ${currency}`} icone={<TrendingUp className="w-3.5 h-3.5" />} onOuvrir={() => setDetail('ca')}
                            delta={<Delta actuel={data.kpis.ca} avant={data.precedent.ca} />} />
                        <Tuile titre={T.pieces} valeur={nf(data.kpis.pieces)} icone={<Boxes className="w-3.5 h-3.5" />} onOuvrir={() => setDetail('pieces')}
                            delta={<Delta actuel={data.kpis.pieces} avant={data.precedent.pieces} />} />
                        <Tuile titre={T.tickets} valeur={nf(data.kpis.tickets)} icone={<Receipt className="w-3.5 h-3.5" />} onOuvrir={() => setDetail('tickets')}
                            delta={<Delta actuel={data.kpis.tickets} avant={data.precedent.tickets} />} />
                        <Tuile titre={T.panier} valeur={`${nf(data.kpis.panierMoyen)} ${currency}`} icone={<Wallet className="w-3.5 h-3.5" />} onOuvrir={() => setDetail('panier')} />
                        <Tuile titre={T.encours} valeur={`${nf(data.kpis.encoursTotal)} ${currency}`} icone={<Users className="w-3.5 h-3.5" />} alerte={data.kpis.encoursTotal > 0}
                            onOuvrir={() => setDetail('encours')} />
                    </div>

                    {/* La courbe AVANT tout le reste : un total dit combien, la
                        courbe dit si ca monte, si ca retombe, et quel jour. */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
                        <Carte
                            titre={T.tendance}
                            className="lg:col-span-2"
                            droite={
                                <span className="text-[10px] text-slate-400 dark:text-dk-muted tabular-nums">
                                    {data.serie.length} {T.joursAvecVente}
                                </span>
                            }
                        >
                            <div className="p-3.5">
                                {serieComplete.length === 0 ? (
                                    <p className="text-[11px] text-slate-400 dark:text-dk-muted">{T.rien}</p>
                                ) : (
                                    <>
                                        {/* L'axe se change d'un doigt : la meme
                                            periode, lue par canal puis par
                                            segment, ne raconte pas la meme
                                            histoire commerciale. */}
                                        <div className="flex flex-wrap items-center gap-1.5 mb-2">
                                            <div className="bg-slate-100/70 dark:bg-dk-elevated rounded-lg p-0.5 inline-flex">
                                                {([['canal', T.parCanal], ['segment', T.parSegment]] as const).map(([k, t]) => (
                                                    <button key={k} onClick={() => setAxeCourbe(k)}
                                                        className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors ${axeCourbe === k
                                                            ? 'bg-white dark:bg-dk-surface text-slate-900 dark:text-dk-text shadow-sm'
                                                            : 'text-slate-500 dark:text-dk-muted'}`}>{t}</button>
                                                ))}
                                            </div>
                                            <button onClick={() => setCumule(v => !v)}
                                                className={`px-2 py-1 rounded-md text-[10px] font-bold border transition-colors ${cumule
                                                    ? 'bg-slate-900 dark:bg-dk-accent text-white border-transparent'
                                                    : 'bg-white dark:bg-dk-surface text-slate-500 dark:text-dk-muted border-slate-200 dark:border-dk-border'}`}>
                                                {T.cumule}
                                            </button>
                                        </div>

                                        {seriesVisibles.length === 0 ? (
                                            <p className="text-[11px] text-slate-400 dark:text-dk-muted py-8 text-center">{T.rien}</p>
                                        ) : (
                                            <Courbes jours={serieComplete.map(j => j.jour)} series={seriesVisibles} cumul={cumule} />
                                        )}

                                        {/* La legende porte le total de chaque
                                            ligne et l'eteint d'un clic : une
                                            grosse boutique ecrase les autres
                                            courbes tant qu'on ne la retire pas. */}
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            {seriesAxe.map(x => {
                                                const off = sansSerie.includes(x.cle);
                                                return (
                                                    <button key={x.cle}
                                                        onClick={() => setSansSerie(l => (off ? l.filter(c => c !== x.cle) : [...l, x.cle]))}
                                                        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-bold transition-colors ${off
                                                            ? 'border-slate-200 dark:border-dk-border text-slate-300 dark:text-dk-muted'
                                                            : 'border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft bg-white dark:bg-dk-surface'}`}>
                                                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: off ? 'transparent' : x.couleur, border: `1.5px solid ${x.couleur}` }} />
                                                        {libelle(x.cle)}
                                                        <span className="tabular-nums text-slate-400 dark:text-dk-muted">{nf(x.total)}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        <div className="flex items-center justify-between mt-1.5 text-[10px] text-slate-400 dark:text-dk-muted tabular-nums">
                                            <span>{serieComplete[0]?.jour}</span>
                                            <span className="hidden sm:inline">{T.meilleurJour} : {(() => {
                                                const best = [...data.serie].sort((a, b) => b.ca - a.ca)[0];
                                                return best ? `${best.jour} · ${nf(best.ca)} ${currency}` : '—';
                                            })()}</span>
                                            <span>{serieComplete[serieComplete.length - 1]?.jour}</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        </Carte>

                        {/* Le rythme de la semaine : il change des horaires, pas
                            seulement un graphique. */}
                        <Carte titre={T.rythme}>
                            <div className="p-3.5">
                                <div className="flex items-end justify-between gap-1.5 h-24">
                                    {[1, 2, 3, 4, 5, 6, 0].map(n => {
                                        const j = data.parJourSemaine.find(x => x.jour === n);
                                        const max = Math.max(...data.parJourSemaine.map(x => x.ca), 1);
                                        const h = j ? Math.max(3, (j.ca / max) * 100) : 2;
                                        return (
                                            <div key={n} className="flex-1 flex flex-col items-center gap-1 justify-end h-full">
                                                <div
                                                    title={j ? `${nf(j.ca)} ${currency}` : '—'}
                                                    className={`w-full max-w-[26px] rounded-t ${j ? 'bg-slate-800 dark:bg-dk-accent' : 'bg-slate-100 dark:bg-dk-elevated'}`}
                                                    style={{ height: `${h}%` }}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="flex items-end justify-between gap-1.5 mt-1.5">
                                    {T.joursSemaine.map(lbl => (
                                        <span key={lbl} className="flex-1 text-center text-[9px] font-bold text-slate-400 dark:text-dk-muted">{lbl}</span>
                                    ))}
                                </div>
                            </div>
                        </Carte>
                    </div>

                    {/* Les modeles d'abord : c'est la seule zone qui declenche une
                        decision de production. Le reste explique, elle decide. */}
                    <Carte
                        titre={T.modeles}
                        droite={
                            <div className="flex gap-1 flex-wrap">
                                {(['TOUS', 'TOP', 'LENT', 'MORT', 'NEUF'] as const).map(f => (
                                    <button
                                        key={f}
                                        onClick={() => setFiltreModele(f)}
                                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-colors ${filtreModele === f
                                            ? 'bg-slate-900 dark:bg-dk-accent text-white'
                                            : 'text-slate-400 dark:text-dk-muted hover:text-slate-700'}`}
                                    >
                                        {f}
                                    </button>
                                ))}
                            </div>
                        }
                    >
                        <div className="divide-y divide-slate-100 dark:divide-dk-border">
                            {modelesFiltres.length === 0 && (
                                <p className="px-4 py-6 text-center text-[11px] text-slate-400 dark:text-dk-muted">{T.rien}</p>
                            )}
                            {modelesFiltres.slice(0, 40).map(m => (
                                <div key={m.modelId} className="px-3.5 py-2.5 flex items-center gap-3 hover:bg-slate-50/60 dark:hover:bg-dk-elevated/40">
                                    {m.image
                                        ? <img src={m.image} alt="" className="w-10 h-10 rounded-lg object-cover flex-none border border-slate-200 dark:border-dk-border" />
                                        : <span className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-dk-elevated flex-none flex items-center justify-center text-[9px] font-black text-slate-300">{m.nom.slice(0, 2).toUpperCase()}</span>}

                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <span className="text-[12px] font-bold text-slate-800 dark:text-dk-text truncate">{m.nom}</span>
                                            <span className={`px-1.5 py-px rounded-full text-[9px] font-black border shrink-0 ${TEINTE_STATUT[m.statut]}`}>{m.statut}</span>
                                        </div>
                                        <span className="block text-[10px] text-slate-400 dark:text-dk-muted truncate">
                                            {[m.reference, m.ageJours ? `${m.ageJours} ${T.jours}` : null, `${nf(m.parJour)} ${T.parJourCourt}`,
                                              m.canalFort ? `${libelle(m.canalFort)} ${nf(m.partCanalFort || 0)} %` : null].filter(Boolean).join(' · ')}
                                        </span>
                                        {/* L'ecoulement se LIT, il ne se calcule pas de tete. */}
                                        <div className="h-1 rounded-full bg-slate-100 dark:bg-dk-elevated mt-1.5 overflow-hidden max-w-[220px]">
                                            <div
                                                className={`h-full rounded-full ${m.ecoule >= 60 ? 'bg-emerald-500' : m.ecoule >= 20 ? 'bg-slate-800 dark:bg-dk-accent' : 'bg-amber-500'}`}
                                                style={{ width: `${Math.min(100, Math.max(1.5, m.ecoule))}%` }}
                                            />
                                        </div>
                                    </div>

                                    <div className="hidden sm:block text-right shrink-0 w-[74px]">
                                        <span className="block text-[12px] font-black tabular-nums text-slate-800 dark:text-dk-text">{nf(m.ecoule)} %</span>
                                        <span className="block text-[10px] text-slate-400 dark:text-dk-muted tabular-nums">{nf(m.vendu)}/{nf(m.produit)}</span>
                                    </div>
                                    <div className="hidden md:block text-right shrink-0 w-[64px]">
                                        <span className="block text-[12px] font-bold tabular-nums text-slate-700 dark:text-dk-text-soft">{nf(m.stock)}</span>
                                        <span className="block text-[10px] text-slate-400 dark:text-dk-muted">{T.stock}</span>
                                    </div>
                                    <div className="hidden md:block text-right shrink-0 w-[78px]">
                                        {m.joursAvantRupture == null
                                            ? <span className="text-[12px] text-slate-300 dark:text-dk-muted">—</span>
                                            : <span className={`block text-[12px] font-black tabular-nums ${m.joursAvantRupture <= 7 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-dk-text-soft'}`}>
                                                {m.joursAvantRupture} {T.jours}
                                              </span>}
                                        <span className="block text-[10px] text-slate-400 dark:text-dk-muted">{T.rupture}</span>
                                    </div>
                                    <div className="text-right shrink-0 w-[96px]">
                                        <span className="block text-[12px] font-black tabular-nums text-slate-900 dark:text-dk-text">{nf(m.caPeriode)}</span>
                                        <span className="block text-[10px] text-slate-400 dark:text-dk-muted">{currency}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Carte>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
                        <Repartition titre={T.parCanal} lignes={data.parCanal.map(c => ({ cle: c.canal, ca: c.ca, detail: `${nf(c.pieces)} ${T.piecesCourt} · ${nf(c.tickets)} ${T.ventesCourt}` }))} />
                        <Repartition titre={T.parSegment} lignes={data.parSegment.map(s => ({ cle: s.segment, ca: s.ca, detail: `${nf(s.pieces)} ${T.piecesCourt}` }))} />
                        <Repartition titre={T.parPaiement} lignes={data.parPaiement.map(p => ({ cle: p.mode, ca: p.ca, detail: `${nf(p.tickets)} ${T.ventesCourt}` }))} />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
                        <Repartition
                            titre={T.tailles}
                            unite={T.piecesCourt}
                            lignes={(data.tailles || []).slice(0, 8).map(t => ({ cle: t.taille, ca: t.ca, valeur: t.pieces, detail: `${nf(t.ca)} ${currency}` }))}
                        />
                        <Repartition
                            titre={T.couleurs}
                            unite={T.piecesCourt}
                            lignes={(data.couleurs || []).slice(0, 8).map(c => ({ cle: c.couleur, ca: c.ca, valeur: c.pieces, detail: `${nf(c.ca)} ${currency}` }))}
                        />
                        <Carte
                            titre={T.qualite}
                            droite={
                                <span className={`text-[12px] font-black tabular-nums ${(data.qualite?.tauxDefaut || 0) > 5 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                    {nf(data.qualite?.tauxDefaut || 0)} %
                                </span>
                            }
                        >
                            <div className="p-3.5 space-y-2">
                                {(data.qualite?.parModele || []).length === 0 && (
                                    <p className="text-[11px] text-slate-400 dark:text-dk-muted">{T.aucunDefaut}</p>
                                )}
                                {(data.qualite?.parModele || []).slice(0, 6).map(d => (
                                    <div key={d.modelId} className="flex items-baseline justify-between gap-2 text-[11px]">
                                        <span className="font-bold text-slate-700 dark:text-dk-text-soft truncate">{d.nom}</span>
                                        <span className="shrink-0 tabular-nums">
                                            <span className="font-black text-rose-600 dark:text-rose-400">{nf(d.taux)} %</span>
                                            <span className="ml-1.5 text-[10px] text-slate-400 dark:text-dk-muted">{nf(d.defauts)}</span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </Carte>
                    </div>

                    {/* Les clients : d'abord ceux qui doivent. */}
                    <Carte
                        titre={T.clients}
                        droite={
                            <span className="text-[10px] tabular-nums text-slate-400 dark:text-dk-muted">
                                {T.concentration} <b className={data.concentration.partTop3 > 60 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-dk-text-soft'}>
                                    {nf(data.concentration.partTop3)} %
                                </b> · {data.concentration.clientsActifs} {T.actifs}
                            </span>
                        }
                    >
                        <div className="divide-y divide-slate-100 dark:divide-dk-border">
                            {clientsFiltres.length === 0 && (
                                <p className="px-4 py-6 text-center text-[11px] text-slate-400 dark:text-dk-muted">{T.rien}</p>
                            )}
                            {clientsFiltres.map(c => (
                                <div key={c.id} className="px-3.5 py-2.5 flex items-center gap-3 hover:bg-slate-50/60 dark:hover:bg-dk-elevated/40">
                                    <span className={`px-1.5 py-px rounded-full text-[9px] font-black border shrink-0 ${TEINTE_CLIENT[c.statut]}`}>{c.statut}</span>
                                    <div className="min-w-0 flex-1">
                                        <span className="block text-[12px] font-bold text-slate-800 dark:text-dk-text truncate">{c.nom}</span>
                                        <span className="block text-[10px] text-slate-400 dark:text-dk-muted truncate">
                                            {[c.type, c.ville, c.tel].filter(Boolean).join(' · ')}
                                            {c.facturesEnRetard > 0 ? ` · ${c.facturesEnRetard} ${T.retard}` : ''}
                                        </span>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <span className="block text-[12px] font-black tabular-nums text-slate-900 dark:text-dk-text">{nf(c.ca)} {currency}</span>
                                        {c.encours > 0 && (
                                            <span className="block text-[10px] font-bold tabular-nums text-amber-600 dark:text-amber-400">
                                                {T.doit} {nf(c.encours)} {currency}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Carte>
                </>
            )}

            {!data && !chargement && !erreur && !IS_STATIC && (
                <p className="text-[12px] text-slate-400 dark:text-dk-muted flex items-center gap-1.5">
                    <PackageX className="w-4 h-4" /> {T.rien}
                </p>
            )}

            {/* En refermant, on recharge : un encaissement fait dans le detail
                change l'encours affiche sur la tuile. */}
            {detail === 'encours' && (
                <EncoursDetail devise={currency} onOuvrirFicheClient={onOuvrirFicheClient} onFermer={() => { setDetail(null); void charger(jours); }} />
            )}

            {/* Les quatre autres tuiles se lisent sur les donnees deja
                chargees : ouvrir le detail ne redemande rien au serveur, il
                decompose le total sous les axes qui expliquent son mouvement. */}
            {data && detail === 'ca' && (
                <PanneauDetail titre={T.ca} valeur={`${nf(data.kpis.ca)} ${currency}`} sous={periodeLisible} onFermer={() => setDetail(null)}>
                    <Repartition titre={T.parCanal} unite={currency}
                        lignes={data.parCanal.map(c => ({ cle: c.canal, ca: c.ca, detail: `${nf(c.pieces)} ${T.piecesCourt} · ${nf(c.tickets)} ${T.ventesCourt}` }))} />
                    <Repartition titre={T.parSegment} unite={currency}
                        lignes={data.parSegment.map(c => ({ cle: c.segment, ca: c.ca, detail: `${nf(c.pieces)} ${T.piecesCourt}` }))} />
                    <Repartition titre={T.parPaiement} unite={currency}
                        lignes={data.parPaiement.map(p => ({ cle: p.mode, ca: p.ca, detail: `${nf(p.tickets)} ${T.ventesCourt}` }))} />
                    <TableauJours colonnes={[T.ca, T.pieces, T.tickets]}
                        lignes={[...serieComplete].reverse().filter(j => !j.vide).map(j => ({ jour: j.jour, cellules: [`${nf(j.ca)} ${currency}`, nf(j.pieces), nf(j.tickets)] }))} />
                </PanneauDetail>
            )}

            {data && detail === 'pieces' && (
                <PanneauDetail titre={T.pieces} valeur={nf(data.kpis.pieces)} sous={periodeLisible} onFermer={() => setDetail(null)}>
                    <Repartition titre={T.modeles} unite={T.piecesCourt}
                        lignes={[...data.modeles].sort((a, b) => b.piecesPeriode - a.piecesPeriode).slice(0, 25)
                            .map(m => ({
                                cle: m.nom, ca: m.caPeriode, valeur: m.piecesPeriode, poids: m.piecesPeriode,
                                vignette: <Vignette image={m.image} nom={m.nom} />,
                                sansPrix: m.piecesPeriode > 0 && m.caPeriode <= 0,
                                detail: `${nf(m.caPeriode)} ${currency} · ${T.stock} ${nf(m.stock)}`,
                            }))} />
                    {/* Deux systemes de tailles cohabitent : le pantalon se
                        vend en 36-38-40, le tee-shirt en S-M-L. Melanges dans
                        une seule liste, « 38 = 34 % » et « S = 8 % » se
                        comparaient alors qu'ils ne parlent ni du meme vetement
                        ni de la meme echelle. Chaque systeme a donc ses 100 %. */}
                    {(() => {
                        const estChiffree = (t: string) => /\d/.test(t);
                        const ligneTaille = (t: { taille: string; pieces: number; ca: number }) => ({
                            cle: t.taille, ca: t.ca, valeur: t.pieces, poids: t.pieces,
                            vignette: <EtiquetteTaille taille={t.taille} />,
                            sansPrix: t.pieces > 0 && t.ca <= 0,
                            detail: `${nf(t.ca)} ${currency}`,
                        });
                        const chiffrees = data.tailles.filter(t => estChiffree(t.taille));
                        const lettres = data.tailles.filter(t => !estChiffree(t.taille));
                        // Un seul systeme en service : le titre general suffit,
                        // inutile d'annoncer une distinction qui n'existe pas ici.
                        if (chiffrees.length === 0 || lettres.length === 0) {
                            return <Repartition titre={T.tailles} unite={T.piecesCourt} lignes={data.tailles.map(ligneTaille)} />;
                        }
                        return (
                            <>
                                <Repartition titre={T.taillesChiffrees} unite={T.piecesCourt} lignes={chiffrees.map(ligneTaille)} />
                                <Repartition titre={T.taillesLettres} unite={T.piecesCourt} lignes={lettres.map(ligneTaille)} />
                            </>
                        );
                    })()}
                    <Repartition titre={T.couleurs} unite={T.piecesCourt}
                        lignes={data.couleurs.map(c => ({
                            cle: c.couleur, ca: c.ca, valeur: c.pieces, poids: c.pieces,
                            vignette: <PastilleCouleur nom={c.couleur} />,
                            sansPrix: c.pieces > 0 && c.ca <= 0,
                            detail: `${nf(c.ca)} ${currency}`,
                        }))} />
                </PanneauDetail>
            )}

            {data && detail === 'tickets' && (
                <PanneauDetail titre={T.tickets} valeur={nf(data.kpis.tickets)} sous={periodeLisible} onFermer={() => setDetail(null)}>
                    <Repartition titre={T.parCanal} unite={T.ventesCourt}
                        lignes={data.parCanal.map(c => ({ cle: c.canal, ca: c.ca, valeur: c.tickets, poids: c.tickets, detail: `${nf(c.tickets > 0 ? c.ca / c.tickets : 0)} ${currency} ${T.parVente}` }))} />
                    <Repartition titre={T.parPaiement} unite={T.ventesCourt}
                        lignes={data.parPaiement.map(p => ({ cle: p.mode, ca: p.ca, valeur: p.tickets, poids: p.tickets, detail: `${nf(p.ca)} ${currency}` }))} />
                    <TableauJours colonnes={[T.tickets, T.panier, T.pieces]}
                        lignes={[...serieComplete].reverse().filter(j => !j.vide).map(j => ({
                            jour: j.jour,
                            cellules: [nf(j.tickets), `${nf(j.tickets > 0 ? j.ca / j.tickets : 0)} ${currency}`, nf(j.pieces)],
                        }))} />
                </PanneauDetail>
            )}

            {data && detail === 'panier' && (() => {
                const pa = data.paniers;
                const pm = data.kpis.panierMoyen;
                // La comparaison : un panier moyen sans son passe ne dit ni
                // « bonne nouvelle » ni « mauvaise ». Le precedent est calcule
                // sur la meme duree, juste avant la periode affichee.
                const pmAvant = data.precedent.tickets > 0 ? data.precedent.ca / data.precedent.tickets : 0;
                const ecart = pmAvant > 0 ? ((pm - pmAvant) / pmAvant) * 100 : null;
                const joursPanier = [...serieComplete].reverse().filter(j => !j.vide);
                return (
                <PanneauDetail titre={T.panier} valeur={`${nf(pm)} ${currency}`} sous={periodeLisible} onFermer={() => setDetail(null)}>
                    {/* Le chiffre du haut est une MOYENNE. Elle se lit a cote de
                        sa mediane et de son evolution, sinon elle rassure ou
                        inquiete sans raison. */}
                    <Carte titre={T.moyenneTrompe}>
                        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-slate-100 dark:divide-dk-border">
                            <div className="p-3.5">
                                <p className="text-[9px] font-black uppercase tracking-[0.06em] text-slate-400 dark:text-dk-muted">{T.panier}</p>
                                <p className="text-[15px] font-black tabular-nums text-slate-900 dark:text-dk-text mt-0.5">{nf(pm)} {currency}</p>
                            </div>
                            <div className="p-3.5">
                                <p className="text-[9px] font-black uppercase tracking-[0.06em] text-slate-400 dark:text-dk-muted">{T.mediane}</p>
                                <p className="text-[15px] font-black tabular-nums text-slate-900 dark:text-dk-text mt-0.5">{nf(pa.mediane)} {currency}</p>
                                {/* L'ecart moyenne/mediane EST l'information : quand
                                    la moyenne double la mediane, une poignee de
                                    grosses ventes porte tout le reste. */}
                                {pa.mediane > 0 && pm > pa.mediane * 1.5 && (
                                    <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold mt-0.5">
                                        {nf(pm / pa.mediane)}&times;
                                    </p>
                                )}
                            </div>
                            <div className="p-3.5">
                                <p className="text-[9px] font-black uppercase tracking-[0.06em] text-slate-400 dark:text-dk-muted">{T.piecesParVente}</p>
                                <p className="text-[15px] font-black tabular-nums text-slate-900 dark:text-dk-text mt-0.5">{nf(pa.piecesParTicket)}</p>
                            </div>
                            <div className="p-3.5">
                                <p className="text-[9px] font-black uppercase tracking-[0.06em] text-slate-400 dark:text-dk-muted">{T.versusPrecedent}</p>
                                {ecart == null ? (
                                    <p className="text-[15px] font-black text-slate-300 dark:text-dk-muted mt-0.5">&mdash;</p>
                                ) : (
                                    <p className={`text-[15px] font-black tabular-nums mt-0.5 flex items-center gap-1 ${ecart >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                        {ecart >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                                        {nf(Math.abs(ecart))} %
                                    </p>
                                )}
                                <p className="text-[10px] text-slate-400 dark:text-dk-muted mt-0.5">{nf(pmAvant)} {currency}</p>
                            </div>
                        </div>
                    </Carte>

                    {/* Les extremes : c'est la vente hors norme qu'on cherche
                        quand un chiffre surprend, pas la moyenne. */}
                    {(pa.plusGros || pa.plusPetit) && (
                        <Carte titre={T.extremes}>
                            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 dark:divide-dk-border">
                                {[{ t: T.plusGros, v: pa.plusGros }, { t: T.plusPetit, v: pa.plusPetit }].map(({ t, v }) => (
                                    <div key={t} className="p-3.5">
                                        <p className="text-[9px] font-black uppercase tracking-[0.06em] text-slate-400 dark:text-dk-muted">{t}</p>
                                        {v ? (
                                            <>
                                                <p className="text-[15px] font-black tabular-nums text-slate-900 dark:text-dk-text mt-0.5">{nf(v.montant)} {currency}</p>
                                                <p className="text-[10px] text-slate-500 dark:text-dk-muted mt-0.5 truncate">
                                                    {v.client || T.nonRenseigne}
                                                    {v.jour ? ` · ${v.jour.slice(8, 10)}/${v.jour.slice(5, 7)}` : ''}
                                                    {` · ${nf(v.pieces)} ${T.piecesCourt}`}
                                                </p>
                                            </>
                                        ) : <p className="text-[11px] text-slate-400 dark:text-dk-muted mt-0.5">{T.rien}</p>}
                                    </div>
                                ))}
                            </div>
                        </Carte>
                    )}

                    {/* La forme de la clientele : un seul chiffre moyen ne
                        distingue pas trente petits paniers d'une grosse vente. */}
                    <Repartition titre={T.parTranche} unite={T.ventesCourt}
                        lignes={pa.tranches.filter(t => t.tickets > 0).map(t => ({
                            cle: `${t.libelle} ${currency}`,
                            ca: t.ca,
                            valeur: t.tickets,
                            poids: t.tickets,
                            detail: `${nf(t.ca)} ${currency} · ${nf(t.pieces)} ${T.piecesCourt}`,
                        }))} />

                    {/* La barre mesure la part des VENTES ; le chiffre a droite
                        est le panier moyen du canal. Additionner des moyennes
                        n'aurait aucun sens. */}
                    <Repartition titre={T.parCanal} unite={currency}
                        lignes={data.parCanal.map(c => ({
                            cle: c.canal,
                            ca: c.ca,
                            valeur: c.tickets > 0 ? c.ca / c.tickets : 0,
                            poids: c.tickets,
                            detail: `${nf(c.tickets)} ${T.ventesCourt} · ${nf(c.ca)} ${currency}`,
                        }))} />

                    {/* Le gros n'achete pas comme le detail : c'est la que se
                        decide une remise ou un minimum de commande. */}
                    <Repartition titre={T.parSegment} unite={currency}
                        lignes={data.parSegment.map(sg => ({
                            cle: sg.segment,
                            ca: sg.ca,
                            valeur: sg.tickets > 0 ? sg.ca / sg.tickets : 0,
                            poids: sg.tickets,
                            detail: `${nf(sg.tickets)} ${T.ventesCourt} · ${nf(sg.ca)} ${currency}`,
                        }))} />

                    <TableauJours colonnes={[T.panier, T.tickets, T.ca]}
                        lignes={joursPanier.map(j => {
                            const panierJour = j.tickets > 0 ? j.ca / j.tickets : 0;
                            // Deux fois la mediane, ou moitie moins : le seuil est
                            // volontairement large, on signale l'exception, pas la
                            // variation ordinaire d'un commerce.
                            const horsNorme = pa.mediane > 0 && j.tickets > 0
                                && (panierJour > pa.mediane * 2 || panierJour < pa.mediane / 2);
                            return {
                                jour: j.jour,
                                alerte: horsNorme ? T.horsNorme : undefined,
                                cellules: [`${nf(panierJour)} ${currency}`, nf(j.tickets), `${nf(j.ca)} ${currency}`],
                            };
                        })} />
                </PanneauDetail>
                );
            })()}
        </div>
    );
}
