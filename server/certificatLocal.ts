import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Un certificat pour le reseau local.
 *
 * Le partage de fichiers du navigateur (`navigator.share`), la camera, le
 * presse-papiers et les notifications n'existent QUE dans un « contexte
 * securise ». `localhost` en est un ; `http://192.168.x.x` non. C'est pour
 * cela que le bouton d'envoi ne faisait rien depuis le telephone alors qu'il
 * marchait sur le poste.
 *
 * On genere donc un certificat auto-signe, valable pour localhost et pour
 * l'adresse LAN de la machine. Le telephone affichera un avertissement la
 * PREMIERE fois — c'est normal pour un certificat qui n'est signe par aucune
 * autorite — puis l'origine devient https et tout fonctionne.
 *
 * Le certificat est regenere quand l'adresse IP change : un certificat pour
 * 192.168.1.50 ne vaut rien apres un changement de reseau.
 */

const DOSSIER = path.join(process.cwd(), '.certs');
const CLE = path.join(DOSSIER, 'local-key.pem');
const CERT = path.join(DOSSIER, 'local-cert.pem');
const EMPREINTE = path.join(DOSSIER, 'adresses.json');

export const adressesLocales = (): string[] => {
    const sorties: string[] = [];
    for (const iface of Object.values(os.networkInterfaces())) {
        for (const net of iface || []) {
            if (net.family === 'IPv4' && !net.internal) sorties.push(net.address);
        }
    }
    return sorties;
};

// selfsigned v5 rend une promesse : la generation est asynchrone.
export const certificatLocal = async (): Promise<{ key: Buffer; cert: Buffer } | null> => {
    try {
        const adresses = adressesLocales();
        const signature = JSON.stringify(adresses.sort());

        const dejaBon = fs.existsSync(CLE) && fs.existsSync(CERT) && fs.existsSync(EMPREINTE)
            && fs.readFileSync(EMPREINTE, 'utf8') === signature;

        if (!dejaBon) {
            // Import paresseux : le paquet n'est utile qu'au premier demarrage
            // en HTTPS, il ne doit pas peser sur les autres.
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const selfsigned = require('selfsigned');
            const pems = await selfsigned.generate(
                [{ name: 'commonName', value: 'localhost' }],
                {
                    days: 3650,
                    keySize: 2048,
                    algorithm: 'sha256',
                    extensions: [{
                        name: 'subjectAltName',
                        altNames: [
                            { type: 2, value: 'localhost' },
                            { type: 7, ip: '127.0.0.1' },
                            ...adresses.map(ip => ({ type: 7, ip })),
                        ],
                    }],
                },
            );
            fs.mkdirSync(DOSSIER, { recursive: true });
            fs.writeFileSync(CLE, pems.private);
            fs.writeFileSync(CERT, pems.cert);
            fs.writeFileSync(EMPREINTE, signature);
            console.log('  🔐 Certificat local genere pour :', ['localhost', ...adresses].join(', '));
        }

        return { key: fs.readFileSync(CLE), cert: fs.readFileSync(CERT) };
    } catch (e) {
        // Un certificat introuvable ne doit pas empecher le serveur de demarrer :
        // on retombe en HTTP, en le disant.
        console.warn('  ⚠️  Certificat local indisponible, demarrage en HTTP :', (e as Error).message);
        return null;
    }
};
