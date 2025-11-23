import cron from 'node-cron';
import { prisma } from '../utils/prisma';
import { redis } from '../utils/redis';
import { RuleEngine } from '../services/ruleEngine';
import { AlertService } from '../services/alertService';

const ruleEngine = new RuleEngine();
const svc = new AlertService();

export async function runOnceAutoClose() {
  const lockKey = 'worker:autoclose:lock';
  const got = await redis.set(lockKey, '1', 'NX', 'EX', 50);
  if (!got) return;

  try {
    const candidates = await prisma.alert.findMany({
      where: { status: { in: ['OPEN', 'ESCALATED'] } },
      take: 200
    });

    for (const a of candidates) {
      const res = await ruleEngine.evaluateAutoClose(a);
      if (res.close) {
        await svc.autoCloseAlert(a.id, res.reason);
      }
    }
  } catch (e) {
    console.error('Auto-close worker error', e);
  } finally {
    await redis.del(lockKey);
  }
}

export function startAutoCloseWorker() {
  cron.schedule('*/2 * * * *', () => {
    runOnceAutoClose().catch(console.error);
  });
}
