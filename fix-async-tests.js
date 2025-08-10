import fs from 'fs';
import path from 'path';

// List of async methods that need await
const asyncMethods = [
  'get',
  'includesKey',
  'values',
  'allIn',
  'contains',
  'queryIn',
  'clone',
  'getQueryResult',
  'invalidateLocation'
];

// Function to fix async calls in a file
function fixAsyncCalls(content) {
  let updatedContent = content;

  // First pass: Add await to all async method calls
  asyncMethods.forEach(method => {
    // Fix direct method calls that need await (but don't already have it)
    // Match cache variable names (cache, locCache, containedCache, cacheMap, etc.) but avoid things like mockLocalStorage.store
    const methodCallRegex = new RegExp(`(?<!await\\s)((cache|locCache|containedCache|cacheMap|cache1|cache2|complexCacheMap)\\s*\\.\\s*${method}\\s*\\([^)]*\\))`, 'g');
    updatedContent = updatedContent.replace(methodCallRegex, (match, methodCall) => {
      // Don't add await if it's already there
      return `await ${methodCall}`;
    });

    // Fix method calls in expect statements
    const expectRegex = new RegExp(`expect\\((?!await\\s)((cache|locCache|containedCache|cacheMap|cache1|cache2|complexCacheMap)\\s*\\.\\s*${method}\\s*\\([^)]*\\))\\)`, 'g');
    updatedContent = updatedContent.replace(expectRegex, 'expect(await $1)');
  });

  // Second pass: Find all it() functions that contain await and make them async
  const lines = updatedContent.split('\n');
  const updatedLines = [];
  let inTestFunction = false;
  let testFunctionStart = -1;
  let braceCount = 0;
  let hasAwait = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if this line starts a test function
    const testMatch = line.match(/(\s*)(it\s*\(\s*['"][^'"]*['"],\s*)(\(\)\s*=>\s*\{)/);
    if (testMatch) {
      inTestFunction = true;
      testFunctionStart = i;
      braceCount = 1;
      hasAwait = false;
      updatedLines.push(line);
      continue;
    }

    if (inTestFunction) {
      // Count braces to track when we're out of the test function
      const openBraces = (line.match(/\{/g) || []).length;
      const closeBraces = (line.match(/\}/g) || []).length;
      braceCount += openBraces - closeBraces;

      // Check if this line contains await
      if (line.includes('await ')) {
        hasAwait = true;
      }

      // If we've closed all braces, we're done with this test function
      if (braceCount === 0) {
        inTestFunction = false;

        // If this test function contains await, make it async
        if (hasAwait) {
          const testLine = updatedLines[testFunctionStart];
          const testMatch = testLine.match(/(\s*)(it\s*\(\s*['"][^'"]*['"],\s*)(\(\)\s*=>\s*\{)/);
          if (testMatch && !testMatch[3].includes('async')) {
            updatedLines[testFunctionStart] = testMatch[1] + testMatch[2] + 'async () => {';
          }
        }
      }
    }

    updatedLines.push(line);
  }

  return updatedLines.join('\n');
}

// Process all browser cache test files
const testFiles = [
  '/Users/developer/gitw/getfjell/fjell-cache/tests/browser/LocalStorageCacheMap.test.ts',
  '/Users/developer/gitw/getfjell/fjell-cache/tests/browser/SessionStorageCacheMap.test.ts',
  '/Users/developer/gitw/getfjell/fjell-cache/tests/browser/IndexDBCacheMap.test.ts',
  '/Users/developer/gitw/getfjell/fjell-cache/tests/browser/AsyncIndexDBCacheMap.test.ts'
];

testFiles.forEach(testFile => {
  try {
    if (fs.existsSync(testFile)) {
      const content = fs.readFileSync(testFile, 'utf8');
      const fixedContent = fixAsyncCalls(content);

      if (content !== fixedContent) {
        fs.writeFileSync(testFile, fixedContent, 'utf8');
        console.log(`Fixed async calls in ${path.basename(testFile)}`);
      } else {
        console.log(`No changes needed in ${path.basename(testFile)}`);
      }
    } else {
      console.log(`File not found: ${testFile}`);
    }
  } catch (error) {
    console.error(`Error fixing file ${path.basename(testFile)}: ${error.message}`);
  }
});
