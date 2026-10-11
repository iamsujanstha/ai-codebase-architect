import mongoose from 'mongoose';
import { CATEGORY_SEED_DATA, PRODUCT_SEED_DATA } from '../catalog/data/catalog-seed.data';

async function seedMongo() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27019/ai_commerce_platform';
  const dbName = process.env.MONGODB_DB_NAME || 'ai_commerce_platform';

  console.log(`Connecting to MongoDB at: ${uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')} (db: ${dbName})`);
  
  await mongoose.connect(uri, { dbName });
  const db = mongoose.connection.db;

  if (!db) {
    throw new Error('Database connection failed');
  }

  const categoryCollection = db.collection('categories');
  const productCollection = db.collection('products');

  console.log(`Upserting ${CATEGORY_SEED_DATA.length} categories...`);
  for (const cat of CATEGORY_SEED_DATA) {
    await categoryCollection.updateOne(
      { slug: cat.slug },
      { $set: cat },
      { upsert: true }
    );
  }
  console.log('✅ Categories synchronized');

  console.log(`Upserting ${PRODUCT_SEED_DATA.length} products...`);
  for (const prod of PRODUCT_SEED_DATA) {
    await productCollection.updateOne(
      { slug: prod.slug },
      { $set: prod },
      { upsert: true }
    );
  }
  console.log('✅ Products synchronized');

  const catCount = await categoryCollection.countDocuments();
  const prodCount = await productCollection.countDocuments();
  console.log(`\n🎉 Done! Total in DB: ${catCount} categories, ${prodCount} products.`);

  await mongoose.disconnect();
}

seedMongo().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
