/**
 * La facture imprimable.
 *
 * Une facture n'est pas un écran : c'est une pièce comptable que le client
 * dépose chez son comptable, et qui doit porter les mentions exigées par
 * l'article 145 du CGI et la loi 69-21 sur les délais de paiement. Il en
 * manque une, et la facture est refusée — elle n'est plus déductible.
 *
 * Tout ce qui s'imprime ici vient de la facture ELLE-MÊME (émetteur compris,
 * recopié à l'émission) : rien n'est relu dans les réglages, sinon une
 * facture déjà remise changerait le jour où l'entreprise déménage.
 */
import { montantEnLettres } from './montantEnLettres';

export interface LigneFacture {
    designation: string;
    quantite: number;
    prix_unitaire: number;
    total: number;
    /** Taux de TVA de la ligne, en %. Absent → taux global de la facture. */
    taux_tva?: number;
}

export interface FactureImprimable {
    numero: string;
    type?: string;
    date_facture: string;
    date_echeance?: string | null;
    tiers_nom: string;
    tiers_ice?: string | null;
    tiers_if?: string | null;
    tiers_rc?: string | null;
    tiers_adresse?: string | null;
    tiers_tel?: string | null;
    total_ht: number;
    taux_tva?: number | null;
    total_tva?: number | null;
    total_ttc: number;
    montant_paye?: number | null;
    notes?: string | null;
    lignes: LigneFacture[];
    emetteur?: Record<string, any> | null;
    conditions_paiement?: string | null;
    penalite_retard?: number | null;
    devise?: string;
}

const esc = (v: any): string => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const nf = (n: number) => (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dateFr = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(`${iso}T00:00:00`);
    return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('fr-FR');
};

/** Une mention ne s'imprime que si elle a une valeur : une facture qui
 *  affiche « ICE : — » a l'air fausse, mieux vaut ne rien écrire. */
const mention = (label: string, valeur: any) =>
    valeur ? `<span>${esc(label)} : <b>${esc(valeur)}</b></span>` : '';

/**
 * Totaux par taux de TVA.
 *
 * Une facture peut mélanger des taux (20 % sur le vêtement, 10 % sur une
 * prestation) : la loi demande le détail de la taxe PAR taux, et un total
 * unique masquerait lequel s'applique à quoi.
 */
