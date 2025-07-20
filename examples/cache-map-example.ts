/**
 * Cache Map Example
 *
 * This example demonstrates the lower-level CacheMap functionality of fjell-cache.
 * CacheMap provides direct key-value storage and retrieval with support for
 * complex fjell keys and efficient item management.
 *
 * Shows how to:
 * - Create and manage CacheMap instances directly
 * - Store and retrieve items with complex keys
 * - Use basic operations and key management
 * - Handle key normalization and comparison
 * - Manage cache lifecycle and cleanup
 */

import { CacheMap } from '../src/CacheMap';
import { ComKey, Item, PriKey } from '@fjell/core';

// Define test data models
interface Document extends Item<'document'> {
  id: string;
  title: string;
  content: string;
  author: string;
  tags: string[];
  createdAt: Date;
}

interface Comment extends Item<'comment', 'document'> {
  id: string;
  documentId: string;
  content: string;
  author: string;
  createdAt: Date;
}

// Helper to create test data
const createDocument = (id: string, title: string, content: string, author: string, tags: string[]): Document => ({
  id, title, content, author, tags, createdAt: new Date(),
  key: { kt: 'document', pk: id },
  events: { created: { at: new Date() }, updated: { at: new Date() }, deleted: { at: null } }
});

const createComment = (id: string, documentId: string, content: string, author: string): Comment => ({
  id, documentId, content, author, createdAt: new Date(),
  key: { kt: 'comment', pk: id, loc: [{ kt: 'document', lk: documentId }] },
  events: { created: { at: new Date() }, updated: { at: new Date() }, deleted: { at: null } }
});

