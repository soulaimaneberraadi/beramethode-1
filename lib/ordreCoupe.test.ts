/**
 * Lancer: node --import tsx lib/ordreCoupe.test.ts
 */
import assert from 'node:assert/strict';
import type { MatelasLine, OrdreCoupe } from '../types';
import {
    associerTailles, estPrincipal, lireEntete, lireNotation, matelasDuPlacement, migrerOrdre,
    nomFichierMatelas, numeroSuivant, plisPourPlacements, renumeroter, TISSU_PRINCIPAL,
} from './ordreCoupe';

const T = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];

// --- Ecriture de l'atelier ---
{
    assert.deepEqual(lireNotation('XS-M', T), { XS: 1, M: 1 }, 'tiret = ces tailles seulement');
    assert.deepEqual(lireNotation('S-M', T), { S: 1, M: 1 });
    assert.deepEqual(lireNotation('XS a M', T), { XS: 1, S: 1, M: 1 }, '« a » = de ... a ...');
    assert.deepEqual(lireNotation('xs-a-m', T), { XS: 1, S: 1, M: 1 }, 'ecriture du cahier');
    assert.deepEqual(lireNotation('XS à M', T), { XS: 1, S: 1, M: 1 });
    assert.deepEqual(lireNotation('XS×2', T), { XS: 2 });
    assert.deepEqual(lireNotation('xs*2', T), { XS: 2 });
    assert.deepEqual(lireNotation('XSx2', T), { XS: 2 });
    assert.deepEqual(lireNotation('S-M×2-L', T), { S: 1, M: 2, L: 1 });
    assert.deepEqual(lireNotation('XXL', T), { XXL: 1 }, 'XXL n est pas « X × ... »');
    assert.deepEqual(lireNotation('3XL', T), { '3XL': 1 });
    assert.deepEqual(lireNotation('(XS a S)×2', T), { XS: 2, S: 2 });
    assert.equal(lireNotation('XS-Z', T), null, 'taille inconnue : refuse, pas ignoree');
    assert.equal(lireNotation('', T), null);
}

// --- En-tete Optitex (octets reels des fichiers de l'atelier) ---
{
    const a = lireEntete(['MODELE:TAIL/QTE:LADIES-BLOUSE:10/1,12/2,14/2,16/1;', 'LA=139.70CM LO=7M 5.96CM E=87.77%']);
    assert.equal(a.modele, 'LADIES-BLOUSE');
    assert.deepEqual(a.tailles, { '10': 1, '12': 2, '14': 2, '16': 1 });
    assert.equal(a.laizeCm, 139.7);
    assert.ok(Math.abs(a.longueurM! - 7.0596) < 1e-9, String(a.longueurM));
    assert.equal(a.efficience, 87.77);

    const b = lireEntete(['LA=155.00CM LO=0M 99.88CM E=79.57%']);
    assert.ok(Math.abs(b.longueurM! - 0.9988) < 1e-9);

    const c = lireEntete(['PLCT:9AMIJA DRISS TAILL BAS S MODELE:TAIL/QTE:9AMIJA TAILL S DRISS:S/1;LO=1M 4.73CM E=72.66%LA=158.00CM DATE: 01-07-2026']);
    assert.deepEqual(c.tailles, { S: 1 });
    assert.equal(c.modele, '9AMIJA TAILL S DRISS');
    assert.equal(c.laizeCm, 158);
    assert.ok(Math.abs(c.longueurM! - 1.0473) < 1e-9);

    const d = associerTailles({ s: 1, m: 2, '4XL': 1 }, ['S', 'M', 'L']);
    assert.deepEqual(d.ratios, { S: 1, M: 2 });
    assert.deepEqual(d.inconnues, ['4XL'], 'une taille du trace hors commande est signalee');
}

// --- Plis des placements choisis par l'atelier (cahier Zara) ---
{
    const tailles = ['XS', 'S', 'M', 'XL'];
    const r = plisPourPlacements([
        { id: 'mxl', ratios: { M: 1, XL: 1 } },
        { id: 'xss', ratios: { XS: 1, S: 1 } },
        { id: 'xs2', ratios: { XS: 2 } },
    ], { XS: 50, S: 30, M: 20, XL: 20 }, tailles);
    assert.deepEqual(r.plis, { mxl: 20, xss: 30, xs2: 10 });
    assert.ok(r.exact);
    assert.deepEqual(r.ecart, { XS: 0, S: 0, M: 0, XL: 0 });

    // Placements insuffisants : on ne coupe jamais plus que commande, et l'ecart le dit.
    const i = plisPourPlacements([{ id: 'a', ratios: { S: 1, M: 1 } }], { S: 10, M: 25 }, ['S', 'M']);
    assert.equal(i.plis.a, 10);
    assert.deepEqual(i.ecart, { S: 0, M: -15 });
    assert.ok(!i.exact);

    // Deux placements sur les memes tailles : la recherche trouve l'exact.
    const j = plisPourPlacements([
        { id: 'p1', ratios: { S: 1, M: 2 } },
        { id: 'p2', ratios: { S: 2, M: 1 } },
    ], { S: 70, M: 80 }, ['S', 'M']);
    assert.ok(j.exact, JSON.stringify(j));
    assert.equal(j.plis.p1 * 1 + j.plis.p2 * 2, 70);
    assert.equal(j.plis.p1 * 2 + j.plis.p2 * 1, 80);
}

