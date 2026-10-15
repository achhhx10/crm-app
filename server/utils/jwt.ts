import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
const secret = JWT_SECRET || 'crm-secret-key-change-in-production';

/**
 * Reject secrets that look like they were pasted from a manual instead of generated.
 * Production once ran with JWT_SECRET set to the literal string 'openssl rand -base64 64',
 * which signs tokens anyone can forge because the value is published in this repo.
 * Generated base64 never contains whitespace, so whitespace is a reliable tell.
 */
function describeSecretProblem(value: string | undefined): string | null {
  if (!value) return 'JWT_SECRET is not set';
  if (value === 'crm-secret-key-change-in-production') return 'JWT_SECRET still holds the repository default';
  if (/\s/.test(value)) return 'JWT_SECRET looks like a shell command, not a generated secret';
  if (/^(openssl|npx|node|echo|cat)\b/i.test(value)) return 'JWT_SECRET looks like a shell command, not a generated secret';
  if (value.length < 32) return `JWT_SECRET is only ${value.length} characters, a generated one is at least 32`;
  return null;
}

const secretProblem = describeSecretProblem(JWT_SECRET);
if (secretProblem) {
  if (process.env.NODE_ENV === 'production') {
    console.error(`FATAL: ${secretProblem}. Generate a real value with: openssl rand -base64 64`);
    process.exit(1);
  }
  console.warn(`WARNING: ${secretProblem}. Falling back to the development secret.`);
}

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
