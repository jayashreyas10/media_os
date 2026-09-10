import { NextRequest, NextResponse } from "next/server";
import { KnowledgeBaseService } from "@/server/services/knowledge-service";
import { AuthService } from "@/server/services/auth-service";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session || !session.workspace) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const item = await KnowledgeBaseService.getItem(params.id, session.workspace.id);
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    return NextResponse.json({ item });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error fetching item" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session || !session.workspace) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const updated = await KnowledgeBaseService.updateItem(
      params.id,
      session.workspace.id,
      body
    );
    return NextResponse.json({ item: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error updating item" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session || !session.workspace) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await KnowledgeBaseService.deleteItem(params.id, session.workspace.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error deleting item" },
      { status: 500 }
    );
  }
}
