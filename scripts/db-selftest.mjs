import path from "node:path";
import process from "node:process";
import mongoose from "mongoose";
import dotenv from "dotenv";

// Load .env.local explicitly for local testing
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const uri = process.env.MONGODB_URL;

async function main() {
  if (!uri) {
    console.error("Missing MONGODB_URL in .env.local or environment.");
    process.exit(1);
  }

  console.log("Connecting to MongoDB...\n");

  try {
    await mongoose.connect(uri, { dbName: "Artify", bufferCommands: false });

    const conn = mongoose.connection;
    console.log("Connected.");

    // Ping server
    let ping = null;
    try {
      ping = await conn.db.admin().ping();
      console.log("Ping:", ping);
    } catch (e) {
      console.warn("Ping failed:", e?.message || e);
    }

    // Roundtrip test
    const col = conn.db.collection("__healthchecks");
    const doc = { kind: "selftest", ts: new Date(), rand: Math.random() };
    const ins = await col.insertOne(doc);
    console.log("Inserted _id:", ins.insertedId.toString());

    const got = await col.findOne({ _id: ins.insertedId });
    console.log("Fetched exists:", Boolean(got));

    await col.deleteOne({ _id: ins.insertedId });
    console.log("Cleaned up test document.");

    console.log("\nMongoDB self-test succeeded.");
    process.exit(0);
  } catch (err) {
    console.error("MongoDB self-test FAILED:\n", err);
    process.exit(1);
  } finally {
    try { await mongoose.disconnect(); } catch {}
  }
}

main();
