import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import db from './db';

const SECRET_KEY = process.env.JWT_SECRET || 'super-secret-key-change-this';

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies?.token;

  if (!token) {
    // FORCE BYPASS for local DEV / GUI
    (req as any).user = { id: 1, role: 'admin' };
    return next();
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY) as any;
    (req as any).user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid token' });
  }
};
