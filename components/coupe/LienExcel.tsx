/**
 * L'ordre de coupe tenu dans un classeur Excel, dans un dossier choisi une
 * fois pour toutes. A chaque enregistrement de l'ordre, son fichier est
 * reecrit : l'Excel suit le programme sans qu'on y pense.
 *
 * Chrome et Edge sur ordinateur savent ecrire dans un dossier choisi ; ailleurs
 * il reste le telechargement. Si le fichier est ouvert dans Excel, Windows le
 * verrouille : on le dit, on ne perd rien, la prochaine sauvegarde le reecrira.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { FileSpreadsheet, FolderOpen, Download, RefreshCw, AlertTriangle } from 'lucide-react';
import { tx } from '../../lib/i18n';
import { useLang } from '../../src/context/LanguageContext';
import { autoriserDossier, choisirDossier, dossierMemorise, ecrireDansDossier, estSupporte, type ResultatEcriture } from '../../lib/dossierLocal';
import { construireClasseurCoupe, nomFichierExcel, type DonneesExcelCoupe } from '../../lib/coupeExcel';

const CLE = 'excel-coupe';
const TYPE_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface LienExcel {
    supporte: boolean;
    dossier: string | null;
    permission: 'granted' | 'prompt' | 'denied' | null;
    derniere: { heure: string; resultat: ResultatEcriture } | null;
    choisir: () => Promise<void>;
    reactiver: () => Promise<void>;
    /** Reecrit le classeur si un dossier est relie et autorise ; sinon ne fait rien. */
    ecrire: (d: DonneesExcelCoupe) => Promise<ResultatEcriture | null>;
    telecharger: (d: DonneesExcelCoupe) => Promise<void>;
}

export function useLienExcel(): LienExcel {
    const supporte = estSupporte();
    const [dossier, setDossier] = useState<string | null>(null);
    const [permission, setPermission] = useState<LienExcel['permission']>(null);
    const [derniere, setDerniere] = useState<LienExcel['derniere']>(null);

    const relire = useCallback(async () => {
        const m = await dossierMemorise(CLE);
        setDossier(m?.nom ?? null);
        setPermission(m?.permission ?? null);
    }, []);
    useEffect(() => { if (supporte) relire(); }, [supporte, relire]);

    const choisir = async () => {
        const r = await choisirDossier(CLE);
        if (r) await relire();
    };
    // Le navigateur ne rend l'acces qu'apres un clic : d'ou ce bouton apres un rechargement.
    const reactiver = async () => {
        await autoriserDossier(CLE);
        await relire();
    };

    const ecrire = async (d: DonneesExcelCoupe) => {
        if (!supporte || !dossier) return null;
        try {
            const octets = await construireClasseurCoupe(d);
            const r = await ecrireDansDossier(CLE, nomFichierExcel(d), new Blob([octets], { type: TYPE_XLSX }));
            setDerniere({ heure: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), resultat: r });
            if (r === 'permission') setPermission('prompt');
            return r;
        } catch {
            setDerniere({ heure: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), resultat: 'erreur' });
            return 'erreur';
        }
    };

    const telecharger = async (d: DonneesExcelCoupe) => {
        const octets = await construireClasseurCoupe(d);
        const url = URL.createObjectURL(new Blob([octets], { type: TYPE_XLSX }));
        const a = document.createElement('a');
        a.href = url; a.download = nomFichierExcel(d);
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    };

    return { supporte, dossier, permission, derniere, choisir, reactiver, ecrire, telecharger };
}

