/**
 * Idempotence des ecritures rejouees.
 *
 * La file hors ligne du navigateur renvoie ce qui n'a pas pu partir. Or une
 * coupure peut survenir APRES que le serveur a enregistre et AVANT que la
 * reponse ne revienne : pour le telephone, la requete a echoue ; pour la base,
 * elle a reussi. Sans garde-fou, le rattrapage cree une deuxieme facture, une
 * deuxieme sortie de stock, une deuxieme avance de salaire.
 *
 * Chaque ecriture mise en file porte donc une cle (`X-Bera-Idempotence`). On la
 * retient avec sa reponse : si la meme cle revient, on rend la reponse
 * d'origine sans rien reexecuter.
 */
import type { Request, Response, NextFunction } from 'express';
import db from './db';

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // Une semaine : bien au-dela de
// la plus longue coupure plausible, et la table reste minuscule.

db.exec(`
  CREATE TABLE IF NOT EXISTS idempotence_requetes (
    cle TEXT PRIMARY KEY,
    statut INTEGER,
    corps TEXT,
    cree_le INTEGER NOT NULL
  )
`);
db.exec('CREATE INDEX IF NOT EXISTS idx_idempotence_cree_le ON idempotence_requetes(cree_le)');

const reclamer = db.prepare('INSERT OR IGNORE INTO idempotence_requetes (cle, statut, corps, cree_le) VALUES (?, NULL, NULL, ?)');
const lire = db.prepare('SELECT statut, corps FROM idempotence_requetes WHERE cle = ?');
const enregistrer = db.prepare('UPDATE idempotence_requetes SET statut = ?, corps = ? WHERE cle = ?');
const liberer = db.prepare('DELETE FROM idempotence_requetes WHERE cle = ?');
const purger = db.prepare('DELETE FROM idempotence_requetes WHERE cree_le < ?');

// Un balayage au demarrage puis une fois par jour suffit.
const nettoyer = () => { try { purger.run(Date.now() - RETENTION_MS); } catch { /* table occupee : au prochain tour */ } };
nettoyer();
setInterval(nettoyer, 24 * 60 * 60 * 1000).unref?.();

const CLE_VALIDE = /^[A-Za-z0-9_-]{8,128}$/;

export const idempotence = (req: Request, res: Response, next: NextFunction) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const cle = req.header('X-Bera-Idempotence');
  // Pas de cle = requete faite en direct, depuis un ecran connecte. Rien a
  // dedoublonner : c'est la file hors ligne, et elle seule, qui rejoue.
  if (!cle || !CLE_VALIDE.test(cle)) return next();

  const pose = reclamer.run(cle, Date.now());
  if (pose.changes === 0) {
    // La cle existe deja : soit la requete est terminee (on rend sa reponse),
    // soit elle est encore en cours (rare : deux renvois simultanes).
    const connue = lire.get(cle) as { statut: number | null; corps: string | null } | undefined;
    if (connue?.statut != null) {
      res.status(connue.statut);
      res.set('X-Bera-Rejeu', '1');
      return connue.corps ? res.type('application/json').send(connue.corps) : res.end();
    }
    // 409 : la file du navigateur le comprend comme « deja traite » et retire
    // l'entree, plutot que de tourner en boucle.
    return res.status(409).json({ message: 'Requete deja en cours de traitement.' });
  }

  // On note la reponse au passage, sans changer la facon dont les controleurs
  // repondent.
  const jsonOriginal = res.json.bind(res);
  let notee = false;
  const noter = (corps: string | null) => {
    if (notee) return;
    notee = true;
    // Un echec ne se retient pas : la requete n'a rien change, la rejouer est
    // legitime (et souvent la bonne chose a faire, si l'erreur etait passagere).
    if (res.statusCode >= 200 && res.statusCode < 300) {
      try { enregistrer.run(res.statusCode, corps, cle); } catch { /* sans gravite */ }
    } else {
      try { liberer.run(cle); } catch { /* sans gravite */ }
    }
  };

  res.json = ((corps: unknown) => {
    noter(JSON.stringify(corps));
    return jsonOriginal(corps);
  }) as typeof res.json;

  // Filet : une route qui repond par `res.send`, `res.end` ou qui plante avant
  // toute reponse laisserait sinon la cle bloquee en « en cours » pour de bon.
  res.on('finish', () => noter(null));
  res.on('close', () => { if (!notee && !res.writableEnded) { notee = true; try { liberer.run(cle); } catch { /* ignore */ } } });

  next();
};

export default idempotence;
