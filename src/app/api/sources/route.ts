import { NextRequest, NextResponse } from "next/server";
import { EvidenceGraphService } from "@/server/services/evidence-graph-service";
import { AuthService } from "@/server/services/auth-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session || !session.workspace) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const search = req.nextUrl.searchParams.get("search") || undefined;
    const sources = await EvidenceGraphService.listSources(session.workspace.id, search);

    return NextResponse.json({ sources });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load sources" },
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
    const { title, url, author, publisher, publishDate, trustScore, sourceNotes } = body;

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const source = await EvidenceGraphService.createSource({
      workspaceId: session.workspace.id,
      title,
      url,
      author,
      publisher,
      publishDate,
      trustScore: trustScore ? Number(trustScore) : 85,
      sourceNotes,
    });

    return NextResponse.json({ source }, { status: 201 });
  } catch (err) {
    const isValidation = err instanceof Error && (
      err.message.includes("Unsafe URL") ||
      err.message.includes("Invalid protocol") ||
      err.message.includes("Malformed URL")
    );
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create source" },
      { status: isValidation ? 400 : 500 }
    );
  }
}
