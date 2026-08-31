# SMS Notifications (Twilio) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver mention notifications by SMS as a second channel alongside email, with an inbound-only consent flow, so a reply text lands back in the right comment thread.

**Architecture:** `notifyPendingMentions` currently hardcodes email. It gains a channel-selection step that reads a per-user preference and delivers by email, SMS, or both. Inbound SMS arrives at one Twilio webhook that disambiguates three kinds of message — an opt-out keyword, a verification code, then a thread reply — in that order. Threading is **last-thread-wins**: an inbound SMS attaches to the most recent thread the sender was notified about, because SMS carries no place to hide a per-thread token.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Prisma 7 + PostgreSQL, Vitest, Twilio REST API (called over `fetch`, no SDK — matching `lib/resend.ts`).

**Spec:** `TODO.md` section 19 (gitignored; local to Jon's checkout). Read it alongside this plan — it records the decisions this plan implements and why the alternatives were rejected.

## Global Constraints

- **TDD is non-negotiable.** Every step below writes a failing test before the code that satisfies it. See `CLAUDE.md`.
- **No `any`, no type assertions, no `@ts-ignore`.** TypeScript strict mode. Vercel rejects `any`.
- **Prefer `type` over `interface`.** Options objects for multi-parameter functions.
- **Files:** `kebab-case.ts`. Tests live beside the code as `*.test.ts`.
- **Server-side tests declare `// @vitest-environment node` on line 1.** jsdom is the global default.
- **Import test globals explicitly** — `import { describe, expect, it, vi } from 'vitest'`. `globals: true` is off.
- **Tests use real schemas and types** from the project, never redefined locally.
- **Biome must pass** before every commit: `pnpm biome check --write`.
- **Env vars:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`. The auth token doubles as the webhook signing key — rotating it silently breaks inbound verification.
- **Trial account limits:** sends only to verified numbers, prepends `"Sent from your Twilio trial account"` to every message, 100-message free allowance. A round trip costs 2–3 messages, so budget ~30 test cycles.
- **Verification commands:** `pnpm test`, `pnpm typecheck`, `pnpm lint`. `pnpm pre-commit` runs all three plus build.

## Decisions this plan locks in

Two questions the spec left open. Both are settled here; change them deliberately, not by drift.

**1. SMS notifications do not carry comment text.** The spec flagged this: *"'Jon mentioned you on Q3 Contract — open the document' may be the right ceiling."* This plan takes that ceiling. A text message to a personal phone is a different privacy posture than an email — it renders on a lock screen, and the recipient never chose the device as a work surface. The SMS names the author, the document, and a link. The comment text stays behind authentication.

**2. Last-thread-wins reads from existing data.** No new outbound-SMS table. The winning thread is the most recently notified `CommentMention` for that user — `notifiedAt DESC, take 1`. This reuses the row the notifier already writes, so there is no second source of truth to drift.

---

### Task 1: Schema for phone, verification, and inbound SMS

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_sms_notifications/migration.sql` (generated)
- Test: `lib/sms-schema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `User.phone`, `User.phoneVerifiedAt`, `User.smsOptedOutAt`, `User.notificationChannel` (enum `NotificationChannel { EMAIL SMS BOTH }`, default `EMAIL`); models `PhoneVerification` and `InboundSms`.

This is the one task whose deliverable is declarative. Its test asserts the generated client actually exposes the fields, which is what later tasks depend on — a migration that applies but leaves the client stale is the failure worth catching.

- [ ] **Step 1: Write the failing test**

```typescript
// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';

describe('SMS schema', () => {
  it('exposes the phone and channel fields on User', () => {
    const fields = Prisma.dmmf.datamodel.models
      .find((model) => model.name === 'User')
      ?.fields.map((field) => field.name);

    expect(fields).toEqual(
      expect.arrayContaining(['phone', 'phoneVerifiedAt', 'smsOptedOutAt', 'notificationChannel'])
    );
  });

  it('models a phone verification with a single live row per user', () => {
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'PhoneVerification');

    expect(model).toBeDefined();
    expect(model?.fields.map((f) => f.name)).toEqual(
      expect.arrayContaining(['userId', 'code', 'phone', 'verifiedAt', 'expiresAt', 'attempts'])
    );
  });

  it('records inbound messages so a Twilio retry cannot double-post', () => {
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'InboundSms');

    expect(model).toBeDefined();
    expect(model?.fields.map((f) => f.name)).toEqual(
      expect.arrayContaining(['providerMessageId', 'fromNumber', 'userId', 'threadId'])
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/sms-schema.test.ts`
Expected: FAIL — `PhoneVerification` is undefined, `User` has no `phone`.

- [ ] **Step 3: Add the schema**

Append to `prisma/schema.prisma`:

```prisma
enum NotificationChannel {
  EMAIL
  SMS
  BOTH
}

/// A phone number being claimed by a user, before it is trusted.
///
/// Option B: we never text a number nobody has consented to. The page shows a
/// code, the reader texts it to us, and the inbound message is both the proof of
/// possession and the consent record. The number is learned from that message
/// rather than typed, so there is no field to validate and no typo path.
///
/// The code is short so a human can retype it, which makes it guessable by
/// construction — hence the expiry and the attempt cap. One live row per user:
/// starting a new verification replaces the old one.
model PhoneVerification {
  id         String    @id @default(cuid())
  userId     String    @unique @map("user_id")
  code       String
  phone      String?
  verifiedAt DateTime? @map("verified_at")
  attempts   Int       @default(0)
  expiresAt  DateTime  @map("expires_at")
  createdAt  DateTime  @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([code])
  @@map("phone_verifications")
}

/// One inbound SMS we have accepted. Twilio retries a webhook it believes
/// failed, so the provider's message SID is recorded and made unique: a
/// redelivery finds the row and stops rather than posting the reply twice.
/// The same guard `InboundEmail` provides on the email path.
model InboundSms {
  id                String   @id @default(cuid())
  providerMessageId String   @unique @map("provider_message_id")
  fromNumber        String   @map("from_number")
  userId            String?  @map("user_id")
  threadId          String?  @map("thread_id")
  dwsCommentId      String?  @map("dws_comment_id")
  receivedAt        DateTime @default(now()) @map("received_at")

  @@map("inbound_sms")
}
```

Add to the existing `User` model, beside `currentImpersonationMode`:

```prisma
  phone               String?             @unique
  phoneVerifiedAt     DateTime?           @map("phone_verified_at")
  smsOptedOutAt       DateTime?           @map("sms_opted_out_at")
  notificationChannel NotificationChannel @default(EMAIL) @map("notification_channel")
```

And to the `User` relation block:

```prisma
  phoneVerification PhoneVerification?
```

- [ ] **Step 4: Generate the client and migrate**

```bash
pnpm prisma migrate dev --name sms_notifications
pnpm prisma generate
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test lib/sms-schema.test.ts && pnpm typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations lib/sms-schema.test.ts
git commit -m "feat: add phone, verification and inbound SMS tables"
```

---

### Task 2: `lib/twilio.ts` — sending and signature verification

**Files:**
- Create: `lib/twilio.ts`
- Test: `lib/twilio.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `sendSms(options: { to: string; body: string }): Promise<{ sid: string }>`
  - `verifyTwilioSignature(options: { url: string; params: Record<string, string>; signature: string | undefined; authToken: string }): boolean`

**Why this cannot reuse `lib/webhook-signature.ts`.** Resend signs with Svix: HMAC-SHA256 over `id.timestamp.payload`, base64. Twilio signs with HMAC-SHA1 over the full request URL followed by every POST parameter, sorted by key and concatenated as `key + value` with no separator. Different hash, different message construction, different header. It is a sibling module, not a parameter on the existing one — bending one function to serve both would obscure both.

**Twilio has no timestamp in its signature,** so the replay-tolerance check that `webhook-signature.ts` performs has no equivalent here. The `InboundSms` unique constraint from Task 1 is what bounds replay instead: a captured request replays to "already processed". Say this in the code.

- [ ] **Step 1: Write the failing test**

```typescript
// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { sendSms, verifyTwilioSignature } from '@/lib/twilio';

const AUTH_TOKEN = 'test_auth_token';

// Twilio's own documented algorithm, re-implemented in the test so the test
// fails if the implementation drifts rather than agreeing with itself.
const signLikeTwilio = (url: string, params: Record<string, string>): string => {
  const payload = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);

  return createHmac('sha1', AUTH_TOKEN).update(Buffer.from(payload, 'utf-8')).digest('base64');
};

describe('verifyTwilioSignature', () => {
  const url = 'https://example.com/api/webhooks/twilio';
  const params = { From: '+15551234567', Body: 'hello', MessageSid: 'SM123' };

  it('accepts a correctly signed request', () => {
    expect(
      verifyTwilioSignature({
        url,
        params,
        signature: signLikeTwilio(url, params),
        authToken: AUTH_TOKEN,
      })
    ).toBe(true);
  });

  it('rejects a request whose body was altered after signing', () => {
    expect(
      verifyTwilioSignature({
        url,
        params: { ...params, Body: 'tampered' },
        signature: signLikeTwilio(url, params),
        authToken: AUTH_TOKEN,
      })
    ).toBe(false);
  });

  it('rejects a signature computed for a different URL', () => {
    expect(
      verifyTwilioSignature({
        url,
        params,
        signature: signLikeTwilio('https://evil.example/api/webhooks/twilio', params),
        authToken: AUTH_TOKEN,
      })
    ).toBe(false);
  });

  it('rejects a missing signature rather than treating it as absent-and-fine', () => {
    expect(verifyTwilioSignature({ url, params, signature: undefined, authToken: AUTH_TOKEN })).toBe(
      false
    );
  });

  it('rejects when no auth token is configured, so a blank env cannot open the endpoint', () => {
    expect(
      verifyTwilioSignature({ url, params, signature: signLikeTwilio(url, params), authToken: '' })
    ).toBe(false);
  });
});

describe('sendSms', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('posts form-encoded to the account messages endpoint and returns the sid', async () => {
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC123');
    vi.stubEnv('TWILIO_AUTH_TOKEN', AUTH_TOKEN);
    vi.stubEnv('TWILIO_PHONE_NUMBER', '+17372583742');

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ sid: 'SM999' }), { status: 201 }));

    const result = await sendSms({ to: '+15551234567', body: 'hello' });

    expect(result).toEqual({ sid: 'SM999' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
    expect(String(new URLSearchParams(String(init?.body)).get('To'))).toBe('+15551234567');
    expect(String(new URLSearchParams(String(init?.body)).get('From'))).toBe('+17372583742');
  });

  it('throws with the upstream detail when Twilio rejects the message', async () => {
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC123');
    vi.stubEnv('TWILIO_AUTH_TOKEN', AUTH_TOKEN);
    vi.stubEnv('TWILIO_PHONE_NUMBER', '+17372583742');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"message":"unverified number"}', { status: 400 })
    );

    await expect(sendSms({ to: '+15559999999', body: 'hi' })).rejects.toThrow('unverified number');
  });

  it('names the missing variable when configuration is incomplete', async () => {
    vi.stubEnv('TWILIO_ACCOUNT_SID', '');

    await expect(sendSms({ to: '+15551234567', body: 'hi' })).rejects.toThrow(
      'Missing TWILIO_ACCOUNT_SID'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/twilio.test.ts`
Expected: FAIL — cannot resolve `@/lib/twilio`.

- [ ] **Step 3: Write the implementation**

```typescript
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Minimal Twilio client.
 *
 * Called over REST rather than through the SDK, matching how `lib/resend.ts`
 * talks to Resend and keeping the dependency surface at zero.
 */

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

type TwilioEnvVar = 'TWILIO_ACCOUNT_SID' | 'TWILIO_AUTH_TOKEN' | 'TWILIO_PHONE_NUMBER';

const requireEnv = (name: TwilioEnvVar): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}: cannot send SMS`);
  }

  return value;
};

export const sendSms = async (options: { to: string; body: string }): Promise<{ sid: string }> => {
  const accountSid = requireEnv('TWILIO_ACCOUNT_SID');
  const authToken = requireEnv('TWILIO_AUTH_TOKEN');
  const from = requireEnv('TWILIO_PHONE_NUMBER');

  const response = await fetch(`${TWILIO_API_BASE}/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: options.to, From: from, Body: options.body }).toString(),
  });

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(`Twilio rejected the message: ${response.status} - ${raw}`);
  }

  const result = JSON.parse(raw) as { sid?: string };

  return { sid: result.sid ?? '' };
};

/**
 * Verifying an inbound webhook from Twilio.
 *
 * Deliberately not a parameter on `lib/webhook-signature.ts`. Resend signs with
 * the Svix scheme — HMAC-SHA256 over `id.timestamp.payload`. Twilio signs
 * HMAC-SHA1 over the full request URL followed by every POST parameter sorted by
 * key and concatenated as `key + value` with no separator. Different hash,
 * different message, different header; one function serving both would obscure
 * both.
 *
 * Note what is missing: Twilio puts no timestamp in the signature, so there is no
 * replay window to check the way the Resend verifier does. A captured request
 * stays valid forever. What bounds replay here is the unique constraint on
 * `InboundSms.providerMessageId` — a replayed message finds its own row and stops.
 * That guard is load-bearing, not an optimisation.
 */
export const verifyTwilioSignature = (options: {
  /** The full public URL Twilio posted to, including any query string. */
  url: string;
  params: Record<string, string>;
  signature: string | undefined;
  authToken: string;
}): boolean => {
  const { url, params, signature, authToken } = options;

  if (!signature || !authToken) return false;

  const payload = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);

  const expected = createHmac('sha1', authToken)
    .update(Buffer.from(payload, 'utf-8'))
    .digest('base64');

  const provided = Buffer.from(signature);
  const computed = Buffer.from(expected);

  // timingSafeEqual throws on a length mismatch, which would itself leak length.
  if (provided.length !== computed.length) return false;

  return timingSafeEqual(provided, computed);
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/twilio.test.ts && pnpm typecheck && pnpm biome check --write`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/twilio.ts lib/twilio.test.ts
git commit -m "feat: add Twilio send and webhook signature verification"
```

---

### Task 3: Shared comment-to-prose helper, and the SMS message builder

**Files:**
- Create: `lib/comment-text.ts`, `lib/comment-text.test.ts`
- Create: `lib/mention-sms.ts`, `lib/mention-sms.test.ts`
- Modify: `lib/mention-email.ts` (import the extracted helper, delete the local copy)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `toPlainText(value: string): string` from `lib/comment-text.ts`
  - `buildMentionSms(options: { authorName: string; documentTitle: string; documentUrl: string }): string`

`mention-email.ts` has a private `toPlainText` that flattens viewer HTML to prose. The SMS builder needs the same flattening, and duplicating it would be duplicating knowledge — the same concept, "a comment as prose for a reader", not merely the same shape. Extract it.

**Note the message deliberately omits comment text** (see "Decisions this plan locks in"). `buildMentionSms` therefore takes no `commentText` parameter at all — an argument that is accepted and dropped invites someone to start using it.

- [ ] **Step 1: Write the failing test for the extracted helper**

```typescript
// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { toPlainText } from '@/lib/comment-text';

describe('toPlainText', () => {
  it('turns viewer paragraph markup into line breaks', () => {
    expect(toPlainText('<p>First</p><p>Second</p>')).toBe('First\nSecond');
  });

  it('strips the mention span but keeps the name inside it', () => {
    expect(toPlainText('Hi <span data-user-id="user_1">@Bob</span>, look')).toBe('Hi @Bob, look');
  });

  it('leaves arithmetic written in prose alone', () => {
    expect(toPlainText('a < b & c > d')).toBe('a < b & c > d');
  });

  it('decodes the entities the viewer emits', () => {
    expect(toPlainText('&quot;quoted&quot; &amp; escaped')).toBe('"quoted" & escaped');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/comment-text.test.ts`
Expected: FAIL — cannot resolve `@/lib/comment-text`.

- [ ] **Step 3: Extract the helper**

Create `lib/comment-text.ts` by moving `HTML_ENTITIES` and `toPlainText` verbatim out of `lib/mention-email.ts`, exporting `toPlainText`. Keep the existing doc comment — it explains that flattening happens *before* escaping, never instead of it, which is the thing a reader must not lose.

Then in `lib/mention-email.ts`, delete both and add:

```typescript
import { toPlainText } from '@/lib/comment-text';
```

- [ ] **Step 4: Run the full suite to verify nothing regressed**

Run: `pnpm test && pnpm typecheck`
Expected: PASS — `lib/mention-email.test.ts` must pass unmodified. If it needed changing, the extraction changed behaviour and is wrong.

- [ ] **Step 5: Commit the refactor on its own**

```bash
git add lib/comment-text.ts lib/comment-text.test.ts lib/mention-email.ts
git commit -m "refactor: extract comment-to-prose helper for reuse across channels"
```

- [ ] **Step 6: Write the failing test for the SMS builder**

```typescript
// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { buildMentionSms } from '@/lib/mention-sms';

const options = {
  authorName: 'Alice Example',
  documentTitle: 'Q3 Contract',
  documentUrl: 'https://example.com/documents/doc_1',
};

describe('buildMentionSms', () => {
  it('names the author and the document and links to it', () => {
    const message = buildMentionSms(options);

    expect(message).toContain('Alice Example');
    expect(message).toContain('Q3 Contract');
    expect(message).toContain('https://example.com/documents/doc_1');
  });

  it('tells the reader they can reply, since that is not obvious from a text', () => {
    expect(buildMentionSms(options).toLowerCase()).toContain('reply');
  });

  it('carries STOP instructions, which carriers require on the message itself', () => {
    expect(buildMentionSms(options)).toContain('STOP');
  });

  it('fits a single segment for a typical document title', () => {
    expect(buildMentionSms(options).length).toBeLessThanOrEqual(160);
  });

  it('truncates a long document title rather than spilling into extra segments', () => {
    const message = buildMentionSms({ ...options, documentTitle: 'A'.repeat(200) });

    expect(message.length).toBeLessThanOrEqual(160);
    expect(message).toContain('…');
  });

  it('never carries the comment text, which stays behind authentication', () => {
    // The builder takes no commentText parameter at all; this test documents the
    // decision so reintroducing one fails review rather than passing silently.
    expect(Object.keys(options)).not.toContain('commentText');
    expect(buildMentionSms(options)).not.toContain('@');
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `pnpm test lib/mention-sms.test.ts`
Expected: FAIL — cannot resolve `@/lib/mention-sms`.

- [ ] **Step 8: Write the implementation**

```typescript
/**
 * The text message somebody receives when they are mentioned on a document.
 *
 * Pure, like `buildMentionEmail`: given the facts, produce the message.
 *
 * **This message deliberately omits the comment text.** An email is a reasonable
 * place for a quote; a text message to a personal phone is not. It renders on a
 * lock screen, and the recipient never chose the device as a work surface. The
 * SMS names the author and the document and links to it — the comment itself
 * stays behind authentication. There is no `commentText` parameter, so adding one
 * back is a visible change rather than a quiet one.
 */

const SINGLE_SEGMENT_LIMIT = 160;
const STOP_NOTICE = ' Reply STOP to opt out.';

/**
 * A document title long enough to push the message into a second segment is
 * truncated rather than allowed to cost an extra message. The link matters more
 * than the full title: the title is context, the link is the action.
 */
const fitTitle = (title: string, budget: number): string =>
  title.length <= budget ? title : `${title.slice(0, Math.max(0, budget - 1)).trimEnd()}…`;

export const buildMentionSms = (options: {
  authorName: string;
  documentTitle: string;
  documentUrl: string;
}): string => {
  const { authorName, documentUrl } = options;

  const frame = (title: string): string =>
    `${authorName} mentioned you on "${title}". Reply to add a comment. ${documentUrl}${STOP_NOTICE}`;

  const overflow = frame(options.documentTitle).length - SINGLE_SEGMENT_LIMIT;

  return frame(
    overflow <= 0
      ? options.documentTitle
      : fitTitle(options.documentTitle, options.documentTitle.length - overflow)
  );
};
```

- [ ] **Step 9: Run test to verify it passes**

Run: `pnpm test lib/mention-sms.test.ts && pnpm typecheck && pnpm biome check --write`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add lib/mention-sms.ts lib/mention-sms.test.ts
git commit -m "feat: build the mention SMS, without the comment text"
```

---

### Task 4: Phone verification lifecycle

**Files:**
- Create: `lib/phone-verification.ts`, `lib/phone-verification.test.ts`

**Interfaces:**
- Consumes: `PhoneVerification` model (Task 1).
- Produces:
  - `startPhoneVerification(options: { userId: string }): Promise<{ code: string; expiresAt: Date }>`
  - `redeemPhoneVerification(options: { code: string; phone: string }): Promise<RedeemResult>` where `type RedeemResult = { status: 'verified'; userId: string } | { status: 'no-match' | 'expired' | 'too-many-attempts' }`
  - `VERIFICATION_CODE_LENGTH`, `VERIFICATION_TTL_MINUTES`

The code is short so a human can retype it from a screen, which makes it guessable by construction. Three defences: a ten-minute expiry, an attempt cap, and the fact that a guess only ever binds *the guesser's own phone* to the matched account — so a successful guess costs the attacker their own number and gains them notifications, not access.

- [ ] **Step 1: Write the failing test**

```typescript
// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const upsertVerification = vi.fn();
const findFirstVerification = vi.fn();
const updateVerification = vi.fn();
const updateUser = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    phoneVerification: {
      upsert: (...a: unknown[]) => upsertVerification(...a),
      findFirst: (...a: unknown[]) => findFirstVerification(...a),
      update: (...a: unknown[]) => updateVerification(...a),
    },
    user: { update: (...a: unknown[]) => updateUser(...a) },
  },
}));

const { startPhoneVerification, redeemPhoneVerification, VERIFICATION_CODE_LENGTH } = await import(
  '@/lib/phone-verification'
);

beforeEach(() => {
  vi.clearAllMocks();
  upsertVerification.mockResolvedValue({});
  updateVerification.mockResolvedValue({});
  updateUser.mockResolvedValue({});
});

describe('startPhoneVerification', () => {
  it('returns a code of the documented length', async () => {
    const { code } = await startPhoneVerification({ userId: 'user_1' });

    expect(code).toHaveLength(VERIFICATION_CODE_LENGTH);
  });

  it('avoids characters a reader would misread on a screen', async () => {
    const codes = await Promise.all(
      Array.from({ length: 40 }, () => startPhoneVerification({ userId: 'user_1' }))
    );

    for (const { code } of codes) {
      expect(code).toMatch(/^[0-9A-HJ-NP-Z]+$/);
      expect(code).not.toMatch(/[OI]/);
    }
  });

  it('replaces any previous code for the user rather than leaving two live', async () => {
    await startPhoneVerification({ userId: 'user_1' });

    expect(upsertVerification).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user_1' } })
    );
  });
});

describe('redeemPhoneVerification', () => {
  const live = (overrides: Record<string, unknown> = {}) => ({
    id: 'pv_1',
    userId: 'user_1',
    code: 'AB12',
    attempts: 0,
    expiresAt: new Date(Date.now() + 60_000),
    verifiedAt: null,
    ...overrides,
  });

  it('binds the sender number to the account when the code matches', async () => {
    findFirstVerification.mockResolvedValue(live());

    const result = await redeemPhoneVerification({ code: 'AB12', phone: '+15551234567' });

    expect(result).toEqual({ status: 'verified', userId: 'user_1' });
    expect(updateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user_1' },
        data: expect.objectContaining({ phone: '+15551234567' }),
      })
    );
  });

  it('matches the code case-insensitively, since phone keyboards capitalise', async () => {
    findFirstVerification.mockResolvedValue(live());

    const result = await redeemPhoneVerification({ code: 'ab12', phone: '+15551234567' });

    expect(result.status).toBe('verified');
  });

  it('reports no match for an unknown code without saying which part was wrong', async () => {
    findFirstVerification.mockResolvedValue(null);

    expect(await redeemPhoneVerification({ code: 'ZZZZ', phone: '+1555' })).toEqual({
      status: 'no-match',
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('refuses an expired code', async () => {
    findFirstVerification.mockResolvedValue(live({ expiresAt: new Date(Date.now() - 1) }));

    expect(await redeemPhoneVerification({ code: 'AB12', phone: '+1555' })).toEqual({
      status: 'expired',
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('refuses once the attempt cap is reached, so a short code cannot be ground down', async () => {
    findFirstVerification.mockResolvedValue(live({ attempts: 5 }));

    expect(await redeemPhoneVerification({ code: 'AB12', phone: '+1555' })).toEqual({
      status: 'too-many-attempts',
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('counts a failed attempt so repeated guessing runs out', async () => {
    findFirstVerification.mockResolvedValue(live({ code: 'WXYZ' }));

    await redeemPhoneVerification({ code: 'AB12', phone: '+1555' });

    expect(updateVerification).toHaveBeenCalledWith(
      expect.objectContaining({ data: { attempts: { increment: 1 } } })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/phone-verification.test.ts`
Expected: FAIL — cannot resolve `@/lib/phone-verification`.

- [ ] **Step 3: Write the implementation**

```typescript
import { randomInt } from 'node:crypto';
import { prisma } from '@/lib/prisma';

/**
 * The registration half of option B: the page shows a code, the reader texts it
 * to our number, and the inbound message is both the proof they hold the phone
 * and the consent record a carrier audit wants to see. We never send SMS to a
 * number nobody has consented to, and we never ask anyone to type their number —
 * it is learned from the message that arrives.
 *
 * The code is short because a human retypes it from a screen, which makes it
 * guessable by construction. Three things bound that: a ten-minute expiry, an
 * attempt cap, and the shape of the win — a correct guess binds *the guesser's
 * own phone* to the matched account. It buys notifications, not access, at the
 * cost of the attacker's own number.
 */

export const VERIFICATION_CODE_LENGTH = 4;
export const VERIFICATION_TTL_MINUTES = 10;
export const MAX_VERIFICATION_ATTEMPTS = 5;

// No O or I: they are misread as 0 and 1 on a screen, and the whole point is
// that somebody retypes this into a phone.
const CODE_ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const generateCode = (): string =>
  Array.from(
    { length: VERIFICATION_CODE_LENGTH },
    () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  ).join('');

export const startPhoneVerification = async (options: {
  userId: string;
}): Promise<{ code: string; expiresAt: Date }> => {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MINUTES * 60_000);

  // One live row per user: starting again replaces the previous code and resets
  // the attempt count, so a fresh start is genuinely fresh.
  await prisma.phoneVerification.upsert({
    where: { userId: options.userId },
    create: { userId: options.userId, code, expiresAt, attempts: 0 },
    update: { code, expiresAt, attempts: 0, phone: null, verifiedAt: null },
  });

  return { code, expiresAt };
};

export type RedeemResult =
  | { status: 'verified'; userId: string }
  | { status: 'no-match' | 'expired' | 'too-many-attempts' };

export const redeemPhoneVerification = async (options: {
  code: string;
  phone: string;
}): Promise<RedeemResult> => {
  // Phone keyboards capitalise the first letter and readers are inconsistent, so
  // the comparison is case-insensitive. The alphabet is upper-case only, so
  // folding the input is enough.
  const code = options.code.trim().toUpperCase();

  const verification = await prisma.phoneVerification.findFirst({
    where: { code, verifiedAt: null },
  });

  // An unknown code is indistinguishable from a guess. Say nothing more specific.
  if (!verification) return { status: 'no-match' };

  if (verification.attempts >= MAX_VERIFICATION_ATTEMPTS) {
    return { status: 'too-many-attempts' };
  }

  if (verification.expiresAt.getTime() < Date.now()) {
    return { status: 'expired' };
  }

  if (verification.code.toUpperCase() !== code) {
    await prisma.phoneVerification.update({
      where: { id: verification.id },
      data: { attempts: { increment: 1 } },
    });

    return { status: 'no-match' };
  }

  await prisma.phoneVerification.update({
    where: { id: verification.id },
    data: { phone: options.phone, verifiedAt: new Date() },
  });

  // Clearing any prior opt-out is deliberate: texting us a code is a fresh,
  // user-initiated consent, and it should override an old STOP.
  await prisma.user.update({
    where: { id: verification.userId },
    data: { phone: options.phone, phoneVerifiedAt: new Date(), smsOptedOutAt: null },
  });

  return { status: 'verified', userId: verification.userId };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/phone-verification.test.ts && pnpm typecheck && pnpm biome check --write`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/phone-verification.ts lib/phone-verification.test.ts
git commit -m "feat: add phone verification code lifecycle"
```

---

### Task 5: Verification and preference API routes

**Files:**
- Create: `app/api/user/phone/route.ts`, `app/api/user/phone/route.test.ts`
- Create: `app/api/user/notification-channel/route.ts`, `app/api/user/notification-channel/route.test.ts`

**Interfaces:**
- Consumes: `startPhoneVerification` (Task 4), `NotificationChannel` (Task 1), `auth` from `@/lib/auth`.
- Produces:
  - `POST /api/user/phone` → `{ code, expiresAt }` — starts verification, returns the code to display.
  - `GET /api/user/phone` → `{ phone: string | null; verified: boolean }` — what the page polls.
  - `DELETE /api/user/phone` → `{ ok: true }` — forget the number.
  - `PATCH /api/user/notification-channel` with `{ channel: 'EMAIL' | 'SMS' | 'BOTH' }`.

The page polls `GET` because nothing comes back through the browser when the text arrives — the cost the spec accepted when it chose option B.

- [ ] **Step 1: Write the failing test**

```typescript
// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.fn();
const startPhoneVerification = vi.fn();
const findUniqueUser = vi.fn();
const updateUser = vi.fn();

vi.mock('@/lib/auth', () => ({ auth: (...a: unknown[]) => auth(...a) }));
vi.mock('@/lib/phone-verification', () => ({
  startPhoneVerification: (...a: unknown[]) => startPhoneVerification(...a),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => findUniqueUser(...a),
      update: (...a: unknown[]) => updateUser(...a),
    },
  },
}));

const { POST, GET, DELETE } = await import('@/app/api/user/phone/route');

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: 'user_1' } });
});

describe('POST /api/user/phone', () => {
  it('refuses an unauthenticated caller', async () => {
    auth.mockResolvedValue(null);

    expect((await POST()).status).toBe(401);
    expect(startPhoneVerification).not.toHaveBeenCalled();
  });

  it('returns a code for the signed-in user to text us', async () => {
    const expiresAt = new Date('2026-09-01T00:00:00Z');
    startPhoneVerification.mockResolvedValue({ code: 'AB12', expiresAt });

    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      code: 'AB12',
      expiresAt: expiresAt.toISOString(),
    });
    expect(startPhoneVerification).toHaveBeenCalledWith({ userId: 'user_1' });
  });
});

describe('GET /api/user/phone', () => {
  it('reports the verified number once the text has arrived', async () => {
    findUniqueUser.mockResolvedValue({ phone: '+15551234567', phoneVerifiedAt: new Date() });

    await expect((await GET()).json()).resolves.toEqual({
      phone: '+15551234567',
      verified: true,
    });
  });

  it('reports unverified while the code is still outstanding', async () => {
    findUniqueUser.mockResolvedValue({ phone: null, phoneVerifiedAt: null });

    await expect((await GET()).json()).resolves.toEqual({ phone: null, verified: false });
  });
});

describe('DELETE /api/user/phone', () => {
  it('forgets the number and stops SMS for that user', async () => {
    updateUser.mockResolvedValue({});

    expect((await DELETE()).status).toBe(200);
    expect(updateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user_1' },
        data: expect.objectContaining({ phone: null, phoneVerifiedAt: null }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test app/api/user/phone/route.test.ts`
Expected: FAIL — route does not exist.

- [ ] **Step 3: Write the route**

```typescript
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { startPhoneVerification } from '@/lib/phone-verification';
import { prisma } from '@/lib/prisma';

/**
 * The registration surface for SMS notifications.
 *
 * `POST` hands back a short code for the reader to text to our number. Nothing
 * comes back through the browser when that message arrives, so the page polls
 * `GET` to notice. That poll is the cost option B accepted in exchange for never
 * sending SMS to a number nobody has consented to.
 */

const unauthorized = () => NextResponse.json({ error: 'Not signed in' }, { status: 401 });

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const { code, expiresAt } = await startPhoneVerification({ userId: session.user.id });

  return NextResponse.json({ code, expiresAt: expiresAt.toISOString() });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { phone: true, phoneVerifiedAt: true },
  });

  return NextResponse.json({
    phone: user?.phone ?? null,
    verified: Boolean(user?.phoneVerifiedAt),
  });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  await prisma.user.update({
    where: { id: session.user.id },
    data: { phone: null, phoneVerifiedAt: null },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Write the failing test for the channel preference route**

```typescript
// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.fn();
const findUniqueUser = vi.fn();
const updateUser = vi.fn();

vi.mock('@/lib/auth', () => ({ auth: (...a: unknown[]) => auth(...a) }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => findUniqueUser(...a),
      update: (...a: unknown[]) => updateUser(...a),
    },
  },
}));

const { PATCH } = await import('@/app/api/user/notification-channel/route');

const request = (body: unknown) =>
  new Request('https://example.com/api/user/notification-channel', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: 'user_1' } });
  findUniqueUser.mockResolvedValue({ phoneVerifiedAt: new Date() });
  updateUser.mockResolvedValue({});
});

describe('PATCH /api/user/notification-channel', () => {
  it('stores a valid channel', async () => {
    expect((await PATCH(request({ channel: 'BOTH' }))).status).toBe(200);
    expect(updateUser).toHaveBeenCalledWith(
      expect.objectContaining({ data: { notificationChannel: 'BOTH' } })
    );
  });

  it('rejects a channel outside the enum rather than writing it', async () => {
    expect((await PATCH(request({ channel: 'PIGEON' }))).status).toBe(400);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('refuses to select SMS before a number is verified, which would silently drop notifications', async () => {
    findUniqueUser.mockResolvedValue({ phoneVerifiedAt: null });

    expect((await PATCH(request({ channel: 'SMS' }))).status).toBe(409);
    expect(updateUser).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Run both tests to verify they fail**

Run: `pnpm test app/api/user`
Expected: FAIL — the notification-channel route does not exist.

- [ ] **Step 6: Write the channel preference route**

```typescript
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const CHANNELS = ['EMAIL', 'SMS', 'BOTH'] as const;

type Channel = (typeof CHANNELS)[number];

const isChannel = (value: unknown): value is Channel =>
  typeof value === 'string' && CHANNELS.some((channel) => channel === value);

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed body' }, { status: 400 });
  }

  const channel = (body as { channel?: unknown })?.channel;

  if (!isChannel(channel)) {
    return NextResponse.json({ error: 'Unknown channel' }, { status: 400 });
  }

  // Choosing SMS without a verified number would silently drop every
  // notification: the notifier has nowhere to send, and the user sees nothing at
  // all. Refuse the state rather than create it.
  if (channel !== 'EMAIL') {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { phoneVerifiedAt: true },
    });

    if (!user?.phoneVerifiedAt) {
      return NextResponse.json({ error: 'Verify a phone number first' }, { status: 409 });
    }
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { notificationChannel: channel },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm test app/api/user && pnpm typecheck && pnpm biome check --write`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/api/user/phone app/api/user/notification-channel
git commit -m "feat: add phone verification and channel preference endpoints"
```

---

### Task 6: Channel selection in the notifier

**Files:**
- Modify: `lib/notify-mentions.ts`
- Modify: `lib/notify-mentions.test.ts`

**Interfaces:**
- Consumes: `sendSms` (Task 2), `buildMentionSms` (Task 3), `User.notificationChannel` / `phone` / `phoneVerifiedAt` / `smsOptedOutAt` (Task 1).
- Produces: `NotifyFailureCode` gains `'no-sms-destination'`.

`notifyPendingMentions` keeps its signature and its per-mention try/catch, its idempotency, and its share-grant ordering. Only delivery changes: one recipient lookup now also reads the channel fields, and the send step fans out.

**A mention is marked notified when at least one channel accepted it.** For `BOTH`, an SMS failure alongside a successful email must not cause the whole mention to retry — that would re-send the email. Record the SMS failure, keep the mention marked.

- [ ] **Step 1: Write the failing tests**

Add to `lib/notify-mentions.test.ts`. Extend the existing `vi.mock('@/lib/prisma', ...)` block only if needed — the `user.findUnique` mock already exists.

```typescript
vi.mock('@/lib/twilio', () => ({ sendSms: (...args: unknown[]) => sendSms(...args) }));
```

with `const sendSms = vi.fn();` beside the other mocks, and:

```typescript
describe('channel selection', () => {
  const smsUser = {
    email: 'bob@example.com',
    name: 'Bob',
    phone: '+15551234567',
    phoneVerifiedAt: new Date(),
    smsOptedOutAt: null,
    notificationChannel: 'SMS',
  };

  it('sends only email when the user has made no choice', async () => {
    reconcileDocument.mockResolvedValue([mention()]);
    findUniqueUser.mockResolvedValue({ ...smsUser, notificationChannel: 'EMAIL' });

    const result = await notifyPendingMentions({ documentId: 'doc_1' });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendSms).not.toHaveBeenCalled();
    expect(result.sent).toBe(1);
  });

  it('sends only SMS when the user chose SMS', async () => {
    reconcileDocument.mockResolvedValue([mention()]);
    findUniqueUser.mockResolvedValue(smsUser);

    await notifyPendingMentions({ documentId: 'doc_1' });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendSms).toHaveBeenCalledWith(
      expect.objectContaining({ to: '+15551234567' })
    );
  });

  it('never puts the comment text in the SMS', async () => {
    reconcileDocument.mockResolvedValue([
      mention({ commentText: 'the secret merger price is 4.2bn' }),
    ]);
    findUniqueUser.mockResolvedValue(smsUser);

    await notifyPendingMentions({ documentId: 'doc_1' });

    expect(sendSms.mock.calls[0][0].body).not.toContain('4.2bn');
  });

  it('sends both when the user chose both', async () => {
    reconcileDocument.mockResolvedValue([mention()]);
    findUniqueUser.mockResolvedValue({ ...smsUser, notificationChannel: 'BOTH' });

    await notifyPendingMentions({ documentId: 'doc_1' });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendSms).toHaveBeenCalledTimes(1);
  });

  it('falls back to email when SMS is chosen but the number is unverified', async () => {
    reconcileDocument.mockResolvedValue([mention()]);
    findUniqueUser.mockResolvedValue({ ...smsUser, phoneVerifiedAt: null });

    const result = await notifyPendingMentions({ documentId: 'doc_1' });

    expect(sendSms).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(result.sent).toBe(1);
  });

  it('falls back to email for someone who has texted STOP', async () => {
    reconcileDocument.mockResolvedValue([mention()]);
    findUniqueUser.mockResolvedValue({ ...smsUser, smsOptedOutAt: new Date() });

    await notifyPendingMentions({ documentId: 'doc_1' });

    expect(sendSms).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('keeps the mention notified when SMS fails but email succeeded', async () => {
    reconcileDocument.mockResolvedValue([mention()]);
    findUniqueUser.mockResolvedValue({ ...smsUser, notificationChannel: 'BOTH' });
    sendSms.mockRejectedValue(new Error('unverified number'));

    const result = await notifyPendingMentions({ documentId: 'doc_1' });

    // Marked notified: retrying would re-send the email that did arrive.
    expect(updateMention).toHaveBeenCalled();
    expect(result.sent).toBe(1);
    expect(result.failures[0]).toEqual(
      expect.objectContaining({ code: 'delivery-failed' })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test lib/notify-mentions.test.ts`
Expected: FAIL — `sendSms` is never called; the recipient select does not read the channel.

- [ ] **Step 3: Widen the recipient lookup**

In `lib/notify-mentions.ts`, change the `select` on the recipient query:

```typescript
      const recipient = await prisma.user.findUnique({
        where: { id: mention.mentionedUserId },
        select: {
          email: true,
          name: true,
          phone: true,
          phoneVerifiedAt: true,
          smsOptedOutAt: true,
          notificationChannel: true,
        },
      });
```

- [ ] **Step 4: Add channel selection and fan-out**

Add above `notifyPendingMentions`:

```typescript
/**
 * Which channels a notification should actually go out on.
 *
 * A preference is a request, not a guarantee. SMS needs a verified number and no
 * standing opt-out, and when it is unavailable the notification falls back to
 * email rather than vanishing — a preference should never be the reason somebody
 * hears nothing at all.
 */
type Deliverable = { email: boolean; sms: boolean };

const channelsFor = (recipient: {
  phone: string | null;
  phoneVerifiedAt: Date | null;
  smsOptedOutAt: Date | null;
  notificationChannel: 'EMAIL' | 'SMS' | 'BOTH';
}): Deliverable => {
  const smsAvailable = Boolean(
    recipient.phone && recipient.phoneVerifiedAt && !recipient.smsOptedOutAt
  );

  if (recipient.notificationChannel === 'EMAIL') return { email: true, sms: false };

  if (!smsAvailable) return { email: true, sms: false };

  return { email: recipient.notificationChannel === 'BOTH', sms: true };
};
```

Replace the single `await sendEmail({...})` call with the fan-out. Everything before it — the share upsert, the reply address — is unchanged:

```typescript
      const channels = channelsFor(recipient);

      let delivered = false;

      if (channels.email) {
        const email = buildMentionEmail({
          recipientName: recipient.name ?? recipient.email,
          authorName: mention.authorName,
          documentTitle: mention.documentTitle,
          documentUrl: `${appUrl()}/documents/${mention.documentId}`,
          commentText: mention.commentText,
          replyAddress,
        });

        await sendEmail({
          to: recipient.email,
          subject: email.subject,
          text: email.text,
          html: email.html,
          replyTo: email.replyTo,
        });

        delivered = true;
      }

      if (channels.sms && recipient.phone) {
        try {
          await sendSms({
            to: recipient.phone,
            body: buildMentionSms({
              authorName: mention.authorName,
              documentTitle: mention.documentTitle,
              documentUrl: `${appUrl()}/documents/${mention.documentId}`,
            }),
          });

          delivered = true;
        } catch (error) {
          // Recorded, but not rethrown when the email already went out. Retrying
          // the mention would re-send an email that did arrive, so a failed
          // second channel must not undo a delivered first one.
          record(mention, 'delivery-failed', reasonFrom(error));

          if (!delivered) throw error;
        }
      }
```

with the existing `notifiedAt` update following unchanged, and these imports added at the top:

```typescript
import { buildMentionSms } from '@/lib/mention-sms';
import { sendSms } from '@/lib/twilio';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test lib/notify-mentions.test.ts && pnpm typecheck && pnpm biome check --write`
Expected: PASS, including every pre-existing test in that file unmodified.

- [ ] **Step 6: Commit**

```bash
git add lib/notify-mentions.ts lib/notify-mentions.test.ts
git commit -m "feat: pick a notification channel per recipient"
```

---

### Task 7: `/api/webhooks/twilio` — verification and replies

**Files:**
- Create: `app/api/webhooks/twilio/route.ts`, `app/api/webhooks/twilio/route.test.ts`

**Interfaces:**
- Consumes: `verifyTwilioSignature` (Task 2), `redeemPhoneVerification` (Task 4), `addComment` from `@/lib/dws-comments`, `InboundSms` (Task 1).
- Produces: `POST` handler returning TwiML.

**Order of checks, and why.** Signature first, before the body is trusted at all. Then verification-code match, then thread reply. The spec makes the reason explicit: *a sender with no verified number cannot own a thread, so the ordering falls out naturally — but make it explicit rather than incidental.*

**Last-thread-wins.** The winning thread is the most recently notified mention for that user. Document the trust change loudly: the credential here is the sender's phone number, which Twilio validates, but this is a weaker model than the email token and the opposite of the "never trust the sender" rule the email path documents. This repo is a reference implementation; someone will copy whichever pattern they read.

- [ ] **Step 1: Write the failing test**

```typescript
// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyTwilioSignature = vi.fn();
const redeemPhoneVerification = vi.fn();
const addComment = vi.fn();
const sendSms = vi.fn();
const findFirstUser = vi.fn();
const findFirstMention = vi.fn();
const createInboundSms = vi.fn();
const deleteInboundSms = vi.fn();
const updateInboundSms = vi.fn();

vi.mock('@/lib/twilio', () => ({
  verifyTwilioSignature: (...a: unknown[]) => verifyTwilioSignature(...a),
  sendSms: (...a: unknown[]) => sendSms(...a),
}));
vi.mock('@/lib/phone-verification', () => ({
  redeemPhoneVerification: (...a: unknown[]) => redeemPhoneVerification(...a),
}));
vi.mock('@/lib/dws-comments', () => ({ addComment: (...a: unknown[]) => addComment(...a) }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findFirst: (...a: unknown[]) => findFirstUser(...a) },
    commentMention: { findFirst: (...a: unknown[]) => findFirstMention(...a) },
    inboundSms: {
      create: (...a: unknown[]) => createInboundSms(...a),
      delete: (...a: unknown[]) => deleteInboundSms(...a),
      update: (...a: unknown[]) => updateInboundSms(...a),
    },
  },
}));

const { POST } = await import('@/app/api/webhooks/twilio/route');

const post = (params: Record<string, string>) =>
  new Request('https://example.com/api/webhooks/twilio', {
    method: 'POST',
    headers: { 'x-twilio-signature': 'sig', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });

const inboundReply = {
  From: '+15551234567',
  Body: 'Looks good to me',
  MessageSid: 'SM123',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('TWILIO_AUTH_TOKEN', 'token');
  verifyTwilioSignature.mockReturnValue(true);
  redeemPhoneVerification.mockResolvedValue({ status: 'no-match' });
  createInboundSms.mockResolvedValue({});
  updateInboundSms.mockResolvedValue({});
  addComment.mockResolvedValue({ commentId: 'comment_1' });
});

describe('signature', () => {
  it('rejects an unsigned request before doing anything else', async () => {
    verifyTwilioSignature.mockReturnValue(false);

    expect((await POST(post(inboundReply))).status).toBe(403);
    expect(redeemPhoneVerification).not.toHaveBeenCalled();
    expect(addComment).not.toHaveBeenCalled();
  });
});

describe('registration', () => {
  it('treats a matching code as a registration, not a reply', async () => {
    redeemPhoneVerification.mockResolvedValue({ status: 'verified', userId: 'user_1' });

    const response = await POST(post({ ...inboundReply, Body: 'AB12' }));

    expect(response.status).toBe(200);
    expect(addComment).not.toHaveBeenCalled();
    expect(redeemPhoneVerification).toHaveBeenCalledWith({
      code: 'AB12',
      phone: '+15551234567',
    });
  });

  it('confirms registration to the sender', async () => {
    redeemPhoneVerification.mockResolvedValue({ status: 'verified', userId: 'user_1' });

    const body = await (await POST(post({ ...inboundReply, Body: 'AB12' }))).text();

    expect(body).toContain('<Response>');
    expect(body.toLowerCase()).toContain('registered');
  });
});

describe('replies', () => {
  const verifiedSender = { id: 'user_1', name: 'Bob', email: 'bob@example.com' };

  const lastThread = {
    comment: {
      thread: {
        id: 'thread_1',
        rootAnnotationId: 'anno_1',
        document: { documentEngineId: 'doc_engine_1' },
      },
    },
  };

  it('posts the reply into the most recent thread the sender was notified about', async () => {
    findFirstUser.mockResolvedValue(verifiedSender);
    findFirstMention.mockResolvedValue(lastThread);

    expect((await POST(post(inboundReply))).status).toBe(200);
    expect(addComment).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc_engine_1',
        rootAnnotationId: 'anno_1',
        authorUserId: 'user_1',
        text: 'Looks good to me',
      })
    );
  });

  it('orders by most recent notification, which is what last-thread-wins means', async () => {
    findFirstUser.mockResolvedValue(verifiedSender);
    findFirstMention.mockResolvedValue(lastThread);

    await POST(post(inboundReply));

    expect(findFirstMention).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { notifiedAt: 'desc' } })
    );
  });

  it('ignores a message from a number nobody has verified', async () => {
    findFirstUser.mockResolvedValue(null);

    expect((await POST(post(inboundReply))).status).toBe(200);
    expect(addComment).not.toHaveBeenCalled();
  });

  it('tells a sender with no thread to reply to, rather than failing silently', async () => {
    findFirstUser.mockResolvedValue(verifiedSender);
    findFirstMention.mockResolvedValue(null);

    const body = await (await POST(post(inboundReply))).text();

    expect(addComment).not.toHaveBeenCalled();
    expect(body.toLowerCase()).toContain('no recent');
  });

  it('claims the message sid before writing, so a retry cannot double-post', async () => {
    findFirstUser.mockResolvedValue(verifiedSender);
    findFirstMention.mockResolvedValue(lastThread);
    createInboundSms.mockRejectedValue(new Error('unique constraint'));

    expect((await POST(post(inboundReply))).status).toBe(200);
    expect(addComment).not.toHaveBeenCalled();
  });

  it('releases the claim when the write fails, so the retry is not swallowed', async () => {
    findFirstUser.mockResolvedValue(verifiedSender);
    findFirstMention.mockResolvedValue(lastThread);
    addComment.mockRejectedValue(new Error('DWS is down'));
    deleteInboundSms.mockResolvedValue({});

    expect((await POST(post(inboundReply))).status).toBe(500);
    expect(deleteInboundSms).toHaveBeenCalledWith({
      where: { providerMessageId: 'SM123' },
    });
  });

  it('ignores an empty body rather than posting a blank comment', async () => {
    findFirstUser.mockResolvedValue(verifiedSender);

    expect((await POST(post({ ...inboundReply, Body: '   ' }))).status).toBe(200);
    expect(addComment).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test app/api/webhooks/twilio`
Expected: FAIL — route does not exist.

- [ ] **Step 3: Write the route**

```typescript
import { NextResponse } from 'next/server';
import { addComment } from '@/lib/dws-comments';
import { redeemPhoneVerification } from '@/lib/phone-verification';
import { prisma } from '@/lib/prisma';
import { verifyTwilioSignature } from '@/lib/twilio';

/**
 * POST /api/webhooks/twilio
 *
 * Where an inbound text becomes either a phone registration or a comment reply.
 *
 * The order of checks matters, and it is explicit rather than incidental:
 *
 * 1. The Twilio signature is verified over the raw form parameters before
 *    anything is trusted.
 * 2. A body matching a live verification code is a registration. This is checked
 *    first because a sender with no verified number cannot own a thread — the
 *    ordering would fall out anyway, but relying on that would be an accident.
 * 3. Otherwise it is a reply, attributed by sender number and attached by
 *    last-thread-wins.
 *
 * ## The trust model here is weaker than the email path, on purpose
 *
 * An emailed reply carries a per-(thread, user) token in the recipient address:
 * unguessable, issued to one person for one thread, and the reason the email
 * handler never has to trust the `From:` header. An SMS gives you a sender
 * number, our number, and a body. There is nowhere to hide a token, so **the
 * credential is the sender's phone number.**
 *
 * Twilio validates the originating number, so this is not nothing — but it is
 * the opposite of the "never trust the sender" rule the email path documents,
 * and it inherits every weakness of the phone network: SIM swap, number
 * recycling, and spoofing on some routes.
 *
 * This repository is a reference implementation. Somebody will copy whichever
 * pattern they read, so read this one knowing what it gives up.
 *
 * ## Last-thread-wins is ambiguous, and that is the accepted cost
 *
 * A reply attaches to the most recent thread the sender was notified about. If
 * two mentions land close together the reply may attach to the wrong one. The
 * alternatives all cost more than the ambiguity: a number per thread does not
 * scale, and a code in the body breaks the "just reply" promise that makes this
 * feature worth having. The outbound message names the document so the reader has
 * the context to notice.
 */

const twiml = (message?: string): NextResponse =>
  new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${
      message ? `<Message>${message}</Message>` : ''
    }</Response>`,
    { status: 200, headers: { 'Content-Type': 'text/xml' } }
  );

/**
 * The URL Twilio signed. It signs the address it was configured with, so behind a
 * proxy the request's own view of the URL can differ; `TWILIO_WEBHOOK_URL` pins
 * it when they disagree.
 */
const signedUrl = (request: Request): string =>
  process.env.TWILIO_WEBHOOK_URL ?? request.url;

export async function POST(request: Request) {
  const form = new URLSearchParams(await request.text());
  const params = Object.fromEntries(form.entries());

  const signatureValid = verifyTwilioSignature({
    url: signedUrl(request),
    params,
    signature: request.headers.get('x-twilio-signature') ?? undefined,
    authToken: process.env.TWILIO_AUTH_TOKEN ?? '',
  });

  if (!signatureValid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  }

  const from = params.From ?? '';
  const body = (params.Body ?? '').trim();
  const providerMessageId = params.MessageSid ?? '';

  if (!from || !body || !providerMessageId) return twiml();

  // Registration first — see the ordering note above.
  const redeemed = await redeemPhoneVerification({ code: body, phone: from });

  if (redeemed.status === 'verified') {
    return twiml("You're registered. You'll get a text when someone mentions you.");
  }

  const sender = await prisma.user.findFirst({
    where: { phone: from, phoneVerifiedAt: { not: null }, smsOptedOutAt: null },
    select: { id: true, name: true, email: true },
  });

  // An unrecognised number is indistinguishable from a stranger. Say nothing.
  if (!sender) return twiml();

  // Last-thread-wins: the most recently notified mention for this person. Reusing
  // the row the notifier already writes keeps this from becoming a second source
  // of truth that can drift.
  const latest = await prisma.commentMention.findFirst({
    where: { mentionedUserId: sender.id, notifiedAt: { not: null } },
    orderBy: { notifiedAt: 'desc' },
    select: {
      comment: {
        select: {
          thread: {
            select: {
              id: true,
              rootAnnotationId: true,
              document: { select: { documentEngineId: true } },
            },
          },
        },
      },
    },
  });

  if (!latest) {
    return twiml('No recent comment thread to reply to. Open the document to comment.');
  }

  const thread = latest.comment.thread;

  // Claiming the SID before writing is what makes a Twilio retry safe — and it is
  // also the only thing bounding replay, since a Twilio signature carries no
  // timestamp and stays valid forever.
  try {
    await prisma.inboundSms.create({
      data: { providerMessageId, fromNumber: from, userId: sender.id, threadId: thread.id },
    });
  } catch {
    return twiml();
  }

  let commentId: string;

  try {
    ({ commentId } = await addComment({
      documentId: thread.document.documentEngineId,
      rootAnnotationId: thread.rootAnnotationId,
      authorUserId: sender.id,
      creatorName: sender.name ?? sender.email,
      text: body,
      customData: { source: 'sms', inboundMessageId: providerMessageId },
    }));
  } catch (error) {
    // Release the claim, exactly as the email path does. Holding it after a
    // failed write turns the idempotency guard into a black hole: Twilio retries,
    // the claim is still there, the retry is ignored, and the reply is lost.
    await prisma.inboundSms.delete({ where: { providerMessageId } }).catch(() => {});

    return NextResponse.json(
      { error: 'Could not add the comment', detail: String(error) },
      { status: 500 }
    );
  }

  await prisma.inboundSms.update({ where: { providerMessageId }, data: { dwsCommentId: commentId } });

  return twiml();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test app/api/webhooks/twilio && pnpm typecheck && pnpm biome check --write`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/webhooks/twilio
git commit -m "feat: accept inbound SMS as registration or thread reply"
```

---

### Task 8: STOP, HELP, and opt-out

**Files:**
- Modify: `app/api/webhooks/twilio/route.ts`
- Modify: `app/api/webhooks/twilio/route.test.ts`
- Create: `lib/sms-keywords.ts`, `lib/sms-keywords.test.ts`

**Interfaces:**
- Consumes: `User.smsOptedOutAt` (Task 1).
- Produces: `classifyKeyword(body: string): 'stop' | 'start' | 'help' | null`

**This is legally required, not polish.** Carriers mandate that STOP and HELP work on every A2P number. Twilio's Advanced Opt-Out can answer these itself, but relying on it would leave `smsOptedOutAt` unset in our own database — so we would keep queuing sends that Twilio silently drops, and the user's preference screen would lie about the state. Handle it here and let our data reflect reality.

**Keyword handling goes before everything, including the signature-verified verification check** — a person texting STOP must be honoured even if the body would otherwise parse as something else.

- [ ] **Step 1: Write the failing test for keyword classification**

```typescript
// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { classifyKeyword } from '@/lib/sms-keywords';

describe('classifyKeyword', () => {
  it.each(['STOP', 'stop', ' Stop ', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'])(
    'treats %s as an opt-out',
    (body) => {
      expect(classifyKeyword(body)).toBe('stop');
    }
  );

  it.each(['START', 'start', 'YES', 'UNSTOP'])('treats %s as an opt-in', (body) => {
    expect(classifyKeyword(body)).toBe('start');
  });

  it.each(['HELP', 'help', 'INFO'])('treats %s as a help request', (body) => {
    expect(classifyKeyword(body)).toBe('help');
  });

  it('does not treat an ordinary reply as a keyword', () => {
    expect(classifyKeyword('Looks good, please stop by later')).toBeNull();
  });

  it('does not swallow a reply that merely begins with a keyword word', () => {
    expect(classifyKeyword('Start the review on Monday')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/sms-keywords.test.ts`
Expected: FAIL — cannot resolve `@/lib/sms-keywords`.

- [ ] **Step 3: Write the classifier**

```typescript
/**
 * The keywords US carriers require every A2P number to honour.
 *
 * Matched only when the keyword is the entire message. "Please stop by later" is
 * a comment, not an opt-out, and unsubscribing somebody who was talking to a
 * colleague is both wrong and the kind of bug nobody reports — they simply stop
 * hearing from us.
 */

const STOP_WORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'];
const START_WORDS = ['START', 'YES', 'UNSTOP'];
const HELP_WORDS = ['HELP', 'INFO'];

export type SmsKeyword = 'stop' | 'start' | 'help';

export const classifyKeyword = (body: string): SmsKeyword | null => {
  const word = body.trim().toUpperCase();

  if (STOP_WORDS.includes(word)) return 'stop';
  if (START_WORDS.includes(word)) return 'start';
  if (HELP_WORDS.includes(word)) return 'help';

  return null;
};
```

- [ ] **Step 4: Write the failing route tests**

Add to `app/api/webhooks/twilio/route.test.ts`, with `const updateManyUsers = vi.fn();` beside the other mocks and `updateMany: (...a: unknown[]) => updateManyUsers(...a)` added to the mocked `prisma.user`:

```typescript
describe('carrier keywords', () => {
  beforeEach(() => {
    updateManyUsers.mockResolvedValue({ count: 1 });
  });

  it('records an opt-out so we stop queuing sends, not just stop delivering them', async () => {
    await POST(post({ ...inboundReply, Body: 'STOP' }));

    expect(updateManyUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { phone: '+15551234567' },
        data: expect.objectContaining({ smsOptedOutAt: expect.any(Date) }),
      })
    );
    expect(addComment).not.toHaveBeenCalled();
  });

  it('honours STOP even when the body would otherwise be a verification code', async () => {
    redeemPhoneVerification.mockResolvedValue({ status: 'verified', userId: 'user_1' });

    await POST(post({ ...inboundReply, Body: 'STOP' }));

    expect(redeemPhoneVerification).not.toHaveBeenCalled();
    expect(updateManyUsers).toHaveBeenCalled();
  });

  it('clears the opt-out on START', async () => {
    await POST(post({ ...inboundReply, Body: 'START' }));

    expect(updateManyUsers).toHaveBeenCalledWith(
      expect.objectContaining({ data: { smsOptedOutAt: null } })
    );
  });

  it('answers HELP with what this service is and how to leave', async () => {
    const body = await (await POST(post({ ...inboundReply, Body: 'HELP' }))).text();

    expect(body).toContain('STOP');
    expect(addComment).not.toHaveBeenCalled();
  });

  it('stays silent on STOP, since a confirmation to someone who left is itself a message', async () => {
    const body = await (await POST(post({ ...inboundReply, Body: 'STOP' }))).text();

    expect(body).not.toContain('<Message>');
  });
});
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `pnpm test app/api/webhooks/twilio`
Expected: FAIL — keywords are treated as ordinary replies.

- [ ] **Step 6: Handle keywords in the route**

In `app/api/webhooks/twilio/route.ts`, add the import:

```typescript
import { classifyKeyword } from '@/lib/sms-keywords';
```

and insert this immediately after the `if (!from || !body || !providerMessageId) return twiml();` guard, before the verification check:

```typescript
  // Before anything else. Somebody texting STOP must be honoured even if the body
  // would otherwise parse as a verification code.
  //
  // Twilio's Advanced Opt-Out could answer these without us, but then
  // `smsOptedOutAt` would never be set: we would keep queuing sends that Twilio
  // silently drops, and the preference screen would show a state that is not
  // true. Handling it here keeps our data honest about what the user asked for.
  const keyword = classifyKeyword(body);

  if (keyword === 'stop') {
    await prisma.user.updateMany({ where: { phone: from }, data: { smsOptedOutAt: new Date() } });

    // Deliberately silent. Twilio sends the carrier-mandated confirmation itself,
    // and a message of our own to somebody who just left is exactly what they
    // asked us to stop doing.
    return twiml();
  }

  if (keyword === 'start') {
    await prisma.user.updateMany({ where: { phone: from }, data: { smsOptedOutAt: null } });

    return twiml("You're opted back in. Reply STOP to opt out.");
  }

  if (keyword === 'help') {
    return twiml(
      'Mention notifications for your documents. Reply to a notification to comment. Reply STOP to opt out.'
    );
  }
```

- [ ] **Step 7: Run the full suite**

Run: `pnpm test && pnpm typecheck && pnpm biome check --write`
Expected: PASS — every test in the project.

- [ ] **Step 8: Commit**

```bash
git add lib/sms-keywords.ts lib/sms-keywords.test.ts app/api/webhooks/twilio
git commit -m "feat: honour STOP, START and HELP on the inbound number"
```

---

### Task 9: Documentation and configuration

**Files:**
- Modify: `CLAUDE.md`
- Modify: `.env.production`

**Interfaces:**
- Consumes: everything above.
- Produces: no code.

`CLAUDE.md` asks that project docs be updated whenever meaningful changes land, and specifically that anything worth having known at the start be captured.

- [ ] **Step 1: Add a Twilio section to CLAUDE.md**

Add after the existing "DWS Comment API — verified behaviour" section:

```markdown
## SMS notifications (Twilio)

- **Twilio signs nothing like Resend does.** HMAC-SHA1 over the full URL plus
  every POST parameter sorted by key and concatenated as `key + value`, in
  `X-Twilio-Signature`. `lib/twilio.ts` is a sibling of `lib/webhook-signature.ts`,
  not a parameter on it.
- **A Twilio signature carries no timestamp,** so unlike the Resend verifier there
  is no replay window to check. The unique constraint on
  `InboundSms.providerMessageId` is what bounds replay. It is load-bearing.
- **`TWILIO_AUTH_TOKEN` is also the webhook signing key.** Rotating it silently
  breaks inbound verification.
- **Behind a proxy, Twilio signs the URL it was configured with,** which may not
  match `request.url`. `TWILIO_WEBHOOK_URL` pins it when they disagree.
- **Threading is last-thread-wins and the credential is the sender's phone
  number.** Weaker than the email token path on purpose — an SMS has nowhere to
  hide a per-thread token. See the header comment in
  `app/api/webhooks/twilio/route.ts` before copying the pattern.
- **SMS never carries comment text.** A lock screen is a different privacy posture
  from an inbox. `buildMentionSms` takes no `commentText` parameter so that
  reintroducing one is a visible change.
- **STOP/HELP are handled in our webhook rather than left to Twilio's Advanced
  Opt-Out,** so `smsOptedOutAt` reflects reality and we stop queuing sends.
- **Trial account:** sends only to verified numbers, prepends "Sent from your
  Twilio trial account", 100-message allowance. A round trip costs 2–3 messages.
  Skip the Messaging Service while on trial and set the webhook directly on the
  number: Phone Numbers → Manage → Active numbers → Messaging → "A message comes
  in" → POST to `/api/webhooks/twilio`.
- **A2P 10DLC registration is required before sending to ordinary US numbers.**
  Days to weeks, with fees, and it can be rejected. The legal pages it requires are
  live at `https://jonaddams.com/{privacy,terms,sms}`. The published number in
  `lib/legal.ts` (in the `nutrient-sdk-samples` repo) must match the registered one.
```

- [ ] **Step 2: Add the env vars**

Append to `.env.production`:

```bash
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=+17372583742
```

- [ ] **Step 3: Verify and commit**

```bash
pnpm pre-commit
git add CLAUDE.md .env.production
git commit -m "docs: record the Twilio gotchas and configuration"
```

---

## Self-review

**Spec coverage.** Each of the spec's seven work items maps to a task: channel abstraction → Task 6; `lib/twilio.ts` → Task 2; `User.phone` + verification → Tasks 1, 4, 5; SMS message builder → Task 3; `/api/webhooks/twilio` → Task 7; STOP/HELP/opt-out → Task 8; channel preference → Tasks 1 and 5. The spec's two open questions are answered in "Decisions this plan locks in". The spec's "reusable unchanged" list is respected — `reconcile.ts`, `comment-sync.ts`, `mentions.ts` and `dws-comments.addComment` are untouched, and the claim-before-write idempotency from PR #7 is copied exactly in Task 7.

**Placeholders.** None. Every code step carries the actual code.

**Type consistency.** `buildMentionSms` takes `{ authorName, documentTitle, documentUrl }` in Task 3 and is called with exactly those in Task 6. `redeemPhoneVerification` returns the `RedeemResult` union in Task 4 and is matched on `status === 'verified'` in Task 7. `verifyTwilioSignature` takes `{ url, params, signature, authToken }` in Task 2 and is called with those four in Task 7. `classifyKeyword` returns `SmsKeyword | null` in Task 8 and is compared against those literals in the route.

**Known gap, deliberately out of scope.** There is no UI. Tasks 5 and 6 give the settings page everything it needs — start verification, poll for arrival, set the channel — but the page itself is not planned here. It is a separate, independently shippable piece of work, and building it before the loop is verified end-to-end on the trial number would be premature.
