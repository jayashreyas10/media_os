import { NextRequest, NextResponse } from "next/server";
import { BrandBrainService } from "@/server/services/brand-brain-service";
import { AuthService } from "@/server/services/auth-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session || !session.brand) {
      return NextResponse.json({ error: "Unauthorized or no brand found" }, { status: 401 });
    }

    const brandBrain = await BrandBrainService.getBrandBrain(session.brand.id);
    return NextResponse.json({ brandBrain });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load Brand Brain" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session || !session.brand) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { section, data } = body;

    let result;
    if (section === "identity") {
      result = await BrandBrainService.updateIdentity(session.brand.id, data);
    } else if (section === "audience") {
      result = await BrandBrainService.updateAudience(session.brand.id, data);
    } else if (section === "voice") {
      result = await BrandBrainService.updateVoice(session.brand.id, data);
    } else {
      return NextResponse.json({ error: "Invalid section" }, { status: 400 });
    }

    return NextResponse.json({ success: true, result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update Brand Brain" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session || !session.brand) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { type, data } = body;

    let created;
    if (type === "pillar") {
      created = await BrandBrainService.addPillar(
        session.brand.id,
        data.name,
        data.description,
        data.priority,
        data.weight
      );
    } else if (type === "editorialRule") {
      created = await BrandBrainService.addEditorialRule(
        session.brand.id,
        data.rule,
        data.category,
        data.severity,
        data.rationale
      );
    } else if (type === "proof") {
      created = await BrandBrainService.addProof(
        session.brand.id,
        data.claim,
        data.evidenceSnippet,
        data.sourceUrl
      );
    } else {
      return NextResponse.json({ error: "Invalid item type" }, { status: 400 });
    }

    return NextResponse.json({ success: true, item: created });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create item" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await AuthService.getCurrentUser();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!session.brand) {
      return NextResponse.json({ error: "No active brand selected" }, { status: 400 });
    }

    const { searchParams } = req.nextUrl;
    const type = searchParams.get("type");
    const id = searchParams.get("id");

    if (!id || !type) {
      return NextResponse.json({ error: "Type and id required" }, { status: 400 });
    }

    if (type === "pillar") {
      await BrandBrainService.deletePillar(id, session.brand.id);
    } else if (type === "editorialRule") {
      await BrandBrainService.deleteEditorialRule(id, session.brand.id);
    } else if (type === "proof") {
      await BrandBrainService.deleteProof(id, session.brand.id);
    } else {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete item" },
      { status: err instanceof Error && err.message.includes("not found") ? 404 : 500 }
    );
  }
}