// --- Matelas d'un placement, numeros et noms de fichiers ---
{
    const p = { id: 'P1', tissu: TISSU_PRINCIPAL, nom: 'XS-M', ratios: { XS: 1, M: 1 }, longueurM: 1.2, maxPlis: 60, fichier: { id: 'f', nom: '201-SHIRT-40000.PLT', format: 'PLT', data: '', size: 0 } };
    const m = matelasDuPlacement(p, 'Noir', 80, 100, 77);
    assert.deepEqual(m.map(x => x.plis), [40, 40], '80 plis, 60 au plus -> 40 + 40');
    assert.deepEqual(m.map(x => x.numero), ['77', '78']);
    assert.ok(m.every(x => x.placementId === 'P1' && x.longTracee === 1.2));
    assert.equal(nomFichierMatelas(p, 'Tissu', '77'), '201-SHIRT-40000-Tissu-77-XS-M.plt');
    assert.equal(nomFichierMatelas({ ...p, nom: 'XS×2' }, 'Doublure (foro)', '5'), '201-SHIRT-40000-Doublure-(foro)-5-XSx2.plt');

    const lignes: MatelasLine[] = [
        { id: 'a', plis: 10, longTracee: 1, ratios: { S: 1 }, numero: '1' },
        { id: 'b', plis: 40, longTracee: 1, ratios: { S: 1 }, numero: '2', fait: true },
        { id: 'c', plis: 30, longTracee: 1, ratios: { S: 2 }, numero: '3' },
        { id: 'v', plis: 5, longTracee: 1, ratios: { S: 1 }, numero: '1', tissu: 'vlies' },
    ];
    const g = renumeroter(lignes, TISSU_PRINCIPAL, 1, 'grand');
    assert.equal(g.find(l => l.id === 'c')!.numero, '1', 'le plus gros matelas d abord (60 pcs)');
    assert.equal(g.find(l => l.id === 'b')!.numero, '2', 'un matelas coupe garde son numero');
    assert.equal(g.find(l => l.id === 'a')!.numero, '3', 'le 2 est pris : on saute');
    assert.equal(g.find(l => l.id === 'v')!.numero, '1', 'une autre matiere n est pas touchee');
    const pt = renumeroter(lignes, TISSU_PRINCIPAL, 77, 'petit');
    assert.deepEqual(['a', 'c'].map(id => pt.find(l => l.id === id)!.numero), ['77', '78']);
    assert.equal(numeroSuivant(lignes, TISSU_PRINCIPAL), 4);
    assert.equal(numeroSuivant(lignes, 'vlies'), 2);
    assert.ok(estPrincipal(lignes[0]) && !estPrincipal(lignes[3]));
}

// --- Migration d'un ordre d'avant ---
{
    const f = { id: 'F1', nom: 'M.plt', format: 'PLT', data: 'data:application/octet-stream;base64,QUJD', size: 3 };
    const ancien: OrdreCoupe = {
        refModele: 'X', longueurMatelas: 0, consommation: 0, nbrFeuilles: 0, nbrMatelas: 0, qteTotale: 0, status: 'EN_COURS',
        tissuRecu: 250,
        matelasLines: [
            { id: 'l1', plis: 10, longTracee: 2, ratios: { M: 1, XL: 1 }, fichier: f },
            { id: 'l2', plis: 10, longTracee: 2, ratios: { M: 1, XL: 1 }, fichier: { ...f, data: '' } },
            { id: 'l3', plis: 15, longTracee: 3, ratios: { XS: 1, S: 1 }, fait: true },
            { id: 'l4', plis: 0, longTracee: 0, ratios: {} },
        ],
    };
    const n = migrerOrdre(ancien, ['XS', 'S', 'M', 'XL']);
    assert.equal(n.tissus![0].id, TISSU_PRINCIPAL);
    assert.equal(n.tissus![0].recuM, 250, 'le metrage recu passe au tissu principal');
    assert.equal(n.placements!.length, 2, 'deux lignes identiques = un seul placement');
    const mxl = n.placements!.find(p => p.nom === 'M-XL')!;
    assert.equal(mxl.longueurM, 2);
    assert.equal(mxl.fichier?.data, f.data, 'le placement garde le fichier complet');
    assert.deepEqual(n.matelasLines!.map(l => l.numero), ['1', '2', '3', '4'], 'chaque ligne garde le numero qu elle avait');
    assert.equal(n.matelasLines![0].placementId, mxl.id);
    assert.equal(n.matelasLines![1].placementId, mxl.id);
    assert.equal(n.matelasLines![3].placementId, undefined, 'ligne vide : pas de placement invente');
    assert.equal(n.matelasLines!.length, 4, 'rien n est supprime');
    // Deja migre : rien ne bouge.
    assert.deepEqual(migrerOrdre(n, ['XS', 'S', 'M', 'XL']).placements, n.placements);
}

console.log('ordreCoupe: OK');
