import { montantEnLettres } from '../../lib/montantEnLettres';

/**
 * Le recu de versement, tel qu'on le tend au client par-dessus le comptoir.
 *
 * Format ticket etroit (80 mm) : il sort de l'imprimante de caisse, se plie
 * et se garde. Deux exemplaires sur la meme page — un pour lui, un pour le
 * carnet — parce qu'un recu que le vendeur ne garde pas ne prouve rien le
 * jour ou le client revient avec le sien.
 */
export type DonneesRecu = {
    emetteur: any;
    paiement: { id: string; date: string; montant: number; mode: string | null; reference: string | null };
    facture: { numero: string; date: string | null; totalTtc: number; montantPaye: number; reste: number };
    client: { nom: string; tel: string | null; ville: string | null; adresse: string | null; ice: string | null };
    compte: { du: number; paye: number; reste: number };
};

const nf = (n: number) => (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const jjmmaaaa = (v?: string | null) => (v ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : '—');
/** Un identifiant technique (PAY_1788…_x9k2) n'est pas un numero de recu :
 *  on n'en garde que la fin, en majuscules, sans separateur. */
const numeroRecu = (id: string) => id.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();

const esc = (v: any) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

const exemplaire = (d: DonneesRecu, devise: string, pour: string) => `
<section class="recu">
  <header>
    ${d.emetteur?.logo ? `<img class="logo" src="${esc(d.emetteur.logo)}" alt="" />` : ''}
    <div>
      <strong>${esc(d.emetteur?.nom || '')}</strong>
      ${d.emetteur?.adresse ? `<span>${esc(d.emetteur.adresse)}${d.emetteur.ville ? ', ' + esc(d.emetteur.ville) : ''}</span>` : ''}
      ${d.emetteur?.tel ? `<span>Tel ${esc(d.emetteur.tel)}</span>` : ''}
      ${d.emetteur?.ice ? `<span>ICE ${esc(d.emetteur.ice)}</span>` : ''}
    </div>
  </header>

  <h1>RECU DE VERSEMENT</h1>
  <p class="ref">N° ${esc(numeroRecu(d.paiement.id))} &nbsp;·&nbsp; ${jjmmaaaa(d.paiement.date)} &nbsp;·&nbsp; <em>${esc(pour)}</em></p>

  <table class="infos">
    <tr><td>Recu de</td><th>${esc(d.client.nom)}</th></tr>
    ${d.client.tel ? `<tr><td>Telephone</td><th>${esc(d.client.tel)}</th></tr>` : ''}
    ${d.client.ice ? `<tr><td>ICE</td><th>${esc(d.client.ice)}</th></tr>` : ''}
    <tr><td>Mode</td><th>${esc(d.paiement.mode || '—')}${d.paiement.reference ? ` · ${esc(d.paiement.reference)}` : ''}</th></tr>
    <tr><td>Sur facture</td><th>${esc(d.facture.numero)} du ${jjmmaaaa(d.facture.date)}</th></tr>
  </table>

  <p class="montant"><span>Montant recu</span><strong>${nf(d.paiement.montant)} ${esc(devise)}</strong></p>
  <p class="lettres">${esc(montantEnLettres(d.paiement.montant, devise))}</p>

  <!-- La phrase qui protege les deux parties : sans elle, un recu ne dit pas
       ce qu'il reste, et le meme versement se rediscute le mois suivant. -->
  <table class="solde">
    <tr><td>Dette totale du compte</td><th>${nf(d.compte.du)}</th></tr>
    <tr><td>Deja regle</td><th>${nf(d.compte.paye)}</th></tr>
    <tr class="reste"><td>Reste du a ce jour</td><th>${nf(d.compte.reste)} ${esc(devise)}</th></tr>
  </table>

  <div class="signatures">
    <span>Le client</span>
    <span>Pour ${esc(d.emetteur?.nom || 'la societe')}</span>
  </div>
</section>`;

export type FormatRecu = 'TICKET' | 'A4';

/**
 * Deux formats pour le meme texte : la bande de caisse qu'on tend au client
 * au comptoir, et la feuille A4 qu'on classe ou qu'on envoie. Le contenu ne
 * change pas — seule la mise en page suit le papier disponible.
 */
export const htmlRecu = (d: DonneesRecu, devise = 'MAD', imprimer = true, format: FormatRecu = 'TICKET') => {
    const a4 = format === 'A4';
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8" />
<title>Recu ${esc(numeroRecu(d.paiement.id))}</title>
<style>
  @page { size: ${a4 ? 'A4' : '80mm auto'}; margin: ${a4 ? '14mm' : '4mm'}; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; color: #0f172a; background: #f1f5f9; }
  .feuille { width: ${a4 ? '190mm' : '80mm'}; max-width: 100%; margin: 0 auto; background: #fff; padding: ${a4 ? '10mm' : '4mm'}; }
  .recu { font-size: ${a4 ? '12px' : '10px'}; padding-bottom: ${a4 ? '14px' : '6px'}; }
  .recu + .recu { border-top: 1px dashed #94a3b8; padding-top: ${a4 ? '18px' : '8px'}; margin-top: ${a4 ? '18px' : '8px'}; }
  header { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
  header div { display: flex; flex-direction: column; line-height: 1.3; }
  header strong { font-size: ${a4 ? '16px' : '12px'}; }
  header span { font-size: ${a4 ? '10px' : '8px'}; color: #475569; }
  .logo { width: ${a4 ? '46px' : '32px'}; height: ${a4 ? '46px' : '32px'}; object-fit: contain; }
  h1 { font-size: ${a4 ? '14px' : '11px'}; letter-spacing: .08em; text-align: center; margin: 6px 0 2px; }
  .ref { text-align: center; font-size: 8px; color: #64748b; margin: 0 0 6px; }
  table { width: 100%; border-collapse: collapse; }
  .infos td, .infos th { padding: ${a4 ? '3px 0' : '1px 0'}; text-align: left; font-size: ${a4 ? '11px' : '9px'}; }
  .infos td { color: #64748b; width: 38%; font-weight: 400; }
  .montant { display: flex; justify-content: space-between; align-items: baseline; margin: 6px 0 2px;
             border-top: 1px solid #0f172a; border-bottom: 1px solid #0f172a; padding: 4px 0; }
  .montant span { font-size: 9px; color: #475569; }
  .montant strong { font-size: ${a4 ? '20px' : '14px'}; }
  .lettres { font-size: 8px; font-style: italic; color: #475569; margin: 0 0 6px; }
  .solde td, .solde th { font-size: ${a4 ? '11px' : '9px'}; padding: ${a4 ? '3px 0' : '1px 0'}; text-align: left; }
  .solde td { color: #64748b; font-weight: 400; }
  .solde th { text-align: right; }
  .solde .reste td, .solde .reste th { font-size: ${a4 ? '14px' : '11px'}; padding-top: 3px; border-top: 1px solid #cbd5e1; }
  .signatures { display: flex; justify-content: space-between; margin-top: ${a4 ? '34px' : '14px'}; font-size: ${a4 ? '10px' : '8px'}; color: #64748b; }
  .signatures span { border-top: 1px solid #cbd5e1; padding-top: 2px; width: 45%; text-align: center; }
  @media print { body { background: #fff; } .feuille { width: ${a4 ? 'auto' : '74mm'}; padding: 0; margin: 0; } }
</style></head>
<body><div class="feuille">
${exemplaire(d, devise, 'Exemplaire client')}
${exemplaire(d, devise, 'Exemplaire vendeur')}
</div>
${imprimer ? "<script>window.addEventListener('load', () => setTimeout(() => { window.focus(); window.print(); }, 250));<\/script>" : ''}
</body></html>`;

    return html;
};

/** Imprimer sans quitter la page : un onglet ouvert par script est bloque
 *  par defaut, un cadre invisible ne l est pas. */
export const imprimerHtml = (html: string) => {
    const cadre = document.createElement('iframe');
    cadre.setAttribute('aria-hidden', 'true');
    cadre.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(cadre);
    const doc = cadre.contentWindow?.document;
    if (!doc) { cadre.remove(); throw new Error('Impression indisponible dans ce navigateur.'); }
    doc.open();
    doc.write(html);
    doc.close();
    // On retire le cadre APRES la boite d impression, sinon le document
    // disparait pendant que l utilisateur choisit son imprimante.
    window.setTimeout(() => cadre.remove(), 60000);
};

export const chargerRecu = async (paiementId: string): Promise<DonneesRecu> => {
    const res = await fetch(`/api/ventes/paiements/${encodeURIComponent(paiementId)}/recu`, { credentials: 'include' });
    const body = await res.json().catch(() => ({}));
    if (res.status === 404) throw new Error('Recu indisponible : redemarrer le serveur (npm run dev:app).');
    if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
    return body as DonneesRecu;
};
export const chargerEtOuvrirRecu = async (paiementId: string, devise: string, format: FormatRecu = 'TICKET') => {
    imprimerHtml(htmlRecu(await chargerRecu(paiementId), devise, true, format));
};
