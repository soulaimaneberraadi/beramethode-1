import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import db from './db';

const SECRET_KEY = process.env.JWT_SECRET || 'super-secret-key-change-this';

// Middleware to check if user is admin
export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY) as any;
    if (decoded.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admins only.' });
    }
    (req as any).user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

export const getAllUsers = (req: Request, res: Response) => {
  try {
    const stmt = db.prepare('SELECT id, email, name, role, created_at FROM users');
    const users = stmt.all();
    res.json(users);
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateUserRole = (req: Request, res: Response) => {
  const { id } = req.params;
  const { role } = req.body;

  if (!['user', 'admin'].includes(role)) {
    return res.status(400).json({ message: 'Invalid role' });
  }

  try {
    const stmt = db.prepare('UPDATE users SET role = ? WHERE id = ?');
    const info = stmt.run(role, id);

    if (info.changes === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'User role updated successfully' });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteUser = (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    // Prevent deleting self (optional but recommended)
    if ((req as any).user.id == id) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    const stmt = db.prepare('DELETE FROM users WHERE id = ?');
    const info = stmt.run(id);

    if (info.changes === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Authentication endpoint backdoor (makeMeAdmin) removed. 
// Admin roles should be manually seeded directly in the db or carefully managed via an admin panel only.
