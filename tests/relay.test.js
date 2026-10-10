import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RELAY_MODE,
  addRelay,
  isValidRelayUrl,
  nextRelayMode,
  normalizeRelayList,
  normalizeRelayMode,
  normalizeRelayUrl,
  promoteRelay,
  relayId,
  relayModeLabel,
  relaysForKind,
  removeRelay,
  setRelayMode,
} from '../src/domain/relay.js';

test('normalizeRelayUrl adds a scheme, lowercases host, and trims slashes', () => {
  assert.equal(normalizeRelayUrl('relay.damus.io'), 'wss://relay.damus.io');
  assert.equal(normalizeRelayUrl('WSS://Relay.Damus.io/'), 'wss://relay.damus.io');
  assert.equal(normalizeRelayUrl('wss://relay.example.com/v1/'), 'wss://relay.example.com/v1');
  assert.equal(normalizeRelayUrl('  '), '');
  assert.equal(normalizeRelayUrl('https://relay.example.com'), '');
  assert.equal(normalizeRelayUrl('not a url'), '');
});

test('normalizeRelayUrl allows plaintext ws:// and secure wss:// hosts', () => {
  assert.equal(normalizeRelayUrl('ws://localhost:7777'), 'ws://localhost:7777');
  assert.equal(normalizeRelayUrl('ws://127.0.0.1:7777'), 'ws://127.0.0.1:7777');
  assert.equal(normalizeRelayUrl('ws://relay.example.com'), 'ws://relay.example.com');
  assert.equal(normalizeRelayUrl('WS://Relay.Example.com/'), 'ws://relay.example.com');
});

test('normalizeRelayUrl defaults every localhost and IP-address host to plaintext ws://', () => {
  assert.equal(normalizeRelayUrl('localhost:7777'), 'ws://localhost:7777');
  assert.equal(normalizeRelayUrl('Localhost:7777/'), 'ws://localhost:7777');
  assert.equal(normalizeRelayUrl('localhost'), 'ws://localhost');
  assert.equal(normalizeRelayUrl('app.localhost:7777'), 'ws://app.localhost:7777');
  assert.equal(normalizeRelayUrl('127.0.0.1:7777'), 'ws://127.0.0.1:7777');
  assert.equal(normalizeRelayUrl('192.168.1.10:7777'), 'ws://192.168.1.10:7777');
  assert.equal(normalizeRelayUrl('10.0.0.5'), 'ws://10.0.0.5');
  assert.equal(normalizeRelayUrl('8.8.8.8:80'), 'ws://8.8.8.8');
  assert.equal(normalizeRelayUrl('1.2.3.4'), 'ws://1.2.3.4');
  assert.equal(normalizeRelayUrl('bitos.local'), 'ws://bitos.local');
  assert.equal(normalizeRelayUrl('abcdefg.onion'), 'ws://abcdefg.onion');
  assert.equal(normalizeRelayUrl('[::1]:7777'), 'ws://[::1]:7777');
  assert.equal(normalizeRelayUrl('[fd00::1]:7777'), 'ws://[fd00::1]:7777');
  assert.equal(normalizeRelayUrl('[2001:db8::1]:7777'), 'ws://[2001:db8::1]:7777');
  assert.equal(normalizeRelayUrl('relay.damus.io'), 'wss://relay.damus.io');
  assert.equal(normalizeRelayUrl('fcdn.example.com'), 'wss://fcdn.example.com');
  assert.equal(normalizeRelayUrl('999.1.1.1'), '');
  assert.equal(normalizeRelayUrl('example.com:443'), 'wss://example.com');
});

test('normalizeRelayUrl keeps an explicit scheme even for local hosts', () => {
  assert.equal(normalizeRelayUrl('wss://localhost:7777'), 'wss://localhost:7777');
  assert.equal(normalizeRelayUrl('ws://relay.damus.io'), 'ws://relay.damus.io');
});

test('isValidRelayUrl and relayId reflect normalization', () => {
  assert.equal(isValidRelayUrl('nos.lol'), true);
  assert.equal(isValidRelayUrl('http://nos.lol'), false);
  assert.equal(relayId('wss://nos.lol'), 'relay:wss://nos.lol');
  assert.equal(relayId(''), '');
});

