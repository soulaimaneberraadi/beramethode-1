import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { tx } from '../../lib/i18n';
import PanneauDetail from './PanneauDetail';
import { teinteDe } from './articles';

/**
 * La fiche d'une valeur de vente : MAGASIN, GROS, ESPECES, la taille 42, le
 * vert emeraude, un modele.
 *
 * Le tableau de bord dit « MAGASIN = 100 % ». Il ne dit pas ce qui s'y vend,
 * quels jours, a qui, ni si cela monte. Chaque ligne de repartition ouvre
 * donc sa propre page, et chaque ligne de CETTE page en ouvre une autre : on
 * descend de « le magasin » a « la taille 42 au magasin » sans jamais taper
 * un filtre.
 *
 * Les feuilles s'empilent (`retour`), elles ne se remplacent pas : refermer
 * ramene a la question precedente, pas au tableau de bord.
 */

type Ligne = { cle: string; pieces: number; ca: number; tickets: number };
type LigneModele = Ligne & { nom: string; image: string | null };
type LigneClient = { id: string | null; nom: string; pieces: number; ca: number; tickets: number };

type Reponse = {
    axe: string;
    valeur: string;
    periode: { du: string; au: string };
    kpis: {
        ca: number; pieces: number; tickets: number; panierMoyen: number;
        piecesParVente: number; prixMoyenPiece: number; clients: number;
        piecesSansPrix: number; premiere: string | null; derniere: string | null;
    };
    part: { ca: number; pieces: number; tickets: number; caTotal: number };
    precedent: { du: string; au: string; ca: number; pieces: number; tickets: number };
    serie: Array<{ jour: string; ca: number; pieces: number; tickets: number }>;
    parJourSemaine: Array<{ jour: number; ca: number; pieces: number }>;
    axes: Record<string, Ligne[]>;
    modeles: LigneModele[];
    clients: LigneClient[];
};

export type AxeOuvert = {
    axe: 'canal' | 'segment' | 'paiement' | 'taille' | 'couleur' | 'modele' | 'client';
    valeur: string;
    /** Ce qu'on affiche en titre : le nom du modele, pas son identifiant. */
    titre?: string;
};

const nf = (n: number) => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 });

interface Props {
    ouvert: AxeOuvert;
    du: string;
    au: string;
    currency: string;
    lang: string;
    /** Les filtres de la page d'ou l'on vient : le detail doit repondre a la
     *  MEME question que le total sur lequel on a clique. */
    contexte?: { canal?: string; segment?: string; clientId?: string };
    onFermer: () => void;
    /** Le nom de l'ecran precedent quand la feuille est empilee. */
    retour?: string;
}

