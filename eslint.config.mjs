import libraryConfig from "@fjell/eslint-config/library";

export default [
  ...libraryConfig,
  {
    rules: {
      "max-depth": "off",
      "no-undefined": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
];
