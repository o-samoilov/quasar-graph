import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNodes } from '../src/transform/nodes.js';

const session = {
  projects: [
    { name: 'acme-backend', language: 'typescript', framework: 'nestjs', description: 'API.', connections: [] },
  ],
  resources: [
    { slug: 'mongodb-acme', kind: 'database', type: 'mongodb', port: 27017, engine: 'mongodb', host: null, adminUrl: 'http://localhost:8081', description: 'DB.', consumers: [] },
    { slug: 'stripe', kind: 'external_service', type: 'stripe', port: null, engine: 'stripe', host: 'api.stripe.com', adminUrl: null, description: 'Billing.', consumers: [] },
  ],
};

test('project becomes a project node with technologies', () => {
  const nodes = buildNodes(session);
  const p = nodes.find((n) => n.key === 'project:acme-backend');
  assert.equal(p.type, 'project');
  assert.equal(p.name, 'acme-backend');
  assert.equal(p.description, 'API.');
  assert.deepEqual(p.data, { technologies: ['typescript', 'nestjs'] });
});

test('project with role service becomes a service node carrying port and technologies', () => {
  const svcSession = {
    projects: [
      { name: 'api', language: 'php', framework: 'symfony', role: 'service', port: 8000, description: 'Backend.', connections: [] },
    ],
    resources: [],
  };
  const nodes = buildNodes(svcSession);
  const svc = nodes.find((n) => n.name === 'api');
  assert.equal(svc.type, 'service');
  assert.equal(svc.key, 'service:api');
  assert.deepEqual(svc.data, { technologies: ['php', 'symfony'], port: 8000 });
});

test('service node without a known port sends port null', () => {
  const svcSession = {
    projects: [{ name: 'api', language: 'go', framework: null, role: 'service', description: 'Backend.', connections: [] }],
    resources: [],
  };
  const svc = buildNodes(svcSession).find((n) => n.name === 'api');
  assert.deepEqual(svc.data, { technologies: ['go'], port: null });
});

test('project with role client (or omitted) stays a project node without a port', () => {
  const clientSession = {
    projects: [{ name: 'web', language: 'typescript', framework: 'vue', role: 'client', description: 'UI.', connections: [] }],
    resources: [],
  };
  const node = buildNodes(clientSession).find((n) => n.name === 'web');
  assert.equal(node.type, 'project');
  assert.deepEqual(node.data, { technologies: ['typescript', 'vue'] });
});

test('project node has no links by default', () => {
  const node = buildNodes(session).find((n) => n.key === 'project:acme-backend');
  assert.deepEqual(node.links, []);
});

test('project admin_url surfaces as an Admin Panel link on the node', () => {
  const withAdmin = {
    projects: [
      { name: 'api', language: 'php', framework: 'symfony', role: 'service', description: 'Backend.', adminUrl: 'https://admin.example.com', connections: [] },
    ],
    resources: [],
  };
  const svc = buildNodes(withAdmin).find((n) => n.name === 'api');
  assert.deepEqual(svc.links, [{ name: 'Admin Panel', url: 'https://admin.example.com' }]);
});

test('database resource becomes a database node with engine and port', () => {
  const nodes = buildNodes(session);
  const db = nodes.find((n) => n.key === 'database:mongodb-acme');
  assert.equal(db.type, 'database');
  assert.deepEqual(db.data, { engine: 'mongodb', port: 27017 });
});

test('project node without a scanDir falls back to the absolute projectPath, and carries repoUrl', () => {
  const withMeta = {
    projects: [
      { name: 'svc', language: 'go', framework: null, description: 'Svc.', projectPath: '/abs/projects/svc', repoUrl: 'git@github.com:org/svc.git', connections: [] },
    ],
    resources: [],
  };
  const nodes = buildNodes(withMeta);
  const p = nodes.find((n) => n.name === 'svc');
  assert.equal(p.projectPath, '/abs/projects/svc');
  assert.equal(p.repoUrl, 'https://github.com/org/svc');
});

