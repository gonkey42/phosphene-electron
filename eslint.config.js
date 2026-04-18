import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactHooksPlugin from "eslint-plugin-react-hooks";

const typedFiles = [
  "src/**/*.{ts,tsx}",
  "electron/**/*.ts",
  "e2e/**/*.ts",
  "scripts/**/*.ts",
  "scripts/**/*.mjs",
];

const typeAwareRules = {
  "@typescript-eslint/no-unused-vars": [
    "error",
    { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
  ],
  "@typescript-eslint/no-floating-promises": "error",
};

export default [
  {
    ignores: ["dist/**", "dist-electron/**", "release/**", "src-tauri/**", "node_modules/**"],
  },
  {
    files: typedFiles,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: import.meta.dirname,
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: typeAwareRules,
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      ...typeAwareRules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-console": ["warn", { allow: ["error", "warn"] }],
    },
  },
];
