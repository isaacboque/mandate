import { randomUUID } from "node:crypto";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { MandateService } from "../service/service.js";

export const SESSION_COOKIE = "mandate_sid";
const ID = /^[0-9a-f-]{36}$/;

/**
 * One MandateService per visitor, found by an HttpOnly cookie. A visitor's mandate, budget, proposals and
 * trace are never visible to, or spent by, anyone else. Idle sessions expire. At the cap the oldest EMPTY session (no contract, draft,
 * proposal or chat) goes first and only then the oldest one that holds state, and one client address can create only `newPerMinute`
 * sessions a minute (default 30; 0 turns it off), so a burst of cookieless requests cannot push real visitors out. A request over that
 * cap is still answered, by a session that is not kept and gets no cookie.
 */
export class SessionStore {
  private sessions = new Map<string, { service: MandateService; seen: number; restored?: boolean }>();

  constructor(
    private factory: (id: string) => MandateService,
    private opts: { ttlMs?: number; max?: number; now?: () => number; newPerMinute?: number } = {},
  ) {}

  /** When each address last created sessions, newest last. Only entries from the last minute are kept. */
  private created = new Map<string, number[]>();

  /** Counts one new session for this address. False when it is over its per-minute cap. */
  private mayCreate(ip: string | undefined): boolean {
    const cap = this.opts.newPerMinute ?? 30;
    if (cap <= 0 || !ip) return true;
    const t = this.now();
    const recent = (this.created.get(ip) ?? []).filter((x) => t - x < 60_000);
    if (recent.length >= cap) {
      this.created.set(ip, recent);
      return false;
    }
    recent.push(t);
    this.created.set(ip, recent);
    if (this.created.size > 5000) for (const [k, v] of this.created) if (v.every((x) => t - x >= 60_000)) this.created.delete(k);
    return true;
  }

  /** Makes room for one more session: the oldest empty one, else the oldest overall. One pass, no sorting. */
  private evictOne() {
    let oldestEmpty: [string, number] | undefined;
    let oldest: [string, number] | undefined;
    for (const [id, s] of this.sessions) {
      if (!oldest || s.seen < oldest[1]) oldest = [id, s.seen];
      if (!s.service.hasState() && (!oldestEmpty || s.seen < oldestEmpty[1])) oldestEmpty = [id, s.seen];
    }
    const victim = oldestEmpty ?? oldest;
    if (victim) this.sessions.delete(victim[0]);
  }

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
  forRequest(c: Context, clientIp?: string): MandateService {
    this.sweep();
    let id = getCookie(c, SESSION_COOKIE);
    const wellFormed = Boolean(id && ID.test(id));
    let entry = wellFormed ? this.sessions.get(id!) : undefined;
    if (!entry) {
      // A well-formed id this server does not know (restart, deploy, spin-down, expiry): recreate the session under THAT id, so the
      // several requests the page fires at once with the same stale cookie all land in one session instead of one each.
      const restored = wellFormed;
      id = restored ? id! : randomUUID();
      // Over the per-address cap: answer from a session that is not kept, with no cookie, and leave the others alone.
      if (!this.mayCreate(clientIp)) return this.factory(id);
      const max = this.opts.max ?? 300;
      while (this.sessions.size >= max && this.sessions.size > 0) this.evictOne();
      entry = { service: this.factory(id), seen: this.now(), ...(restored ? { restored: true } : {}) };
      this.sessions.set(id, entry);
    }
    entry.seen = this.now();
    const https = c.req.header("x-forwarded-proto") === "https" || c.req.url.startsWith("https:");
    setCookie(c, SESSION_COOKIE, id!, { httpOnly: true, sameSite: "Lax", path: "/", maxAge: Math.floor(this.ttl / 1000), secure: https });
    return entry.service;
  }

  /** True once after a session was recreated for a cookie the server had forgotten; the page uses it to say the demo restarted. */
  takeRestored(c: Context): boolean {
    const id = getCookie(c, SESSION_COOKIE);
    const entry = id ? this.sessions.get(id) : undefined;
    if (!entry?.restored) return false;
    entry.restored = false;
    return true;
  }
}
