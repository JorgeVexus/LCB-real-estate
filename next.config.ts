import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  serverExternalPackages: ["sharp"],
  // Vercel's trace drops sharp's Linux libvips .so, and /api/sync then fails
  // to load (ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3).
  outputFileTracingIncludes: {
    "/api/sync": [
      "./node_modules/sharp/**/*",
      "./node_modules/@img/sharp-linux-x64/**/*",
      "./node_modules/@img/sharp-libvips-linux-x64/**/*",
    ],
  },
};

export default nextConfig;
