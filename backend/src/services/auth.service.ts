// backend/src/services/auth.service.ts
import { prisma } from '../utils/prisma';
import bcrypt from 'bcrypt';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { redis } from '../utils/redis';
import { v4 as uuidv4 } from 'uuid';

const REFRESH_TTL_SECONDS = 60 * 60 * 24 * Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS || 30);
const SALT_ROUNDS = 12;

type RegisterPayload = { email: string; password: string; name?: string };
type LoginPayload = { email: string; password: string };

export class AuthService {
  async register(payload: RegisterPayload) {
    // defensive checks
    if (!payload || typeof payload !== 'object') {
      const e: any = new Error('Invalid register payload');
      e.statusCode = 400;
      throw e;
    }
    const { email, password, name } = payload;
    if (!email || !password) {
      const e: any = new Error('Missing email or password');
      e.statusCode = 400;
      throw e;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      const e: any = new Error('Email already in use');
      e.statusCode = 409;
      throw e;
    }

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await prisma.user.create({
      data: { email, password: hashed, name }
    });

    // return safe object (no password)
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }

  async login(payload: LoginPayload) {
    if (!payload || typeof payload !== 'object') {
      const e: any = new Error('Invalid login payload');
      e.statusCode = 400;
      throw e;
    }
    const { email, password } = payload;
    if (!email || !password) {
      const e: any = new Error('Missing email or password');
      e.statusCode = 400;
      throw e;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const e: any = new Error('Invalid credentials');
      e.statusCode = 401;
      throw e;
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      const e: any = new Error('Invalid credentials');
      e.statusCode = 401;
      throw e;
    }

    const jti = uuidv4();
    const accessToken = signAccessToken({ userId: user.id, role: user.role });
    const refreshToken = signRefreshToken({ userId: user.id, jti });

    try {
      await redis.set(`refresh:${jti}`, user.id, 'EX', REFRESH_TTL_SECONDS);
    } catch (err) {
      console.error('[auth] redis set failed (non-fatal):', err?.message || err);
    }

    return { accessToken, refreshToken, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
  }

  async refresh(token: string) {
    try {
      const payload = verifyRefreshToken(token) as any;
      const { userId, jti } = payload;
      if (!userId || !jti) {
        const e: any = new Error('Invalid refresh token payload');
        e.statusCode = 400;
        throw e;
      }

      const stored = await redis.get(`refresh:${jti}`);
      if (!stored) {
        const e: any = new Error('Refresh token revoked or not found');
        e.statusCode = 401;
        throw e;
      }

      // rotate token
      try { await redis.del(`refresh:${jti}`); } catch (err) { console.error('[auth] redis del failed:', err?.message || err); }

      const newJti = uuidv4();
      const newAccess = signAccessToken({ userId });
      const newRefresh = signRefreshToken({ userId, jti: newJti });

      try { await redis.set(`refresh:${newJti}`, userId, 'EX', REFRESH_TTL_SECONDS); } catch (err) { console.error('[auth] redis set failed on rotate (non-fatal):', err?.message || err); }

      return { accessToken: newAccess, refreshToken: newRefresh };
    } catch (err) {
      const e: any = new Error('Invalid refresh token');
      e.statusCode = 401;
      throw e;
    }
  }

  async logout(token: string) {
    try {
      const payload = verifyRefreshToken(token) as any;
      const { jti } = payload;
      if (!jti) return;
      try { await redis.del(`refresh:${jti}`); } catch (err) { console.error('[auth] redis del failed during logout (non-fatal):', err?.message || err); }
    } catch (err) {
      // ignore invalid tokens
    }
  }
}
