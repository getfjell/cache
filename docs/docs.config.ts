import { DocsConfig } from '@fjell/docs-template';

const config: DocsConfig = {
  projectName: 'Fjell Cache',
  basePath: '/fjell-cache/',
  port: 3005,
  branding: {
    theme: 'cache',
    tagline: 'Cache for Fjell',
    backgroundImage: '/pano.png',
    github: 'https://github.com/getfjell/fjell-cache',
    npm: 'https://www.npmjs.com/package/@fjell/cache'
  },
  sections: [
    {
      id: 'overview',
      title: 'Getting Started',
      subtitle: 'Installation, setup & core concepts',
      file: '/README.md'
    },
    {
      id: 'examples',
      title: 'Examples',
      subtitle: 'Code examples & usage patterns',
      file: '/examples-README.md'
    }
  ],
  filesToCopy: [
    {
      source: '../README.md',
      destination: 'public/README.md'
    },
    {
      source: '../examples/README.md',
      destination: 'public/examples-README.md'
    }
  ],
  plugins: [],
  version: {
    source: 'package.json'
  }
}

export default config