/** Barre discrete sous l'en-tete de l'ordre : ou va l'Excel, et quand il a ete mis a jour. */
export function BarreExcel({ lien, donnees }: { lien: LienExcel; donnees: () => DonneesExcelCoupe }) {
    const { lang } = useLang();
    const L = (fr: string, ar: string, en: string) => tx(lang, { fr, ar, en });
    const [occupe, setOccupe] = useState(false);
    const agir = async (f: () => Promise<unknown>) => { setOccupe(true); try { await f(); } finally { setOccupe(false); } };

    const etat = lien.derniere?.resultat;
    const bouton = 'h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg text-[11px] font-semibold border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-700 dark:text-dk-text-soft hover:border-emerald-300 disabled:opacity-40';

    return (
        <div className="flex flex-wrap items-center gap-2 px-4 md:px-6 py-2.5 border-t border-slate-100 dark:border-dk-border bg-emerald-50/40 dark:bg-emerald-900/10">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="text-[12px] font-semibold text-slate-700 dark:text-dk-text-soft">Excel</span>
            {!lien.supporte ? (
                <span className="text-[11px] text-slate-500">{L('Ce navigateur ne sait pas ecrire dans un dossier : telechargez le classeur.', 'هذا المتصفّح لا يكتب في مجلّد: نزّل الملف.', 'This browser cannot write to a folder: download instead.')}</span>
            ) : !lien.dossier ? (
                <span className="text-[11px] text-slate-500">{L('Pas encore relie a un dossier.', 'غير مربوط بمجلّد بعد.', 'Not linked to a folder yet.')}</span>
            ) : lien.permission !== 'granted' ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="w-3.5 h-3.5" /> {L(`Dossier « ${lien.dossier} » a reactiver`, `المجلّد «${lien.dossier}» يحتاج إعادة تفعيل`, `Folder "${lien.dossier}" needs re-activation`)}
                </span>
            ) : (
                <span className="text-[11px] text-slate-600 dark:text-dk-text-soft">
                    {L('Dossier', 'المجلّد', 'Folder')} <b>{lien.dossier}</b>
                    {lien.derniere && (etat === 'ok'
                        ? <span className="text-emerald-700 dark:text-emerald-400"> · {L('mis a jour a', 'حُدّث على', 'updated at')} {lien.derniere.heure}</span>
                        : etat === 'verrouille'
                            ? <span className="text-rose-600"> · {L('fichier ouvert dans Excel : fermez-le, la prochaine sauvegarde le mettra a jour', 'الملف مفتوح في Excel: أغلقه، والحفظ القادم سيحدّثه', 'file open in Excel: close it and save again')}</span>
                            : <span className="text-rose-600"> · {L('ecriture impossible', 'تعذّرت الكتابة', 'write failed')} ({etat})</span>)}
                    {!lien.derniere && <span className="text-slate-400"> · {L('mis a jour a chaque sauvegarde', 'يُحدَّث عند كل حفظ', 'updated on every save')}</span>}
                </span>
            )}
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
                {lien.supporte && lien.dossier && lien.permission !== 'granted' && (
                    <button type="button" disabled={occupe} onClick={() => agir(lien.reactiver)} className={bouton}>
                        <RefreshCw className="w-3.5 h-3.5" /> {L('Reactiver', 'إعادة التفعيل', 'Re-activate')}
                    </button>
                )}
                {lien.supporte && lien.dossier && lien.permission === 'granted' && (
                    <button type="button" disabled={occupe} onClick={() => agir(() => lien.ecrire(donnees()))} className={bouton}>
                        <RefreshCw className="w-3.5 h-3.5" /> {L('Mettre a jour', 'تحديث', 'Update now')}
                    </button>
                )}
                {lien.supporte && (
                    <button type="button" disabled={occupe} onClick={() => agir(async () => { await lien.choisir(); })} className={bouton}>
                        <FolderOpen className="w-3.5 h-3.5" /> {lien.dossier ? L('Changer de dossier', 'تغيير المجلّد', 'Change folder') : L('Relier a un dossier', 'ربط بمجلّد', 'Link a folder')}
                    </button>
                )}
                <button type="button" disabled={occupe} onClick={() => agir(() => lien.telecharger(donnees()))} className={bouton}>
                    <Download className="w-3.5 h-3.5" /> {L('Telecharger', 'تنزيل', 'Download')}
                </button>
            </div>
        </div>
    );
}
