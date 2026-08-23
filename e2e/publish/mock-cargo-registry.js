const http = require('node:http');
const crypto = require('node:crypto');

const crates = new Map();
const index = new Map();

function indexPath(name) {
  const normalized = name.toLowerCase();
  if (normalized.length === 1) return `1/${normalized}`;
  if (normalized.length === 2) return `2/${normalized}`;
  if (normalized.length === 3) return `3/${normalized[0]}/${normalized}`;
  return `${normalized.slice(0, 2)}/${normalized.slice(2, 4)}/${normalized}`;
}

function sendJson(response, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    'content-type': 'application/json',
    'content-length': body.length,
  });
  response.end(body);
}

function parsePublishBody(body) {
  const metadataLength = body.readUInt32LE(0);
  const metadataStart = 4;
  const metadataEnd = metadataStart + metadataLength;
  const metadata = JSON.parse(body.subarray(metadataStart, metadataEnd).toString('utf8'));
  const crateLength = body.readUInt32LE(metadataEnd);
  const crate = body.subarray(metadataEnd + 4, metadataEnd + 4 + crateLength);
  return { metadata, crate };
}

function toIndexEntry(metadata, checksum) {
  const entry = {
    name: metadata.name,
    vers: metadata.vers,
    deps: (metadata.deps || []).map((dependency) => ({
      name: dependency.explicit_name_in_toml || dependency.name,
      req: dependency.version_req,
      features: dependency.features || [],
      optional: Boolean(dependency.optional),
      default_features: dependency.default_features !== false,
      target: dependency.target || null,
      kind: dependency.kind || 'normal',
      registry: dependency.registry || null,
      package: dependency.explicit_name_in_toml ? dependency.name : undefined,
    })),
    cksum: checksum,
    features: metadata.features || {},
    yanked: false,
    links: metadata.links || null,
  };
  if (metadata.rust_version) entry.rust_version = metadata.rust_version;
  return entry;
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://cargo-registry:8000');

  if (request.method === 'GET' && url.pathname === '/health') {
    return sendJson(response, 200, { ok: true });
  }

  if (request.method === 'GET' && url.pathname === '/index/config.json') {
    return sendJson(response, 200, {
      dl: 'http://cargo-registry:8000/api/v1/crates',
      api: 'http://cargo-registry:8000',
    });
  }

  if (request.method === 'GET' && url.pathname.startsWith('/index/')) {
    const key = url.pathname.slice('/index/'.length);
    const entries = index.get(key);
    if (!entries) return sendJson(response, 404, { errors: [{ detail: 'crate not found' }] });
    const body = Buffer.from(`${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`);
    response.writeHead(200, {
      'content-type': 'text/plain',
      'content-length': body.length,
      etag: `"${crypto.createHash('sha256').update(body).digest('hex')}"`,
    });
    return response.end(body);
  }

  const downloadMatch = url.pathname.match(/^\/api\/v1\/crates\/([^/]+)\/([^/]+)\/download$/);
  if (request.method === 'GET' && downloadMatch) {
    const crate = crates.get(`${downloadMatch[1]}@${downloadMatch[2]}`);
    if (!crate) return sendJson(response, 404, { errors: [{ detail: 'crate archive not found' }] });
    response.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-length': crate.length,
    });
    return response.end(crate);
  }

  if (request.method === 'PUT' && url.pathname === '/api/v1/crates/new') {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      try {
        const { metadata, crate } = parsePublishBody(Buffer.concat(chunks));
        const checksum = crypto.createHash('sha256').update(crate).digest('hex');
        crates.set(`${metadata.name}@${metadata.vers}`, crate);
        const key = indexPath(metadata.name);
        const entries = index.get(key) || [];
        entries.push(toIndexEntry(metadata, checksum));
        index.set(key, entries);
        sendJson(response, 200, { ok: true });
      } catch (error) {
        sendJson(response, 400, { errors: [{ detail: error.message }] });
      }
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/v1/crates') {
    return sendJson(response, 200, { crates: [], meta: { total: 0 } });
  }

  sendJson(response, 404, { errors: [{ detail: 'not found' }] });
});

server.listen(8000, '0.0.0.0', () => {
  console.log('Cargo registry mock listening on port 8000');
});
