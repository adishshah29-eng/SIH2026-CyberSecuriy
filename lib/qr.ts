import { randomBytes } from "node:crypto";

export function generateQrToken(): string {
  return `qrt_${randomBytes(12).toString("base64url")}`;
}

export function buildQrUrl(qrToken: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/trace/${qrToken}`;
}
