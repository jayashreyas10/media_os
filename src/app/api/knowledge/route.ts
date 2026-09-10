import { NextRequest, NextResponse } from "next/server";
import { KnowledgeBaseService, KnowledgeType } from "@/server/services/knowledge-service";
import { AuthService } from "@/server/services/auth-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session || !session.workspace) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const type = searchParams.get("type") as KnowledgeType | undefined;
    const search = searchParams.get("search") || undefined;
    const tag = searchParams.get("tag") || undefined;

    const items = await KnowledgeBaseService.listItems(session.workspace.id, {
      type: type || undefined,
      search,
      tag,
    });

    const tags = await KnowledgeBaseService.listTags(session.workspace.id);

    return NextResponse.json({ items, tags });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch knowledge items" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session || !session.workspace) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { title, content, type, sourceUrl, tags, confidence } = body;

    if (!title || !content) {
      return NextResponse.json({ error: "Title and content are required" }, { status: 400 });
    }

    const item = await KnowledgeBaseService.createItem({
      workspaceId: session.workspace.id,
      brandId: session.brand?.id,
      title,
      content,
      type: type || "NOTE",
      sourceUrl,
      tags,
      confidence: confidence ? Number(confidence) : 100,
    });

    // Auto-index tags
    if (tags) {
      const tagList = tags.split(",").map((t: string) => t.trim()).filter(Boolean);
      for (const t of tagList) {
        await KnowledgeBaseService.createTag(session.workspace.id, t);
      }
    }

    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create knowledge item" },
      { status: 500 }
    );
  }
}
