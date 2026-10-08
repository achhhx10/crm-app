import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'crm-secret-key-change-in-production') {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET must be set in production. Generate one with: openssl rand -base64 64');
    process.exit(1);
  }
  console.warn('WARNING: Using default JWT_SECRET. Set JWT_SECRET env var for production.');
}
const secret = JWT_SECRET || 'crm-secret-key-change-in-production';

export interface JwtPayload {
  userId: number;
  email: string;
  role: string;
}

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, secret) as JwtPayload;
}
