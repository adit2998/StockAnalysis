require('dotenv-flow').config();
const { MongoClient } = require('mongodb');
const tierTemplates = require('./data/tierTemplates.json');

async function seed() {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const db = client.db(process.env.DB_NAME);
  const col = db.collection('tier_templates');

  for (const template of tierTemplates) {
    await col.updateOne(
      { tier: template.tier },
      { $set: template },
      { upsert: true }
    );
    console.log(`Upserted tier ${template.tier} — ${template.name}`);
  }

  await client.close();
  console.log('Done.');
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
