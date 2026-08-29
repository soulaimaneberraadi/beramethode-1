import { montantEnLettres } from '../../lib/montantEnLettres';

/**
 * La situation de compte : le document qu'on envoie au client a la place d'un
 * long message.
 *
 * Un message WhatsApp resume ; ce document PROUVE. Il porte l'identite des
 * deux parties, chaque facture avec sa livraison et son echeance, chaque
 * versement avec sa date et son mode, le solde, et — c'est le point qui evite
 * la discussion — le nombre de jours qui restent avant chaque echeance, ou
 * ceux de retard quand elle est passee.
 *
 * On l'imprime, et « Enregistrer en PDF » suffit a le joindre.
 */
export type FactureReleve = {
    numero: string;
    dateFacture: string | null;
    dateLivraison: string | null;
    dateEcheance: string | null;
    totalTtc: number;
    montantPaye: number;
    reste: number;
};

export type PaiementReleve = {
    date: string;
    montant: number;
    mode: string | null;
    reference: string | null;
    facture: string;
};

export type DonneesReleve = {
    emetteur: any;
    client: { nom: string; tel: string | null; ville: string | null; adresse?: string | null; ice: string | null; ifFiscal?: string | null; rc?: string | null };
    factures: FactureReleve[];
    paiements: PaiementReleve[];
    garanties: Array<{ type: string; numero: string | null; banque: string | null; montant: number; dateEcheance: string | null }>;
};

