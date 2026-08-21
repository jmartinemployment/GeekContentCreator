import type { NextConfig } from "next";

const NOINDEX = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];

// The OAuth-secured application, its auth callback and the API are never indexable --
// not before launch and not after. Only the marketing surface around them is ever
// eligible, and that stays noindex until ALLOW_INDEXING=true is set and redeployed.
const SECURED = ["/app/:path*", "/auth/:path*", "/api/:path*"];

const nextConfig: NextConfig = {
  // Returned as either the permanent rules or a single blanket rule -- never both, so a
  // path can't match twice and emit a duplicate X-Robots-Tag. The header applies to every
  // response on a matched route and beats any per-page robots metadata.
  async headers() {
    const secured = SECURED.map((source) => ({ source, headers: NOINDEX }));
    return process.env.ALLOW_INDEXING === "true"
      ? secured
      : [{ source: "/:path*", headers: NOINDEX }];
  },
};

export default nextConfig;
