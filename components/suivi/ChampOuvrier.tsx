import React, { useMemo, useRef, useState } from 'react';
import type { HRWorker } from '../../types';
import { tx } from '../../lib/i18n';
import { Plus, Loader2 } from 'lucide-react';

const PLACEHOLDER = { fr: 'Nom de l’ouvrier…', ar: 'سميّة العامل…', en: 'Worker name…', es: 'Nombre del operario…', pt: 'Nome do operario…', tr: 'Isci adi…' };

const L = {
    creer: { fr: 'Creer la fiche de', ar: 'أنشئ بطاقة', en: 'Create the file for', es: 'Crear la ficha de', pt: 'Criar a ficha de', tr: 'Kartini olustur' },
    creerTitre: { fr: 'Nouvel ouvrier', ar: 'عامل جديد', en: 'New worker', es: 'Nuevo operario', pt: 'Novo operario', tr: 'Yeni isci' },
    nom: { fr: 'Nom complet', ar: 'الاسم الكامل', en: 'Full name', es: 'Nombre completo', pt: 'Nome completo', tr: 'Tam ad' },
    matricule: { fr: 'Matricule', ar: 'رقم التسجيل', en: 'Staff number', es: 'Matricula', pt: 'Matricula', tr: 'Sicil no' },
    matriculeAide: { fr: 'Obligatoire et unique — c’est lui qui identifie la personne dans la paie.', ar: 'إجباري وفريد — هو اللي كيعرّف الشخص فالأجرة.', en: 'Required and unique — it identifies the person in payroll.', es: 'Obligatorio y unico — identifica a la persona en la nomina.', pt: 'Obrigatorio e unico — identifica a pessoa na folha de pagamento.', tr: 'Zorunlu ve benzersiz — bordroda kisiyi tanimlar.' },
    cin: { fr: 'CIN (facultatif)', ar: 'البطاقة الوطنية (اختياري)', en: 'ID card (optional)', es: 'DNI (opcional)', pt: 'BI (opcional)', tr: 'Kimlik (istege bagli)' },
    chaine: { fr: 'Chaine', ar: 'الشين', en: 'Line', es: 'Linea', pt: 'Linha', tr: 'Hat' },
    enregistrer: { fr: 'Creer et choisir', ar: 'أنشئ واختر', en: 'Create and pick', es: 'Crear y elegir', pt: 'Criar e escolher', tr: 'Olustur ve sec' },
    annulerCreation: { fr: 'Annuler', ar: 'إلغاء', en: 'Cancel', es: 'Cancelar', pt: 'Cancelar', tr: 'Iptal' },
    manque: { fr: 'Le nom et le matricule sont obligatoires.', ar: 'الاسم ورقم التسجيل إجباريين.', en: 'Name and staff number are required.', es: 'El nombre y la matricula son obligatorios.', pt: 'O nome e a matricula sao obrigatorios.', tr: 'Ad ve sicil no zorunludur.' },
    sansChaine: { fr: 'sans chaine', ar: 'بلا شين', en: 'no line', es: 'sin linea', pt: 'sem linha', tr: 'hat yok' },
    /* On ne promet PAS de reaffecter la fiche RH : le releve du jour se fera ici,
       le rattachement officiel de la personne, lui, ne bouge pas. */
    autreChaine: { fr: 'Vient d’une autre chaine — son releve du jour se fera ici', ar: 'جاي من شين أخرى — تسجيل هاد النهار غادي يكون هنا', en: 'From another line — today’s entry will be recorded here', es: 'Viene de otra linea — su registro de hoy se hara aqui', pt: 'Vem de outra linha — o registo de hoje sera feito aqui', tr: 'Baska bir hattan — bugunku kaydi burada tutulacak' },
};

/**
 * Champ « ouvrier » : on ecrit le nom, les fiches RH sont proposees.
 *
 * Un simple selecteur supposait le fichier RH deja saisi. Ici le nom libre est
 * accepte tel quel, et s'il correspond exactement a une fiche, le releve est
 * rattache a cette personne — son historique se remplit sans rien resaisir.
 *
 * Les fiches proposees viennent de TOUTES les chaines, celles de la chaine en
 * cours d'abord. Chaque ligne dit d'ou vient la personne : c'est ce qui permet
 * de deplacer quelqu'un d'une chaine a l'autre en connaissance de cause, au
 * lieu de choisir un homonyme au hasard.
 */
