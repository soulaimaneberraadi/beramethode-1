import React from 'react';
import { RefreshCw, Copy, X, CheckCircle2, AlertTriangle, UploadCloud } from 'lucide-react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../src/lib/supabaseClient';
import { getCurrentEmail } from '../lib/storageKeys';
import { pushSnapshotToCloud, SYNC_KEYS } from '../src/lib/cloudSync';

/**
 * Le diagnostic de synchronisation, DANS l'application.
 *
 * Il existait deja en page separee (`/diagnostic-sync.html`), et cette page
 * s'est revelee aveugle la ou le probleme se pose : sur iPhone, l'application
 * ajoutee a l'ecran d'accueil ne partage pas son stockage avec Safari. Ouverte
 * dans le navigateur, la page ne voyait donc AUCUNE session et concluait « pas
 * connecte » — sur un telephone ou l'application, elle, etait bel et bien
 * connectee. Un diagnostic qui se trompe de coffre ne diagnostique rien.
 *
 * Ici, on est dans l'application : la session lue est forcement la sienne.
 *
 * La question a laquelle ce panneau repond : deux telephones portent-ils le
 * MEME compte ? Une adresse identique ne le prouve pas — deux facons de se
 * connecter (mot de passe, Google) peuvent mener a deux comptes distincts, qui
 * ne partageront jamais rien. Seul l'identifiant le dit.
 */

/**
 * Le nom que porte chaque cle a l'ecran.
 *
 * Le panneau n'en comparait que trois — modeles, planning, suivis — sur les
 * vingt-deux qui suivent le compte. Un manque dans les machines, la
 * sous-traitance ou les reglages passait donc inapercu, et le diagnostic
 * concluait « tout va bien » sur un huitieme du sujet. Une cle sans nom connu
 * s'affiche telle quelle : mieux vaut un intitule technique qu'une absence.
 */
const LIBELLES: Record<string, string> = {
    beramethode_library: 'Modèles',
    beramethode_planning: 'Planning',
    beramethode_suivis: 'Suivis',
    beramethode_settings: 'Réglages',
    beramethode_company: 'Entreprise',
    beramethode_autosave_v1: 'Brouillon en cours',
    beramethode_chrono_sessions_v1: 'Chronométrages',
    beramethode_machine_instances: 'Machines (parc)',
    beramethode_machines_v1: 'Machines (catalogue)',
    beramethode_machines_fleet_history_v1: 'Machines (historique)',
    beramethode_manual_links: 'Liaisons manuelles',
    beramethode_demandesAppro: 'Demandes appro.',
    beramethode_tombstones: 'Suppressions',
    bera_nav_config: 'Navigation',
    BERA_CUSTOM_ROLES: 'Rôles',
    BERA_CUSTOM_PARTITIONS: 'Partitions',
    BERA_SALLES: 'Salles',
    beramethode_subcontract_orders: 'Sous-traitance (ordres)',
    beramethode_subcontract_groups: 'Sous-traitance (groupes)',
    beramethode_subcontract_profiles: 'Sous-traitants',
    beramethode_tiki_settings: 'Tiki',
    beramethode_canal_frais: 'Frais par canal',
};

type Etat = 'attente' | 'encours' | 'fini';

