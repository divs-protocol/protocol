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
    // Hardhat workspace: generated ABI typings and build output are not ours to lint.
    "contracts/artifacts/**",
    "contracts/cache/**",
    "contracts/types/**",
    "contracts/node_modules/**",
  ]),
]);

export default eslintConfig;
