import { NextResponse } from "next/server";
import { createCreate, generateImagePrompt } from "@/lib/geek-api";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      clientId?: string;
      topic?: string;
      notes?: string;
      provider?: string;
    };
    const clientId = body.clientId?.trim();
    const topic = body.topic?.trim();
    const notes = body.notes?.trim();
    if (!clientId || !topic || !notes) {
      return NextResponse.json(
        { error: "clientId, topic, and notes are required" },
        { status: 400 },
      );
    }

    const create = await createCreate({
      clientId,
      startingContentType: "imagePrompt",
      topic,
      notes,
    });
    const generated = await generateImagePrompt({
      createId: create.id,
      topic,
      notes,
      provider: body.provider || "OpenAi",
    });

    return NextResponse.json({
      createId: create.id,
      artifactId: generated.artifact.id,
      versionId: generated.version.id,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Standalone image prompt failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export const maxDuration = 120;
