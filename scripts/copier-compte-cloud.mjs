/**
 * Copie les donnees cloud d'un compte vers un autre.
 *
 * A quoi ca sert : garder un compte d'essai qui part de l'etat reel. On code et
 * on teste sur un compte, on travaille pour de vrai sur l'autre ; sans copie,
 * le compte d'essai est vide et ne prouve rien.
 *
 * Ce que ca fait, exactement : lit la ligne `user_data` du compte SOURCE et
 * l'ecrit sur celle du compte CIBLE. Une copie, rien d'autre — la source n'est
 * jamais modifiee, et les deux comptes restent independants ensuite (aucun lien,
 * aucune synchronisation entre eux : une modification d'un cote ne touche pas
 * l'autre).
 *
 * Ce que ca N'ecrase PAS sans le dire : si la cible detient deja des donnees, le
 * script s'arrete. La copie ne devient destructrice qu'avec `--ecraser`, tape
 * en connaissance de cause.
 *
 * Les mots de passe ne sont ni ecrits dans le depot, ni affiches, ni conserves :
 * ils sont demandes a la saisie (frappe masquee), ou lus dans l'environnement
 * (`MDP_SOURCE`, `MDP_CIBLE`) pour un usage non interactif.
 *
 * Usage :
 *   node scripts/copier-compte-cloud.mjs --de a@exemple.com --vers b@exemple.com
 *   node scripts/copier-compte-cloud.mjs --de a@… --vers b@… --apercu
 *   node scripts/copier-compte-cloud.mjs --de a@… --vers b@… --ecraser
 */
import { createClient } from '@supabase/supabase-js';
import readline from 'node:readline';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  || 'https://utrojjhscyatppgcszrt.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY || process.env.SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0cm9qamhzY3lhdHBwZ2NzenJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MjUwNDEsImV4cCI6MjA5NzIwMTA0MX0.Nu6MQJe6YTN-TH7kBLHqStaFSrvXpuGuzr6wp28XFlk';

const TABLE = 'user_data';

// ─── Arguments ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const valeur = (nom) => {
  const i = args.indexOf(nom);
  return i >= 0 ? args[i + 1] : undefined;
};
const drapeau = (nom) => args.includes(nom);

const emailSource = valeur('--de');
const emailCible = valeur('--vers');
const apercu = drapeau('--apercu');
const ecraser = drapeau('--ecraser');

if (!emailSource || !emailCible) {
  console.error(`
Copie les donnees cloud d'un compte vers un autre.

  --de    <email>   compte a copier (jamais modifie)
  --vers  <email>   compte qui recoit la copie
  --apercu          n'ecrit rien : affiche ce qui serait copie
  --ecraser         autorise l'ecrasement des donnees deja presentes sur la cible

Exemple :
  node scripts/copier-compte-cloud.mjs --de a@exemple.com --vers b@exemple.com --apercu
`);
  process.exit(1);
}

if (emailSource.trim().toLowerCase() === emailCible.trim().toLowerCase()) {
  console.error('❌ La source et la cible sont le meme compte : il n\'y a rien a copier.');
  process.exit(1);
}

// ─── Saisie masquee du mot de passe ──────────────────────────────────────────

/**
 * Demande un mot de passe sans l'afficher.
 *
 * L'echo du terminal est coupe le temps de la frappe : rien n'apparait a
 * l'ecran, et rien ne reste dans l'historique du shell — contrairement a un mot
 * de passe passe en argument, que `ps` et l'historique retiennent tous les deux.
 */
const demanderMotDePasse = (invite) => new Promise((resoudre) => {
  const entree = process.stdin;
  const rl = readline.createInterface({ input: entree, output: process.stdout, terminal: true });
  const etaitBrut = entree.isTTY ? entree.isRaw : false;
  process.stdout.write(invite);
  if (entree.isTTY) entree.setRawMode(true);

  let saisie = '';
  const surTouche = (chunk) => {
    const c = chunk.toString('utf8');
    if (c === '\r' || c === '\n' || c === '\u0004') {
      entree.removeListener('data', surTouche);
      if (entree.isTTY) entree.setRawMode(etaitBrut);
      process.stdout.write('\n');
      rl.close();
      resoudre(saisie);
      return;
    }
    if (c === '\u0003') { process.stdout.write('\n'); process.exit(130); }        // Ctrl-C
    if (c === '\u007f' || c === '\b') { saisie = saisie.slice(0, -1); return; }   // retour arriere
    saisie += c;
  };
  entree.on('data', surTouche);
});

