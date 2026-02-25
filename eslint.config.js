import js from "@eslint/js";
import tseslint from "typescript-eslint";
import unusedImports from "eslint-plugin-unused-imports";

export default [
  {
    ignores: ["node_modules/**", "drizzle/**", ".agents/**"],
  },

  js.configs.recommended,

  ...tseslint.configs.recommended,

  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    plugins: {
      "unused-imports": unusedImports,
    },
    rules: {
      /* ========= Code quality ========= */
      "no-console": "off",
      "no-debugger": "warn",

      /* ========= Unused ========= */
      "unused-imports/no-unused-imports": "error",
      "@typescript-eslint/no-unused-vars": "off",

      /* ========= TypeScript ========= */
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];