const nf = (n: number) => (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const jjmmaaaa = (v?: string | null) => (v ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : '—');
const esc = (v: any) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const aujourdhui = () => new Date().toISOString().slice(0, 10);

/** Jours restants avant l'echeance ; negatif quand elle est depassee. */
const joursAvant = (echeance: string | null) => {
    if (!echeance) return null;
    const j = 86400000;
    return Math.round((new Date(`${echeance}T00:00:00`).getTime() - new Date(`${aujourdhui()}T00:00:00`).getTime()) / j);
};

const delai = (f: FactureReleve) => {
    if (f.reste <= 0.009) return '<span class="ok">soldee</span>';
    const j = joursAvant(f.dateEcheance);
    if (j == null) return '<span class="gris">non fixee</span>';
    if (j < 0) return `<span class="retard">+${Math.abs(j)} j de retard</span>`;
    if (j === 0) return '<span class="retard">echoit aujourd\'hui</span>';
    return `<span class="ok">${j} j restants</span>`;
};

export const htmlReleve = (d: DonneesReleve, devise = 'MAD', imprimer = true) => {
    const totalFacture = d.factures.reduce((a, f) => a + f.totalTtc, 0);
    const totalPaye = d.factures.reduce((a, f) => a + f.montantPaye, 0);
    const solde = Math.max(0, totalFacture - totalPaye);
    const impayees = d.factures.filter(f => f.reste > 0.009);

    // La plus proche echeance encore due : c'est la date qui compte pour le
    // client, pas la moyenne de toutes.
    const prochaine = impayees
        .filter(f => f.dateEcheance)
        .sort((a, b) => (a.dateEcheance || '').localeCompare(b.dateEcheance || ''))[0];
    const jProchaine = prochaine ? joursAvant(prochaine.dateEcheance) : null;
    const enRetard = impayees.filter(f => { const j = joursAvant(f.dateEcheance); return j != null && j < 0; });
    const montantRetard = enRetard.reduce((a, f) => a + f.reste, 0);

    return `<!doctype html><html lang="fr"><head><meta charset="utf-8" />
<title>Situation ${esc(d.client.nom)} ${aujourdhui()}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #0f172a; font-size: 10.5px; margin: 0; }
  header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
  .ident strong { font-size: 15px; display: block; }
  .ident span, .client span { display: block; font-size: 9px; color: #475569; }
  .client { text-align: right; }
  .client strong { font-size: 13px; display: block; }
  h1 { font-size: 13px; letter-spacing: .1em; text-align: center; margin: 12px 0;
       border-top: 1px solid #0f172a; border-bottom: 1px solid #0f172a; padding: 5px 0; }
  h2 { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #475569;
       margin: 14px 0 5px; padding-bottom: 3px; border-bottom: 1px solid #cbd5e1; }
  .cartes { display: flex; gap: 8px; }
  .carte { flex: 1; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px; }
  .carte span { display: block; font-size: 8px; text-transform: uppercase; letter-spacing: .06em; color: #64748b; }
  .carte strong { font-size: 14px; }
  .carte.due strong { color: #b45309; }
  .carte.retard strong { color: #be123c; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 3.5px 5px; border-bottom: 1px solid #e2e8f0; text-align: left; vertical-align: top; }
  thead th { font-size: 8.5px; text-transform: uppercase; letter-spacing: .05em; color: #475569; border-bottom: 1px solid #0f172a; }
  .n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tfoot td { font-weight: 800; border-top: 1px solid #0f172a; border-bottom: none; }
  .ok { color: #047857; font-weight: 700; }
  .retard { color: #be123c; font-weight: 800; }
  .gris { color: #94a3b8; }
  .final { margin-top: 12px; padding: 9px 12px; border: 1.5px solid #0f172a; border-radius: 6px;
           display: flex; justify-content: space-between; align-items: baseline; }
  .final strong { font-size: 18px; }
  .lettres { font-size: 9px; font-style: italic; color: #475569; margin: 4px 0 0; }
  .signatures { display: flex; justify-content: space-between; margin-top: 26px; font-size: 9px; color: #475569; }
  .signatures span { border-top: 1px solid #cbd5e1; padding-top: 3px; width: 40%; text-align: center; }
  .pied { margin-top: 10px; font-size: 8px; color: #94a3b8; text-align: center; }
</style></head>
<body>
  <header>
    <div class="ident">
      ${d.emetteur?.logo ? `<img src="${esc(d.emetteur.logo)}" alt="" style="height:34px;object-fit:contain;display:block;margin-bottom:4px" />` : ''}
      <strong>${esc(d.emetteur?.nom || '')}</strong>
      ${d.emetteur?.adresse ? `<span>${esc(d.emetteur.adresse)}${d.emetteur.ville ? ', ' + esc(d.emetteur.ville) : ''}</span>` : ''}
      ${d.emetteur?.tel ? `<span>Tel ${esc(d.emetteur.tel)}</span>` : ''}
      ${d.emetteur?.ice ? `<span>ICE ${esc(d.emetteur.ice)}</span>` : ''}
      ${d.emetteur?.rib ? `<span>RIB ${esc(d.emetteur.rib)}</span>` : ''}
    </div>
    <div class="client">
      <strong>${esc(d.client.nom)}</strong>
      ${d.client.adresse || d.client.ville ? `<span>${esc([d.client.adresse, d.client.ville].filter(Boolean).join(', '))}</span>` : ''}
      ${d.client.tel ? `<span>${esc(d.client.tel)}</span>` : ''}
      ${d.client.ice ? `<span>ICE ${esc(d.client.ice)}</span>` : ''}
      ${d.client.ifFiscal ? `<span>IF ${esc(d.client.ifFiscal)}</span>` : ''}
      ${d.client.rc ? `<span>RC ${esc(d.client.rc)}</span>` : ''}
      <span>Edite le ${jjmmaaaa(aujourdhui())}</span>
    </div>
  </header>

  <h1>SITUATION DE COMPTE</h1>

  <div class="cartes">
    <div class="carte"><span>Total facture</span><strong>${nf(totalFacture)}</strong></div>
    <div class="carte"><span>Total regle</span><strong>${nf(totalPaye)}</strong></div>
    <div class="carte due"><span>Reste du</span><strong>${nf(solde)}</strong></div>
    <div class="carte ${montantRetard > 0 ? 'retard' : ''}">
      <span>${montantRetard > 0 ? 'Dont echu' : 'Prochaine echeance'}</span>
      <strong>${montantRetard > 0 ? nf(montantRetard) : (prochaine ? `${jProchaine} j` : '—')}</strong>
    </div>
  </div>

  <h2>Factures</h2>
  <table>
    <thead><tr>
      <th>Facture</th><th>Emise</th><th>Livree</th><th>Echeance</th>
      <th class="n">Montant</th><th class="n">Regle</th><th class="n">Reste</th><th>Delai</th>
    </tr></thead>
    <tbody>
      ${d.factures.length ? d.factures.map(f => `<tr>
        <td><strong>${esc(f.numero)}</strong></td>
        <td>${jjmmaaaa(f.dateFacture)}</td>
        <td>${jjmmaaaa(f.dateLivraison)}</td>
        <td>${jjmmaaaa(f.dateEcheance)}</td>
        <td class="n">${nf(f.totalTtc)}</td>
        <td class="n">${nf(f.montantPaye)}</td>
        <td class="n"><strong>${f.reste > 0.009 ? nf(f.reste) : '—'}</strong></td>
        <td>${delai(f)}</td>
      </tr>`).join('') : '<tr><td colspan="8">Aucune facture.</td></tr>'}
    </tbody>
    <tfoot><tr>
      <td colspan="4">Totaux</td>
      <td class="n">${nf(totalFacture)}</td>
      <td class="n">${nf(totalPaye)}</td>
      <td class="n">${nf(solde)}</td><td></td>
    </tr></tfoot>
  </table>

  <h2>Versements recus</h2>
  <table>
    <thead><tr><th>Date</th><th>Mode</th><th>Reference</th><th>Sur facture</th><th class="n">Montant</th></tr></thead>
    <tbody>
      ${d.paiements.length ? d.paiements.map(p => `<tr>
        <td>${jjmmaaaa(p.date)}</td>
        <td>${esc(p.mode || '—')}</td>
        <td>${esc(p.reference || '—')}</td>
        <td>${esc(p.facture)}</td>
        <td class="n"><strong>${nf(p.montant)}</strong></td>
      </tr>`).join('') : '<tr><td colspan="5">Aucun versement enregistre.</td></tr>'}
    </tbody>
    <tfoot><tr><td colspan="4">Total encaisse</td><td class="n">${nf(d.paiements.reduce((a, p) => a + p.montant, 0))}</td></tr></tfoot>
  </table>

  ${d.garanties.length ? `<h2>Garanties detenues</h2>
  <table>
    <thead><tr><th>Type</th><th>Numero</th><th>Banque</th><th>Echeance</th><th class="n">Montant</th></tr></thead>
    <tbody>${d.garanties.map(g => `<tr>
      <td>${esc(g.type)}</td><td>${esc(g.numero || '—')}</td><td>${esc(g.banque || '—')}</td>
      <td>${jjmmaaaa(g.dateEcheance)}</td><td class="n">${nf(g.montant)}</td>
    </tr>`).join('')}</tbody>
  </table>
  <p class="pied">Ces effets sont conserves en garantie et restitues au reglement integral du solde.</p>` : ''}

  <div class="final"><span>Solde restant du a ce jour</span><strong>${nf(solde)} ${esc(devise)}</strong></div>
  <p class="lettres">${esc(montantEnLettres(solde, devise))}</p>

  <div class="signatures"><span>Le client</span><span>Pour ${esc(d.emetteur?.nom || 'la societe')}</span></div>
${imprimer ? "<script>window.addEventListener('load', () => setTimeout(() => { window.focus(); window.print(); }, 250));<\/script>" : ''}
</body></html>`;
};
