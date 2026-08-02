import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/auth/session";
import { apiConfig } from "@/lib/config";

/**
 * Standalone image prompt — CWV2 visual-style builder via GeekAPI.
 * Does not require a GCC Create / legacy creates workspace.
 */
export async function POST(request: Request) {
  const token = await getAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      topic?: string;
      notes?: string;
      provider?: string;
    };
    const topic = body.topic?.trim();
    const notes = body.notes?.trim();
    if (!topic || !notes) {
      return NextResponse.json(
        { error: "topic and notes are required" },
        { status: 400 },
      );
    }

    const res = await fetch(
      `${apiConfig.baseUrl}/api/geek-content-creator/image-prompts/generate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topic,
          notes,
          provider: body.provider || "OpenAi",
        }),
        cache: "no-store",
      },
    );

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        {
          error:
            data.error ||
            data.title ||
            data.detail ||
            "Standalone image prompt failed",
        },
        { status: res.status },
      );
    }

    return NextResponse.json({
      promptJson: data.promptJson ?? JSON.stringify(data.prompt ?? data),
      prompt: data.prompt ?? null,
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Standalone image prompt failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export const maxDuration = 120;
