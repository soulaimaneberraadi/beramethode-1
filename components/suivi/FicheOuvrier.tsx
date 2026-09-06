import React, { useMemo } from 'react';
import type { ModelData, PlanningEvent, PosteSuiviData } from '../../types';
import { tx } from '../../lib/i18n';
import { useLang } from '../../src/context/LanguageContext';
import { X, User } from 'lucide-react';

/**
 * Fiche d'un ouvrier : tout ce qu'il a tenu, et ce qu'il y a donne.
 *
 * Le releve savait deja qui produisait quoi, mais ne le rendait jamais par
 * personne : pour savoir si Fatima tient mieux l'assemblage que la coupe, il
 * fallait relire la semaine poste par poste. Deux lectures ici :
 *   — la semaine en cours sur le modele ouvert, jour par jour ;
 *   — tous les postes qu'il a tenus, tous modeles et toutes chaines confondus.
 *
 * Aucune donnee n'est recalculee autrement qu'ailleurs : le score vient de la
 * meme fonction que la page (passee en prop), pour qu'une note ne puisse pas
 * dire deux choses selon l'endroit ou on la lit.
 */

const L = {
    titre: { fr: 'Fiche ouvrier', ar: 'بطاقة العامل', en: 'Worker sheet', es: 'Ficha del operario', pt: 'Ficha do operario', tr: 'Isci karti' },
    fermer: { fr: 'Fermer', ar: 'إغلاق', en: 'Close', es: 'Cerrar', pt: 'Fechar', tr: 'Kapat' },
    semaine: { fr: 'Cette semaine — modele ouvert', ar: 'هاد السيمانة — الموديل المفتوح', en: 'This week — open model', es: 'Esta semana — modelo abierto', pt: 'Esta semana — modelo aberto', tr: 'Bu hafta — acik model' },
    semaineVide: { fr: 'Rien de releve cette semaine sur ce modele.', ar: 'ما كاين حتى تسجيل هاد السيمانة فهاد الموديل.', en: 'Nothing recorded this week on this model.', es: 'Nada registrado esta semana en este modelo.', pt: 'Nada registado esta semana neste modelo.', tr: 'Bu hafta bu modelde kayit yok.' },
    historique: { fr: 'Tous les postes tenus — tous modeles, toutes chaines', ar: 'كل المناصب اللي شدّ — كل الموديلات وكل الشِّين', en: 'All postes held — every model, every line', es: 'Todos los puestos ocupados — todos los modelos y lineas', pt: 'Todos os postos ocupados — todos os modelos e linhas', tr: 'Tutulan tum istasyonlar — tum modeller ve hatlar' },
    historiqueVide: { fr: 'Aucun releve pour cet ouvrier.', ar: 'ما كاين حتى تسجيل لهاد العامل.', en: 'No entry for this worker.', es: 'Ningun registro para este operario.', pt: 'Nenhum registo para este operario.', tr: 'Bu isci icin kayit yok.' },
    poste: { fr: 'Poste', ar: 'المنصب', en: 'Poste', es: 'Puesto', pt: 'Posto', tr: 'Istasyon' },
    modele: { fr: 'Modele', ar: 'الموديل', en: 'Model', es: 'Modelo', pt: 'Modelo', tr: 'Model' },
    chaine: { fr: 'Chaine', ar: 'السلسلة', en: 'Line', es: 'Linea', pt: 'Linha', tr: 'Hat' },
    jours: { fr: 'Jours', ar: 'أيام', en: 'Days', es: 'Dias', pt: 'Dias', tr: 'Gun' },
    pieces: { fr: 'Pieces', ar: 'القطع', en: 'Pieces', es: 'Piezas', pt: 'Pecas', tr: 'Parca' },
    score: { fr: 'Score', ar: 'النتيجة', en: 'Score', es: 'Puntuacion', pt: 'Pontuacao', tr: 'Puan' },
    total: { fr: 'Total', ar: 'المجموع', en: 'Total', es: 'Total', pt: 'Total', tr: 'Toplam' },
    dernier: { fr: 'Dernier jour', ar: 'آخر يوم', en: 'Last day', es: 'Ultimo dia', pt: 'Ultimo dia', tr: 'Son gun' },
    piecesSemaine: { fr: 'Pieces cette semaine', ar: 'قطع هاد السيمانة', en: 'Pieces this week', es: 'Piezas esta semana', pt: 'Pecas esta semana', tr: 'Bu hafta parca' },
    piecesTotal: { fr: 'Pieces au total', ar: 'مجموع القطع', en: 'Pieces overall', es: 'Piezas en total', pt: 'Pecas no total', tr: 'Toplam parca' },
    scoreMoyen: { fr: 'Score moyen', ar: 'معدّل النتيجة', en: 'Average score', es: 'Puntuacion media', pt: 'Pontuacao media', tr: 'Ortalama puan' },
    postesTenus: { fr: 'Postes tenus', ar: 'مناصب مشغولة', en: 'Postes held', es: 'Puestos ocupados', pt: 'Postos ocupados', tr: 'Tutulan istasyon' },
    estime: { fr: 'Score deduit de la quantite (aucun chronometrage)', ar: 'نتيجة مستنتجة من الكمية (بلا كرونومتراج)', en: 'Score derived from quantity (no timing)', es: 'Puntuacion deducida de la cantidad (sin cronometraje)', pt: 'Pontuacao deduzida da quantidade (sem cronometragem)', tr: 'Miktardan cikarilan puan (olcum yok)' },
};

