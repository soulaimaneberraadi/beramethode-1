/**
 * Reglages d'ecriture du numero : taille, ecart, repetitions, et style
 * (ecriture, gras, penche). Le meme formulaire sert dans l'apercu d'un trace
 * et dans les reglages par defaut de l'entreprise.
 */
import React from 'react';
import type { ReglagesNumero } from '../../types';
import { tx } from '../../lib/i18n';
import { useLang } from '../../src/context/LanguageContext';
import { MODELES_TEXTE, texteNumero } from '../../lib/numerotationPlt';

interface Props {
    valeur: ReglagesNumero;
    onChange: (r: ReglagesNumero) => void;
    /** Numero d'exemple pour montrer l'ecriture choisie. */
    exemple?: string;
    /** Transparence de l'apercu : utile dans l'apercu, pas dans un reglage d'entreprise sans trace. */
    avecOpacite?: boolean;
    /** Code de la matiere pour l'exemple (« TE »). */
    code?: string;
    /** Dans un volet etroit : deux colonnes, quelle que soit la largeur de l'ecran. */
    etroit?: boolean;
}

const FORMATS: NonNullable<ReglagesNumero['format']>[] = ['nu', 'parentheses', 'crochets', 'no', 'tirets'];

export default function ReglagesNumeroForm({ valeur, onChange, exemple = '77', avecOpacite = true, code = 'TE', etroit = false }: Props) {
    const { lang } = useLang();
    const L = (fr: string, ar: string, en: string) => tx(lang, { fr, ar, en });
    const maj = (patch: Partial<ReglagesNumero>) => onChange({ ...valeur, ...patch });

    // number | '' : un champ vide reste vide (pas de « 040 » en tapant).
    const champ = (label: string, cle: 'hauteurCm' | 'largeurCm' | 'ecartMm' | 'repetitions', pas: string, aide?: string) => (
        <label className="block" title={aide}>
            <span className="block text-[10px] font-bold text-slate-400 dark:text-dk-muted mb-1 uppercase tracking-wide">{label}</span>
            <input
                type="number"
                step={pas}
                min="0"
                value={valeur[cle] || ''}
                onChange={e => maj({ [cle]: e.target.value === '' ? 0 : Number(e.target.value) } as Partial<ReglagesNumero>)}
                className="w-full h-10 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-lg px-2.5 text-[13px] font-semibold text-slate-800 dark:text-dk-text outline-none focus:bg-white focus:border-emerald-400"
            />
        </label>
    );

    const puce = (actif: boolean) => `h-9 px-3 rounded-lg text-[12px] font-bold whitespace-nowrap border transition-colors ${actif
        ? 'bg-slate-900 dark:bg-dk-accent border-slate-900 dark:border-dk-accent text-white'
        : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft hover:border-slate-400'}`;

    return (
        <div className="space-y-3">
            <div className={`grid grid-cols-2 gap-2.5 ${etroit ? '' : 'sm:grid-cols-4'}`}>
                {champ(L('Hauteur cm', 'الارتفاع سم', 'Height cm'), 'hauteurCm', '0.1', L('Hauteur des chiffres : la taille maximale, reduite seulement si la piece est trop petite', 'ارتفاع الأرقام: الحجم الأقصى، ويُصغَّر فقط إذا كانت القطعة صغيرة', 'Digit height'))}
                {champ(L('Largeur cm', 'العرض سم', 'Width cm'), 'largeurCm', '0.1', L('Largeur de chaque chiffre', 'عرض كل رقم', 'Digit width'))}
                {champ(L('Ecart mm', 'الفاصل مم', 'Gap mm'), 'ecartMm', '1', L('Distance au nom de la piece', 'المسافة عن اسم القطعة', 'Distance to the piece name'))}
                {champ(L('Fois par piece', 'مرّات في القطعة', 'Times per piece'), 'repetitions', '1', L('Combien de fois le numero est ecrit dans chaque piece', 'كم مرّة يُكتب الرقم في كل قطعة', 'How many times per piece'))}
            </div>

            <div>
                <span className="block text-[10px] font-bold text-slate-400 dark:text-dk-muted mb-1 uppercase tracking-wide">{L('Texte ecrit dans la piece', 'النص المكتوب في القطعة', 'Text written in the piece')}</span>
                <div className="flex flex-wrap items-center gap-1">
                    {MODELES_TEXTE.map(m => (
                        <button key={m} type="button" onClick={() => maj({ modele: m })} className={puce((valeur.modele || '{n}') === m)}>
                            {texteNumero(exemple, { format: valeur.format, modele: m }, { code })}
                        </button>
                    ))}
                    <input
                        value={MODELES_TEXTE.includes(valeur.modele || '{n}') ? '' : (valeur.modele || '')}
                        onChange={e => maj({ modele: e.target.value || '{n}' })}
                        placeholder={L('Autre : {n} {code} ...', 'آخر: {n} {code} ...', 'Other: {n} {code} ...')}
                        title={L('{n} = numero du matelas · {code} = code de la matiere (TE, VSLIN...) · {pl} = placement', '{n} = رقم المفرشة · {code} = رمز المادة · {pl} = التركيبة', '{n} = lay number · {code} = material code · {pl} = placement')}
                        className="h-9 w-44 px-2.5 rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-[12px] font-semibold outline-none focus:border-emerald-400"
                    />
                </div>
            </div>

            <div className="flex flex-wrap items-end gap-x-4 gap-y-2.5">
                <div>
                    <span className="block text-[10px] font-bold text-slate-400 dark:text-dk-muted mb-1 uppercase tracking-wide">{L('Ecriture', 'الكتابة', 'Style')}</span>
                    <div className="flex flex-wrap gap-1">
                        {FORMATS.map(f => (
                            <button key={f} type="button" onClick={() => maj({ format: f })} className={puce((valeur.format || 'nu') === f)}>
                                {texteNumero(exemple, { format: f })}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <span className="block text-[10px] font-bold text-slate-400 dark:text-dk-muted mb-1 uppercase tracking-wide">{L('Cadre', 'الإطار', 'Frame')}</span>
                    <div className="flex gap-1">
                        <button type="button" onClick={() => maj({ cercle: false })} className={puce(!valeur.cercle)}>{L('Sans', 'بدون', 'None')}</button>
                        <button type="button" onClick={() => maj({ cercle: true })} className={puce(!!valeur.cercle)} title={L('Le texte entoure d’un cadre rond : on le trouve d’un coup d’oeil sur la piece', 'النص داخل إطار دائري: يُرى بسرعة على القطعة', 'Text inside a round frame')}>
                            <span className="inline-flex items-center justify-center px-1.5 h-5 rounded-full border-[1.5px] border-current leading-none">{exemple}</span>
                        </button>
                    </div>
                </div>
                <div>
                    <span className="block text-[10px] font-bold text-slate-400 dark:text-dk-muted mb-1 uppercase tracking-wide">{L('Trait', 'الخط', 'Stroke')}</span>
                    <div className="flex gap-1">
                        <button type="button" onClick={() => maj({ gras: false })} className={puce(!valeur.gras)}>{L('Normal', 'عادي', 'Normal')}</button>
                        <button type="button" onClick={() => maj({ gras: true })} className={`${puce(!!valeur.gras)} font-black`} title={L('Trait double : plus lisible sur tissu fonce. Optitex le lit comme deux textes : a eviter si le fichier repasse par Optitex.', 'خط مزدوج: أوضح على الثوب الداكن. Optitex يقرؤه كنصّين: تجنّبه إذا مرّ الملف عبر Optitex.', 'Double stroke: Optitex reads it as two texts')}>{L('Gras', 'عريض', 'Bold')}</button>
                    </div>
                </div>
                <div>
                    <span className="block text-[10px] font-bold text-slate-400 dark:text-dk-muted mb-1 uppercase tracking-wide">{L('Inclinaison', 'الميلان', 'Slant')}</span>
                    <div className="flex gap-1">
                        {[0, 15, 25].map(a => (
                            <button key={a} type="button" onClick={() => maj({ inclinaison: a })} className={puce((valeur.inclinaison || 0) === a)}>
                                <span style={{ display: 'inline-block', transform: `skewX(-${a}deg)` }}>{a === 0 ? L('Droit', 'مستقيم', 'Upright') : `${a}°`}</span>
                            </button>
                        ))}
                    </div>
                </div>
                {avecOpacite && (
                    <label className="flex-1 min-w-[160px]">
                        <span className="block text-[10px] font-bold text-slate-400 dark:text-dk-muted mb-1 uppercase tracking-wide">{L('Transparence (apercu)', 'الشفافية (المعاينة)', 'Preview opacity')} · {valeur.opacite ?? 60}%</span>
                        <input
                            type="range" min="20" max="100" value={valeur.opacite ?? 60}
                            onChange={e => maj({ opacite: Number(e.target.value) })}
                            className="w-full h-10 accent-emerald-600"
                        />
                    </label>
                )}
            </div>
        </div>
    );
}
