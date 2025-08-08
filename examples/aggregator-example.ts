 
/**
 * Aggregator Example
 *
 * This example demonstrates advanced fjell-cache functionality using the Aggregator
 * for managing related entities with automatic population of references.
 *
 * Shows how to:
 * - Create aggregated caches with references between entities
 * - Populate items with their related data automatically
 * - Handle optional vs required aggregates
 * - Manage complex business relationships through caching
 */

import { createAggregator } from '../src/Aggregator';
import { createCache } from '../src/Cache';
import { createInstance } from '../src/Instance';
import { createRegistry } from '../src/Registry';
import { ClientApi } from '@fjell/client-api';
import { Item, PriKey } from '@fjell/core';
import { createCoordinate } from '@fjell/registry';

// Define our business models with relationships
interface Customer extends Item<'customer'> {
  id: string;
  name: string;
  email: string;
  company: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
}

interface Order extends Item<'order'> {
  id: string;
  customerId: string;
  total: number;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  items: string[]; // Array of product IDs
  orderDate: Date;
}

interface Product extends Item<'product'> {
  id: string;
  name: string;
  price: number;
  category: string;
  inStock: boolean;
}

interface SupportTicket extends Item<'ticket'> {
  id: string;
  customerId: string;
  orderId?: string; // Optional reference to order
  subject: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  description: string;
}

// Mock storage
const mockCustomers = new Map<string, Customer>();
const mockOrders = new Map<string, Order>();
const mockProducts = new Map<string, Product>();
const mockTickets = new Map<string, SupportTicket>();

// Helper to create mock APIs
const createMockApi = <T extends Item<any>>(storage: Map<string, T>) => {
  return {
    async all(_query = {}) {
      console.log(`📦 Fetching all items from ${storage.constructor.name}...`);
      return Array.from(storage.values());
    },
    async one(query = {}) {
      const items = await this.all!(query);
      return items[0] || null;
    },
    async get(key: PriKey<any>) {
      const item = storage.get(String(key.pk));
      if (!item) {
        throw new Error(`Item not found: ${key.pk}`);
      }
      return item;
    },
    async find(_finder = 'all') {
      return await this.all!({});
    }
  } as Partial<ClientApi<T, any>>;
};

// Test data creation helpers
const createCustomer = (id: string, name: string, email: string, company: string, tier: 'bronze' | 'silver' | 'gold' | 'platinum'): Customer => {
  const customer: Customer = {
    id, name, email, company, tier,
    key: { kt: 'customer', pk: id },
    events: { created: { at: new Date() }, updated: { at: new Date() }, deleted: { at: null } }
  };
  mockCustomers.set(id, customer);
  return customer;
};

const createProduct = (id: string, name: string, price: number, category: string, inStock: boolean): Product => {
  const product: Product = {
    id, name, price, category, inStock,
    key: { kt: 'product', pk: id },
    events: { created: { at: new Date() }, updated: { at: new Date() }, deleted: { at: null } }
  };
  mockProducts.set(id, product);
  return product;
};

const createOrder = (id: string, customerId: string, total: number, status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled', items: string[]): Order => {
  const order: Order = {
    id, customerId, total, status, items, orderDate: new Date(),
    key: { kt: 'order', pk: id },
    events: { created: { at: new Date() }, updated: { at: new Date() }, deleted: { at: null } },
    // Add references for aggregation
    refs: {
      customer: { kt: 'customer', pk: customerId }
    }
  };
  mockOrders.set(id, order);
  return order;
};

const createSupportTicket = (
  id: string,
  customerId: string,
  subject: string,
  priority: 'low' | 'medium' | 'high' | 'urgent',
  status: 'open' | 'in-progress' | 'resolved' | 'closed',
  description: string,
   
  orderId?: string): SupportTicket => {
  const ticket: SupportTicket = {
    id, customerId, subject, priority, status, description, orderId,
    key: { kt: 'ticket', pk: id },
    events: { created: { at: new Date() }, updated: { at: new Date() }, deleted: { at: null } },
    // Add references for aggregation
    refs: {
      customer: { kt: 'customer', pk: customerId },
      ...(orderId && { order: { kt: 'order', pk: orderId } })
    }
  };
  mockTickets.set(id, ticket);
  return ticket;
};