const JOURS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];

interface Props {
    workerId: string;
    workerName: string;
    /** Tout l'historique charge, pas seulement le jour affiche. */
    posteSuivis: PosteSuiviData[];
    models: ModelData[];
    planningEvents: PlanningEvent[];
    /** Modele ouvert dans la page : c'est lui que detaille le tableau de la semaine. */
    activeModelId?: string;
    /** Jour affiche : donne la semaine (lundi → dimanche). */
    date: string;
    scoreReleve: (r: PosteSuiviData) => number | null;
    classeScore: (score: number) => string;
    onClose: () => void;
}

export default function FicheOuvrier({
    workerId, workerName, posteSuivis, models, planningEvents,
    activeModelId, date, scoreReleve, classeScore, onClose,
}: Props) {
    const { lang } = useLang();

    /** Tous les releves de cet ouvrier, du plus recent au plus ancien. */
    /* Deux facons d'identifier un ouvrier : sa fiche RH, ou — quand le fichier RH
       ne le connait pas encore — le nom tape au pied de la chaine. La fiche doit
       s'ouvrir dans les deux cas, sinon les releves d'un ouvrier sans dossier
       n'auraient nulle part ou se lire. */
    const releves = useMemo(() => {
        const parNom = workerId.startsWith('nom:');
        const cible = parNom ? workerId.slice(4).trim().toLowerCase() : String(workerId);
        return posteSuivis
            .filter(r => parNom
                ? (r.workerName || '').trim().toLowerCase() === cible
                : String(r.workerId || '') === cible)
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    }, [posteSuivis, workerId]);

    /** Bornes de la semaine du jour affiche : lundi → dimanche. */
    const semaine = useMemo(() => {
        const ref = new Date(date);
        const dow = ref.getDay() === 0 ? 7 : ref.getDay();
        const lundi = new Date(ref);
        lundi.setDate(ref.getDate() - (dow - 1));
        return Array.from({ length: 7 }, (_, i) => {
            const j = new Date(lundi);
            j.setDate(lundi.getDate() + i);
            return j.toISOString().split('T')[0];
        });
    }, [date]);

    const libellePoste = (modelId: string, posteId: string): string => {
        /* Les postes du releve vivent desormais a part de la gamme : on cherche
           dans les deux, sinon un poste cree au pied de la chaine s'afficherait
           ici sous son identifiant technique. */
        const m = models.find(x => x.id === modelId);
        const op = (m?.suiviPostes || []).find(o => o.id === posteId)
            || (m?.gamme_operatoire || []).find(o => o.id === posteId);
        return op?.description || posteId;
    };
    const nomModele = (modelId: string): string => {
        const m = models.find(x => x.id === modelId);
        return m?.meta_data?.nom_modele || m?.meta_data?.reference || modelId;
    };
    const chaineDe = (planningId: string): string =>
        planningEvents.find(p => p.id === planningId)?.chaineId || '—';

    /* Tableau de la semaine : un poste par ligne, un jour par colonne. Seuls les
       postes que l'ouvrier a REELLEMENT tenus sur ce modele apparaissent — lister
       toute la gamme remplirait l'ecran de lignes vides. */
    const lignesSemaine = useMemo(() => {
        if (!activeModelId) return [];
        const par = new Map<string, Map<string, number>>();
        for (const r of releves) {
            if (r.modelId !== activeModelId) continue;
            if (!semaine.includes(r.date)) continue;
            const parJour = par.get(r.posteId) || new Map<string, number>();
            parJour.set(r.date, (parJour.get(r.date) || 0) + (r.pieces_sorties || 0));
            par.set(r.posteId, parJour);
        }
        return Array.from(par.entries()).map(([posteId, parJour]) => ({
            posteId,
            libelle: libellePoste(activeModelId, posteId),
            parJour,
            total: Array.from(parJour.values()).reduce((a, b) => a + b, 0),
        })).sort((a, b) => b.total - a.total);
    }, [releves, semaine, activeModelId, models]);

    /* Historique complet : un poste d'un modele donne = une ligne. Deux modeles
       differents ne se melangent pas, meme si l'operation porte le meme nom :
       le temps prevu, donc le score, n'y est pas le meme. */
    const historique = useMemo(() => {
        type Acc = { pieces: number; jours: Set<string>; scores: number[]; dernier: string; modelId: string; posteId: string; planningId: string };
        const par = new Map<string, Acc>();
        for (const r of releves) {
            const cle = `${r.modelId}__${r.posteId}`;
            const acc = par.get(cle) || { pieces: 0, jours: new Set<string>(), scores: [], dernier: '', modelId: r.modelId, posteId: r.posteId, planningId: r.planningId };
            acc.pieces += r.pieces_sorties || 0;
            if (r.date) acc.jours.add(r.date);
            const sc = scoreReleve(r);
            if (sc !== null) acc.scores.push(sc);
            if ((r.date || '') > acc.dernier) acc.dernier = r.date || '';
            par.set(cle, acc);
        }
        return Array.from(par.values()).map(a => ({
            ...a,
            libelle: libellePoste(a.modelId, a.posteId),
            modele: nomModele(a.modelId),
            chaine: chaineDe(a.planningId),
            score: a.scores.length > 0 ? Math.round(a.scores.reduce((x, y) => x + y, 0) / a.scores.length) : null,
        })).sort((a, b) => (b.dernier || '').localeCompare(a.dernier || ''));
    }, [releves, models, planningEvents]);

    const piecesSemaine = useMemo(
        () => releves.filter(r => semaine.includes(r.date)).reduce((s, r) => s + (r.pieces_sorties || 0), 0),
        [releves, semaine],
    );
    const piecesTotal = useMemo(() => releves.reduce((s, r) => s + (r.pieces_sorties || 0), 0), [releves]);
    const scoreMoyen = useMemo(() => {
        const tous = releves.map(scoreReleve).filter((x): x is number => x !== null);
        return tous.length > 0 ? Math.round(tous.reduce((a, b) => a + b, 0) / tous.length) : null;
    }, [releves]);
    const mesure = useMemo(() => releves.some(r => !!(r.temps_reel_par_piece && r.temps_reel_par_piece > 0)), [releves]);

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4" onClick={onClose}>
            {/* Feuille pleine hauteur sur telephone, fenetre centree au bureau. */}
            <div
                className="w-full sm:max-w-4xl max-h-[92vh] sm:max-h-[86vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white dark:bg-dk-surface shadow-xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="sticky top-0 z-10 flex items-start justify-between gap-3 px-4 py-3 border-b border-slate-100 dark:border-dk-border/50 bg-white dark:bg-dk-surface">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="shrink-0 w-9 h-9 rounded-xl bg-indigo-50 dark:bg-dk-accent/20 flex items-center justify-center">
                            <User className="w-4 h-4 text-indigo-600 dark:text-dk-accent-text" />
                        </span>
                        <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-dk-muted">{tx(lang, L.titre)}</p>
                            <p className="text-[15px] font-black text-slate-800 dark:text-dk-text truncate">{workerName}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={tx(lang, L.fermer)}
                        className="shrink-0 w-9 h-9 rounded-xl border border-slate-200 dark:border-dk-border flex items-center justify-center text-slate-500 dark:text-dk-muted"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-4 space-y-4">
                    {/* Ce que l'ouvrier pese, d'un coup d'oeil. */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="rounded-xl bg-slate-50 dark:bg-dk-bg px-3 py-2">
                            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-dk-muted">{tx(lang, L.piecesSemaine)}</p>
                            <p className="text-[16px] font-black tabular-nums text-slate-800 dark:text-dk-text">{piecesSemaine}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 dark:bg-dk-bg px-3 py-2">
                            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-dk-muted">{tx(lang, L.piecesTotal)}</p>
                            <p className="text-[16px] font-black tabular-nums text-slate-800 dark:text-dk-text">{piecesTotal}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 dark:bg-dk-bg px-3 py-2">
                            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-dk-muted">{tx(lang, L.scoreMoyen)}</p>
                            <p className="text-[16px] font-black tabular-nums text-slate-800 dark:text-dk-text" title={mesure ? undefined : tx(lang, L.estime)}>
                                {scoreMoyen === null ? '—' : `${mesure ? '' : '~'}${scoreMoyen}%`}
                            </p>
                        </div>
                        <div className="rounded-xl bg-slate-50 dark:bg-dk-bg px-3 py-2">
                            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-dk-muted">{tx(lang, L.postesTenus)}</p>
                            <p className="text-[16px] font-black tabular-nums text-slate-800 dark:text-dk-text">{historique.length}</p>
                        </div>
                    </div>

                    {/* ─── La semaine, sur le modele ouvert ─── */}
                    <div>
                        <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-dk-muted">{tx(lang, L.semaine)}</p>
                        {lignesSemaine.length === 0 ? (
                            <p className="text-[11px] font-bold text-slate-400 dark:text-dk-muted">{tx(lang, L.semaineVide)}</p>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-dk-border/60">
                                <table className="w-full text-[12px] border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50 dark:bg-dk-elevated/60 text-slate-500 dark:text-dk-muted text-[10px] uppercase tracking-wider font-black">
                                            <th className="text-left px-3 py-2 sticky left-0 bg-slate-50 dark:bg-dk-elevated/60 min-w-[150px]">{tx(lang, L.poste)}</th>
                                            {semaine.map((jour, i) => (
                                                <th key={jour} className={`px-2 py-2 text-center w-16 ${jour === date ? 'text-indigo-700 dark:text-dk-accent-text' : ''}`}>
                                                    {JOURS[i]}
                                                    <span className="block text-[8px] font-bold normal-case tracking-normal">{jour.slice(8, 10)}/{jour.slice(5, 7)}</span>
                                                </th>
                                            ))}
                                            <th className="px-2 py-2 text-center w-16 bg-emerald-50/70 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-300">{tx(lang, L.total)}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-dk-border/40">
                                        {lignesSemaine.map(l => (
                                            <tr key={l.posteId}>
                                                <td className="px-3 py-2 sticky left-0 bg-white dark:bg-dk-surface font-black text-slate-800 dark:text-dk-text truncate">{l.libelle}</td>
                                                {semaine.map(jour => (
                                                    <td key={jour} className={`px-2 py-2 text-center tabular-nums font-bold ${jour === date ? 'bg-indigo-50/40 dark:bg-dk-accent/10' : ''} ${l.parJour.get(jour) ? 'text-slate-800 dark:text-dk-text' : 'text-slate-300 dark:text-dk-muted'}`}>
                                                        {l.parJour.get(jour) || '—'}
                                                    </td>
                                                ))}
                                                <td className="px-2 py-2 text-center tabular-nums font-black bg-emerald-50/40 dark:bg-emerald-900/5 text-slate-800 dark:text-dk-text">{l.total}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="bg-slate-50 dark:bg-dk-elevated/60 border-t-2 border-slate-200 dark:border-dk-border">
                                            <td className="px-3 py-2 sticky left-0 bg-slate-50 dark:bg-dk-elevated/60 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-dk-muted">{tx(lang, L.total)}</td>
                                            {semaine.map(jour => (
                                                <td key={jour} className="px-2 py-2 text-center tabular-nums font-black text-slate-700 dark:text-dk-text">
                                                    {lignesSemaine.reduce((s, l) => s + (l.parJour.get(jour) || 0), 0) || '—'}
                                                </td>
                                            ))}
                                            <td className="px-2 py-2 text-center tabular-nums font-black text-emerald-700 dark:text-emerald-300 bg-emerald-50/70 dark:bg-emerald-900/10">
                                                {lignesSemaine.reduce((s, l) => s + l.total, 0)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* ─── Tout ce qu'il a tenu ailleurs ─── */}
                    <div>
                        <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-dk-muted">{tx(lang, L.historique)}</p>
                        {historique.length === 0 ? (
                            <p className="text-[11px] font-bold text-slate-400 dark:text-dk-muted">{tx(lang, L.historiqueVide)}</p>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-dk-border/60">
                                <table className="w-full text-[12px] border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50 dark:bg-dk-elevated/60 text-slate-500 dark:text-dk-muted text-[10px] uppercase tracking-wider font-black">
                                            <th className="text-left px-3 py-2 min-w-[150px]">{tx(lang, L.poste)}</th>
                                            <th className="text-left px-3 py-2 min-w-[110px]">{tx(lang, L.modele)}</th>
                                            <th className="text-left px-3 py-2 w-24">{tx(lang, L.chaine)}</th>
                                            <th className="px-2 py-2 text-center w-16">{tx(lang, L.jours)}</th>
                                            <th className="px-2 py-2 text-center w-20">{tx(lang, L.pieces)}</th>
                                            <th className="px-2 py-2 text-center w-20">{tx(lang, L.score)}</th>
                                            <th className="px-3 py-2 text-left w-24">{tx(lang, L.dernier)}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-dk-border/40">
                                        {historique.map(h => (
                                            <tr key={`${h.modelId}__${h.posteId}`} className="hover:bg-slate-50/60 dark:hover:bg-dk-elevated/30">
                                                <td className="px-3 py-2 font-black text-slate-800 dark:text-dk-text">{h.libelle}</td>
                                                <td className="px-3 py-2 font-bold text-slate-500 dark:text-dk-muted truncate">{h.modele}</td>
                                                <td className="px-3 py-2 font-bold text-slate-500 dark:text-dk-muted">{h.chaine}</td>
                                                <td className="px-2 py-2 text-center tabular-nums font-bold text-slate-600 dark:text-dk-text-soft">{h.jours.size}</td>
                                                <td className="px-2 py-2 text-center tabular-nums font-black text-slate-800 dark:text-dk-text">{h.pieces}</td>
                                                <td className="px-2 py-2 text-center">
                                                    {h.score === null ? (
                                                        <span className="text-slate-300 dark:text-dk-muted font-bold">—</span>
                                                    ) : (
                                                        <span className={`inline-block rounded-md px-2 py-1 text-[11px] font-black tabular-nums ${classeScore(h.score)}`}>{h.score}%</span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 tabular-nums font-bold text-slate-500 dark:text-dk-muted">{h.dernier || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
