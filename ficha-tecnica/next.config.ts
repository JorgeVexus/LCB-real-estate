import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel's file tracing misses non-JS assets that playwright-core loads
  // dynamically (e.g. browsers.json), which breaks /api/pdf in production
  // with "Cannot find module '.../playwright-core/browsers.json'". Force
  // the whole package (and @sparticuz/chromium) into that route's bundle.
  outputFileTracingIncludes: {
    "/api/pdf": [
      "./node_modules/playwright-core/**/*",
      "./node_modules/@sparticuz/chromium/**/*",
    ],
  },
};

export default nextConfig;
