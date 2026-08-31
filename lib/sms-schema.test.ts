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

  it('models a phone verification with a single live row per user', () => {
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'PhoneVerification');

    expect(model).toBeDefined();
    expect(model?.fields.map((f) => f.name)).toEqual(
      expect.arrayContaining(['userId', 'code', 'phone', 'verifiedAt', 'expiresAt', 'attempts'])
    );
  });

  it('records inbound messages so a Twilio retry cannot double-post', () => {
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'InboundSms');

    expect(model).toBeDefined();
    expect(model?.fields.map((f) => f.name)).toEqual(
      expect.arrayContaining(['providerMessageId', 'fromNumber', 'userId', 'threadId'])
    );
  });
});
