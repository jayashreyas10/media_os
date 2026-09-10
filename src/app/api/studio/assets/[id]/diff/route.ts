import { NextRequest, NextResponse } from "next/server";
import { ContentStudioService } from "@/server/services/content-studio-service";
import { DiffService } from "@/server/services/diff-service";
import { AuthService } from "@/server/services/auth-service";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const v1Id = searchParams.get("v1");
    const v2Id = searchParams.get("v2");

    if (!v1Id || !v2Id) {
      return NextResponse.json(
        { error: "Both v1 and v2 version IDs are required" },
        { status: 400 }
      );
    }

    const [v1, v2] = await Promise.all([
      ContentStudioService.getVersion(v1Id, session.workspace.id),
      ContentStudioService.getVersion(v2Id, session.workspace.id),
    ]);

    if (v1.assetId !== params.id || v2.assetId !== params.id) {
      return NextResponse.json(
        { error: "Versions do not belong to the specified asset" },
        { status: 400 }
      );
    }

    const diffResult = DiffService.compare(
      {
        versionNumber: v1.versionNumber,
        author: v1.author,
        createdAt: v1.createdAt,
        blocks: v1.blocks.map((b) => ({
          id: b.id,
          blockType: b.blockType,
          orderIndex: b.orderIndex,
          title: b.title,
          content: b.content,
          example: b.example,
          transition: b.transition,
          statementType: b.statementType,
          unsupportedFlag: b.unsupportedFlag,
        })),
      },
      {
        versionNumber: v2.versionNumber,
        author: v2.author,
        createdAt: v2.createdAt,
        changeSummary: v2.changeSummary,
        blocks: v2.blocks.map((b) => ({
          id: b.id,
          blockType: b.blockType,
          orderIndex: b.orderIndex,
          title: b.title,
          content: b.content,
          example: b.example,
          transition: b.transition,
          statementType: b.statementType,
          unsupportedFlag: b.unsupportedFlag,
        })),
      }
    );

    return NextResponse.json({ diff: diffResult });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to compute diff" },
      { status: 500 }
    );
  }
}

