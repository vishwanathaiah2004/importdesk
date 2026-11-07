"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { authorize } from "@/lib/auth/current-user";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { actionError } from "@/lib/http";

const NewShipment = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^SHP-\d{5}$/, "Use the format SHP-12345."),
  supplierName: z.string().trim().max(120).optional(),
  supplierCountry: z.string().trim().max(60).optional(),
});

export type NewShipmentState = { error?: string; values?: Record<string, string> };

export async function createShipment(_prev: NewShipmentState, formData: FormData): Promise<NewShipmentState> {
  const values = {
    code: String(formData.get("code") ?? ""),
    supplierName: String(formData.get("supplierName") ?? ""),
    supplierCountry: String(formData.get("supplierCountry") ?? ""),
  };
  let shipmentId: string;
  try {
    const user = await authorize("shipment:create");
    const parsed = NewShipment.safeParse(values);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message, values };
    const { code, supplierName, supplierCountry } = parsed.data;

    if (await db.shipment.findUnique({ where: { code }, select: { id: true } })) {
      return { error: `${code} already exists.`, values };
    }
    if (supplierName && !supplierCountry) return { error: "Add the supplier's country.", values };

    const supplier = supplierName
      ? await db.supplier.upsert({
          where: { name_country: { name: supplierName, country: supplierCountry! } },
          update: {},
          create: { name: supplierName, country: supplierCountry! },
        })
      : null;

    const shipment = await db.$transaction(async (tx) => {
      const s = await tx.shipment.create({
        data: { code, supplierId: supplier?.id, createdById: user.id, status: "DRAFT" },
        select: { id: true },
      });
      await audit(tx, { userId: user.id, action: "shipment.created", entityType: "shipment", entityId: s.id, metadata: { shipmentId: s.id, code } });
      return s;
    });
    shipmentId = shipment.id;
  } catch (err) {
    return { ...actionError(err), values };
  }
  redirect(`/shipments/${shipmentId}`);
}