test('repoUrl is normalized to canonical HTTPS (no .git) across remote shapes', () => {
  const cases = [
    ['git@gitlab.com:acme/site.git', 'https://gitlab.com/acme/site'],
    ['git@github.com:org/svc.git', 'https://github.com/org/svc'],
    ['ssh://git@github.com:22/org/svc.git', 'https://github.com/org/svc'],
    ['git://github.com/org/svc.git', 'https://github.com/org/svc'],
    ['https://github.com/org/svc.git', 'https://github.com/org/svc'],
    ['https://github.com/org/svc', 'https://github.com/org/svc'],
  ];
  for (const [input, expected] of cases) {
    const node = buildNodes({
      projects: [{ name: 'svc', language: 'go', framework: null, description: 'S.', repoUrl: input, connections: [] }],
      resources: [],
    }).find((n) => n.name === 'svc');
    assert.equal(node.repoUrl, expected, `repoUrl ${input}`);
  }
});

test('an unparseable repoUrl passes through untouched, and null stays null', () => {
  const weird = buildNodes({
    projects: [{ name: 'a', language: 'go', framework: null, description: 'S.', repoUrl: 'not-a-url', connections: [] }],
    resources: [],
  }).find((n) => n.name === 'a');
  assert.equal(weird.repoUrl, 'not-a-url');
  const none = buildNodes({
    projects: [{ name: 'b', language: 'go', framework: null, description: 'S.', connections: [] }],
    resources: [],
  }).find((n) => n.name === 'b');
  assert.equal(none.repoUrl, null);
});

test('project node emits projectPath relative to scanDir (portable across machines)', () => {
  const withScan = {
    scanDir: '/Users/alice/Projects/acme',
    projects: [
      { name: 'acme-site', language: 'js', framework: null, description: 'Site.', projectPath: '/Users/alice/Projects/acme/frontend/acme-site', repoUrl: null, connections: [] },
    ],
    resources: [],
  };
  const p = buildNodes(withScan).find((n) => n.name === 'acme-site');
  assert.equal(p.projectPath, 'frontend/acme-site');
});

test('project node whose path equals the scan root emits "."', () => {
  const atRoot = {
    scanDir: '/abs/projects/svc',
    projects: [{ name: 'svc', language: 'go', framework: null, description: 'S.', projectPath: '/abs/projects/svc', repoUrl: null, connections: [] }],
    resources: [],
  };
  const p = buildNodes(atRoot).find((n) => n.name === 'svc');
  assert.equal(p.projectPath, '.');
});

test('project node outside the scan root keeps the absolute projectPath', () => {
  const outside = {
    scanDir: '/abs/projects',
    projects: [{ name: 'svc', language: 'go', framework: null, description: 'S.', projectPath: '/elsewhere/svc', repoUrl: null, connections: [] }],
    resources: [],
  };
  const p = buildNodes(outside).find((n) => n.name === 'svc');
  assert.equal(p.projectPath, '/elsewhere/svc');
});

test('project node without projectPath/repoUrl defaults them to null', () => {
  const nodes = buildNodes(session);
  const p = nodes.find((n) => n.key === 'project:acme-backend');
  assert.equal(p.projectPath, null);
  assert.equal(p.repoUrl, null);
});

test('database resource without a port sends null, not a 0 placeholder', () => {
  const noPort = {
    projects: [],
    resources: [
      { slug: 'pg', kind: 'database', type: 'postgres', port: null, engine: 'postgres', host: 'pg', adminUrl: null, description: 'PG.', consumers: [] },
    ],
  };
  const nodes = buildNodes(noPort);
  const db = nodes.find((n) => n.name === 'pg');
  assert.deepEqual(db.data, { engine: 'postgres', port: null });
});

