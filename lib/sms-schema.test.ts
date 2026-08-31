// @vitest-environment node

import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

describe('SMS schema', () => {
  it('exposes the phone and channel fields on User', () => {
    const fields = Prisma.dmmf.datamodel.models
      .find((model) => model.name === 'User')
      ?.fields.map((field) => field.name);

    expect(fields).toEqual(
      expect.arrayContaining(['phone', 'phoneVerifiedAt', 'smsOptedOutAt', 'notificationChannel'])
    );
  });

  it('keeps phone unique on User, so an inbound sender maps to one account', () => {
    // Prisma's generated `WhereUniqueInput` only accepts a field alone as a
    // selector when it carries `@unique` (or `@id`) — every other field
    // requires `id`/`email` alongside it. This assignment fails to typecheck
    // if `@unique` is ever dropped from `phone`.
    const selector: Prisma.UserWhereUniqueInput = { phone: 'fixture-phone' };

    expect(selector.phone).toBe('fixture-phone');
  });

  it('models a phone verification with a single live row per user', () => {
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'PhoneVerification');

    expect(model).toBeDefined();
    expect(model?.fields.map((f) => f.name)).toEqual(
      expect.arrayContaining(['userId', 'code', 'phone', 'verifiedAt', 'expiresAt', 'attempts'])
    );
  });

  it('keeps userId unique on PhoneVerification, so a user has one live verification', () => {
    // This assignment fails to typecheck if `@unique` is ever dropped from
    // `userId` (the constraint that bounds a user to one live verification).
    const selector: Prisma.PhoneVerificationWhereUniqueInput = { userId: 'fixture-user-id' };

    expect(selector.userId).toBe('fixture-user-id');
  });

  it('records inbound messages so a Twilio retry cannot double-post', () => {
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'InboundSms');

    expect(model).toBeDefined();
    expect(model?.fields.map((f) => f.name)).toEqual(
      expect.arrayContaining(['providerMessageId', 'fromNumber', 'userId', 'threadId'])
    );
  });

  it('keeps providerMessageId unique on InboundSms, so a Twilio retry cannot double-post', () => {
    // This assignment fails to typecheck if `@unique` is ever dropped from
    // `providerMessageId` — the only thing bounding webhook replay, since a
    // Twilio signature carries no timestamp and stays valid forever.
    const selector: Prisma.InboundSmsWhereUniqueInput = { providerMessageId: 'fixture-message-id' };

    expect(selector.providerMessageId).toBe('fixture-message-id');
  });
});
