import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uuidv5, nodeId, edgeId } from '../src/transform/ids.js';

const UUID_V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DNS_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

test('uuidv5 matches the RFC 4122 reference vector', () => {
  assert.equal(uuidv5('www.example.com', DNS_NAMESPACE), '2ed6657d-e927-568b-95e1-2665a8aea6a2');
});

test('nodeId is a v5 uuid and deterministic for the same graph/type/name', () => {
  const a = nodeId('g-1', 'project', 'acme-backend');
  const b = nodeId('g-1', 'project', 'acme-backend');
  assert.match(a, UUID_V5);
  assert.equal(a, b);
});

test('nodeId differs by graph, type, or name', () => {
  assert.notEqual(nodeId('g-1', 'project', 'a'), nodeId('g-2', 'project', 'a'));
  assert.notEqual(nodeId('g-1', 'project', 'a'), nodeId('g-1', 'database', 'a'));
  assert.notEqual(nodeId('g-1', 'project', 'a'), nodeId('g-1', 'project', 'b'));
});

test('edgeId is a v5 uuid keyed by graph + endpoints + type', () => {
  const e = edgeId('g-1', 'n-a', 'n-b', 'rest_api');
  assert.match(e, UUID_V5);
  assert.equal(e, edgeId('g-1', 'n-a', 'n-b', 'rest_api'));
  assert.notEqual(e, edgeId('g-2', 'n-a', 'n-b', 'rest_api'));
});
