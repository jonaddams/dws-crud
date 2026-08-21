// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendEmail } from '@/lib/resend';

const accepted = () =>
  new Response(JSON.stringify({ id: 'msg_123' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const mockFetch = (response: Response) => {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const sent = (fetchMock: ReturnType<typeof vi.fn>) => {
  const [url, init] = fetchMock.mock.calls.at(-1) ?? [];
  return {
    url: String(url),
    headers: init?.headers as Record<string, string>,
    body: JSON.parse(String(init?.body)),
  };
};

const MESSAGE = {
  to: 'bob@nutrient.io',
  subject: 'Alice mentioned you',
  text: 'plain body',
  html: '<p>html body</p>',
  replyTo: 'reply+abc123@jonaddams.com',
};

beforeEach(() => {
  vi.stubEnv('RESEND_KEY', 'test-resend-key');
  vi.stubEnv('EMAIL_FROM', 'Nutrient <notifications@jonaddams.com>');
});

describe('Sending through Resend', () => {
  it('posts the message to the Resend API', async () => {
    const fetchMock = mockFetch(accepted());

    await sendEmail(MESSAGE);

    expect(sent(fetchMock).url).toBe('https://api.resend.com/emails');
  });

  it('authenticates with the configured key', async () => {
    const fetchMock = mockFetch(accepted());

    await sendEmail(MESSAGE);

    expect(sent(fetchMock).headers.Authorization).toBe('Bearer test-resend-key');
  });

  it('sends from the configured address', async () => {
    const fetchMock = mockFetch(accepted());

    await sendEmail(MESSAGE);

    expect(sent(fetchMock).body.from).toBe('Nutrient <notifications@jonaddams.com>');
  });

  it('points replies at the thread address rather than the sender', async () => {
    const fetchMock = mockFetch(accepted());

    await sendEmail(MESSAGE);

    expect(sent(fetchMock).body.reply_to).toBe('reply+abc123@jonaddams.com');
  });

  it('carries both the html and plain text parts', async () => {
    const fetchMock = mockFetch(accepted());

    await sendEmail(MESSAGE);

    const { body } = sent(fetchMock);
    expect(body.html).toBe('<p>html body</p>');
    expect(body.text).toBe('plain body');
    expect(body.subject).toBe('Alice mentioned you');
    expect(body.to).toEqual(['bob@nutrient.io']);
  });

  it('returns the id Resend assigned, so a send can be traced', async () => {
    mockFetch(accepted());

    await expect(sendEmail(MESSAGE)).resolves.toEqual({ id: 'msg_123' });
  });

  it('reports a rejected send rather than pretending it worked', async () => {
    mockFetch(new Response('{"message":"domain not verified"}', { status: 403 }));

    await expect(sendEmail(MESSAGE)).rejects.toThrow(/403/);
  });

  it('refuses to run without an API key', async () => {
    vi.stubEnv('RESEND_KEY', '');

    await expect(sendEmail(MESSAGE)).rejects.toThrow(/RESEND_KEY/);
  });

  it('refuses to run without a sender address', async () => {
    vi.stubEnv('EMAIL_FROM', '');

    await expect(sendEmail(MESSAGE)).rejects.toThrow(/EMAIL_FROM/);
  });
});
