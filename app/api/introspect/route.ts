import { NextResponse } from "next/server";
import mysql from "mysql2/promise";

type RequestBody = {
  connectionUri?: string;
  host?: string;
  port?: number | string;
  user?: string;
  password?: string;
  database?: string;
};

async function connect(body: RequestBody) {
  if (body.connectionUri?.trim()) {
    return mysql.createConnection(body.connectionUri.trim());
  }

  const host = body.host?.trim();
  const user = body.user?.trim();
  const database = body.database?.trim();

  if (!host || !user || !database) {
    return null;
  }

  return mysql.createConnection({
    host,
    port: Number(body.port) || 3306,
    user,
    password: body.password ?? "",
    database,
    multipleStatements: false,
    connectTimeout: 10_000,
  });
}

export async function POST(request: Request) {
  let body: RequestBody;

  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let connection: mysql.Connection | undefined;

  try {
    const maybeConnection = await connect(body);
    if (!maybeConnection) {
      return NextResponse.json(
        {
          error:
            "Provide a MySQL connection URI or host, user, and database fields.",
        },
        { status: 400 },
      );
    }
    connection = maybeConnection;

    const [tables] = await connection.query<mysql.RowDataPacket[]>(
      "SHOW TABLES",
    );

    if (!tables.length) {
      return NextResponse.json(
        { error: "No tables found in the selected database." },
        { status: 404 },
      );
    }

    const tableKey = Object.keys(tables[0])[0];
    const ddlParts: string[] = [];

    for (const row of tables) {
      const tableName = String(row[tableKey]);
      const [createRows] = await connection.query<mysql.RowDataPacket[]>(
        `SHOW CREATE TABLE \`${tableName.replace(/`/g, "``")}\``,
      );
      const createSql = createRows[0]?.["Create Table"];
      if (typeof createSql === "string") {
        ddlParts.push(`${createSql};`);
      }
    }

    return NextResponse.json({
      schema: ddlParts.join("\n\n"),
      tableCount: ddlParts.length,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to introspect MySQL schema";
    console.error("introspect error:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    if (connection) {
      await connection.end().catch(() => undefined);
    }
  }
}
