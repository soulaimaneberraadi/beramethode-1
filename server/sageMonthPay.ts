import db from './db';
import { heuresSageAgrumules, sageGrossMAD } from './sageHeuresService';

export function monthYMBounds(ym: string): { from: string; to: string } | null {
    const p = /^(\d{4})-(\d{2})$/.exec(ym);
    if (!p) return null;
    const Y = parseInt(p[1], 10);
    const M = parseInt(p[2], 10);
    if (M < 1 || M > 12) return null;
    const from = `${ym}-01`;
    const lastD = new Date(Y, M, 0).getDate();
    const to = `${ym}-${String(lastD).padStart(2, '0')}`;
    return { from, to };
}

export type SageMoisPointageRow = {
    heure_entree: string | null;
    heure_sortie: string | null;
    pause_debut: string | null;
    pause_fin: string | null;
    date: string;
    statut: string | null;
    heures_normales: number | null;
    heures_supp_25: number | null;
    heures_supp_50: number | null;
    heures_travaillees: number | null;
};

const stmtPointageMois = () =>
    db.prepare(
        `SELECT heure_entree, heure_sortie, pause_debut, pause_fin, date, statut,
    heures_normales, heures_supp_25, heures_supp_50, heures_travaillees
    FROM hr_pointage
    WHERE worker_id = ? AND date >= ? AND date <= ? AND statut = 'PRESENT'
    ORDER BY date ASC, id ASC`,
    );

type WorkerPay = {
    id: string;
    taux_horaire: number;
    prime_assiduite: number;
    prime_transport: number;
    matricule: string;
    full_name: string;
    cin: string | null;
};

/** Une ligne d’export / aperçu = même agrégation `heuresSageAgrumules` + `sageGrossMAD` que le dossier ouvrier. */
export function sagePayRowForOwnerAndPointage(
    ownerId: number,
    w: WorkerPay,
    pointageRows: SageMoisPointageRow[],
) {
    const agg = heuresSageAgrumules(ownerId, pointageRows);
    const total_brut = sageGrossMAD(agg, w);
    return {
        matricule: w.matricule,
        nom: w.full_name,
        cin: w.cin,
        nb_jours: pointageRows.length,
        heures_normales: agg.normales,
        heures_supp_25: agg.supp25,
        heures_supp_50: agg.supp50,
        heures_travaillees: agg.travaillees,
        total_brut,
        net_a_payer: total_brut,
    };
}

export function computeSageMoisForOwner(ownerId: number, mois: string) {
    const b = monthYMBounds(mois);
    if (!b) return null;
    const workers = db
        .prepare('SELECT * FROM hr_workers WHERE owner_id = ? AND is_active = 1 ORDER BY matricule ASC')
        .all(ownerId) as WorkerPay[];
    const q = stmtPointageMois();
    const rows = [];
    for (const w of workers) {
        const pts = q.all(w.id, b.from, b.to) as SageMoisPointageRow[];
        rows.push(sagePayRowForOwnerAndPointage(ownerId, w, pts));
    }
    return { mois, rows };
}

function escCsvCell(s: string) {
    const t = String(s);
    if (/[;\n\r"]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
    return t;
}

export type SageMoisRowOut = ReturnType<typeof sagePayRowForOwnerAndPointage>;

export function buildSageMoisCsv(rows: SageMoisRowOut[]): string {
    const head = [
        'Matricule',
        'Nom',
        'CIN',
        'Jours',
        'H. normales',
        'H.S. 25',
        'H.S. 50',
        'H. travaillées',
        'Total brut (MAD)',
        'Net à payer (MAD)',
    ];
    const lines = [head.map(escCsvCell).join(';')];
    for (const r of rows) {
        lines.push(
            [
                r.matricule,
                r.nom,
                r.cin ?? '',
                String(r.nb_jours),
                String(r.heures_normales).replace('.', ','),
                String(r.heures_supp_25).replace('.', ','),
                String(r.heures_supp_50).replace('.', ','),
                String(r.heures_travaillees).replace('.', ','),
                String(r.total_brut).replace('.', ','),
                String(r.net_a_payer).replace('.', ','),
            ]
                .map(escCsvCell)
                .join(';'),
        );
    }
    return lines.join('\r\n');
}
