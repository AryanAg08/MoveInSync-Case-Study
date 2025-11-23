import { prisma } from '../utils/prisma';
import { RuleEngine } from './ruleEngine';
import { redis } from '../utils/redis';
import { Alert, AlertTransition } from '@prisma/client'; // Assuming generic Prisma types

// --- Interfaces & Types ---

interface CreateAlertPayload {
  alertId: string;
  sourceType: string;
  severity: string;
  timestamp?: string | Date;
  metadata?: Record<string, any>;
  entityId?: string;
}

interface RuleDecision {
  action: 'escalate' | 'none'; // Add other actions as needed
  to?: string;
  reason?: string;
}

interface DashboardCount {
  severity: string;
  status: string;
  cnt: number | string;
}

interface TopOffender {
  entityId: string;
  cnt: number | string;
}

// --- Helper Functions ---

/**
 * JSON.stringify replacer to handle BigInt serialization for Redis/JSON
 */
function safeStringify(obj: any): string {
  return JSON.stringify(obj, (_key, val) =>
    typeof val === 'bigint' ? val.toString() : val
  );
}

/**
 * Converts database rows with BigInts into JSON-safe objects
 * used for returning API responses.
 */
function normalizeBigIntRow<T>(row: any): T {
  const out: any = { ...row };
  
  // Handle specific 'cnt' field common in your raw queries
  if (typeof out.cnt === 'bigint') {
    const bi = out.cnt as bigint;
    // If it fits in a JS number, use number, otherwise string
    if (bi <= BigInt(Number.MAX_SAFE_INTEGER)) {
      out.cnt = Number(bi);
    } else {
      out.cnt = bi.toString();
    }
  }

  // Handle generic BigInt fields just in case
  for (const key in out) {
    if (typeof out[key] === 'bigint') {
      out[key] = out[key].toString();
    }
  }
  
  return out as T;
}

// --- Service Class ---

const ruleEngine = new RuleEngine();

export class AlertService {
  
  async createAlert(payload: CreateAlertPayload): Promise<Alert> {
    const ts = payload.timestamp ? new Date(payload.timestamp) : new Date();
    
    // 1. Check idempotency
    const existing = await prisma.alert.findUnique({ 
      where: { alertId: payload.alertId } 
    });
    if (existing) return existing;

    // 2. Create Alert
    const a = await prisma.alert.create({
      data: {
        alertId: payload.alertId,
        sourceType: payload.sourceType,
        severity: payload.severity,
        timestamp: ts,
        status: 'OPEN',
        metadata: payload.metadata || {},
        entityId: payload.entityId,
      },
    });

    // 3. Log Transition
    await prisma.alertTransition.create({
      data: { alertId: a.id, from: 'NONE', to: 'OPEN', reason: 'created' },
    });

    // 4. Evaluate Rules
    // Assuming ruleEngine returns a specific shape. We cast or type checking is recommended here.
    const decision = (await ruleEngine.evaluateOnCreate(a)) as RuleDecision | null;
    
    if (decision && decision.action === 'escalate' && decision.to) {
      await this.escalateAlert(a.id, decision.to, decision.reason);
    }

    // 5. Invalidate Caches
    await this.invalidateDashboardCache();
    
    return a;
  }

  async escalateAlert(id: string, toSeverity: string, reason?: string): Promise<void> {
    const alert = await prisma.alert.findUnique({ where: { id } });
    if (!alert) return;
    
    if (['ESCALATED', 'AUTO-CLOSED', 'RESOLVED'].includes(alert.status)) return;

    await prisma.alert.update({ 
      where: { id }, 
      data: { status: 'ESCALATED', severity: toSeverity } 
    });

    await prisma.alertTransition.create({ 
      data: { alertId: id, from: alert.status, to: 'ESCALATED', reason } 
    });

    await this.invalidateDashboardCache();
  }

  async autoCloseAlert(id: string, reason?: string): Promise<void> {
    const alert = await prisma.alert.findUnique({ where: { id } });
    if (!alert) return;

    if (['AUTO-CLOSED', 'RESOLVED'].includes(alert.status)) return;

    await prisma.alert.update({ 
      where: { id }, 
      data: { status: 'AUTO-CLOSED' } 
    });

    await prisma.alertTransition.create({ 
      data: { alertId: id, from: alert.status, to: 'AUTO-CLOSED', reason } 
    });

    await this.invalidateDashboardCache();
  }

  async resolveAlert(id: string, operatorId?: string): Promise<void> {
    const alert = await prisma.alert.findUnique({ where: { id } });
    if (!alert) return;

    await prisma.alert.update({ 
      where: { id }, 
      data: { status: 'RESOLVED' } 
    });

    await prisma.alertTransition.create({
      data: { 
        alertId: id, 
        from: alert.status, 
        to: 'RESOLVED', 
        reason: `manual_resolve_by:${operatorId || 'unknown'}` 
      },
    });

    await this.invalidateDashboardCache();
  }

  async getCounts(): Promise<DashboardCount[]> {
    const cacheKey = 'dashboard:counts';
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        console.warn('[alertService] invalid cache for dashboard:counts, recomputing');
      }
    }

    // Raw query returns objects where count is BigInt
    const rows = await prisma.$queryRaw<any[]>`
      SELECT severity, status, count(*) AS cnt 
      FROM "Alert" 
      GROUP BY severity, status
    `;

    const normalized = rows.map(r => normalizeBigIntRow<DashboardCount>(r));

    await redis.set(cacheKey, safeStringify(normalized), 'EX', 30);
    return normalized;
  }

  async getTopOffenders(limit = 5): Promise<TopOffender[]> {
    const cacheKey = 'top_offenders';
    const cached = await redis.get(cacheKey);

    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        console.warn('[alertService] invalid cache for top_offenders, recomputing');
      }
    }

    const rows = await prisma.$queryRaw<any[]>`
      SELECT "entityId", count(*) as cnt
      FROM "Alert"
      WHERE status IN ('OPEN','ESCALATED')
      GROUP BY "entityId"
      ORDER BY cnt DESC
      LIMIT ${limit}
    `;

    const normalized = rows.map(r => {
      // Ensure consistent keys (handle null entityId)
      const row = { ...r, entityId: r.entityId || 'unknown' };
      return normalizeBigIntRow<TopOffender>(row);
    });

    await redis.set(cacheKey, safeStringify(normalized), 'EX', 30);
    return normalized;
  }

  async getAlertDetails(id: string): Promise<Alert | null> {
    return prisma.alert.findUnique({ 
      where: { id }, 
      include: { transitions: true } 
    });
  }

  async listRecentAutoClosed(hours = 24): Promise<Alert[]> {
    const since = new Date(Date.now() - hours * 3600_000);
    
    return prisma.alert.findMany({
      where: { 
        status: 'AUTO-CLOSED', 
        updatedAt: { gte: since } 
      },
      take: 50,
      orderBy: { updatedAt: 'desc' },
    });
  }

  // Private helper to avoid repeating Redis logic
  private async invalidateDashboardCache(): Promise<void> {
    await Promise.all([
      redis.del('dashboard:counts'),
      redis.del('top_offenders')
    ]);
  }
}