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
  | 'signed_out';

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
