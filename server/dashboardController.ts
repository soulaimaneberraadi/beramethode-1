import { Request, Response } from 'express';
import crypto from 'crypto';
import db from './db';
import { onDataChanged } from './eventBus';

/**
 * Compute dashboard KPIs for a given owner (pure function — no HTTP).
 * Re-used by both the classic GET /api/dashboard/kpis endpoint and the
 * Server-Sent Events stream endpoint (instant updates, WhatsApp-style).
 */
export function computeDashboardKPIs(ownerId: number) {
    const today = new Date().toISOString().slice(0, 10);
    const last7 = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);

    // ── Planning actif ──────────────────────────────────
    const planning = db.prepare(`
        SELECT COUNT(*) as total,
               SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) as en_cours,
               SUM(CASE WHEN status = 'DONE' THEN 1 ELSE 0 END) as termines,
               SUM(qteTotal) as qte_total,
               SUM(qteProduite) as qte_produite
        FROM planning_events WHERE owner_id = ?
    `).get(ownerId) as any;

    // ── Effectifs (hr_workers) ──────────────────────────
    const hrWorkers = db.prepare(`
        SELECT COUNT(*) as total,
               SUM(CASE WHEN type_contrat = 'CDI' THEN 1 ELSE 0 END) as cdi,
               SUM(CASE WHEN type_contrat != 'CDI' THEN 1 ELSE 0 END) as autres
        FROM hr_workers WHERE owner_id = ? AND is_active = 1
    `).get(ownerId) as any;

    // ── Pointage aujourd'hui (hr_pointage) ─────────────
    const pointageToday = db.prepare(`
        SELECT
            SUM(CASE WHEN p.statut = 'PRESENT' OR p.statut = 'RETARD' THEN 1 ELSE 0 END) as presents,
            SUM(CASE WHEN p.statut = 'ABSENT' THEN 1 ELSE 0 END) as absents,
            SUM(CASE WHEN p.statut = 'RETARD' THEN 1 ELSE 0 END) as retards
        FROM hr_pointage p
        JOIN hr_workers w ON p.worker_id = w.id
        WHERE p.date = ? AND w.owner_id = ?
    `).get(today, ownerId) as any;

    // ── Effectifs basique (workers) si hr_workers vide ──
    const basicWorkers = db.prepare(`
        SELECT COUNT(*) as total FROM workers WHERE owner_id = ? AND is_active = 1
    `).get(ownerId) as any;

    const totalEffectif = (hrWorkers?.total || 0) > 0 ? hrWorkers.total : (basicWorkers?.total || 0);

    // ── Stock alertes ───────────────────────────────────
    const stockAlerts = db.prepare(`
        SELECT p.id, p.designation, p.reference, p.stockAlerte, p.categorie,
               COALESCE(SUM(l.quantiteRestante), 0) as stock_actuel
        FROM magasin_products p
        LEFT JOIN magasin_lots l ON l.productId = p.id AND l.etat = 'disponible'
        WHERE p.owner_id = ?
        GROUP BY p.id
        HAVING stock_actuel <= p.stockAlerte AND p.stockAlerte > 0
        ORDER BY stock_actuel ASC
        LIMIT 5
    `).all(ownerId);

    // ── Valeur stock total ──────────────────────────────
    const stockValue = db.prepare(`
        SELECT COALESCE(SUM(l.quantiteRestante * l.prixUnitaire), 0) as valeur
        FROM magasin_lots l
        JOIN magasin_products p ON l.productId = p.id
        WHERE p.owner_id = ? AND l.etat = 'disponible'
    `).get(ownerId) as any;

    // ── Nb produits en stock ────────────────────────────
    const stockCount = db.prepare(
        'SELECT COUNT(*) as count FROM magasin_products WHERE owner_id = ?'
    ).get(ownerId) as any;

    // ── Mouvements 7 derniers jours ─────────────────────
    const mouvements7j = db.prepare(`
        SELECT m.date, SUM(m.quantite) as total_entrees
        FROM magasin_mouvements m
        JOIN magasin_products p ON m.productId = p.id
        WHERE p.owner_id = ? AND m.date >= ? AND m.type = 'entree'
        GROUP BY m.date ORDER BY m.date ASC
    `).all(ownerId, last7);

    // ── Production 7 derniers jours (suivi_data) ────────
    const prod7j = db.prepare(`
        SELECT s.date, SUM(s.pJournaliere) as total
        FROM suivi_data s
        WHERE s.owner_id = ? AND s.date >= ?
        GROUP BY s.date ORDER BY s.date ASC
    `).all(ownerId, last7);

    // ── Avances en cours ────────────────────────────────
    const avancesEnCours = db.prepare(`
        SELECT SUM(a.solde_restant) as total
        FROM hr_avances a
        JOIN hr_workers w ON a.worker_id = w.id
        WHERE w.owner_id = ? AND a.statut IN ('APPROUVE','EN_COURS')
    `).get(ownerId) as any;

    // ── Demandes appro en attente ────────────────────────
    const demandesAttente = db.prepare(`
        SELECT COUNT(*) as count FROM demandes_appro WHERE owner_id = ? AND statut = 'attente'
    `).get(ownerId) as any;

    // ── Production par chaîne (cette semaine) ───────────
    const prodParChaine = db.prepare(`
        SELECT e.chaineId as chaine, SUM(s.pJournaliere) as total, COUNT(s.id) as jours
        FROM suivi_data s
        JOIN planning_events e ON s.planningId = e.id
        WHERE s.owner_id = ? AND s.date >= ?
        GROUP BY e.chaineId ORDER BY total DESC LIMIT 8
    `).all(ownerId, last7);

    // ── Calendrier de Production (Mois en cours) ────────
    const firstOfMonth = new Date().toISOString().slice(0, 8) + '01';
    const prodDaysMonth = db.prepare(`
        SELECT DISTINCT date FROM suivi_data WHERE owner_id = ? AND date >= ?
    `).all(ownerId, firstOfMonth) as { date: string }[];
    const calendarProdDays = prodDaysMonth.map(d => parseInt(d.date.slice(8, 10), 10));

    // ── Sparklines: Tendance présence 7j ─────────────────
    const sparkPresence = db.prepare(`
        SELECT p.date, SUM(CASE WHEN p.statut = 'PRESENT' OR p.statut = 'RETARD' THEN 1 ELSE 0 END) as value
        FROM hr_pointage p
        JOIN hr_workers w ON p.worker_id = w.id
        WHERE w.owner_id = ? AND p.date >= ?
        GROUP BY p.date ORDER BY p.date ASC
    `).all(ownerId, last7);

    // ── Sparklines: Tendance OFs 7j ──────────────────────
    const sparkOFs = db.prepare(`
        SELECT SUBSTR(dateLancement, 1, 10) as date, COUNT(*) as value
        FROM planning_events
        WHERE owner_id = ? AND dateLancement >= ?
        GROUP BY date ORDER BY date ASC
    `).all(ownerId, last7);

    return {
        planning: {
            total: planning?.total || 0,
            en_cours: planning?.en_cours || 0,
            termines: planning?.termines || 0,
            qte_total: planning?.qte_total || 0,
            qte_produite: planning?.qte_produite || 0,
            avancement: planning?.qte_total > 0
                ? Math.round((planning.qte_produite / planning.qte_total) * 100)
                : 0,
        },
        effectifs: {
            total: totalEffectif,
            cdi: hrWorkers?.cdi || 0,
            presents: pointageToday?.presents || 0,
            absents: pointageToday?.absents || 0,
            retards: pointageToday?.retards || 0,
            taux_presence: totalEffectif > 0
                ? Math.round(((pointageToday?.presents || 0) / totalEffectif) * 100)
                : 0,
        },
        stock: {
            nb_produits: stockCount?.count || 0,
            valeur_totale: Math.round((stockValue?.valeur || 0) * 100) / 100,
            nb_alertes: stockAlerts.length,
            alertes: stockAlerts,
        },
        rh: {
            avances_encours: Math.round((avancesEnCours?.total || 0) * 100) / 100,
            demandes_attente: demandesAttente?.count || 0,
        },
        charts: {
            prod_7j: prod7j,
            mouvements_7j: mouvements7j,
            prod_par_chaine: prodParChaine,
            spark_presence: sparkPresence,
            spark_ofs: sparkOFs,
            calendar_prod_days: calendarProdDays,
        },
    };
}

