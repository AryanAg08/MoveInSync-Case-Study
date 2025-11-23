import { Request, Response, NextFunction } from 'express';
import { redis } from '../utils/redis';

const WINDOW_SECS = Number(process.env.RATE_LIMIT_WINDOW_SECS || 900);
const MAX_ATTEMPTS = Number(process.env.RATE_LIMIT_MAX_ATTEMPTS || 6);

export async function loginRateLimiter(req: Request, res: Response, next: NextFunction) {
  try {
    const ip = (req.ip || req.headers['x-forwarded-for'] || 'unknown') as string;
    const key = `login_attempts:${ip}`;
    const attempts = await redis.incr(key);
    if (attempts === 1) await redis.expire(key, WINDOW_SECS);
    if (attempts > MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Too many login attempts. Try later.' });
    }
    next();
  } catch (err) {
    console.error('Rate limiter error', err);
    next();
  }
}
