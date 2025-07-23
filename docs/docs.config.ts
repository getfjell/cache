interface DocsConfig {
  projectName: string;
  basePath: string;
  port: number;
  branding: {
    theme: string;
    tagline: string;
    logo?: string;
    backgroundImage?: string;
    primaryColor?: string;
    accentColor?: string;
    github?: string;
    npm?: string;
  };
  sections: Array<{
    id: string;
    title: string;
    subtitle: string;
    file: string;
  }>;
  filesToCopy: Array<{
    source: string;
    destination: string;
  }>;
  plugins?: any[];
  version: {
    source: string;
  };
  customContent?: {
    [key: string]: (content: string) => string;
  };
}

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
