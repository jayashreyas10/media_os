import prisma from "../db/prisma";

export type KnowledgeType =
  | "NOTE"
  | "DOCUMENT"
  | "URL"
  | "TRANSCRIPT"
  | "EXAMPLE"
  | "CAMPAIGN"
  | "RESEARCH"
  | "PLAYBOOK";

export interface CreateKnowledgeInput {
  workspaceId: string;
  brandId?: string;
  title: string;
  content: string;
  type?: KnowledgeType;
  sourceUrl?: string;
  tags?: string;
  confidence?: number;
}

export class KnowledgeBaseService {
  static async createItem(data: CreateKnowledgeInput) {
    return await prisma.knowledgeItem.create({
      data: {
        workspaceId: data.workspaceId,
        brandId: data.brandId || null,
        title: data.title,
        content: data.content,
        type: data.type || "NOTE",
        sourceUrl: data.sourceUrl,
        tags: data.tags,
        confidence: data.confidence ?? 100,
      },
    });
  }

  static async listItems(
    workspaceId: string,
    filters?: {
      type?: KnowledgeType;
      search?: string;
      tag?: string;
      limit?: number;
    }
  ) {
    const { type, search, tag, limit = 50 } = filters || {};

    const items = await prisma.knowledgeItem.findMany({
      where: {
        workspaceId,
        status: "ACTIVE",
        ...(type ? { type } : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search } },
                { content: { contains: search } },
              ],
            }
          : {}),
        ...(tag ? { tags: { contains: tag } } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
      include: {
        brand: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return items;
  }

  static async getItem(id: string, workspaceId?: string) {
    return await prisma.knowledgeItem.findFirst({
      where: {
        id,
        ...(workspaceId ? { workspaceId } : {}),
      },
      include: {
        brand: true,
      },
    });
  }

  static async updateItem(
    id: string,
    arg2:
      | string
      | {
          title?: string;
          content?: string;
          type?: KnowledgeType;
          sourceUrl?: string;
          tags?: string;
          confidence?: number;
          status?: string;
        },
    arg3?: {
      title?: string;
      content?: string;
      type?: KnowledgeType;
      sourceUrl?: string;
      tags?: string;
      confidence?: number;
      status?: string;
    }
  ) {
    let workspaceId: string | undefined;
    let data: Record<string, unknown> = {};

    if (typeof arg2 === "string") {
      workspaceId = arg2;
      data = arg3 || {};
    } else {
      data = arg2 || {};
      workspaceId = undefined;
    }

    if (workspaceId) {
      // Verify item belongs to workspace
      const existing = await prisma.knowledgeItem.findFirst({
        where: { id, workspaceId },
      });
      if (!existing) {
        throw new Error(`Knowledge item ${id} not found in workspace`);
      }
    }

    return await prisma.knowledgeItem.update({
      where: { id },
      data,
    });
  }

  static async deleteItem(id: string, workspaceId?: string) {
    if (workspaceId) {
      const existing = await prisma.knowledgeItem.findFirst({
        where: { id, workspaceId },
      });
      if (!existing) {
        throw new Error(`Knowledge item ${id} not found in workspace`);
      }
    }

    return await prisma.knowledgeItem.delete({
      where: { id },
    });
  }

  static async listTags(workspaceId: string) {
    return await prisma.knowledgeTag.findMany({
      where: { workspaceId },
      orderBy: { name: "asc" },
    });
  }

  static async createTag(workspaceId: string, name: string, color?: string) {
    return await prisma.knowledgeTag.upsert({
      where: {
        workspaceId_name: {
          workspaceId,
          name: name.toLowerCase().trim(),
        },
      },
      update: { color: color || "#3b82f6" },
      create: {
        workspaceId,
        name: name.toLowerCase().trim(),
        color: color || "#3b82f6",
      },
    });
  }
}
