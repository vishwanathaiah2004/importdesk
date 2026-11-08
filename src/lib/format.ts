// Display formatting. Stored values are canonical (plain decimals, ISO dates);
// these helpers only change how they look on screen.

const IST = "Asia/Kolkata";

export function formatDate(value: Date | string) {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: IST });
}

export function formatDateTime(value: Date | string) {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: IST,
  });
}

export function formatRelative(value: Date | string, now = new Date()) {
  const d = typeof value === "string" ? new Date(value) : value;
  const minutes = Math.round((now.getTime() - d.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return formatDate(d);
}

/** 3120 → "3,120"; 16320 → "16,320.00" with decimals=2. Indian digit grouping is not used: trade documents use international grouping. */
export function formatDecimal(value: string | null | undefined, decimals?: number) {
  if (value == null || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  const fraction = value.includes(".") ? value.split(".")[1].length : 0;
  const digits = decimals ?? fraction;
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: Math.max(digits, fraction) });
}

export function percent(confidence: number | null | undefined) {
  if (confidence == null) return "—";
  return `${Math.round(confidence * 100)}%`;
}

const MONEY_KEYS = /(^invoice_total$|\.unit_price$|\.amount$)/;

/** How a stored canonical value is shown on screen, by field type. */
export function displayValue(type: string, key: string, value: string | null | undefined, unit?: string | null) {
  if (value == null || value === "") return "";
  switch (type) {
    case "number":
      return formatDecimal(value, MONEY_KEYS.test(key) ? 2 : undefined);
    case "integer":
      return formatDecimal(value);
    case "weight":
      return `${formatDecimal(value)} ${unit ?? "kg"}`;
    case "date": {
      const d = new Date(`${value}T00:00:00Z`);
      return Number.isNaN(d.getTime())
        ? value
        : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
    }
    default:
      return value;
  }
}
