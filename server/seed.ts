import { hashPassword } from './utils/password.js';
import { db } from './db/index.js';
import { users } from './db/schema.js';

async function seed() {
  console.log('🌱 Seeding database...');

  // Create demo users
  const demoUsers = [
    { name: 'Admin', email: 'admin@crm.com', password: await hashPassword('admin123'), role: 'admin' },
    { name: 'Alice', email: 'alice@crm.com', password: await hashPassword('alice123'), role: 'demarcheur' },
    { name: 'Bob', email: 'bob@crm.com', password: await hashPassword('bob123'), role: 'demarcheur' },
    { name: 'Charlie', email: 'charlie@crm.com', password: await hashPassword('charlie123'), role: 'demarcheur' },
  ];

  for (const user of demoUsers) {
    try {
      await db.insert(users).values(user);
      console.log(`  ✅ Created user: ${user.name} (${user.email})`);
    } catch (err: any) {
      if (err.message?.includes('UNIQUE')) {
        console.log(`  ⏭️  User ${user.email} already exists`);
      } else {
        console.error(`  ❌ Error creating ${user.email}:`, err.message);
      }
    }
  }

  console.log('\n📋 Login credentials:');
  console.log('  admin@crm.com / admin123 (Admin)');
  console.log('  alice@crm.com / alice123 (Démarcheur)');
  console.log('  bob@crm.com / bob123 (Démarcheur)');
  console.log('  charlie@crm.com / charlie123 (Démarcheur)');
  console.log('\n✨ Done!');
}

seed().catch(console.error);
