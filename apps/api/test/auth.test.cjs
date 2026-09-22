/* eslint-disable @typescript-eslint/no-require-imports */
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Test } = require('@nestjs/testing');
const { AppModule } = require('../dist/app.module');
const { setupApp } = require('../dist/config/setup-app');
const { PrismaService } = require('../dist/database/prisma.service');
const { GoogleProvider } = require('../dist/modules/auth/google.provider');
const { AuthService } = require('../dist/modules/auth/auth.service');
const { AuthRateGuard } = require('../dist/modules/auth/auth-rate.guard');

test('authentication HTTP integration with isolated test database', async (t) => {
  assert.match(new URL(process.env.DATABASE_URL).pathname, /_test$/);
  const suffix = randomUUID();
  const email = 'auth-' + suffix + '@example.com';
  const googleEmail = 'google-' + suffix + '@example.com';
  const otherEmail = 'other-' + suffix + '@example.com';
  process.env.WEB_ORIGIN = 'http://localhost:3017';
  process.env.NODE_ENV = 'test';
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
        assert.equal(session.workspace.channels.length, 2);
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
        assert.deepEqual(channels, profile.workspace.channels);
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
