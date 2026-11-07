"use client";

import { useActionState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { FormError, Input, Label } from "@/components/ui/input";
import { createShipment, type NewShipmentState } from "./actions";

export function NewShipmentForm({
  suggestedCode,
  suppliers,
}: {
  suggestedCode: string;
  suppliers: { name: string; country: string }[];
}) {
  const [state, action, pending] = useActionState<NewShipmentState, FormData>(createShipment, {});
  const v = state.values;

  return (
    <form action={action} className="space-y-5">
      <div>
        <Label htmlFor="code">Shipment ID</Label>
        <Input id="code" name="code" required defaultValue={v?.code ?? suggestedCode} className="font-mono" />
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
        <div>
          <Label htmlFor="supplierName">
            Supplier <span className="font-normal text-muted">(optional)</span>
          </Label>
          <Input id="supplierName" name="supplierName" list="suppliers" defaultValue={v?.supplierName} placeholder="e.g. Company B" />
          <datalist id="suppliers">
            {suppliers.map((s) => (
              <option key={`${s.name}-${s.country}`} value={s.name}>
                {s.country}
              </option>
            ))}
          </datalist>
        </div>
        <div>
          <Label htmlFor="supplierCountry">Country</Label>
          <Input id="supplierCountry" name="supplierCountry" defaultValue={v?.supplierCountry} placeholder="e.g. China" />
        </div>
      </div>
      <FormError message={state.error} />
      <div className="flex items-center justify-end gap-2 border-t border-line pt-5">
        <ButtonLink href="/" variant="ghost">
          Cancel
        </ButtonLink>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create and add documents"}
        </Button>
      </div>
    </form>
  );
}
