const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { WebSocketServer } = require('ws');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { ApolloServer } = require('@apollo/server');
const { makeExecutableSchema } = require('@graphql-tools/schema');
const { useServer } = require('graphql-ws/use/ws');

// === Shared data ===
const pets = [
  { id: 'pet-1', name: 'Rex', species: 'DOG', breed: null, age: 3, status: 'AVAILABLE', ownerId: null, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
  { id: 'pet-2', name: 'Whiskers', species: 'CAT', breed: null, age: 2, status: 'ADOPTED', ownerId: null, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
];
const owners = [
  { id: 'owner-1', name: 'Alice', email: 'alice@example.com', phone: null, pets: [], createdAt: '2025-01-01T00:00:00Z' },
];
const transportStats = {
  wsConnections: 0,
  wsForcedDisconnects: 0,
  wsDisconnectCommands: 0,
  clientHeartbeats: 0,
  serverHeartbeatAcks: 0,
  gqlConnections: 0,
  gqlForcedDisconnects: 0,
  gqlDisconnects: 0,
  slowRequests: 0,
  chunkStreams: 0,
  grpcStreams: 0,
};
let forceNextWsDisconnect = false;
let forceNextGqlDisconnect = false;

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b ? JSON.parse(b) : {})); });
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readMultipart(req) {
  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!boundaryMatch) throw new Error('Missing multipart boundary');
  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const raw = (await readRawBody(req)).toString('latin1');
  const fields = {};
  const files = {};
  for (const rawPart of raw.split(`--${boundary}`)) {
    let part = rawPart;
    if (part.startsWith('\r\n')) part = part.slice(2);
    if (part.endsWith('\r\n')) part = part.slice(0, -2);
    if (!part || part === '--') continue;
    if (part.endsWith('--')) part = part.slice(0, -2);
    const separator = part.indexOf('\r\n\r\n');
    if (separator < 0) continue;
    const headers = part.slice(0, separator);
    let content = part.slice(separator + 4);
    if (content.endsWith('\r\n')) content = content.slice(0, -2);
    const disposition = /content-disposition:\s*form-data;([^\r\n]+)/i.exec(headers)?.[1] || '';
    const nameMatch = /(?:^|;)\s*name=(?:"([^"]+)"|([^;\s]+))/i.exec(disposition);
    const name = nameMatch?.[1] || nameMatch?.[2];
    if (!name) continue;
    const filenameMatch = /(?:^|;)\s*filename=(?:"([^"]*)"|([^;\s]+))/i.exec(disposition);
    const filename = filenameMatch ? (filenameMatch[1] ?? filenameMatch[2] ?? '') : undefined;
    if (filename !== undefined) {
      const file = {
        filename,
        contentType: /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim() || 'application/octet-stream',
        data: Buffer.from(content, 'latin1'),
      };
      if (!files[name]) files[name] = [];
      files[name].push(file);
    } else {
      fields[name] = Buffer.from(content, 'latin1').toString('utf8');
    }
  }
  return { fields, files };
}

// === GraphQL Schema + Resolvers (Apollo Server) ===
const typeDefs = fs.readFileSync(
  path.join(__dirname, '../../packages/core/__fixtures__/petstore.graphql'), 'utf-8'
);

