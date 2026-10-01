/**
 * Le ticket de caisse — 80 mm.
 *
 * Ce n'est pas le tiki : le tiki se colle sur une pièce, le ticket part avec
 * le client. Il tient sur un rouleau étroit, en noir sur blanc, et se lit à
 * bout de bras : pas de gris, pas de fantaisie typographique.
 */

export type TicketLigne = {
  nom: string;
  couleur?: string;
  taille?: string;
  qte: number;
  prix: number;
};

export type TicketData = {
  marque: string;
  numero: string;
  date: string;
  lignes: TicketLigne[];
  sousTotal: number;
  remise: number;
  total: number;
  paiement: string;
  recu?: number | null;
  rendu?: number | null;
  clientNom?: string | null;
  currency: string;
  /** VENTE (défaut) ou RETOUR : un retour s'imprime avec un bandeau dédié et
   *  des lignes/montants négatifs — sans ce type, un ticket de remboursement
   *  serait indiscernable d'une vente à l'œil. */
  type?: 'VENTE' | 'RETOUR';
  /** Identité légale de l'émetteur, imprimée sous la marque — comme sur une
   *  facture. `marque` reste l'enseigne commerciale (peut différer de la
   *  raison sociale) : les deux coexistent, ils ne se remplacent pas. */
  entreprise?: { adresse?: string | null; tel?: string | null; ice?: string | null } | null;
  /** Le caissier qui a tenu la vente — utile dès que la caisse est tenue à
   *  plusieurs, pour retrouver qui a encaissé (ou remboursé) quoi. */
  caissier?: string | null;
  /** Règlement détaillé, un moyen par ligne (« Avoir AV-K7M2QP », « Espèces »,
   *  « Acompte espèces »…). Quand il est fourni, il REMPLACE la ligne unique
   *  `paiement` : un achat réglé en plusieurs moyens ne tient pas sur un seul libellé.
   *  Un tableau VIDE est valide (vente entièrement à crédit : rien n'a été payé,
   *  donc aucune ligne de règlement — seul le « reste dû » s'imprime). */
  reglements?: Array<{ libelle: string; montant: number }> | null;
  /** Vente à crédit : ce que le client doit encore. Imprimé en gras sous le total —
   *  c'est la ligne qu'il faut pouvoir lui montrer en cas de litige. */
  resteDu?: number | null;
  /** Avoir émis par ce retour : son code est imprimé en gros, c'est lui que le
   *  client donnera à la caisse la prochaine fois. */
  avoir?: { code: string; montant: number } | null;
};

const esc = (s: string) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

/**
 * Rendu HTML à la largeur exacte du rouleau. `@page` sans marges : les pilotes
 * thermiques ajoutent les leurs, et deux marges cumulées décalent la coupe.
 */
export function buildTicketHtml(t: TicketData): string {
  const lignes = t.lignes.map(l => {
    const detail = [l.couleur, l.taille].filter(Boolean).join(' · ');
    return (
      '<tr><td class="d">' + esc(l.nom) +
      (detail ? '<span class="v">' + esc(detail) + '</span>' : '') +
      '</td><td class="q">' + l.qte + '</td><td class="p">' + money(l.qte * l.prix) + '</td></tr>'
    );
  }).join('');

  return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(t.numero) + '</title><style>'
    + '@page { size: 80mm auto; margin: 0; }'
    + 'body { width: 80mm; margin: 0; padding: 4mm 3mm; font-family: "Courier New", monospace; color: #000; font-size: 10pt; }'
    + '.c { text-align: center; }'
    + '.b { font-weight: 700; }'
    + '.mk { font-size: 13pt; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }'
    + '.sep { border-top: 1px dashed #000; margin: 2mm 0; }'
    + 'table { width: 100%; border-collapse: collapse; }'
    + 'td { vertical-align: top; padding: 0.6mm 0; }'
    + '.d { width: 60%; }'
    + '.q { width: 12%; text-align: center; }'
    + '.p { width: 28%; text-align: right; white-space: nowrap; }'
    + '.v { display: block; font-size: 8pt; }'
    + '.tot { font-size: 13pt; font-weight: 800; }'
    + '.id { font-size: 8pt; }'
    + '.ret { font-size: 11pt; font-weight: 800; letter-spacing: 1px; border: 1px solid #000; padding: 1mm 0; margin: 1mm 0; }'
    + '</style></head><body>'
    + '<div class="c mk">' + esc(t.marque || '') + '</div>'
    // Identité légale : sous la marque, comme sur une facture — l'enseigne et
    // la raison sociale ne coïncident pas toujours.
    + (t.entreprise?.adresse ? '<div class="c id">' + esc(t.entreprise.adresse) + '</div>' : '')
    + ([t.entreprise?.tel ? 'Tél : ' + t.entreprise.tel : '', t.entreprise?.ice ? 'ICE : ' + t.entreprise.ice : ''].filter(Boolean).length
      ? '<div class="c id">' + esc([t.entreprise?.tel ? 'Tél : ' + t.entreprise.tel : '', t.entreprise?.ice ? 'ICE : ' + t.entreprise.ice : ''].filter(Boolean).join(' · ')) + '</div>'
      : '')
    + (t.type === 'RETOUR' ? '<div class="c ret">RETOUR / AVOIR</div>' : '')
    + '<div class="c">' + esc(t.numero) + ' · ' + esc(t.date) + '</div>'
    + (t.clientNom ? '<div class="c">' + esc(t.clientNom) + '</div>' : '')
    + (t.caissier ? '<div class="c id">Caissier : ' + esc(t.caissier) + '</div>' : '')
    + '<div class="sep"></div>'
    + '<table>' + lignes + '</table>'
    + '<div class="sep"></div>'
    + '<table>'
    + (t.remise > 0
      ? '<tr><td>Sous-total</td><td class="p">' + money(t.sousTotal) + '</td></tr>'
        + '<tr><td>Remise</td><td class="p">-' + money(t.remise) + '</td></tr>'
      : '')
    + '<tr><td class="tot">' + (t.type === 'RETOUR' ? 'AVOIR' : 'TOTAL') + '</td><td class="p tot">' + money(t.total) + ' ' + esc(t.currency) + '</td></tr>'
    + (t.reglements
      ? t.reglements.map(r => '<tr><td>' + esc(r.libelle) + '</td><td class="p">' + money(r.montant) + '</td></tr>').join('')
      : '<tr><td>' + esc(t.paiement) + '</td><td class="p">' + (t.recu != null ? money(t.recu) : '') + '</td></tr>')
    + (t.rendu != null && t.rendu > 0 ? '<tr><td>Rendu</td><td class="p">' + money(t.rendu) + '</td></tr>' : '')
    + (t.resteDu != null && t.resteDu > 0
      ? '<tr><td class="b">À crédit — reste dû</td><td class="p b">' + money(t.resteDu) + ' ' + esc(t.currency) + '</td></tr>'
      : '')
    + '</table>'
    + (t.avoir
      ? '<div class="sep"></div><div class="c">Avoir à présenter en caisse</div>'
        + '<div class="c ret">' + esc(t.avoir.code) + '</div>'
        + '<div class="c b">' + money(t.avoir.montant) + ' ' + esc(t.currency) + '</div>'
      : '')
    + '<div class="sep"></div>'
    + '<div class="c">' + (t.type === 'RETOUR' ? 'Retour enregistré' : 'Merci et à bientôt') + '</div>'
    + '<script>window.print();<\/script></body></html>';
}

