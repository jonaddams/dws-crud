// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { documentProvider } from '@/lib/document-provider';

const sessionResponse = () =>
  new Response(JSON.stringify({ jwt: 'a.viewer.jwt' }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });

const uploadResponse = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });

const mockFetch = (...responses: readonly Response[]) => {
  const fetchMock = vi.fn();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce(response);
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const lastCall = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.at(-1);

const sentUrl = (fetchMock: ReturnType<typeof vi.fn>) => String(lastCall(fetchMock)?.[0]);

const sentBody = (fetchMock: ReturnType<typeof vi.fn>) =>
  JSON.parse(String(lastCall(fetchMock)?.[1]?.body));

const sentHeaders = (fetchMock: ReturnType<typeof vi.fn>) =>
  lastCall(fetchMock)?.[1]?.headers as Record<string, string>;

beforeEach(() => {
  vi.stubEnv('NUTRIENT_API_KEY', 'test-api-key');
  vi.stubEnv('NUTRIENT_TARGET', 'dws');
  vi.stubEnv('NUTRIENT_BASE_URL', 'https://api.nutrient.io');
  vi.stubEnv('NUTRIENT_API_BASE_URL', undefined);
  vi.stubEnv('NUTRIENT_API_BASE_URL_ROOT', undefined);
});

describe('viewer session creation', () => {
  it('grants write access so the reader can add comments', async () => {
    const fetchMock = mockFetch(sessionResponse());

    await documentProvider().createViewerSession({ documentId: 'doc_1', userId: 'user_alice' });

    expect(sentBody(fetchMock).allowed_documents[0].permissions).toEqual(['read', 'write']);
  });

  it('uses the permissions key that DWS actually reads', async () => {
    const fetchMock = mockFetch(sessionResponse());

    await documentProvider().createViewerSession({ documentId: 'doc_1', userId: 'user_alice' });

    // DWS accepts `document_permissions` without complaint and then ignores it,
    // so sending the wrong key fails silently rather than erroring.
    expect(sentBody(fetchMock).allowed_documents[0]).not.toHaveProperty('document_permissions');
  });

  it('identifies the signed-in user so DWS attributes their comments', async () => {
    const fetchMock = mockFetch(sessionResponse());

    await documentProvider().createViewerSession({ documentId: 'doc_1', userId: 'user_alice' });

    expect(sentBody(fetchMock).user_id).toBe('user_alice');
  });

  it('omits the user when none is known, rather than sending an empty one', async () => {
    const fetchMock = mockFetch(sessionResponse());

    await documentProvider().createViewerSession({ documentId: 'doc_1' });

    expect(sentBody(fetchMock)).not.toHaveProperty('user_id');
  });

  it('asks for JSON explicitly, because DWS rejects a wildcard Accept header', async () => {
    const fetchMock = mockFetch(sessionResponse());

    await documentProvider().createViewerSession({ documentId: 'doc_1' });

    expect(sentHeaders(fetchMock).Accept).toBe('application/json');
  });

  it('returns the issued token', async () => {
    mockFetch(sessionResponse());

    const session = await documentProvider().createViewerSession({ documentId: 'doc_1' });

    expect(session).toEqual({ sessionToken: 'a.viewer.jwt', documentId: 'doc_1' });
  });

  it('reports a refused session rather than returning an empty token', async () => {
    mockFetch(new Response('nope', { status: 403 }));

    await expect(documentProvider().createViewerSession({ documentId: 'doc_1' })).rejects.toThrow(
      /403/
    );
  });
});

describe('where the backend lives', () => {
  it('asks the configured origin for a session, not a hardcoded host', async () => {
    // This endpoint used to be hardcoded to api.nutrient.io, which made a
    // self-hosted deployment impossible however the app was configured.
    vi.stubEnv('NUTRIENT_BASE_URL', 'https://engine.internal:5000');
    const fetchMock = mockFetch(sessionResponse());

    await documentProvider().createViewerSession({ documentId: 'doc_1' });

    expect(sentUrl(fetchMock)).toBe('https://engine.internal:5000/viewer/sessions');
  });

  it('derives the documents path from the same origin', async () => {
    const fetchMock = mockFetch(new Response(null, { status: 204 }));

    await documentProvider().deleteDocument({ documentId: 'doc_1' });

    expect(sentUrl(fetchMock)).toBe('https://api.nutrient.io/viewer/documents/doc_1');
  });

  it('refuses a self-hosted target rather than pretending to support it', async () => {
    // An untested implementation would look like support and fail as subtly
    // wrong requests at a customer site instead of loudly here.
    vi.stubEnv('NUTRIENT_TARGET', 'document-engine');
    vi.stubEnv('NUTRIENT_BASE_URL', 'https://engine.internal');

    expect(() => documentProvider()).toThrow(/no Document Engine client is implemented/);
  });
});

describe('uploading a document', () => {
  it('returns the stored document and the session issued alongside it', async () => {
    mockFetch(
      uploadResponse({ data: { document_id: 'doc_9', session_token: 'issued.on.upload' } })
    );

    const upload = await documentProvider().uploadDocument({
      file: new File(['pdf bytes'], 'contract.pdf', { type: 'application/pdf' }),
    });

    expect(upload).toEqual({ documentId: 'doc_9', sessionToken: 'issued.on.upload' });
  });

  it('mints a session when the upload did not include one', async () => {
    mockFetch(uploadResponse({ data: { document_id: 'doc_9' } }), sessionResponse());

    const upload = await documentProvider().uploadDocument({
      file: new File(['pdf bytes'], 'contract.pdf', { type: 'application/pdf' }),
    });

    expect(upload).toEqual({ documentId: 'doc_9', sessionToken: 'a.viewer.jwt' });
  });

  it('keeps the uploaded document even when the session is refused', async () => {
    // The document is already stored by this point. Losing its ID because a
    // convenience call failed would orphan it in the backend.
    mockFetch(
      uploadResponse({ data: { document_id: 'doc_9' } }),
      new Response('nope', { status: 403 })
    );

    const upload = await documentProvider().uploadDocument({
      file: new File(['pdf bytes'], 'contract.pdf', { type: 'application/pdf' }),
    });

    expect(upload).toEqual({ documentId: 'doc_9', sessionToken: '' });
  });

  it('reports an upload that returned no document ID', async () => {
    mockFetch(uploadResponse({ data: {} }));

    await expect(
      documentProvider().uploadDocument({
        file: new File(['pdf bytes'], 'contract.pdf', { type: 'application/pdf' }),
      })
    ).rejects.toThrow(/no document ID/);
  });

  it('reports a rejected upload', async () => {
    mockFetch(new Response('too big', { status: 413 }));

    await expect(
      documentProvider().uploadDocument({
        file: new File(['pdf bytes'], 'contract.pdf', { type: 'application/pdf' }),
      })
    ).rejects.toThrow(/413/);
  });
});

describe('deleting a document', () => {
  it('treats a backend that will not delete as done, so our record can still go', async () => {
    mockFetch(new Response('not allowed', { status: 405 }));

    await expect(
      documentProvider().deleteDocument({ documentId: 'doc_1' })
    ).resolves.toBeUndefined();
  });

  it('reports a genuine delete failure', async () => {
    mockFetch(new Response('boom', { status: 500 }));

    await expect(documentProvider().deleteDocument({ documentId: 'doc_1' })).rejects.toThrow(/500/);
  });
});
