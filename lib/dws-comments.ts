/**
 * Comment access for the DWS Viewer API.
 *
 * DWS is the system of record for comment content. Everything here is a thin,
 * typed wrapper over the REST endpoints so the rest of the app never has to
 * remember the payload shapes.
 *
 * Three things about the API that are easy to get wrong, all learned the hard way:
 *
 * - DWS answers a wildcard Accept header with HTTP 406, and Node's fetch sends one
 *   by default, so every request here sets `Accept: application/json` explicitly.
 * - A comment thread is rooted on a *markup* annotation carrying
 *   `isCommentThreadRoot: true`. `pspdfkit/comment-marker` is an SDK-side type and
 *   is not accepted by the create endpoint.
 * - `user_id` is the real author. It comes back as `createdBy`. `creatorName` is a
 *   display string only, so both are sent: one for truth, one for the UI.
 */

import { viewerApiKey } from '@/lib/nutrient-key';

const DWS_BASE_URL = process.env.NUTRIENT_API_BASE_URL_ROOT ?? 'https://api.nutrient.io';

export type Rect = [left: number, top: number, width: number, height: number];

export type DwsComment = {
  id: string;
  text: string;
  authorUserId: string | null;
  creatorName: string | null;
  customData: Record<string, unknown> | null;
  createdAt: string | null;
};

type DwsCommentResponse = {
  id?: string;
  createdBy?: string | null;
  content?: {
    text?: { value?: string | null } | null;
    creatorName?: string | null;
    customData?: Record<string, unknown> | null;
    createdAt?: string | null;
  } | null;
};

type DwsAnnotationResponse = {
  id?: string;
  content?: { isCommentThreadRoot?: boolean } | null;
};

const request = async (path: string, init: RequestInit = {}): Promise<unknown> => {
  const response = await fetch(`${DWS_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${viewerApiKey()}`,
      // DWS returns 406 for a wildcard Accept header.
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(`DWS request to ${path} failed: ${response.status} - ${raw}`);
  }

  return raw ? JSON.parse(raw) : null;
};

/** Smallest rectangle enclosing all of `rects`, as [left, top, width, height]. */
const boundingBoxOf = (rects: Rect[]): Rect => {
  const left = Math.min(...rects.map(([x]) => x));
  const top = Math.min(...rects.map(([, y]) => y));
  const right = Math.max(...rects.map(([x, , width]) => x + width));
  const bottom = Math.max(...rects.map(([, y, , height]) => y + height));

  return [left, top, right - left, bottom - top];
};

const commentBody = (options: {
  authorUserId: string;
  creatorName: string;
  text: string;
  customData?: Record<string, unknown>;
}) => ({
  user_id: options.authorUserId,
  content: {
    text: { format: 'plain', value: options.text },
    creatorName: options.creatorName,
    ...(options.customData ? { customData: options.customData } : {}),
  },
});

const toDwsComment = (comment: DwsCommentResponse): DwsComment => ({
  id: comment.id ?? '',
  text: comment.content?.text?.value ?? '',
  authorUserId: comment.createdBy ?? null,
  creatorName: comment.content?.creatorName ?? null,
  customData: comment.content?.customData ?? null,
  createdAt: comment.content?.createdAt ?? null,
});

export type CreateCommentThreadOptions = {
  documentId: string;
  authorUserId: string;
  creatorName: string;
  text: string;
  pageIndex: number;
  rects: Rect[];
  customData?: Record<string, unknown>;
};

/** Creates the thread's root annotation and its first comment in one call. */
export const createCommentThread = async (
  options: CreateCommentThreadOptions
): Promise<{ rootAnnotationId: string; commentId: string }> => {
  const { documentId, authorUserId, pageIndex, rects } = options;

  const payload = {
    annotation: {
      user_id: authorUserId,
      content: {
        type: 'pspdfkit/markup/highlight',
        v: 2,
        pageIndex,
        bbox: boundingBoxOf(rects),
        rects,
        blendMode: 'multiply',
        color: '#FCEE7C',
        opacity: 1,
        isCommentThreadRoot: true,
      },
    },
    comments: [commentBody(options)],
  };

  const result = (await request(`/viewer/documents/${documentId}/comments`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })) as { data?: { annotation?: { id?: string }; comments?: Array<{ id?: string }> } };

  return {
    rootAnnotationId: result.data?.annotation?.id ?? '',
    commentId: result.data?.comments?.[0]?.id ?? '',
  };
};

export type AddCommentOptions = {
  documentId: string;
  rootAnnotationId: string;
  authorUserId: string;
  creatorName: string;
  text: string;
  customData?: Record<string, unknown>;
};

/** Appends a comment to an existing thread. */
export const addComment = async (options: AddCommentOptions): Promise<{ commentId: string }> => {
  const { documentId, rootAnnotationId } = options;

  const result = (await request(
    `/viewer/documents/${documentId}/annotations/${rootAnnotationId}/comments`,
    { method: 'POST', body: JSON.stringify({ comments: [commentBody(options)] }) }
  )) as { data?: { comments?: Array<{ id?: string }> } };

  return { commentId: result.data?.comments?.[0]?.id ?? '' };
};

export type FetchCommentsOptions = {
  documentId: string;
  rootAnnotationId: string;
};

export const fetchComments = async (options: FetchCommentsOptions): Promise<DwsComment[]> => {
  const { documentId, rootAnnotationId } = options;

  const result = (await request(
    `/viewer/documents/${documentId}/annotations/${rootAnnotationId}/comments`,
    { method: 'GET' }
  )) as { data?: { comments?: DwsCommentResponse[] } };

  return (result.data?.comments ?? []).map(toDwsComment);
};

/** Annotation IDs in the document that root a comment thread. */
export const fetchThreadRoots = async (options: { documentId: string }): Promise<string[]> => {
  const result = (await request(`/viewer/documents/${options.documentId}/annotations`, {
    method: 'GET',
  })) as { data?: { annotations?: DwsAnnotationResponse[] } };

  return (result.data?.annotations ?? [])
    .filter((annotation) => annotation.content?.isCommentThreadRoot === true)
    .map((annotation) => annotation.id)
    .filter((id): id is string => typeof id === 'string');
};
