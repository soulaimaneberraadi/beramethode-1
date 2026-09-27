import React, { useEffect, useRef, useState } from 'react';
import { Scissors, Building2, ArrowRight, Loader2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LanguageContext';
import { tx } from '../../lib/i18n';
import GlobalLoader from '../../components/GlobalLoader';
import { NOM_PRODUIT } from '../../lib/edition';

/**
 * Démarrage de BERACOUPE (édition salle de coupe) — remplace entièrement
 * Signup / Login / Setup wizard / CGU / Google. Un seul compte partagé par
 * atelier, jamais de mot de passe à saisir sur cet appareil :
 *
 *   GET /api/edition → { initialise, entreprise, port, adresses }
 *     - pas initialisé → écran « Nom de l'entreprise » → POST /api/edition/setup
 *     - déjà initialisé → POST /api/edition/session (silencieux) → connecté
 *
 * `login()` (AuthContext) est réutilisé tel quel : en édition coupe il ne
 * touche jamais au cloud (voir activateLocalDataOwner dans AuthContext.tsx).
 */

interface EditionInfo {
    edition: 'coupe';
    initialise: boolean;
    entreprise: string | null;
    port: number;
    adresses: string[];
}

type Etat = 'chargement' | 'setup' | 'connexion' | 'erreur';

export default function CoupeBoot() {
    const { login } = useAuth();
    const { lang } = useLang();
    const [etat, setEtat] = useState<Etat>('chargement');
    const [entreprise, setEntreprise] = useState('');
    const [envoi, setEnvoi] = useState(false);
    const [erreur, setErreur] = useState<string | null>(null);
    const demarre = useRef(false);

    const tenterSessionSilencieuse = async (): Promise<boolean> => {
        try {
            const res = await fetch('/api/edition/session', { method: 'POST', credentials: 'include' });
            if (!res.ok) return false;
            const data = await res.json().catch(() => null) as { ok?: boolean; user?: any } | null;
            if (data?.ok && data.user) {
                login(data.user);
                return true;
            }
            return false;
        } catch {
            return false;
        }
    };

    const chargerEdition = async () => {
        setEtat('chargement');
        setErreur(null);
        try {
            const res = await fetch('/api/edition', { credentials: 'include' });
            if (!res.ok) throw new Error('http ' + res.status);
            const data = (await res.json()) as EditionInfo;
            if (!data.initialise) {
                setEtat('setup');
                return;
            }
            setEtat('connexion');
            const ok = await tenterSessionSilencieuse();
            if (!ok) {
                setErreur(tx(lang, {
                    fr: "Impossible d'ouvrir la session de l'atelier. Vérifiez que le serveur BERACOUPE tourne sur ce réseau.",
                    ar: 'تعذّر فتح جلسة الورشة. تأكّد من تشغيل خادم BERACOUPE على هذه الشبكة.',
                    en: 'Could not open the workshop session. Check that the BERACOUPE server is running on this network.',
                }));
                setEtat('erreur');
            }
        } catch {
            setErreur(tx(lang, {
                fr: 'Connexion au serveur BERACOUPE impossible. Vérifiez le réseau et réessayez.',
                ar: 'تعذّر الاتصال بخادم BERACOUPE. تحقّق من الشبكة وأعد المحاولة.',
                en: 'Could not reach the BERACOUPE server. Check the network and try again.',
            }));
            setEtat('erreur');
        }
    };

    useEffect(() => {
        if (demarre.current) return;
        demarre.current = true;
        void chargerEdition();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const soumettreSetup = async (e: React.FormEvent) => {
        e.preventDefault();
        const nom = entreprise.trim();
        if (!nom || envoi) return;
        setEnvoi(true);
        setErreur(null);
        try {
            const res = await fetch('/api/edition/setup', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entreprise: nom }),
            });
            const data = await res.json().catch(() => null) as { ok?: boolean; user?: any; message?: string } | null;
            if (!res.ok || !data?.ok || !data.user) {
                throw new Error(data?.message || 'setup failed');
            }
            login(data.user);
        } catch {
            setErreur(tx(lang, {
                fr: "Échec de la création de l'atelier. Réessayez.",
                ar: 'فشل إنشاء الورشة. أعد المحاولة.',
                en: 'Failed to create the workshop. Please try again.',
            }));
        } finally {
            setEnvoi(false);
        }
    };

    if (etat === 'chargement' || etat === 'connexion') {
        return (
            <GlobalLoader
                isActive
                progress={etat === 'connexion' ? 70 : 30}
                text={NOM_PRODUIT}
                subText={etat === 'connexion'
                    ? tx(lang, { fr: "Connexion à l'atelier...", ar: 'الاتصال بالورشة...', en: 'Connecting to the workshop...' })
                    : tx(lang, { fr: 'Recherche du serveur local...', ar: 'البحث عن الخادم المحلي...', en: 'Looking for the local server...' })}
            />
        );
    }

    // 'setup' (première ouverture, jamais initialisé) ou 'erreur' (avec bouton réessayer).
    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 dark:bg-dk-bg px-4 py-10" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            <div className="max-w-sm w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-3xl p-7 sm:p-9 shadow-[0_25px_50px_-12px_rgba(15,23,42,0.08)]">
                <div className="flex flex-col items-center text-center mb-7">
                    <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 flex items-center justify-center text-red-600 dark:text-red-400 mb-4">
                        <Scissors className="w-7 h-7" />
                    </div>
                    <h1 className="select-none text-2xl font-extrabold tracking-tight text-slate-900 dark:text-dk-text">
                        BERA<span className="text-red-600 dark:text-red-400">COUPE</span>
                    </h1>
                    <p className="mt-2 text-sm text-slate-500 dark:text-dk-text-soft">
                        {tx(lang, {
                            fr: 'La salle de coupe, issue de BERAMETHODE.',
                            ar: 'قسم القص، من BERAMETHODE.',
                            en: 'The cutting room, from BERAMETHODE.',
                        })}
                    </p>
                </div>

                {etat === 'erreur' ? (
                    <div className="space-y-4">
                        <div className="flex items-start gap-2.5 bg-rose-50 dark:bg-rose-900/30 border border-rose-100 dark:border-rose-800 rounded-xl px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>{erreur}</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => void chargerEdition()}
                            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-slate-900 dark:bg-red-600 hover:bg-slate-800 dark:hover:bg-red-500 text-white font-bold text-sm transition-colors"
                        >
                            {tx(lang, { fr: 'Réessayer', ar: 'إعادة المحاولة', en: 'Retry' })}
                        </button>
                    </div>
                ) : (
                    <form onSubmit={soumettreSetup} className="space-y-5">
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-dk-muted mb-2">
                                {tx(lang, { fr: "Nom de l'entreprise", ar: 'اسم الشركة', en: 'Company name' })}
                            </label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none rtl:left-auto rtl:right-0 rtl:pl-0 rtl:pr-4">
                                    <Building2 className="h-5 w-5 text-slate-400 group-focus-within:text-red-500 dark:text-dk-muted transition-colors" />
                                </div>
                                <input
                                    autoFocus
                                    type="text"
                                    required
                                    value={entreprise}
                                    onChange={e => setEntreprise(e.target.value)}
                                    placeholder={tx(lang, { fr: 'ex. Atelier Textile Fès', ar: 'مثال: ورشة النسيج فاس', en: 'e.g. Fes Textile Workshop' })}
                                    className="w-full pl-11 rtl:pl-4 rtl:pr-11 pr-4 py-3.5 rounded-xl border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/50 text-slate-900 dark:text-dk-text placeholder-slate-400 text-sm font-medium outline-none focus:ring-4 focus:ring-red-500/10 focus:border-red-500 focus:bg-white dark:focus:bg-dk-surface transition-all"
                                />
                            </div>
                        </div>

                        {erreur && (
                            <div className="flex items-start gap-2.5 bg-rose-50 dark:bg-rose-900/30 border border-rose-100 dark:border-rose-800 rounded-xl px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
                                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                <span>{erreur}</span>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={!entreprise.trim() || envoi}
                            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors shadow-lg shadow-red-600/20"
                        >
                            {envoi ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <>
                                    {tx(lang, { fr: 'Créer mon atelier', ar: 'إنشاء الورشة', en: 'Create my workshop' })}
                                    <ArrowRight className="w-4 h-4 rtl:rotate-180" />
                                </>
                            )}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
