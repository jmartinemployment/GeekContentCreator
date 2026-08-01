import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone is for container images only — Vercel uses its own output.
  ...(process.env.DOCKER_BUILD === "1" ? { output: "standalone" as const } : {}),
};

export default nextConfig;
