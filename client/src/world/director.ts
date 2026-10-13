// Chat events → stage directions. Pure (no three.js, time injected) so the
// choreography is testable; world.ts turns Commands into animation.
//
// The core rule: when someone answers someone, they walk over and the two
// stand together. An explicit NIP-29 reply counts, and so does an implicit
// one — most people never press "reply", they just answer the last person
// who spoke in the channel a moment ago.

import type { WireMessage, WireReaction, WireZap } from '../nostr/wire';

export const IMPLICIT_REPLY_WINDOW = 8 * 60; // s of sim time
export const CONVO_TTL = 6 * 60; // s of sim time without a message
export const SIT_AFTER = 6; // messages before a conversation sits down
export const MAX_PEOPLE = 80;

export type Arrival = 'instant' | 'balloon' | 'door';

export type Command =
  | { c: 'spawn'; pk: string; groupId: string; arrival: Arrival }
  | { c: 'despawn'; pk: string }
  | { c: 'goto-yard'; pk: string; groupId: string; instant: boolean }
  | { c: 'goto-convo'; pk: string; convoId: number; groupId: string; slot: number; size: number; instant: boolean }
  | { c: 'say'; pk: string; msg: WireMessage; to: string | null; instant: boolean }
  | { c: 'face'; pk: string; target: string }
  | { c: 'sit'; convoId: number; members: string[]; instant: boolean }
  | { c: 'convo-end'; convoId: number; members: string[] }
  | { c: 'react'; from: string; to: string; emoji: string; instant: boolean }
  /** `queued`: wall-clock ms when it was directed (a frame loop that paused — a hidden tab, Watch mode — drops stale flights). */
  | { c: 'zap'; from: string | null; to: string; sats: number; instant: boolean; queued: number };

interface Person {
  pk: string;
  groupId: string;
  lastActive: number;
  convo: number | null;
}

export interface Convo {
  id: number;
  groupId: string;
  members: string[];
  count: number;
  lastActive: number;
  sitting: boolean;
}

export class Director {
  readonly people = new Map<string, Person>();
  readonly convos = new Map<number, Convo>();
  private lastInGroup = new Map<string, { pk: string; at: number }>();
  private nextConvo = 1;
  private out: Command[] = [];

  /** Drain the commands produced since the last call. */
  take(): Command[] {
    const o = this.out;
    this.out = [];
    return o;
  }

  reset(): void {
    for (const pk of this.people.keys()) this.out.push({ c: 'despawn', pk });
    this.people.clear();
    this.convos.clear();
    this.lastInGroup.clear();
  }

  /** Someone known to live here but without a recent message: place them. */
  addResident(pk: string, groupId: string, lastActive: number): void {
    if (this.people.has(pk)) return;
    this.people.set(pk, { pk, groupId, lastActive, convo: null });
    this.out.push({ c: 'spawn', pk, groupId, arrival: 'instant' });
    this.enforceCap();
  }

  message(m: WireMessage, now: number, opts: { instant?: boolean; arrival?: Arrival } = {}): void {
    const instant = !!opts.instant;
    const speaker = this.ensure(m.pubkey, m.groupId, now, instant ? 'instant' : (opts.arrival ?? 'door'));
    speaker.lastActive = now;

    let partner: string | null = null;
    if (m.replyTo && m.replyTo !== m.pubkey) {
      partner = m.replyTo;
    } else {
      const last = this.lastInGroup.get(m.groupId);
      if (last && last.pk !== m.pubkey && m.createdAt - last.at <= IMPLICIT_REPLY_WINDOW) partner = last.pk;
    }
    this.lastInGroup.set(m.groupId, { pk: m.pubkey, at: m.createdAt });

    if (partner) {
      const other = this.ensure(partner, m.groupId, now, instant ? 'instant' : 'door');
      other.lastActive = Math.max(other.lastActive, now - 1);
      const convo = this.joinConvo(speaker, other, m.groupId, now, instant);
      convo.count++;
      convo.lastActive = now;
      if (!convo.sitting && convo.count >= SIT_AFTER) {
        convo.sitting = true;
        this.out.push({ c: 'sit', convoId: convo.id, members: [...convo.members], instant });
      }
      this.out.push({ c: 'face', pk: partner, target: m.pubkey });
    } else {
      const cur = speaker.convo !== null ? this.convos.get(speaker.convo) : undefined;
      if (cur && cur.groupId === m.groupId) {
        // Still in the circle: talking to the group.
        cur.lastActive = now;
        cur.count++;
      } else {
        if (cur) this.leaveConvo(speaker, instant);
        if (speaker.groupId !== m.groupId || !instant) {
          speaker.groupId = m.groupId;
          this.out.push({ c: 'goto-yard', pk: speaker.pk, groupId: m.groupId, instant });
        }
      }
    }
    speaker.groupId = m.groupId;
    this.out.push({ c: 'say', pk: m.pubkey, msg: m, to: partner, instant });
  }

