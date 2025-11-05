// admin-backend/scripts/migrateUsernameEmailIndexes.js

/**
 * Migration script to update username and email unique indexes
 * 
 * New requirements:
 * - Username: Globally unique across ALL users (admins and regular users)
 * - Email: Can be used across different admins, but must be unique within same admin
 * 
 * Usage: node scripts/migrateUsernameEmailIndexes.js
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

    // Drop old username indexes (both global and compound with adminId)
    const indexesToDrop = [
      'username_1_adminId_1_user', // Old compound index for users
      'username_1_admin',          // Old global index for admins only
      'username_1',                // Old simple global index (if exists)
    ];
    
    for (const indexName of indexesToDrop) {
      const indexExists = existingIndexes.find(idx => idx.name === indexName);
      if (indexExists) {
        console.log(`\n🗑️  Dropping old index: ${indexName}`);
        try {
          await collection.dropIndex(indexName);
          console.log(`✅ Dropped ${indexName}`);
        } catch (err) {
          if (err.codeName === 'IndexNotFound') {
            console.log(`ℹ️  Index ${indexName} not found, skipping...`);
          } else {
            throw err;
          }
        }
      } else {
        console.log(`ℹ️  Index ${indexName} does not exist, skipping...`);
      }
    }

    console.log('\n🔧 Creating new indexes...');
    
    // 1. Create global username unique index (for all users)
    console.log('\n📝 Creating global username unique index...');
    try {
      await collection.createIndex(
        { username: 1 },
        {
          unique: true,
          name: 'username_1_global'
        }
      );
      console.log('✅ Created global unique index: username (for all users)');
    } catch (err) {
      if (err.code === 11000) {
        console.log('⚠️  Duplicate usernames detected! Please resolve conflicts before running this migration.');
        console.log('   Finding duplicate usernames...');
        
        const duplicates = await collection.aggregate([
          { $group: { _id: '$username', count: { $sum: 1 }, users: { $push: { id: '$_id', email: '$email', role: '$role' } } } },
          { $match: { count: { $gt: 1 } } }
        ]).toArray();
        
        console.log('\n❌ Duplicate usernames found:');
        duplicates.forEach(dup => {
          console.log(`\n   Username: "${dup._id}" (${dup.count} occurrences)`);
          dup.users.forEach(user => {
            console.log(`     - ID: ${user.id}, Email: ${user.email}, Role: ${user.role}`);
          });
        });
        
        throw new Error('Cannot create unique index due to duplicate usernames. Please resolve conflicts first.');
      }
      throw err;
    }

    // 2. Email indexes remain the same
    // Keep the existing email compound index for users (email + adminId)
    // Keep the existing email global index for admins
    console.log('\n📝 Email indexes (no changes needed):');
    const emailUserIndex = existingIndexes.find(idx => idx.name === 'email_1_adminId_1_user');
    if (emailUserIndex) {
      console.log('✅ Email + adminId index for users already exists');
    } else {
      console.log('⚠️  Creating email + adminId index for users...');
      await collection.createIndex(
        { email: 1, adminId: 1 },
        {
          unique: true,
          partialFilterExpression: { role: 'user' },
          name: 'email_1_adminId_1_user'
        }
      );
      console.log('✅ Created compound unique index: email + adminId (for users)');
    }

    const emailAdminIndex = existingIndexes.find(idx => idx.name === 'email_1_admin');
    if (emailAdminIndex) {
      console.log('✅ Email global index for admins already exists');
    } else {
      console.log('⚠️  Creating email global index for admins...');
      await collection.createIndex(
        { email: 1 },
        {
          unique: true,
          partialFilterExpression: { role: 'admin' },
          name: 'email_1_admin'
        }
      );
      console.log('✅ Created unique index: email (for admins only)');
    }

    console.log('\n📊 Final indexes:');
    const finalIndexes = await collection.indexes();
    finalIndexes.forEach(idx => {
      const filter = idx.partialFilterExpression ? ` (filter: ${JSON.stringify(idx.partialFilterExpression)})` : '';
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}${filter}`);
    });

    // Close connection
    await mongoose.connection.close();
    console.log('\n✅ Migration completed successfully!');
    console.log('👋 Database connection closed\n');
    console.log('\n📋 Summary:');
    console.log('  ✅ Username: Now globally unique across ALL users');
    console.log('  ✅ Email: Unique within same admin (can be reused across different admins)');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run the migration
migrateIndexes();
