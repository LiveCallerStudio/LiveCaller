import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export function isHostRequest(request: NextRequest): boolean {
  const expected = process.env.HOST_DASHBOARD_KEY;
  const supplied = request.headers.get("x-host-key") || "";
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function requireHost(request: NextRequest): void {
  if (!isHostRequest(request)) throw new Error("HOST_UNAUTHORIZED");
}