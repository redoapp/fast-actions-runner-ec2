module.exports = {
  root: true,
  parserOptions: { sourceType: "module" },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended"],
  overrides: [
    {
      files: ["**/*.ts", "**/*.tsx"],
      extends: [
        "plugin:@typescript-eslint/eslint-recommended",
        "plugin:@typescript-eslint/recommended",
      ],
      parser: "@typescript-eslint/parser",
      rules: {
        // arrow functions cannot be generators
        "@typescript-eslint/no-this-alias": "off",
        // helpful for typing
        "@typescript-eslint/ban-ts-comment": "off",
        // too many exceptions
        "@typescript-eslint/ban-types": "off",
        // no-ops are legitimate
        "@typescript-eslint/no-empty-function": "off",
        // helpful for typing
        "@typescript-eslint/no-explicit-any": "off",
        // helpful for documentation
        "@typescript-eslint/no-inferrable-types": "off",
        // helpful for organization
        "@typescript-eslint/no-namespace": "off",
        // because ESLint is run first, unused imports aren't yet removed
        "@typescript-eslint/no-unused-vars": "off",
        // helpful for typing
        "@typescript-eslint/no-non-null-assertion": "off",
        "@typescript-eslint/no-var-requires": "off",
        "prefer-spread": "off",
      },
    },
  ],
  rules: {
    // can be useful to have await inside Promise callback
    "no-async-promise-executor": "off",
    // not harmful
    "no-ex-assign": "off",
    // nested switch can be exhaustive
    "no-fallthrough": "off",
    // https://github.com/typescript-eslint/typescript-eslint/issues/2818
    "no-redeclare": "off",
    // control characters (escaped) are legitimate in regexes
    "no-control-regex": "off",
    // only err if all variables can be constant
    "prefer-const": ["error", { destructuring: "all" }],
    // while(true) is legitimate
    "no-constant-condition": ["error", { checkLoops: false }],
    // catch {} is legitimate
    "no-empty": ["error", { allowEmptyCatch: true }],
    // legitimate inside TS namespaces
    "no-inner-declarations": "off",
    // prettier causes this
    "no-unexpected-multiline": "off",
    // args can be significant, for Function.prototype.length and Function.prototype.toString()
    "no-unused-vars": ["error", { args: "none" }],
    // https://github.com/typescript-eslint/typescript-eslint/issues/291
    "no-dupe-class-members": "off",
  },
  env: { es2022: true, node: true },
};
