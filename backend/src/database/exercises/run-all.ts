/**
 * Run All PostgreSQL Interview Exercises
 * 
 * This script runs all exercises sequentially and provides a comprehensive
 * demonstration of PostgreSQL concepts for interview preparation.
 */

import { demonstrateNormalization } from './01-data-modeling';
import { demonstrateIndexes } from './02-indexes';
import { demonstrateTransactionsAndACID } from './03-transactions-acid';
import { demonstrateIsolationLevels } from './04-isolation-levels';
import { demonstrateDeadlocks } from './05-deadlocks';
import { demonstrateIdempotency } from './06-idempotency';

async function runAllExercises() {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('   PostgreSQL Interview Preparation - Hands-On Exercises');
  console.log('   Staff/Principal Engineer Level Database Mastery');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('\n');

  const exercises = [
    { name: 'Data Modeling & Normalization', fn: demonstrateNormalization },
    { name: 'Indexes Deep Dive', fn: demonstrateIndexes },
    { name: 'Transactions & ACID', fn: demonstrateTransactionsAndACID },
    { name: 'Isolation Levels', fn: demonstrateIsolationLevels },
    { name: 'Deadlocks & Prevention', fn: demonstrateDeadlocks },
    { name: 'Idempotency', fn: demonstrateIdempotency },
  ];

  let completedCount = 0;

  for (const exercise of exercises) {
    try {
      console.log(`\n${'═'.repeat(70)}`);
      console.log(`Starting: ${exercise.name}`);
      console.log(`${'═'.repeat(70)}\n`);

      await exercise.fn();

      completedCount++;
      console.log(`\n${'═'.repeat(70)}`);
      console.log(`✓ Completed: ${exercise.name}`);
      console.log(`${'═'.repeat(70)}\n`);

      // Pause between exercises
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.error(`\n❌ Error in ${exercise.name}:`, error);
      console.log(`\nContinuing to next exercise...\n`);
    }
  }

  // Summary
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('   Exercise Summary');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`\nCompleted: ${completedCount}/${exercises.length} exercises`);
  console.log('\n✅ Exercises Completed:');
  console.log('   1. Data Modeling & Normalization');
  console.log('      - Understand 1NF, 2NF, 3NF');
  console.log('      - Know when to denormalize');
  console.log('      - Design proper relationships');
  console.log('\n   2. Indexes Deep Dive');
  console.log('      - Use EXPLAIN ANALYZE to optimize queries');
  console.log('      - Create B-tree, GIN, partial, composite indexes');
  console.log('      - Understand covering indexes');
  console.log('\n   3. Transactions & ACID');
  console.log('      - Implement atomic operations');
  console.log('      - Enforce constraints for consistency');
  console.log('      - Handle concurrent transactions');
  console.log('      - Ensure durability with WAL');
  console.log('\n   4. Isolation Levels');
  console.log('      - Understand READ COMMITTED, REPEATABLE READ, SERIALIZABLE');
  console.log('      - Prevent non-repeatable reads and phantom reads');
  console.log('      - Choose appropriate isolation level for use case');
  console.log('\n   5. Deadlocks & Prevention');
  console.log('      - Understand circular wait conditions');
  console.log('      - Prevent with consistent lock ordering');
  console.log('      - Implement retry logic with exponential backoff');
  console.log('\n   6. Idempotency');
  console.log('      - Handle duplicate webhooks safely');
  console.log('      - Use UNIQUE constraints and ON CONFLICT');
  console.log('      - Implement idempotency keys for APIs');

  console.log('\n\n🎯 Next Steps:');
  console.log('   - Review the interview questions at the end of each exercise');
  console.log('   - Practice explaining concepts out loud');
  console.log('   - Run individual exercises: npx ts-node src/database/exercises/04-isolation-levels.ts');
  console.log('   - Read POSTGRESQL_INTERVIEW_EXERCISES.md for exercises 7-15');
  console.log('   - Apply these patterns to your real project');

  console.log('\n\n📚 Additional Exercises Available (Run separately):');
  console.log('   7. Query Optimization');
  console.log('   8. MVCC');
  console.log('   9. Locks Deep Dive');
  console.log('   10. Advanced Concurrency Patterns');
  console.log('   11. Constraints');
  console.log('   12. Advanced Query Optimization');
  console.log('   13. Replication & HA');
  console.log('   14. Partitioning');
  console.log('   15. Production Best Practices');

  console.log('\n\n🚀 You\'re on your way to Staff/Principal-level database mastery!');
  console.log('\n');

  process.exit(0);
}

// Run all exercises
runAllExercises().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