const AxeDetail: React.FC<Props> = ({ ouvert, du, au, currency, lang, contexte, onFermer, retour }) => {
    const [data, setData] = useState<Reponse | null>(null);
    const [chargement, setChargement] = useState(true);
    const [erreur, setErreur] = useState<string | null>(null);
    /** La feuille suivante, ouverte par-dessus celle-ci. */
    const [enfant, setEnfant] = useState<AxeOuvert | null>(null);

    const T = {
        ca: tx(lang, { fr: "Chiffre d'affaires", ar: 'رقم المعاملات', en: 'Revenue', es: 'Facturacion', pt: 'Faturacao', tr: 'Ciro' }),
        pieces: tx(lang, { fr: 'Pieces', ar: 'القطع', en: 'Items', es: 'Piezas', pt: 'Pecas', tr: 'Parca' }),
        ventes: tx(lang, { fr: 'Ventes', ar: 'البيعات', en: 'Sales', es: 'Ventas', pt: 'Vendas', tr: 'Satis' }),
        panier: tx(lang, { fr: 'Panier moyen', ar: 'معدّل السلّة', en: 'Average sale', es: 'Ticket medio', pt: 'Venda media', tr: 'Ortalama sepet' }),
        prixPiece: tx(lang, { fr: 'Prix moyen piece', ar: 'معدّل ثمن القطعة', en: 'Avg item price', es: 'Precio medio pieza', pt: 'Preco medio peca', tr: 'Ortalama parca fiyati' }),
        piecesParVente: tx(lang, { fr: 'Pieces / vente', ar: 'قطع/بيعة', en: 'Items / sale', es: 'Piezas / venta', pt: 'Pecas / venda', tr: 'Parca / satis' }),
        clients: tx(lang, { fr: 'Clients', ar: 'الزبناء', en: 'Customers', es: 'Clientes', pt: 'Clientes', tr: 'Musteriler' }),
        partDuTotal: tx(lang, { fr: 'Part du total', ar: 'الحصّة من المجموع', en: 'Share of total', es: 'Parte del total', pt: 'Parte do total', tr: 'Toplamdaki pay' }),
        versus: tx(lang, { fr: 'vs periode precedente', ar: 'مقارنة بالمدّة السابقة', en: 'vs previous period', es: 'vs periodo anterior', pt: 'vs periodo anterior', tr: 'onceki doneme gore' }),
        tendance: tx(lang, { fr: 'Tendance', ar: 'الاتّجاه', en: 'Trend', es: 'Tendencia', pt: 'Tendencia', tr: 'Egilim' }),
        rythme: tx(lang, { fr: 'Rythme de la semaine', ar: 'إيقاع الأسبوع', en: 'Weekly rhythm', es: 'Ritmo semanal', pt: 'Ritmo semanal', tr: 'Hafta ritmi' }),
        modeles: tx(lang, { fr: 'Modeles', ar: 'الموديلات', en: 'Models', es: 'Modelos', pt: 'Modelos', tr: 'Modeller' }),
        canal: tx(lang, { fr: 'Par canal', ar: 'حسب القناة', en: 'By channel', es: 'Por canal', pt: 'Por canal', tr: 'Kanala gore' }),
        segment: tx(lang, { fr: 'Par segment', ar: 'حسب الصنف', en: 'By segment', es: 'Por segmento', pt: 'Por segmento', tr: 'Segmente gore' }),
        paiement: tx(lang, { fr: 'Par reglement', ar: 'حسب الأداء', en: 'By payment', es: 'Por pago', pt: 'Por pagamento', tr: 'Odemeye gore' }),
        taille: tx(lang, { fr: 'Tailles', ar: 'المقاسات', en: 'Sizes', es: 'Tallas', pt: 'Tamanhos', tr: 'Bedenler' }),
        couleur: tx(lang, { fr: 'Couleurs', ar: 'الألوان', en: 'Colours', es: 'Colores', pt: 'Cores', tr: 'Renkler' }),
        rien: tx(lang, { fr: 'Aucun mouvement sur la periode.', ar: 'ما كاين حتى حركة فهاد المدّة.', en: 'No movement in this period.', es: 'Sin movimientos en el periodo.', pt: 'Sem movimentos no periodo.', tr: 'Bu donemde hareket yok.' }),
        chargement: tx(lang, { fr: 'Chargement…', ar: 'كيتحمّل…', en: 'Loading…', es: 'Cargando…', pt: 'A carregar…', tr: 'Yukleniyor…' }),
        nonRenseigne: tx(lang, { fr: 'Non renseigne', ar: 'غير محدّد', en: 'Not recorded', es: 'Sin indicar', pt: 'Nao indicado', tr: 'Belirtilmemis' }),
        piecesCourt: tx(lang, { fr: 'pcs', ar: 'قطعة', en: 'pcs', es: 'uds', pt: 'pcs', tr: 'adet' }),
        ventesCourt: tx(lang, { fr: 'ventes', ar: 'بيعة', en: 'sales', es: 'ventas', pt: 'vendas', tr: 'satis' }),
        sansPrix: tx(lang, {
            fr: 'pieces sorties sans prix : le chiffre est incomplet.',
            ar: 'قطع خرجات بلا ثمن: الرقم ناقص.',
            en: 'items released without a price: the figure is incomplete.',
            es: 'piezas sin precio: la cifra esta incompleta.',
            pt: 'pecas sem preco: o valor esta incompleto.',
            tr: 'fiyatsiz cikan parca: rakam eksik.',
        }),
        premiere: tx(lang, { fr: 'Premiere vente', ar: 'أوّل بيعة', en: 'First sale', es: 'Primera venta', pt: 'Primeira venda', tr: 'Ilk satis' }),
        derniere: tx(lang, { fr: 'Derniere vente', ar: 'آخر بيعة', en: 'Last sale', es: 'Ultima venta', pt: 'Ultima venda', tr: 'Son satis' }),
        joursSemaine: (lang === 'ar' ? ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] : ['Di', 'Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa']),
    };

    const titreAxe: Record<string, string> = {
        canal: T.canal, segment: T.segment, paiement: T.paiement,
        taille: T.taille, couleur: T.couleur, modele: T.modeles, client: T.clients,
    };

    const charger = useCallback(async () => {
        setChargement(true);
        setErreur(null);
        try {
            const p = new URLSearchParams({ axe: ouvert.axe, valeur: ouvert.valeur });
            if (du) p.set('du', du);
            if (au) p.set('au', au);
            if (contexte?.canal) p.set('canal', contexte.canal);
            if (contexte?.segment) p.set('segment', contexte.segment);
            if (contexte?.clientId) p.set('clientId', contexte.clientId);
            const res = await fetch(`/api/ventes/axe?${p.toString()}`, { credentials: 'include' });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
            setData(body as Reponse);
        } catch (e: any) {
            setData(null);
            setErreur(e?.message || String(e));
        } finally {
            setChargement(false);
        }
    }, [ouvert.axe, ouvert.valeur, du, au, contexte?.canal, contexte?.segment, contexte?.clientId]);

    useEffect(() => { void charger(); }, [charger]);

    const libelle = (v: string) => (v === 'NON_PRECISE' || v === '—' || !v ? T.nonRenseigne : v);
    const titre = ouvert.titre || libelle(ouvert.valeur);

    /** La courbe : la meme lecture que sur le tableau de bord, remplie a zero
     *  sur les jours sans vente — quatre barres sur trente jours ne sont pas
     *  une tendance. */
    const serieComplete = useMemo(() => {
        if (!data) return [] as Array<{ jour: string; ca: number; vide: boolean }>;
        const parJour = new Map(data.serie.map(x => [x.jour, x]));
        const out: Array<{ jour: string; ca: number; vide: boolean }> = [];
        const curseur = new Date(data.periode.du + 'T00:00:00');
        const stop = new Date(data.periode.au + 'T00:00:00');
        const p = (n: number) => String(n).padStart(2, '0');
        const iso = (d: Date) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
        let garde = 0;
        while (curseur <= stop && garde++ < 400) {
            const k = iso(curseur);
            const v = parJour.get(k);
            out.push({ jour: k, ca: v?.ca || 0, vide: !v });
            curseur.setDate(curseur.getDate() + 1);
        }
        return out;
    }, [data]);

    const Carte: React.FC<{ titre: string; droite?: React.ReactNode; children: React.ReactNode }> = ({ titre: t, droite, children }) => (
        <section className="border border-slate-200 dark:border-dk-border rounded-xl bg-white dark:bg-dk-surface overflow-hidden">
            <header className="h-9 px-3.5 flex items-center justify-between gap-2 border-b border-slate-100 dark:border-dk-border">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400 dark:text-dk-muted truncate">{t}</span>
                {droite}
            </header>
            {children}
        </section>
    );

    /** Une repartition dont CHAQUE ligne est un bouton : c'est la promesse de
     *  la page — aucun chiffre affiche n'est un cul-de-sac. */
    const Repartition: React.FC<{
        titre: string;
        lignes: Array<{ cle: string; libelle?: string; ca: number; detail: string; vignette?: React.ReactNode }>;
        axe: AxeOuvert['axe'] | null;
    }> = ({ titre: t, lignes, axe }) => {
        const total = lignes.reduce((a, l) => a + l.ca, 0);
        if (lignes.length === 0) return null;
        return (
            <Carte titre={t}>
                <div className="p-3.5 space-y-2.5">
                    {lignes.map(l => {
                        const part = total > 0 ? (l.ca / total) * 100 : 0;
                        const flou = l.cle === 'NON_PRECISE' || l.cle === '—';
                        const contenu = (
                            <>
                                <div className="flex items-center justify-between gap-2 text-[11px]">
                                    <span className="flex items-center gap-2 min-w-0">
                                        {l.vignette}
                                        <span className={`font-bold truncate ${flou ? 'text-slate-400 dark:text-dk-muted italic' : 'text-slate-700 dark:text-dk-text-soft'}`}>
                                            {l.libelle || libelle(l.cle)}
                                        </span>
                                    </span>
                                    <span className="shrink-0 tabular-nums">
                                        <span className="font-black text-slate-800 dark:text-dk-text">{nf(part)} %</span>
                                        <span className="ml-1.5 text-[10px] text-slate-400 dark:text-dk-muted">{nf(l.ca)} {currency}</span>
                                    </span>
                                </div>
                                <div className="h-1 rounded-full bg-slate-100 dark:bg-dk-elevated mt-1 overflow-hidden">
                                    <div className={`h-full rounded-full ${flou ? 'bg-slate-300 dark:bg-dk-border' : 'bg-slate-800 dark:bg-dk-accent'}`} style={{ width: `${Math.max(1.5, part)}%` }} />
                                </div>
                                <span className="block mt-0.5 text-[10px] text-slate-400 dark:text-dk-muted">{l.detail}</span>
                            </>
                        );
                        return axe ? (
                            <button key={l.cle} type="button" onClick={() => setEnfant({ axe, valeur: l.cle, titre: l.libelle })}
                                className="w-full text-left rounded-lg -mx-1 px-1 py-0.5 hover:bg-slate-50 dark:hover:bg-dk-elevated/50 active:scale-[0.995] transition">
                                {contenu}
                            </button>
                        ) : <div key={l.cle}>{contenu}</div>;
                    })}
                </div>
            </Carte>
        );
    };

    const Vignette: React.FC<{ image: string | null; nom: string }> = ({ image, nom }) => (
        image
            ? <img src={image} alt="" className="w-7 h-7 rounded-md object-cover border border-slate-200 dark:border-dk-border shrink-0" />
            : (
                <span className="w-7 h-7 rounded-md shrink-0 flex items-center justify-center bg-slate-100 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border text-[9px] font-black text-slate-400 dark:text-dk-muted">
                    {nom.slice(0, 2).toUpperCase()}
                </span>
            )
    );

    /** En descendant d'un cran, la valeur ouverte devient un FILTRE : depuis
     *  le magasin, la taille 42 doit rester « la taille 42 au magasin ». Sans
     *  cela le second ecran repartirait du total de la maison et le chiffre
     *  grossirait sans explication. */
    const contexteEnfant = useMemo(() => ({
        ...contexte,
        ...(ouvert.axe === 'canal' ? { canal: ouvert.valeur } : {}),
        ...(ouvert.axe === 'segment' ? { segment: ouvert.valeur } : {}),
        ...(ouvert.axe === 'client' ? { clientId: ouvert.valeur } : {}),
    }), [contexte, ouvert.axe, ouvert.valeur]);

    const delta = data && data.precedent.ca > 0
        ? ((data.kpis.ca - data.precedent.ca) / data.precedent.ca) * 100
        : null;

    const Chiffre: React.FC<{ titre: string; valeur: string; sous?: React.ReactNode }> = ({ titre: t, valeur, sous }) => (
        <div className="p-3">
            <p className="text-[9px] font-black uppercase tracking-[0.06em] text-slate-400 dark:text-dk-muted truncate">{t}</p>
            <p className="text-[15px] font-black tabular-nums text-slate-900 dark:text-dk-text mt-0.5">{valeur}</p>
            {sous && <p className="text-[10px] text-slate-400 dark:text-dk-muted mt-0.5">{sous}</p>}
        </div>
    );

    return (
        <>
            <PanneauDetail
                titre={`${titreAxe[ouvert.axe] || ''} · ${titre}`.replace(/^ · /, '')}
                valeur={data ? `${nf(data.kpis.ca)} ${currency}` : undefined}
                sous={data ? `${data.periode.du} → ${data.periode.au}` : undefined}
                retour={retour}
                onFermer={onFermer}
            >
                {chargement && <p className="text-[12px] text-slate-400 dark:text-dk-muted px-1 py-6 text-center">{T.chargement}</p>}

                {erreur && (
                    <p className="text-[12px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1.5 border border-rose-200 dark:border-rose-800/50 rounded-xl p-3 bg-rose-50/50 dark:bg-rose-950/20">
                        <AlertTriangle className="w-4 h-4" /> {erreur}
                    </p>
                )}

                {data && !chargement && (
                    <>
                        {/* Les chiffres qui situent la valeur : ce qu'elle pese
                            dans le total, et si elle monte. Sans eux, « 802 »
                            ne dit ni beaucoup ni peu. */}
                        <Carte titre={T.partDuTotal} droite={
                            delta == null ? undefined : (
                                <span className={`inline-flex items-center gap-0.5 text-[10px] font-black tabular-nums ${delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                    {delta >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                    {nf(Math.abs(delta))} % <span className="font-medium text-slate-400 dark:text-dk-muted">{T.versus}</span>
                                </span>
                            )
                        }>
                            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-slate-100 dark:divide-dk-border">
                                <Chiffre titre={T.ca} valeur={`${nf(data.kpis.ca)} ${currency}`} sous={`${nf(data.part.ca)} % ${T.partDuTotal.toLowerCase()}`} />
                                <Chiffre titre={T.pieces} valeur={nf(data.kpis.pieces)} sous={`${nf(data.part.pieces)} %`} />
                                <Chiffre titre={T.ventes} valeur={nf(data.kpis.tickets)} sous={`${nf(data.part.tickets)} %`} />
                                <Chiffre titre={T.panier} valeur={`${nf(data.kpis.panierMoyen)} ${currency}`} sous={`${nf(data.kpis.piecesParVente)} ${T.piecesCourt}/${T.ventesCourt}`} />
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-slate-100 dark:border-dk-border divide-x divide-y sm:divide-y-0 divide-slate-100 dark:divide-dk-border">
                                <Chiffre titre={T.prixPiece} valeur={`${nf(data.kpis.prixMoyenPiece)} ${currency}`} />
                                <Chiffre titre={T.clients} valeur={nf(data.kpis.clients)} />
                                <Chiffre titre={T.premiere} valeur={data.kpis.premiere ? `${data.kpis.premiere.slice(8, 10)}/${data.kpis.premiere.slice(5, 7)}` : '—'} />
                                <Chiffre titre={T.derniere} valeur={data.kpis.derniere ? `${data.kpis.derniere.slice(8, 10)}/${data.kpis.derniere.slice(5, 7)}` : '—'} />
                            </div>
                            {/* Des pieces sorties sans prix : le total affiche est
                                alors plus bas que la realite, il faut le dire. */}
                            {data.kpis.piecesSansPrix > 0 && (
                                <p className="flex items-start gap-1.5 m-3 mt-0 text-[10px] text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50 bg-amber-50/70 dark:bg-amber-950/20 rounded-lg px-2.5 py-1.5">
                                    <AlertTriangle className="w-3 h-3 shrink-0 mt-px" />
                                    {nf(data.kpis.piecesSansPrix)} {T.sansPrix}
                                </p>
                            )}
                        </Carte>

                        <Carte titre={T.tendance}>
                            <div className="p-3.5">
                                {serieComplete.length === 0 ? (
                                    <p className="text-[11px] text-slate-400 dark:text-dk-muted">{T.rien}</p>
                                ) : (
                                    <>
                                        <div className="flex items-end gap-[2px] h-20 sm:h-24">
                                            {(() => {
                                                const max = Math.max(...serieComplete.map(x => x.ca), 1);
                                                return serieComplete.map(pt => (
                                                    <div key={pt.jour}
                                                        title={pt.vide ? `${pt.jour} · —` : `${pt.jour} · ${nf(pt.ca)} ${currency}`}
                                                        className={`flex-1 min-w-[2px] max-w-[22px] rounded-t ${pt.vide ? 'bg-slate-100 dark:bg-dk-elevated' : 'bg-slate-800 dark:bg-dk-accent'}`}
                                                        style={{ height: `${pt.vide ? 2 : Math.max(4, (pt.ca / max) * 100)}%` }} />
                                                ));
                                            })()}
                                        </div>
                                        <div className="flex items-center justify-between mt-1.5 text-[10px] text-slate-400 dark:text-dk-muted tabular-nums">
                                            <span>{serieComplete[0]?.jour}</span>
                                            <span>{serieComplete[serieComplete.length - 1]?.jour}</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        </Carte>

                        {/* Le rythme : une boutique qui ne vend que le samedi ne
                            s'organise pas comme une vente en ligne continue. */}
                        <Carte titre={T.rythme}>
                            <div className="p-3.5">
                                <div className="flex items-end justify-between gap-1.5 h-20">
                                    {[1, 2, 3, 4, 5, 6, 0].map(n => {
                                        const j = data.parJourSemaine.find(x => x.jour === n);
                                        const max = Math.max(...data.parJourSemaine.map(x => x.ca), 1);
                                        return (
                                            <div key={n} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                                                <div className="w-full flex-1 flex items-end">
                                                    <div className="w-full rounded-t bg-slate-800 dark:bg-dk-accent" title={j ? `${nf(j.ca)} ${currency}` : '—'}
                                                        style={{ height: `${j ? Math.max(3, (j.ca / max) * 100) : 2}%` }} />
                                                </div>
                                                <span className="text-[9px] font-bold text-slate-400 dark:text-dk-muted">{T.joursSemaine[n]}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </Carte>

                        {data.modeles.length > 0 && (
                            <Repartition titre={T.modeles} axe="modele"
                                lignes={data.modeles.map(m => ({
                                    cle: m.cle, libelle: m.nom, ca: m.ca,
                                    vignette: <Vignette image={m.image} nom={m.nom} />,
                                    detail: `${nf(m.pieces)} ${T.piecesCourt} · ${nf(m.tickets)} ${T.ventesCourt}`,
                                }))} />
                        )}

                        {(['canal', 'segment', 'paiement', 'taille', 'couleur'] as const).map(k => (
                            <Repartition key={k} titre={titreAxe[k]} axe={k}
                                lignes={(data.axes[k] || []).map(l => ({
                                    cle: l.cle, ca: l.ca,
                                    vignette: k === 'couleur' ? (
                                        <span className="w-3.5 h-3.5 rounded-full shrink-0 border border-slate-300 dark:border-dk-border"
                                            style={{ background: teinteDe(l.cle) || 'transparent' }} />
                                    ) : k === 'taille' ? (
                                        <span className="min-w-[26px] h-5 px-1.5 shrink-0 inline-flex items-center justify-center rounded-md bg-slate-100 dark:bg-dk-elevated border border-slate-200 dark:border-dk-border text-[9px] font-black uppercase text-slate-500 dark:text-dk-muted">
                                            {l.cle}
                                        </span>
                                    ) : undefined,
                                    detail: `${nf(l.pieces)} ${T.piecesCourt} · ${nf(l.tickets)} ${T.ventesCourt}`,
                                }))} />
                        ))}

                        {data.clients.length > 0 && (
                            <Repartition titre={T.clients} axe={null}
                                lignes={data.clients.map(c => ({
                                    cle: c.id || c.nom, libelle: c.nom, ca: c.ca,
                                    detail: `${nf(c.pieces)} ${T.piecesCourt} · ${nf(c.tickets)} ${T.ventesCourt}`,
                                }))} />
                        )}
                    </>
                )}
            </PanneauDetail>

            {/* La feuille suivante, empilee : « la taille 42 AU MAGASIN ». */}
            {enfant && (
                <AxeDetail
                    ouvert={enfant}
                    du={du}
                    au={au}
                    currency={currency}
                    lang={lang}
                    contexte={contexteEnfant}
                    retour={titre}
                    onFermer={() => setEnfant(null)}
                />
            )}
        </>
    );
};

export default AxeDetail;
