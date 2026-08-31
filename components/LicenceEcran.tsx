/**
 * Fin d'abonnement — le bandeau d'avertissement et l'écran de réactivation.
 *
 * ── Trois moments, trois traitements ─────────────────────────────────────────
 *
 *   ACTIF, échéance proche  → un bandeau. On prévient, on n'entrave rien.
 *   GRÂCE (15 jours)        → un bandeau plus ferme. Tout se consulte, rien ne
 *                             s'écrit. L'entreprise voit son travail.
 *   VERROUILLÉ              → cet écran, à la place du programme.
 *
 * ── Pourquoi l'export reste là ───────────────────────────────────────────────
 * Ce programme porte la paie, les factures et la comptabilité. Une entreprise
 * en retard de paiement qui reçoit un contrôle du travail ou des impôts doit
 * pouvoir sortir ses registres. Couper l'outil met la pression ; retenir les
 * données en otage n'ajoute qu'un risque juridique — et une histoire qui se
 * raconte. Le bouton d'export n'est donc jamais retiré.
 *
 * ── Pourquoi prévenir tôt ────────────────────────────────────────────────────
 * Quelqu'un qui oublie de payer et trouve son programme arrêté un matin se met
 * en colère, et il a raison. Le bandeau apparaît 15 jours avant, puis 5, puis
 * chaque jour des trois derniers.
 */

import React from 'react';
import { AlertTriangle, Download, KeyRound, Lock } from 'lucide-react';
import { useLicense } from '../src/context/LicenseContext';
import { tx } from '../lib/i18n';
import { useLang } from '../src/context/LanguageContext';

