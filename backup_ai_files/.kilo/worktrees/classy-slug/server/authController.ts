import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from './db';
import nodemailer from 'nodemailer';
import { randomInt } from 'crypto';

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error("FATAL: JWT_SECRET environment variable is not defined in production.");
}
const SECRET_KEY = process.env.JWT_SECRET || 'super-secret-key-change-this';

// Configure Nodemailer Transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'mail.yourdomain.com',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || 'no-reply@yourdomain.com',
    pass: process.env.SMTP_PASS || 'your_password_here',
  },
});

export const register = async (req: Request, res: Response) => {
  const { email, password, name } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const stmt = db.prepare('INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)');
    const info = stmt.run(email, hashedPassword, name || '', 'user');

    const token = jwt.sign({ id: info.lastInsertRowid, email, role: 'user' }, SECRET_KEY, { expiresIn: '24h' });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    res.status(201).json({ user: { id: info.lastInsertRowid, email, name, role: 'user' } });
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ message: 'Email already exists' });
    }
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
    const user = stmt.get(email) as any;

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, SECRET_KEY, { expiresIn: '24h' });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const logout = (req: Request, res: Response) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
};

export const me = (req: Request, res: Response) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY) as any;
    const stmt = db.prepare('SELECT id, email, name, role FROM users WHERE id = ?');
    const user = stmt.get(decoded.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

export const requestPasswordReset = (req: Request, res: Response) => {
  const { email } = req.body;

  try {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user) {
      return res.json({
        message: 'If the email exists, a verification code has been sent',
        devCode: undefined
      });
    }

    // Generate 6-digit code securely
    const code = randomInt(100000, 999999).toString();
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes

    db.prepare('INSERT INTO verification_codes (email, code, expires_at) VALUES (?, ?, ?)').run(email, code, expiresAt);

    // Log the code for debugging (in case email fails or for development)
    console.log(`Verification code for ${email}: ${code}`);

    // Send email using Nodemailer
    const mailOptions = {
      from: `"BERAMETHODE" <${process.env.SMTP_USER || 'no-reply@yourdomain.com'}>`,
      to: email,
      subject: 'Your Verification Code - BERAMETHODE',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #f9f9f9;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h1 style="color: #00D37F; margin: 0;">BERAMETHODE</h1>
            <p style="color: #666; font-size: 12px; letter-spacing: 2px; text-transform: uppercase;">Industrial Intelligence</p>
          </div>
          <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            <h2 style="color: #333; margin-top: 0;">Password Reset Verification</h2>
            <p style="color: #555; line-height: 1.6;">You requested a password reset for your BERAMETHODE account. Please use the following verification code to complete the process:</p>
            <div style="text-align: center; margin: 30px 0;">
              <span style="display: inline-block; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #333; background-color: #f0f4f8; padding: 15px 30px; border-radius: 5px; border: 1px solid #d1d5db;">${code}</span>
            </div>
            <p style="color: #555; line-height: 1.6;">This code will expire in 15 minutes.</p>
            <p style="color: #999; font-size: 12px; margin-top: 20px;">If you did not request this code, please ignore this email.</p>
          </div>
          <div style="text-align: center; margin-top: 20px; color: #aaa; font-size: 11px;">
            &copy; ${new Date().getFullYear()} BERAMETHODE. All rights reserved.
          </div>
        </div>
      `,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Error sending email:', error);
        // In production, you might want to handle this error more gracefully or retry
      } else {
        console.log('Email sent:', info.response);
      }
    });

    res.json({
      message: 'If the email exists, a verification code has been sent',
      // For development/preview purposes only, include the code in the response
      // This allows testing without a working SMTP server
      devCode: process.env.NODE_ENV !== 'production' ? code : undefined
    });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const verifyResetCode = (req: Request, res: Response) => {
  const { email, code } = req.body;

  try {
    const record = db.prepare('SELECT * FROM verification_codes WHERE email = ? AND code = ? AND expires_at > ?').get(email, code, Date.now());

    if (!record) {
      return res.status(400).json({ message: 'Invalid or expired code' });
    }

    res.json({ message: 'Code verified' });
  } catch (error) {
    console.error('Code verification error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  const { email, code, newPassword } = req.body;

  try {
    const record = db.prepare('SELECT * FROM verification_codes WHERE email = ? AND code = ? AND expires_at > ?').get(email, code, Date.now());

    if (!record) {
      return res.status(400).json({ message: 'Invalid or expired code' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Enforce Transaction for data integrity
    const transaction = db.transaction(() => {
      db.prepare('UPDATE users SET password = ? WHERE email = ?').run(hashedPassword, email);
      db.prepare('DELETE FROM verification_codes WHERE email = ?').run(email);
    });
    transaction();

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
