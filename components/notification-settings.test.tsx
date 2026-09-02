import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONSENT_DISCLOSURES, PROGRAM_LEGAL_URLS } from '@/lib/sms-program';

const { NotificationSettings } = await import('@/components/notification-settings');

type Call = { url: string; method: string; body?: string };

let calls: Call[] = [];
let phoneStatus: { phone: string | null; verified: boolean };

const fetchMock = vi.fn((input: unknown, init?: { method?: string; body?: string }) => {
  const url = String(input);
  const method = init?.method ?? 'GET';
  calls.push({ url, method, body: init?.body });

  if (url === '/api/user/phone' && method === 'POST') {
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          code: 'H7K2',
          expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        }),
    });
  }

  if (url === '/api/user/phone' && method === 'GET') {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(phoneStatus) });
  }

  if (url === '/api/user/phone' && method === 'DELETE') {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
  }

  if (url === '/api/user/notification-channel') {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
  }

  return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'unexpected' }) });
});

const renderUnregistered = () =>
  render(
    <NotificationSettings
      initialPhone={null}
      initialVerified={false}
      initialChannel="EMAIL"
      programNumber="+1 269 292-5337"
    />
  );

const renderRegistered = () =>
  render(
    <NotificationSettings
      initialPhone="+12695550143"
      initialVerified={true}
      initialChannel="SMS"
      programNumber="+1 269 292-5337"
    />
  );

beforeEach(() => {
  calls = [];
  phoneStatus = { phone: null, verified: false };
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('What a carrier reviewer has to be able to see', () => {
  it('states every consent disclosure on the screen where consent is given', () => {
    // This is the Call-to-Action evidence. The campaign was rejected because
    // this screen did not exist, so there was nothing to screenshot. Each of
    // these has to be visible next to the opt-in action, not buried elsewhere.
    renderUnregistered();

    for (const disclosure of CONSENT_DISCLOSURES) {
      expect(screen.getByText(disclosure)).toBeInTheDocument();
    }
  });

  it('links the terms and the privacy policy from the consent surface itself', () => {
    renderUnregistered();

    expect(screen.getByRole('link', { name: /terms/i })).toHaveAttribute(
      'href',
      PROGRAM_LEGAL_URLS.terms
    );
    expect(screen.getByRole('link', { name: /privacy/i })).toHaveAttribute(
      'href',
      PROGRAM_LEGAL_URLS.privacy
    );
  });

  it('names the program and says texts are off until you act', () => {
    renderUnregistered();

    expect(screen.getByRole('heading', { name: /text notifications/i })).toBeInTheDocument();
    expect(screen.getByText(/off/i)).toBeInTheDocument();
  });
});

describe('Registering a number', () => {
  it('asks the server for a code and shows it with the number to text it to', async () => {
    renderUnregistered();

    await userEvent.click(screen.getByRole('button', { name: /set up text notifications/i }));

    await waitFor(() => expect(screen.getByText('H7K2')).toBeInTheDocument());
    expect(screen.getByText('+1 269 292-5337')).toBeInTheDocument();
    expect(calls).toContainEqual(
      expect.objectContaining({ url: '/api/user/phone', method: 'POST' })
    );
  });

  it('never asks the reader to type their phone number', async () => {
    // Registration is inbound by design: the number is learned from the message
    // that arrives, so nobody can register a number they do not hold. A text
    // input here would quietly undo that, and the published page promises it.
    renderUnregistered();

    await userEvent.click(screen.getByRole('button', { name: /set up text notifications/i }));
    await waitFor(() => expect(screen.getByText('H7K2')).toBeInTheDocument());

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('notices when the code has been texted in and reports success', async () => {
    renderUnregistered();

    await userEvent.click(screen.getByRole('button', { name: /set up text notifications/i }));
    await waitFor(() => expect(screen.getByText('H7K2')).toBeInTheDocument());

    phoneStatus = { phone: '+12695550143', verified: true };

    await userEvent.click(screen.getByRole('button', { name: /check now/i }));

    // The number the text arrived from is what gets registered — it was never
    // typed in here.
    await waitFor(() => expect(screen.getByText('+12695550143')).toBeInTheDocument());
    expect(screen.queryByText('H7K2')).not.toBeInTheDocument();
  });

  it('reports a failure to start rather than showing a code that does not exist', async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'boom' }) })
    );
    renderUnregistered();

    await userEvent.click(screen.getByRole('button', { name: /set up text notifications/i }));

    await waitFor(() =>
      expect(screen.getByText(/could not start|something went wrong/i)).toBeInTheDocument()
    );
    expect(screen.queryByText('H7K2')).not.toBeInTheDocument();
  });
});

describe('Once a number is registered', () => {
  it('shows the registered number and offers to forget it', async () => {
    renderRegistered();

    expect(screen.getByText('+12695550143')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /forget this number/i }));

    await waitFor(() =>
      expect(calls).toContainEqual(
        expect.objectContaining({ url: '/api/user/phone', method: 'DELETE' })
      )
    );
  });

  it('lets the reader choose where notifications go', async () => {
    renderRegistered();

    await userEvent.click(screen.getByRole('radio', { name: /both/i }));

    await waitFor(() =>
      expect(calls).toContainEqual(
        expect.objectContaining({
          url: '/api/user/notification-channel',
          method: 'PATCH',
          body: JSON.stringify({ channel: 'BOTH' }),
        })
      )
    );
  });

  it('explains the refusal when text delivery is chosen without a verified number', async () => {
    // The API answers 409 for this rather than creating a state where every
    // notification is silently dropped. The screen has to say why.
    fetchMock.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: 'Verify a phone number first' }),
      })
    );

    render(
      <NotificationSettings
        initialPhone={null}
        initialVerified={false}
        initialChannel="EMAIL"
        programNumber="+1 269 292-5337"
      />
    );

    await userEvent.click(screen.getByRole('radio', { name: /^text/i }));

    await waitFor(() =>
      expect(screen.getByText(/verify a phone number first/i)).toBeInTheDocument()
    );
  });
});
