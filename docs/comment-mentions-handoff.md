# Comment mentions with email round-trip — handoff

Written 2026-08-21. State of the feature at `main` = `e61b872`.

Mention someone on a document, they get an email, they reply to the email, and
the reply lands in the comment thread. DWS is the system of record for comment
content throughout.

This is a **reference implementation**, not production software. The code is the
artifact people will copy, so the patterns are meant to be correct even where the
operations are not hardened.

---

## Start here: the one thing blocking completion

**`NUTRIENT_API_KEY` in Vercel production cannot write comments.** DWS answers the
comment POST with `403 Forbidden`.

This is a key problem, not a code problem. The key in `.env.local` performs the
identical POST against the same document and thread and gets `200`. Replace the
production key with one that has annotation and comment write access:

```
vercel env add NUTRIENT_API_KEY production --sensitive --force --yes --value "<key>"
```

Until then an emailed reply gets through signature verification, token lookup,
body retrieval and signature stripping, and fails on the final write.

**To verify once fixed:** send a mail to a live reply address and check the
thread.

```bash
# any reply address from thread_reply_tokens
curl -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer $RESEND_KEY" -H "Content-Type: application/json" \
  -d '{"from":"jon@jonaddams.com","to":["reply+<token>@jonaddams.com"],
       "subject":"Re: test","text":"Looks good."}'
```

Then read the thread back and expect a second comment, `createdBy` set to the
token's owner and `customData.source` = `"email"`.

---

## How it works

DWS has **no webhooks** — confirmed by reading the whole OpenAPI spec. So the
browser sends a hint saying only *"document X changed"*, with no body, and the
server re-reads DWS to find out what actually happened. A browser therefore
cannot invent a mention or cause an email to anyone it names.

The same reconcile handles every origin — typed in the viewer, posted through the
API, or arrived by email — so there is one notification path rather than one per
channel.

```
viewer comment ─┐
API comment ────┼─→ DWS ─→ reconcile ─→ mentions ─→ email (reply+token@…)
email reply ────┘                                        │
      ▲                                                  │
      └──────── webhook ← Resend ←──────────────────────┘
```

Postgres holds only what DWS cannot answer cheaply: who was mentioned where,
whether they have been told, and which thread an inbound email belongs to.

### The pieces

| File | Does |
| --- | --- |
| `lib/dws-comments.ts` | Typed wrapper over the DWS comment endpoints |
| `lib/mentions.ts` | Who a comment names — SDK list, else conservative text match |
| `lib/reconcile.ts` | Pure diff: what is new, who it mentions |
| `lib/comment-sync.ts` | IO shell around the planner |
| `lib/reply-token.ts` | Opaque base32 reply-address tokens |
| `lib/mention-email.ts` | The notification, HTML-escaped |
| `lib/resend.ts` | Send, and fetch an inbound body |
| `lib/email-reply.ts` | Strip quotes and signatures from a reply |
| `lib/webhook-signature.ts` | Svix verification with replay protection |
| `app/api/webhooks/resend/route.ts` | Where an emailed reply re-enters |
| `app/api/documents/[id]/sync-comments/route.ts` | The client hint |
| `app/api/mentionable-users/route.ts` | Directory for the mention menu |

---

## Decisions worth not re-litigating

- **`From:` is never trusted.** An inbound reply is attributed by the unguessable
  per-(thread, recipient) token in the recipient address. A test asserts a reply
  claiming to be from `attacker@evil.example` is still credited to the token's
  owner.
- **Identifiers cannot live in the reply address.** An email local part is capped
  at 64 characters and the IDs run to about 77, so the token is opaque with a
  database lookup. It is base32, not base64url, because mail systems change the
  case of local parts.
- **Only existing app users are mentionable.** No guests, no invites.
- **SMS is out.** Email carries `In-Reply-To`; SMS carries a phone number and a
  body, so threading would have to be guessed. It is a documented seam.
- **Signature stripping is a heuristic** and cannot be made exact. It cuts at a
  line of nothing but punctuation and symbols, guarded so an ellipsis, an emoji
  row, or inline dashes survive.

---

## Bugs found along the way, and what they teach

Four of these were silent — the system reported success while losing data. That
pattern is the main lesson.

1. **`.env.production` shadowed real Vercel values.** A committed env file that
   Next loads in the production runtime can outrank platform config. Emptied of
   placeholders.
2. **`PrismaPg` was handed a `pg.Pool`.** Under pnpm the adapter resolves its own
   `pg`, does not recognise ours, treats the Pool as a config object, and dies at
   protocol startup reporting `DatabaseNotReachable` against 127.0.0.1 — a host
   that was never involved. Pass `{ connectionString }`.
3. **The inbound webhook never read the body.** Resend's `email.received` carries
   metadata only. The handler read a `text` field that does not exist, discarded
   every reply, and returned 200. *The tests passed because the fixture invented
   that field.* A handwritten fixture for a third-party payload is worth exactly
   as much as the assumption behind it — check it against a captured event via
   `GET /webhooks/{id}/events/{eventId}`.
4. **A failed write swallowed the reply forever.** The message ID was claimed
   before the write; when the write failed the claim survived, so Resend's retry
   was turned away as "already processed". Claim-before-write is right; keeping
   the claim after a write that never happened is not.
5. **Migrations were unrunnable.** Prisma 7 moved the datasource URL out of
   `schema.prisma` and no `prisma.config.ts` existed.

---

## Known gaps

- No UI for starting a comment thread from selected text; threads are created via
  the API.
- Notifications send inline on the sync request. No queue, no retry backoff.
- No rate limiting on the sync-comments hint endpoint.
- No bounce handling.
- The comment block in `.env.production` explains the localhost failure as being
  caused by those placeholders. **That explanation is wrong** — see bug 2. The
  advice in the file is still right; the reasoning needs correcting.
- `EMAIL_FROM`, `EMAIL_REPLY_DOMAIN` and `NEXT_PUBLIC_APP_URL` were marked
  Sensitive in Vercel unnecessarily, so `vercel env pull` cannot read them back.
  Preview is missing most email vars.
- This grew from a spike and never got a written spec.

## Backlog beyond this feature

Raised 2026-08-21, not started. These are about the project as a whole rather
than comment mentions.

- **Rename the project.** "CRUD" reads as jargon and undersells what this is —
  developers know the term, but it is a poor name for something shown to
  prospects. Touches the repo name, the Vercel project, `package.json` (`decrud`),
  the page title in `app/layout.tsx` ("Nutrient API CRUD App"), and the docs.
- **Update the visual style.** The UI is functional create-next-app plus Tailwind.
  For something whose job is to impress prospects, the design is doing no work.
- **Replace NextAuth with BetterAuth.** Currently NextAuth v4 with the Prisma
  adapter and database sessions. Worth planning carefully: `lib/auth-config.ts`,
  `lib/auth.ts`, the `Account`/`Session`/`User`/`VerificationToken` tables, the
  `role` and `currentImpersonationMode` fields, the admin impersonation flow, and
  the session augmentation duplicated across `global.d.ts` and
  `types/next-auth.d.ts` all depend on it. The DWS session's `user_id` comes from
  the signed-in user, so comment attribution rides on whatever replaces it.

## Test data left in production

The recipe document (`cmfzwrxpn0006l104cyr15uxv`, DWS
`7KVBXBY7KR1E3VFQYS4ZDDXVKX`) carries two test comment threads and assorted probe
comments. Two test notification emails were sent to `jon.addams@nutrient.io`.
Worth clearing before showing this to anyone.
