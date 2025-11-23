import express from 'express';
import { AlertService } from '../services/alertService';
import { requireAuth } from '../middleware/auth.middleware';
const router = express.Router();
const svc = new AlertService();

router.post('/', async (req, res, next) => {
  try {
    const body = req.body;
    if (!body.alertId || !body.sourceType || !body.severity) {
      return res.status(400).json({ error: 'missing fields' });
    }
    const a = await svc.createAlert(body);
    res.status(201).json(a);
  } catch (err) { next(err); }
});

// Optionally protect manual resolve
router.post('/:id/resolve', requireAuth, async (req, res, next) => {
  try {
    await svc.resolveAlert(req.params.id, req.body.operatorId);
    res.status(204).send();
  } catch (err) { next(err); }
});

router.get('/dashboard/counts', async (req, res, next) => {
  try {
    const counts = await svc.getCounts();
    res.json(counts);
  } catch (err) { next(err); }
});

router.get('/dashboard/top-offenders', async (req, res, next) => {
  try {
    const rows = await svc.getTopOffenders();
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/dashboard/auto-closed', async (req, res, next) => {
  try {
    const hours = Number(req.query.hours || 24);
    const rows = await svc.listRecentAutoClosed(hours);
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const a = await svc.getAlertDetails(req.params.id);
    if (!a) return res.status(404).send();
    res.json(a);
  } catch (err) { next(err); }
});

export { router as alertsRouter };