const motDePasse = async (variable, invite) => {
  const depuisEnv = process.env[variable];
  if (depuisEnv) return depuisEnv;
  return demanderMotDePasse(invite);
};

// ─── Lecture / ecriture ──────────────────────────────────────────────────────

/** Un client neuf par compte : deux sessions ne doivent pas se marcher dessus. */
const clientNeuf = () => createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const connecter = async (email, mdp) => {
  const client = clientNeuf();
  const { data, error } = await client.auth.signInWithPassword({ email, password: mdp });
  if (error || !data?.user?.id) {
    throw new Error(`connexion refusee pour ${email} : ${error?.message || 'reponse inattendue'}`);
  }
  return { client, userId: data.user.id };
};

/** Combien d'elements porte chaque cle — la seule mesure lisible d'un instantane. */
const compter = (v) => Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : 0);

const resume = (donnees) => Object.entries(donnees || {})
  .filter(([cle]) => !cle.startsWith('__'))
  .map(([cle, v]) => `    ${cle} : ${compter(v)}`)
  .join('\n');

// ─── Deroulement ─────────────────────────────────────────────────────────────

const principal = async () => {
  console.log(`\n📤 Source : ${emailSource}`);
  console.log(`📥 Cible  : ${emailCible}`);
  console.log(apercu ? '👁  Apercu : rien ne sera ecrit.\n' : '');

  const mdpSource = await motDePasse('MDP_SOURCE', `Mot de passe de ${emailSource} : `);
  const source = await connecter(emailSource, mdpSource);
  console.log(`✔ Connecte a la source (${source.userId})`);

  const { data: ligneSource, error: errLecture } = await source.client
    .from(TABLE).select('data, updated_at').eq('user_id', source.userId).maybeSingle();
  if (errLecture) throw new Error(`lecture de la source impossible : ${errLecture.message}`);
  if (!ligneSource?.data) {
    throw new Error('la source ne detient aucune donnee : il n\'y a rien a copier.');
  }
  const donnees = ligneSource.data;
  console.log(`✔ Instantane lu (derniere ecriture : ${ligneSource.updated_at || 'inconnue'})`);
  console.log(`  Contenu :\n${resume(donnees)}`);
  await source.client.auth.signOut().catch(() => {});

  const mdpCible = await motDePasse('MDP_CIBLE', `\nMot de passe de ${emailCible} : `);
  const cible = await connecter(emailCible, mdpCible);
  console.log(`✔ Connecte a la cible (${cible.userId})`);

  const { data: ligneCible } = await cible.client
    .from(TABLE).select('data, updated_at').eq('user_id', cible.userId).maybeSingle();
  if (ligneCible?.data) {
    console.log(`\n⚠  La cible detient DEJA des donnees (derniere ecriture : ${ligneCible.updated_at || 'inconnue'}) :`);
    console.log(resume(ligneCible.data));
    if (!ecraser) {
      console.error('\n❌ Arret : la copie les effacerait. Relancez avec --ecraser si c\'est bien ce que vous voulez.');
      process.exit(2);
    }
    console.log('\n→ --ecraser : ces donnees vont etre remplacees.');
  }

  if (apercu) {
    console.log('\n👁  Apercu termine : rien n\'a ete ecrit.');
    await cible.client.auth.signOut().catch(() => {});
    return;
  }

  const maintenant = new Date().toISOString();
  const { error: errEcriture } = await cible.client.from(TABLE).upsert(
    { user_id: cible.userId, data: donnees, updated_at: maintenant },
    { onConflict: 'user_id' },
  );
  if (errEcriture) throw new Error(`ecriture sur la cible refusee : ${errEcriture.message}`);

  // On relit : une ecriture qui ne repond pas d'erreur n'est pas encore une
  // preuve que la ligne porte ce qu'on croit.
  const { data: verif } = await cible.client
    .from(TABLE).select('data, updated_at').eq('user_id', cible.userId).maybeSingle();
  console.log('\n✅ Copie faite.');
  console.log(`  Cible, apres copie (${verif?.updated_at || maintenant}) :\n${resume(verif?.data)}`);
  console.log(`
  Les deux comptes sont independants : ce qui sera modifie sur ${emailCible}
  ne touchera pas ${emailSource}. Pour repartir de l'etat reel plus tard,
  relancez ce script avec --ecraser.

  Sur l'appareil qui utilise le compte d'essai : deconnectez-vous puis
  reconnectez-vous, pour que la reprise telecharge cette copie.`);
  await cible.client.auth.signOut().catch(() => {});
};

principal().catch((e) => {
  console.error(`\n❌ ${e.message}`);
  process.exit(1);
});
