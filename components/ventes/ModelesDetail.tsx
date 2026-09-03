import React, { useMemo, useState } from 'react';
import { Search, AlertTriangle } from 'lucide-react';
import { tx } from '../../lib/i18n';
import PanneauDetail from './PanneauDetail';
import AxeDetail, { AxeOuvert } from './AxeDetail';
import { Carte, Vignette, nf } from './ui';

/**
 * La page des modeles.
 *
 * Le tableau de bord en montre une liste courte, triee par chiffre. Cette
 * page repond aux questions qu'on se pose devant cette liste :
 *   - lesquels marchent (top 10) et lesquels dorment,
 *   - lesquels ne sont qu'un ESSAI (une petite serie, trop jeune pour etre
 *     jugee) — les compter dans les « morts » serait une erreur de lecture,
 *   - lesquels se vendent mieux a un endroit qu'a un autre,
 *   - ceux d'un sous-traitant, ceux d'un donneur d'ordre, ceux d'une saison.
 *
 * Aucun chiffre n'est recalcule ici : tout vient du tableau de bord, donc
 * de la meme periode et des memes filtres. Deux ecrans qui affichent deux
 * totaux differents pour la meme question, c'est de l'argent perdu.
 */

export type ModeleLigne = {
    modelId: string; nom: string; reference: string | null; image: string | null;
    canaux: Array<{ canal: string; pieces: number; ca: number }>;
    canalFort: string | null; partCanalFort: number | null;
    produit: number; vendu: number; stock: number;
    piecesPeriode: number; caPeriode: number; ticketsPeriode: number;
    ageJours: number | null; ecoule: number; parJour: number;
    joursAvantRupture: number | null;
    statut: 'TOP' | 'OK' | 'LENT' | 'MORT' | 'NEUF';
    soustraitants?: string[];
    donneurs?: string[];
};

const TEINTE: Record<ModeleLigne['statut'], string> = {
    TOP: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800/50',
    OK: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-dk-elevated dark:text-dk-muted dark:border-dk-border',
    LENT: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800/50',
    MORT: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800/50',
    NEUF: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-800/50',
};

/** Une petite serie, encore jeune : c'est un ESSAI, pas un echec. Le dire
 *  evite de solder un modele qu'on vient a peine de mettre en rayon. */
const SEUIL_ESSAI_PIECES = 30;
const SEUIL_ESSAI_JOURS = 21;
const estEssai = (m: ModeleLigne) => m.produit > 0 && m.produit <= SEUIL_ESSAI_PIECES
    && (m.ageJours == null || m.ageJours <= SEUIL_ESSAI_JOURS);

type TextesLigne = { stock: string; jours: string; parJour: string; essai: string; essaiInfo: string };

/** Une ligne de modele : la photo, l'etat, ce qui se vend, et ce qu'il en
 *  reste. Definie ici et non dans la page : un composant declare dans le
 *  corps de son parent est remonte a chaque frappe. */
const LigneModele: React.FC<{
    m: ModeleLigne;
    rang?: number;
    devise: string;
    textes: TextesLigne;
    onOuvrir: (m: ModeleLigne) => void;
}> = ({ m, rang, devise, textes, onOuvrir }) => (
    <button
        type="button"
        onClick={() => onOuvrir(m)}
        className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-slate-50/70 dark:hover:bg-dk-elevated/40 active:scale-[0.997] transition"
    >
        {rang != null && (
            <span className="w-5 shrink-0 text-[11px] font-black tabular-nums text-slate-300 dark:text-dk-muted">{rang}</span>
        )}
        <Vignette image={m.image} nom={m.nom} taille="w-9 h-9" />
        <div className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 min-w-0">
                <span className="text-[12px] font-bold text-slate-800 dark:text-dk-text truncate">{m.nom}</span>
                <span className={`shrink-0 px-1.5 py-px rounded-full text-[9px] font-black border ${TEINTE[m.statut]}`}>{m.statut}</span>
                {estEssai(m) && (
                    <span title={textes.essaiInfo} className="shrink-0 px-1.5 py-px rounded-full text-[9px] font-black border bg-slate-50 text-slate-500 border-slate-200 dark:bg-dk-elevated dark:text-dk-muted dark:border-dk-border">
                        {textes.essai}
                    </span>
                )}
            </span>
            <span className="block text-[10px] text-slate-400 dark:text-dk-muted truncate">
                {[
                    `${nf(m.piecesPeriode)} pcs`,
                    `${nf(m.parJour)}${textes.parJour}`,
                    m.canalFort ? `${m.canalFort} ${nf(m.partCanalFort || 0)} %` : null,
                    (m.soustraitants || [])[0] || null,
                ].filter(Boolean).join(' · ')}
            </span>
        </div>
        <div className="text-right shrink-0">
            <span className="block text-[12px] font-black tabular-nums text-slate-900 dark:text-dk-text">{nf(m.caPeriode)} {devise}</span>
            <span className={`block text-[10px] font-bold tabular-nums ${m.joursAvantRupture != null && m.joursAvantRupture <= 14
                ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-dk-muted'}`}>
                {textes.stock} {nf(m.stock)}
                {m.joursAvantRupture != null ? ` · ${nf(m.joursAvantRupture)} ${textes.jours}` : ''}
            </span>
        </div>
    </button>
);

