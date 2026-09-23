/* eslint-disable @typescript-eslint/no-require-imports */
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ConfigService } = require('@nestjs/config');
const { MetaGraph } = require('../dist/modules/meta/meta.graph');
const { MetaCrypto } = require('../dist/modules/meta/meta.crypto');
const config = new ConfigService({
  META_APP_ID: '123',
  META_APP_SECRET: 'secret',
  META_GRAPH_VERSION: 'v25.0',
  META_CALLBACK_URL: 'https://api.example.test/api/connections/meta/callback',
  META_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString('base64'),
});

test('token encryption detects tampering and binds the token to its channel', () => {
  const crypto = new MetaCrypto(config);
  const encrypted = crypto.seal('provider-secret', 'channel-a');
  assert.equal(crypto.open(encrypted, 'channel-a'), 'provider-secret');
  assert.throws(() => crypto.open(encrypted, 'channel-b'));
  const parts = encrypted.split('.');
  parts[2] = Buffer.from('tampered').toString('base64url');
  assert.throws(() => crypto.open(parts.join('.'), 'channel-a'));
  const signed = crypto.sign('attempt:asset:expiry');
  assert.equal(crypto.verify('attempt:other:expiry', signed), false);
  assert.equal(crypto.verify('attempt:asset:expiry', signed), true);
});

test('local Facebook text flow requests only Page permissions by default', () => {
  const graph = new MetaGraph(config);
  const url = new URL(graph.authorizeUrl('state-value'));
  assert.deepEqual(url.searchParams.get('scope').split(','), [
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
  ]);
  assert.equal(url.searchParams.get('redirect_uri'), config.get('META_CALLBACK_URL'));
  assert.equal(url.searchParams.get('scope').includes('instagram'), false);
  const instagram = new MetaGraph(
    new ConfigService({ ...config.internalConfig, META_ENABLE_INSTAGRAM: 'true' }),
  );
  assert.match(
    new URL(instagram.authorizeUrl('state-value')).searchParams.get('scope'),
    /instagram_content_publish/,
  );
});

test('Graph transport uses bearer headers and safely distinguishes uncertain publication', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  const graph = new MetaGraph(config);
  let calls = 0;
  global.fetch = async (url, options) => {
    calls++;
    assert.equal(url.hostname, 'graph.facebook.com');
    assert.equal(url.searchParams.has('access_token'), false);
    assert.equal(options.headers.Authorization, 'Bearer private-token');
    assert.equal(options.redirect, 'error');
    assert.equal(options.body.get('message'), 'Hello');
    return Response.json({ id: 'page_post' });
  };
  assert.deepEqual(
    await graph.call('123/feed', 'private-token', { message: 'Hello' }, 'POST', true),
    { id: 'page_post' },
  );
  assert.equal(calls, 1);
  global.fetch = async () => {
    throw new Error('timeout with private-token');
  };
  await assert.rejects(
    graph.call('123/feed', 'private-token', {}, 'POST', true),
    (error) =>
      error.code === 'PUBLISH_UNCERTAIN' && !error.message.includes('private-token'),
  );
  global.fetch = async () =>
    Response.json(
      { error: { code: 190, message: 'provider private-token' } },
      { status: 400 },
    );
  await assert.rejects(
    graph.call('123/feed', 'private-token', {}, 'POST', true),
    (error) =>
      error.code === 'META_RECONNECT_REQUIRED' &&
      !error.message.includes('private-token'),
  );
  global.fetch = async () => Response.json({ error: { code: 2 } }, { status: 500 });
  await assert.rejects(
    graph.call('123/feed', 'private-token', {}, 'POST', true),
    (error) => error.code === 'PUBLISH_UNCERTAIN',
  );
});

test('Meta discovery filters permissions and follows only the cursor on the trusted host', async () => {
  const graph = new MetaGraph(config);
  const calls = [];
  graph.call = async (path, token, params) => {
    calls.push({ path, params });
    if (path === 'oauth/access_token')
      return { access_token: 'user-token', expires_in: 3600 };
    if (path === 'me/permissions')
      return {
        data: [
          'pages_show_list',
          'pages_read_engagement',
          'pages_manage_posts',
          'instagram_basic',
          'instagram_content_publish',
        ].map((permission) => ({ permission, status: 'granted' })),
      };
    if (path === 'me/accounts' && !params.after)
      return {
        data: [
          {
            id: '1',
            name: 'My Page',
            access_token: 'page-token',
            tasks: ['CREATE_CONTENT'],
            instagram_business_account: { id: '2', username: 'my_instagram' },
          },
          { id: '3', name: 'No rights', access_token: 'other-token', tasks: ['ANALYZE'] },
        ],
        paging: {
          next: 'https://untrusted.example/steal',
          cursors: { after: 'next-page' },
        },
      };
    assert.equal(params.after, 'next-page');
    return {
      data: [{ id: '4', name: 'Page two', access_token: 'token-two', tasks: ['MANAGE'] }],
    };
  };
  const accounts = await graph.discover('code');
  assert.deepEqual(
    accounts.map(({ id }) => id),
    ['1', '2', '4'],
  );
  assert.equal(calls.filter(({ path }) => path === 'me/accounts').length, 2);
  assert.equal(accounts[1].pageId, '1');
});
