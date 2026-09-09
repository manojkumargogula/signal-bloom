import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  /*
   * The import boundary.
   *
   * `src/engine/` and `src/analytics/` must not reach into React, the DOM, or
   * Next. That is what keeps them runnable — and testable — in the plain Node
   * vitest project, and it is the most valuable architectural constraint in
   * the project.
   *
   * Both `src/engine/types.ts` and CONTRIBUTING.md have claimed this rule
   * existed since the first commit. It did not: the config was the two Next
   * presets and nothing else, and the only thing actually enforcing the
   * boundary was the node test environment failing after the fact. The claim
   * was in the docs, so the rule is now real rather than the claim removed.
   */
  {
    files: ["src/engine/**/*.ts", "src/analytics/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "react", message: "engine/ and analytics/ must stay framework-free." },
            { name: "react-dom", message: "engine/ and analytics/ must stay framework-free." },
          ],
          patterns: [
            {
              group: ["next", "next/*"],
              message: "engine/ and analytics/ must not depend on the framework.",
            },
            {
              group: ["@/react/*", "@/components/*", "@/render/*", "@/input/*", "@/app/*"],
              message:
                "engine/ and analytics/ sit below these layers. Invert the dependency instead.",
            },
          ],
        },
      ],
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
