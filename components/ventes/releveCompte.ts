import { montantEnLettres } from '../../lib/montantEnLettres';

/**
 * Le releve de compte : le carnet de credit, imprime.
 *
 * Une ligne par mouvement, dans l'ordre du temps, avec le SOLDE COURANT a
 * droite. C'est ce solde qui se signe a deux — un total en bas de page ne
 * dit pas ou l'accord s'est rompu, la colonne de solde le montre a la ligne
 * pres.
 */
type LigneReleve = { date: string; libelle: string; debit: number; credit: number };

type DonneesReleve = {
    emetteur: any;
    client: { nom: string; tel: string | null; ville: string | null; ice: string | null };
    lignes: LigneReleve[];
    garanties: Array<{ type: string; numero: string | null; banque: string | null; montant: number; dateEcheance: string | null }>;
};

const nf = (n: number) => (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const jjmmaaaa = (v?: string | null) => (v ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : '—');
const esc = (v: any) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

export const ouvrirReleve = (d: DonneesReleve, devise = 'MAD') => {
    let solde = 0;
    const corps = d.lignes.map(l => {
        solde += l.debit - l.credit;
        return `<tr>
            <td>${jjmmaaaa(l.date)}</td>
            <td class="lib">${esc(l.libelle)}</td>
            <td class="n">${l.debit ? nf(l.debit) : ''}</td>
            <td class="n credit">${l.credit ? nf(l.credit) : ''}</td>
            <td class="n solde">${nf(solde)}</td>
        </tr>`;
    }).join('');

    const totalDebit = d.lignes.reduce((a, l) => a + l.debit, 0);
    const totalCredit = d.lignes.reduce((a, l) => a + l.credit, 0);

    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8" />
<title>Releve ${esc(d.client.nom)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #0f172a; font-size: 11px; margin: 0; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 14px; }
  .ident strong { font-size: 14px; display: block; }
  .ident span { display: block; font-size: 9px; color: #475569; }
  .client { text-align: right; }
  .client strong { font-size: 13px; }
  h1 { font-size: 13px; letter-spacing: .08em; text-align: center; margin: 6px 0 12px;
       border-top: 1px solid #0f172a; border-bottom: 1px solid #0f172a; padding: 5px 0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 4px 6px; border-bottom: 1px solid #e2e8f0; text-align: left; }
  thead th { font-size: 9px; text-transform: uppercase; letter-spacing: .06em; color: #475569; border-bottom: 1px solid #0f172a; }
  .n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .credit { color: #047857; }
  .solde { font-weight: 800; }
  tfoot td { font-weight: 800; border-top: 1px solid #0f172a; border-bottom: none; }
  .final { margin-top: 10px; padding: 8px 10px; border: 1px solid #0f172a; border-radius: 6px;
           display: flex; justify-content: space-between; align-items: baseline; }
  .final strong { font-size: 16px; }
  .lettres { font-size: 9px; font-style: italic; color: #475569; margin: 4px 0 0; }
  .garanties { margin-top: 12px; font-size: 10px; }
  .garanties h2 { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #475569; margin: 0 0 4px; }
  .signatures { display: flex; justify-content: space-between; margin-top: 28px; font-size: 9px; color: #475569; }
  .signatures span { border-top: 1px solid #cbd5e1; padding-top: 3px; width: 40%; text-align: center; }
</style></head>
<body>
  <header>
    <div class="ident">
      <strong>${esc(d.emetteur?.nom || '')}</strong>
      ${d.emetteur?.adresse ? `<span>${esc(d.emetteur.adresse)}${d.emetteur.ville ? ', ' + esc(d.emetteur.ville) : ''}</span>` : ''}
      ${d.emetteur?.tel ? `<span>Tel ${esc(d.emetteur.tel)}</span>` : ''}
      ${d.emetteur?.ice ? `<span>ICE ${esc(d.emetteur.ice)}</span>` : ''}
    </div>
    <div class="client">
      <strong>${esc(d.client.nom)}</strong>
      ${d.client.tel ? `<span>${esc(d.client.tel)}</span>` : ''}
      ${d.client.ville ? `<span>${esc(d.client.ville)}</span>` : ''}
      ${d.client.ice ? `<span>ICE ${esc(d.client.ice)}</span>` : ''}
      <span>Edite le ${jjmmaaaa(new Date().toISOString().slice(0, 10))}</span>
    </div>
  </header>

  <h1>RELEVE DE COMPTE</h1>

  <table>
    <thead><tr><th>Date</th><th>Libelle</th><th class="n">Debit</th><th class="n">Credit</th><th class="n">Solde</th></tr></thead>
    <tbody>${corps || '<tr><td colspan="5">Aucun mouvement.</td></tr>'}</tbody>
    <tfoot><tr><td colspan="2">Totaux</td><td class="n">${nf(totalDebit)}</td><td class="n credit">${nf(totalCredit)}</td><td class="n">${nf(solde)}</td></tr></tfoot>
  </table>

  <div class="final"><span>Solde du a ce jour</span><strong>${nf(Math.max(0, solde))} ${esc(devise)}</strong></div>
  <p class="lettres">${esc(montantEnLettres(Math.max(0, solde), devise))}</p>

  ${d.garanties.length ? `<div class="garanties">
    <h2>Garanties detenues</h2>
    ${d.garanties.map(g => `<div>${esc(g.type)}${g.numero ? ` n° ${esc(g.numero)}` : ''}${g.banque ? ` — ${esc(g.banque)}` : ''} · ${nf(g.montant)} ${esc(devise)}${g.dateEcheance ? ` · echeance ${jjmmaaaa(g.dateEcheance)}` : ''}</div>`).join('')}
  </div>` : ''}

  <div class="signatures"><span>Le client</span><span>Pour ${esc(d.emetteur?.nom || 'la societe')}</span></div>
<script>window.addEventListener('load', () => setTimeout(() => { window.focus(); window.print(); }, 250));</script>
</body></html>`;

    // Meme mecanique que le recu : un onglet ouvert par script est bloque.
    const cadre = document.createElement('iframe');
    cadre.setAttribute('aria-hidden', 'true');
    cadre.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(cadre);
    const doc = cadre.contentWindow?.document;
    if (!doc) { cadre.remove(); throw new Error('Impression indisponible dans ce navigateur.'); }
    doc.open();
    doc.write(html);
    doc.close();
    window.setTimeout(() => cadre.remove(), 60000);
};
