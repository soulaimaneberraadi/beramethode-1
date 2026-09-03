import React, { useState } from 'react';
import { CalendarPlus, LineChart } from 'lucide-react';
import SheetModal from '../components/shared/SheetModal';
import { tx } from '../lib/i18n';
import { useLang } from '../src/context/LanguageContext';

/* Envoyer un modele vers le Planning (ou lancer son suivi) demandait jusqu'ici
   un window.confirm et un window.prompt : le prompt acceptait n'importe quel
   texte comme nom de chaine, et sur telephone ces boites systeme sont a peine
   lisibles. Ici la chaine se choisit dans la liste reelle, et la DDS se pose
   tout de suite — sans elle, tout le calcul de retard du planning serait faux. */

export type EnvoiPlanningMode = 'planning' | 'suivi';

interface Props {
    mode: EnvoiPlanningMode;
    modelName: string;
    chains: string[];
    chaineParDefaut: string;
    quantiteParDefaut: number;
    onClose: () => void;
    onConfirm: (v: { chaineId: string; dateLancement: string; dds: string; quantite: number }) => void;
}

const aujourdhui = () => new Date().toISOString().split('T')[0];

export default function EnvoiPlanningModal({
    mode, modelName, chains, chaineParDefaut, quantiteParDefaut, onClose, onConfirm,
}: Props) {
    const { lang } = useLang();
    const [chaineId, setChaineId] = useState(chains.includes(chaineParDefaut) ? chaineParDefaut : (chains[0] || 'CHAINE 1'));
    const [dateLancement, setDateLancement] = useState(aujourdhui());
    const [dds, setDds] = useState('');
    const [quantite, setQuantite] = useState<number | ''>(quantiteParDefaut > 0 ? quantiteParDefaut : '');

    const estPlanning = mode === 'planning';

    const titre = estPlanning
        ? tx(lang, { fr: 'Envoyer vers le Planning', ar: 'إرسال إلى التخطيط', en: 'Send to Planning', es: 'Enviar a Planificación', pt: 'Enviar para o Planeamento', tr: "Planlamaya gönder" })
        : tx(lang, { fr: 'Lancer le suivi', ar: 'بدء المتابعة', en: 'Start tracking', es: 'Iniciar seguimiento', pt: 'Iniciar acompanhamento', tr: 'Takibi başlat' });

    const champ = 'w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-elevated/60 px-3 text-[14px] font-bold text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500';
    const etiquette = 'block mb-1 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-dk-muted';

    return (
        <SheetModal
            onClose={onClose}
            size="sm"
            zClass="z-[200]"
            title={titre}
            subtitle={modelName}
            icon={estPlanning ? <CalendarPlus className="w-4 h-4" /> : <LineChart className="w-4 h-4" />}
            footer={
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 min-h-[44px] rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-[13px] font-black text-slate-600 dark:text-dk-text-soft"
                    >
                        {tx(lang, { fr: 'Annuler', ar: 'إلغاء', en: 'Cancel', es: 'Cancelar', pt: 'Cancelar', tr: 'İptal' })}
                    </button>
                    <button
                        type="button"
                        onClick={() => onConfirm({
                            chaineId,
                            dateLancement: dateLancement || aujourdhui(),
                            dds: dds || dateLancement || aujourdhui(),
                            quantite: quantite === '' ? 0 : Number(quantite),
                        })}
                        className="flex-1 min-h-[44px] rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-black"
                    >
                        {tx(lang, { fr: 'Confirmer', ar: 'تأكيد', en: 'Confirm', es: 'Confirmar', pt: 'Confirmar', tr: 'Onayla' })}
                    </button>
                </div>
            }
        >
            <div className="space-y-3">
                <label className="block">
                    <span className={etiquette}>{tx(lang, { fr: 'Chaîne', ar: 'السلسلة', en: 'Line', es: 'Cadena', pt: 'Linha', tr: 'Hat' })}</span>
                    <select value={chaineId} onChange={(e) => setChaineId(e.target.value)} className={champ}>
                        {chains.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </label>

                <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                        <span className={etiquette}>{tx(lang, { fr: 'Lancement', ar: 'الانطلاق', en: 'Start', es: 'Lanzamiento', pt: 'Lançamento', tr: 'Başlangıç' })}</span>
                        <input type="date" value={dateLancement} onChange={(e) => setDateLancement(e.target.value)} className={champ} />
                    </label>
                    <label className="block">
                        <span className={etiquette}>{tx(lang, { fr: 'DDS (livraison)', ar: 'تاريخ التسليم', en: 'Due date', es: 'Fecha de entrega', pt: 'Data de entrega', tr: 'Teslim tarihi' })}</span>
                        <input type="date" value={dds} onChange={(e) => setDds(e.target.value)} className={champ} />
                    </label>
                </div>

                <label className="block">
                    <span className={etiquette}>{tx(lang, { fr: 'Quantité', ar: 'الكمية', en: 'Quantity', es: 'Cantidad', pt: 'Quantidade', tr: 'Miktar' })}</span>
                    <input
                        type="number"
                        min={0}
                        placeholder="0"
                        value={quantite}
                        onChange={(e) => setQuantite(e.target.value === '' ? '' : Number(e.target.value))}
                        className={champ}
                    />
                </label>

                {!dds && (
                    <p className="text-[11px] font-bold text-amber-600 dark:text-amber-300">
                        {tx(lang, {
                            fr: "Sans DDS, le planning ne peut pas calculer le retard : elle sera posée au jour de lancement.",
                            ar: 'بلا تاريخ تسليم، لا يستطيع التخطيط حساب التأخير: سيُوضَع يوم الانطلاق.',
                            en: 'Without a due date the planning cannot compute delay: it will be set to the start day.',
                            es: 'Sin fecha de entrega la planificación no puede calcular el retraso: se usará el día de lanzamiento.',
                            pt: 'Sem data de entrega o planeamento não calcula o atraso: será o dia de lançamento.',
                            tr: 'Teslim tarihi olmadan planlama gecikmeyi hesaplayamaz: başlangıç günü kullanılır.',
                        })}
                    </p>
                )}
            </div>
        </SheetModal>
    );
}
