const { MongoClient } = require("mongodb");

const URI =process.env.MONGODBWEB_URI;
const SKIP_DBS = ["admin", "local", "config"];

async function deleteAllRecords() {
  const client = new MongoClient(URI);

  try {
    await client.connect();
    console.log("✅ Connected to Atlas Cluster: ligths-staging\n");

    const { databases } = await client.db().admin().listDatabases();

    for (const { name: dbName } of databases) {

      if (SKIP_DBS.includes(dbName)) {
        console.log(`⏭️  Skipping system DB: ${dbName}`);
        continue;
      }

      const db = client.db(dbName);
      const collections = await db.listCollections().toArray();

      console.log(`\n📂 Database: ${dbName} (${collections.length} collections)`);

      if (collections.length === 0) {
        console.log(`   ⚠️  No collections found in ${dbName}`);
        continue;
      }

      for (const { name: colName } of collections) {
        const collection = db.collection(colName);

        const beforeCount = await collection.countDocuments();
        
        const result = await collection.deleteMany({});

        console.log(
          `   🗑️  ${colName}: ${beforeCount} records இருந்துச்சு → ${result.deletedCount} deleted`
        );
      }
    }

    console.log("\n✅ Done! DB Structure இருக்கு, Records மட்டும் Delete ஆச்சு.");

  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await client.close();
    console.log("🔌 Connection Closed.");
  }
}

deleteAllRecords();