const DiagnosticSync: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [etat, setEtat] = React.useState<Etat>('attente');
    const [lignes, setLignes] = React.useState<{ nom: string; valeur: string; ton?: 'ok' | 'ko' | 'attention' }[]>([]);
    const [note, setNote] = React.useState<string>('');
    const [copie, setCopie] = React.useState(false);
    const [envoi, setEnvoi] = React.useState<'attente' | 'encours' | 'ok' | 'ko'>('attente');
    const [uid, setUid] = React.useState('');
    const [detail, setDetail] = React.useState('');

    const lancer = React.useCallback(async () => {
        setEtat('encours');
        setNote('');
        setDetail('');
        const out: { nom: string; valeur: string; ton?: 'ok' | 'ko' | 'attention' }[] = [];
        const compter = (v: unknown) => Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : 0);
        const lireLocal = (base: string) => {
            const email = getCurrentEmail();
            for (const cle of [email ? `${base}__${email}` : null, base]) {
                if (!cle) continue;
                try { const v = localStorage.getItem(cle); if (v) return JSON.parse(v); } catch { /* cle suivante */ }
            }
            return null;
        };

        out.push({ nom: 'Application', valeur: window.matchMedia('(display-mode: standalone)').matches ? 'installée (écran d\'accueil)' : 'navigateur' });
        out.push({ nom: 'En ligne', valeur: navigator.onLine ? 'oui' : 'NON', ton: navigator.onLine ? 'ok' : 'ko' });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
            out.push({ nom: 'Session', valeur: 'ABSENTE', ton: 'ko' });
            setLignes(out);
            setNote("Cet appareil n'est pas connecté : rien ne peut être ni envoyé ni reçu. Reconnectez-vous, puis relancez.");
            setEtat('fini');
            return;
        }
        const uid = session.user?.id || '';
        setUid(uid);
        out.push({ nom: 'Adresse', valeur: session.user?.email || '(inconnue)' });
        out.push({ nom: 'IDENTIFIANT DU COMPTE', valeur: uid, ton: 'attention' });

        // La reponse du serveur, telle qu'elle arrive.
        let http = 0;
        let corps = '';
        try {
            const r = await fetch(
                `${SUPABASE_URL}/rest/v1/user_data?select=updated_at,data&user_id=eq.${encodeURIComponent(uid)}`,
                { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}` } },
            );
            http = r.status;
            corps = await r.text();
        } catch (e) {
            out.push({ nom: 'Appel au serveur', valeur: 'ÉCHEC RÉSEAU', ton: 'ko' });
            setLignes(out);
            setNote(String(e));
            setEtat('fini');
            return;
        }
        out.push({ nom: 'Code HTTP', valeur: String(http), ton: http === 200 ? 'ok' : 'ko' });
        if (http !== 200) {
            setLignes(out);
            setNote(corps.slice(0, 600));
            setEtat('fini');
            return;
        }

        let rangees: { updated_at?: string; data?: Record<string, unknown> }[] = [];
        try { rangees = JSON.parse(corps); } catch { /* corps illisible */ }
        out.push({ nom: 'Lignes sur le serveur', valeur: String(rangees.length), ton: rangees.length === 1 ? 'ok' : 'ko' });
        if (!rangees.length) {
            setLignes(out);
            setNote("Le serveur ne connaît aucune donnée pour ce compte : rien n'a jamais été reçu de nulle part. Le problème est à l'envoi, pas à la réception.");
            setEtat('fini');
            return;
        }

        const distant = rangees[0];
        const donnees = distant.data || {};
        out.push({ nom: 'Dernière écriture', valeur: distant.updated_at ? new Date(distant.updated_at).toLocaleString() : '(inconnue)' });
        // Les VINGT-DEUX cles, pas trois. On n'affiche en clair que celles qui
        // different : vingt-deux lignes identiques noieraient le seul ecart qui
        // compte. Le nombre de cles accordees tient sur une ligne, et le rapport
        // a copier les porte toutes — c'est lui qu'on relit ensuite a froid.
        const ecarts: string[] = [];
        const detailLignes: string[] = [];
        let accordees = 0;
        for (const cle of SYNC_KEYS) {
            const cs = compter((donnees as any)[cle]);
            const cl = compter(lireLocal(cle));
            const nom = LIBELLES[cle] || cle;
            detailLignes.push(`${cs === cl ? '=' : '!'} ${nom} : serveur ${cs} · ici ${cl}`);
            if (cs === cl) { accordees += 1; continue; }
            ecarts.push(nom);
            out.push({ nom, valeur: `serveur ${cs} · ici ${cl}`, ton: 'attention' });
        }
        out.push({
            nom: 'Clés accordées',
            valeur: `${accordees} / ${SYNC_KEYS.length}`,
            ton: accordees === SYNC_KEYS.length ? 'ok' : 'attention',
        });
        setDetail(detailLignes.join('\n'));
        if (ecarts.length) {
            setNote(`Pas encore accordé : ${ecarts.join(', ')}. Un écart juste après une saisie est normal — l'envoi est groupé. S'il dure, utilisez « Envoyer mes données maintenant ».`);
        }
        const pull = localStorage.getItem('beramethode_last_pulled_at');
        out.push({ nom: 'Dernière reprise ici', valeur: pull ? new Date(pull).toLocaleString() : '(jamais)', ton: pull ? undefined : 'attention' });
        // Comparer des instants, jamais leur orthographe : l'heure retenue apres
        // un envoi vient de cet appareil (`...Z`), celle du serveur d'une colonne
        // `timestamptz` (`...+00:00`). Le meme instant s'ecrit des deux facons, et
        // ce panneau annoncait un retard imaginaire a chaque envoi.
        const memeInstant = (a: string, b: string) => {
            if (a === b) return true;
            const ta = new Date(a).getTime(), tb = new Date(b).getTime();
            return Number.isFinite(ta) && Number.isFinite(tb) && ta === tb;
        };
        if (distant.updated_at && pull && !memeInstant(distant.updated_at, pull)) {
            setNote("Le serveur porte une version que cet appareil n'a pas encore reprise. Quittez l'application puis rouvrez-la : la reprise se déclenche au retour.");
        }
        setLignes(out);
        setEtat('fini');
    }, []);

    /**
     * Renvoyer, tout de suite, ce que cet appareil detient.
     *
     * Quand le compte est le meme et que les comptes different (« serveur 4 ·
     * ici 5 »), la question n'est plus « qui parle a qui » mais « pourquoi
     * l'envoi n'est pas parti ». L'envoi ordinaire est regroupe puis declenche
     * par le depart de l'application ; s'il echoue, il le fait en silence. Ce
     * bouton le provoque a la demande et en montre l'issue — et, en attendant
     * qu'on sache pourquoi, il debloque la situation sur-le-champ.
     */
    const forcerEnvoi = React.useCallback(async () => {
        if (!uid) return;
        setEnvoi('encours');
        let ok = false;
        try { ok = await pushSnapshotToCloud(uid); } catch { ok = false; }
        setEnvoi(ok ? 'ok' : 'ko');
        await lancer();
    }, [uid, lancer]);

    React.useEffect(() => { void lancer(); }, [lancer]);

    const rapport = React.useMemo(
        () => ['BERAMETHODE — diagnostic de synchronisation', new Date().toISOString(), '',
            ...lignes.map(l => `${l.nom} : ${l.valeur}`), detail ? `\n— Les ${SYNC_KEYS.length} clés —\n${detail}` : '', note ? `\n${note}` : ''].join('\n'),
        [lignes, note, detail],
    );

    const copier = async () => {
        try { await navigator.clipboard.writeText(rapport); setCopie(true); setTimeout(() => setCopie(false), 2500); }
        catch { /* le presse-papier peut etre refuse : le texte reste selectionnable */ }
    };

    const couleur = (t?: string) => t === 'ok' ? 'text-emerald-600 dark:text-emerald-400'
        : t === 'ko' ? 'text-red-600 dark:text-red-400'
            : t === 'attention' ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-700 dark:text-dk-text';

    return (
        <div className="fixed inset-0 z-[400] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
            <div className="bg-white dark:bg-dk-surface w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="sticky top-0 bg-white dark:bg-dk-surface border-b border-slate-200 dark:border-dk-border px-4 py-3 flex items-center justify-between">
                    <h2 className="text-[14px] font-bold text-slate-900 dark:text-dk-text">Diagnostic de synchronisation</h2>
                    <button onClick={onClose} aria-label="Fermer" className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-dk-text">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-4">
                    <p className="text-[12px] text-slate-500 dark:text-dk-muted mb-3">
                        À lancer sur <strong>chacun</strong> des deux téléphones. Deux appareils ne partagent leurs
                        données que si l'<strong>identifiant du compte</strong> est le même — une adresse identique ne
                        le prouve pas. Rien n'est modifié ici.
                    </p>

                    {etat === 'encours' && <p className="text-[13px] text-slate-500 dark:text-dk-muted py-6 text-center">Interrogation du serveur…</p>}

                    {lignes.map((l, i) => (
                        <div key={i} className="flex justify-between gap-3 py-1.5 border-b border-slate-100 dark:border-dk-border last:border-0">
                            <span className="text-[12px] text-slate-500 dark:text-dk-muted shrink-0">{l.nom}</span>
                            <span className={`text-[12px] font-bold text-right break-all ${couleur(l.ton)}`}>{l.valeur}</span>
                        </div>
                    ))}

                    {note && (
                        <div className="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-[12px] text-amber-800 dark:text-amber-300 flex gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>{note}</span>
                        </div>
                    )}

                    {etat === 'fini' && uid && (
                        <button onClick={() => void forcerEnvoi()} disabled={envoi === 'encours'}
                            className="w-full h-10 mt-4 rounded-lg bg-indigo-600 text-white text-[13px] font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50">
                            <UploadCloud className={`w-3.5 h-3.5 ${envoi === 'encours' ? 'animate-pulse' : ''}`} />
                            {envoi === 'encours' ? 'Envoi en cours…'
                                : envoi === 'ok' ? 'Envoyé — comptes remis à jour ci-dessus'
                                    : envoi === 'ko' ? "L'envoi a échoué — réessayez" : 'Envoyer mes données maintenant'}
                        </button>
                    )}
                    {envoi === 'ko' && (
                        <p className="mt-2 text-[11px] text-red-600 dark:text-red-400">
                            Le serveur a refusé l'envoi. Si « ici » reste supérieur à « serveur » après plusieurs
                            essais, c'est l'envoi lui-même qui est en cause, pas le compte.
                        </p>
                    )}

                    <div className="flex gap-2 mt-4">
                        <button onClick={() => void lancer()} disabled={etat === 'encours'}
                            className="flex-1 h-10 rounded-lg bg-slate-900 dark:bg-dk-elevated text-white text-[13px] font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50">
                            <RefreshCw className={`w-3.5 h-3.5 ${etat === 'encours' ? 'animate-spin' : ''}`} /> Relancer
                        </button>
                        <button onClick={() => void copier()}
                            className="flex-1 h-10 rounded-lg border border-slate-200 dark:border-dk-border text-[13px] font-bold text-slate-700 dark:text-dk-text inline-flex items-center justify-center gap-2">
                            {copie ? <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Copié</> : <><Copy className="w-3.5 h-3.5" /> Copier</>}
                        </button>
                    </div>

                    <textarea readOnly value={rapport} aria-label="Rapport"
                        className="mt-3 w-full h-40 text-[10px] font-mono p-2 rounded-lg bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-muted" />
                </div>
            </div>
        </div>
    );
};

export default DiagnosticSync;
