'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CONSENT_DISCLOSURES, PROGRAM_LEGAL_URLS, PROGRAM_NAME } from '@/lib/sms-program';

type Channel = 'EMAIL' | 'SMS' | 'BOTH';

type NotificationSettingsProps = {
  initialPhone: string | null;
  initialVerified: boolean;
  initialChannel: Channel;
  /** Already formatted for display by `formatProgramNumber`. */
  programNumber: string;
};

const CHANNEL_OPTIONS: ReadonlyArray<{ value: Channel; label: string; hint: string }> = [
  { value: 'EMAIL', label: 'Email only', hint: 'The default. No texts are sent.' },
  { value: 'SMS', label: 'Text only', hint: 'Requires a registered number.' },
  { value: 'BOTH', label: 'Both email and text', hint: 'Requires a registered number.' },
];

/** How often the page asks whether the inbound text has arrived yet. */
const POLL_INTERVAL_MS = 5000;

/**
 * The opt-in surface for text notifications — "Settings → Notifications".
 *
 * This screen is the program's Call-to-Action. A carrier reviewing the A2P
 * campaign asks to see where consent is given and what it says, and the second
 * submission was rejected on that check because this screen did not exist: the
 * backend was complete, the published page described the flow, and there was no
 * page to walk through or screenshot. So the disclosures here are not decoration
 * — they are the artefact under review, and they must match
 * https://jonaddams.com/sms.
 *
 * Registration is deliberately inbound. The page shows a short code and the
 * number to text it to; the number is learned from the message that arrives.
 * Nobody is ever asked to type a phone number, so a number cannot be registered
 * by anyone but the person holding the handset — and the inbound message is the
 * consent record an audit wants to see. Nothing in the browser learns that the
 * text arrived, hence the poll.
 */
export function NotificationSettings({
  initialPhone,
  initialVerified,
  initialChannel,
  programNumber,
}: NotificationSettingsProps) {
  const [phone, setPhone] = useState(initialPhone);
  const [verified, setVerified] = useState(initialVerified);
  const [channel, setChannel] = useState<Channel>(initialChannel);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  // Held in a ref so the polling effect does not restart on every render.
  const isAwaitingText = code !== null && !verified;
  const awaitingRef = useRef(isAwaitingText);
  awaitingRef.current = isAwaitingText;

  const checkStatus = useCallback(async () => {
    const response = await fetch('/api/user/phone');

    if (!response.ok) {
      return;
    }

    const status: { phone: string | null; verified: boolean } = await response.json();

    if (status.verified) {
      setPhone(status.phone);
      setVerified(true);
      setCode(null);
      setError(null);
    }
  }, []);

  useEffect(() => {
    if (!isAwaitingText) {
      return;
    }

    const interval = setInterval(() => {
      if (awaitingRef.current) {
        void checkStatus();
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isAwaitingText, checkStatus]);

  const startRegistration = async () => {
    setIsBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/user/phone', { method: 'POST' });

      if (!response.ok) {
        setError('Could not start registration. Please try again.');
        return;
      }

      const started: { code: string } = await response.json();
      setCode(started.code);
    } catch {
      setError('Could not start registration. Please try again.');
    } finally {
      setIsBusy(false);
    }
  };

  const forgetNumber = async () => {
    setIsBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/user/phone', { method: 'DELETE' });

      if (!response.ok) {
        setError('Could not remove that number. Please try again.');
        return;
      }

      setPhone(null);
      setVerified(false);
      setCode(null);
      // Texts can no longer be delivered, so the channel falls back rather than
      // pointing at a number that is gone.
      setChannel('EMAIL');
    } finally {
      setIsBusy(false);
    }
  };

  const chooseChannel = async (next: Channel) => {
    setError(null);

    const response = await fetch('/api/user/notification-channel', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: next }),
    });

    if (!response.ok) {
      const body: { error?: string } = await response.json();
      setError(body.error ?? 'Could not change where notifications go.');
      return;
    }

    setChannel(next);
  };

  return (
    <section className="bg-background border border-border rounded-lg p-4 sm:p-6 space-y-6">
      <div>
        <h2 className="text-lg font-medium text-foreground">Text notifications</h2>
        <p className="mt-1 text-sm text-muted">
          {verified
            ? `${PROGRAM_NAME} can text this number.`
            : `Text notifications are off. ${PROGRAM_NAME} never texts a number until that number has texted us first.`}
        </p>
      </div>

      <div className="space-y-2 text-sm text-muted">
        {CONSENT_DISCLOSURES.map((disclosure) => (
          <p key={disclosure}>{disclosure}</p>
        ))}
        <p>
          See the{' '}
          <a
            href={PROGRAM_LEGAL_URLS.terms}
            className="text-primary hover:text-primary-hover underline"
          >
            terms of service
          </a>{' '}
          and the{' '}
          <a
            href={PROGRAM_LEGAL_URLS.privacy}
            className="text-primary hover:text-primary-hover underline"
          >
            privacy policy
          </a>
          .
        </p>
      </div>

      {error ? (
        <p className="text-sm text-error" role="alert">
          {error}
        </p>
      ) : null}

      {verified && phone ? (
        <div className="space-y-3">
          <p className="text-sm text-foreground">
            <span className="font-medium">Registered:</span>{' '}
            <span className="font-mono">{phone}</span>
          </p>
          <button
            type="button"
            onClick={forgetNumber}
            disabled={isBusy}
            className="inline-flex items-center px-3 py-2 border border-border text-sm font-medium rounded-md text-foreground bg-surface hover:bg-surface-hover transition-colors cursor-pointer disabled:opacity-50"
          >
            Forget this number
          </button>
        </div>
      ) : code ? (
        <div className="space-y-3">
          <p className="text-sm text-foreground">
            From the mobile number you want to register, text this code to{' '}
            <span className="font-medium">{programNumber}</span>:
          </p>
          <p className="font-mono text-3xl tracking-widest text-foreground">{code}</p>
          <p className="text-sm text-muted">
            The code is good for 10 minutes and can only be used once. We will reply once to
            confirm.
          </p>
          <button
            type="button"
            onClick={checkStatus}
            className="inline-flex items-center px-3 py-2 border border-border text-sm font-medium rounded-md text-foreground bg-surface hover:bg-surface-hover transition-colors cursor-pointer"
          >
            Check now
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={startRegistration}
          disabled={isBusy}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-primary-foreground bg-primary hover:bg-primary-hover transition-colors cursor-pointer disabled:opacity-50"
        >
          Set up text notifications
        </button>
      )}

      <fieldset className="space-y-3 border-t border-border pt-4">
        <legend className="text-sm font-medium text-foreground">
          Where should notifications go?
        </legend>
        {CHANNEL_OPTIONS.map((option) => (
          <label key={option.value} className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="notification-channel"
              value={option.value}
              checked={channel === option.value}
              onChange={() => chooseChannel(option.value)}
              className="mt-1 cursor-pointer"
            />
            <span>
              <span className="block text-sm text-foreground">{option.label}</span>
              <span className="block text-xs text-subtle">{option.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </section>
  );
}
