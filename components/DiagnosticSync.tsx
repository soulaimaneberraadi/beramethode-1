import React from 'react';
import { RefreshCw, Copy, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../src/lib/supabaseClient';
import { getCurrentEmail } from '../lib/storageKeys';

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

type Etat = 'attente' | 'encours' | 'fini';

const DiagnosticSync: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [etat, setEtat] = React.useState<Etat>('attente');
    const [lignes, setLignes] = React.useState<{ nom: string; valeur: string; ton?: 'ok' | 'ko' | 'attention' }[]>([]);
    const [note, setNote] = React.useState<string>('');
    const [copie, setCopie] = React.useState(false);

    const lancer = React.useCallback(async () => {
        setEtat('encours');
        setNote('');
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
        for (const [nom, cle] of [['Modèles', 'beramethode_library'], ['Planning', 'beramethode_planning'], ['Suivis', 'beramethode_suivis']] as const) {
            const cs = compter((donnees as any)[cle]);
            const cl = compter(lireLocal(cle));
            out.push({ nom, valeur: `serveur ${cs} · ici ${cl}`, ton: cs === cl ? 'ok' : 'attention' });
        }
        const pull = localStorage.getItem('beramethode_last_pulled_at');
        out.push({ nom: 'Dernière reprise ici', valeur: pull ? new Date(pull).toLocaleString() : '(jamais)', ton: pull ? undefined : 'attention' });
        if (distant.updated_at && pull && distant.updated_at !== pull) {
            setNote("Le serveur porte une version que cet appareil n'a pas encore reprise. Quittez l'application puis rouvrez-la : la reprise se déclenche au retour.");
        }
        setLignes(out);
        setEtat('fini');
    }, []);

    React.useEffect(() => { void lancer(); }, [lancer]);

    const rapport = React.useMemo(
        () => ['BERAMETHODE — diagnostic de synchronisation', new Date().toISOString(), '',
            ...lignes.map(l => `${l.nom} : ${l.valeur}`), note ? `\n${note}` : ''].join('\n'),
        [lignes, note],
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
                        className="mt-3 w-full h-24 text-[10px] font-mono p-2 rounded-lg bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-muted" />
                </div>
            </div>
        </div>
    );
};

export default DiagnosticSync;
