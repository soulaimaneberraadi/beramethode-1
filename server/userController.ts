import { Request, Response, NextFunction } from 'express';
import db from './db';

/** Use after `authenticateToken` — role on `req.user` is refreshed from DB each request */
export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  const u = (req as any).user as { id?: number; role?: string } | undefined;
  if (!u?.id) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  if (u.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admins only.' });
  }
  next();
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
