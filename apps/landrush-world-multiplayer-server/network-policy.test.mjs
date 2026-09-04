import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  consumeMultiplayerMessageBudget,
  createMultiplayerMessageBudget,
  createMultiplayerNetworkPolicy,
  isMultiplayerOriginAllowed,
} from './network-policy.mjs'

test('defaults retain the existing host and origin behavior with finite resource bounds', () => {
  const policy = createMultiplayerNetworkPolicy({})
  assert.equal(policy.host, undefined)
  assert.equal(policy.maxConnections, 256)
  assert.equal(policy.prejoinTimeoutMs, 15_000)
  assert.equal(isMultiplayerOriginAllowed(policy, undefined), true)
  assert.equal(isMultiplayerOriginAllowed(policy, 'https://example.com'), true)
  assert.equal(policy.messagesPerSecond, 120)
  assert.equal(policy.messageBurst, 240)
  assert.equal(policy.bytesPerSecond, 8 * 1024 * 1024)
  assert.equal(policy.byteBurst, 16 * 1024 * 1024)
})

test('configured origins match exactly and reject absent, null, suffix, and scheme changes', () => {
  const policy = createMultiplayerNetworkPolicy({
    LANDRUSH_WORLD_MULTIPLAYER_HOST: '127.0.0.1',
    LANDRUSH_WORLD_MULTIPLAYER_ALLOWED_ORIGINS: 'https://landrush.niutgames.com, http://localhost:3002',
  })
  assert.equal(policy.host, '127.0.0.1')
  for (const origin of ['https://landrush.niutgames.com', 'http://localhost:3002']) {
    assert.equal(isMultiplayerOriginAllowed(policy, origin), true)
  }
  for (const origin of [undefined, 'null', 'http://landrush.niutgames.com', 'https://landrush.niutgames.com.evil', 'http://localhost:3003']) {
    assert.equal(isMultiplayerOriginAllowed(policy, origin), false)
  }
})

test('unsafe or malformed explicit settings fail closed', () => {
  for (const origin of ['', '*', 'null', 'https://site.test/', 'https://site.test/path', 'https://user@site.test', 'https://site.test,']) {
    assert.throws(() => createMultiplayerNetworkPolicy({ LANDRUSH_WORLD_MULTIPLAYER_ALLOWED_ORIGINS: origin }))
  }
  for (const host of ['', 'http://localhost', 'host with spaces']) {
    assert.throws(() => createMultiplayerNetworkPolicy({ LANDRUSH_WORLD_MULTIPLAYER_HOST: host }))
  }
  for (const value of ['', '0', '-1', '1.1', 'NaN', 'Infinity', '4097']) {
    assert.throws(() => createMultiplayerNetworkPolicy({ LANDRUSH_WORLD_MULTIPLAYER_MAX_CONNECTIONS: value }))
  }
  assert.equal(createMultiplayerNetworkPolicy({ LANDRUSH_WORLD_MULTIPLAYER_HOST: '::1' }).host, '::1')
})

test('message tokens replenish by elapsed time without accumulating beyond the burst', () => {
  const policy = { ...createMultiplayerNetworkPolicy({}), messageBurst: 2, messagesPerSecond: 2 }
  const budget = createMultiplayerMessageBudget(policy, 0)
  assert.equal(consumeMultiplayerMessageBudget(budget, policy, 1, 0), true)
  assert.equal(consumeMultiplayerMessageBudget(budget, policy, 1, 0), true)
  assert.equal(consumeMultiplayerMessageBudget(budget, policy, 1, 0), false)
  assert.equal(consumeMultiplayerMessageBudget(budget, policy, 1, 499), false)
  assert.equal(consumeMultiplayerMessageBudget(budget, policy, 1, 500), true)
  assert.equal(consumeMultiplayerMessageBudget(budget, policy, 1, 10_000), true)
  assert.equal(budget.messages, 1)
  assert.equal(consumeMultiplayerMessageBudget(budget, policy, 1, 9_000), true)
  assert.equal(consumeMultiplayerMessageBudget(budget, policy, 1, 10_000), false)
})

test('byte tokens independently bound large messages before JSON parsing', () => {
  const policy = { ...createMultiplayerNetworkPolicy({}), byteBurst: 64, bytesPerSecond: 32 }
  const budget = createMultiplayerMessageBudget(policy, 0)
  assert.equal(consumeMultiplayerMessageBudget(budget, policy, 65, 0), false)
  assert.equal(consumeMultiplayerMessageBudget(budget, policy, 64, 0), true)
  assert.equal(consumeMultiplayerMessageBudget(budget, policy, 1, 0), false)
  assert.equal(consumeMultiplayerMessageBudget(budget, policy, 32, 1000), true)
})