export const runCacheMapExample = async (): Promise<void> => {
  console.log('\n🚀 Fjell-Cache CacheMap Example');
  console.log('==============================\n');

  console.log('This example demonstrates direct CacheMap operations for low-level cache management.\n');

  // Step 1: Create CacheMap instances
  console.log('Step 1: Creating CacheMap instances');
  console.log('-----------------------------------');

  // Create CacheMaps for different item types
  const documentCacheMap = new CacheMap<Document, 'document'>(['document']);
  const commentCacheMap = new CacheMap<Comment, 'comment', 'document'>(['comment', 'document']);

  console.log('✅ Created CacheMap instances for documents and comments');
  console.log(`   📄 Document CacheMap: supports primary keys only`);
  console.log(`   💬 Comment CacheMap: supports contained items with location hierarchy\n`);

  // Step 2: Create test data
  console.log('Step 2: Creating test data');
  console.log('-------------------------');

  const doc1 = createDocument('doc-1', 'Getting Started with Fjell', 'This is a comprehensive guide...', 'Alice', ['guide', 'tutorial']);
  const doc2 = createDocument('doc-2', 'Advanced Caching Patterns', 'Learn advanced techniques...', 'Bob', ['advanced', 'caching']);
  const doc3 = createDocument('doc-3', 'Performance Optimization', 'Tips for better performance...', 'Charlie', ['performance', 'optimization']);

  const comment1 = createComment('comment-1', doc1.id, 'Great tutorial! Very helpful.', 'David');
  const comment2 = createComment('comment-2', doc1.id, 'Thanks for sharing this.', 'Eve');
  const comment3 = createComment('comment-3', doc2.id, 'Excellent advanced techniques.', 'Frank');

  console.log('✅ Created test documents and comments\n');

  // Step 3: Basic CacheMap operations
  console.log('Step 3: Basic CacheMap operations');
  console.log('---------------------------------');

  // Set items in cache
  documentCacheMap.set(doc1.key, doc1);
  documentCacheMap.set(doc2.key, doc2);
  documentCacheMap.set(doc3.key, doc3);

  commentCacheMap.set(comment1.key, comment1);
  commentCacheMap.set(comment2.key, comment2);
  commentCacheMap.set(comment3.key, comment3);

  console.log('📥 Stored all items in CacheMaps');
  console.log(`   📄 Documents cached: ${documentCacheMap.values().length}`);
  console.log(`   💬 Comments cached: ${commentCacheMap.values().length}`);

  // Get individual items
  const retrievedDoc1 = documentCacheMap.get(doc1.key);
  const retrievedComment1 = commentCacheMap.get(comment1.key);

  console.log(`\n🔍 Retrieved items by key:`);
  console.log(`   📄 Document: "${retrievedDoc1?.title}" by ${retrievedDoc1?.author}`);
  console.log(`   💬 Comment: "${retrievedComment1?.content}" by ${retrievedComment1?.author}`);

  // Step 4: Key operations and checking
  console.log('\n\nStep 4: Key operations and checking');
  console.log('----------------------------------');

  // Check if keys exist
  const hasDoc1 = documentCacheMap.includesKey(doc1.key);
  const hasDoc4 = documentCacheMap.includesKey({ kt: 'document', pk: 'doc-4' });

  console.log(`🔑 Key existence checks:`);
  console.log(`   📄 Document 1 exists: ${hasDoc1}`);
  console.log(`   📄 Document 4 exists: ${hasDoc4}`);

  // Get all keys
  const allDocKeys = documentCacheMap.keys();
  const allCommentKeys = commentCacheMap.keys();

  console.log(`\n🗂️ All cached keys:`);
  console.log(`   📄 Document keys: ${allDocKeys.length} items`);
  allDocKeys.forEach(key => console.log(`      - ${(key as PriKey<'document'>).pk}`));

  console.log(`   💬 Comment keys: ${allCommentKeys.length} items`);
  allCommentKeys.forEach(key => console.log(`      - ${(key as ComKey<'comment', 'document'>).pk} in document ${(key as ComKey<'comment', 'document'>).loc?.[0]?.lk}`));

  // Step 5: Bulk operations
  console.log('\n\nStep 5: Bulk operations');
  console.log('----------------------');

  // Get all items
  const allDocuments = documentCacheMap.allIn([]);
  const allComments = commentCacheMap.allIn([]);

  console.log(`📋 Retrieved all items:`);
  console.log(`   📄 Documents: ${allDocuments.length} items`);
  allDocuments.forEach(doc => console.log(`      - "${doc.title}" (${doc.tags.join(', ')})`));

  console.log(`   💬 Comments: ${allComments.length} items`);
  allComments.forEach(comment => console.log(`      - "${comment.content}" on doc ${comment.documentId}`));

  // Get all values (another way to access items)
  const allDocumentValues = documentCacheMap.values();
  console.log(`\n📦 Document values count: ${allDocumentValues.length}`);

  // Step 6: Location-based operations for contained items
  console.log('\n\nStep 6: Location-based operations');
  console.log('---------------------------------');

  // Get comments for specific document (using location filtering)
  const doc1Comments = commentCacheMap.allIn([{ kt: 'document' as const, lk: doc1.id }] as any);

  console.log(`🔍 Location-based retrieval:`);
  console.log(`   💬 Comments in document "${doc1.title}": ${doc1Comments.length} found`);
  doc1Comments.forEach(comment => console.log(`      - "${comment.content}" by ${comment.author}`));

  // Step 7: Update operations
  console.log('\n\nStep 7: Update operations');
  console.log('------------------------');

  // Update an existing document
  const updatedDoc1 = {
    ...doc1,
    title: 'Getting Started with Fjell - Updated',
    tags: [...doc1.tags, 'updated'],
    events: { ...doc1.events, updated: { at: new Date() } }
  };

  documentCacheMap.set(updatedDoc1.key, updatedDoc1);
  const retrievedUpdatedDoc = documentCacheMap.get(updatedDoc1.key);

  console.log(`🔄 Updated document:`);
  console.log(`   📄 New title: "${retrievedUpdatedDoc?.title}"`);
  console.log(`   🏷️ New tags: ${retrievedUpdatedDoc?.tags.join(', ')}`);

  // Step 8: Deletion operations
  console.log('\n\nStep 8: Deletion operations');
  console.log('--------------------------');

  // Delete a specific item
  documentCacheMap.delete(doc3.key);
  console.log(`🗑️ Deleted document: doc-3`);
  console.log(`   📄 Documents remaining: ${documentCacheMap.values().length}`);

  // Try to get deleted item
  const deletedDocCheck = documentCacheMap.get(doc3.key);
  console.log(`   🔍 Deleted document still exists: ${deletedDocCheck !== null}`);

  // Step 9: Performance and statistics
  console.log('\n\nStep 9: Performance and statistics');
  console.log('---------------------------------');

  console.log(`📊 CacheMap Statistics:`);
  console.log(`   📄 Document CacheMap:`);
  console.log(`      - Items: ${documentCacheMap.values().length}`);
  console.log(`      - Keys: ${documentCacheMap.keys().length}`);
  console.log(`      - Values: ${documentCacheMap.values().length}`);

  console.log(`   💬 Comment CacheMap:`);
  console.log(`      - Items: ${commentCacheMap.values().length}`);
  console.log(`      - Keys: ${commentCacheMap.keys().length}`);
  console.log(`      - Values: ${commentCacheMap.values().length}`);

  // Performance test - bulk operations
  const startTime = Date.now();
  for (let i = 0; i < 1000; i++) {
    const tempDoc = createDocument(`temp-${i}`, `Temp Doc ${i}`, 'Content', 'Author', ['temp']);
    documentCacheMap.set(tempDoc.key, tempDoc);
  }
  const insertTime = Date.now() - startTime;

  console.log(`\n⚡ Performance test:`);
  console.log(`   📥 Inserted 1000 items in ${insertTime}ms`);
  console.log(`   📊 Total documents: ${documentCacheMap.values().length}`);

  // Clean up performance test data
  const cleanupStart = Date.now();
  for (let i = 0; i < 1000; i++) {
    documentCacheMap.delete({ kt: 'document', pk: `temp-${i}` });
  }
  const cleanupTime = Date.now() - cleanupStart;

  console.log(`   🧹 Cleaned up 1000 items in ${cleanupTime}ms`);
  console.log(`   📊 Documents after cleanup: ${documentCacheMap.values().length}`);

  // Step 10: Clone operations
  console.log('\n\nStep 10: Clone operations');
  console.log('------------------------');

  // Clone the cache map
  const clonedDocumentCache = documentCacheMap.clone();
  console.log(`📋 Cloned document cache:`);
  console.log(`   📄 Original cache: ${documentCacheMap.values().length} items`);
  console.log(`   📄 Cloned cache: ${clonedDocumentCache.values().length} items`);

  // Modify original to show independence
  const newDoc = createDocument('doc-clone-test', 'Clone Test Doc', 'Testing cloning', 'Test Author', ['test']);
  documentCacheMap.set(newDoc.key, newDoc);

  console.log(`\n📊 After adding to original:`);
  console.log(`   📄 Original cache: ${documentCacheMap.values().length} items`);
  console.log(`   📄 Cloned cache: ${clonedDocumentCache.values().length} items`);
  console.log(`   ✅ Clones are independent`);

  console.log('\n🎉 CacheMap Example Complete!');
  console.log('=============================\n');

  console.log('Key concepts demonstrated:');
  console.log('• Direct CacheMap instantiation and management');
  console.log('• Primary key and composite key operations');
  console.log('• Bulk operations (allIn, values, keys)');
  console.log('• Location-based filtering for contained items');
  console.log('• Update and delete operations');
  console.log('• Performance characteristics');
  console.log('• Key normalization and comparison');
  console.log('• Cache cloning and independence\n');
};

// Run the example if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runCacheMapExample().catch(console.error);
}
