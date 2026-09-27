import { NextResponse } from "next/server";
import { listWorkouts, upsertWorkouts } from "@/lib/server";

const protocols = ["2025-03-26", "2025-06-18", "2025-11-25"];

function unauthorized(request: Request) {
  return !process.env.WORKOUT_IMPORT_TOKEN || request.headers.get("authorization") !== `Bearer ${process.env.WORKOUT_IMPORT_TOKEN}`;
}

export async function POST(request: Request) {
  if (unauthorized(request)) return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "A valid import token is required." } }, { status: 401 });
  const version = request.headers.get("mcp-protocol-version") || "2025-03-26";
  if (!protocols.includes(version)) return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32602, message: "Unsupported MCP protocol version." } }, { status: 400 });
  const message = await request.json();
  const id = message?.id ?? null;
  if (message?.jsonrpc !== "2.0" || typeof message?.method !== "string") return NextResponse.json({ jsonrpc: "2.0", id, error: { code: -32600, message: "Invalid Request" } });
  if (!("id" in message)) return new NextResponse(null, { status: 202 });
  try {
    let result: any;
    if (message.method === "initialize") result = { protocolVersion: protocols.includes(message.params?.protocolVersion) ? message.params.protocolVersion : protocols.at(-1), capabilities: { tools: {} }, serverInfo: { name: "thors-running-club", version: "2.0.0" } };
    else if (message.method === "ping") result = {};
    else if (message.method === "tools/list") result = { tools: [
      { name: "list_workouts", description: "List the running club schedule with attendance counts.", inputSchema: { type: "object", properties: { from_date: { type: "string" }, to_date: { type: "string" } }, additionalProperties: false } },
      { name: "upsert_workouts", description: "Publish or update 1–100 running workouts atomically. Reuse external_id on edits.", inputSchema: { type: "object", required: ["workouts"], properties: { workouts: { type: "array", minItems: 1, maxItems: 100 } }, additionalProperties: false } },
    ] };
    else if (message.method === "tools/call") {
      const name = message.params?.name;
      const args = message.params?.arguments || {};
      if (name === "upsert_workouts") result = await upsertWorkouts(args.workouts);
      else if (name === "list_workouts") {
        const rows = await listWorkouts();
        const from = args.from_date ? new Date(`${args.from_date}T00:00:00+01:00`) : null;
        const to = args.to_date ? new Date(`${args.to_date}T23:59:59+01:00`) : null;
        result = { workouts: rows.filter((row) => (!from || new Date(row.starts_at) >= from) && (!to || new Date(row.starts_at) <= to)) };
      } else throw new Error("Unknown tool");
      result = { content: [{ type: "text", text: JSON.stringify(result) }], isError: false };
    } else return NextResponse.json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
    return NextResponse.json({ jsonrpc: "2.0", id, result });
  } catch (error) {
    return NextResponse.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: error instanceof Error ? error.message : "Database operation failed." }], isError: true } });
  }
}
