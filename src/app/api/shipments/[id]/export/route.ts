import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { authorize } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { buildRows, toCsv } from "@/lib/export/csv";
import { evaluateGate } from "@/lib/export/gate";
import { loadForGate } from "@/lib/export/load";
import { UserError, errorResponse } from "@/lib/http";

// The export gate, enforced on the server. A disabled button in the browser is
// not protection: anyone can call this URL, so the rules are checked here, in
// the same transaction that writes the export.
export async function POST(_request: Request, ctx: RouteContext<"/api/shipments/[id]/export">) {
  try {
    const user = await authorize("shipment:export");
    const { id } = await ctx.params;

    const result = await db.$transaction(async (tx) => {
      const exists = await tx.shipment.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw new UserError("Shipment not found.", 404);
      const { gate, source } = await loadForGate(tx, id);
      if (gate.status === "EXPORTED") throw new UserError("This shipment has already been exported.", 409);

      const { canExport, blockers } = evaluateGate(gate);
      if (!canExport) {
        throw new UserError(`Export blocked: ${blockers.map((b) => b.message.replace(/\.$/, "")).join("; ")}.`, 409);
      }

      const rows = buildRows(source);
      if (rows.length === 0) throw new UserError("The invoice has no line items to export.", 409);
      const fileName = `${source.code}_filing-import.csv`;
      const content = toCsv(rows);

      const exp = await tx.export.create({
        data: { shipmentId: id, exportedById: user.id, fileName, content, rowCount: rows.length },
        select: { id: true },
      });
      await tx.shipment.update({ where: { id }, data: { status: "EXPORTED" } });
      await audit(tx, { userId: user.id, action: "shipment.exported", entityType: "export", entityId: exp.id, metadata: { shipmentId: id, fileName } });
      return { exportId: exp.id, fileName };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