  reaction(r: WireReaction, now: number, instant = false): void {
    if (!this.people.has(r.pubkey)) this.ensure(r.pubkey, r.groupId, now, instant ? 'instant' : 'door');
    if (!this.people.has(r.target)) this.ensure(r.target, r.groupId, now, 'instant');
    this.people.get(r.pubkey)!.lastActive = now;
    if (r.pubkey === r.target) return;
    this.out.push({ c: 'react', from: r.pubkey, to: r.target, emoji: r.emoji, instant });
  }

  zap(z: WireZap, now: number, instant = false, wall = Date.now()): void {
    if (!this.people.has(z.target)) this.ensure(z.target, z.groupId, now, 'instant');
    if (z.from && !this.people.has(z.from)) this.ensure(z.from, z.groupId, now, instant ? 'instant' : 'door');
    this.out.push({ c: 'zap', from: z.from, to: z.target, sats: z.sats, instant, queued: wall });
  }

  /** Expire quiet conversations. */
  tick(now: number): void {
    for (const convo of [...this.convos.values()]) {
      if (now - convo.lastActive > CONVO_TTL) this.endConvo(convo);
    }
  }

  private ensure(pk: string, groupId: string, now: number, arrival: Arrival): Person {
    let p = this.people.get(pk);
    if (!p) {
      p = { pk, groupId, lastActive: now, convo: null };
      this.people.set(pk, p);
      this.out.push({ c: 'spawn', pk, groupId, arrival });
      this.enforceCap(pk);
    }
    return p;
  }

  private joinConvo(a: Person, b: Person, groupId: string, now: number, instant: boolean): Convo {
    const existing = [b.convo, a.convo]
      .map((id) => (id !== null ? this.convos.get(id) : undefined))
      .find((c): c is Convo => !!c && c.groupId === groupId);
    let convo = existing;
    if (!convo) {
      convo = { id: this.nextConvo++, groupId, members: [], count: 0, lastActive: now, sitting: false };
      this.convos.set(convo.id, convo);
    }
    let changed = false;
    for (const p of [b, a]) {
      if (p.convo === convo.id) continue;
      if (p.convo !== null) this.leaveConvo(p, instant);
      p.convo = convo.id;
      convo.members.push(p.pk);
      changed = true;
    }
    if (changed) this.placeMembers(convo, instant);
    return convo;
  }

  private placeMembers(convo: Convo, instant: boolean): void {
    convo.members.forEach((pk, slot) => {
      this.out.push({ c: 'goto-convo', pk, convoId: convo.id, groupId: convo.groupId, slot, size: convo.members.length, instant });
    });
  }

  private leaveConvo(p: Person, instant: boolean): void {
    const convo = p.convo !== null ? this.convos.get(p.convo) : undefined;
    p.convo = null;
    if (!convo) return;
    convo.members = convo.members.filter((m) => m !== p.pk);
    if (convo.members.length < 2) this.endConvo(convo);
    else this.placeMembers(convo, instant);
  }

  private endConvo(convo: Convo): void {
    this.convos.delete(convo.id);
    for (const pk of convo.members) {
      const p = this.people.get(pk);
      if (p && p.convo === convo.id) p.convo = null;
    }
    this.out.push({ c: 'convo-end', convoId: convo.id, members: [...convo.members] });
  }

  /** Keep the scene bounded: the longest-idle person not in a conversation
   *  goes home. */
  private enforceCap(keep?: string): void {
    while (this.people.size > MAX_PEOPLE) {
      let victim: Person | null = null;
      for (const p of this.people.values()) {
        if (p.pk === keep || p.convo !== null) continue;
        if (!victim || p.lastActive < victim.lastActive) victim = p;
      }
      if (!victim) return;
      this.people.delete(victim.pk);
      this.out.push({ c: 'despawn', pk: victim.pk });
    }
  }
}
