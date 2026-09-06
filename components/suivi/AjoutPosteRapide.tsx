import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { HRWorker, ModelData, Operation } from '../../types';
import { tx } from '../../lib/i18n';
import { useLang } from '../../src/context/LanguageContext';
import { chercherOperations, indexerOperations, type OperationConnue, type ResultatRecherche } from '../../lib/rechercheOperations';
import { Plus, Search, Loader2, Check } from 'lucide-react';

/**
 * Ajout d'un poste depuis le pied de la chaine.
 *
 * On tape le debut du libelle : les operations deja faites dans l'atelier
 * remontent, meme mal orthographiees, avec leur machine et leur temps. On peut
 * aussi ecrire un libelle inconnu — il est garde tel quel et rejoint la gamme
 * du modele, donc le catalogue des temps et le score des ouvriers ensuite.
 */

const L = {
    ajouter: { fr: 'Ajouter un poste', ar: 'زيد منصب', en: 'Add a poste', es: 'Anadir un puesto', pt: 'Adicionar um posto', tr: 'Istasyon ekle' },
    description: { fr: 'Description du poste', ar: 'وصف المنصب', en: 'Poste description', es: 'Descripcion del puesto', pt: 'Descricao do posto', tr: 'Istasyon aciklamasi' },
    descriptionHint: { fr: 'Tapez un mot : les operations deja faites remontent. Sinon, ecrivez la votre.', ar: 'كتب كلمة: العمليات اللي دايرين من قبل كيطلعو. وإلا كتب اللي بغيتي.', en: 'Type a word: operations already done come up. Otherwise write your own.', es: 'Escriba una palabra: aparecen las operaciones ya hechas. Si no, escriba la suya.', pt: 'Escreva uma palavra: aparecem as operacoes ja feitas. Caso contrario, escreva a sua.', tr: 'Bir kelime yazin: daha once yapilan islemler gelir. Yoksa kendinizinkini yazin.' },
    machine: { fr: 'Machine', ar: 'الآلة', en: 'Machine', es: 'Maquina', pt: 'Maquina', tr: 'Makine' },
    temps: { fr: 'Temps / piece (sec)', ar: 'الزمن / قطعة (ثانية)', en: 'Time / piece (sec)', es: 'Tiempo / pieza (seg)', pt: 'Tempo / peca (seg)', tr: 'Parca basi sure (sn)' },
    worker: { fr: 'Ouvrier', ar: 'العامل', en: 'Worker', es: 'Operario', pt: 'Operario', tr: 'Isci' },
    chooseWorker: { fr: 'Choisir un ouvrier…', ar: 'اختر عاملاً…', en: 'Choose a worker…', es: 'Elegir un operario…', pt: 'Escolher um operario…', tr: 'Isci secin…' },
    valider: { fr: 'Ajouter a la gamme', ar: 'زيدو للگام', en: 'Add to the gamme', es: 'Anadir a la gama', pt: 'Adicionar a gama', tr: 'Gamme ekle' },
    annuler: { fr: 'Annuler', ar: 'إلغاء', en: 'Cancel', es: 'Cancelar', pt: 'Cancelar', tr: 'Iptal' },
    nouveau: { fr: 'Nouveau libelle — il sera garde pour les prochaines fois', ar: 'وصف جديد — غادي يتحفظ للمرات الجاية', en: 'New label — it will be kept for next time', es: 'Nuevo texto — se guardara para la proxima vez', pt: 'Novo texto — sera guardado para a proxima vez', tr: 'Yeni tanim — bir dahaki sefere saklanacak' },
    fois: { fr: 'fois', ar: 'مرة', en: 'times', es: 'veces', pt: 'vezes', tr: 'kez' },
    catalogue: { fr: 'temps valide au catalogue', ar: 'زمن مُصادَق فالكتالوگ', en: 'time validated in the catalogue', es: 'tiempo validado en el catalogo', pt: 'tempo validado no catalogo', tr: 'katalogda dogrulanmis sure' },
    sansTemps: { fr: 'sans temps connu', ar: 'بلا زمن معروف', en: 'no known time', es: 'sin tiempo conocido', pt: 'sem tempo conhecido', tr: 'bilinen sure yok' },
};

interface Props {
    /** Toute la bibliotheque : c'est elle qui alimente la recherche. */
    models: ModelData[];
    /** Modele auquel le poste sera ajoute. */
    activeModel: ModelData;
    workers: HRWorker[];
    /** Persiste l'operation dans la gamme du modele. Rejette en cas d'echec. */
    onAjouter: (op: Operation, workerId: string) => Promise<void>;
}

