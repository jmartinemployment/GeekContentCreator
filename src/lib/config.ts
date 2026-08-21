/**
 * Geek Content Creator → GeekOAuth → GeekAPI → GeekRepository.
 * Never call GeekRepository from this app.
 */
const authUrl = (process.env.NEXT_PUBLIC_AUTH_URL ?? "https://auth.geekatyourspot.com").replace(
  /\/$/,
  "",
);
const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3003").replace(
  /\/$/,
  "",
);
const geekApiUrl = (
  process.env.NEXT_PUBLIC_GEEK_API_URL ?? "https://api.geekatyourspot.com"
).replace(/\/$/, "");

export const authConfig = {
  authUrl,
  authorizeUrl: `${authUrl}/connect/authorize`,
  tokenUrl: `${authUrl}/connect/token`,
  clientId: process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID?.trim() || "geek-content-creator",
  // Always derived from appUrl. The callback lives at src/app/auth/callback, so the path is
  // fixed — an override only creates a second host that can disagree with NEXT_PUBLIC_APP_URL,
  // which is exactly what stranded the PKCE cookie and broke sign-in.
  redirectUri: `${appUrl}/auth/callback`,
  scope: "openid profile email offline_access",
  appUrl,
};

export const apiConfig = {
  baseUrl: geekApiUrl,
  seoHubUrl:
    (process.env.NEXT_PUBLIC_SEO_HUB_URL ?? "https://seo-api.geekatyourspot.com/hubs/seo-realtime").replace(
      /\/$/,
      "",
    ),
};

export const LLM_PROVIDERS = ["OpenAi", "Anthropic"] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

export const STARTING_CONTENT_TYPES = [
  "blog",
  "pillar",
  "techArticle",
  "email",
  "linkedin",
  "x",
  "instagram",
  "imagePrompt",
  "aiTool",
] as const;

export type StartingContentType = (typeof STARTING_CONTENT_TYPES)[number];
