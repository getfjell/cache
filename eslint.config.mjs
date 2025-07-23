import { library } from '@fjell/eslint-config';

export default [
  ...library,
  {
    ignores: ["**/dist", "**/node_modules"],
  }
];