export const getDashboardKPIs = (req: Request, res: Response) => {
    const ownerId = (req as any).user?.id as number | undefined;
    if (ownerId == null) {
        return res.status(401).json({ message: 'Authentication required' });
    }
    try {
        res.json(computeDashboardKPIs(ownerId));
    } catch (e) {
        console.error('getDashboardKPIs:', e);
        res.status(500).json({ message: 'Erreur serveur' });
    }
};

/**
 * Server-Sent Events stream — truly event-driven (WhatsApp-style).
 *
 * The server NEVER polls SQLite on a timer. Instead it subscribes to the
 * in-process `data:changed` event bus, which is fired by the
 * `dataChangeNotifier` middleware whenever any controller successfully
 * persists a write. That means a new snapshot reaches the browser in the
 * microseconds following the COMMIT — not 1.5 s later.
 *
 *   write request ──▶ controller ──▶ middleware emits ──▶ stream pushes
 *
 * A small coalescing debounce (DEBOUNCE_MS) collapses bursts of writes
 * (e.g. saving multiple planning events in a loop) into a single push,
 * which keeps the network quiet without adding perceptible latency.
 *
 * A safety heartbeat is sent every HEARTBEAT_MS so proxies / load
 * balancers don't drop an idle connection.
 *
 * Auth is via the JWT httpOnly cookie (same-origin); EventSource sends
 * cookies automatically when `withCredentials: true` is set on the client.
 */
