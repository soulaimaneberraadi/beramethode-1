import 'express-serve-static-core';

declare module 'express-serve-static-core' {
    interface Request {
        /** Renseigné par `authenticateToken` dans `server/middleware.ts`. */
        user?: {
            id: number;
            email?: string;
            name?: string;
            role?: string;
        };
    }
}

export {};
