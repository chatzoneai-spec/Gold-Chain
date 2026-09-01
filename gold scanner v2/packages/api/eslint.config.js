import eslint from "@typescript-eslint/eslint-plugin";
import parser from "@typescript-eslint/parser";

export default [
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser,
    },
    plugins: {
      "@typescript-eslint": eslint,
    },
    rules: {
      ...eslint.configs.recommended.rules,
    },
  },
];