const DEBOUNCE_MS = 80;
const HEARTBEAT_MS = 25000;

export const streamDashboardKPIs = (req: Request, res: Response) => {
    const ownerId = (req as any).user?.id as number | undefined;
    if (ownerId == null) {
        return res.status(401).json({ message: 'Authentication required' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
    res.flushHeaders?.();

    let lastHash = '';
    let closed = false;
    let debounceTimer: NodeJS.Timeout | null = null;

    const sendSnapshot = (force = false) => {
        if (closed) return;
        try {
            const data = computeDashboardKPIs(ownerId);
            const json = JSON.stringify(data);
            const hash = crypto.createHash('sha1').update(json).digest('hex');
            if (force || hash !== lastHash) {
                lastHash = hash;
                res.write(`event: kpis\ndata: ${json}\n\n`);
            }
        } catch (e) {
            console.error('streamDashboardKPIs push error:', e);
        }
    };

    // Initial snapshot — pushed once so the UI hydrates immediately on connect.
    sendSnapshot(true);

    // React to any successful write. We only react to writes performed by the
    // same owner to avoid leaking activity signals between tenants. Bursts of
    // writes are coalesced via a short debounce.
    const offDataChanged = onDataChanged((evt) => {
        if (closed) return;
        if (evt.ownerId != null && evt.ownerId !== ownerId) return;
        if (debounceTimer) return;
        debounceTimer = setTimeout(() => {
            debounceTimer = null;
            sendSnapshot();
        }, DEBOUNCE_MS);
    });

    const heartbeat = setInterval(() => {
        if (closed) return;
        res.write(`: heartbeat ${Date.now()}\n\n`);
    }, HEARTBEAT_MS);

    const cleanup = () => {
        if (closed) return;
        closed = true;
        if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
        clearInterval(heartbeat);
        offDataChanged();
        try { res.end(); } catch {}
    };

    req.on('close', cleanup);
    req.on('aborted', cleanup);
    res.on('error', cleanup);
};
