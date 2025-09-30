import { NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/database/mongoose";

// GET /api/test — healthcheck for MongoDB via Mongoose
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

    let ping = null;
    try {
      // Lightweight server ping; does not require listing databases
      ping = await conn.db.admin().ping();
    } catch (_) {
      // ignore ping errors, still return connection state
    }

    return NextResponse.json(
      {
        ok: true,
        state: stateMap[conn.readyState] ?? String(conn.readyState),
        name: conn.name,
        host: conn.host,
        user: conn.user ?? null,
        ping,
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