/**
 * Même ticket en ZPL, pour les imprimantes pilotées en direct sur le port
 * 9100. Volontairement en texte seul (`^A0N`) : sans imprimante sous la main
 * pour vérifier chaque octet, un logo converti en bitmap sortirait corrompu
 * plutôt qu'absent.
 */
export function buildTicketZpl(t: TicketData, dpi = 203): string {
  const dots = (mm: number) => Math.round((mm / 25.4) * dpi);
  const L = dots(3);
  const R = dots(74);
  let y = dots(3);
  const out: string[] = ['^XA', '^CI28', '^PW' + dots(80)];
  const line = (txt: string, h = dots(3.5), bold = false) => {
    out.push('^FO' + L + ',' + y + '^A0N,' + h + ',' + Math.round(h * (bold ? 0.95 : 0.8)) + '^FD' + txt.replace(/[\^~]/g, ' ') + '^FS');
    y += h + dots(0.8);
  };
  const droite = (txt: string, h = dots(3.5)) => {
    const w = dots(30);
    out.push('^FO' + (R - w) + ',' + (y - h - dots(0.8)) + '^FB' + w + ',1,0,R,0^A0N,' + h + ',' + Math.round(h * 0.8) + '^FD' + txt + '^FS');
  };
  const trait = () => { out.push('^FO' + L + ',' + y + '^GB' + (R - L) + ',1,1^FS'); y += dots(2); };

  line(t.marque || '', dots(5), true);
  if (t.entreprise?.adresse) line(t.entreprise.adresse);
  const idLigne = [t.entreprise?.tel ? 'Tel : ' + t.entreprise.tel : '', t.entreprise?.ice ? 'ICE : ' + t.entreprise.ice : ''].filter(Boolean).join(' - ');
  if (idLigne) line(idLigne);
  if (t.type === 'RETOUR') line('RETOUR / AVOIR', dots(4), true);
  line(t.numero + ' ' + t.date);
  if (t.clientNom) line(t.clientNom);
  if (t.caissier) line('Caissier : ' + t.caissier);
  trait();
  for (const l of t.lignes) {
    const detail = [l.couleur, l.taille].filter(Boolean).join(' ');
    line(`${l.qte} x ${l.nom}${detail ? ' ' + detail : ''}`);
    droite(money(l.qte * l.prix));
  }
  trait();
  if (t.remise > 0) { line('Remise'); droite('-' + money(t.remise)); }
  line(t.type === 'RETOUR' ? 'AVOIR' : 'TOTAL', dots(5), true);
  droite(money(t.total) + ' ' + t.currency, dots(5));
  if (t.reglements) {
    for (const r of t.reglements) { line(r.libelle); droite(money(r.montant)); }
  } else {
    line(t.paiement);
  }
  if (t.rendu != null && t.rendu > 0) { line('Rendu'); droite(money(t.rendu)); }
  if (t.resteDu != null && t.resteDu > 0) { line('A credit - reste du', dots(4), true); droite(money(t.resteDu) + ' ' + t.currency, dots(4)); }
  if (t.avoir) {
    trait();
    line('Avoir a presenter en caisse');
    line(t.avoir.code, dots(6), true);
    line(money(t.avoir.montant) + ' ' + t.currency, dots(4), true);
  }
  out.push('^XZ');
  return out.join('');
}

/**
 * Les adresses d'imprimantes saisies en une seule ligne. Un comptoir peut en
 * avoir plusieurs (caisse, atelier, réserve) et vouloir le même ticket sur
 * toutes en un seul geste : on accepte la virgule, le point-virgule et
 * l'espace comme séparateurs.
 */
export function parsePrinterHosts(raw: string): string[] {
  return String(raw || '')
    .split(/[,;\s]+/)
    .map(h => h.trim())
    .filter(Boolean);
}