test('cache/queue/storage resources become own-typed nodes with engine and port, no fabricated engine', () => {
  const infra = {
    projects: [],
    resources: [
      { slug: 'redis-acme', kind: 'cache', type: 'redis', port: 6379, engine: 'redis', host: null, adminUrl: null, description: 'Cache.', consumers: [] },
      { slug: 'rabbitmq', kind: 'queue', type: 'rabbitmq', port: 5672, engine: null, host: null, adminUrl: null, description: 'Queue.', consumers: [] },
      { slug: 's3-uploads', kind: 'storage', type: null, port: null, engine: null, host: null, adminUrl: null, description: 'Storage.', consumers: [] },
    ],
  };
  const nodes = buildNodes(infra);
  const cache = nodes.find((n) => n.key === 'cache:redis-acme');
  assert.equal(cache.type, 'cache');
  assert.deepEqual(cache.data, { engine: 'redis', port: 6379 });
  const queue = nodes.find((n) => n.key === 'queue:rabbitmq');
  assert.equal(queue.type, 'queue');
  assert.deepEqual(queue.data, { engine: 'rabbitmq', port: 5672 });
  const storage = nodes.find((n) => n.key === 'storage:s3-uploads');
  assert.equal(storage.type, 'storage');
  assert.deepEqual(storage.data, { engine: null, port: null });
});

test('monitoring/auth_provider/cdn resources become own-typed nodes with hostname', () => {
  const infra = {
    projects: [],
    resources: [
      { slug: 'grafana', kind: 'monitoring', type: 'grafana', port: null, engine: null, host: 'grafana.ops', adminUrl: null, description: 'M.', consumers: [] },
      { slug: 'firebase-auth', kind: 'auth_provider', type: 'firebase', port: null, engine: null, host: null, adminUrl: null, description: 'A.', consumers: [] },
      { slug: 'cloudfront', kind: 'cdn', type: 'cloudfront', port: null, engine: null, host: 'cdn.example.com', adminUrl: null, description: 'C.', consumers: [] },
    ],
  };
  const nodes = buildNodes(infra);
  const mon = nodes.find((n) => n.key === 'monitoring:grafana');
  assert.equal(mon.type, 'monitoring');
  assert.deepEqual(mon.data, { hostname: 'grafana.ops' });
  const auth = nodes.find((n) => n.key === 'auth_provider:firebase-auth');
  assert.equal(auth.type, 'auth_provider');
  assert.deepEqual(auth.data, { hostname: null });
  const cdn = nodes.find((n) => n.key === 'cdn:cloudfront');
  assert.equal(cdn.type, 'cdn');
  assert.deepEqual(cdn.data, { hostname: 'cdn.example.com' });
});

test('project with role library becomes a library node with packageName and no port', () => {
  const libSession = {
    projects: [
      { name: 'shared-lib', language: 'typescript', framework: null, role: 'library', packageName: '@acme/shared', description: 'Shared SDK.', connections: [] },
    ],
    resources: [],
  };
  const lib = buildNodes(libSession).find((n) => n.name === 'shared-lib');
  assert.equal(lib.type, 'library');
  assert.equal(lib.key, 'library:shared-lib');
  assert.deepEqual(lib.data, { technologies: ['typescript'], packageName: '@acme/shared' });
});

test('project with role admin_panel becomes an admin_panel node with technologies like any other project', () => {
  const adminSession = {
    projects: [
      { name: 'ops-admin', language: 'typescript', framework: 'react', role: 'admin_panel', description: 'Admin UI.', connections: [] },
    ],
    resources: [],
  };
  const admin = buildNodes(adminSession).find((n) => n.name === 'ops-admin');
  assert.equal(admin.type, 'admin_panel');
  assert.equal(admin.key, 'admin_panel:ops-admin');
  assert.deepEqual(admin.data, { technologies: ['typescript', 'react'] });
});

test('library node without a packageName sends packageName null', () => {
  const libSession = {
    projects: [{ name: 'utils', language: 'php', framework: null, role: 'library', description: 'Utils.', connections: [] }],
    resources: [],
  };
  const lib = buildNodes(libSession).find((n) => n.name === 'utils');
  assert.deepEqual(lib.data, { technologies: ['php'], packageName: null });
});

test('external resource becomes an external_api node with hostname', () => {
  const nodes = buildNodes(session);
  const ext = nodes.find((n) => n.key === 'external_api:stripe');
  assert.equal(ext.type, 'external_api');
  assert.deepEqual(ext.data, { hostname: 'api.stripe.com' });
});

