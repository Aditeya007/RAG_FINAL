// admin-backend/scripts/migrateUsersAdminId.js

/**
 * Migration script to add adminId to existing users
 * This script should be run once to migrate existing data
 * 
 * Usage: node scripts/migrateUsersAdminId.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

async function migrateUsers() {
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Find all admins (users without adminId or with role='admin')
    const admins = await User.find({ 
      $or: [
        { role: 'admin' },
        { adminId: { $exists: false } }
      ]
    });

    console.log(`\n📊 Found ${admins.length} admin accounts`);

    // Find all users without adminId that are not admins
    const usersWithoutAdmin = await User.find({ 
      role: 'user',
      adminId: { $exists: false }
    });

    console.log(`📊 Found ${usersWithoutAdmin.length} users without adminId`);

    if (usersWithoutAdmin.length === 0) {
      console.log('✅ No users need migration. All users have adminId assigned.');
      await mongoose.connection.close();
      return;
    }

    // If there's only one admin, assign all orphaned users to that admin
    if (admins.length === 1) {
      const admin = admins[0];
      console.log(`\n🔧 Assigning all orphaned users to admin: ${admin.username} (${admin._id})`);
      
      for (const user of usersWithoutAdmin) {
        user.adminId = admin._id;
        await user.save();
        console.log(`  ✓ Assigned user ${user.username} to admin ${admin.username}`);
      }
      
      console.log(`\n✅ Successfully migrated ${usersWithoutAdmin.length} users`);
    } else if (admins.length === 0) {
      console.error('\n❌ ERROR: No admin accounts found. Cannot migrate users.');
      console.error('   Please create at least one admin account first.');
    } else {
      console.log('\n⚠️  Multiple admins found. Manual assignment required.');
      console.log('   Admins:');
      admins.forEach((admin, idx) => {
        console.log(`     ${idx + 1}. ${admin.username} (${admin._id})`);
      });
      console.log('\n   Orphaned users:');
      usersWithoutAdmin.forEach((user, idx) => {
        console.log(`     ${idx + 1}. ${user.username} (${user._id})`);
      });
      console.log('\n   Please manually assign adminId to each user in the database.');
      console.log('   Or modify this script to handle the assignment logic.');
    }

    // Close connection
    await mongoose.connection.close();
    console.log('\n👋 Database connection closed');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateUsers();
