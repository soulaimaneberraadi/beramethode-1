import { Request, Response } from 'express';
import net from 'net';

/**
 * PONT VERS UNE IMPRIMANTE THERMIQUE RÉSEAU (ZPL/EPL, port 9100).
 *
 * Le navigateur ne peut pas ouvrir de socket TCP brut : imprimer sur une
 * Zebra (ou compatible) branchée au réseau exige un relais côté serveur, qui
 * ouvre la connexion et envoie les commandes telles quelles. Le rendu HTML
 * (`@page` à la taille exacte) reste la voie par défaut — celle-ci ne sert
 * qu'aux imprimantes pilotées en ZPL/EPL direct.
 *
 * Pas de file d'attente, pas de retenue de connexion : une étiquette est un
 * geste ponctuel, pas un flux permanent. Chaque appel ouvre, écrit, ferme.
 */

const CONNECT_TIMEOUT_MS = 4000;
/** Taille maximale d'un envoi : une planche de 500 tiki en ZPL tient large-
 *  ment sous cette borne. Elle protège contre un corps de requête aberrant,
 *  pas contre un usage normal. */
const MAX_PAYLOAD_BYTES = 2_000_000;

/** Un hôte vide, ou visiblement pas une adresse/nom, n'ira nulle part utile —
 *  autant le dire tout de suite plutôt que d'attendre le timeout réseau. */
const isPlausibleHost = (host: string): boolean =>
  /^[a-zA-Z0-9.:-]{1,253}$/.test(host.trim());

// POST /api/print/zpl  { host, port?, data }
export const sendZpl = (req: Request, res: Response) => {
  const host = String(req.body?.host ?? '').trim();
  const port = Number(req.body?.port) || 9100;
  const data = String(req.body?.data ?? '');

  if (!host || !isPlausibleHost(host)) {
    return res.status(400).json({ message: "Adresse de l'imprimante invalide." });
  }
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return res.status(400).json({ message: 'Port invalide.' });
  }
  if (!data) {
    return res.status(400).json({ message: 'Aucune donnée à imprimer.' });
  }
  if (Buffer.byteLength(data, 'utf8') > MAX_PAYLOAD_BYTES) {
    return res.status(413).json({ message: "L'impression est trop volumineuse pour un seul envoi." });
  }

  const socket = new net.Socket();
  let settled = false;
  const finish = (status: number, body: any) => {
    if (settled) return;
    settled = true;
    try { socket.destroy(); } catch { /* déjà fermée */ }
    res.status(status).json(body);
  };

  socket.setTimeout(CONNECT_TIMEOUT_MS);
  socket.once('timeout', () => finish(504, { message: `Aucune réponse de l'imprimante à ${host}:${port} (délai dépassé). Vérifiez qu'elle est allumée et sur le même réseau.` }));
  socket.once('error', (err: NodeJS.ErrnoException) => {
    const cause = err.code === 'ECONNREFUSED'
      ? "Connexion refusée — l'imprimante n'écoute pas sur ce port."
      : err.code === 'EHOSTUNREACH' || err.code === 'ENETUNREACH'
        ? 'Imprimante injoignable — vérifiez le réseau.'
        : err.message;
    finish(502, { message: `Échec de connexion à l'imprimante : ${cause}` });
  });
  socket.connect(port, host, () => {
    // Toutes les commandes ZPL sont du texte ASCII : pas d'encodage à négocier.
    socket.write(data, 'ascii', (err) => {
      if (err) { finish(502, { message: `Échec de l'envoi : ${err.message}` }); return; }
      // Le flux est fermé côté client — la Zebra imprime dès réception, elle
      // ne renvoie rien à attendre.
      finish(200, { message: 'Envoyé à l\'imprimante.' });
    });
  });
};
