module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: [
    // "plugin:@typescript-eslint/recommended-type-checked-only",
    // "plugin:@typescript-eslint/strict-type-checked-only",
    // "plugin:@typescript-eslint/stylistic-type-checked-only",
  ],
  parserOptions: {
    project: process.env.TS_CONFIG ?? true,
    sourceType: "module",
  },
  // We don't want to remove disable comments for rules in .eslintrc.js
  // reportUnusedDisableDirectives: true,
  rules: {
    // Must handle, await, or explicitly not-await (with 'void' keyword) all Promises
    "@typescript-eslint/no-floating-promises": ["error", { ignoreIIFE: true }],
  },
};
