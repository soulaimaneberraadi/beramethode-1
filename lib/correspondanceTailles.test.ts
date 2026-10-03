/**
 * Lancer: node --import tsx lib/correspondanceTailles.test.ts
 */
import assert from 'node:assert/strict';
import {
    CORRESPONDANCE_DEFAUT, cleTailleComparable, equivalent, formeLettre, nettoyerTable, notationListe, planifierConversion,
    tailleDansNotation, trouverTaille, versNotation,
} from './correspondanceTailles';

// --- Ecritures d'une meme taille ---
{
    assert.equal(formeLettre('xxxl'), '3XL');
    assert.equal(formeLettre('3xl'), '3XL');
    assert.equal(formeLettre('XXXXL'), '4XL');
    assert.equal(formeLettre('2XL'), 'XXL');
    assert.equal(formeLettre(' xxl '), 'XXL');
    assert.equal(formeLettre('XL'), 'XL');
    assert.equal(cleTailleComparable('036'), '36');
    assert.equal(cleTailleComparable('s'), 'S');
}

// --- Equivalents, dans les deux sens ---
{
    assert.equal(equivalent('XS'), '34');
    assert.equal(equivalent('s'), '36');
    assert.equal(equivalent('XXXL'), '46', 'XXXL = 3XL = 46');
    assert.equal(equivalent('34'), 'XS');
    assert.equal(equivalent('044'), 'XXL');
    assert.equal(equivalent('37'), null, 'une taille inconnue de la table reste inconnue');
    assert.equal(equivalent('5XL'), null);
    // Une table de l'usine remplace celle d'usage : ici S = 38 (client italien).
    const italie = [{ lettre: 'XS', nombre: '36' }, { lettre: 'S', nombre: '38' }, { lettre: 'M', nombre: '40' }];
    assert.equal(equivalent('S', italie), '38');
    assert.equal(equivalent('38', italie), 'S');
    assert.equal(equivalent('L', italie), null);
}

// --- Table nettoyee : une lettre = un nombre ---
{
    const t = nettoyerTable([
        { lettre: 'xs', nombre: '34' }, { lettre: 'S', nombre: ' 36 ' }, { lettre: '', nombre: '38' }, { lettre: 'M', nombre: 'abc' },
        { lettre: 'XS', nombre: '99' }, { lettre: 'L', nombre: '36' }, { lettre: 'XXXL', nombre: '46' },
    ]);
    assert.deepEqual(t, [{ lettre: 'XS', nombre: '34' }, { lettre: 'S', nombre: '36' }, { lettre: '3XL', nombre: '46' }]);
    assert.deepEqual(nettoyerTable([]), CORRESPONDANCE_DEFAUT, 'table vide : celle d\'usage');
    assert.deepEqual(nettoyerTable(undefined), CORRESPONDANCE_DEFAUT);
}

// --- Retrouver la taille du modele ---
{
    const modeleNombres = ['34', '36', '38', '40'];
    assert.equal(trouverTaille('XS', modeleNombres), '34', 'fichier en lettres, modele en nombres');
    assert.equal(trouverTaille('m', modeleNombres), '38');
    assert.equal(trouverTaille('36', modeleNombres), '36', 'meme ecriture : jamais convertie');
    assert.equal(trouverTaille('XL', modeleNombres), undefined, 'XL = 42 : pas dans le modele');
    const modeleLettres = ['XS', 'S', 'M', '3XL'];
    assert.equal(trouverTaille('38', modeleLettres), 'M', 'fichier en nombres, modele en lettres');
    assert.equal(trouverTaille('46', modeleLettres), '3XL');
    assert.equal(trouverTaille('XXXL', modeleLettres), '3XL', 'XXXL et 3XL : la meme taille');
    // Le modele a les deux ecritures : la meme ecriture gagne.
    assert.equal(trouverTaille('S', ['S', '36']), 'S');
    assert.equal(trouverTaille('36', ['S', '36']), '36');
}

// --- Ecrire une taille dans la notation du modele (colonne a creer) ---
{
    assert.equal(tailleDansNotation('XS', 'nombres'), '34');
    assert.equal(tailleDansNotation('34', 'lettres'), 'XS');
    assert.equal(tailleDansNotation('34', 'nombres'), '34');
    assert.equal(tailleDansNotation('5XL', 'nombres'), '5XL', 'sans equivalent : telle quelle');
    assert.equal(tailleDansNotation('XS', null), 'XS');
    assert.equal(versNotation('S', 'nombres'), '36');
    assert.equal(versNotation('37', 'lettres'), null);
}

// --- Notation d'une liste ---
{
    assert.deepEqual(notationListe(['34', '36', '38']), { notation: 'nombres', melangee: false, lettres: 0, nombres: 3 });
    assert.deepEqual(notationListe(['S', 'M', 'L']), { notation: 'lettres', melangee: false, lettres: 3, nombres: 0 });
    const m = notationListe(['38', '40', '42', '44', 'XS', 'S', 'M', 'L', 'XL', 'XXL']);
    assert.equal(m.melangee, true, 'la liste de WA33-Q apres l\'import d\'un fichier en lettres');
    assert.equal(m.notation, 'lettres');
    assert.equal(notationListe([]).notation, null);
    assert.equal(notationListe(['S', '36']).notation, 'nombres', 'egalite : les nombres');
}

// --- Convertir un modele melange (« 38 40 42 44 XS S M L XL XXL ») ---
{
    const liste = ['38', '40', '42', '44', 'XS', 'S', 'M', 'L', 'XL', 'XXL'];
    const p = planifierConversion(liste, 'nombres');
    assert.deepEqual(p.sansEquivalent, []);
    assert.deepEqual(p.tailles, ['34', '36', '38', '40', '42', '44'], 'rangees dans l\'ordre de la table');
    assert.equal(p.renommage.XS, '34');
    assert.equal(p.renommage.XXL, '44');
    assert.equal(p.renommage['38'], '38');
    assert.deepEqual(p.fusions.map(f => [...f.de].sort().join('+') + '>' + f.vers), ['38+M>38', '40+L>40', '42+XL>42', '44+XXL>44']);
    // Vers les lettres.
    const q = planifierConversion(['34', '36', '38'], 'lettres');
    assert.deepEqual(q.tailles, ['XS', 'S', 'M']);
    assert.deepEqual(q.fusions, []);
    // Une taille sans equivalent bloque la conversion : on le dit, on ne devine pas.
    const r = planifierConversion(['34', '37', '38'], 'lettres');
    assert.deepEqual(r.sansEquivalent, ['37']);
    assert.equal(r.renommage['37'], '37');
}

console.log('correspondanceTailles : OK');
