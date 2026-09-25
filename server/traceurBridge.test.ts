/**
 * Lancer: node --import tsx server/traceurBridge.test.ts
 *
 * Deux choses a garantir : on n'ecrit jamais hors du dossier du traceur, et un
 * trace renvoye repart en impression au lieu d'ecraser celui qui attend.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deposerTrace, nomDeTraceSur, dossierTraceur } from './traceurBridge';

// --- Le nom recu ne peut pas faire sortir du dossier ---
{
    assert.equal(nomDeTraceSur('../../Windows/system32/evil.plt'), 'evil.plt');
    assert.equal(nomDeTraceSur('..\\..\\autoexec.bat'), 'autoexec.bat.plt');
    assert.equal(nomDeTraceSur('DEBLANDEUR--T-100-N7.PLT'), 'DEBLANDEUR--T-100-N7.plt');
    assert.equal(nomDeTraceSur(''), 'trace.plt');
    assert.equal(nomDeTraceSur('...'), 'trace.plt');
    assert.ok(!nomDeTraceSur('a:b*c?.plt').includes(':'), 'caracteres interdits sous Windows retires');
}

const appel = async (body: unknown) => {
    let statut = 200;
    let json: any = null;
    const res: any = {
        status(s: number) { statut = s; return res; },
        json(j: unknown) { json = j; return res; },
    };
    await deposerTrace({ body } as any, res);
    return { statut, json };
};

(async () => {
    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'traceur-'));
    process.env.TRACEUR_DOSSIER = dossier;
    assert.equal(dossierTraceur(), dossier);

    const contenu = Buffer.from('IN;SP1;PU0,0;PD100,0;PU;\x03', 'latin1');
    const donnees = contenu.toString('base64');

    // --- Depot : fichier ecrit, octets identiques, pas de .part residuel ---
    const a = await appel({ nom: 'MATELAS-7.plt', donnees });
    assert.equal(a.statut, 200, JSON.stringify(a.json));
    assert.equal(path.dirname(a.json.chemin), dossier);
    assert.deepEqual(fs.readFileSync(a.json.chemin), contenu, 'octets alteres au depot');
    assert.ok(!fs.readdirSync(dossier).some(f => f.endsWith('.part')), 'fichier provisoire oublie');

    // --- Renvoi du meme trace : un second travail, pas un ecrasement ---
    const b = await appel({ nom: 'MATELAS-7.plt', donnees });
    assert.equal(b.statut, 200);
    assert.notEqual(b.json.chemin, a.json.chemin, 'le premier depot a ete ecrase');
    assert.equal(path.basename(b.json.chemin), 'MATELAS-7-2.plt');

    // --- Tentative de sortie du dossier : ramenee dedans ---
    const c = await appel({ nom: '../../evade.plt', donnees });
    assert.equal(c.statut, 200);
    assert.equal(path.dirname(c.json.chemin), dossier, 'ecriture hors du dossier du traceur');

    // --- Entrees invalides ---
    assert.equal((await appel({ nom: 'x.plt', donnees: '' })).statut, 400);
    assert.equal((await appel({ nom: 'x.plt' })).statut, 400);

    fs.rmSync(dossier, { recursive: true, force: true });
    console.log('traceurBridge: OK');
})().catch(e => { console.error(e); process.exit(1); });