export const runAggregatorExample = async (): Promise<void> => {
  console.log('\n🚀 Fjell-Cache Aggregator Example');
  console.log('=================================\n');

  console.log('This example demonstrates advanced caching with entity relationships and aggregation.\n');

  // Step 1: Create test data
  console.log('Step 1: Creating business entities');
  console.log('----------------------------------');

  const customer1 = createCustomer('cust-1', 'Acme Corp', 'contact@acme.com', 'Acme Corporation', 'gold');
  const customer2 = createCustomer('cust-2', 'TechStart Inc', 'hello@techstart.io', 'TechStart Inc', 'silver');

  const product1 = createProduct('prod-1', 'Premium Widget', 299.99, 'widgets', true);
  const product2 = createProduct('prod-2', 'Standard Widget', 199.99, 'widgets', true);
  const product3 = createProduct('prod-3', 'Budget Widget', 99.99, 'widgets', false);

  const order1 = createOrder('order-1', customer1.id, 499.98, 'shipped', [product1.id, product2.id]);
  const order2 = createOrder('order-2', customer2.id, 199.99, 'pending', [product2.id]);

  const ticket1 = createSupportTicket('ticket-1', customer1.id, 'Widget not working', 'high', 'open', 'The premium widget stopped working after 2 days', order1.id);
  const ticket2 = createSupportTicket('ticket-2', customer2.id, 'General inquiry', 'low', 'resolved', 'Question about widget compatibility');

  console.log(`✅ Created ${mockCustomers.size} customers, ${mockProducts.size} products, ${mockOrders.size} orders, ${mockTickets.size} tickets\n`);

  // Step 2: Set up cache infrastructure
  console.log('Step 2: Setting up cache infrastructure');
  console.log('--------------------------------------');

  const registry = createRegistry();
  console.log('✅ Created registry');

  // Create individual caches for each entity type
  const customerApi = createMockApi(mockCustomers) as ClientApi<Customer, 'customer'>;
  const orderApi = createMockApi(mockOrders) as ClientApi<Order, 'order'>;
  const productApi = createMockApi(mockProducts) as ClientApi<Product, 'product'>;
  const ticketApi = createMockApi(mockTickets) as ClientApi<SupportTicket, 'ticket'>;

  const customerCache = await createCache(customerApi, createCoordinate('customer'), registry);
  const orderCache = await createCache(orderApi, createCoordinate('order'), registry);
  const productCache = await createCache(productApi, createCoordinate('product'), registry);
  const ticketCache = await createCache(ticketApi, createCoordinate('ticket'), registry);

  console.log('✅ Created individual caches for each entity type');

  // Step 3: Create aggregated caches
  console.log('\nStep 3: Creating aggregated caches');
  console.log('----------------------------------');

  // Create order aggregator that automatically populates customer data
  const orderAggregator = await createAggregator(orderCache, {
    aggregates: {
      customer: { cache: customerCache, optional: false }, // Required reference
    },
    events: {}
  });

  // Create support ticket aggregator with both customer and order references
  const ticketAggregator = await createAggregator(ticketCache, {
    aggregates: {
      customer: { cache: customerCache, optional: false }, // Required reference
      order: { cache: orderCache, optional: true }, // Optional reference (not all tickets relate to orders)
    },
    events: {}
  });

  console.log('✅ Created aggregated caches with relationship mappings (aggregators are now instances)\n');

  // Step 4: Basic aggregation - Fetch orders with customer data
  console.log('Step 4: Order aggregation with customer data');
  console.log('--------------------------------------------');

  const [, orders] = await orderAggregator.all();
  console.log(`📋 Fetched ${orders.length} orders`);

  for (const order of orders) {
    console.log(`\n📦 Order ${order.id}:`);
    console.log(`   Amount: $${order.total}`);
    console.log(`   Status: ${order.status}`);
    console.log(`   Items: ${order.items.join(', ')}`);

    // Populate the order with customer data
    const populatedOrder = await orderAggregator.populate(order);
    if (populatedOrder.aggs?.customer?.item) {
      const customer = populatedOrder.aggs.customer.item;
      console.log(`   👤 Customer: ${customer.name} (${customer.email})`);
      console.log(`   🏢 Company: ${customer.company} - ${customer.tier} tier`);
    }
  }

  // Step 5: Complex aggregation - Support tickets with multiple references
  console.log('\n\nStep 5: Support ticket aggregation with multiple references');
  console.log('----------------------------------------------------------');

  const [, tickets] = await ticketAggregator.all();
  console.log(`🎫 Fetched ${tickets.length} support tickets`);

  for (const ticket of tickets) {
    console.log(`\n🎫 Ticket ${ticket.id}:`);
    console.log(`   Subject: ${ticket.subject}`);
    console.log(`   Priority: ${ticket.priority}`);
    console.log(`   Status: ${ticket.status}`);
    console.log(`   Description: ${ticket.description}`);

    // Populate the ticket with all related data
    const populatedTicket = await ticketAggregator.populate(ticket);

    // Customer data (required reference)
    if (populatedTicket.aggs?.customer?.item) {
      const customer = populatedTicket.aggs.customer.item;
      console.log(`   👤 Customer: ${customer.name} (${customer.email}) - ${customer.tier} tier`);
    }

    // Order data (optional reference)
    if (populatedTicket.aggs?.order?.item) {
      const order = populatedTicket.aggs.order.item;
      console.log(`   📦 Related Order: ${order.id} - $${order.total} (${order.status})`);
    } else {
      console.log(`   📦 No related order`);
    }
  }

  // Step 6: Individual item retrieval with aggregation
  console.log('\n\nStep 6: Individual item retrieval with aggregation');
  console.log('-------------------------------------------------');

  const [, specificOrder] = await orderAggregator.get(order1.key);
  if (specificOrder) {
    console.log(`🔍 Retrieved specific order: ${specificOrder.id}`);

    const populatedSpecificOrder = await orderAggregator.populate(specificOrder);
    if (populatedSpecificOrder.aggs?.customer?.item) {
      const customer = populatedSpecificOrder.aggs.customer.item;
      console.log(`   Automatically populated customer: ${customer.name}`);
    }
  }

  // Step 7: Demonstrating cache efficiency with aggregation
  console.log('\n\nStep 7: Cache efficiency demonstration');
  console.log('-------------------------------------');

  console.log('🎯 First population (will fetch from storage):');
  const startTime1 = Date.now();
  const populated1 = await orderAggregator.populate(order1);
  const time1 = Date.now() - startTime1;
  console.log(`   Populated order with customer data in ${time1}ms`);

  console.log('🎯 Second population (should use cached data):');
  const startTime2 = Date.now();
  const populated2 = await orderAggregator.populate(order1);
  const time2 = Date.now() - startTime2;
  console.log(`   Populated same order in ${time2}ms (cached)`);

  console.log(`   📊 Cache efficiency: ${Math.round(((time1 - time2) / time1) * 100)}% faster on second call`);

  // Step 8: Aggregate management and statistics
  console.log('\n\nStep 8: Aggregate management and statistics');
  console.log('------------------------------------------');

  console.log('📊 Cache Statistics:');
  console.log(`   👥 Customers cached: ${mockCustomers.size}`);
  console.log(`   📦 Orders cached: ${mockOrders.size}`);
  console.log(`   📦 Products cached: ${mockProducts.size}`);
  console.log(`   🎫 Tickets cached: ${mockTickets.size}`);
  console.log(`   🔗 Order aggregator references: customer (required)`);
  console.log(`   🔗 Ticket aggregator references: customer (required), order (optional)`);

  console.log('\n🎉 Aggregator Example Complete!');
  console.log('===============================\n');

  console.log('Key concepts demonstrated:');
  console.log('• Creating aggregated caches with entity relationships');
  console.log('• Automatic population of referenced entities');
  console.log('• Required vs optional aggregate references');
  console.log('• Cache efficiency through aggregation');
  console.log('• Complex business model relationships');
  console.log('• Performance benefits of cached aggregates\n');
};

// Run the example if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAggregatorExample().catch(console.error);
}
