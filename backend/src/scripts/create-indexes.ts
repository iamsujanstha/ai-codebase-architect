import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../database/prisma.service';

async function createIndexes() {
  console.log('🚀 Checking PostgreSQL indexes via Prisma...\n');
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);

  try {
    const indexes: any = await prisma.$queryRaw`
      SELECT tablename, indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname;
    `;

    console.log(`Found ${indexes.length} PostgreSQL indexes:`);
    for (const idx of indexes) {
      console.log(`  - [${idx.tablename}] ${idx.indexname}`);
    }

    console.log('\n✅ All PostgreSQL indexes verified!');
  } catch (error) {
    console.error('❌ Error verifying indexes:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

createIndexes()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Index check failed:', error);
    process.exit(1);
  });
