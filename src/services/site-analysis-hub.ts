import {
  HubConnectionBuilder,
  HubConnectionState,
  HttpTransportType,
} from "@microsoft/signalr";
import { apiConfig } from "@/lib/config";

export type AnalysisProgress = {
  profileId: string;
  step: string;
  status: string;
  message: string;
  stepNumber: number;
  totalSteps: number;
};

function asProgress(raw: unknown): AnalysisProgress {
  const msg = (raw ?? {}) as Record<string, unknown>;
  return {
    profileId: String(msg.profileId ?? msg.ProfileId ?? "").trim(),
    step: String(msg.step ?? msg.Step ?? "").trim(),
    status: String(msg.status ?? msg.Status ?? "").trim().toLowerCase(),
    message: String(msg.message ?? msg.Message ?? "").trim(),
    stepNumber: Number(msg.stepNumber ?? msg.StepNumber ?? 0) || 0,
    totalSteps: Number(msg.totalSteps ?? msg.TotalSteps ?? 0) || 0,
  };
}

async function hubAccessToken(): Promise<string> {
  const res = await fetch("/api/auth/hub-token", { cache: "no-store" });
  if (!res.ok) throw new Error("Could not get hub token");
  const body = (await res.json()) as { accessToken?: string };
  if (!body.accessToken) throw new Error("Hub token missing");
  return body.accessToken;
}

/**
 * Connect to Geek-SEO AnalysisProgress for the signed-in user, then wait until
 * the crawl is persisted (status complete + site_analysis_profiles.Id).
 * Resolves `connected` after the hub is up so Analyze can be POSTed without missing complete.
 */
export async function connectThroughCoverageHub(options: {
  signal: AbortSignal;
  onProgress: (progress: AnalysisProgress) => void;
}): Promise<{ done: Promise<string> }> {
  const connection = new HubConnectionBuilder()
    .withUrl(apiConfig.seoHubUrl, {
      accessTokenFactory: hubAccessToken,
      transport: HttpTransportType.WebSockets | HttpTransportType.ServerSentEvents,
    })
    .withAutomaticReconnect()
    .build();

  let settleDone!: (profileId: string) => void;
  let settleFail!: (error: Error) => void;
  const done = new Promise<string>((resolve, reject) => {
    settleDone = resolve;
    settleFail = reject;
  });

  let settled = false;
  const timeout = window.setTimeout(() => {
    finish(new Error("Site analysis timed out after 15 minutes."));
  }, 15 * 60 * 1000);

  function finish(error?: Error, profileId?: string) {
    if (settled) return;
    settled = true;
    window.clearTimeout(timeout);
    options.signal.removeEventListener("abort", onAbort);
    void connection.stop();
    if (error) settleFail(error);
    else settleDone(profileId!);
  }

  function onAbort() {
    finish(new Error("Analysis cancelled."));
  }

  options.signal.addEventListener("abort", onAbort);

  connection.on("AnalysisProgress", (raw: unknown) => {
    const progress = asProgress(raw);
    options.onProgress(progress);
    if (progress.status === "failed") {
      finish(new Error(progress.message || "Site analysis failed."));
      return;
    }
    if (progress.status === "complete" && progress.profileId) {
      finish(undefined, progress.profileId);
    }
  });

  await connection.start();
  if (connection.state !== HubConnectionState.Connected) {
    finish(new Error("Could not connect to crawl progress."));
  }

  return { done };
}
