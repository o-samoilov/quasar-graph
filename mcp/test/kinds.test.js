import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCodeNode, mapKindToType, mapRoleToType } from '../src/transform/kinds.js';

test('each infrastructure kind maps to its own node type', () => {
  for (const k of ['database', 'cache', 'queue', 'storage', 'monitoring', 'auth_provider', 'cdn', 'search', 'realtime']) {
    assert.equal(mapKindToType(k), k);
  }
});

test('external_service kind maps to external_api', () => {
  assert.equal(mapKindToType('external_service'), 'external_api');
});

test('gateway kind maps to a gateway node', () => {
  assert.equal(mapKindToType('gateway'), 'gateway');
});

test('unrecognized kind falls back to other', () => {
  assert.equal(mapKindToType('mystery'), 'other');
});

test('role service maps to a service node', () => {
  assert.equal(mapRoleToType('service'), 'service');
});

test('role library maps to a library node', () => {
  assert.equal(mapRoleToType('library'), 'library');
});

test('role admin_panel maps to an admin_panel node', () => {
  assert.equal(mapRoleToType('admin_panel'), 'admin_panel');
});

test('client/absent/unknown role maps to a project node', () => {
  assert.equal(mapRoleToType('client'), 'project');
  assert.equal(mapRoleToType(null), 'project');
  assert.equal(mapRoleToType(undefined), 'project');
  assert.equal(mapRoleToType('mystery'), 'project');
});

test('a node with a repoUrl or projectPath is a code node whatever its type', () => {
  assert.equal(isCodeNode({ type: 'admin_panel', repoUrl: 'https://github.com/org/x', projectPath: null }), true);
  assert.equal(isCodeNode({ type: 'rest_api', repoUrl: 'https://github.com/org/y', projectPath: 'apps/y' }), true);
  assert.equal(isCodeNode({ type: 'publisher', repoUrl: null, projectPath: 'apps/pub' }), true);
});

test('project-role node types are code nodes even without repoUrl/projectPath', () => {
  for (const type of ['project', 'service', 'library', 'admin_panel']) {
    assert.equal(isCodeNode({ type, repoUrl: null, projectPath: null }), true);
  }
});

test('a resource node without repoUrl/projectPath is not a code node', () => {
  assert.equal(isCodeNode({ type: 'cache', repoUrl: null, projectPath: null }), false);
  assert.equal(isCodeNode({ type: 'external_api' }), false);
});
