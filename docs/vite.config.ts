import { createDocsViteConfig } from '@fjell/docs-template/config'
import { defineConfig } from 'vite'

const baseConfig = createDocsViteConfig({
  basePath: '/cache/'
})

export default defineConfig({
  ...baseConfig,
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
