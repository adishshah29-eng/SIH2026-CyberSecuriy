export function formatDate(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatKg(value: number) {
  return `${value.toLocaleString("en-IN")} kg`;
}

/** ASH-001, PROC-01, LAB-02, MFG-03, COL-004 */
const CODE_PATTERN = /^[A-Z]{2,4}-\d{2,4}$/;

export function isValidBatchCode(code: string): boolean {
  return CODE_PATTERN.test(code);
}