const telechargerExport = async () => {
    try {
        const rep = await fetch('/api/admin/export-all-data', { credentials: 'include' });
        if (!rep.ok) throw new Error(String(rep.status));
        const blob = await rep.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `beramethode-donnees-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    } catch {
        // L'export passe par le serveur local ; s'il ne répond pas, mieux vaut
        // le dire que de laisser croire au téléchargement d'un fichier vide.
        alert('Export impossible pour le moment. Verifiez que le serveur est demarre.');
    }
};

/** Bandeau d'avertissement — s'affiche au-dessus du programme, sans le bloquer. */
export function LicenceBandeau() {
    const { etat, enforced } = useLicense();
    const { lang } = useLang();

    if (!enforced || !etat.alerter || etat.etat === 'verrouille' || etat.etat === 'inconnu') return null;

    const jours = etat.joursRestants ?? 0;
    const enGrace = etat.etat === 'grace';

    const texte = enGrace
        ? tx(lang, {
            fr: `Abonnement termine. Vous pouvez consulter vos donnees, mais plus les modifier. Il reste ${jours} jour(s) avant la fermeture.`,
            ar: `انتهى الاشتراك. تقدر تشوف الداتا ديالك، ولكن ما تقدرش تبدّلها. باقي ${jours} يوم قبل ما يتسدّ.`,
            en: `Subscription ended. You can view your data but no longer edit it. ${jours} day(s) before lock.`,
            es: `Suscripcion terminada. Puede consultar sus datos pero ya no modificarlos. Quedan ${jours} dia(s).`,
            pt: `Assinatura terminada. Pode consultar os seus dados mas ja nao edita-los. Faltam ${jours} dia(s).`,
            tr: `Abonelik sona erdi. Verilerinizi goruntuleyebilir ancak duzenleyemezsiniz. ${jours} gun kaldi.`,
        })
        : tx(lang, {
            fr: `Votre abonnement se termine dans ${jours} jour(s).`,
            ar: `الاشتراك ديالك غادي يسالي من بعد ${jours} يوم.`,
            en: `Your subscription ends in ${jours} day(s).`,
            es: `Su suscripcion termina en ${jours} dia(s).`,
            pt: `A sua assinatura termina em ${jours} dia(s).`,
            tr: `Aboneliginiz ${jours} gun icinde sona eriyor.`,
        });

    return (
        <div
            role="status"
            className={`flex items-center gap-2 px-3 py-2 text-[12px] font-bold print:hidden ${
                enGrace
                    ? 'bg-red-50 text-red-800 border-b border-red-200 dark:bg-red-950/40 dark:text-red-200 dark:border-red-900'
                    : 'bg-amber-50 text-amber-900 border-b border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900'
            }`}
        >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="min-w-0">{texte}</span>
        </div>
    );
}

/**
 * Écran de réactivation — remplace le programme quand l'abonnement est clos.
 *
 * Deux issues, pas une : réactiver, ou récupérer ses données. Une porte de
 * sortie change tout dans la façon dont la coupure est vécue.
 */
export function LicenceEcranVerrouille() {
    const { lang } = useLang();
    const { activate } = useLicense();
    const [cle, setCle] = React.useState('');
    const [occupe, setOccupe] = React.useState(false);
    const [erreur, setErreur] = React.useState<string | null>(null);

    // La saisie de la cle vit ICI, et pas dans les reglages : le programme est
    // ferme, on ne peut plus y naviguer. Envoyer l utilisateur vers une page
    // qu il ne peut pas atteindre serait une impasse.
    const reactiver = async () => {
        const valeur = cle.trim().toUpperCase();
        if (!valeur) return;
        setOccupe(true);
        setErreur(null);
        try {
            const etat = await activate(valeur);
            if (!etat.active) {
                setErreur(tx(lang, {
                    fr: 'Cle refusee. Verifiez-la ou contactez le support.',
                    ar: 'المفتاح مرفوض. تحقّق منّو ولا تواصل مع الدعم.',
                    en: 'Key rejected. Check it or contact support.',
                    es: 'Clave rechazada. Verifiquela o contacte soporte.',
                    pt: 'Chave recusada. Verifique ou contacte o suporte.',
                    tr: 'Anahtar reddedildi. Kontrol edin veya destege basvurun.',
                }));
            }
            // Succes : le contexte se met a jour et l ecran disparait de lui-meme.
        } catch {
            setErreur(tx(lang, {
                fr: 'Verification impossible. Verifiez votre connexion.',
                ar: 'ما قدرناش نتحقّقو. شوف الاتصال ديالك.',
                en: 'Verification failed. Check your connection.',
                es: 'Verificacion imposible. Compruebe su conexion.',
                pt: 'Verificacao impossivel. Verifique a sua ligacao.',
                tr: 'Dogrulama basarisiz. Baglantinizi kontrol edin.',
            }));
        } finally {
            setOccupe(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-50 dark:bg-dk-bg px-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                    <span className="grid place-items-center w-10 h-10 rounded-xl bg-slate-100 dark:bg-dk-elevated">
                        <Lock className="w-5 h-5 text-slate-500 dark:text-dk-muted" />
                    </span>
                    <h1 className="text-base font-extrabold text-slate-900 dark:text-dk-text">
                        {tx(lang, {
                            fr: 'Abonnement termine', ar: 'انتهى الاشتراك', en: 'Subscription ended',
                            es: 'Suscripcion terminada', pt: 'Assinatura terminada', tr: 'Abonelik sona erdi',
                        })}
                    </h1>
                </div>

                <p className="text-[13px] leading-relaxed text-slate-600 dark:text-dk-text-soft mb-5">
                    {tx(lang, {
                        fr: 'Vos donnees sont intactes et vous restent accessibles. Reactivez pour reprendre le travail, ou telechargez-les des maintenant.',
                        ar: 'الداتا ديالك كاملة وباقة ديالك. فعّل باش تعاود تخدم، ولا حمّلها دابا.',
                        en: 'Your data is intact and remains yours. Reactivate to resume work, or download it now.',
                        es: 'Sus datos estan intactos y siguen siendo suyos. Reactive para continuar, o descarguelos ahora.',
                        pt: 'Os seus dados estao intactos e continuam a ser seus. Reative para retomar, ou descarregue-os agora.',
                        tr: 'Verileriniz eksiksiz ve size ait. Devam etmek icin yeniden etkinlestirin veya simdi indirin.',
                    })}
                </p>

                <div className="flex flex-col gap-2">
                    <input
                        value={cle}
                        onChange={(e) => setCle(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') void reactiver(); }}
                        placeholder="BERA-XXXX-XXXX-XXXX"
                        spellCheck={false}
                        autoComplete="off"
                        className="h-10 px-3 rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-bg text-slate-900 dark:text-dk-text text-[13px] font-mono tracking-wider placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    {erreur && (
                        <p role="alert" className="text-[12px] font-bold text-red-700 dark:text-red-300">{erreur}</p>
                    )}
                    <button
                        onClick={() => void reactiver()}
                        disabled={occupe || !cle.trim()}
                        className="inline-flex items-center justify-center gap-2 h-10 rounded-xl bg-indigo-600 text-white text-[13px] font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <KeyRound className="w-4 h-4" />
                        {occupe
                            ? tx(lang, { fr: 'Verification…', ar: 'كنتحقّقو…', en: 'Checking…', es: 'Verificando…', pt: 'A verificar…', tr: 'Dogrulaniyor…' })
                            : tx(lang, { fr: 'Reactiver', ar: 'تفعيل', en: 'Reactivate', es: 'Reactivar', pt: 'Reativar', tr: 'Yeniden etkinlestir' })}
                    </button>
                    <button
                        onClick={telechargerExport}
                        className="inline-flex items-center justify-center gap-2 h-10 rounded-xl border border-slate-200 dark:border-dk-border text-slate-700 dark:text-dk-text text-[13px] font-bold hover:bg-slate-50 dark:hover:bg-dk-elevated transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        {tx(lang, {
                            fr: 'Telecharger mes donnees', ar: 'حمّل الداتا ديالي', en: 'Download my data',
                            es: 'Descargar mis datos', pt: 'Descarregar os meus dados', tr: 'Verilerimi indir',
                        })}
                    </button>
                </div>
            </div>
        </div>
    );
}
