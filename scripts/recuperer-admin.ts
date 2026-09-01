/**
 * Recuperation d'un acces administrateur perdu.
 *
 *   npm run recuperer-admin
 *
 * ── Le probleme ──────────────────────────────────────────────────────────────
 * Un ouvrier qui oublie son mot de passe, son patron le lui change. Le patron,
 * lui, n'a personne au-dessus. Sans issue, l'entreprise perd l'acces a son
 * propre ERP : la paie, les factures, la production. Le seul recours serait
 * d'appeler l'editeur et d'attendre.
 *
 * ── Pourquoi c'est sur ───────────────────────────────────────────────────────
 * Cet outil ne s'execute que sur la machine qui heberge la base — le poste du
 * patron, celui qui fait serveur. Y avoir acces, c'est deja avoir le fichier
 * `database.sqlite` en main : on pourrait l'ouvrir directement avec n'importe
 * quel lecteur SQLite. Ce script n'ouvre donc aucune porte qui ne le soit deja.
 *
 * Il ne s'appuie ni sur Internet, ni sur la messagerie, ni sur l'editeur. C'est
 * exactement ce qu'on attend d'un dernier recours : il doit marcher le jour ou
 * tout le reste est tombe.
 *
 * ── Ce qu'il fait, et ce qu'il ne fait pas ───────────────────────────────────
 *  - il change le mot de passe d'un compte administrateur existant ;
 *  - il n'en cree aucun, et ne donne le role admin a personne : recuperer un
 *    acces n'est pas s'en octroyer un.
 *  - il inscrit l'operation au journal d'audit. Une reprise de controle doit
 *    laisser une trace, meme legitime.
 */

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import readline from 'node:readline';
import db from '../server/db';
import { logAudit } from '../server/auditLogger';

const LONGUEUR_MINIMALE = 8;

interface Compte { id: number; email: string; name: string | null; role: string }

const demander = (question: string, masquer = false): Promise<string> =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    if (masquer) {
      // readline n'a pas de mode « mot de passe » : on remplace ce qu'il ecrit
      // a l'ecran par des etoiles. Sans ca, le mot de passe reste lisible sur
      // le terminal, et dans son historique.
      let masquageActif = false;
      (rl as any)._writeToOutput = (chaine: string) => {
        process.stdout.write(masquageActif ? '*' : chaine);
      };
      rl.question(question, (reponse) => {
        masquageActif = false;
        process.stdout.write('\n');
        rl.close();
        resolve(reponse);
      });
      masquageActif = true;
      return;
    }

    rl.question(question, (reponse) => { rl.close(); resolve(reponse); });
  });

async function principal() {
  console.log('\n  BERAMETHODE — recuperation d\'un acces administrateur');
  console.log('  ' + '-'.repeat(52) + '\n');

  const admins = db
    .prepare("SELECT id, email, name, role FROM users WHERE role = 'admin' ORDER BY id")
    .all() as Compte[];

  if (admins.length === 0) {
    console.log('  Aucun compte administrateur dans cette base.');
    console.log('  Rien a recuperer — ce script n\'en cree pas.\n');
    process.exit(1);
  }

  console.log('  Comptes administrateurs :\n');
  admins.forEach((a, i) => console.log(`   ${i + 1}. ${a.email}${a.name ? `  (${a.name})` : ''}`));
  console.log();

  const choix = admins.length === 1
    ? '1'
    : await demander(`  Lequel ? (1-${admins.length}) : `);

  const index = Number(choix.trim()) - 1;
  const cible = admins[index];
  if (!cible) {
    console.log('\n  Choix invalide. Rien n\'a ete modifie.\n');
    process.exit(1);
  }

  console.log(`\n  Compte : ${cible.email}\n`);

  const motDePasse = await demander(`  Nouveau mot de passe (${LONGUEUR_MINIMALE} caracteres minimum) : `, true);
  if (motDePasse.length < LONGUEUR_MINIMALE) {
    console.log(`\n  Trop court. Rien n'a ete modifie.\n`);
    process.exit(1);
  }

  const confirmation = await demander('  Repetez-le : ', true);
  if (motDePasse !== confirmation) {
    console.log('\n  Les deux saisies different. Rien n\'a ete modifie.\n');
    process.exit(1);
  }

  const hache = await bcrypt.hash(motDePasse, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hache, cible.id);

  // Une reprise de controle doit laisser une trace, meme legitime : c'est ce
  // qui permet de distinguer, plus tard, une recuperation d'une intrusion.
  logAudit({
    userId: cible.id,
    action: 'PASSWORD_RESET',
    detail: `Recuperation d'acces administrateur depuis le poste serveur (${cible.email})`,
  });

  console.log('\n  Fait. Connectez-vous avec ce nouveau mot de passe.\n');
  process.exit(0);
}

principal().catch((e) => {
  console.error('\n  Echec :', e?.message || e, '\n');
  process.exit(1);
});
