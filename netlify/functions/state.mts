import type { Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { handle } from "../lib/state.ts";

export default async (req: Request) => handle(req, getDatabase(), Netlify.env.get("WRITE_PIN"));

export const config: Config = {
  path: "/api/state",
  method: ["GET", "PUT"],
  rateLimit: { action: "rate_limit", aggregateBy: ["ip", "domain"], windowSize: 60, windowLimit: 60 },
};