const resolvers = {
  Query: {
    pets: (_p, args) => ({ data: pets.slice(0, args.limit || pets.length), nextCursor: null }),
    pet: (_p, args) => pets.find(p => p.id === args.id) || null,
    owners: (_p, args) => ({ data: owners.slice(0, args.limit || owners.length) }),
    owner: (_p, args) => owners.find(o => o.id === args.id) || null,
  },
  Mutation: {
    createPet: (_p, args) => ({ id: `pet-${Date.now()}`, ...args.input, status: 'AVAILABLE', ownerId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }),
    updatePet: (_p, args) => ({ ...pets[0], ...args.input, id: args.id }),
    deletePet: () => true,
    createOwner: (_p, args) => ({ id: `owner-${Date.now()}`, ...args.input, pets: [], createdAt: new Date().toISOString() }),
  },
  Subscription: {
    petAdopted: {
      subscribe: async function* (_p, args) {
        const filtered = args.species ? pets.filter(p => p.species === args.species) : pets;
        const items = filtered.length ? filtered : pets;
        let index = 0;
        while (true) {
          yield { petAdopted: items[index % items.length] };
          index++;
          await new Promise(r => setTimeout(r, 1000));
        }
      },
    },
    ownerActivity: {
      subscribe: async function* (_p, args) {
        const owner = owners.find(o => o.id === args.ownerId) || owners[0];
        let update = 0;
        while (true) {
          const name = update === 0 ? owner.name : `${owner.name} (update ${update})`;
          yield { ownerActivity: { ...owner, name } };
          update++;
          await new Promise(r => setTimeout(r, 1000));
        }
      },
    },
  },
  Owner: {
    pets: (owner) => owner.pets?.length ? owner.pets : pets.filter(p => p.ownerId === owner.id),
  },
};

const schema = makeExecutableSchema({ typeDefs, resolvers });
const apollo = new ApolloServer({ schema });

