/**
 * Audit Hash Chain Service
 * ========================
 * Implements a cryptographically append-only audit log.
 *
 * Every event appended to the log produces a new hash entry:
 *   currHash[i] = SHA256( currHash[i-1] + JSON.stringify(eventData[i]) )
 *
 * The genesis entry uses the string "GENESIS" as the previous hash.
 *
 * This ensures that:
 *   - No entry can be deleted without breaking the chain.
 *   - No entry can be modified without breaking all subsequent hashes.
 *   - Any tampering is immediately detectable by recomputing the chain.
 */

import { prisma } from '../utils/prisma';
import { sha256Hex } from '../utils/crypto';
import { Request } from 'express';

export type AuditAction =
  // Instruments
  | 'INSTRUMENT_REGISTERED'
  | 'INSTRUMENT_UPDATED'
  | 'INSTRUMENT_DELETED'
  // Test Sessions
  | 'SESSION_STARTED'
  | 'OBSERVATION_ADDED'
  | 'CALCULATION_EXECUTED'
  | 'TEST_SUBMITTED'
  | 'TEST_APPROVED'
  | 'TEST_REJECTED'
  // Reports
  | 'REPORT_GENERATED'
  | 'REPORT_APPROVED'
  | 'REPORT_REJECTED'
  | 'REPORT_REVOKED'
  | 'REPORT_VERIFIED'
  // Users
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_ROLE_CHANGED'
  | 'USER_LAB_ASSIGNED'
  | 'USER_ACTIVATED'
  | 'USER_DEACTIVATED'
  | 'USER_DELETED'
  // Auth
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'USER_LOGIN'
  | 'USER_REFRESH'
  // Labs
  | 'LAB_CREATED'
  | 'LAB_UPDATED'
  | 'LAB_DEACTIVATED'
  // Security
  | 'PERMISSION_DENIED';

/**
 * Appends a new event to the immutable audit hash chain.
 *
 * @param action       - The audit action type
 * @param resourceType - Type of the resource affected (e.g. 'Instrument', 'TestSession')
 * @param resourceId   - ID of the resource affected
 * @param userId       - ID of the user performing the action (optional)
 * @param req          - Express request (for IP + User-Agent)
 * @param extra        - Additional payload to include in the event data
 */
export async function appendAuditEvent(
  action: AuditAction,
  resourceType: string,
  resourceId: string,
  userId: string | undefined,
  req: Request,
  extra: Record<string, unknown> = {},
): Promise<void> {
  // Extract labId and role from the request's JWT payload (if authenticated)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authUser = (req as any).user as { id?: string; role?: string; labId?: string } | undefined;
  const actorLabId = authUser?.labId ?? null;
  const actorRole  = authUser?.role  ?? null;

  // 1. Get the most recent audit entry's currHash
  const latest = await prisma.auditLog.findFirst({
    orderBy: { id: 'desc' },
    select: { currHash: true },
  });

  const prevHash: string = latest?.currHash ?? 'GENESIS';

  // 2. Build the event data payload (deterministic JSON)
  const eventData = {
    action,
    resourceType,
    resourceId,
    userId:   userId ?? null,
    role:     actorRole,
    labId:    actorLabId,
    timestamp: new Date().toISOString(),
    ...extra,
  };

  // 3. Compute: currHash = SHA256(prevHash + JSON.stringify(eventData))
  const currHash = sha256Hex(prevHash + JSON.stringify(eventData));

  // 4. Insert into AuditLog
  await prisma.auditLog.create({
    data: {
      userId:      userId ?? null,
      role:        actorRole,
      labId:       actorLabId,
      action,
      resourceType,
      resourceId,
      ipAddress:   req.ip ?? req.socket?.remoteAddress ?? null,
      userAgent:   req.headers['user-agent'] ?? null,
      eventData,
      prevHash,
      currHash,
    },
  });
}

/**
 * Verify the integrity of the entire audit chain.
 * Returns { valid: true } if all hashes match, or
 * { valid: false, brokenAtId: bigint, expected: string, found: string } on failure.
 */
export async function verifyAuditChain(): Promise<
  | { valid: true; totalEntries: number }
  | { valid: false; brokenAtId: bigint; expected: string; found: string }
> {
  const entries = await prisma.auditLog.findMany({
    orderBy: { id: 'asc' },
  });

  let prevHash = 'GENESIS';

  for (const entry of entries) {
    const expectedCurrHash = sha256Hex(
      prevHash + JSON.stringify(entry.eventData),
    );
    if (expectedCurrHash !== entry.currHash) {
      return {
        valid: false,
        brokenAtId: entry.id,
        expected: expectedCurrHash,
        found: entry.currHash,
      };
    }
    prevHash = entry.currHash;
  }

  return { valid: true, totalEntries: entries.length };
}
