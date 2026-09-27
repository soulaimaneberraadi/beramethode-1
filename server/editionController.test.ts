/**
 * Lancer : node --import tsx server/editionController.test.ts
 */
import assert from 'node:assert/strict';
import {
  demapper,
  estLoopback,
  estAdressePrivee,
  construireAdressesLan,
  labelNavigateur,
  hashCourt,
  appareilsActifs,
} from './editionController';

// ── demapper ────────────────────────────────────────────────────────────────
assert.equal(demapper('::ffff:192.168.1.20'), '192.168.1.20');
assert.equal(demapper('192.168.1.20'), '192.168.1.20');
assert.equal(demapper('::1'), '::1');

// ── estLoopback ───────────────────────────────────────────────────────────
assert.equal(estLoopback('127.0.0.1'), true);
assert.equal(estLoopback('::1'), true);
assert.equal(estLoopback('::ffff:127.0.0.1'), true);
assert.equal(estLoopback('192.168.1.20'), false);
assert.equal(estLoopback(''), false);

// ── estAdressePrivee : plages privées IPv4 ──────────────────────────────────
assert.equal(estAdressePrivee('127.0.0.1'), true);
assert.equal(estAdressePrivee('10.0.0.5'), true);
assert.equal(estAdressePrivee('10.255.255.255'), true);
assert.equal(estAdressePrivee('172.16.0.1'), true);
assert.equal(estAdressePrivee('172.31.255.255'), true);
assert.equal(estAdressePrivee('172.32.0.1'), false); // hors 172.16/12
assert.equal(estAdressePrivee('172.15.255.255'), false); // hors 172.16/12
assert.equal(estAdressePrivee('192.168.0.1'), true);
assert.equal(estAdressePrivee('192.168.255.255'), true);
assert.equal(estAdressePrivee('192.169.0.1'), false);

// Adresses publiques rejetées
assert.equal(estAdressePrivee('8.8.8.8'), false);
assert.equal(estAdressePrivee('1.1.1.1'), false);
assert.equal(estAdressePrivee('203.0.113.5'), false);

// IPv4-mappée dans IPv6 (::ffff:...)
assert.equal(estAdressePrivee('::ffff:192.168.1.20'), true);
assert.equal(estAdressePrivee('::ffff:8.8.8.8'), false);

// IPv6 privé/local
assert.equal(estAdressePrivee('fe80::1234'), true); // link-local
assert.equal(estAdressePrivee('fc00::1'), true); // unique-local
assert.equal(estAdressePrivee('fd12:3456::1'), true); // unique-local
assert.equal(estAdressePrivee('2001:4860:4860::8888'), false); // IPv6 public (Google DNS)

// vide / inconnu
assert.equal(estAdressePrivee(''), false);

// ── construireAdressesLan ────────────────────────────────────────────────
{
  const adresses = construireAdressesLan(7300);
  assert.ok(Array.isArray(adresses));
  for (const a of adresses) {
    assert.match(a, /^http:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:7300$/);
    assert.ok(!a.includes('169.254.'), 'pas de lien-local APIPA');
  }
}

// ── labelNavigateur ───────────────────────────────────────────────────────
assert.equal(
  labelNavigateur('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'),
  'Chrome · Windows',
);
assert.equal(
  labelNavigateur('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'),
  'Safari · iPhone',
);
assert.equal(
  labelNavigateur('Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'),
  'Chrome · Android',
);
assert.equal(labelNavigateur(''), 'Appareil inconnu');

// ── hashCourt : stable et distinct ────────────────────────────────────────
assert.equal(hashCourt('abc'), hashCourt('abc'));
assert.notEqual(hashCourt('abc'), hashCourt('abd'));

// ── appareilsActifs : filtre d'expiration (2 min) + tri local d'abord ─────
{
  const maintenant = Date.parse('2026-01-01T12:00:00.000Z');
  const recentDistant = {
    id: 'a', ip: '192.168.1.20', nom: 'Chrome · Windows', navigateur: 'Chrome · Windows',
    vuLe: new Date(maintenant - 30_000).toISOString(), local: false,
  };
  const expire = {
    id: 'b', ip: '192.168.1.21', nom: 'Firefox · Windows', navigateur: 'Firefox · Windows',
    vuLe: new Date(maintenant - 3 * 60_000).toISOString(), local: false,
  };
  const posteMachine = {
    id: 'c', ip: '127.0.0.1', nom: 'Chrome · Windows', navigateur: 'Chrome · Windows',
    vuLe: new Date(maintenant - 90_000).toISOString(), local: true,
  };

  const actifs = appareilsActifs([recentDistant, expire, posteMachine], maintenant);
  assert.equal(actifs.length, 2, 'l’appareil vu il y a 3 min doit être exclu');
  assert.equal(actifs[0].id, 'c', 'le poste principal (local) doit passer en premier');
  assert.equal(actifs[1].id, 'a');

  // Pile à la limite des 2 minutes : encore inclus
  const pileALaLimite = {
    id: 'd', ip: '192.168.1.22', nom: 'x', navigateur: 'x',
    vuLe: new Date(maintenant - 120_000).toISOString(), local: false,
  };
  const avecLimite = appareilsActifs([pileALaLimite], maintenant);
  assert.equal(avecLimite.length, 1);
}

// eslint-disable-next-line no-console
console.log('editionController.test.ts OK');
