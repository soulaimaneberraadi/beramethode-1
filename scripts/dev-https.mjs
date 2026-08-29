/**
 * Demarre le serveur en HTTPS.
 *
 * Une variable d'environnement ne se pose pas de la meme facon sous cmd,
 * PowerShell et bash : ce petit lanceur evite d'imposer une dependance
 * supplementaire pour un seul mot.
 */
import { spawn } from 'child_process';

spawn('npx', ['tsx', 'server.ts'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, HTTPS: 'true', COOKIE_SECURE: 'true' },
}).on('exit', code => process.exit(code ?? 0));
