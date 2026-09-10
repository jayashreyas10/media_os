import prisma from "../db/prisma";

export class AuditService {
  static async listLogs(workspaceId: string, limit: number = 50) {
    return await prisma.auditLog.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  static async log(data: {
    workspaceId: string;
    userId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    details?: unknown;
    detailsJson?: string | null;
    ipAddress?: string | null;
  }) {
    const { details, ...rest } = data;
    const detailsJson = rest.detailsJson || (details ? JSON.stringify(details) : undefined);
    return await prisma.auditLog.create({
      data: {
        workspaceId: rest.workspaceId,
        userId: rest.userId || null,
        action: rest.action,
        entityType: rest.entityType,
        entityId: rest.entityId || null,
        detailsJson: detailsJson || null,
        ipAddress: rest.ipAddress || null,
      },
    });
  }
}
