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

## File this: "How do end-users consent to receive messages?"

This is TCR's `MESSAGE_FLOW` field. It is **text only — there is no image
upload**, which is why the screenshot has to live on a public page and be linked
from here. A link on its own is not enough either: reviewers expect the flow
described in the field, and a bare URL is a documented rejection cause. So the
text below both describes the flow and points at the page.

`Settings > Notifications` uses an ASCII `>` on purpose; the arrow character
does not survive every form.

**Do not file this until the screenshot is actually live on the page.** The text
asserts that a screenshot is published there, and asserting evidence that is not
present is precisely what failed the last two submissions. Land the page change
first, load `https://jonaddams.com/sms`, confirm the image is visible, then file.

### Twilio's automated pre-check objects to this flow

Before submitting, Twilio's own checker raised a **warning** (amber, not a
blocking error — "Submit registration" stayed enabled):

> Your opt-in form doesn't have a phone number field connected to SMS consent.
> Add a phone number field on the same form as the SMS consent checkbox so it's
> clear consumers are giving that number permission to receive texts.

The checker is pattern-matching for the common web-form opt-in: a page with a
phone input and a consent checkbox. This program does not have one, on purpose.

**Do not "fix" this by adding a phone field and a consent checkbox.** It would
be a real regression, not a compliance improvement:

- The consent model here is **mobile-originated (MO)**: the consumer's own
  outbound text from their handset is the consent record. That is stronger
  evidence than a checkbox next to a typed number, because a typed number can
  belong to somebody else.
- `https://jonaddams.com/sms` publishes the promise that "you are never asked to
  type a phone number into a form".
- A test in `components/notification-settings.test.tsx` asserts no textbox
  renders, precisely so this cannot be undone quietly.

The answer is to say so in the reviewer's vocabulary — name the opt-in as MO,
and state explicitly that there is no form, no phone field and no checkbox, and
why. Then click **Recheck Campaign**. If the warning persists it is heuristic,
and submitting is still reasonable: MO opt-in is a recognised consent method.

Keep the field ASCII. `Settings > Notifications` uses `>` rather than an arrow,
and there are no em-dashes, because neither survives every form.

**Full version (1412 characters):**

```
This is a mobile-originated (MO) opt-in: the consumer sends us the first message, and Bindery never sends to an unconfirmed number. There is deliberately no web opt-in form, and therefore no phone number field and no SMS consent checkbox - the consumer's own outbound text from the handset is the consent record, which is why no number is ever typed into a form and a number cannot be registered by anyone other than the person holding it. The flow: a signed-in user opens Settings > Notifications at bindery.jonaddams.com, where a four-character single-use code is displayed together with our number, +1 269 292-5337. The user texts that code from the mobile number they want to register. We match the code to their account and reply once to confirm, storing the number, the message and the time it arrived. That screen states the program name, that messages relate only to documents the user already has access to, that message frequency varies, that message and data rates may apply, that STOP opts out and HELP gets help, and that consent is not a condition of use; it also links our terms of service and privacy policy. The flow, the disclosures and a screenshot of that screen are published at https://jonaddams.com/sms. Bindery is an internal application, so sign-in is restricted to nutrient.io and pspdfkit.com accounts and a reviewer cannot self-register; email support@jonaddams.com for a walkthrough.
```

**Short version (1000 characters)**, if the field rejects the above:

```
This is a mobile-originated (MO) opt-in: the consumer sends the first message, and Bindery never sends to an unconfirmed number. There is deliberately no web opt-in form, so there is no phone number field and no consent checkbox - the consumer's own text from the handset is the consent record, and no number is ever typed into a form. A signed-in user opens Settings > Notifications at bindery.jonaddams.com, where a four-character single-use code is shown with our number, +1 269 292-5337, and texts that code from the number they want to register; we reply once to confirm and store the number, message and time. That screen discloses the program name, message frequency, that rates may apply, STOP and HELP, and that consent is not a condition of use, and links our terms and privacy policy. Flow, disclosures and screenshot: https://jonaddams.com/sms. Sign-in is limited to nutrient.io and pspdfkit.com accounts, so a reviewer cannot self-register; email support@jonaddams.com for a walkthrough.
```

Both name the restriction on sign-in and offer a human. That matters more than it
looks: the previous submission sent a reviewer to a login they could not pass,
with no explanation and no alternative, and "could not verify" is the outcome
that gets recorded.

## File this: number

```
+1 269 292-5337
```

This must be the number registered to the campaign, and it must match
`TWILIO_PHONE_NUMBER` and the number published on the page. The opt-in screen
renders it from the environment through `formatProgramNumber`, so the screen
cannot disagree with what the app receives on.

## The published page — done, except the screenshot

Done on branch `sms-cta-fixes` of `nutrient-sdk-samples`.

The prose lives in **`app/sms/page.tsx`**, not in `lib/legal.ts` — `legal.ts`
holds only shared facts (brand, domain, number, disclosures), which is why the
placeholder was not visible there.

What changed:

1. **The screenshot placeholder is gone.** It read, publicly, *"[ Screenshot of
   the Settings → Notifications opt-in screen goes here before the campaign is
   submitted. ]"*. That slot now describes what the opt-in screen shows — the
   off-by-default state, the disclosures beside the opt-in control, the links to
   the terms and privacy policy, the single-use code and the number, and the
   absence of any phone-number field.
2. **Sign-in restriction disclosed.** The page said "sign in with your Google
   account" and nothing more, so a reviewer following it hit an unexplained
   refusal. It now names the `nutrient.io` / `pspdfkit.com` limit and offers
   `support@jonaddams.com` for a walkthrough.
3. **The example messages now render from `SAMPLE_MESSAGES` in `lib/legal.ts`**
   rather than being hand-typed prose. That is the structural fix: prose is how
   they drifted twice, and React renders a straight quote as a straight quote,
   so the `&ldquo;`/`&rdquo;` mismatch cannot recur. All four filed samples are
   shown.

**Still outstanding: a real screenshot.** It cannot be produced without a
`nutrient.io` sign-in. Drop the image at `public/bindery-sms-optin.png` and
replace the descriptive paragraph inside the `SCREENSHOT_SLOT` div with:

```tsx
<Image
  src="/bindery-sms-optin.png"
  alt={`The ${LEGAL.appName} Settings → Notifications opt-in screen, showing the single-use code, the number to text it to, and the program disclosures`}
  width={1200}
  height={800}
  style={{ width: "100%", height: "auto" }}
/>
```

Keep the descriptive paragraph underneath it as a caption; a reviewer reading
text is not worse off, and it survives an image that fails to load.

## Before submitting, check the three-way match

- [ ] Each filed sample is byte-identical to its constant in `lib/sms-program.ts`
- [ ] The page's example messages are byte-identical to the filed samples
- [ ] The published number equals `TWILIO_PHONE_NUMBER` and the campaign's number
- [ ] The screenshot is real and shows the disclosures
- [ ] `PROGRAM_NAME` is still `Bindery` in the code, on the page, and in the filing
- [ ] The page no longer instructs a reviewer to do something that will fail

## Still open

The samples are now data on both sides — `SAMPLE_MESSAGES` in
`nutrient-sdk-samples/lib/legal.ts` and the constants in `lib/sms-program.ts`
here — so neither can drift from *its own page* any more. What no build can
check is that the two repositories agree with each other, and that either agrees
with the filing.

Worth a test that fetches <https://jonaddams.com/sms> and asserts its examples
match the constants in this repo. It would have caught both rejections.
