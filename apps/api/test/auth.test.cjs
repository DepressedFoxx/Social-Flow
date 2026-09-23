/* eslint-disable @typescript-eslint/no-require-imports */
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Test } = require('@nestjs/testing');
process.env.META_APP_ID = '123456';
process.env.META_APP_SECRET = 'test-secret';
process.env.META_CALLBACK_URL = 'https://api.example.test/api/connections/meta/callback';
process.env.META_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.META_PUBLIC_API_ORIGIN = 'https://api.example.test';
const { AppModule } = require('../dist/app.module');
const { setupApp } = require('../dist/config/setup-app');
const { PrismaService } = require('../dist/database/prisma.service');
const { GoogleProvider } = require('../dist/modules/auth/google.provider');
const { AuthService } = require('../dist/modules/auth/auth.service');
const { MetaGraph, MetaError } = require('../dist/modules/meta/meta.graph');
const { MetaCrypto } = require('../dist/modules/meta/meta.crypto');
const { AuthRateGuard } = require('../dist/modules/auth/auth-rate.guard');

test('authentication HTTP integration with isolated test database', async (t) => {
  assert.match(new URL(process.env.DATABASE_URL).pathname, /_test$/);
  const suffix = randomUUID();
  const email = 'auth-' + suffix + '@example.com';
  const googleEmail = 'google-' + suffix + '@example.com';
  const otherEmail = 'other-' + suffix + '@example.com';
  process.env.WEB_ORIGIN = 'http://localhost:3017';
  process.env.NODE_ENV = 'test';
  let failedOnce = false;
  const graphCalls = [];
  const fakeMeta = {
    ready: true,
    authorizeUrl: (state) => 'https://www.facebook.com/v25.0/dialog/oauth?state=' + state,
    discover: async () => [
      {
        id: '12345678',
        pageId: '12345678',
        name: 'Meta Page',
        platform: 'FACEBOOK',
        token: 'private-provider-token',
        expiresAt: null,
      },
    ],
    call: async (path, token, params, method) => {
      graphCalls.push({ path, params, method });
      if (params?.message === '[test-fail-once]' && !failedOnce) {
        failedOnce = true;
        throw new MetaError('META_REJECTED', 'Test provider rejection');
      }
      if (params?.message === '[test-uncertain]')
        throw new MetaError('PUBLISH_UNCERTAIN', 'Test uncertain result', true);
      if (params?.fields === 'status_code') return { status_code: 'FINISHED' };
      return { id: 'provider-' + randomUUID() };
    },
  };
  const fakeGoogle = {
    enabled: true,
    authorizeUrl: (state, challenge) =>
      'https://accounts.google.com/o/oauth2/v2/auth?state=' +
      state +
      '&code_challenge=' +
      challenge,
    profile: async (code, verifier, nonce) => {
      assert.equal(verifier.length, 43);
      assert.equal(nonce.length, 43);
      if (code === 'failure') throw new Error('Provider failed');
      return {
        googleId: suffix,
        email: code === 'conflict' ? email : googleEmail,
        name: 'Google Test',
      };
    },
  };
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MetaGraph)
    .useValue(fakeMeta)
    .overrideProvider(GoogleProvider)
    .useValue(fakeGoogle)
    .overrideGuard(AuthRateGuard)
    .useValue({ canActivate: () => true })
    .compile();
  const app = module.createNestApplication({ logger: false });
  setupApp(app);
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const prisma = app.get(PrismaService);
  const auth = app.get(AuthService);
  const crypto = app.get(MetaCrypto);
  const seedAccount = async (
    workspaceId,
    platform = 'FACEBOOK',
    name = 'Test Facebook',
  ) => {
    const channel = await prisma.channel.create({
      data: {
        workspaceId,
        platform,
        name,
        isMock: false,
        externalId: randomUUID().replaceAll('-', ''),
      },
    });
    await prisma.channelCredential.create({
      data: {
        channelId: channel.id,
        encryptedToken: crypto.seal('test-only-token', channel.id),
        pageId: channel.externalId,
      },
    });
    return channel;
  };
  const seedSession = async (value) => {
    await seedAccount(value.workspace.id);
    await seedAccount(value.workspace.id, 'INSTAGRAM', 'Test Instagram');
    value.workspace.channels = await prisma.channel.findMany({
      where: { workspaceId: value.workspace.id },
    });
  };
  const states = [];
  const request = (route, options = {}) =>
    fetch(base + '/api' + route, { redirect: 'manual', ...options });
  const post = (route, body, cookie, csrf, origin = process.env.WEB_ORIGIN) =>
    request(route, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
      },
      body: JSON.stringify(body),
    });
  let cookie, session, otherCookie, otherSession;
  const password = 'A long password 2026!';
  const begin = async () => {
    const response = await request('/auth/google');
    assert.equal(response.status, 302);
    const state = new URL(response.headers.get('location')).searchParams.get('state');
    states.push(state);
    return { state, cookie: response.headers.get('set-cookie').split(';')[0] };
  };
  try {
    await t.test(
      'rejects anonymous access, invalid input and foreign origin',
      async () => {
        assert.equal((await request('/auth/me')).status, 401);
        assert.equal((await request('/channels')).status, 401);
        assert.equal((await request('/posts')).status, 401);
        assert.equal(
          (
            await post('/auth/register', {
              name: 'Test',
              email,
              password: 'x'.repeat(129),
            })
          ).status,
          400,
        );
        assert.equal(
          (await post('/auth/register', { name: 'Test', email, password: 123 })).status,
          400,
        );
        assert.equal(
          (await post('/auth/register', { name: 'Test', email, password: 'short' }))
            .status,
          400,
        );
        assert.equal(
          (await post('/auth/register', { name: 'Test', email, password: 'lowercase!' }))
            .status,
          400,
        );
        assert.equal(
          (await post('/auth/register', { name: 'Test', email, password: 'Uppercase1' }))
            .status,
          400,
        );
        assert.equal(
          (await post('/auth/register', { name: 'Test', email, password: 'Upper case1' }))
            .status,
          400,
        );
        assert.equal(
          (
            await post(
              '/auth/register',
              { name: 'Test', email, password },
              null,
              null,
              'https://foreign.example',
            )
          ).status,
          403,
        );
      },
    );
    await t.test(
      'register creates private workspace, hashes password and cookie token',
      async () => {
        const res = await post('/auth/register', {
          name: 'Test User',
          email: email.toUpperCase(),
          password,
        });
        assert.equal(res.status, 201);
        const header = res.headers.get('set-cookie');
        assert.match(header, /HttpOnly/i);
        assert.match(header, /SameSite=Lax/i);
        cookie = header.split(';')[0];
        session = await res.json();
        assert.equal(session.user.email, email);
        assert.equal(session.workspace.channels.length, 0);
        await seedSession(session);
        assert.equal(JSON.stringify(session).includes('passwordHash'), false);
        const user = await prisma.user.findUnique({ where: { email } });
        assert.match(user.passwordHash, /^scrypt-v1:/);
        assert.notEqual(user.passwordHash, password);
        const stored = await prisma.session.findFirst({ where: { userId: user.id } });
        assert.notEqual(stored.tokenHash, cookie.split('=')[1]);
        assert.equal(
          (await post('/auth/register', { name: 'Duplicate', email, password })).status,
          409,
        );
      },
    );
    await t.test(
      'dashboard returns real counts and upcoming posts for its workspace',
      async () => {
        assert.equal((await request('/dashboard')).status, 401);
        const otherRegistration = await post('/auth/register', {
          name: 'Other User',
          email: otherEmail,
          password,
        });
        assert.equal(otherRegistration.status, 201);
        otherCookie = otherRegistration.headers.get('set-cookie').split(';')[0];
        otherSession = await otherRegistration.json();
        await seedSession(otherSession);
        const channelId = session.workspace.channels[0].id;
        const scheduled = Array.from({ length: 6 }, (_, index) => ({
          workspaceId: session.workspace.id,
          channelId,
          title: 'Scheduled ' + (index + 1),
          status: 'SCHEDULED',
          scheduledAt: new Date(Date.now() + (index + 1) * 60_000),
        }));
        await prisma.post.createMany({
          data: [
            {
              workspaceId: session.workspace.id,
              channelId,
              title: 'Draft',
              status: 'DRAFT',
            },
            {
              workspaceId: session.workspace.id,
              channelId,
              title: 'Published',
              status: 'PUBLISHED',
            },
            {
              workspaceId: session.workspace.id,
              channelId,
              title: 'Failed',
              status: 'FAILED',
            },
            {
              workspaceId: session.workspace.id,
              channelId,
              title: 'Publishing is not a dashboard card',
              status: 'PUBLISHING',
            },
            ...scheduled,
            {
              workspaceId: otherSession.workspace.id,
              channelId: otherSession.workspace.channels[0].id,
              title: 'Other workspace draft',
              status: 'DRAFT',
            },
          ],
        });
        const response = await request('/dashboard', { headers: { Cookie: cookie } });
        assert.equal(response.status, 200);
        assert.match(response.headers.get('cache-control'), /no-store/);
        const data = await response.json();
        assert.deepEqual(data.counts, {
          DRAFT: 1,
          SCHEDULED: 6,
          PUBLISHED: 1,
          FAILED: 1,
        });
        assert.deepEqual(
          data.upcoming.map((item) => item.title),
          scheduled.slice(0, 5).map((item) => item.title),
        );
        const isolated = await (
          await request('/dashboard', { headers: { Cookie: otherCookie } })
        ).json();
        assert.deepEqual(isolated.counts, {
          DRAFT: 1,
          SCHEDULED: 0,
          PUBLISHED: 0,
          FAILED: 0,
        });
        assert.equal(isolated.upcoming.length, 0);
      },
    );
    await t.test('post drafts are isolated, searchable and versioned', async () => {
      const channelId = session.workspace.channels[0].id;
      const requestId = randomUUID();
      const payload = {
        title: 'Launch Alpha',
        content: 'First campaign content',
        channelId,
        clientRequestId: requestId,
      };
      const createdResponse = await post('/posts', payload, cookie, session.csrfToken);
      assert.equal(createdResponse.status, 201);
      const created = await createdResponse.json();
      assert.equal(created.status, 'DRAFT');
      assert.equal(created.version, 1);

      const repeated = await post('/posts', payload, cookie, session.csrfToken);
      assert.equal(repeated.status, 201);
      assert.equal((await repeated.json()).id, created.id);

      const listResponse = await request(
        '/posts?q=launch&status=draft&channel=' +
          channelId +
          '&sort=updatedAt&order=desc&page=1&pageSize=20',
        { headers: { Cookie: cookie } },
      );
      assert.equal(listResponse.status, 200);
      assert.match(listResponse.headers.get('cache-control'), /no-store/);
      const list = await listResponse.json();
      assert.equal(list.total, 1);
      assert.equal(list.items[0].id, created.id);

      assert.equal(
        (
          await post(
            '/posts',
            {
              ...payload,
              clientRequestId: randomUUID(),
              channelId: otherSession.workspace.channels[0].id,
            },
            cookie,
            session.csrfToken,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await request('/posts/' + created.id, {
            headers: { Cookie: otherCookie },
          })
        ).status,
        404,
      );

      const changedResponse = await request('/posts/' + created.id, {
        method: 'PATCH',
        headers: {
          Cookie: cookie,
          Origin: process.env.WEB_ORIGIN,
          'Content-Type': 'application/json',
          'x-csrf-token': session.csrfToken,
        },
        body: JSON.stringify({ title: 'Launch Beta', expectedVersion: 1 }),
      });
      assert.equal(changedResponse.status, 200);
      const changed = await changedResponse.json();
      assert.equal(changed.title, 'Launch Beta');
      assert.equal(changed.version, 2);

      const stale = await request('/posts/' + created.id, {
        method: 'PATCH',
        headers: {
          Cookie: cookie,
          Origin: process.env.WEB_ORIGIN,
          'Content-Type': 'application/json',
          'x-csrf-token': session.csrfToken,
        },
        body: JSON.stringify({ title: 'Stale update', expectedVersion: 1 }),
      });
      assert.equal(stale.status, 409);
      assert.equal((await stale.json()).code, 'VERSION_CONFLICT');

      assert.equal(
        (
          await request('/posts/' + created.id, {
            method: 'PATCH',
            headers: {
              Cookie: cookie,
              Origin: process.env.WEB_ORIGIN,
              'Content-Type': 'application/json',
              'x-csrf-token': session.csrfToken,
            },
            body: JSON.stringify({ expectedVersion: 2 }),
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request('/posts/' + created.id, {
            method: 'DELETE',
            headers: {
              Cookie: cookie,
              Origin: process.env.WEB_ORIGIN,
              'x-csrf-token': session.csrfToken,
            },
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request('/posts/' + created.id, {
            method: 'DELETE',
            headers: {
              Cookie: otherCookie,
              Origin: process.env.WEB_ORIGIN,
              'x-csrf-token': otherSession.csrfToken,
              'If-Match': '2',
            },
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await request('/posts/' + created.id, {
            method: 'DELETE',
            headers: {
              Cookie: cookie,
              Origin: process.env.WEB_ORIGIN,
              'x-csrf-token': session.csrfToken,
              'If-Match': '2',
            },
          })
        ).status,
        204,
      );
      assert.equal(
        (await request('/posts/' + created.id, { headers: { Cookie: cookie } })).status,
        404,
      );
      assert.equal(
        (await request('/posts?page=0', { headers: { Cookie: cookie } })).status,
        400,
      );
    });
    await t.test(
      'media upload verifies bytes and only attaches workspace assets',
      async () => {
        const png = Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          'base64',
        );
        const initResponse = await post(
          '/media/upload-url',
          { filename: 'pixel.png', mimeType: 'image/png', size: png.length },
          cookie,
          session.csrfToken,
        );
        assert.equal(initResponse.status, 201);
        const init = await initResponse.json();
        assert.match(init.uploadUrl, new RegExp('/media/' + init.assetId + '/upload'));

        const invalidForm = new FormData();
        invalidForm.append('file', new Blob([png], { type: 'image/png' }), 'pixel.png');
        assert.equal(
          (
            await request('/media/' + init.assetId + '/upload?token=wrong', {
              method: 'PUT',
              body: invalidForm,
            })
          ).status,
          403,
        );

        const form = new FormData();
        form.append('file', new Blob([png], { type: 'image/png' }), 'pixel.png');
        const uploaded = await fetch(base + '/api' + init.uploadUrl, {
          method: 'PUT',
          body: form,
        });
        assert.equal(uploaded.status, 204);
        assert.equal(
          (
            await post(
              '/media/' + init.assetId + '/complete',
              {},
              otherCookie,
              otherSession.csrfToken,
            )
          ).status,
          404,
        );
        const completed = await post(
          '/media/' + init.assetId + '/complete',
          {},
          cookie,
          session.csrfToken,
        );
        assert.equal(completed.status, 201);
        const asset = await completed.json();
        assert.equal(asset.id, init.assetId);

        const libraryBeforeAttach = await (
          await request('/media', { headers: { Cookie: cookie } })
        ).json();
        assert.equal(libraryBeforeAttach.planCode, 'PERSONAL');
        assert.equal(libraryBeforeAttach.quotaBytes, 262144000);
        assert.equal(libraryBeforeAttach.usedBytes, png.length);
        assert.equal(libraryBeforeAttach.items[0].post, null);
        await prisma.workspace.update({
          where: { id: session.workspace.id },
          data: { mediaQuotaBytes: BigInt(png.length) },
        });
        assert.equal(
          (
            await post(
              '/media/upload-url',
              { filename: 'over.png', mimeType: 'image/png', size: png.length },
              cookie,
              session.csrfToken,
            )
          ).status,
          413,
        );
        await prisma.workspace.update({
          where: { id: session.workspace.id },
          data: { mediaQuotaBytes: BigInt(262144000) },
        });

        const content = await request(asset.contentPath, { headers: { Cookie: cookie } });
        assert.equal(content.status, 200);
        assert.equal(content.headers.get('content-type'), 'image/png');
        assert.equal(content.headers.get('cross-origin-resource-policy'), 'cross-origin');
        assert.equal(Buffer.from(await content.arrayBuffer()).equals(png), true);
        assert.equal(
          (await request(asset.contentPath, { headers: { Cookie: otherCookie } })).status,
          404,
        );

        const mediaPostPayload = {
          title: 'Post with media',
          content: '',
          channelId: session.workspace.channels[0].id,
          clientRequestId: randomUUID(),
          mediaAssetIds: [asset.id],
        };
        const createdResponse = await post(
          '/posts',
          mediaPostPayload,
          cookie,
          session.csrfToken,
        );
        assert.equal(createdResponse.status, 201);
        const created = await createdResponse.json();
        assert.equal(created.media[0].id, asset.id);
        const libraryAfterAttach = await (
          await request('/media?q=pixel', { headers: { Cookie: cookie } })
        ).json();
        assert.equal(libraryAfterAttach.total, 1);
        assert.equal(libraryAfterAttach.items[0].post.id, created.id);
        const repeated = await post(
          '/posts',
          mediaPostPayload,
          cookie,
          session.csrfToken,
        );
        assert.equal(repeated.status, 201);
        assert.equal((await repeated.json()).id, created.id);

        assert.equal(
          (
            await post(
              '/posts',
              {
                title: 'Foreign media',
                content: '',
                channelId: otherSession.workspace.channels[0].id,
                clientRequestId: randomUUID(),
                mediaAssetIds: [asset.id],
              },
              otherCookie,
              otherSession.csrfToken,
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await request('/media/' + asset.id, {
              method: 'DELETE',
              headers: {
                Cookie: cookie,
                Origin: process.env.WEB_ORIGIN,
                'x-csrf-token': session.csrfToken,
              },
            })
          ).status,
          409,
        );

        const detached = await request('/posts/' + created.id, {
          method: 'PATCH',
          headers: {
            Cookie: cookie,
            Origin: process.env.WEB_ORIGIN,
            'Content-Type': 'application/json',
            'x-csrf-token': session.csrfToken,
          },
          body: JSON.stringify({ expectedVersion: 1, mediaAssetIds: [] }),
        });
        assert.equal(detached.status, 200);
        assert.equal((await detached.json()).media.length, 0);
        assert.equal(
          (
            await request('/media/' + asset.id, {
              method: 'DELETE',
              headers: {
                Cookie: cookie,
                Origin: process.env.WEB_ORIGIN,
                'x-csrf-token': session.csrfToken,
              },
            })
          ).status,
          204,
        );
      },
    );
    await t.test(
      'schedule validates content, ownership, UTC time and concurrent versions',
      async () => {
        const channel = session.workspace.channels.find((c) => c.platform === 'FACEBOOK');
        const created = await post(
          '/posts',
          {
            title: 'Schedule test',
            content: 'Hello',
            channelId: channel.id,
            clientRequestId: randomUUID(),
          },
          cookie,
          session.csrfToken,
        );
        const draft = await created.json();
        const route = '/posts/' + draft.id + '/schedule';
        const future = new Date(Date.now() + 3600000).toISOString();
        const scheduleBody = { expectedVersion: 1, scheduledAt: future };
        assert.equal(
          (await post(route, scheduleBody, otherCookie, otherSession.csrfToken)).status,
          404,
        );
        assert.equal(
          (
            await post(
              route,
              { ...scheduleBody, scheduledAt: new Date().toISOString() },
              cookie,
              session.csrfToken,
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await post(
              route,
              { ...scheduleBody, scheduledAt: '2027-01-01T10:00:00' },
              cookie,
              session.csrfToken,
            )
          ).status,
          400,
        );
        const response = await post(route, scheduleBody, cookie, session.csrfToken);
        assert.equal(response.status, 201);
        const scheduled = await response.json();
        assert.equal(scheduled.status, 'SCHEDULED');
        assert.equal(scheduled.scheduledAt, future);
        assert.equal(scheduled.version, 2);
        assert.equal(
          (await post(route, scheduleBody, cookie, session.csrfToken)).status,
          409,
        );
        const headers = {
          Cookie: cookie,
          Origin: process.env.WEB_ORIGIN,
          'X-CSRF-Token': session.csrfToken,
          'Content-Type': 'application/json',
        };
        assert.equal(
          (
            await request('/posts/' + draft.id, {
              method: 'PATCH',
              headers,
              body: JSON.stringify({ expectedVersion: 2, content: 'locked' }),
            })
          ).status,
          409,
        );
        const changes = await Promise.all(
          [1, 2].map((n) =>
            request(route, {
              method: 'PATCH',
              headers,
              body: JSON.stringify({
                expectedVersion: 2,
                scheduledAt: new Date(Date.now() + n * 7200000).toISOString(),
              }),
            }),
          ),
        );
        assert.deepEqual(changes.map((r) => r.status).sort(), [200, 409]);
        assert.equal(
          (
            await request(route, {
              method: 'DELETE',
              headers: { ...headers, 'If-Match': '2' },
            })
          ).status,
          409,
        );
        const cancelled = await request(route, {
          method: 'DELETE',
          headers: { ...headers, 'If-Match': '3' },
        });
        assert.equal(cancelled.status, 200);
        const reverted = await cancelled.json();
        assert.equal(reverted.status, 'DRAFT');
        assert.equal(reverted.scheduledAt, null);
        assert.equal(reverted.content, 'Hello');
        await prisma.post.update({ where: { id: draft.id }, data: { content: '   ' } });
        assert.equal(
          (
            await post(
              route,
              { ...scheduleBody, expectedVersion: 4 },
              cookie,
              session.csrfToken,
            )
          ).status,
          400,
        );
        const instagram = session.workspace.channels.find(
          (c) => c.platform === 'INSTAGRAM',
        );
        await prisma.post.update({
          where: { id: draft.id },
          data: { content: 'Instagram', channelId: instagram.id, status: 'FAILED' },
        });
        assert.equal(
          (
            await post(
              route,
              { ...scheduleBody, expectedVersion: 4 },
              cookie,
              session.csrfToken,
            )
          ).status,
          400,
        );
        await prisma.post.update({
          where: { id: draft.id },
          data: { channelId: channel.id },
        });
        assert.equal(
          (
            await post(
              route,
              { ...scheduleBody, expectedVersion: 4 },
              cookie,
              session.csrfToken,
            )
          ).status,
          201,
        );
      },
    );
    await t.test(
      'accounts, immediate publishing, lease expiry and calendar are isolated',
      async () => {
        const { PublishingService } = require('../dist/modules/posts/publishing.service');
        const worker = app.get(PublishingService);
        assert.equal(
          (
            await post(
              '/channels',
              { name: 'Manual', platform: 'FACEBOOK' },
              cookie,
              session.csrfToken,
            )
          ).status,
          404,
        );
        const account = await seedAccount(
          session.workspace.id,
          'FACEBOOK',
          'Second Facebook',
        );
        const headers = {
          Cookie: cookie,
          Origin: process.env.WEB_ORIGIN,
          'X-CSRF-Token': session.csrfToken,
          'Content-Type': 'application/json',
        };
        assert.equal(
          (
            await request('/channels/' + account.id, {
              method: 'PATCH',
              headers: {
                ...headers,
                Cookie: otherCookie,
                'X-CSRF-Token': otherSession.csrfToken,
              },
              body: JSON.stringify({ isActive: false }),
            })
          ).status,
          404,
        );
        const create = await post(
          '/posts',
          {
            title: 'Publish now',
            content: '[test-fail-once]',
            channelId: account.id,
            clientRequestId: randomUUID(),
          },
          cookie,
          session.csrfToken,
        );
        const draft = await create.json();
        const endpoint = '/posts/' + draft.id + '/publish';
        assert.equal(
          (
            await post(
              endpoint,
              { expectedVersion: 1 },
              otherCookie,
              otherSession.csrfToken,
            )
          ).status,
          404,
        );
        assert.equal((await post(endpoint, { expectedVersion: 1 }, cookie)).status, 403);
        assert.equal(
          (await post(endpoint, { expectedVersion: 1 }, cookie, session.csrfToken))
            .status,
          201,
        );
        assert.equal(
          (await post(endpoint, { expectedVersion: 1 }, cookie, session.csrfToken))
            .status,
          409,
        );
        await Promise.all([worker.tick(), worker.tick()]);
        let current = await prisma.post.findUnique({
          where: { id: draft.id },
          include: { attempts: true },
        });
        assert.equal(current.status, 'FAILED');
        assert.equal(current.attempts.length, 1);
        assert.equal(current.attempts[0].errorCode, 'META_REJECTED');
        await post(
          endpoint,
          { expectedVersion: current.version },
          cookie,
          session.csrfToken,
        );
        await worker.tick();
        current = await prisma.post.findUnique({
          where: { id: draft.id },
          include: { attempts: true },
        });
        assert.equal(current.status, 'PUBLISHED');
        assert.equal(current.attempts.filter((a) => a.status === 'PUBLISHED').length, 1);
        await worker.tick();
        assert.equal(
          await prisma.publishAttempt.count({ where: { postId: draft.id } }),
          2,
        );
        const from = new Date(Date.now() - 86400000).toISOString();
        const to = new Date(Date.now() + 86400000).toISOString();
        const calendarUrl =
          '/calendar?' + new URLSearchParams({ from, to, channel: account.id });
        const ownCalendar = await (
          await request(calendarUrl, { headers: { Cookie: cookie } })
        ).json();
        assert.equal(
          ownCalendar.items.some((p) => p.id === draft.id),
          true,
        );
        const otherCalendar = await (
          await request(calendarUrl, { headers: { Cookie: otherCookie } })
        ).json();
        assert.equal(otherCalendar.total, 0);
        await request('/channels/' + account.id, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ isActive: false }),
        });
        const blocked = await post(
          '/posts',
          {
            title: 'Paused',
            content: 'Hello',
            channelId: account.id,
            clientRequestId: randomUUID(),
          },
          cookie,
          session.csrfToken,
        );
        const blockedPost = await blocked.json();
        assert.equal(
          (
            await post(
              '/posts/' + blockedPost.id + '/publish',
              { expectedVersion: 1 },
              cookie,
              session.csrfToken,
            )
          ).status,
          400,
        );
        // Seed a worker interrupted after claiming, then verify expiry and fencing of late success.
        await prisma.post.update({
          where: { id: blockedPost.id },
          data: { status: 'PUBLISHING', version: 2 },
        });
        const stale = await prisma.publishAttempt.create({
          data: {
            postId: blockedPost.id,
            scheduleVersion: 1,
            status: 'PUBLISHING',
            leaseExpiresAt: new Date(Date.now() - 1000),
          },
        });
        await worker.tick();
        await worker.finish(stale.id);
        const timedOut = await prisma.post.findUnique({
          where: { id: blockedPost.id },
          include: { attempts: true },
        });
        assert.equal(timedOut.status, 'FAILED');
        assert.equal(timedOut.attempts[0].errorCode, 'LEASE_EXPIRED');
      },
    );
    await t.test(
      'Meta OAuth is single-use, session-bound, encrypted and workspace-scoped',
      async () => {
        const start = await post(
          '/connections/meta/start',
          {},
          cookie,
          session.csrfToken,
        );
        assert.equal(start.status, 201);
        const state = new URL((await start.json()).url).searchParams.get('state');
        const bad = await request(
          '/connections/meta/callback?' + new URLSearchParams({ state, code: 'ok' }),
          { headers: { Cookie: otherCookie } },
        );
        assert.match(bad.headers.get('location'), /meta=failed/);
        const callback = await request(
          '/connections/meta/callback?' + new URLSearchParams({ state, code: 'ok' }),
          { headers: { Cookie: cookie } },
        );
        assert.match(callback.headers.get('location'), /meta=choose/);
        const replay = await request(
          '/connections/meta/callback?' + new URLSearchParams({ state, code: 'ok' }),
          { headers: { Cookie: cookie } },
        );
        assert.match(replay.headers.get('location'), /meta=failed/);
        const pendingResponse = await request('/connections/meta/pending', {
          headers: { Cookie: cookie },
        });
        const pendingText = await pendingResponse.text();
        assert.equal(pendingText.includes('private-provider-token'), false);
        const pending = JSON.parse(pendingText);
        assert.equal(pending.accounts.length, 1);
        assert.equal(
          (
            await post(
              '/connections/meta/connect',
              { keys: ['FACEBOOK:foreign'] },
              cookie,
              session.csrfToken,
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await post(
              '/connections/meta/connect',
              { keys: [pending.accounts[0].key] },
              otherCookie,
              otherSession.csrfToken,
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await post(
              '/connections/meta/connect',
              { keys: [pending.accounts[0].key] },
              cookie,
              session.csrfToken,
            )
          ).status,
          201,
        );
        assert.equal(
          (
            await post(
              '/connections/meta/connect',
              { keys: [pending.accounts[0].key] },
              cookie,
              session.csrfToken,
            )
          ).status,
          400,
        );
        const connected = await prisma.channel.findFirst({
          where: { workspaceId: session.workspace.id, externalId: '12345678' },
          include: { credential: true },
        });
        assert.equal(
          crypto.open(connected.credential.encryptedToken, connected.id),
          'private-provider-token',
        );
        assert.notEqual(connected.credential.encryptedToken, 'private-provider-token');
        const listing = await (
          await request('/channels', { headers: { Cookie: cookie } })
        ).text();
        assert.equal(listing.includes('encryptedToken'), false);
        assert.equal(listing.includes('private-provider-token'), false);
        const { PublishingService } = require('../dist/modules/posts/publishing.service');
        const created = await (
          await post(
            '/posts',
            {
              title: 'Unknown',
              content: '[test-uncertain]',
              channelId: connected.id,
              clientRequestId: randomUUID(),
            },
            cookie,
            session.csrfToken,
          )
        ).json();
        await post(
          '/posts/' + created.id + '/publish',
          { expectedVersion: 1 },
          cookie,
          session.csrfToken,
        );
        await app.get(PublishingService).tick();
        const current = await prisma.post.findUnique({
          where: { id: created.id },
          include: { attempts: true },
        });
        assert.equal(current.attempts[0].errorCode, 'PUBLISH_UNCERTAIN');
        assert.ok(current.attempts[0].dispatchStartedAt);
        assert.equal(
          (
            await post(
              '/posts/' + created.id + '/publish',
              { expectedVersion: current.version },
              cookie,
              session.csrfToken,
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await post(
              '/posts/' + created.id + '/acknowledge-uncertain',
              { expectedVersion: current.version },
              cookie,
              session.csrfToken,
            )
          ).status,
          201,
        );
        assert.equal(
          graphCalls.filter((call) => call.params?.message === '[test-uncertain]').length,
          1,
        );
        const future = new Date(Date.now() + 60 * 60_000).toISOString();
        const planned = await (
          await post(
            '/posts',
            {
              title: 'Keep schedule',
              content: 'Scheduled body',
              channelId: connected.id,
              clientRequestId: randomUUID(),
            },
            cookie,
            session.csrfToken,
          )
        ).json();
        assert.equal(
          (
            await post(
              '/posts/' + planned.id + '/schedule',
              { expectedVersion: 1, scheduledAt: future },
              cookie,
              session.csrfToken,
            )
          ).status,
          201,
        );
        const disconnect = await request('/connections/meta/' + connected.id, {
          method: 'DELETE',
          headers: {
            Cookie: cookie,
            Origin: process.env.WEB_ORIGIN,
            'X-CSRF-Token': session.csrfToken,
          },
        });
        assert.equal(disconnect.status, 200);
        assert.equal(
          await prisma.channelCredential.count({ where: { channelId: connected.id } }),
          0,
        );
        const retained = await prisma.post.findUnique({ where: { id: planned.id } });
        assert.equal(retained.status, 'SCHEDULED');
        assert.equal(retained.scheduledAt.toISOString(), future);
      },
    );
    await t.test(
      'Facebook photos and Instagram carousel publish with scoped expiring media URLs',
      async () => {
        const { MediaService } = require('../dist/modules/media/media.service');
        const { PublishingService } = require('../dist/modules/posts/publishing.service');
        const media = app.get(MediaService);
        const worker = app.get(PublishingService);
        for (const platform of ['FACEBOOK', 'INSTAGRAM']) {
          const account = await seedAccount(session.workspace.id, platform, 'Image test');
          const mediaIds = [];
          const bytes = Buffer.from([255, 216, 255, 224, 0, 16, 74, 70, 73, 70]);
          for (let i = 0; i < 2; i++) {
            const upload = await media.createUpload(session.workspace.id, {
              filename: 'test.jpg',
              mimeType: 'image/jpeg',
              size: bytes.length,
            });
            await media.upload(upload.assetId, upload.token, {
              buffer: bytes,
              size: bytes.length,
              mimetype: 'image/jpeg',
            });
            await media.complete(session.workspace.id, upload.assetId);
            mediaIds.push(upload.assetId);
          }
          const draft = await (
            await post(
              '/posts',
              {
                title: 'Photos ' + platform,
                content: 'Photo body ' + platform,
                channelId: account.id,
                mediaAssetIds: mediaIds,
                clientRequestId: randomUUID(),
              },
              cookie,
              session.csrfToken,
            )
          ).json();
          const callStart = graphCalls.length;
          assert.equal(
            (
              await post(
                '/posts/' + draft.id + '/publish',
                { expectedVersion: 1 },
                cookie,
                session.csrfToken,
              )
            ).status,
            201,
          );
          await worker.tick();
          const current = await prisma.post.findUnique({
            where: { id: draft.id },
            include: { attempts: true },
          });
          assert.equal(current.status, 'PUBLISHED');
          assert.match(current.attempts[0].externalPostId, /^provider-/);
          const calls = graphCalls
            .slice(callStart)
            .filter((call) => call.path.startsWith(account.externalId + '/'));
          const uploads = calls.filter(
            (call) => call.params.url || call.params.image_url,
          );
          assert.equal(uploads.length, 2);
          if (platform === 'FACEBOOK') {
            assert.ok(uploads.every((call) => call.params.published === 'false'));
            assert.ok(calls.at(-1).params['attached_media[0]']);
            assert.ok(calls.at(-1).params['attached_media[1]']);
            assert.match(calls.at(-1).path, /\/feed$/);
          } else {
            assert.ok(uploads.every((call) => call.params.is_carousel_item === 'true'));
            assert.equal(
              calls
                .find((call) => call.params.media_type === 'CAROUSEL')
                .params.children.split(',').length,
              2,
            );
            assert.match(calls.at(-1).path, /\/media_publish$/);
          }
          const signed = new URL(uploads[0].params.url || uploads[0].params.image_url);
          const mediaResponse = await fetch(base + signed.pathname + signed.search);
          assert.equal(mediaResponse.status, 200);
          assert.deepEqual(Buffer.from(await mediaResponse.arrayBuffer()), bytes);
          signed.searchParams.set('signature', 'invalid');
          assert.equal((await fetch(base + signed.pathname + signed.search)).status, 404);
          const expired = String(Math.floor(Date.now() / 1000) - 10);
          signed.searchParams.set('expires', expired);
          signed.searchParams.set(
            'signature',
            crypto.sign(current.attempts[0].id + ':' + mediaIds[0] + ':' + expired),
          );
          assert.equal((await fetch(base + signed.pathname + signed.search)).status, 404);
          // Test-only fixtures are removed after verifying external boundaries.
          await prisma.post.delete({ where: { id: draft.id } });
          for (const id of mediaIds) await media.remove(session.workspace.id, id);
        }
      },
    );
    await t.test(
      'wrong credentials are generic; CSRF and session revocation enforced',
      async () => {
        const bad = await post('/auth/login', { email, password: 'wrong' });
        const missing = await post('/auth/login', {
          email: 'absent-' + email,
          password: 'wrong',
        });
        assert.equal(bad.status, 401);
        assert.deepEqual(await bad.json(), await missing.json());
        assert.equal((await post('/auth/logout', {}, cookie)).status, 403);
        assert.equal(
          (
            await post(
              '/auth/logout',
              {},
              cookie,
              session.csrfToken,
              'https://foreign.example',
            )
          ).status,
          403,
        );
        assert.equal(
          (await post('/auth/logout', {}, cookie, session.csrfToken)).status,
          204,
        );
        assert.equal(
          (await request('/auth/me', { headers: { Cookie: cookie } })).status,
          401,
        );
        const login = await post('/auth/login', { email, password });
        assert.equal(login.status, 200);
        cookie = login.headers.get('set-cookie').split(';')[0];
        assert.equal(
          (await request('/auth/me', { headers: { Cookie: cookie } })).status,
          200,
        );
        await prisma.session.updateMany({
          where: { userId: session.user.id },
          data: { expiresAt: new Date(0) },
        });
        assert.equal(
          (await request('/auth/me', { headers: { Cookie: cookie } })).status,
          401,
        );
      },
    );
    await t.test(
      'OAuth rejects missing state, cancellation, conflict, failure and replay',
      async () => {
        const invalid = await request('/auth/google/callback?code=x');
        assert.match(invalid.headers.get('location'), /invalid_state$/);
        for (const [code, expected] of [
          ['conflict', 'account_exists'],
          ['failure', 'provider_error'],
          ['cancel', 'cancelled'],
        ]) {
          const attempt = await begin();
          const result = await request(
            '/auth/google/callback?state=' +
              attempt.state +
              (code === 'cancel' ? '&error=access_denied' : '&code=' + code),
            { headers: { Cookie: attempt.cookie } },
          );
          assert.match(result.headers.get('location'), new RegExp(expected + '$'));
          const replay = await request(
            '/auth/google/callback?state=' + attempt.state + '&code=ok',
            { headers: { Cookie: attempt.cookie } },
          );
          assert.match(replay.headers.get('location'), /invalid_state$/);
        }
      },
    );
    await t.test(
      'Google creates one isolated workspace and supports repeat login',
      async () => {
        const attempt = await begin();
        const result = await request(
          '/auth/google/callback?state=' + attempt.state + '&code=ok',
          { headers: { Cookie: attempt.cookie } },
        );
        assert.equal(result.headers.get('location'), 'http://localhost:3017/dashboard');
        const googleCookie = result.headers
          .getSetCookie()
          .find((x) => x.startsWith('sf_session='))
          .split(';')[0];
        const profile = await (
          await request('/auth/me', { headers: { Cookie: googleCookie } })
        ).json();
        assert.notEqual(profile.workspace.id, session.workspace.id);
        const channels = await (
          await request('/channels', { headers: { Cookie: googleCookie } })
        ).json();
        assert.deepEqual(
          channels.map(({ id, name, platform, isMock, isActive }) => ({
            id,
            name,
            platform,
            isMock,
            isActive,
          })),
          profile.workspace.channels,
        );
        assert.ok(channels.every((channel) => channel._count.posts === 0));
        await auth.signInGoogle({ googleId: suffix, email: googleEmail, name: 'Again' });
        assert.equal(await prisma.user.count({ where: { googleId: suffix } }), 1);
        await assert.rejects(auth.login({ email: googleEmail, password }), {
          status: 401,
        });
      },
    );
    await t.test('OAuth expires and can be consumed only once concurrently', async () => {
      const expired = await auth.begin();
      states.push(expired.state);
      const { hashToken } = require('../dist/modules/auth/auth.crypto');
      await prisma.oAuthAttempt.update({
        where: { stateHash: hashToken(expired.state) },
        data: { expiresAt: new Date(0) },
      });
      await assert.rejects(auth.consumeAttempt(expired.state));
      const once = await auth.begin();
      states.push(once.state);
      const results = await Promise.allSettled([
        auth.consumeAttempt(once.state),
        auth.consumeAttempt(once.state),
      ]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    });
    await t.test('rate limiter rejects the eleventh attempt', () => {
      const guard = new AuthRateGuard();
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({ ip: 'test-ip' }),
          getResponse: () => ({ setHeader: () => {} }),
        }),
      };
      for (let i = 0; i < 10; i++) assert.equal(guard.canActivate(context), true);
      assert.throws(() => guard.canActivate(context), { status: 429 });
    });
  } finally {
    const { hashToken } = require('../dist/modules/auth/auth.crypto');
    await prisma.oAuthAttempt.deleteMany({
      where: { stateHash: { in: states.map(hashToken) } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [email, googleEmail, otherEmail] } },
    });
    await app.close();
  }
});
