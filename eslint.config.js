import tseslint from "typescript-eslint";

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    rules: {
      "max-lines": ["error", { max: 300 }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": "error",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "error",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "node:fs",
              message:
                "Use shared filesystem utilities from src/shared/file.ts.",
            },
            {
              name: "node:fs/promises",
              message:
                "Use shared filesystem utilities from src/shared/file.ts.",
            },
            {
              name: "fs",
              message:
                "Use shared filesystem utilities from src/shared/file.ts.",
            },
            {
              name: "fs/promises",
              message:
                "Use shared filesystem utilities from src/shared/file.ts.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/shared/file.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    ignores: ["dist/", "node_modules/", "*.config.*"],
  },
);
