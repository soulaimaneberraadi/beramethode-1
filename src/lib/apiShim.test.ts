/**
 * Le mode statique (Vercel, telephone) n'a pas de serveur : l'intercepteur fetch enregistre les modeles
 * dans le navigateur. Il doit refuser, comme `saveModel` du serveur, qu'un modele venu d'une fenetre
 * perimee efface l'ordre de coupe fait entre-temps.
 *
 * Lancer : node --import tsx src/lib/apiShim.test.ts
 */
import assert from 'node:assert/strict';

// Un navigateur de poche : un localStorage en memoire et un `window` qui est l'espace global.
const memoire = new Map<string, string>();
const g = globalThis as any;
g.localStorage = {
    getItem: (k: string) => (memoire.has(k) ? memoire.get(k)! : null),
    setItem: (k: string, v: string) => { memoire.set(k, String(v)); },
    removeItem: (k: string) => { memoire.delete(k); },
};
g.location = { origin: 'http://localhost:7000' };
g.window = g;
g.fetch = async () => { throw new Error('pas de reseau : tout passe par l’intercepteur'); };

async function main() {
  const { installApiShim, ordreCoupeRetenu } = await import('./apiShim');

  // --- La regle seule : comme le serveur, la chaine ISO la plus recente gagne ---
  {
      const vieux = { majLe: '2026-10-01T08:00:00.000Z', n: 'vieux' };
      const neuf = { majLe: '2026-10-02T08:00:00.000Z', n: 'neuf' };
      assert.equal(ordreCoupeRetenu(neuf, vieux), neuf, 'le recu est plus ancien : on garde le stocke');
      assert.equal(ordreCoupeRetenu(vieux, neuf), neuf, 'le recu est plus recent : il passe');
      assert.equal(ordreCoupeRetenu(neuf, neuf), neuf, 'meme date : le recu (identique) passe');
      assert.equal(ordreCoupeRetenu(neuf, undefined), neuf, 'rien recu : on garde le stocke');
      assert.equal(ordreCoupeRetenu(neuf, { n: 'sans date' }).n, 'neuf', 'recu sans majLe : on garde le stocke');
      const recu = { n: 'recu' };
      assert.equal(ordreCoupeRetenu({ n: 'sans date' }, recu), recu, 'stocke sans majLe : rien a proteger');
      assert.equal(ordreCoupeRetenu(undefined, recu), recu, 'rien de stocke');
  }

  // --- Par l'intercepteur : POST/PUT /api/models ---
  installApiShim();
  const appeler = async (methode: string, chemin: string, corps?: unknown) => {
      const r = await fetch(chemin, { method: methode, headers: { 'Content-Type': 'application/json' }, body: corps === undefined ? undefined : JSON.stringify(corps) });
      return { status: r.status, corps: await r.json() as any };
  };
  const modeles = async () => (await appeler('GET', '/api/models')).corps as any[];
  const T1 = '2026-10-01T08:00:00.000Z', T2 = '2026-10-02T08:00:00.000Z', T3 = '2026-10-03T08:00:00.000Z';
  const ordre = (majLe: string | undefined, nbMatelas: number) => ({
      refModele: 'M1', status: 'EN_COURS', ...(majLe ? { majLe } : {}),
      matelasLines: Array.from({ length: nbMatelas }, (_, i) => ({ id: `l${i}`, numero: String(i + 1), plis: 100, ratios: { S: 1 } })),
  });

  {
      // L'ordre complet est enregistre (2 matelas, T2).
      let r = await appeler('POST', '/api/models', { id: 'M1', meta_data: { nom_modele: 'v1' }, ordreCoupe: ordre(T2, 2) });
      assert.equal(r.status, 200);

      // Une fenetre perimee renvoie le modele entier avec un ordre plus ancien (0 matelas, T1) et un autre nom.
      r = await appeler('POST', '/api/models', { id: 'M1', meta_data: { nom_modele: 'v2' }, ordreCoupe: ordre(T1, 0) });
      assert.equal(r.status, 200, 'comme le serveur : pas de refus, l’enregistrement reussit');
      let m = (await modeles()).find(x => x.id === 'M1');
      assert.equal(m.ordreCoupe.majLe, T2, 'l’ordre de coupe stocke est plus recent : il reste');
      assert.equal(m.ordreCoupe.matelasLines.length, 2, 'les matelas ne sont pas effaces');
      assert.equal(m.meta_data.nom_modele, 'v2', 'le reste du modele s’enregistre');
      assert.equal(r.corps.ordreCoupe.majLe, T2, 'la reponse montre ce qui est vraiment stocke');

      // Un modele sans aucun ordre de coupe (une fenetre qui ne l'a jamais ouvert) ne l'efface pas non plus.
      await appeler('POST', '/api/models', { id: 'M1', meta_data: { nom_modele: 'v3' } });
      m = (await modeles()).find(x => x.id === 'M1');
      assert.equal(m.ordreCoupe.matelasLines.length, 2);
      assert.equal(m.meta_data.nom_modele, 'v3');

      // Un ordre sans date recue alors qu'il y en a une : meme chose.
      await appeler('POST', '/api/models', { id: 'M1', meta_data: { nom_modele: 'v4' }, ordreCoupe: ordre(undefined, 5) });
      m = (await modeles()).find(x => x.id === 'M1');
      assert.equal(m.ordreCoupe.matelasLines.length, 2, 'sans majLe, il ne gagne pas');

      // PUT partiel : meme garde.
      await appeler('PUT', '/api/models/M1', { ordreCoupe: ordre(T1, 1) });
      m = (await modeles()).find(x => x.id === 'M1');
      assert.equal(m.ordreCoupe.majLe, T2);
      assert.equal(m.meta_data.nom_modele, 'v4', 'le PUT partiel garde le reste du modele');

      // Un ordre plus recent passe, evidemment.
      await appeler('POST', '/api/models', { id: 'M1', meta_data: { nom_modele: 'v5' }, ordreCoupe: ordre(T3, 4) });
      m = (await modeles()).find(x => x.id === 'M1');
      assert.equal(m.ordreCoupe.majLe, T3);
      assert.equal(m.ordreCoupe.matelasLines.length, 4);

      // Meme date : c'est la meme version, elle passe.
      await appeler('POST', '/api/models', { id: 'M1', meta_data: { nom_modele: 'v6' }, ordreCoupe: ordre(T3, 6) });
      assert.equal((await modeles()).find(x => x.id === 'M1').ordreCoupe.matelasLines.length, 6);
  }

  // --- Un ordre stocke sans majLe (ancien modele) : rien a proteger ---
  {
      await appeler('POST', '/api/models', { id: 'M2', ordreCoupe: ordre(undefined, 3) });
      await appeler('POST', '/api/models', { id: 'M2', ordreCoupe: ordre(T1, 1) });
      const m = (await modeles()).find(x => x.id === 'M2');
      assert.equal(m.ordreCoupe.matelasLines.length, 1);
      assert.equal(m.ordreCoupe.majLe, T1);
  }

  // --- Un modele supprime puis recree : le serveur n'a plus la ligne, il n'y a pas de version a proteger ---
  {
      await appeler('POST', '/api/models', { id: 'M3', ordreCoupe: ordre(T3, 3) });
      await appeler('DELETE', '/api/models/M3');
      await appeler('POST', '/api/models', { id: 'M3', ordreCoupe: ordre(T1, 1) });
      const m = (await modeles()).find(x => x.id === 'M3');
      assert.equal(m.ordreCoupe.majLe, T1);
  }

  // --- Les autres collections ne changent pas ---
  {
      await appeler('POST', '/api/planning', { id: 'ev1', ordreCoupe: { majLe: T3 } });
      await appeler('POST', '/api/planning', { id: 'ev1', ordreCoupe: { majLe: T1 } });
      const ev = (await appeler('GET', '/api/planning')).corps.find((x: any) => x.id === 'ev1');
      assert.equal(ev.ordreCoupe.majLe, T1, 'seuls les modeles ont cette garde');
  }

  console.log('apiShim : OK');
}

// L'intercepteur arme un minuteur de nettoyage de 5 minutes : on sort explicitement.
main().then(() => process.exit(0), e => { console.error(e); process.exit(1); });
