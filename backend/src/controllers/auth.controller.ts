// backend/src/controllers/auth.controller.ts
import express from 'express';
import { AuthService } from '../services/auth.service';
import { z } from 'zod';

const router = express.Router();
const svc = new AuthService();

// Validation schemas
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional()
});
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

router.post('/register', async (req, res, next) => {
  try {
    const parsed = registerSchema.parse(req.body);

    // Cast to strict RegisterPayload to satisfy TypeScript
    const user = await svc.register(
      parsed as { email: string; password: string; name?: string }
    );

    return res.status(201).json(user);
  } catch (err) {
    return next(err);
  }
});


router.post('/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.parse(req.body);
    // cast to LoginPayload so TypeScript is satisfied
    const result = await svc.login(parsed as { email: string; password: string });
    if ('refreshToken' in result && result.refreshToken) {
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 * Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS || 30)
      });
    }
    return res.json({ accessToken: result.accessToken, user: result.user });
  } catch (err) {
    return next(err);
  }
});
router.post('/refresh', async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken || req.body.refreshToken;
    if (!token) return res.status(400).json({ error: 'missing refresh token' });
    const tokens = await svc.refresh(token);
    if (tokens.refreshToken) {
      res.cookie('refreshToken', tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 * Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS || 30)
      });
    }
    return res.json({ accessToken: tokens.accessToken });
  } catch (err) {
    return next(err);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken || req.body.refreshToken;
    if (token) await svc.logout(token);
    res.clearCookie('refreshToken');
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
});

export { router as authRouter };
