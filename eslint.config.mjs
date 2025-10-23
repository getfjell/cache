import libraryConfig from "@fjell/common-config/library";

export default [
  ...libraryConfig,
  {
    rules: {
      "max-depth": "off",
      "no-undefined": "off",
      "@typescript-eslint/no-unused-vars": "off",
      'max-params': 'off',
      'max-len': 'off',
    },
  },
];
