import { randomUUID } from 'crypto';
import db from '../server/db';
import fs from 'fs';

const OWNER_ID = 1; // Assuming default owner

function generate() {
  const suivis = [];
  const roles = [
    { id: 'recta', category: 'Les chaines' },
    { id: 'sujet', category: 'Les chaines' },
    { id: 'sp', category: 'Les chaines' },
    { id: 'man', category: 'Les chaines' },
    { id: 'chaf', category: 'Responsables & Encadrement' },
    { id: 'methodes', category: 'Responsables & Encadrement' },
    { id: 'qualite', category: 'Responsables & Encadrement' },
    { id: 'mecanicien', category: 'Responsables & Encadrement' },
    { id: 'finition', category: 'Finition' },
    { id: 'controle', category: 'Finition' },
    { id: 'transp', category: "L'emballage" },
    { id: 'stager', category: "L'emballage" }
  ];

  for (let day = 1; day <= 30; day++) {
    const dateStr = `2026-04-${String(day).padStart(2, '0')}`;
    const chains = ['CHAINE 1', 'CHAINE 2', 'CHAINE 3', 'CHAINE 4'];
    
    chains.forEach(chain => {
      const sequence = [120, 150, 122, 100, 134, 145, 115, 128, 142, 105, 138, 112, 125, 148, 130, 118, 140, 108, 133, 147, 119, 126, 139, 102, 144, 116, 129, 141, 111, 135];
      const randTotal = sequence[day - 1] || 100;
      
      const customEff: Record<string, number> = {};
      let remaining = randTotal;
      
      roles.forEach((r, idx) => {
        if (idx === roles.length - 1) {
          customEff[r.id] = remaining;
        } else {
          const avg = remaining / (roles.length - idx);
          const count = Math.max(1, Math.floor(avg * (0.8 + Math.random() * 0.4)));
          const actual = Math.min(count, remaining - (roles.length - 1 - idx));
          customEff[r.id] = actual > 0 ? actual : 1;
          remaining -= customEff[r.id];
        }
      });

      suivis.push({
        id: `test_${dateStr}_${chain.replace(' ', '')}`,
        planningId: `test_${chain.replace(' ', '')}`,
        chaineId: chain,
        date: dateStr,
        entrer: 0,
        sorties: {},
        totalHeure: 0,
        pJournaliere: 0,
        enCour: 0,
        resteEntrer: 0,
        resteSortie: 0,
        totalWorkers: randTotal,
        customEffectifs: customEff
      });
    });
  }

  const transaction = db.transaction(() => {
    // Delete existing April 2026 test data to avoid duplicates/mess
    db.prepare(`DELETE FROM suivi_data WHERE date LIKE '2026-04-%' AND planningId LIKE 'test_%'`).run();

    const stmt = db.prepare(`
      INSERT INTO suivi_data 
      (id, owner_id, planningId, date, pJournaliere, totalWorkers, trs, raw_data, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(planningId, date) DO UPDATE SET
      pJournaliere=excluded.pJournaliere, totalWorkers=excluded.totalWorkers, trs=excluded.trs,
      raw_data=excluded.raw_data, updated_at=CURRENT_TIMESTAMP
    `);

    for (const s of suivis) {
      stmt.run(
        s.id, OWNER_ID, s.planningId, s.date, s.pJournaliere || 0, s.totalWorkers || 0, 0,
        JSON.stringify(s)
      );
    }
  });

  transaction();
  console.log(`Successfully generated and inserted ${suivis.length} rows for April 2026 test data.`);
}

generate();
