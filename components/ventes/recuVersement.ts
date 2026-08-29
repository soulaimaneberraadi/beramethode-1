import { montantEnLettres } from '../../lib/montantEnLettres';

/**
 * Le recu de versement, tel qu'on le tend au client par-dessus le comptoir.
 *
 * Format ticket etroit (80 mm) : il sort de l'imprimante de caisse, se plie
 * et se garde. Deux exemplaires sur la meme page — un pour lui, un pour le
 * carnet — parce qu'un recu que le vendeur ne garde pas ne prouve rien le
 * jour ou le client revient avec le sien.
 */
type DonneesRecu = {
    emetteur: any;
    paiement: { id: string; date: string; montant: number; mode: string | null; reference: string | null };
    facture: { numero: string; date: string | null; totalTtc: number; montantPaye: number; reste: number };
    client: { nom: string; tel: string | null; ville: string | null; adresse: string | null; ice: string | null };
    compte: { du: number; paye: number; reste: number };
};

const nf = (n: number) => (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const jjmmaaaa = (v?: string | null) => (v ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : '—');
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
  <p class="ref">N° ${esc(d.paiement.id.slice(-8).toUpperCase())} &nbsp;·&nbsp; ${jjmmaaaa(d.paiement.date)} &nbsp;·&nbsp; <em>${esc(pour)}</em></p>

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

export const ouvrirRecu = (d: DonneesRecu, devise = 'MAD') => {
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8" />
<title>Recu ${esc(d.paiement.id.slice(-8).toUpperCase())}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; color: #0f172a; background: #f1f5f9; }
  .feuille { width: 80mm; margin: 0 auto; background: #fff; padding: 4mm; }
  .recu { font-size: 10px; padding-bottom: 6px; }
  .recu + .recu { border-top: 1px dashed #94a3b8; padding-top: 8px; margin-top: 8px; }
  header { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
  header div { display: flex; flex-direction: column; line-height: 1.3; }
  header strong { font-size: 12px; }
  header span { font-size: 8px; color: #475569; }
  .logo { width: 32px; height: 32px; object-fit: contain; }
  h1 { font-size: 11px; letter-spacing: .08em; text-align: center; margin: 6px 0 2px; }
  .ref { text-align: center; font-size: 8px; color: #64748b; margin: 0 0 6px; }
  table { width: 100%; border-collapse: collapse; }
  .infos td, .infos th { padding: 1px 0; text-align: left; font-size: 9px; }
  .infos td { color: #64748b; width: 38%; font-weight: 400; }
  .montant { display: flex; justify-content: space-between; align-items: baseline; margin: 6px 0 2px;
             border-top: 1px solid #0f172a; border-bottom: 1px solid #0f172a; padding: 4px 0; }
  .montant span { font-size: 9px; color: #475569; }
  .montant strong { font-size: 14px; }
  .lettres { font-size: 8px; font-style: italic; color: #475569; margin: 0 0 6px; }
  .solde td, .solde th { font-size: 9px; padding: 1px 0; text-align: left; }
  .solde td { color: #64748b; font-weight: 400; }
  .solde th { text-align: right; }
  .solde .reste td, .solde .reste th { font-size: 11px; padding-top: 3px; border-top: 1px solid #cbd5e1; }
  .signatures { display: flex; justify-content: space-between; margin-top: 14px; font-size: 8px; color: #64748b; }
  .signatures span { border-top: 1px solid #cbd5e1; padding-top: 2px; width: 45%; text-align: center; }
  @media print { body { background: #fff; } .feuille { width: auto; padding: 0; } }
</style></head>
<body><div class="feuille">
${exemplaire(d, devise, 'Exemplaire client')}
${exemplaire(d, devise, 'Exemplaire vendeur')}
</div>
<script>window.addEventListener('load', () => setTimeout(() => window.print(), 250));</script>
</body></html>`;

    const fenetre = window.open('', '_blank');
    if (!fenetre) {
        // Bloqueur de fenetres : on le dit, au lieu de laisser croire que le
        // bouton ne marche pas.
        throw new Error('Le navigateur a bloque la fenetre d’impression. Autorisez les pop-ups pour ce site.');
    }
    fenetre.document.write(html);
    fenetre.document.close();
};

export const chargerEtOuvrirRecu = async (paiementId: string, devise: string) => {
    const res = await fetch(`/api/ventes/paiements/${encodeURIComponent(paiementId)}/recu`, { credentials: 'include' });
    const body = await res.json().catch(() => ({}));
    if (res.status === 404) throw new Error('Recu indisponible : redemarrer le serveur (npm run dev:app).');
    if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
    ouvrirRecu(body as DonneesRecu, devise);
};
