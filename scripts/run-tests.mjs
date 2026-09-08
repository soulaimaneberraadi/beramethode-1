/**
 * Lance toutes les suites `*.test.ts` du depot.
 *
 * Elles existaient — douze fichiers — mais aucun script ne les lancait : il
 * fallait connaitre leur chemin et les appeler une par une. Une suite rouge
 * pouvait donc le rester indefiniment sans que personne le voie (c'etait le cas
 * de `utils/efficiency.test.ts`). Le processus sort en erreur des qu'une suite
 * echoue, pour que l'integration continue puisse s'y fier.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const RACINE = process.cwd();
const IGNORES = new Set(['node_modules', 'dist', 'build', '.git', 'public', 'assets']);

const trouverTests = (dossier) => {
    const out = [];
    for (const entree of readdirSync(dossier)) {
        if (IGNORES.has(entree)) continue;
        const chemin = join(dossier, entree);
        if (statSync(chemin).isDirectory()) out.push(...trouverTests(chemin));
        else if (entree.endsWith('.test.ts')) out.push(chemin);
    }
    return out;
};

const suites = trouverTests(RACINE).sort();
if (!suites.length) {
    console.log('Aucune suite trouvee.');
    process.exit(0);
}

let echecs = 0;
for (const suite of suites) {
    const nom = relative(RACINE, suite);
    const r = spawnSync('npx', ['tsx', suite], { encoding: 'utf8' });
    if (r.status === 0) {
        console.log(`  OK     ${nom}`);
    } else {
        echecs += 1;
        console.log(`  ECHEC  ${nom}`);
        const detail = (r.stderr || r.stdout || '').trim().split('\n').slice(0, 8);
        for (const l of detail) console.log(`         ${l}`);
    }
}

console.log(`\n${suites.length - echecs}/${suites.length} suites passent.`);
process.exit(echecs ? 1 : 0);
