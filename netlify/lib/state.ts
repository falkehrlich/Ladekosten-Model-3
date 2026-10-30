import { timingSafeEqual } from "node:crypto";

/** Minimaler Teil des Clients von @netlify/database, den wir brauchen. */
export interface Db {
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => PromiseLike<any[]>;
}

const ROW = "main";
const MAX_BYTES = 3 * 1024 * 1024;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

function pinOk(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // gleiche Rechenzeit, auch wenn die Länge nicht passt
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

function validData(d: any): boolean {
  return (
    d &&
    typeof d === "object" &&
    Array.isArray(d.sessions) &&
    Array.isArray(d.vehicles) &&
    Array.isArray(d.cards)
  );
}

async function current(db: Db) {
  const rows = await db.sql`SELECT version, data, updated_at FROM app_state WHERE id = ${ROW}`;
  if (!rows.length) return { version: 0, data: null, updated_at: null };
  return { version: rows[0].version, data: rows[0].data, updated_at: rows[0].updated_at };
}

/**
 * GET  /api/state  -> {version, data}   (offen, jeder darf lesen)
 * PUT  /api/state  -> Header x-write-pin, Body {baseVersion, data}
 *                     200 {version} | 401 falsche PIN | 409 {version, data} Stand hat sich geändert
 */
export async function handle(req: Request, db: Db, pin: string | undefined): Promise<Response> {
  try {
    if (req.method === "GET") return json(await current(db));

    if (req.method === "PUT") {
      if (!pin) return json({ error: "Schreibschutz ist nicht eingerichtet (WRITE_PIN fehlt)." }, 503);
      const given = req.headers.get("x-write-pin") || "";
      if (!pinOk(given, pin)) {
        await new Promise((r) => setTimeout(r, 400));
        return json({ error: "PIN falsch" }, 401);
      }
      const text = await req.text();
      if (text.length > MAX_BYTES) return json({ error: "Daten zu groß" }, 413);
      let body: any;
      try {
        body = JSON.parse(text);
      } catch {
        return json({ error: "Kein gültiges JSON" }, 400);
      }
      const base = body && body.baseVersion;
      if (!Number.isInteger(base) || base < 0) return json({ error: "baseVersion fehlt" }, 400);
      if (!validData(body.data)) return json({ error: "Daten unvollständig" }, 400);
      const doc = JSON.stringify(body.data);

      let rows: any[];
      if (base === 0) {
        rows = await db.sql`
          INSERT INTO app_state (id, version, data) VALUES (${ROW}, 1, ${doc}::jsonb)
          ON CONFLICT (id) DO NOTHING RETURNING version`;
      } else {
        rows = await db.sql`
          UPDATE app_state SET data = ${doc}::jsonb, version = version + 1, updated_at = now()
          WHERE id = ${ROW} AND version = ${base} RETURNING version`;
      }
      if (!rows.length) return json(await current(db), 409);
      return json({ version: rows[0].version });
    }

    return json({ error: "Methode nicht erlaubt" }, 405);
  } catch (e) {
    console.error("state error", e);
    return json({ error: "Datenbankfehler" }, 500);
  }
}
