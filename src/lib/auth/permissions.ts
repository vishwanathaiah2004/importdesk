// Who may do what. Checked on the server in every action and route handler;
// the UI only uses it to hide controls a user cannot use.
//
// [A] From the brief: executives enter and confirm data, the manager approves.
//     Overriding a failed cross-check is an approval decision, so manager only.

export type Role = "EXECUTIVE" | "MANAGER";

export type Permission =
  | "shipment:create"
  | "document:upload"
  | "document:extract"
  | "field:review"
  | "check:override"
  | "shipment:approve"
  | "shipment:export"
  | "audit:view";

const MATRIX: Record<Role, readonly Permission[]> = {
  EXECUTIVE: [
    "shipment:create",
    "document:upload",
    "document:extract",
    "field:review",
    "shipment:export",
  ],
  MANAGER: [
    "shipment:create",
    "document:upload",
    "document:extract",
    "field:review",
    "check:override",
    "shipment:approve",
    "shipment:export",
    "audit:view",
  ],
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}

export const ROLE_LABEL: Record<Role, string> = {
  EXECUTIVE: "Documentation executive",
  MANAGER: "Documentation manager",
};
