import ts from "typescript-eslint";
import globals from "globals";
import prettierConfig from "eslint-config-prettier";
import json from "@eslint/json";

export default [
  // JSON 文件 lint 配置（放前面，避免被 TS parser 覆盖）
  {
    files: ["**/*.json"],
    language: "json/json",
    plugins: {
      json,
    },
    rules: {
      "json/no-duplicate-keys": "error",
    },
  },

  // JS/TS 文件配置
  {
    files: ["**/*.{js,ts,mjs,cjs}"],
    languageOptions: {
      parser: ts.parser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },

  // TypeScript 推荐规则（三层叠加），仅作用于 JS/TS 文件
  ...ts.configs.recommended.map((config) => ({ ...config, files: ["**/*.{js,ts,mjs,cjs}"] })),
  ...ts.configs.strict.map((config) => ({ ...config, files: ["**/*.{js,ts,mjs,cjs}"] })),
  ...ts.configs.stylistic.map((config) => ({ ...config, files: ["**/*.{js,ts,mjs,cjs}"] })),

  {
    files: ["**/*.{js,ts,mjs,cjs}"],
    rules: {
      'no-magic-numbers': ['warn', { ignore: [0, 1, -1], enforceConst: true }],
      'complexity': ['error', 10],
      'max-lines-per-function': ['warn', { max: 50, skipComments: true }],
      'max-nested-callbacks': ['error', 3],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  {
    ignores: ["node_modules/**", "dist/**", "build/**", "package-lock.json"],
  },

  // ⬇️ Prettier 放最后，覆盖冲突规则（注意：不是 ...prettierConfig）
  prettierConfig,
];
