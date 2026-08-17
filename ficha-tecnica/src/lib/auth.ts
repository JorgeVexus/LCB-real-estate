import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "lcb_session";

function secret(): string {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) throw new Error("Missing DASHBOARD_PASSWORD env var");
  return password;
}

function sessionToken(): string {
  return createHmac("sha256", secret()).update("lcb-ficha-tecnica-session").digest("hex");
}

export function checkPassword(password: string): boolean {
  const expected = Buffer.from(secret());
  const given = Buffer.from(password);
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

export function issueSessionToken(): string {
  return sessionToken();
}

export function isValidSession(token: string | undefined): boolean {
  if (!token) return false;
  const expected = Buffer.from(sessionToken());
  const given = Buffer.from(token);
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}
