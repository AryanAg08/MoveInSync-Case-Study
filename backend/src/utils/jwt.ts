// backend/src/utils/jwt.ts
import jwt from 'jsonwebtoken';

const DEFAULT_ACCESS = '15m';
const DEFAULT_REFRESH_DAYS = 30;

// Helper: accept "15m", "1h", "900" (seconds) or numeric string -> return string or number
function normalizeExpires(input?: string): string | number {
  if (!input) return DEFAULT_ACCESS;

  const trimmed = input.trim();

  // Pure number (seconds)
  if (/^\d+$/.test(trimmed)) return Number(trimmed);

  // Accept formats like "15m", "1h", "30d", "10s"
  if (/^\d+\s*[smhd]$/i.test(trimmed)) {
    // remove spaces: "15 m" -> "15m"
    return trimmed.replace(/\s+/g, '');
  }

  // Accept durations like "15min" or "15mins"? Not standard — reject those.
  console.warn(`[jwt] ACCESS_TOKEN_EXPIRES has unexpected format "${input}", falling back to default "${DEFAULT_ACCESS}"`);
  return DEFAULT_ACCESS;
}

function normalizeRefreshDays(input?: string): number {
  if (!input) return DEFAULT_REFRESH_DAYS;
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  console.warn(`[jwt] REFRESH_TOKEN_EXPIRES_DAYS has unexpected format "${input}", falling back to default ${DEFAULT_REFRESH_DAYS}`);
  return DEFAULT_REFRESH_DAYS;
}

const ACCESS_EXPIRES = normalizeExpires(process.env.ACCESS_TOKEN_EXPIRES);
const REFRESH_EXPIRES_DAYS = normalizeRefreshDays(process.env.REFRESH_TOKEN_EXPIRES_DAYS);

// Make sure secrets exist but don't crash; warn instead
if (!process.env.JWT_SECRET) {
  console.warn('[jwt] WARNING: JWT_SECRET is not set. Using insecure default for development only.');
}
if (!process.env.REFRESH_SECRET) {
  console.warn('[jwt] WARNING: REFRESH_SECRET is not set. Using insecure default for development only.');
}

export function signAccessToken(payload: object) {
  // jwt.sign accepts `expiresIn` as string or number (seconds). Our normalize returns valid values.
  return jwt.sign(payload, process.env.JWT_SECRET || 'dev_jwt_secret', { expiresIn: ACCESS_EXPIRES as string | number });
}

export function signRefreshToken(payload: object) {
  const days = REFRESH_EXPIRES_DAYS;
  // jsonwebtoken accepts string like "30d"
  return jwt.sign(payload, process.env.REFRESH_SECRET || 'dev_refresh_secret', { expiresIn: `${days}d` });
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, process.env.JWT_SECRET || 'dev_jwt_secret') as any;
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, process.env.REFRESH_SECRET || 'dev_refresh_secret') as any;
}