export default function AjoutPosteRapide({ models, activeModel, workers, onAjouter }: Props) {
    const { lang } = useLang();
    const [ouvert, setOuvert] = useState(false);
    const [description, setDescription] = useState('');
    const [machine, setMachine] = useState('');
    /* Temps herite d'une suggestion (gamme ou catalogue), jamais tape a la
       main : au pied de la chaine on n'estime pas un temps standard — le
       chrono du releve le mesure, et le catalogue le corrige. */
    const [tempsSecHerite, setTempsSecHerite] = useState<number | null>(null);
    const [workerId, setWorkerId] = useState('');
    const [enCours, setEnCours] = useState(false);
    const [fait, setFait] = useState(false);
    const [listeVisible, setListeVisible] = useState(false);
    const champRef = useRef<HTMLInputElement | null>(null);

    /* Curations du catalogue des temps : ce sont les temps DECIDES par le
       methodiste (corriges, valides, epingles). Ils rejoignent la recherche au
       meme titre que les gammes, et leur temps prime sur la mediane observee.
       Le catalogue indisponible n'empeche rien : on cherche alors dans les
       seules gammes. */
    const [curations, setCurations] = useState<OperationConnue[]>([]);
    useEffect(() => {
        let annule = false;
        (async () => {
            try {
                const res = await fetch('/api/catalog/entries', { credentials: 'include' });
                if (!res.ok) return;
                const rows = await res.json();
                if (annule || !Array.isArray(rows)) return;
                setCurations(rows
                    .filter((r: any) => r?.description)
                    .map((r: any) => ({
                        description: String(r.description),
                        machineName: r.machine ? String(r.machine) : undefined,
                        // `avg_time` est en MINUTES cote catalogue, comme la gamme.
                        tempsMin: Number(r.avg_time) > 0 ? Number(r.avg_time) : undefined,
                        section: r.section ? String(r.section) : undefined,
                        occurrences: 1,
                        confirme: Boolean(r.confirmed) || Boolean(r.pinned) || Number(r.avg_time) > 0,
                    })));
            } catch {
                /* hors-ligne : la recherche reste servie par les gammes */
            }
        })();
        return () => { annule = true; };
    }, []);

    // L'index se reconstruit quand la bibliotheque ou le catalogue change, pas a chaque frappe.
    const index = useMemo(() => indexerOperations(models, curations), [models, curations]);
    const propositions: ResultatRecherche[] = useMemo(
        () => chercherOperations(index, description),
        [index, description],
    );
    /* « Deja connue » se juge sur le libelle exact retenu, pas sur la premiere
       proposition : une operation approchante ne rend pas la saisie connue. */
    const dejaConnue = useMemo(() => {
        const cible = description.trim().toLowerCase();
        return cible.length > 0 && index.some(e => e.description.trim().toLowerCase() === cible);
    }, [index, description]);

    const choisir = (p: ResultatRecherche) => {
        setDescription(p.description);
        if (p.machineName) setMachine(p.machineName);
        setTempsSecHerite(p.tempsMin ? Number((p.tempsMin * 60).toFixed(1)) : null);
        setListeVisible(false);
        champRef.current?.blur();
    };

    const reinitialiser = () => {
        setDescription(''); setMachine(''); setTempsSecHerite(null); setWorkerId('');
        setListeVisible(false);
    };

    const valider = async () => {
        const libelle = description.trim();
        if (!libelle || enCours) return;
        const existantes = activeModel.gamme_operatoire || [];
        const ordre = existantes.reduce((max, o) => Math.max(max, Number(o.order) || 0), 0) + 1;
        /* La gamme compte en MINUTES (temps, SAM, equilibrage, cout minute) ;
           au pied de la chaine on parle en secondes. La conversion se fait ici,
           une seule fois — une seconde prise pour une minute fausserait le
           rendement et la prime d'un facteur 60. */
        const tempsMin = tempsSecHerite === null ? 0 : Number((tempsSecHerite / 60).toFixed(4));
        const op: Operation = {
            id: `OP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            order: ordre,
            description: libelle,
            machineId: '',
            machineName: machine.trim() || undefined,
            time: tempsMin,
            manualTime: tempsMin || undefined,
            section: 'MONTAGE',
        };
        setEnCours(true);
        try {
            await onAjouter(op, workerId);
            setFait(true);
            setTimeout(() => setFait(false), 1800);
            reinitialiser();
        } catch (e) {
            console.error('AjoutPosteRapide: ajout refuse', e);
        } finally {
            setEnCours(false);
        }
    };

    if (!ouvert) {
        return (
            <button
                type="button"
                onClick={() => { setOuvert(true); setTimeout(() => champRef.current?.focus(), 30); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-600 dark:text-dk-text-soft text-[11px] font-black hover:border-indigo-400 hover:text-indigo-600 transition-colors"
            >
                <Plus className="w-3.5 h-3.5" /> {tx(lang, L.ajouter)}
            </button>
        );
    }

    return (
        <div className="rounded-xl border border-slate-200 dark:border-dk-border/60 bg-white dark:bg-dk-surface p-2">
            <div className="flex flex-wrap items-center gap-1.5">
                {/* Le libelle d'abord : c'est lui qui ramene la machine et le temps
                    deja connus de l'atelier. Le reste n'est qu'un complement. */}
                <div className="relative flex-1 min-w-[180px]">
                    <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg px-2">
                        <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <input
                            ref={champRef}
                            value={description}
                            onChange={e => { setDescription(e.target.value); setTempsSecHerite(null); setListeVisible(true); }}
                            onFocus={() => setListeVisible(true)}
                            onKeyDown={e => { if (e.key === 'Enter') void valider(); if (e.key === 'Escape') { reinitialiser(); setOuvert(false); } }}
                            /* Le clic sur une proposition doit passer avant la fermeture :
                               on laisse le mousedown de la liste s'executer. */
                            onBlur={() => setTimeout(() => setListeVisible(false), 150)}
                            className="flex-1 min-w-0 bg-transparent h-9 text-[12px] font-bold text-slate-800 dark:text-dk-text outline-none"
                            placeholder={tx(lang, L.description)}
                        />
                        {tempsSecHerite !== null && (
                            <span className="shrink-0 text-[9px] font-black tabular-nums text-emerald-600 dark:text-emerald-400">{tempsSecHerite}s</span>
                        )}
                    </div>

                    {listeVisible && propositions.length > 0 && (
                        <div className="absolute z-30 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface shadow-lg">
                            {propositions.map(p => (
                                <button
                                    key={p.description}
                                    type="button"
                                    onMouseDown={e => { e.preventDefault(); choisir(p); }}
                                    className="w-full text-left px-2.5 py-1.5 hover:bg-slate-50 dark:hover:bg-dk-elevated/50 border-b border-slate-100 dark:border-dk-border/40 last:border-0"
                                >
                                    <span className="block text-[12px] font-black text-slate-800 dark:text-dk-text truncate">{p.description}</span>
                                    <span className="block text-[9px] font-bold text-slate-400 dark:text-dk-muted truncate">
                                        {p.machineName ? `${p.machineName} · ` : ''}
                                        {p.tempsMin ? `${(p.tempsMin * 60).toFixed(1)} s` : tx(lang, L.sansTemps)}
                                        {` · ${p.occurrences} ${tx(lang, L.fois)}`}
                                        {p.confirme ? ` · ${tx(lang, L.catalogue)}` : ''}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <input
                    value={machine}
                    onChange={e => setMachine(e.target.value)}
                    className="w-[110px] h-9 rounded-lg border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg px-2 text-[12px] font-bold text-slate-800 dark:text-dk-text outline-none"
                    placeholder={tx(lang, L.machine)}
                />

                <div className="relative w-[130px]">
                    <select
                        value={workerId}
                        onChange={e => setWorkerId(e.target.value)}
                        className="w-full h-9 appearance-none rounded-lg border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg pl-2 pr-6 text-[12px] font-bold text-slate-800 dark:text-dk-text outline-none"
                    >
                        <option value="">{tx(lang, L.chooseWorker)}</option>
                        {workers.map(w => (
                            <option key={w.id} value={String(w.id)}>{w.full_name}</option>
                        ))}
                    </select>
                </div>

                <button
                    type="button"
                    onClick={valider}
                    disabled={!description.trim() || enCours}
                    className="h-9 px-3 rounded-lg bg-indigo-600 text-white text-[11px] font-black flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {enCours ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : fait ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                    {tx(lang, L.valider)}
                </button>
                <button
                    type="button"
                    onClick={() => { reinitialiser(); setOuvert(false); }}
                    className="h-9 px-2 text-[11px] font-black text-slate-400"
                >
                    ×
                </button>
            </div>

            {description.trim() !== '' && !dejaConnue && (
                <p className="mt-1 text-[9px] font-bold text-amber-600 dark:text-amber-400">{tx(lang, L.nouveau)}</p>
            )}
        </div>
    );
}
