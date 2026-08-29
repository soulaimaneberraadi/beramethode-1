import React from 'react';
import { Phone, MessageCircle, Copy, Check } from 'lucide-react';
import { Flottant } from './champs';

const nf = (n: number) => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const jjmmaaaa = (v?: string | null) => (v ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : '');

/**
 * Un numero marocain s'ecrit 06 12 34 56 78 au comptoir et 212612345678 dans
 * un lien WhatsApp. La conversion se fait ici, une fois : un chiffre de trop
 * et le message part a un inconnu.
 */
export const versInternational = (tel: string, indicatif = '212') => {
    const chiffres = String(tel || '').replace(/\D/g, '');
    if (!chiffres) return null;
    if (chiffres.startsWith('00')) return chiffres.slice(2);
    if (chiffres.startsWith(indicatif)) return chiffres;
    // 0612345678 -> 212612345678 : le zero national tombe.
    if (chiffres.startsWith('0')) return indicatif + chiffres.slice(1);
    return chiffres.length <= 9 ? indicatif + chiffres : chiffres;
};

export type RelanceInfos = {
    nom: string;
    encours: number;
    devise: string;
    societe?: string | null;
    factures?: Array<{ numero: string; reste: number; dateEcheance?: string | null; retardJours?: number }>;
};

/**
 * Le message de relance, ecrit d'avance.
 *
 * Il rappelle les factures et le total, mais reste courtois et sans menace :
 * une relance qui vexe fait perdre le client ET l'argent. Le vendeur peut
 * toujours le retoucher — WhatsApp l'ouvre en brouillon, il ne l'envoie pas.
 */
export const messageRelance = (i: RelanceInfos) => {
    const lignes: string[] = [];
    lignes.push(`Bonjour ${i.nom},`);
    lignes.push('');
    if (i.factures?.length) {
        lignes.push('Recapitulatif de votre compte :');
        for (const f of i.factures) {
            const retard = f.retardJours && f.retardJours > 0 ? ` (echue depuis ${f.retardJours} j)` : '';
            const ech = f.dateEcheance ? ` - echeance ${jjmmaaaa(f.dateEcheance)}` : '';
            lignes.push(`- ${f.numero} : ${nf(f.reste)} ${i.devise}${ech}${retard}`);
        }
        lignes.push('');
    }
    lignes.push(`Solde restant du : ${nf(i.encours)} ${i.devise}`);
    lignes.push('');
    lignes.push('Merci de nous indiquer la date de reglement prevue.');
    if (i.societe) lignes.push(`Cordialement, ${i.societe}`);
    return lignes.join('\n');
};

/**
 * Le numero devient un bouton : appeler, ou ouvrir WhatsApp avec la relance
 * deja redigee. Le releve en PDF s'obtient a cote (impression - Enregistrer
 * en PDF) : aucun lien WhatsApp ne peut joindre un fichier tout seul, et
 * pretendre le contraire ferait croire a un envoi qui n'a pas eu lieu.
 */
const ContactClient: React.FC<{
    tel: string | null;
    relance?: RelanceInfos;
    onReleve?: () => void;
    compact?: boolean;
}> = ({ tel, relance, onReleve, compact }) => {
    const [ouvert, setOuvert] = React.useState(false);
    const [copie, setCopie] = React.useState(false);
    const ancre = React.useRef<HTMLButtonElement>(null);
    const boite = React.useRef<HTMLSpanElement>(null);

    React.useEffect(() => {
        if (!ouvert) return;
        const dehors = (e: MouseEvent) => {
            const cible = e.target as HTMLElement;
            if (boite.current?.contains(cible)) return;
            if (cible?.closest?.('[data-contact]')) return;
            setOuvert(false);
        };
        const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false); };
        document.addEventListener('mousedown', dehors);
        document.addEventListener('keydown', echap);
        return () => { document.removeEventListener('mousedown', dehors); document.removeEventListener('keydown', echap); };
    }, [ouvert]);

    if (!tel) return null;
    const international = versInternational(tel);

    const action = (cls: string) => `w-full text-left px-2.5 py-2 text-[11px] font-bold flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 ${cls}`;

    return (
        <span ref={boite} className="inline-flex">
            <button
                ref={ancre}
                type="button"
                onClick={e => { e.stopPropagation(); setOuvert(v => !v); }}
                className={`inline-flex items-center gap-1 rounded-md hover:text-slate-900 dark:hover:text-dk-text hover:underline decoration-slate-300 underline-offset-2 ${compact ? '' : 'px-0.5'}`}
            >
                <Phone className="w-3 h-3" />{tel}
            </button>

            {ouvert && (
                <Flottant ancre={ancre}>
                    <span data-contact className="block min-w-[190px] py-1">
                        <a
                            href={`tel:${international || tel}`}
                            onClick={() => setOuvert(false)}
                            className={action('text-slate-700 dark:text-dk-text-soft')}
                        >
                            <Phone className="w-3.5 h-3.5 text-slate-400" /> Appeler
                        </a>

                        {relance && (
                            <a
                                href={`https://wa.me/${international}?text=${encodeURIComponent(messageRelance(relance))}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => setOuvert(false)}
                                className={action('text-emerald-700 dark:text-emerald-400')}
                            >
                                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp — relance
                            </a>
                        )}

                        {onReleve && (
                            <button
                                type="button"
                                onClick={() => { setOuvert(false); onReleve(); }}
                                className={action('text-slate-700 dark:text-dk-text-soft')}
                            >
                                <Copy className="w-3.5 h-3.5 text-slate-400" /> Releve en PDF a joindre
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={() => {
                                navigator.clipboard?.writeText(tel).then(() => {
                                    setCopie(true);
                                    window.setTimeout(() => setCopie(false), 1500);
                                }).catch(() => undefined);
                            }}
                            className={action('text-slate-500 dark:text-dk-muted')}
                        >
                            {copie ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                            {copie ? 'Copie' : 'Copier le numero'}
                        </button>
                    </span>
                </Flottant>
            )}
        </span>
    );
};

export default ContactClient;
