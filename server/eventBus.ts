import { EventEmitter } from 'events';
import type { Request, Response, NextFunction } from 'express';

/**
 * In-process event bus used for true real-time push (WhatsApp-style):
 *
 *   ┌──────────────┐   write succeeds   ┌──────────────┐   emit("data:changed")   ┌─────────────────┐
 *   │  Controller  │  ───────────────▶  │  Middleware  │  ──────────────────────▶ │  SSE listeners  │
 *   └──────────────┘                    └──────────────┘                          └─────────────────┘
 *
 * Listeners receive the event in microseconds (synchronous in Node's event loop),
 * so the SSE stream pushes a new snapshot to the browser as soon as the database
 * has actually changed — no polling tick, no 1.5 s delay.
 */
class DataBus extends EventEmitter {}

const bus = new DataBus();
// We may have many SSE clients open at once (one per dashboard tab).
// Raise the listener cap so Node doesn't print a MaxListenersExceededWarning.
bus.setMaxListeners(200);

export type DataChangeEvent = {
    method: string;
    path: string;
    ownerId: number | null;
    statusCode: number;
};

export const DATA_CHANGED = 'data:changed' as const;

export function onDataChanged(listener: (evt: DataChangeEvent) => void): () => void {
    bus.on(DATA_CHANGED, listener);
    return () => bus.off(DATA_CHANGED, listener);
}

export function emitDataChanged(evt: DataChangeEvent): void {
    bus.emit(DATA_CHANGED, evt);
}

/**
 * Express middleware that watches every API request and, after a successful
 * write (POST / PUT / PATCH / DELETE returning 2xx/3xx), emits a single
 * `data:changed` event. This means every existing controller benefits from
 * instant push without any code change inside the controllers themselves.
 *
 * Read methods (GET / HEAD / OPTIONS) and the SSE stream itself are ignored.
 */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function dataChangeNotifier(req: Request, res: Response, next: NextFunction) {
    if (!WRITE_METHODS.has(req.method)) return next();
    if (!req.path.startsWith('/api/')) return next();
    // The stream endpoint itself never writes, but skip defensively.
    if (req.path.startsWith('/api/dashboard/kpis/stream')) return next();

    res.on('finish', () => {
        if (res.statusCode < 200 || res.statusCode >= 400) return;
        const ownerId = ((req as any).user?.id as number | undefined) ?? null;
        emitDataChanged({
            method: req.method,
            path: req.path,
            ownerId,
            statusCode: res.statusCode,
        });
    });

    next();
}
