/**
 * Lancer: node --import tsx lib/planMatelas.test.ts
 */
import assert from 'node:assert/strict';
import { decouperEnMatelas, nomPlacement, planifierPlacements, produitParTaille, repartirPlis } from './planMatelas';

// --- Ecriture de l'atelier ---
{
    const t = ['XS', 'S', 'M', 'XL'];
    assert.equal(nomPlacement({ M: 1, XL: 1 }, t), 'M-XL');
    assert.equal(nomPlacement({ XS: 2 }, t), 'XS×2');
    assert.equal(nomPlacement({ S: 2, M: 1 }, t), 'S×2-M');
}

// --- Plis a parts egales ---
{
    assert.deepEqual(repartirPlis(20, 15), [10, 10]);
    assert.deepEqual(repartirPlis(30, 15), [15, 15]);
    assert.deepEqual(repartirPlis(10, 15), [10]);
    assert.deepEqual(repartirPlis(31, 15), [11, 10, 10]);
}

// --- L'exemple du cahier : Zara RF7887, 2 pieces par pli, 15 plis au plus ---
{
    const tailles = ['XS', 'S', 'M', 'XL'];
    const cibles = { XS: 50, S: 30, M: 20, XL: 20 };
    const pl = planifierPlacements(tailles, cibles, { maxPiecesParPli: 2, maxPlisParMatelas: 15 })!;
    assert.ok(pl, 'un plan doit exister');
    const noms = Object.fromEntries(pl.map(p => [nomPlacement(p.ratios, tailles), p.plis]));
    assert.deepEqual(noms, { 'XS-S': 30, 'M-XL': 20, 'XS×2': 10 }, JSON.stringify(noms));

    const matelas = decouperEnMatelas(pl, tailles, 15);
    assert.equal(matelas.length, 5, '5 matelas comme dans le cahier');
    assert.deepEqual(matelas.map(m => `${m.placement}:${m.plis}`).sort(), ['M-XL:10', 'M-XL:10', 'XS-S:15', 'XS-S:15', 'XS×2:10'].sort());
    assert.deepEqual(produitParTaille(matelas, tailles), cibles, 'quantites exactes');
}

// --- Toujours exact, toujours dans les limites (tirages au hasard) ---
{
    let graine = 7;
    const hasard = (n: number) => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine % n; };
    const toutes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL'];
    let lent = 0;
    for (let essai = 0; essai < 120; essai++) {
        const tailles = toutes.slice(0, 2 + hasard(7));
        const cibles: Record<string, number> = {};
        tailles.forEach(t => { cibles[t] = hasard(4) === 0 ? 0 : hasard(400); });
        const B = 1 + hasard(8);
        const P = 5 + hasard(80);
        const t0 = Date.now();
        const pl = planifierPlacements(tailles, cibles, { maxPiecesParPli: B, maxPlisParMatelas: P });
        lent = Math.max(lent, Date.now() - t0);
        assert.ok(pl, `pas de plan pour ${JSON.stringify(cibles)} B=${B}`);
        const matelas = decouperEnMatelas(pl!, tailles, P);
        assert.deepEqual(produitParTaille(matelas, tailles), Object.fromEntries(tailles.map(t => [t, cibles[t]])), `ecart ${JSON.stringify(cibles)} B=${B} P=${P}`);
        for (const m of matelas) {
            assert.ok(Object.values(m.ratios).reduce((a, b) => a + b, 0) <= B, 'trop de pieces par pli');
            assert.ok(m.plis >= 1 && m.plis <= P, 'trop de plis');
        }
    }
    assert.ok(lent < 3000, `trop lent : ${lent} ms`);
    console.log(`  plus long calcul : ${lent} ms`);
}

// --- Le nouveau plan ne fait jamais plus de traces que l'ancien ---
{
    const tailles = ['36', '38', '40', '42', '44', '46'];
    const cibles = { '36': 120, '38': 240, '40': 360, '42': 360, '44': 240, '46': 120 };
    const pl = planifierPlacements(tailles, cibles, { maxPiecesParPli: 6, maxPlisParMatelas: 60 })!;
    assert.ok(pl.length <= 2, `grille 1-2-3-3-2-1 sur 6 pieces : un ou deux traces suffisent, obtenu ${pl.length}`);
}

console.log('planMatelas: OK');