const parTaux = (f: FactureImprimable) => {
    const global = Number(f.taux_tva) || 0;
    const map = new Map<number, { ht: number; tva: number }>();
    for (const l of f.lignes) {
        const taux = l.taux_tva == null ? global : Number(l.taux_tva) || 0;
        const ht = Number(l.total) || 0;
        const acc = map.get(taux) || { ht: 0, tva: 0 };
        acc.ht += ht;
        acc.tva += ht * (taux / 100);
        map.set(taux, acc);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
};

export const buildFactureHtml = (f: FactureImprimable): string => {
    const e = f.emetteur || {};
    const devise = f.devise || 'MAD';
    const taux = parTaux(f);
    const resteADevoir = Math.max(0, (Number(f.total_ttc) || 0) - (Number(f.montant_paye) || 0));

    const enteteEmetteur = `
        <div class="emetteur">
            ${e.logo ? `<img class="logo" src="${esc(e.logo)}" alt="" />` : ''}
            <div>
                <div class="nom">${esc(e.nom || '')}</div>
                <div class="lignes-mentions">
                    ${mention('Forme', e.formeJuridique)}
                    ${e.capitalSocial ? `<span>Capital : <b>${nf(e.capitalSocial)} ${esc(devise)}</b></span>` : ''}
                    ${mention('Adresse', [e.adresse, e.ville].filter(Boolean).join(', '))}
                    ${mention('Tél', e.tel)}
                    ${mention('Email', e.email)}
                    ${mention('ICE', e.ice)}
                    ${mention('IF', e.identifiantFiscal)}
                    ${mention('RC', [e.rc, e.rcVille].filter(Boolean).join(' — '))}
                    ${mention('TP', e.patente)}
                    ${mention('CNSS', e.cnss)}
                </div>
            </div>
        </div>`;

    const blocClient = `
        <div class="bloc">
            <div class="titre-bloc">Client</div>
            <div class="nom-client">${esc(f.tiers_nom)}</div>
            <div class="lignes-mentions">
                ${mention('ICE', f.tiers_ice)}
                ${mention('IF', f.tiers_if)}
                ${mention('RC', f.tiers_rc)}
                ${mention('Adresse', f.tiers_adresse)}
                ${mention('Tél', f.tiers_tel)}
            </div>
        </div>`;

    const lignes = f.lignes.map(l => {
        const t = l.taux_tva == null ? (Number(f.taux_tva) || 0) : Number(l.taux_tva) || 0;
        return `<tr>
            <td>${esc(l.designation)}</td>
            <td class="n">${nf(l.quantite)}</td>
            <td class="n">${nf(l.prix_unitaire)}</td>
            <td class="n">${t ? `${nf(t)} %` : '—'}</td>
            <td class="n b">${nf(l.total)}</td>
        </tr>`;
    }).join('');

    return `<!doctype html><html lang="fr"><head><meta charset="utf-8" />
<title>${esc(f.numero)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #0f172a; font-size: 11px; margin: 0; }
  .haut { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 10px; }
  .emetteur { display: flex; gap: 10px; align-items: flex-start; max-width: 62%; }
  .logo { width: 54px; height: 54px; object-fit: contain; }
  .nom { font-size: 15px; font-weight: 800; }
  .lignes-mentions { display: flex; flex-wrap: wrap; gap: 2px 10px; color: #475569; margin-top: 3px; font-size: 10px; }
  .doc { text-align: right; }
  .doc .type { font-size: 18px; font-weight: 900; letter-spacing: .06em; }
  .doc .num { font-size: 13px; font-weight: 800; margin-top: 2px; }
  .doc .dates { color: #475569; margin-top: 4px; font-size: 10px; }
  .blocs { display: flex; gap: 12px; margin-top: 12px; }
  .bloc { flex: 1; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; }
  .titre-bloc { font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: #64748b; font-weight: 800; }
  .nom-client { font-weight: 800; font-size: 12px; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 14px; }
  th { background: #0f172a; color: #fff; font-size: 9px; text-transform: uppercase; letter-spacing: .06em; padding: 6px 8px; text-align: left; }
  td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  td.n, th.n { text-align: right; }
  td.b { font-weight: 800; }
  .bas { display: flex; gap: 14px; margin-top: 12px; align-items: flex-start; }
  .totaux { margin-left: auto; min-width: 44%; }
  .totaux div { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #e2e8f0; }
  .totaux .ttc { border: none; background: #0f172a; color: #fff; padding: 8px 10px; border-radius: 6px; font-weight: 900; font-size: 13px; margin-top: 6px; }
  .lettres { flex: 1; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; }
  .pied { margin-top: 14px; padding-top: 8px; border-top: 1px solid #cbd5e1; color: #475569; font-size: 9.5px; display: flex; flex-direction: column; gap: 3px; }
  .sign { margin-top: 22px; display: flex; justify-content: flex-end; }
  .sign div { width: 190px; border-top: 1px solid #94a3b8; padding-top: 4px; text-align: center; color: #64748b; }
</style></head><body>

<div class="haut">
  ${enteteEmetteur}
  <div class="doc">
    <div class="type">${esc((f.type || 'FACTURE').toUpperCase())}</div>
    <div class="num">N° ${esc(f.numero)}</div>
    <div class="dates">
      Date : <b>${esc(dateFr(f.date_facture))}</b>
      ${f.date_echeance ? `<br />Échéance : <b>${esc(dateFr(f.date_echeance))}</b>` : ''}
    </div>
  </div>
</div>

<div class="blocs">${blocClient}</div>

<table>
  <thead><tr>
    <th>Désignation</th><th class="n">Qté</th><th class="n">P.U. HT</th><th class="n">TVA</th><th class="n">Total HT</th>
  </tr></thead>
  <tbody>${lignes}</tbody>
</table>

<div class="bas">
  <div class="lettres">
    <div class="titre-bloc">Arrêtée la présente facture à la somme de</div>
    <div style="font-weight:800;margin-top:3px">${esc(montantEnLettres(f.total_ttc, devise))}</div>
  </div>
  <div class="totaux">
    <div><span>Total HT</span><b>${nf(f.total_ht)} ${esc(devise)}</b></div>
    ${taux.map(([t, v]) => `<div><span>TVA ${nf(t)} %</span><b>${nf(v.tva)} ${esc(devise)}</b></div>`).join('')}
    <div class="ttc"><span>Total TTC</span><span>${nf(f.total_ttc)} ${esc(devise)}</span></div>
    ${Number(f.montant_paye) ? `<div><span>Déjà réglé</span><b>${nf(f.montant_paye)} ${esc(devise)}</b></div>
    <div><span>Reste à payer</span><b>${nf(resteADevoir)} ${esc(devise)}</b></div>` : ''}
  </div>
</div>

<div class="pied">
  ${f.conditions_paiement ? `<span><b>Conditions de règlement :</b> ${esc(f.conditions_paiement)}</span>` : ''}
  ${f.penalite_retard ? `<span><b>Pénalité de retard :</b> ${nf(f.penalite_retard)} % — applicable de plein droit passé l'échéance (loi 69-21).</span>` : ''}
  ${e.banque || e.rib ? `<span><b>Règlement :</b> ${esc([e.banque, e.rib].filter(Boolean).join(' — '))}</span>` : ''}
  ${f.notes ? `<span>${esc(f.notes)}</span>` : ''}
</div>

<div class="sign"><div>Signature et cachet</div></div>

<script>window.onload = function () { window.print(); };</` + `script>
</body></html>`;
};

/** Ouvre la facture dans une fenêtre prête à imprimer. */
export const imprimerFacture = (f: FactureImprimable) => {
    const w = window.open('', '_blank', 'width=900,height=1200');
    if (!w) return;
    w.document.write(buildFactureHtml(f));
    w.document.close();
};