export default function ChampOuvrier({ valeur, workers, lang, onValider, onAnnuler, autoFocus = true, chaineCourante, onCreerOuvrier }: {
    valeur: string; workers: HRWorker[]; lang: string;
    onValider: (nom: string) => void; onAnnuler: () => void;
    /** Faux quand le champ vit dans un formulaire : il n'a pas a s'y imposer. */
    autoFocus?: boolean;
    /** Chaine du releve : sert a signaler les fiches qui viennent d'ailleurs. */
    chaineCourante?: string;
    /**
     * Cree la fiche RH d'une personne absente du fichier. Absent = pas de
     * creation offerte (droits insuffisants, mode hors-ligne).
     * Rejette avec un message lisible : matricule deja pris, CIN en double.
     */
    onCreerOuvrier?: (fiche: { full_name: string; matricule: string; cin?: string; chaine_id?: string }) => Promise<HRWorker>;
}) {
    const [saisie, setSaisie] = useState(valeur);
    const [actif, setActif] = useState(autoFocus);
    /* Un choix dans la liste doit gagner contre la validation de sortie de
       champ : sur telephone, toucher une proposition fait TOUJOURS perdre le
       focus a l'input, et la validation differee renvoyait alors le texte
       partiel tape ("Fad") par-dessus le nom choisi. */
    const choixEnCours = useRef(false);

    const propositions = useMemo(() => {
        const q = saisie.trim().toLowerCase();
        const base = q === '' ? workers : workers.filter(w => (w.full_name || '').toLowerCase().includes(q));
        return base.slice(0, 6);
    }, [saisie, workers]);

    /* Creation d'une fiche absente du fichier RH, sans quitter le releve.
       Le nom deja tape sert d'amorce : au pied de la chaine on connait la
       personne avant que son dossier n'existe. */
    const [creation, setCreation] = useState(false);
    const [nouveau, setNouveau] = useState({ full_name: '', matricule: '', cin: '' });
    const [erreurCreation, setErreurCreation] = useState('');
    const [creationEnCours, setCreationEnCours] = useState(false);

    /* Rien a creer si la personne est deja au fichier : on la choisit. Deux
       lettres au moins, sinon la proposition s'affiche des la premiere frappe. */
    const peutCreer = useMemo(() => {
        if (!onCreerOuvrier) return false;
        const q = saisie.trim();
        if (q.length < 2) return false;
        return !workers.some(w => (w.full_name || '').trim().toLowerCase() === q.toLowerCase());
    }, [onCreerOuvrier, saisie, workers]);

    const ouvrirCreation = () => {
        choixEnCours.current = true;
        setNouveau({ full_name: saisie.trim(), matricule: '', cin: '' });
        setErreurCreation('');
        setCreation(true);
        setActif(false);
    };

    const fermerCreation = () => {
        setCreation(false);
        setErreurCreation('');
        choixEnCours.current = false;
    };

    const validerCreation = async () => {
        const nom = nouveau.full_name.trim();
        const mat = nouveau.matricule.trim();
        if (!nom || !mat || creationEnCours || !onCreerOuvrier) {
            if (!nom || !mat) setErreurCreation(tx(lang, L.manque));
            return;
        }
        setCreationEnCours(true);
        setErreurCreation('');
        try {
            /* CIN vide => `undefined`, jamais chaine vide : la colonne est UNIQUE,
               et deux fiches sans CIN entreraient en collision sur ''. */
            const fiche = await onCreerOuvrier({
                full_name: nom,
                matricule: mat,
                cin: nouveau.cin.trim() || undefined,
                chaine_id: chaineCourante || undefined,
            });
            setCreation(false);
            choisir(fiche);
        } catch (e: any) {
            // Matricule deja pris, CIN en double : le message du serveur est le seul
            // qui dise laquelle des deux contraintes a cede.
            setErreurCreation(e?.message || tx(lang, L.manque));
        } finally {
            setCreationEnCours(false);
        }
    };

    const choisir = (w: HRWorker) => {
        choixEnCours.current = true;
        const nom = w.full_name || '';
        // Le champ doit MONTRER le nom choisi : sans cela, l'ecran gardait le
        // texte partiel et le clic semblait sans effet.
        setSaisie(nom);
        setActif(false);
        onValider(nom);
        setTimeout(() => { choixEnCours.current = false; }, 300);
    };

    return (
        <div className="relative">
            <input
                autoFocus={autoFocus}
                value={saisie}
                onFocus={() => setActif(true)}
                onChange={e => setSaisie(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Enter') onValider(saisie);
                    if (e.key === 'Escape') onAnnuler();
                }}
                /* On valide en quittant le champ : au pied de la chaine, personne
                   ne pense a appuyer sur Entree. Un choix dans la liste, lui, a
                   deja valide — on ne le recouvre pas. */
                onBlur={() => setTimeout(() => {
                    if (choixEnCours.current) return;
                    setActif(false);
                    onValider(saisie);
                }, 150)}
                placeholder={tx(lang, PLACEHOLDER)}
                className="w-full h-9 text-[12px] font-bold text-slate-700 dark:text-dk-text bg-slate-50 dark:bg-dk-elevated/60 border border-slate-200 dark:border-dk-border rounded-lg px-2.5 outline-none focus:border-indigo-600"
            />
            {actif && (propositions.length > 0 || peutCreer) && !creation && (
                <div className="absolute z-40 left-0 right-0 min-w-[220px] mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface shadow-lg">
                    {propositions.map(w => {
                        const chaine = (w.chaine_id || '').trim();
                        const ailleurs = Boolean(chaineCourante && chaine && chaine !== chaineCourante);
                        const details = [w.matricule, w.poste || w.specialite].filter(Boolean).join(' · ');
                        return (
                            <button
                                key={w.id}
                                type="button"
                                title={ailleurs ? tx(lang, L.autreChaine) : undefined}
                                /* `pointerdown` et non `mousedown` : sur telephone le
                                   `mousedown` n'est synthetise qu'apres le `touchend`,
                                   donc APRES la perte de focus — la liste avait deja
                                   disparu et le doigt ne selectionnait rien. */
                                onPointerDown={e => { e.preventDefault(); choisir(w); }}
                                className="w-full text-left px-2.5 py-2 min-h-[40px] hover:bg-slate-50 dark:hover:bg-dk-elevated/50 border-b border-slate-100 dark:border-dk-border/40 last:border-0"
                            >
                                <span className="flex items-center gap-1.5">
                                    <span className="flex-1 min-w-0 truncate text-[12px] font-bold text-slate-700 dark:text-dk-text">{w.full_name}</span>
                                    {/* La chaine d'origine, en clair : c'est elle qui dit si
                                        l'on prend quelqu'un de sa propre equipe ou si on le
                                        fait venir d'une autre. */}
                                    <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[9px] font-black ${ailleurs
                                        ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                        : 'bg-slate-100 text-slate-500 dark:bg-dk-elevated dark:text-dk-muted'}`}>
                                        {chaine || tx(lang, L.sansChaine)}
                                    </span>
                                </span>
                                {details && (
                                    <span className="block mt-0.5 text-[9px] font-bold text-slate-400 dark:text-dk-muted truncate">{details}</span>
                                )}
                            </button>
                        );
                    })}
                    {/* Personne au fichier ne porte ce nom : on ouvre sa fiche ici
                        plutot que d'envoyer l'utilisateur dans Gestion RH — il
                        perdrait le releve en cours pour y revenir. */}
                    {peutCreer && (
                        <button
                            type="button"
                            onPointerDown={e => { e.preventDefault(); ouvrirCreation(); }}
                            className="w-full text-left px-2.5 py-2 min-h-[40px] flex items-center gap-1.5 text-[11px] font-black text-indigo-600 dark:text-dk-accent hover:bg-indigo-50 dark:hover:bg-dk-accent/20 border-t border-slate-100 dark:border-dk-border/40"
                        >
                            <Plus className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{tx(lang, L.creer)} « {saisie.trim()} »</span>
                        </button>
                    )}
                </div>
            )}

            {creation && (
                <div className="absolute z-50 left-0 mt-1 w-[260px] max-w-[80vw] rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface shadow-xl p-2.5 space-y-1.5">
                    <p className="text-[11px] font-black text-slate-700 dark:text-dk-text">{tx(lang, L.creerTitre)}</p>
                    <input
                        value={nouveau.full_name}
                        onChange={e => setNouveau(v => ({ ...v, full_name: e.target.value }))}
                        placeholder={tx(lang, L.nom)}
                        autoFocus
                        className="w-full h-9 rounded-lg border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg px-2.5 text-[12px] font-bold text-slate-800 dark:text-dk-text outline-none focus:border-indigo-600"
                    />
                    <input
                        value={nouveau.matricule}
                        onChange={e => setNouveau(v => ({ ...v, matricule: e.target.value }))}
                        placeholder={tx(lang, L.matricule)}
                        title={tx(lang, L.matriculeAide)}
                        className="w-full h-9 rounded-lg border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg px-2.5 text-[12px] font-bold text-slate-800 dark:text-dk-text outline-none focus:border-indigo-600"
                    />
                    <input
                        value={nouveau.cin}
                        onChange={e => setNouveau(v => ({ ...v, cin: e.target.value }))}
                        placeholder={tx(lang, L.cin)}
                        className="w-full h-9 rounded-lg border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg px-2.5 text-[12px] font-bold text-slate-800 dark:text-dk-text outline-none focus:border-indigo-600"
                    />
                    {/* La chaine n'est pas saisie : la fiche rejoint celle du releve
                        en cours, qui est precisement celle ou la personne travaille. */}
                    {chaineCourante && (
                        <p className="text-[9px] font-bold text-slate-400 dark:text-dk-muted">
                            {tx(lang, L.chaine)} : {chaineCourante}
                        </p>
                    )}
                    {erreurCreation && (
                        <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400">{erreurCreation}</p>
                    )}
                    <div className="flex items-center gap-1.5 pt-0.5">
                        <button
                            type="button"
                            onClick={() => { void validerCreation(); }}
                            disabled={creationEnCours || !nouveau.full_name.trim() || !nouveau.matricule.trim()}
                            className="flex-1 h-9 rounded-lg bg-indigo-600 text-white text-[11px] font-black flex items-center justify-center gap-1.5 disabled:opacity-40"
                        >
                            {creationEnCours ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                            {tx(lang, L.enregistrer)}
                        </button>
                        <button
                            type="button"
                            onClick={fermerCreation}
                            className="h-9 px-2.5 text-[11px] font-black text-slate-400 dark:text-dk-muted"
                        >
                            {tx(lang, L.annulerCreation)}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
