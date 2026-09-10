import prisma from "../db/prisma";
import { Logger } from "../observability/telemetry";

export class LockAcquisitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LockAcquisitionError";
  }
}

export class WorkerLockService {
  /**
   * Attempts to acquire a lease-based distributed lock.
   * If a lock exists but has expired past its TTL, it is safely reclaimed.
   *
   * @param lockKey Unique identifier for the locked resource
   * @param holderId Identifier of the worker or process requesting the lock
   * @param ttlMs Time-to-live in milliseconds (default: 30 seconds)
   * @returns true if acquired, false otherwise
   */
  static async acquireLock(lockKey: string, holderId: string, ttlMs = 30000): Promise<boolean> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    try {
      const existing = await prisma.workerLock.findUnique({
        where: { lockKey },
      });

      if (existing) {
        if (existing.expiresAt > now) {
          // Still active. If held by the same holder, renew it.
          if (existing.holderId === holderId) {
            await prisma.workerLock.update({
              where: { lockKey },
              data: { expiresAt },
            });
            return true;
          }
          // Held by another active worker
          return false;
        }

        // Expired lock: safely reclaim it
        await prisma.workerLock.update({
          where: { lockKey },
          data: {
            holderId,
            expiresAt,
          },
        });
        Logger.info(`[WorkerLock] Reclaimed expired lock ${lockKey} for holder ${holderId}`);
        return true;
      }

      // No lock exists: create one
      await prisma.workerLock.create({
        data: {
          lockKey,
          holderId,
          expiresAt,
        },
      });
      return true;
    } catch (err) {
      // Concurrency race: another process may have inserted or updated simultaneously
      Logger.warn(`[WorkerLock] Concurrency conflict attempting to acquire ${lockKey}: ${err}`);
      return false;
    }
  }

  /**
   * Releases a lock held by the specified holder.
   */
  static async releaseLock(lockKey: string, holderId: string): Promise<boolean> {
    try {
      const existing = await prisma.workerLock.findUnique({
        where: { lockKey },
      });

      if (!existing || existing.holderId !== holderId) {
        return false;
      }

      await prisma.workerLock.delete({
        where: { lockKey },
      });
      return true;
    } catch (err) {
      Logger.warn(`[WorkerLock] Error releasing lock ${lockKey}: ${err}`);
      return false;
    }
  }

  /**
   * Executes an asynchronous action within the protection of a lease lock.
   */
  static async withLock<T>(
    lockKey: string,
    holderId: string,
    ttlMs: number,
    fn: () => Promise<T>
  ): Promise<T> {
    const acquired = await this.acquireLock(lockKey, holderId, ttlMs);
    if (!acquired) {
      throw new LockAcquisitionError(`Could not acquire worker lock for '${lockKey}'. Another job is in progress.`);
    }

    try {
      return await fn();
    } finally {
      await this.releaseLock(lockKey, holderId);
    }
  }

  /**
   * Scans and deletes all expired locks.
   */
  static async cleanupExpiredLocks(): Promise<number> {
    try {
      const result = await prisma.workerLock.deleteMany({
        where: {
          expiresAt: { lt: new Date() },
        },
      });
      return result.count;
    } catch (err) {
      Logger.error(`[WorkerLock] Failed cleaning up expired locks: ${err}`);
      return 0;
    }
  }
}
