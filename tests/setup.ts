import { beforeAll } from 'vitest'

beforeAll(() => {
  // Enable source maps for better error reporting
  process.env.NODE_OPTIONS = '--enable-source-maps'
  
  // Increase stack trace limit for better error reporting
  Error.stackTraceLimit = 50
})