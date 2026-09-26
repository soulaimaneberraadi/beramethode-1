/**
 * Importer un ordre depuis Excel : le « REPARTOS » du client (une feuille par
 * atelier, un bloc par matiere, un code par trace : TE-01, FO-05...) ou la
 * feuille de l'atelier (Colchon / ordre / Hojas / Largo).
 *
 * On lit, on montre ce qui a ete compris, et rien ne s'applique avant
 * « Importer ». Les lignes douteuses sont signalees, jamais devinees.
 */
import React, { useRef, useState } from 'react';
import { FileSpreadsheet, Upload, AlertTriangle, Check, Loader2 } from 'lucide-react';
import SheetModal from '../shared/SheetModal';
import { tx } from '../../lib/i18n';
import { useLang } from '../../src/context/LanguageContext';
import { lireClasseurCoupe, type FeuilleImportee } from '../../lib/importCoupeExcel';

export interface ChoixImport {
    feuille: FeuilleImportee;
    /** Couleur qui recoit les quantites et les matelas ; '' = nouvelle couleur. */
    couleur: string;
    nouvelleCouleur: string;
    remplacer: boolean;
}

interface Props {
    couleurs: string[];
    onImporter: (c: ChoixImport) => void;
    onClose: () => void;
}

export default function ImportExcelCoupe({ couleurs, onImporter, onClose }: Props) {
    const { lang } = useLang();
    const L = (fr: string, ar: string, en: string) => tx(lang, { fr, ar, en });
    const entree = useRef<HTMLInputElement>(null);
    const [lecture, setLecture] = useState(false);
    const [erreur, setErreur] = useState('');
    const [nomFichier, setNomFichier] = useState('');
    const [feuilles, setFeuilles] = useState<FeuilleImportee[]>([]);
    const [choix, setChoix] = useState(0);
    const [couleur, setCouleur] = useState(couleurs[0] || '');
    const [nouvelleCouleur, setNouvelleCouleur] = useState('');
    const [remplacer, setRemplacer] = useState(false);
    const [survol, setSurvol] = useState(false);

    const lire = async (f: File) => {
        setErreur(''); setLecture(true); setNomFichier(f.name); setFeuilles([]);
        try {
            const r = await lireClasseurCoupe(await f.arrayBuffer());
            if (!r.length) setErreur(L('Aucune feuille lisible : ni REPARTOS du client, ni feuille de coupe de l’atelier.', 'لا توجد ورقة مقروءة: لا REPARTOS الزبون ولا ورقة قص الورشة.', 'No readable sheet.'));
            setFeuilles(r);
            setChoix(0);
        } catch {
            setErreur(L('Fichier illisible (il faut un .xlsx).', 'ملف غير مقروء (يلزم ملف ‎.xlsx).', 'Unreadable file (.xlsx needed).'));
        } finally {
            setLecture(false);
        }
    };

    const f = feuilles[choix];
    const nbMatelas = (x: FeuilleImportee) => x.format === 'atelier'
        ? x.matieres.reduce((s, m) => s + m.matelas.length, 0)
        : x.matieres.reduce((s, m) => s + m.placements.filter(p => (p.plis || 0) > 0).length, 0);
    const total = f ? Object.values(f.quantites).reduce((s, v) => s + (Number(v) || 0), 0) : 0;

    return (
        <SheetModal
            onClose={onClose}
            size="2xl"
            zClass="z-[96]"
            icon={<FileSpreadsheet className="w-5 h-5 text-emerald-600" />}
            title={L('Importer un ordre depuis Excel', 'استيراد أمر من Excel', 'Import an order from Excel')}
            subtitle={L('REPARTOS du client ou feuille de coupe de l’atelier', 'REPARTOS الزبون أو ورقة قص الورشة', 'Client REPARTOS or workshop cut sheet')}
            bodyClassName="flex-1 overflow-y-auto min-h-0 p-4 md:p-5 space-y-4"
            footer={
                <div className="flex items-center justify-end gap-2 p-3">
                    <button type="button" onClick={onClose} className="h-10 px-4 rounded-lg text-[12px] font-semibold text-slate-600 hover:bg-slate-100">{L('Annuler', 'إلغاء', 'Cancel')}</button>
                    <button
                        type="button"
                        disabled={!f || (!couleur && !nouvelleCouleur.trim())}
                        onClick={() => f && onImporter({ feuille: f, couleur, nouvelleCouleur: nouvelleCouleur.trim(), remplacer })}
                        className="h-10 px-4 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white text-[12px] font-bold hover:bg-emerald-700 disabled:opacity-40"
                    >
                        <Check className="w-4 h-4" />{L('Importer', 'استيراد', 'Import')}
                    </button>
                </div>
            }
        >
            <input ref={entree} type="file" accept=".xlsx,.xlsm" className="hidden" onChange={e => { const x = e.target.files?.[0]; e.target.value = ''; if (x) lire(x); }} />
            <button
                type="button"
                onClick={() => entree.current?.click()}
                onDragOver={e => { e.preventDefault(); setSurvol(true); }}
                onDragLeave={() => setSurvol(false)}
                onDrop={e => { e.preventDefault(); setSurvol(false); const x = e.dataTransfer.files?.[0]; if (x) lire(x); }}
                className={`w-full min-h-24 flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-5 text-[12px] font-semibold ${survol ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 dark:border-dk-border text-slate-500 hover:border-emerald-300'}`}
            >
                {lecture ? <Loader2 className="w-5 h-5 animate-spin text-emerald-600" /> : <Upload className="w-5 h-5" />}
                {nomFichier || L('Deposez le classeur ici, ou cliquez pour le choisir', 'ضع الملف هنا أو انقر لاختياره', 'Drop the workbook here, or click to choose')}
            </button>
            {erreur && <p className="text-[12px] font-semibold text-rose-600">{erreur}</p>}

            {feuilles.length > 0 && (
                <>
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">{L('Feuille', 'الورقة', 'Sheet')}</p>
                        <div className="flex flex-wrap gap-1.5">
                            {feuilles.map((x, i) => (
                                <button key={x.feuille + i} type="button" onClick={() => setChoix(i)} className={`h-9 px-3 rounded-lg border text-[12px] font-semibold ${i === choix ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300' : 'border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft hover:border-emerald-300'}`}>
                                    {x.feuille.trim()}
                                    <span className="ml-1.5 text-[10px] font-medium text-slate-400">{x.format === 'atelier' ? L('atelier', 'ورشة', 'workshop') : 'repartos'} · {nbMatelas(x)}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {f && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]">
                                {[
                                    [L('Modele', 'الموديل', 'Model'), f.modele],
                                    [L('Client', 'الزبون', 'Client'), f.client],
                                    [L('Commande (pedido)', 'رقم الطلب', 'Order no.'), f.pedido],
                                    [L('Atelier', 'الورشة', 'Workshop'), f.atelier || f.corte],
                                ].map(([k, v]) => (
                                    <div key={String(k)} className="rounded-lg bg-slate-50 dark:bg-dk-bg px-2.5 py-2">
                                        <p className="text-[10px] font-bold uppercase text-slate-400">{k}</p>
                                        <p className="font-bold text-slate-800 dark:text-dk-text truncate">{v || '—'}</p>
                                    </div>
                                ))}
                            </div>

                            <div className="overflow-x-auto">
                                <table className="text-[12px] border-collapse">
                                    <thead>
                                        <tr>{f.tailles.map(t => <th key={t} className="px-3 py-1 text-emerald-700 font-bold border border-slate-200 dark:border-dk-border">{t}</th>)}<th className="px-3 py-1 border border-slate-200 dark:border-dk-border">{L('Total', 'المجموع', 'Total')}</th></tr>
                                    </thead>
                                    <tbody>
                                        <tr>{f.tailles.map(t => <td key={t} className="px-3 py-1 text-right tabular-nums border border-slate-200 dark:border-dk-border">{f.quantites[t] || 0}</td>)}<td className="px-3 py-1 text-right font-bold tabular-nums border border-slate-200 dark:border-dk-border">{total}</td></tr>
                                    </tbody>
                                </table>
                            </div>

                            {f.matieres.map((m, i) => (
                                <div key={i} className="rounded-xl border border-slate-200 dark:border-dk-border">
                                    <div className="px-3 py-2 flex items-center gap-2 border-b border-slate-100 dark:border-dk-border">
                                        <span className="px-1.5 h-5 inline-flex items-center rounded bg-indigo-600 text-white text-[10px] font-bold">{m.code || '—'}</span>
                                        <b className="text-[12px] text-slate-800 dark:text-dk-text">{m.nom.trim()}</b>
                                        {m.ref && <span className="text-[11px] text-slate-400">{m.ref}</span>}
                                        {m.principal && <span className="ml-auto text-[10px] font-bold text-emerald-600">{L('tissu principal', 'الثوب الرئيسي', 'main fabric')}</span>}
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-[11px]">
                                            <tbody>
                                                {f.format === 'repartos' ? m.placements.map(p => (
                                                    <tr key={p.code} className="border-t border-slate-50 dark:border-dk-border">
                                                        <td className="px-3 py-1 font-bold text-indigo-700 dark:text-indigo-300 whitespace-nowrap">{p.code}</td>
                                                        <td className="px-2 py-1 whitespace-nowrap">{p.taillesTexte} · {p.ratiosTexte || '—'}</td>
                                                        <td className="px-2 py-1 font-semibold text-emerald-700 whitespace-nowrap">{p.ratios ? Object.entries(p.ratios).map(([t, n]) => `${t}×${n}`).join(' ') : '—'}</td>
                                                        <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap">{p.longueurM ? `${p.longueurM.toFixed(2)} m` : ''}</td>
                                                        <td className="px-2 py-1 text-right tabular-nums font-bold whitespace-nowrap">{p.plis ? `${p.plis} ${L('plis', 'طيّة', 'plies')}` : ''}</td>
                                                        <td className="px-2 py-1 text-amber-700">{p.aVerifier && <span className="inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{p.aVerifier}</span>}</td>
                                                    </tr>
                                                )) : (
                                                    <tr><td className="px-3 py-2 text-slate-500">{m.matelas.length} {L('matelas repris avec leur numero, leurs plis et leur longueur', 'مفرشة تُؤخذ برقمها وطيّاتها وطولها', 'lays taken with number, plies, length')}</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))}

                            {f.alertes.length > 0 && (
                                <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300 space-y-0.5">
                                    {f.alertes.map((a, i) => <p key={i} className="flex gap-1.5"><AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />{a}</p>)}
                                </div>
                            )}

                            <div className="grid sm:grid-cols-2 gap-3">
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">{L('Couleur des quantites et des matelas', 'لون الكميات والمفرشات', 'Colour for quantities and lays')}</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {couleurs.map(c => (
                                            <button key={c} type="button" onClick={() => { setCouleur(c); setNouvelleCouleur(''); }} className={`h-8 px-2.5 rounded-lg border text-[11px] font-semibold ${couleur === c ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 dark:border-dk-border text-slate-600'}`}>{c}</button>
                                        ))}
                                        <input
                                            value={nouvelleCouleur}
                                            onChange={e => { setNouvelleCouleur(e.target.value); if (e.target.value.trim()) setCouleur(''); }}
                                            placeholder={L('+ Nouvelle couleur', '+ لون جديد', '+ New colour')}
                                            className={`h-8 w-36 px-2.5 rounded-lg border text-[11px] font-semibold outline-none ${!couleur && nouvelleCouleur.trim() ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 dark:border-dk-border'}`}
                                        />
                                    </div>
                                </div>
                                <button type="button" onClick={() => setRemplacer(v => !v)} className={`text-left rounded-lg border px-3 py-2 ${remplacer ? 'border-rose-300 bg-rose-50 dark:bg-rose-900/20' : 'border-slate-200 dark:border-dk-border'}`}>
                                    <span className="flex items-center gap-2 text-[12px] font-bold text-slate-800 dark:text-dk-text">
                                        <span className={`w-4 h-4 rounded border-2 flex items-center justify-center ${remplacer ? 'bg-rose-500 border-rose-500' : 'border-slate-300'}`}>{remplacer && <Check className="w-3 h-3 text-white" strokeWidth={3} />}</span>
                                        {L('Remplacer ce qui n’est pas encore coupe', 'استبدال ما لم يُقصّ بعد', 'Replace what is not cut yet')}
                                    </span>
                                    <span className="block text-[10px] text-slate-500 mt-0.5 ml-6">{L('Sinon les placements et matelas s’ajoutent ; un meme code (TE-01) est mis a jour. Les matelas coupes restent toujours.', 'وإلا تُضاف التركيبات والمفرشات؛ ونفس الرمز يُحدَّث. المفرشات المقصوصة تبقى دائماً.', 'Otherwise added; same code updated. Cut lays always stay.')}</span>
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </SheetModal>
    );
}
