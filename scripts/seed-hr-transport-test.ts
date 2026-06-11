/**
 * Seeds transport lines and maps existing workers to these lines and equipes for testing.
 * Uses a list of 20 major Moroccan cities and neighborhoods, assigning 100% of workers.
 *
 * Usage:
 *   npx tsx scripts/seed-hr-transport-test.ts
 */
import { randomUUID } from 'crypto';
import db from '../server/db';

async function main() {
  console.log('Starting seed-hr-transport-test...');

  // Get all users
  const users = db.prepare('SELECT id, email, name FROM users').all() as { id: number; email: string; name: string }[];
  if (users.length === 0) {
    users.push({ id: 1, email: 'guest@local', name: 'Guest' });
  }

  console.log(`Found ${users.length} users to seed for.`);

  const lineData = [
    { code: 'L1', city: 'Casablanca', neighborhood: 'Hay Mohammadi', driver: 'Youssef El Alami', phone: '0661122334', plate: '12345-A-6', cap: 15 },
    { code: 'L2', city: 'Rabat', neighborhood: 'Agdal', driver: 'Adil Bensaid', phone: '0662233445', plate: '67890-B-8', cap: 18 },
    { code: 'L3', city: 'Fès', neighborhood: 'Narjiss', driver: 'Karim Cherkaoui', phone: '0663344556', plate: '11223-D-2', cap: 15 },
    { code: 'L4', city: 'Marrakech', neighborhood: 'Gueliz', driver: 'Rachid Nasri', phone: '0664455667', plate: '44556-F-4', cap: 12 },
    { code: 'L5', city: 'Tanger', neighborhood: 'Marshan', driver: 'Mustapha Fassi', phone: '0665566778', plate: '77889-H-9', cap: 15 },
    { code: 'L6', city: 'Agadir', neighborhood: 'Talborjt', driver: 'Hicham Tahiri', phone: '0666677889', plate: '99001-J-1', cap: 15 },
    { code: 'L7', city: 'Meknès', neighborhood: 'Hamria', driver: 'Noureddine Kabbaj', phone: '0667788990', plate: '55667-A-20', cap: 18 },
    { code: 'L8', city: 'Oujda', neighborhood: 'Lazaret', driver: 'Abdellah Chraibi', phone: '0668899001', plate: '22334-B-15', cap: 12 },
    { code: 'L9', city: 'Kenitra', neighborhood: 'Ville Haute', driver: 'Mohamed Bennani', phone: '0669900112', plate: '88990-D-12', cap: 15 },
    { code: 'L10', city: 'Tétouan', neighborhood: 'Wilaya', driver: 'Ahmed El Mansouri', phone: '0660011223', plate: '33445-F-26', cap: 15 },
    { code: 'L11', city: 'Safi', neighborhood: 'Plateau', driver: 'Khalid Jabri', phone: '0661122334', plate: '12123-H-44', cap: 18 },
    { code: 'L12', city: 'Temara', neighborhood: 'Massira', driver: 'Said Rahmouni', phone: '0662233445', plate: '98765-J-33', cap: 20 },
    { code: 'L13', city: 'Mohammedia', neighborhood: 'El Alia', driver: 'Driss Dahbi', phone: '0663344556', plate: '45456-A-7', cap: 15 },
    { code: 'L14', city: 'El Jadida', neighborhood: 'Salam', driver: 'Anass Sabiri', phone: '0664455667', plate: '65432-B-9', cap: 15 },
    { code: 'L15', city: 'Nador', neighborhood: 'Lmatar', driver: 'Omar Tazi', phone: '0665566778', plate: '78789-D-5', cap: 15 },
    { code: 'L16', city: 'Settat', neighborhood: 'Somal', driver: 'Yassine Filali', phone: '0666677889', plate: '89890-F-3', cap: 15 },
    { code: 'L17', city: 'Taza', neighborhood: 'Bin Jradi', driver: 'Mehdi Slaoui', phone: '0667788990', plate: '12345-H-12', cap: 18 },
    { code: 'L18', city: 'Khouribga', neighborhood: 'Qods', driver: 'Tariq Oudghiri', phone: '0668899001', plate: '54321-J-10', cap: 15 },
    { code: 'L19', city: 'Beni Mellal', neighborhood: 'Riad', driver: 'Jawad Belkhayat', phone: '0669900112', plate: '67678-A-14', cap: 12 },
    { code: 'L20', city: 'Larache', neighborhood: 'Center', driver: 'Zouhair Bennis', phone: '0660011223', plate: '90901-B-22', cap: 15 }
  ];

  const insLine = db.prepare(`
    INSERT INTO hr_transport_lignes (
      id, nom, code_ligne, quartier, chauffeur_nom, chauffeur_tel, matricule_vehicule, capacite, notes, owner_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updateWorker = db.prepare('UPDATE hr_workers SET transport_ligne_id = ?, equipe = ?, adresse = ? WHERE id = ?');
  const equipes = ['Équipe A', 'Équipe B', 'Équipe C'];

  for (const user of users) {
    const ownerId = user.id;
    console.log(`Seeding transport for User: ${user.name} (${user.email}, ID: ${ownerId})`);

    // 1. Delete existing transport lines for this owner
    db.prepare('DELETE FROM hr_transport_lignes WHERE owner_id = ?').run(ownerId);
    db.prepare('UPDATE hr_workers SET transport_ligne_id = NULL WHERE owner_id = ?').run(ownerId);

    // 2. Insert new lines for this owner
    const insertedLines = [];
    for (const l of lineData) {
      const lineId = `tr-${randomUUID()}`;
      const lineName = `Ligne ${l.city} - ${l.neighborhood}`;
      const notes = `Service Navette ${l.city}`;
      
      insLine.run(lineId, lineName, l.code, l.neighborhood, l.driver, l.phone, l.plate, l.cap, notes, ownerId);
      
      insertedLines.push({
        id: lineId,
        city: l.city,
        neighborhood: l.neighborhood
      });
    }
    console.log(`Inserted ${insertedLines.length} transport lines for owner ${ownerId}.`);

    // 3. Assign workers to transport lines and generate random Moroccan addresses
    const workers = db.prepare('SELECT id, equipe FROM hr_workers WHERE owner_id = ?').all(ownerId) as { id: string; equipe?: string }[];
    console.log(`Found ${workers.length} workers in database for owner ${ownerId}.`);

    let assignedCount = 0;
    for (let i = 0; i < workers.length; i++) {
      const w = workers[i];
      
      // Select one of the 20 lines sequentially to distribute them evenly
      const line = insertedLines[i % insertedLines.length];
      
      // Generate a realistic Moroccan address in that city/neighborhood
      const streetNum = ((i * 7) % 150) + 1;
      const fullAddr = `${line.city} — ${line.neighborhood}, N° ${streetNum}`;
      
      const equipe = w.equipe && w.equipe !== 'Sans Équipe' ? w.equipe : equipes[i % equipes.length];
      
      updateWorker.run(line.id, equipe, fullAddr, w.id);
      assignedCount++;
    }

    console.log(`Updated ${workers.length} workers for owner ${ownerId}: ${assignedCount} assigned to transport lines.`);
  }

  console.log('Seed-hr-transport-test completed successfully.');
}

main().catch(console.error);
