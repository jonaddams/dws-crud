# A2P 10DLC campaign — third submission

The second submission was rejected on two checks: **invalid sample message
content** and **failure to verify the Call to Action**. The carrier gave no
detail about which answer failed, so this is a diagnosis, not a transcript.

Everything in the "file this" sections below is generated from
`lib/sms-program.ts` rather than retyped, because the recurring cause of these
rejections is drift between three things that a reviewer compares:

1. the sample messages filed with the campaign,
2. the examples published at <https://jonaddams.com/sms>, and
3. what the application actually sends.

## What was wrong

### The Call to Action could not be verified

The published page told a reviewer to *"sign in to bindery.jonaddams.com with
your Google account, open Settings → Notifications"*, and both halves failed.

- **Sign-in refuses them.** Access is restricted to `nutrient.io` and
  `pspdfkit.com` addresses (`isAllowedEmailDomain` in `lib/auth-config.ts`). A
  reviewer's own Google account is rejected, and the page never said access was
  restricted — so the instruction was an invitation to a dead end.
- **The screen did not exist.** There was no `/settings` route, no notifications
  UI, and nothing anywhere in the application rendered a verification code. The
  registration *backend* was complete, which is what made this easy to miss.
- **The page carried an unreplaced placeholder**, live and public:
  `[ Screenshot of the Settings → Notifications opt-in screen goes here before
  the campaign is submitted. ]`
- **The page's example mention message disagreed with the code and the filing** —
  it said "mentioned you in a comment on", dropped "Reply to add a comment.",
  dropped the document link, and used curly quotes. The code and the filing
  agreed with each other; the page was the one that had drifted.

### The sample messages

- Sample #2 is the **opt-in confirmation** — the message a reviewer reads as the
  consent receipt — and it disclosed neither message frequency nor that rates may
  apply. The published page carried both; the message did not, and the message is
  what was filed.
- Sample #4 was *"That code has expired. Please request a new one."* It
  illustrates nothing about the campaign's stated use case, carries no opt-out,
  and reads as a one-time-passcode utility message, which invites a mixed
  use-case objection.

## What changed in the application

- **`/settings` now exists** (`app/settings/page.tsx`,
  `components/notification-settings.tsx`) and is linked from the header on every
  page. It shows the single-use code, the number to text it to, the registration
  status, the channel choice, and every consent disclosure.
- **The consent disclosures and the legal links live in `lib/sms-program.ts`**
  (`CONSENT_DISCLOSURES`, `PROGRAM_LEGAL_URLS`) next to the message copy, under
  the same "must match the filing" constraint.
- **`REGISTERED_MESSAGE` now carries the frequency and rates disclosures.** It
  was reworded rather than extended: appending them took it to 188 characters and
  a second GSM segment. It now sits at 150.
- **There is deliberately no phone-number input.** The number is learned from the
  inbound text, so nobody can register a number they do not hold, and a test
  asserts no textbox is rendered.

## File this: sample messages

Generated from the constants. Each is one GSM-7 segment.

**Sample 1 — mention notification** (148 chars)

```
Bindery: Alice Example mentioned you on "Q3 Contract". Reply to add a comment. https://bindery.jonaddams.com/documents/abc123 Reply STOP to opt out.
```

**Sample 2 — opt-in confirmation** (150 chars)

```
Bindery: You're registered. Get a text when someone mentions you. Msg frequency varies. Msg&data rates may apply. Reply HELP for help, STOP to cancel.
```

**Sample 3 — HELP reply** (137 chars)

```
Bindery: Mention notifications for your documents. Reply to a notification to comment. Msg & data rates may apply. Reply STOP to opt out.
```

**Sample 4 — already registered** (80 chars)

```
Bindery: Your number is already registered. Reply HELP for help, STOP to cancel.
```

Sample 4 replaces the code-expiry message. It is a real message the program
sends, it is representative of the registration flow, and it carries both
keywords.

## File this: number

```
+1 269 292-5337
```

This must be the number registered to the campaign, and it must match
`TWILIO_PHONE_NUMBER` and the number published on the page. The opt-in screen
renders it from the environment through `formatProgramNumber`, so the screen
cannot disagree with what the app receives on.

## Fix this: the published page

The page is rendered from `LEGAL` in `lib/legal.ts` of the `nutrient-sdk-samples`
repository. Three changes:

1. **Replace the screenshot placeholder** with a real screenshot of
   `/settings`, showing the code, the number, and the disclosures.
2. **Correct the example mention message** to match the filing exactly:

   ```
   Bindery: Alice Example mentioned you on "Q3 Contract". Reply to add a comment. https://bindery.jonaddams.com/documents/abc123 Reply STOP to opt out.
   ```

   Straight quotes, not curly — the page currently uses `“ ”`.
3. **Say that sign-in is restricted.** A reviewer following the instructions will
   be refused, and an unexplained dead end reads worse than a documented
   limitation. Suggested wording:

   > Bindery is an internal application for Nutrient staff, so sign-in is
   > limited to `nutrient.io` and `pspdfkit.com` accounts. The opt-in screen is
   > shown below; contact support@jonaddams.com for a walkthrough.

## Before submitting, check the three-way match

- [ ] Each filed sample is byte-identical to its constant in `lib/sms-program.ts`
- [ ] The page's example messages are byte-identical to the filed samples
- [ ] The published number equals `TWILIO_PHONE_NUMBER` and the campaign's number
- [ ] The screenshot is real and shows the disclosures
- [ ] `PROGRAM_NAME` is still `Bindery` in the code, on the page, and in the filing
- [ ] The page no longer instructs a reviewer to do something that will fail

## Still open

The page lives in a different repository from the constants, which is how the
wording drifted twice. Worth a test that fetches <https://jonaddams.com/sms> and
asserts its examples match the constants — otherwise the next edit to either side
can silently break the match again.