test('normalizeRelayMode and labels fall back to read+write', () => {
  assert.equal(normalizeRelayMode('READ'), RELAY_MODE.READ);
  assert.equal(normalizeRelayMode('weird'), RELAY_MODE.READ_WRITE);
  assert.equal(relayModeLabel(RELAY_MODE.WRITE), 'write only');
});

test('nextRelayMode cycles read+write, read, write', () => {
  assert.equal(nextRelayMode(RELAY_MODE.READ_WRITE), RELAY_MODE.READ);
  assert.equal(nextRelayMode(RELAY_MODE.READ), RELAY_MODE.WRITE);
  assert.equal(nextRelayMode(RELAY_MODE.WRITE), RELAY_MODE.READ_WRITE);
});

test('normalizeRelayList accepts legacy strings and health objects, and dedupes', () => {
  const list = normalizeRelayList([
    'wss://relay.damus.io',
    { url: 'wss://relay.damus.io/', health: 'connected' },
    { url: 'nos.lol', mode: 'read' },
    'https://bad.example',
    '',
  ]);
  assert.deepEqual(list, [
    { id: 'relay:wss://relay.damus.io', url: 'wss://relay.damus.io', mode: RELAY_MODE.READ_WRITE },
    { id: 'relay:wss://nos.lol', url: 'wss://nos.lol', mode: RELAY_MODE.READ },
  ]);
});

test('normalizeRelayList falls back to defaults when empty', () => {
  const list = normalizeRelayList([], { defaults: ['wss://a.example'] });
  assert.equal(list.length, 1);
  assert.equal(list[0].url, 'wss://a.example');
});

test('addRelay rejects invalid and duplicate URLs', () => {
  const base = normalizeRelayList(['wss://a.example']);
  assert.equal(addRelay(base, 'http://b.example').error, 'invalid');
  assert.equal(addRelay(base, 'wss://a.example').error, 'duplicate');

  const added = addRelay(base, 'b.example');
  assert.equal(added.error, null);
  assert.equal(added.relays.length, 2);
  assert.equal(added.relays[1].url, 'wss://b.example');
});

test('removeRelay and setRelayMode act by stable id', () => {
  const list = normalizeRelayList(['wss://a.example', 'wss://b.example']);
  const removed = removeRelay(list, list[0].id);
  assert.deepEqual(
    removed.map((relay) => relay.url),
    ['wss://b.example'],
  );

  const updated = setRelayMode(list, list[1].id, 'write');
  assert.equal(updated[1].mode, RELAY_MODE.WRITE);
});

test('relaysForKind routes read, write, and read+write relays', () => {
  const list = [
    { id: '1', url: 'wss://rw.example', mode: RELAY_MODE.READ_WRITE },
    { id: '2', url: 'wss://r.example', mode: RELAY_MODE.READ },
    { id: '3', url: 'wss://w.example', mode: RELAY_MODE.WRITE },
  ];
  assert.deepEqual(relaysForKind(list, 'read'), ['wss://rw.example', 'wss://r.example']);
  assert.deepEqual(relaysForKind(list, 'write'), ['wss://rw.example', 'wss://w.example']);
});

test('promoteRelay moves a relay to the primary slot and ignores unknown ids', () => {
  const list = normalizeRelayList(['wss://a.example', 'wss://b.example', 'wss://c.example']);
  const promoted = promoteRelay(list, list[2].id);
  assert.deepEqual(
    promoted.map((relay) => relay.url),
    ['wss://c.example', 'wss://a.example', 'wss://b.example'],
  );
  assert.equal(promoted[0].id, list[2].id);

  // Unknown id and already-primary id both leave the order untouched.
  assert.deepEqual(
    promoteRelay(list, 'relay:wss://missing.example').map((relay) => relay.url),
    ['wss://a.example', 'wss://b.example', 'wss://c.example'],
  );
  assert.deepEqual(promoteRelay(list, list[0].id), list);
});