test('search and realtime resources become own-typed nodes with engine and port', () => {
  const infra = {
    projects: [],
    resources: [
      { slug: 'elasticsearch', kind: 'search', type: 'elasticsearch', port: 9200, engine: 'elasticsearch', host: null, adminUrl: null, description: 'Search.', consumers: [] },
      { slug: 'centrifugo', kind: 'realtime', type: 'centrifugo', port: 8000, engine: 'centrifugo', host: null, adminUrl: null, description: 'Realtime.', consumers: [] },
    ],
  };
  const nodes = buildNodes(infra);
  const search = nodes.find((n) => n.key === 'search:elasticsearch');
  assert.equal(search.type, 'search');
  assert.deepEqual(search.data, { engine: 'elasticsearch', port: 9200 });
  const rt = nodes.find((n) => n.key === 'realtime:centrifugo');
  assert.equal(rt.type, 'realtime');
  assert.deepEqual(rt.data, { engine: 'centrifugo', port: 8000 });
});

test('gateway resource becomes a gateway node with hostname', () => {
  const withGateway = {
    projects: [],
    resources: [
      {
        slug: 'traefik',
        kind: 'gateway',
        type: 'traefik',
        port: null,
        engine: null,
        host: 'traefik',
        adminUrl: null,
        links: [],
        description: 'Reverse proxy / ingress.',
        consumers: [],
      },
    ],
  };
  const nodes = buildNodes(withGateway);
  const gw = nodes.find((n) => n.name === 'traefik');
  assert.equal(gw.type, 'gateway');
  assert.equal(gw.key, 'gateway:traefik');
  assert.deepEqual(gw.data, { hostname: 'traefik' });
});

test('resource with adminUrl surfaces it as a link on the resource node, not a separate admin node', () => {
  const nodes = buildNodes(session);
  assert.equal(nodes.some((n) => n.type === 'admin_panel'), false);
  const db = nodes.find((n) => n.key === 'database:mongodb-acme');
  assert.deepEqual(db.links, [{ name: 'Admin Panel', url: 'http://localhost:8081' }]);
});

test('adminUrl appends to existing frontmatter links without clobbering them', () => {
  const withBoth = {
    projects: [],
    resources: [
      { slug: 'grafana', kind: 'monitoring', type: 'grafana', host: 'grafana', adminUrl: 'https://grafana.ops', links: [{ name: 'Docs', url: 'https://docs' }], description: 'M.', consumers: [] },
    ],
  };
  const node = buildNodes(withBoth).find((n) => n.name === 'grafana');
  assert.deepEqual(node.links, [
    { name: 'Docs', url: 'https://docs' },
    { name: 'Admin Panel', url: 'https://grafana.ops' },
  ]);
});

test('adminUrl is not duplicated when a frontmatter link already points to it', () => {
  const dup = {
    projects: [],
    resources: [
      { slug: 'c', kind: 'realtime', type: 'centrifugo', host: 'c', adminUrl: 'https://c.ops', links: [{ name: 'Admin', url: 'https://c.ops' }], description: 'R.', consumers: [] },
    ],
  };
  const node = buildNodes(dup).find((n) => n.name === 'c');
  assert.deepEqual(node.links, [{ name: 'Admin', url: 'https://c.ops' }]);
});

test('resource links from frontmatter pass through onto the resource node', () => {
  const withLinks = {
    projects: [],
    resources: [
      {
        slug: 'centrifugo',
        kind: 'realtime',
        type: 'centrifugo',
        port: null,
        engine: 'centrifugo',
        host: 'centrifugo',
        adminUrl: null,
        links: [{ name: 'Admin', url: 'https://centrifugo.ops.acme.com' }],
        description: 'Realtime.',
        consumers: [],
      },
    ],
  };
  const nodes = buildNodes(withLinks);
  const node = nodes.find((n) => n.name === 'centrifugo');
  assert.deepEqual(node.links, [{ name: 'Admin', url: 'https://centrifugo.ops.acme.com' }]);
});

test('resource without links defaults to an empty links array', () => {
  const nodes = buildNodes(session);
  const ext = nodes.find((n) => n.key === 'external_api:stripe');
  assert.deepEqual(ext.links, []);
});