async function startServer() {
  await apollo.start();

  // === 1. HTTP Server (REST + GraphQL via Apollo) ===
  let wsGql;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const p = url.pathname, m = req.method;
    if (m === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' }); return res.end(); }

    // GraphQL via Apollo Server
    if (p === '/graphql' && m === 'POST') {
      const body = await readBody(req);
      const headers = new Map(Object.entries(req.headers));
      const httpGraphQLResponse = await apollo.executeHTTPGraphQLRequest({
        httpGraphQLRequest: {
          method: m,
          headers,
          body,
          search: url.search || '',
        },
        context: async () => ({}),
      });
      res.writeHead(httpGraphQLResponse.status || 200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': '*',
        'Access-Control-Allow-Headers': '*',
      });
      if (httpGraphQLResponse.body.kind === 'complete') {
        res.end(httpGraphQLResponse.body.string);
      } else {
        res.end(JSON.stringify({ data: null }));
      }
      return;
    }

    // Transport controls used by the generated SDK resilience tests.
    if (m === 'GET' && p === '/transport/status') return json(res, 200, transportStats);
    if (m === 'POST' && p === '/transport/reset') {
      for (const key of Object.keys(transportStats)) transportStats[key] = 0;
      forceNextWsDisconnect = true;
      forceNextGqlDisconnect = true;
      return json(res, 200, { armed: true });
    }
    if (m === 'POST' && p === '/transport/graphql/disconnect') {
      const clients = wsGql ? [...wsGql.clients] : [];
      transportStats.gqlDisconnects += clients.length;
      for (const client of clients) client.close(4205, 'E2E reconnect test');
      return json(res, 200, { disconnected: clients.length });
    }
    if (m === 'GET' && p === '/transport/slow') {
      transportStats.slowRequests++;
      const requestedDelay = Number(url.searchParams.get('delay') || 250);
      const delay = Number.isFinite(requestedDelay) ? Math.max(0, Math.min(requestedDelay, 5000)) : 250;
      const timer = setTimeout(() => json(res, 200, { delayed: delay }), delay);
      res.on('close', () => clearTimeout(timer));
      return;
    }

    // REST endpoints
    if (m === 'GET' && p === '/pets') return json(res, 200, { data: pets });
    if (m === 'POST' && p === '/pets') {
      const contentType = req.headers['content-type'] || '';
      if (contentType.toLowerCase().startsWith('multipart/form-data')) {
        const { fields, files } = await readMultipart(req);
        const profilePic = files.profilePic?.[0];
        const attachments = files.attachments ?? [];
        return json(res, 201, {
          id: `pet-${Date.now()}`,
          ...fields,
          ...(fields.age ? { age: Number(fields.age) } : {}),
          status: 'available',
          profile_pic_filename: profilePic?.filename ?? null,
          profile_pic_size: profilePic?.data.length ?? null,
          profile_pic_content_type: profilePic?.contentType ?? null,
          attachment_count: attachments.length,
          attachment_content_types: attachments.map((file) => file.contentType),
        });
      }
      const b = await readBody(req);
      return json(res, 201, { id: `pet-${Date.now()}`, ...b, status: 'available' });
    }
    if (m === 'POST' && p === '/uploads/raw') {
      const body = await readRawBody(req);
      return json(res, 201, {
        size: body.length,
        content_type: req.headers['content-type'] || 'application/octet-stream',
      });
    }
    if (m === 'GET' && p === '/pets/stream') {
      transportStats.chunkStreams++;
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Transfer-Encoding': 'chunked',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': '*',
        'Access-Control-Allow-Headers': '*',
      });
      let i = 0;
      const interval = setInterval(() => {
        res.write(JSON.stringify(pets[i % pets.length]) + '\n');
        i++;
        if (i >= pets.length) {
          clearInterval(interval);
          res.end();
        }
      }, 100);
      req.on('close', () => clearInterval(interval));
      return;
    }
    if (m === 'GET' && p.startsWith('/pets/')) { const x = pets.find((x) => x.id === p.split('/')[2]); return x ? json(res, 200, x) : json(res, 404, { code: 'not_found', message: 'Not found' }); }
    if (m === 'PUT' && p.startsWith('/pets/')) { const x = pets.find((x) => x.id === p.split('/')[2]); if (!x) return json(res, 404, {}); Object.assign(x, await readBody(req)); return json(res, 200, x); }
    if (m === 'DELETE' && p.startsWith('/pets/')) { res.writeHead(204); return res.end(); }
    if (m === 'GET' && p === '/owners') return json(res, 200, { data: owners });
    if (m === 'POST' && p === '/owners') { const b = await readBody(req); return json(res, 201, { id: `owner-${Date.now()}`, ...b }); }
    if (m === 'GET' && p.startsWith('/owners/')) { const x = owners.find((x) => x.id === p.split('/')[2]); return x ? json(res, 200, x) : json(res, 404, {}); }

    // JSON-RPC endpoint used by OpenRPC Try Now and generated clients
    if (m === 'POST' && p === '/rpc') {
      const body = await readBody(req);
      const params = body.params || {};
      const id = body.id ?? null;
      let result;

      switch (body.method) {
        case 'listPets':
          result = {
            data: pets.slice(0, params.limit > 0 ? params.limit : pets.length),
            nextCursor: null,
          };
          break;
        case 'getPet':
          result = pets.find((pet) => pet.id === params.id) || pets[0];
          break;
        case 'createPet':
          result = {
            id: `pet-rpc-${Date.now()}`,
            name: params.name,
            species: params.species,
            breed: params.breed || null,
            age: params.age ?? null,
            status: 'AVAILABLE',
            ownerId: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          break;
        case 'deletePet':
          result = true;
          break;
        case 'listOwners':
          result = { data: owners.slice(0, params.limit > 0 ? params.limit : owners.length) };
          break;
        case 'getOwner':
          result = owners.find((owner) => owner.id === params.id) || owners[0];
          break;
        case 'createOwner':
          result = {
            id: `owner-rpc-${Date.now()}`,
            name: params.name,
            email: params.email,
            phone: params.phone || null,
            pets: [],
            createdAt: new Date().toISOString(),
          };
          break;
        default:
          return json(res, 200, {
            jsonrpc: '2.0',
            error: { code: -32601, message: `Method not found: ${body.method}` },
            id,
          });
      }

      return json(res, 200, { jsonrpc: '2.0', result, id });
    }

    // gRPC-over-HTTP mock routes (used by C#, Rust, and other language tests)
    if (m === 'POST' && p === '/grpc/PetService/ListPets') return json(res, 200, { data: pets });
    if (m === 'POST' && p === '/grpc/PetService/GetPet') { const b = await readBody(req); const x = pets.find((x) => x.id === b.id) || pets[0]; return json(res, 200, x); }
    if (m === 'POST' && p === '/grpc/PetService/CreatePet') { const b = await readBody(req); return json(res, 200, { id: `pet-grpc-${Date.now()}`, name: b.name, species: b.species, status: 'PET_STATUS_AVAILABLE' }); }
    if (m === 'POST' && p === '/grpc/PetService/UpdatePet') { const b = await readBody(req); return json(res, 200, { ...pets[0], ...b }); }
    if (m === 'POST' && p === '/grpc/PetService/DeletePet') return json(res, 200, {});
    if (m === 'POST' && p === '/grpc/PetService/WatchPets') {
      transportStats.grpcStreams++;
      return json(res, 200, { data: pets });
    }
    if (m === 'POST' && p === '/grpc/OwnerService/ListOwners') return json(res, 200, { data: owners });
    if (m === 'POST' && p === '/grpc/OwnerService/GetOwner') { const b = await readBody(req); const x = owners.find((x) => x.id === b.id) || owners[0]; return json(res, 200, x); }
    if (m === 'POST' && p === '/grpc/OwnerService/CreateOwner') { const b = await readBody(req); return json(res, 200, { id: `owner-grpc-${Date.now()}`, name: b.name, email: b.email }); }

    if (p === '/health') return json(res, 200, { status: 'ok' });
    json(res, 404, { code: 'not_found' });
  });

  // === 2. WebSocket Server (non-GraphQL, for AsyncAPI/WS tests) ===
  const wsGeneral = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  wsGeneral.on('connection', (ws, request) => {
    transportStats.wsConnections++;
    if (forceNextWsDisconnect) {
      forceNextWsDisconnect = false;
      transportStats.wsForcedDisconnects++;
      ws.close(4205, 'E2E initial reconnect test');
      return;
    }
    let channelStream = null;
    const heartbeatMode = new URL(request.url, `http://${request.headers.host}`).searchParams.get('heartbeat');
    const serverHeartbeat = setTimeout(() => {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'cortex-server-heartbeat' }));
    }, 30);

    const channelEvent = (channel, index, publishedPayload = {}) => {
      if (channel === 'chat/messages') {
        return {
          channel,
          payload: {
            id: `message-${Date.now()}-${index}`,
            userId: 'server',
            text: publishedPayload.text || `Streaming message ${index + 1}`,
            timestamp: new Date().toISOString(),
          },
        };
      }
      if (channel === 'chat/typing') {
        return {
          channel,
          payload: {
            userId: 'server',
            isTyping: typeof publishedPayload.isTyping === 'boolean'
              ? publishedPayload.isTyping
              : index % 2 === 0,
          },
        };
      }
      if (channel === 'chat/presence') {
        return {
          channel,
          payload: {
            userId: 'server',
            status: ['online', 'away', 'online'][index % 3],
          },
        };
      }
      return { channel, payload: { ...publishedPayload, sequence: index + 1 } };
    };

    const sendChannelEvent = (channel, index, payload) => {
      if (ws.readyState === 1) ws.send(JSON.stringify(channelEvent(channel, index, payload)));
    };

    const subscribe = (channel) => {
      if (channelStream) clearInterval(channelStream);
      let index = 0;
      sendChannelEvent(channel, index++);
      channelStream = setInterval(() => sendChannelEvent(channel, index++), 1000);
    };

    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.type === 'cortex-client-heartbeat') {
          transportStats.clientHeartbeats++;
          if (heartbeatMode !== 'ignore') {
            ws.send(JSON.stringify({ type: 'cortex-server-heartbeat-ack' }));
          }
          return;
        }
        if (data.type === 'cortex-client-heartbeat-ack') {
          transportStats.serverHeartbeatAcks++;
          return;
        }
        if (data.channel === '__control__/disconnect') {
          transportStats.wsDisconnectCommands++;
          ws.close(4205, 'E2E reconnect test');
          return;
        }
        if (data.type === 'subscribe' && data.channel) {
          subscribe(data.channel);
          return;
        }
        sendChannelEvent(data.channel, 0, data.payload || {});
      } catch { ws.send(JSON.stringify({ error: 'invalid' })); }
    });
    // Keep the connection open long enough to exercise both heartbeat directions.
    const initialPresence = setTimeout(() => {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ channel: 'chat/presence', payload: { userId: 'server', status: 'online' } }));
      }
    }, 180);
    ws.on('close', () => {
      clearTimeout(serverHeartbeat);
      clearTimeout(initialPresence);
      if (channelStream) clearInterval(channelStream);
    });
  });

  // === 3. GraphQL Subscriptions via graphql-ws ===
  wsGql = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  useServer(
    {
      schema,
      onConnect: (ctx) => {
        if (!forceNextGqlDisconnect) return;
        forceNextGqlDisconnect = false;
        transportStats.gqlForcedDisconnects++;
        // Close after connection_init so clients can finish the WebSocket upgrade
        // and exercise their reconnect path instead of racing the HTTP handshake.
        setTimeout(() => ctx.extra.socket.close(4205, 'E2E initial reconnect test'), 0);
      },
    },
    wsGql,
  );
  wsGql.on('connection', () => {
    transportStats.gqlConnections++;
  });

  // Route WebSocket upgrades by path
  server.on('upgrade', (request, socket, head) => {
    const { pathname } = new URL(request.url, `http://${request.headers.host}`);
    if (pathname === '/ws') {
      wsGeneral.handleUpgrade(request, socket, head, (ws) => wsGeneral.emit('connection', ws, request));
    } else if (pathname === '/graphql') {
      wsGql.handleUpgrade(request, socket, head, (ws) => wsGql.emit('connection', ws, request));
    } else {
      socket.destroy();
    }
  });

  // === 4. gRPC Server ===
  const PROTO_PATH = path.join(__dirname, '../../packages/core/__fixtures__/petstore.proto');
  const GRPC_PORT = parseInt(process.env.GRPC_PORT || '50051', 10);
  try {
    const pkgDef = protoLoader.loadSync(PROTO_PATH, { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true });
    const proto = grpc.loadPackageDefinition(pkgDef);
    const ns = proto.petstore?.v1 || proto.petstore || proto;
    const grpcServer = new grpc.Server();
    if (ns.PetService) {
      grpcServer.addService(ns.PetService.service, {
        ListPets: (call, cb) => cb(null, { data: pets }),
        GetPet: (call, cb) => cb(null, pets.find((p) => p.id === call.request.id) || pets[0]),
        CreatePet: (call, cb) => cb(null, { id: `pet-grpc-${Date.now()}`, name: call.request.name, species: call.request.species, status: 'PET_STATUS_AVAILABLE', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
        UpdatePet: (call, cb) => cb(null, { ...pets[0], ...call.request }),
        DeletePet: (call, cb) => cb(null, {}),
        WatchPets: (call) => {
          transportStats.grpcStreams++;
          pets.forEach((p) => call.write(p));
          call.end();
        },
      });
    }
    if (ns.OwnerService) {
      grpcServer.addService(ns.OwnerService.service, {
        ListOwners: (call, cb) => cb(null, { data: owners }),
        GetOwner: (call, cb) => cb(null, owners.find((o) => o.id === call.request.id) || owners[0]),
        CreateOwner: (call, cb) => cb(null, { id: `owner-grpc-${Date.now()}`, name: call.request.name, email: call.request.email }),
      });
    }
    grpcServer.bindAsync(`0.0.0.0:${GRPC_PORT}`, grpc.ServerCredentials.createInsecure(), (err) => {
      if (err) console.log(`gRPC bind failed: ${err.message}`);
      else console.log(`gRPC server on :${GRPC_PORT}`);
    });
  } catch (e) { console.log(`gRPC skipped: ${e.message}`); }

  const HTTP_PORT = process.env.MOCK_PORT || 4010;
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Mock HTTP port ${HTTP_PORT} is already in use`);
    } else {
      console.error(`Mock HTTP server failed: ${err.message}`);
    }
    process.exit(1);
  });
  server.listen(HTTP_PORT, () => {
    console.log(`Mock: REST on :${HTTP_PORT}, GraphQL (Apollo) on :${HTTP_PORT}/graphql, WS on :${HTTP_PORT}/ws, GraphQL subscriptions on ws://:${HTTP_PORT}/graphql`);
  });
}

startServer().catch((err) => { console.error(err); process.exit(1); });
