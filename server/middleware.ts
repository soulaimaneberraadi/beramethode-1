import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import db from './db';
import { SECRET_KEY } from './jwtConfig';

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY) as { id: number; email?: string; role?: string };
    const row = db.prepare('SELECT id, email, name, role FROM users WHERE id = ?').get(decoded.id) as
      | { id: number; email: string; name: string; role: string }
      | undefined;
    if (!row) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    (req as any).user = { id: row.id, email: row.email, name: row.name, role: row.role };
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid token' });
  }
};
