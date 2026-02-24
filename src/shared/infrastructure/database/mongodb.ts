import { MongoClient, Db, Collection } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const MONGODB_DB = process.env.MONGODB_DB || "minitik_analytics";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getMongoClient(): Promise<MongoClient> {
  if (client) return client;

  client = new MongoClient(MONGODB_URI, {
    maxPoolSize: 20,
    minPoolSize: 5,
    maxIdleTimeMS: 30000,
    connectTimeoutMS: 10000,
    serverSelectionTimeoutMS: 5000,
  });

  await client.connect();
  return client;
}

export async function getMongoDb(): Promise<Db> {
  if (db) return db;

  const mongoClient = await getMongoClient();
  db = mongoClient.db(MONGODB_DB);

  // Ensure time-series collection exists
  const collections = await db.listCollections({ name: "analytics" }).toArray();
  if (collections.length === 0) {
    await db.createCollection("analytics", {
      timeseries: {
        timeField: "timestamp",
        metaField: "metadata",
        granularity: "hours",
      },
      expireAfterSeconds: 365 * 24 * 60 * 60, // 12 months
    });
  }

  // Create indexes
  const analytics = db.collection("analytics");
  await analytics.createIndex({ "metadata.contentId": 1, timestamp: -1 });
  await analytics.createIndex({ "metadata.accountId": 1, timestamp: -1 });
  await analytics.createIndex({ "metadata.platform": 1, timestamp: -1 });
  await analytics.createIndex({ "metadata.userId": 1, timestamp: -1 });

  return db;
}

export async function getAnalyticsCollection(): Promise<Collection> {
  const database = await getMongoDb();
  return database.collection("analytics");
}

export async function closeMongoConnection(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
