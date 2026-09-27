/**
 * Démarre le serveur Express en édition BERACOUPE (BERA_EDITION=coupe) :
 * bind 0.0.0.0 + routes LAN, pour tester l'atelier en réseau local sans
 * empaqueter l'EXE.
 *
 * `cross-env` n'est pas installé dans ce projet (vérifié dans node_modules
 * avant d'écrire ce script) — même lanceur "petit spawn" que dev-https.mjs
 * pour rester cross-shell (cmd / PowerShell / bash) sans dépendance de plus
 * pour une seule variable d'environnement.
 */
import { spawn } from 'child_process';

spawn('npx', ['tsx', 'server.ts'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, BERA_EDITION: 'coupe' },
}).on('exit', code => process.exit(code ?? 0));
