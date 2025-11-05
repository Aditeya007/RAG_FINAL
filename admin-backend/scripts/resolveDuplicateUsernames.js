// admin-backend/scripts/resolveDuplicateUsernames.js

/**
 * Script to find and help resolve duplicate usernames
 * Run this before the main migration to identify conflicts
 * 
 * Usage: node scripts/resolveDuplicateUsernames.js [--auto-fix]
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../..', '.env') });
const mongoose = require('mongoose');

const AUTO_FIX = process.argv.includes('--auto-fix');

async function resolveDuplicates() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const collection = db.collection('users');

    // Find duplicate usernames
    console.log('🔍 Searching for duplicate usernames...\n');
    const duplicates = await collection.aggregate([
      { 
        $group: { 
          _id: '$username', 
          count: { $sum: 1 }, 
          users: { 
            $push: { 
              id: '$_id', 
              email: '$email', 
              role: '$role',
              adminId: '$adminId',
              name: '$name',
              createdAt: '$createdAt'
            } 
          } 
        } 
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { _id: 1 } }
    ]).toArray();

    if (duplicates.length === 0) {
      console.log('✅ No duplicate usernames found! You can proceed with the migration.\n');
      await mongoose.connection.close();
      return;
    }

    console.log(`⚠️  Found ${duplicates.length} duplicate username(s):\n`);

    let conflictNumber = 0;
    const updates = [];

    for (const dup of duplicates) {
      conflictNumber++;
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Conflict #${conflictNumber}: Username "${dup._id}" (${dup.count} occurrences)`);
      console.log('='.repeat(60));

      dup.users.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

      dup.users.forEach((user, index) => {
        const adminInfo = user.adminId ? `AdminID: ${user.adminId}` : 'No Admin (is admin)';
        const createdDate = new Date(user.createdAt).toLocaleString();
        console.log(`\n  User ${index + 1}:`);
        console.log(`    ID:       ${user.id}`);
        console.log(`    Name:     ${user.name}`);
        console.log(`    Email:    ${user.email}`);
        console.log(`    Role:     ${user.role}`);
        console.log(`    ${adminInfo}`);
        console.log(`    Created:  ${createdDate}`);
        
        // Keep the first user's username, rename others
        if (index > 0) {
          const newUsername = `${dup._id}_${index + 1}`;
          console.log(`    ➡️  Suggested new username: "${newUsername}"`);
          
          updates.push({
            userId: user.id,
            oldUsername: dup._id,
            newUsername: newUsername,
            email: user.email
          });
        } else {
          console.log(`    ✅ Keep this username as-is (oldest account)`);
        }
      });
    }

    if (AUTO_FIX) {
      console.log(`\n${'='.repeat(60)}`);
      console.log('🔧 AUTO-FIX MODE: Applying username changes...');
      console.log('='.repeat(60));

      for (const update of updates) {
        console.log(`\n  Updating user ${update.userId}...`);
        console.log(`    Old username: ${update.oldUsername}`);
        console.log(`    New username: ${update.newUsername}`);
        
        const result = await collection.updateOne(
          { _id: update.userId },
          { $set: { username: update.newUsername } }
        );

        if (result.modifiedCount === 1) {
          console.log(`    ✅ Updated successfully`);
        } else {
          console.log(`    ⚠️  Update failed or no changes made`);
        }
      }

      console.log(`\n✅ Auto-fix completed! Updated ${updates.length} username(s).`);
      console.log('🔄 You can now run the main migration: node scripts/migrateUsernameEmailIndexes.js\n');

    } else {
      console.log(`\n${'='.repeat(60)}`);
      console.log('📋 SUMMARY');
      console.log('='.repeat(60));
      console.log(`Total conflicts: ${duplicates.length}`);
      console.log(`Users to rename: ${updates.length}`);
      console.log(`\nTo automatically fix these conflicts, run:`);
      console.log(`  node scripts/resolveDuplicateUsernames.js --auto-fix`);
      console.log(`\nOr manually update usernames in MongoDB and then run:`);
      console.log(`  node scripts/migrateUsernameEmailIndexes.js\n`);
    }

    await mongoose.connection.close();
    console.log('👋 Database connection closed\n');

  } catch (error) {
    console.error('\n❌ Error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run the script
resolveDuplicates();
