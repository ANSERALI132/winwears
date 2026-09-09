/**
 * Activity log.
 *
 * Answers "who changed this, and when" after the fact. Writes are best-effort:
 * failing to record history must never fail the operation the admin actually
 * asked for.
 */
import { prisma } from '../db';

export type AuditAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'restored'
  | 'published'
  | 'unpublished'
  | 'duplicated'
  | 'reordered'
  | 'status_changed'
  | 'imported'
  | 'exported'
  | 'uploaded'
  | 'signed_in'
  | 'signed_out'
  /* Money is not a field being updated. An amount arriving, or being taken
     back out because it was entered wrongly, is the kind of change somebody
     asks about months later, and "updated" would not tell them anything. */
  | 'payment_recorded'
  | 'payment_removed'
  /* Units off the line, and a miscount taken back out. Same reasoning as a
     payment: it is not a field being edited, it is a count somebody asserted. */
  | 'output_recorded'
  | 'output_removed'
  /* Stock in or out. A ledger line, not a field being edited — and the only
     way a stock level ever changes. */
  | 'stock_moved';

export async function log(entry: {
  adminId?: string | null;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  summary?: string | null;
}): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        adminId: entry.adminId ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        summary: entry.summary ?? null,
      },
    });
  } catch (err) {
    console.error('[audit] could not write activity log', err);
  }
}
