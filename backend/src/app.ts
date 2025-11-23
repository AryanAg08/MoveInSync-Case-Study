import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { json } from 'body-parser';
import { authRouter } from './controllers/auth.controller';
import { alertsRouter } from './controllers/alerts.controller';
import { startAutoCloseWorker } from './workers/autoCloseWorker';
import { errorHandler } from './middleware/error';
import { registerMetrics } from './utils/metrics';
import { config } from 'dotenv';
config();

export const app = express();
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(json());
app.use(express.json());
app.use(cookieParser());
app.use(morgan('combined'));

app.use('/api/auth', authRouter);
app.use('/api/alerts', alertsRouter);

app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(await (require('prom-client').register.metrics()));
});

app.use(errorHandler);

// start in server.ts
registerMetrics();
startAutoCloseWorker();
