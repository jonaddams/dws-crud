// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nutrientAPIService } from '@/lib/nutrient-api';

const sessionResponse = () =>
  new Response(JSON.stringify({ jwt: 'a.viewer.jwt' }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });

const mockFetch = (response: Response) => {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const sentBody = (fetchMock: ReturnType<typeof vi.fn>) =>
  JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body));

const sentHeaders = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.at(-1)?.[1]?.headers as Record<string, string>;

beforeEach(() => {
  vi.stubEnv('NUTRIENT_API_KEY', 'test-api-key');
});

describe('Viewer session creation', () => {
  it('grants write access so the reader can add comments', async () => {
    const fetchMock = mockFetch(sessionResponse());

    await nutrientAPIService.createSession({ documentId: 'doc_1', userId: 'user_alice' });

    expect(sentBody(fetchMock).allowed_documents[0].permissions).toEqual(['read', 'write']);
  });

  it('uses the permissions key that DWS actually reads', async () => {
    const fetchMock = mockFetch(sessionResponse());

    await nutrientAPIService.createSession({ documentId: 'doc_1', userId: 'user_alice' });

    // DWS accepts `document_permissions` without complaint and then ignores it,
    // so sending the wrong key fails silently rather than erroring.
    expect(sentBody(fetchMock).allowed_documents[0]).not.toHaveProperty('document_permissions');
  });

  it('identifies the signed-in user so DWS attributes their comments', async () => {
    const fetchMock = mockFetch(sessionResponse());

    await nutrientAPIService.createSession({ documentId: 'doc_1', userId: 'user_alice' });

    expect(sentBody(fetchMock).user_id).toBe('user_alice');
  });

  it('omits the user when none is known, rather than sending an empty one', async () => {
    const fetchMock = mockFetch(sessionResponse());

    await nutrientAPIService.createSession({ documentId: 'doc_1' });

    expect(sentBody(fetchMock)).not.toHaveProperty('user_id');
  });

  it('asks for JSON explicitly, because DWS rejects a wildcard Accept header', async () => {
    const fetchMock = mockFetch(sessionResponse());

    await nutrientAPIService.createSession({ documentId: 'doc_1' });

    expect(sentHeaders(fetchMock).Accept).toBe('application/json');
  });

  it('returns the issued token', async () => {
    mockFetch(sessionResponse());

    const session = await nutrientAPIService.createSession({ documentId: 'doc_1' });

    expect(session).toEqual({ sessionToken: 'a.viewer.jwt', documentId: 'doc_1' });
  });

  it('reports a refused session rather than returning an empty token', async () => {
    mockFetch(new Response('nope', { status: 403 }));

    await expect(nutrientAPIService.createSession({ documentId: 'doc_1' })).rejects.toMatchObject({
      message: expect.stringContaining('403'),
    });
  });
});
