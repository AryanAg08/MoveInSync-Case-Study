import fs from 'fs';
import path from 'path';
import { prisma } from '../utils/prisma';
import { RulesMap } from '../types/rule';

export class RuleEngine {
  rulesPath = path.join(__dirname, '../../config/rules.json');

  loadRules(): RulesMap {
    const raw = fs.readFileSync(this.rulesPath, 'utf-8');
    return JSON.parse(raw);
  }

  async countEvents(sourceType: string, entityId: string, windowMins: number) {
    const since = new Date(Date.now() - windowMins * 60_000);
    const count = await prisma.alert.count({
      where: { sourceType, entityId, timestamp: { gte: since } }
    });
    return count;
  }

  async evaluateOnCreate(alert: any) {
    const rules = this.loadRules();
    const rule = rules[alert.sourceType];
    if (!rule) return null;
    if (rule.escalate_if_count && rule.window_mins && alert.entityId) {
      const count = await this.countEvents(alert.sourceType, alert.entityId, rule.window_mins);
      if (count >= rule.escalate_if_count) {
        return { action: 'escalate', to: rule.escalate_to || 'CRITICAL', reason: `count ${count} >= ${rule.escalate_if_count}` };
      }
    }
    return null;
  }

  async evaluateAutoClose(alert: any): Promise<{ close: boolean; reason?: string }> {
    const rules = this.loadRules();
    const rule = rules[alert.sourceType];
    if (!rule) return { close: false };
    if (rule.auto_close_if) {
      if (alert.metadata && alert.metadata.status === rule.auto_close_if) {
        return { close: true, reason: rule.auto_close_if };
      }
    }
    if (rule.expires_mins) {
      const expiresAt = new Date(alert.timestamp);
      expiresAt.setMinutes(expiresAt.getMinutes() + rule.expires_mins);
      if (new Date() >= expiresAt) return { close: true, reason: 'expired' };
    }
    return { close: false };
  }
}
