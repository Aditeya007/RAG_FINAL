// admin-backend/scripts/dropOldUniqueIndexes.js

/**
 * Migration script to drop old unique indexes on email and username
 * and create new compound unique indexes scoped by adminId
 * 
 * Usage: node scripts/dropOldUniqueIndexes.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../..', '.env') });
const mongoose = require('mongoose');

async function migrateIndexes() {
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('users');

    console.log('\n📊 Checking existing indexes...');
    const existingIndexes = await collection.indexes();
    console.log('Current indexes:', existingIndexes.map(idx => idx.name));

    // Drop old unique indexes if they exist
    const indexesToDrop = ['email_1', 'username_1'];
    
    for (const indexName of indexesToDrop) {
      const indexExists = existingIndexes.find(idx => idx.name === indexName);
      if (indexExists) {
        console.log(`\n🗑️  Dropping old unique index: ${indexName}`);
        await collection.dropIndex(indexName);
        console.log(`✅ Dropped ${indexName}`);
      } else {
        console.log(`ℹ️  Index ${indexName} does not exist, skipping...`);
      }
    }

    console.log('\n🔧 Creating new compound unique indexes...');
    
    // Create new indexes with adminId scoping
    await collection.createIndex(
      { email: 1, adminId: 1 },
      {
        unique: true,
        partialFilterExpression: { role: 'user' },
        name: 'email_1_adminId_1_user'
      }
    );
    console.log('✅ Created compound unique index: email + adminId (for users)');

    await collection.createIndex(
      { username: 1, adminId: 1 },
      {
        unique: true,
        partialFilterExpression: { role: 'user' },
        name: 'username_1_adminId_1_user'
      }
    );
    console.log('✅ Created compound unique index: username + adminId (for users)');

    await collection.createIndex(
      { email: 1 },
      {
        unique: true,
        partialFilterExpression: { role: 'admin' },
        name: 'email_1_admin'
      }
    );
    console.log('✅ Created unique index: email (for admins only)');

    await collection.createIndex(
      { username: 1 },
      {
        unique: true,
        partialFilterExpression: { role: 'admin' },
        name: 'username_1_admin'
      }
    );
    console.log('✅ Created unique index: username (for admins only)');

    console.log('\n📊 Final indexes:');
    const finalIndexes = await collection.indexes();
    finalIndexes.forEach(idx => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });

    // Close connection
    await mongoose.connection.close();
    console.log('\n✅ Migration completed successfully!');
    console.log('👋 Database connection closed\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateIndexes();
