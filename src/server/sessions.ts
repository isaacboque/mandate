import { randomUUID } from "node:crypto";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { MandateService } from "../service/service.js";

export const SESSION_COOKIE = "mandate_sid";
const ID = /^[0-9a-f-]{36}$/;

/**
 * One MandateService per visitor, found by an HttpOnly cookie. A visitor's mandate, budget, proposals and
 * trace are never visible to, or spent by, anyone else. Idle sessions expire; the oldest is dropped at the cap.
 */
export class SessionStore {
  private sessions = new Map<string, { service: MandateService; seen: number }>();

  constructor(
    private factory: (id: string) => MandateService,
    private opts: { ttlMs?: number; max?: number; now?: () => number } = {},
  ) {}

  private now() {
    return (this.opts.now ?? Date.now)();
  }
  private get ttl() {
    return this.opts.ttlMs ?? 2 * 60 * 60 * 1000;
  }
  get size() {
    return this.sessions.size;
  }

  private sweep() {
    const t = this.now();
    for (const [id, s] of this.sessions) if (t - s.seen > this.ttl) this.sessions.delete(id);
  }

  /** Service for this request's cookie; creates a session (and sets the cookie) when there is none or it expired. */
  forRequest(c: Context): MandateService {
    this.sweep();
    let id = getCookie(c, SESSION_COOKIE);
    let entry = id && ID.test(id) ? this.sessions.get(id) : undefined;
    if (!entry) {
      id = randomUUID();
      const max = this.opts.max ?? 300;
      while (this.sessions.size >= max) {
        const oldest = [...this.sessions.entries()].sort((a, b) => a[1].seen - b[1].seen)[0];
        if (!oldest) break;
        this.sessions.delete(oldest[0]);
      }
      entry = { service: this.factory(id), seen: this.now() };
      this.sessions.set(id, entry);
    }
    entry.seen = this.now();
    const https = c.req.header("x-forwarded-proto") === "https" || c.req.url.startsWith("https:");
    setCookie(c, SESSION_COOKIE, id!, { httpOnly: true, sameSite: "Lax", path: "/", maxAge: Math.floor(this.ttl / 1000), secure: https });
    return entry.service;
  }
}
