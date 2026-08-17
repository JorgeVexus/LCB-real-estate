import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // ficha-tecnica/ is its own separate Next.js app (own tsconfig, own
    // Vercel project) living in this repo -- not part of this app's lint/build.
    "ficha-tecnica/**",
  ]),
]);

export default eslintConfig;
