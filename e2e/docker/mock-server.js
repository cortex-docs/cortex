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

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b ? JSON.parse(b) : {})); });
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
        const pet = args.species ? pets.find(p => p.species === args.species) || pets[0] : pets[0];
        yield { petAdopted: pet };
      },
    },
    ownerActivity: {
      subscribe: async function* (_p, args) {
        const owner = owners.find(o => o.id === args.ownerId) || owners[0];
        yield { ownerActivity: owner };
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

    // REST endpoints
    if (m === 'GET' && p === '/pets') return json(res, 200, { data: pets });
    if (m === 'POST' && p === '/pets') { const b = await readBody(req); return json(res, 201, { id: `pet-${Date.now()}`, ...b, status: 'available' }); }
    if (m === 'GET' && p.startsWith('/pets/')) { const x = pets.find((x) => x.id === p.split('/')[2]); return x ? json(res, 200, x) : json(res, 404, { code: 'not_found', message: 'Not found' }); }
    if (m === 'PUT' && p.startsWith('/pets/')) { const x = pets.find((x) => x.id === p.split('/')[2]); if (!x) return json(res, 404, {}); Object.assign(x, await readBody(req)); return json(res, 200, x); }
    if (m === 'DELETE' && p.startsWith('/pets/')) { res.writeHead(204); return res.end(); }
    if (m === 'GET' && p === '/owners') return json(res, 200, { data: owners });
    if (m === 'POST' && p === '/owners') { const b = await readBody(req); return json(res, 201, { id: `owner-${Date.now()}`, ...b }); }
    if (m === 'GET' && p.startsWith('/owners/')) { const x = owners.find((x) => x.id === p.split('/')[2]); return x ? json(res, 200, x) : json(res, 404, {}); }

    // gRPC-over-HTTP mock routes (used by C#, Rust, and other language tests)
    if (m === 'POST' && p === '/grpc/PetService/ListPets') return json(res, 200, { data: pets });
    if (m === 'POST' && p === '/grpc/PetService/GetPet') { const b = await readBody(req); const x = pets.find((x) => x.id === b.id) || pets[0]; return json(res, 200, x); }
    if (m === 'POST' && p === '/grpc/PetService/CreatePet') { const b = await readBody(req); return json(res, 200, { id: `pet-grpc-${Date.now()}`, name: b.name, species: b.species, status: 'PET_STATUS_AVAILABLE' }); }
    if (m === 'POST' && p === '/grpc/PetService/UpdatePet') { const b = await readBody(req); return json(res, 200, { ...pets[0], ...b }); }
    if (m === 'POST' && p === '/grpc/PetService/DeletePet') return json(res, 200, {});
    if (m === 'POST' && p === '/grpc/PetService/WatchPets') return json(res, 200, { data: pets });
    if (m === 'POST' && p === '/grpc/OwnerService/ListOwners') return json(res, 200, { data: owners });
    if (m === 'POST' && p === '/grpc/OwnerService/GetOwner') { const b = await readBody(req); const x = owners.find((x) => x.id === b.id) || owners[0]; return json(res, 200, x); }
    if (m === 'POST' && p === '/grpc/OwnerService/CreateOwner') { const b = await readBody(req); return json(res, 200, { id: `owner-grpc-${Date.now()}`, name: b.name, email: b.email }); }

    if (p === '/health') return json(res, 200, { status: 'ok' });
    json(res, 404, { code: 'not_found' });
  });

  // === 2. WebSocket Server (non-GraphQL, for AsyncAPI/WS tests) ===
  const wsGeneral = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  wsGeneral.on('connection', (ws) => {
    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        ws.send(JSON.stringify({ channel: data.channel, payload: { echo: true, ...(data.payload || {}) } }));
      } catch { ws.send(JSON.stringify({ error: 'invalid' })); }
    });
    ws.send(JSON.stringify({ channel: 'chat/presence', payload: { userId: 'server', status: 'online' } }));
  });

  // === 3. GraphQL Subscriptions via graphql-ws ===
  const wsGql = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  useServer({ schema }, wsGql);

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
        WatchPets: (call) => { pets.forEach((p) => call.write(p)); call.end(); },
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
  server.listen(HTTP_PORT, () => {
    console.log(`Mock: REST on :${HTTP_PORT}, GraphQL (Apollo) on :${HTTP_PORT}/graphql, WS on :${HTTP_PORT}/ws, GraphQL subscriptions on ws://:${HTTP_PORT}/graphql`);
  });
}

startServer().catch((err) => { console.error(err); process.exit(1); });
