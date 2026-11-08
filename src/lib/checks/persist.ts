import type { Prisma, PrismaClient } from "@prisma/client";
import type { DocType } from "@/lib/fields";
import { DEFAULT_CONFIG, runChecks, type CheckOutcome, type Snapshot } from "./engine";

// Loads a shipment's current values, runs the engine and stores the results.
// Takes the database client as a parameter so it runs inside the caller's
// transaction (and from the seed script).

type Client = Prisma.TransactionClient | PrismaClient;

/** JSON with sorted keys: Postgres stores JSON keys in its own order, so plain stringify would never match. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    // Keys holding undefined are never stored in the database, so ignore them too.
    return `{${Object.keys(value)
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export type StoredCheckDetails = Omit<CheckOutcome, "rule" | "result">;

export async function loadSnapshot(client: Client, shipmentId: string): Promise<Snapshot> {
  const docs = await client.document.findMany({
    where: { shipmentId },
    select: { type: true, status: true, fields: { select: { key: true, valueNormalized: true } } },
  });
  const snap: Snapshot = {};
  for (const d of docs) {
    snap[d.type as DocType] = {
      status: d.status,
      values: Object.fromEntries(d.fields.map((f) => [f.key, f.valueNormalized])),
    };
  }
  return snap;
}

export async function evaluateAndStore(client: Client, shipmentId: string, config = DEFAULT_CONFIG) {
  const outcomes = runChecks(await loadSnapshot(client, shipmentId), config);
  const existing = await client.crossCheck.findMany({ where: { shipmentId } });

  for (const o of outcomes) {
    const prev = existing.find((c) => c.rule === o.rule);
    const prevSignature = (prev?.details as StoredCheckDetails | null)?.signature;
    // A manager's override only holds while the compared values are unchanged.
    const keep = !!prev?.resolvedAt && o.result === "FAIL" && prevSignature === o.signature;
    const { rule, result, ...details } = o;
    const data = {
      result,
      details: details as unknown as Prisma.InputJsonValue,
      resolvedAt: keep ? prev!.resolvedAt : null,
      resolvedById: keep ? prev!.resolvedById : null,
      resolutionNote: keep ? prev!.resolutionNote : null,
    };
    // Skip the write when nothing changed. A save usually affects one or two
    // checks, and every query is a network round trip to the database.
    const unchanged =
      prev &&
      prev.result === result &&
      stable(prev.details) === stable(details) &&
      (prev.resolvedAt?.getTime() ?? null) === (data.resolvedAt?.getTime() ?? null);
    if (unchanged) continue;
    await client.crossCheck.upsert({
      where: { shipmentId_rule: { shipmentId, rule } },
      update: data,
      create: { shipmentId, rule, ...data },
    });
  }
  const stale = existing.filter((c) => !outcomes.some((o) => o.rule === c.rule));
  if (stale.length) await client.crossCheck.deleteMany({ where: { id: { in: stale.map((c) => c.id) } } });
  return outcomes;
}