import { NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/database/mongoose";

// GET /api/dbcheck — deep healthcheck: ping + write/read/delete roundtrip
export async function GET() {
  try {
    await connectToDatabase();

    const mongoose = (await import("mongoose")).default;
    const conn = mongoose.connection;

    const stateMap = {
      0: "disconnected",
      1: "connected",
      2: "connecting",
      3: "disconnecting",
      99: "uninitialized",
    };

    // 1) Ping server
    let ping = null;
    try {
      ping = await conn.db.admin().ping();
    } catch (_) {}

    // 2) Roundtrip
    const col = conn.db.collection("__healthchecks");
    const payload = {
      type: "dbcheck",
      ts: new Date(),
      rand: Math.random().toString(36).slice(2),
    };

    let insertedId = null;
    let fetched = null;
    try {
      const ins = await col.insertOne(payload);
      insertedId = ins.insertedId;
      fetched = await col.findOne({ _id: insertedId });
    } finally {
      if (insertedId) {
        try { await col.deleteOne({ _id: insertedId }); } catch (_) {}
      }
    }

    return NextResponse.json(
      {
        ok: true,
        state: stateMap[conn.readyState] ?? String(conn.readyState),
        dbName: conn.name,
        host: conn.host,
        ping,
        roundtrip: {
          insertedId,
          fetchedExists: Boolean(fetched),
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
