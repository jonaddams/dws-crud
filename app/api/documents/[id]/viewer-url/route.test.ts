// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAuth = vi.fn();
const getEffectiveDocumentFilter = vi.fn();
const findFirstDocument = vi.fn();
const updateDocument = vi.fn();
const createSession = vi.fn();

vi.mock('@/lib/auth', () => ({
  requireAuth: (...a: unknown[]) => requireAuth(...a),
  getEffectiveDocumentFilter: (...a: unknown[]) => getEffectiveDocumentFilter(...a),
}));
vi.mock('@/lib/document-provider', () => ({
  documentProvider: () => ({ createViewerSession: (...a: unknown[]) => createSession(...a) }),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    document: {
      findFirst: (...a: unknown[]) => findFirstDocument(...a),
      update: (...a: unknown[]) => updateDocument(...a),
    },
  },
}));

const { GET } = await import('@/app/api/documents/[id]/viewer-url/route');

const get = () =>
  GET(new Request('https://example.test/viewer-url') as never, {
    params: Promise.resolve({ id: 'doc_1' }),
  });

beforeEach(() => {
  requireAuth.mockReset().mockResolvedValue({
    user: { id: 'user_jon', name: 'Jon Addams', email: 'jon@nutrient.io', role: 'USER' },
  });
  getEffectiveDocumentFilter.mockReset().mockReturnValue({});
  findFirstDocument.mockReset().mockResolvedValue({
    id: 'doc_1',
    documentEngineId: 'dws_1',
    sessionToken: null,
    title: 'Recipe',
  });
  updateDocument.mockReset().mockResolvedValue({});
  createSession.mockReset().mockResolvedValue({ sessionToken: 'jwt_abc' });
});

describe('Opening a document in the viewer', () => {
  it('returns the session token for the document', async () => {
    const body = await (await get()).json();

    expect(body.sessionToken).toBe('jwt_abc');
    expect(body.documentId).toBe('dws_1');
  });

  it('names the signed-in reader, so their comments are not left as Anonymous', async () => {
    const body = await (await get()).json();

    expect(body.currentUserName).toBe('Jon Addams');
  });

  it('falls back to the email when the account has no name', async () => {
    requireAuth.mockResolvedValue({
      user: { id: 'user_jon', name: null, email: 'jon@nutrient.io', role: 'USER' },
    });

    const body = await (await get()).json();

    expect(body.currentUserName).toBe('jon@nutrient.io');
  });

  it('mints the session against the signed-in user, so DWS records the real author', async () => {
    await get();

    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: 'dws_1', userId: 'user_jon' })
    );
  });

  it('refuses a document the caller cannot see', async () => {
    findFirstDocument.mockResolvedValue(null);

    const response = await get();

    expect(response.status).toBe(404);
    expect(createSession).not.toHaveBeenCalled();
  });
});