interface Props {
    modeles: ModeleLigne[];
    du: string;
    au: string;
    periode?: string;
    currency: string;
    lang: string;
    contexte?: { canal?: string; segment?: string; clientId?: string };
    onFermer: () => void;
}

const ModelesDetail: React.FC<Props> = ({ modeles, du, au, periode, currency, lang, contexte, onFermer }) => {
    const [recherche, setRecherche] = useState('');
    const [statut, setStatut] = useState<'TOUS' | ModeleLigne['statut'] | 'ESSAI'>('TOUS');
    const [tri, setTri] = useState<'ca' | 'pieces' | 'vitesse' | 'ecoule' | 'rupture' | 'stock'>('ca');
    const [soustraitant, setSoustraitant] = useState('');
    const [donneur, setDonneur] = useState('');
    const [ouvert, setOuvert] = useState<AxeOuvert | null>(null);

    const T = {
        titre: tx(lang, { fr: 'Modeles', ar: 'الموديلات', en: 'Models', es: 'Modelos', pt: 'Modelos', tr: 'Modeller' }),
        chercher: tx(lang, { fr: 'Chercher un modele…', ar: 'قلّب على موديل…', en: 'Search a model…', es: 'Buscar modelo…', pt: 'Procurar modelo…', tr: 'Model ara…' }),
        tous: tx(lang, { fr: 'Tous', ar: 'الكل', en: 'All', es: 'Todos', pt: 'Todos', tr: 'Hepsi' }),
        essai: tx(lang, { fr: 'Essais', ar: 'تجارب', en: 'Trials', es: 'Pruebas', pt: 'Testes', tr: 'Deneme' }),
        top: tx(lang, { fr: 'Top 10', ar: 'أحسن 10', en: 'Top 10', es: 'Top 10', pt: 'Top 10', tr: 'Ilk 10' }),
        ou: tx(lang, { fr: 'Ou se vend quoi', ar: 'شنو كيتباع فين', en: 'What sells where', es: 'Que se vende donde', pt: 'O que vende onde', tr: 'Ne nerede satiyor' }),
        liste: tx(lang, { fr: 'Tous les modeles', ar: 'كل الموديلات', en: 'All models', es: 'Todos los modelos', pt: 'Todos os modelos', tr: 'Tum modeller' }),
        trierPar: tx(lang, { fr: 'Trier', ar: 'رتّب', en: 'Sort', es: 'Ordenar', pt: 'Ordenar', tr: 'Sirala' }),
        ca: tx(lang, { fr: "Chiffre", ar: 'المداخيل', en: 'Revenue', es: 'Facturacion', pt: 'Faturacao', tr: 'Ciro' }),
        pieces: tx(lang, { fr: 'Pieces', ar: 'القطع', en: 'Items', es: 'Piezas', pt: 'Pecas', tr: 'Parca' }),
        vitesse: tx(lang, { fr: 'Vitesse', ar: 'السرعة', en: 'Speed', es: 'Velocidad', pt: 'Velocidade', tr: 'Hiz' }),
        ecoule: tx(lang, { fr: 'Ecoule', ar: 'اللي تباع', en: 'Sold through', es: 'Vendido', pt: 'Vendido', tr: 'Satilan' }),
        rupture: tx(lang, { fr: 'Rupture', ar: 'النفاد', en: 'Stock-out', es: 'Rotura', pt: 'Rutura', tr: 'Tukenme' }),
        stock: tx(lang, { fr: 'Stock', ar: 'المخزون', en: 'Stock', es: 'Stock', pt: 'Stock', tr: 'Stok' }),
        jours: tx(lang, { fr: 'jours', ar: 'يوم', en: 'days', es: 'dias', pt: 'dias', tr: 'gun' }),
        parJour: tx(lang, { fr: '/jour', ar: '/يوم', en: '/day', es: '/dia', pt: '/dia', tr: '/gun' }),
        sousTraitant: tx(lang, { fr: 'Sous-traitant', ar: 'المناول', en: 'Subcontractor', es: 'Subcontratista', pt: 'Subcontratado', tr: 'Fasoncu' }),
        donneur: tx(lang, { fr: "Donneur d'ordre", ar: 'صاحب الطلبية', en: 'Ordering client', es: 'Cliente', pt: 'Cliente', tr: 'Siparis veren' }),
        rien: tx(lang, { fr: 'Aucun modele.', ar: 'ما كاين حتى موديل.', en: 'No model.', es: 'Ningun modelo.', pt: 'Nenhum modelo.', tr: 'Model yok.' }),
        maison: tx(lang, { fr: 'moyenne maison', ar: 'معدّل الدار', en: 'house average', es: 'media casa', pt: 'media da casa', tr: 'ev ortalamasi' }),
        essaiInfo: tx(lang, {
            fr: 'Petite serie, encore jeune : un essai ne se juge pas comme une collection.',
            ar: 'سلسلة صغيرة وحديثة: التجربة ما كتّحاسبش بحال مجموعة كاملة.',
            en: 'Small, recent run: a trial is not judged like a collection.',
            es: 'Serie pequena y reciente: una prueba no se juzga como una coleccion.',
            pt: 'Serie pequena e recente: um teste nao se julga como uma colecao.',
            tr: 'Kucuk ve yeni parti: deneme, koleksiyon gibi degerlendirilmez.',
        }),
        ouInfo: tx(lang, {
            fr: 'Ces modeles ne se vendent pas la ou la maison vend : leur canal dominant s ecarte de la moyenne.',
            ar: 'هاد الموديلات ما كيتباعوش فين كتبيع الدار: القناة الغالبة ديالهم بعيدة على المعدّل.',
            en: 'These models do not sell where the house sells: their dominant channel departs from the average.',
            es: 'Estos modelos no se venden donde vende la casa.',
            pt: 'Estes modelos nao vendem onde a casa vende.',
            tr: 'Bu modeller evin sattigi yerde satmiyor.',
        }),
    };

    const listeSoustraitants = useMemo(
        () => [...new Set(modeles.flatMap(m => m.soustraitants || []))].sort(),
        [modeles],
    );
    const listeDonneurs = useMemo(
        () => [...new Set(modeles.flatMap(m => m.donneurs || []))].sort(),
        [modeles],
    );

    const filtres = useMemo(() => {
        const q = recherche.trim().toLowerCase();
        const out = modeles.filter(m => {
            if (statut === 'ESSAI' ? !estEssai(m) : statut !== 'TOUS' && m.statut !== statut) return false;
            if (soustraitant && !(m.soustraitants || []).includes(soustraitant)) return false;
            if (donneur && !(m.donneurs || []).includes(donneur)) return false;
            if (!q) return true;
            return `${m.nom} ${m.reference || ''}`.toLowerCase().includes(q);
        });
        const cle = (m: ModeleLigne) => ({
            ca: m.caPeriode, pieces: m.piecesPeriode, vitesse: m.parJour,
            ecoule: m.ecoule, stock: m.stock,
            // Une rupture proche passe DEVANT : c'est la seule colonne ou le
            // petit chiffre est l'urgence.
            rupture: m.joursAvantRupture == null ? Number.MAX_SAFE_INTEGER : m.joursAvantRupture,
        }[tri]);
        return out.sort((a, b) => (tri === 'rupture' ? cle(a) - cle(b) : cle(b) - cle(a)));
    }, [modeles, recherche, statut, tri, soustraitant, donneur]);

    /** Ou la maison vend, tous modeles confondus : c'est la reference contre
     *  laquelle un modele « se vend mieux ailleurs ». */
    const partMaison = useMemo(() => {
        const total = new Map<string, number>();
        let somme = 0;
        for (const m of modeles) for (const c of m.canaux || []) {
            total.set(c.canal, (total.get(c.canal) || 0) + c.pieces);
            somme += c.pieces;
        }
        const out = new Map<string, number>();
        for (const [k, v] of total) out.set(k, somme > 0 ? (v / somme) * 100 : 0);
        return out;
    }, [modeles]);

    /** Les modeles dont le canal dominant s'ecarte nettement de la maison :
     *  20 points d'ecart, sur au moins quelques pieces — en dessous, c'est du
     *  bruit, et deplacer un stock sur du bruit coute de l'argent. */
    const ecarts = useMemo(() => (
        modeles
            .filter(m => m.canalFort && m.partCanalFort != null && m.piecesPeriode >= 3)
            .map(m => ({ m, ecart: (m.partCanalFort || 0) - (partMaison.get(m.canalFort as string) || 0) }))
            .filter(x => x.ecart >= 20)
            .sort((a, b) => b.ecart - a.ecart)
            .slice(0, 8)
    ), [modeles, partMaison]);

    const textesLigne = { stock: T.stock, jours: T.jours, parJour: T.parJour, essai: T.essai, essaiInfo: T.essaiInfo };
    const ouvrirModele = (m: ModeleLigne) => setOuvert({ axe: 'modele', valeur: m.modelId, titre: m.nom });
    const puce = (actif: boolean) => `px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${actif
        ? 'bg-slate-900 dark:bg-dk-accent text-white border-transparent'
        : 'bg-white dark:bg-dk-surface text-slate-500 dark:text-dk-muted border-slate-200 dark:border-dk-border'}`;

    return (
        <>
            <PanneauDetail
                titre={T.titre}
                valeur={`${nf(filtres.length)} / ${nf(modeles.length)}`}
                sous={periode}
                onFermer={onFermer}
                barre={
                    <div className="space-y-2">
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={recherche}
                                onChange={e => setRecherche(e.target.value)}
                                placeholder={T.chercher}
                                className="w-full h-9 pl-8 pr-3 rounded-lg bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border text-[12px] text-slate-700 dark:text-dk-text placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-slate-200 dark:focus:ring-dk-border"
                            />
                        </div>
                        {/* Les filtres defilent lateralement plutot que de
                            passer a la ligne : sur telephone, quatre rangees de
                            puces mangent l'ecran avant le premier chiffre. */}
                        <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-0.5 px-0.5">
                            {(['TOUS', 'TOP', 'OK', 'LENT', 'MORT', 'NEUF', 'ESSAI'] as const).map(k => (
                                <button key={k} onClick={() => setStatut(k)} className={`${puce(statut === k)} shrink-0`}>
                                    {k === 'TOUS' ? T.tous : k === 'ESSAI' ? T.essai : k}
                                </button>
                            ))}
                        </div>
                        <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-0.5 px-0.5">
                            {([['ca', T.ca], ['pieces', T.pieces], ['vitesse', T.vitesse], ['ecoule', T.ecoule], ['rupture', T.rupture], ['stock', T.stock]] as const).map(([k, t]) => (
                                <button key={k} onClick={() => setTri(k)} className={`${puce(tri === k)} shrink-0`}>{t}</button>
                            ))}
                        </div>
                        {(listeSoustraitants.length > 0 || listeDonneurs.length > 0) && (
                            <div className="flex gap-1.5">
                                {listeSoustraitants.length > 0 && (
                                    <select value={soustraitant} onChange={e => setSoustraitant(e.target.value)}
                                        className="h-8 flex-1 min-w-0 px-2 rounded-lg bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border text-[11px] font-bold text-slate-600 dark:text-dk-text-soft outline-none">
                                        <option value="">{T.sousTraitant} · {T.tous}</option>
                                        {listeSoustraitants.map(v => <option key={v} value={v}>{v}</option>)}
                                    </select>
                                )}
                                {listeDonneurs.length > 0 && (
                                    <select value={donneur} onChange={e => setDonneur(e.target.value)}
                                        className="h-8 flex-1 min-w-0 px-2 rounded-lg bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border text-[11px] font-bold text-slate-600 dark:text-dk-text-soft outline-none">
                                        <option value="">{T.donneur} · {T.tous}</option>
                                        {listeDonneurs.map(v => <option key={v} value={v}>{v}</option>)}
                                    </select>
                                )}
                            </div>
                        )}
                    </div>
                }
            >
                {filtres.length === 0 && (
                    <p className="text-[12px] text-slate-400 dark:text-dk-muted text-center py-8">{T.rien}</p>
                )}

                {filtres.length > 0 && (
                    <Carte titre={T.top}>
                        <div className="divide-y divide-slate-100 dark:divide-dk-border">
                            {filtres.slice(0, 10).map((m, i) => <LigneModele key={m.modelId} m={m} rang={i + 1} devise={currency} textes={textesLigne} onOuvrir={ouvrirModele} />)}
                        </div>
                    </Carte>
                )}

                {/* Ou se vend quoi : c'est ce tableau qui fait deplacer un
                    stock d'un point de vente a l'autre. */}
                {ecarts.length > 0 && (
                    <Carte titre={T.ou}>
                        <p className="px-3.5 pt-2.5 text-[10px] text-slate-400 dark:text-dk-muted">{T.ouInfo}</p>
                        <div className="p-3.5 space-y-2.5">
                            {ecarts.map(({ m, ecart }) => (
                                <button key={m.modelId} type="button"
                                    onClick={() => setOuvert({ axe: 'modele', valeur: m.modelId, titre: m.nom })}
                                    className="w-full text-left rounded-lg -mx-1 px-1 py-0.5 hover:bg-slate-50 dark:hover:bg-dk-elevated/50 transition">
                                    <div className="flex items-center justify-between gap-2 text-[11px]">
                                        <span className="flex items-center gap-2 min-w-0">
                                            <Vignette image={m.image} nom={m.nom} taille="w-9 h-9" />
                                            <span className="min-w-0">
                                                <span className="block font-bold text-slate-700 dark:text-dk-text-soft truncate">{m.nom}</span>
                                                <span className="block text-[10px] text-slate-400 dark:text-dk-muted truncate">
                                                    {m.canalFort} {nf(m.partCanalFort || 0)} % · {T.maison} {nf(partMaison.get(m.canalFort as string) || 0)} %
                                                </span>
                                            </span>
                                        </span>
                                        <span className="shrink-0 tabular-nums font-black text-emerald-600 dark:text-emerald-400">+{nf(ecart)} pts</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </Carte>
                )}

                {filtres.length > 10 && (
                    <Carte titre={T.liste} droite={<span className="text-[10px] tabular-nums text-slate-400 dark:text-dk-muted">{nf(filtres.length)}</span>}>
                        <div className="divide-y divide-slate-100 dark:divide-dk-border">
                            {filtres.map(m => <LigneModele key={m.modelId} m={m} devise={currency} textes={textesLigne} onOuvrir={ouvrirModele} />)}
                        </div>
                    </Carte>
                )}

                {statut === 'ESSAI' && (
                    <p className="flex items-start gap-1.5 text-[10px] text-slate-500 dark:text-dk-muted border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface rounded-lg px-2.5 py-1.5">
                        <AlertTriangle className="w-3 h-3 shrink-0 mt-px" />
                        {T.essaiInfo}
                    </p>
                )}
            </PanneauDetail>

            {ouvert && (
                <AxeDetail
                    ouvert={ouvert}
                    du={du}
                    au={au}
                    currency={currency}
                    lang={lang}
                    contexte={contexte}
                    retour={T.titre}
                    onFermer={() => setOuvert(null)}
                />
            )}
        </>
    );
};

export default ModelesDetail;
