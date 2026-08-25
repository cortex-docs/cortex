import { buildSchema, graphql } from 'graphql';

interface Pet {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  age: number | null;
  status: string;
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Owner {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  pets: Pet[];
  createdAt: string;
}

const pets: Pet[] = [
  {
    id: 'pet-1',
    name: 'Rex',
    species: 'DOG',
    breed: null,
    age: 3,
    status: 'AVAILABLE',
    ownerId: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'pet-2',
    name: 'Whiskers',
    species: 'CAT',
    breed: null,
    age: 2,
    status: 'ADOPTED',
    ownerId: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
];

const owners: Owner[] = [
  {
    id: 'owner-1',
    name: 'Alice',
    email: 'alice@example.com',
    phone: null,
    pets: [],
    createdAt: '2025-01-01T00:00:00Z',
  },
];

const schema = buildSchema(`
  enum Species { DOG CAT BIRD FISH REPTILE }
  enum PetStatus { AVAILABLE ADOPTED PENDING }
  type Pet {
    id: ID!
    name: String!
    species: Species!
    breed: String
    age: Int
    status: PetStatus!
    ownerId: String
    createdAt: String!
    updatedAt: String!
  }
  type Owner {
    id: ID!
    name: String!
    email: String!
    phone: String
    pets: [Pet!]!
    createdAt: String!
  }
  input CreatePetInput { name: String!, species: Species!, breed: String, age: Int }
  input UpdatePetInput { name: String, breed: String, age: Int, status: PetStatus, ownerId: String }
  input CreateOwnerInput { name: String!, email: String!, phone: String }
  type PetConnection { data: [Pet!]!, nextCursor: String }
  type OwnerConnection { data: [Owner!]! }
  type Query {
    pets(limit: Int, cursor: String): PetConnection!
    pet(id: ID!): Pet
    owners(limit: Int): OwnerConnection!
    owner(id: ID!): Owner
  }
  type Mutation {
    createPet(input: CreatePetInput!): Pet!
    updatePet(id: ID!, input: UpdatePetInput!): Pet!
    deletePet(id: ID!): Boolean!
    createOwner(input: CreateOwnerInput!): Owner!
  }
  type Subscription {
    petAdopted(species: Species): Pet!
    ownerActivity(ownerId: ID!): Owner!
  }
`);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

const builtWithCortexLogoUrl = 'https://static.cortexdocs.dev/images/built-with-cortex.svg';
const builtWithCortexLogo = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="20" viewBox="0 0 128 20" role="img" aria-labelledby="title">
  <title id="title">Built with Cortex</title>
  <g transform="translate(0 0.5)" fill="none" stroke="#18181b" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 2.5Q11 1 13 2.5L18 5Q20 6 18 7L13 9.5Q11 11 9 9.5L4 7Q2 6 4 5L9 2.5Z" stroke-width="1.5" fill="#ffffff" fill-opacity="0.1"/>
    <path d="M3 10L9 13.5Q11 14.8 13 13.5L19 10" stroke-width="1.5"/>
    <path d="M3 13.5L9 17Q11 18.3 13 17L19 13.5" stroke-width="1.5" opacity="0.5"/>
  </g>
  <text x="30" y="13.5" fill="#71717a" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="11">Built with</text>
  <text x="85" y="13.5" fill="#18181b" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="11" font-weight="600">Cortex</text>
</svg>`;

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      ...corsHeaders,
      'Cache-Control': 'no-store',
    },
  });
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(corsHeaders)) headers.set(name, value);
  return new Response(response.body, { status: response.status, headers });
}

function builtWithCortexLogoResponse(method: string): Response {
  return new Response(method === 'HEAD' ? null : builtWithCortexLogo, {
    headers: {
      ...corsHeaders,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      'Content-Security-Policy': "default-src 'none'; script-src 'none'; style-src 'none'; sandbox",
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function readJson(request: Request): Promise<Record<string, any>> {
  const text = await request.text();
  return text ? (JSON.parse(text) as Record<string, any>) : {};
}

function newPet(input: Record<string, any>, prefix = 'pet'): Pet {
  const now = new Date().toISOString();
  return {
    id: `${prefix}-${crypto.randomUUID()}`,
    name: String(input.name ?? 'New pet'),
    species: String(input.species ?? 'DOG').toUpperCase(),
    breed: input.breed ? String(input.breed) : null,
    age: input.age === undefined || input.age === null ? null : Number(input.age),
    status: String(input.status ?? 'AVAILABLE').toUpperCase(),
    ownerId: input.ownerId ? String(input.ownerId) : null,
    createdAt: now,
    updatedAt: now,
  };
}

const rootValue = {
  pets: ({ limit }: { limit?: number }) => ({
    data: pets.slice(0, limit || pets.length),
    nextCursor: null,
  }),
  pet: ({ id }: { id: string }) => pets.find((pet) => pet.id === id) ?? null,
  owners: ({ limit }: { limit?: number }) => ({ data: owners.slice(0, limit || owners.length) }),
  owner: ({ id }: { id: string }) => owners.find((owner) => owner.id === id) ?? null,
  createPet: ({ input }: { input: Record<string, any> }) => {
    const pet = newPet(input, 'pet-gql');
    pets.push(pet);
    return pet;
  },
  updatePet: ({ id, input }: { id: string; input: Record<string, any> }) => {
    const pet = pets.find((candidate) => candidate.id === id) ?? pets[0];
    Object.assign(pet, input, { id, updatedAt: new Date().toISOString() });
    return pet;
  },
  deletePet: ({ id }: { id: string }) => {
    const index = pets.findIndex((pet) => pet.id === id);
    if (index >= 0) pets.splice(index, 1);
    return index >= 0;
  },
  createOwner: ({ input }: { input: Record<string, any> }) => {
    const owner: Owner = {
      id: `owner-${crypto.randomUUID()}`,
      name: String(input.name),
      email: String(input.email),
      phone: input.phone ? String(input.phone) : null,
      pets: [],
      createdAt: new Date().toISOString(),
    };
    owners.push(owner);
    return owner;
  },
};

async function handleGraphql(request: Request): Promise<Response> {
  const body = await readJson(request);
  if (typeof body.query !== 'string')
    return json({ errors: [{ message: 'A GraphQL query is required.' }] }, 400);
  const result = await graphql({
    schema,
    source: body.query,
    rootValue,
    variableValues: body.variables,
    operationName: body.operationName,
  });
  return json(result, result.errors ? 400 : 200);
}

function handleRpc(body: Record<string, any>): Response {
  const params = body.params ?? {};
  let result: unknown;
  switch (body.method) {
    case 'listPets':
      result = { data: pets.slice(0, params.limit || pets.length), nextCursor: null };
      break;
    case 'getPet':
      result = pets.find((pet) => pet.id === params.id) ?? pets[0];
      break;
    case 'createPet':
      result = newPet(params, 'pet-rpc');
      break;
    case 'deletePet':
      result = true;
      break;
    case 'listOwners':
      result = { data: owners.slice(0, params.limit || owners.length) };
      break;
    case 'getOwner':
      result = owners.find((owner) => owner.id === params.id) ?? owners[0];
      break;
    case 'createOwner':
      result = {
        id: `owner-rpc-${crypto.randomUUID()}`,
        name: params.name,
        email: params.email,
        phone: params.phone ?? null,
        pets: [],
        createdAt: new Date().toISOString(),
      };
      break;
    default:
      return json({
        jsonrpc: '2.0',
        error: { code: -32601, message: `Method not found: ${String(body.method)}` },
        id: body.id ?? null,
      });
  }
  return json({ jsonrpc: '2.0', result, id: body.id ?? null });
}

function channelEvent(channel: string, payload: Record<string, any> = {}) {
  if (channel === 'chat/messages') {
    return {
      channel,
      payload: {
        id: `message-${crypto.randomUUID()}`,
        userId: 'server',
        text: payload.text ?? 'Hello from the Cortex demo Worker',
        timestamp: new Date().toISOString(),
      },
    };
  }
  if (channel === 'chat/typing') {
    return { channel, payload: { userId: 'server', isTyping: payload.isTyping ?? true } };
  }
  return { channel, payload: { userId: 'server', status: payload.status ?? 'online' } };
}

function websocketResponse(request: Request, graphqlSocket: boolean): Response {
  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];
  server.accept();

  const timers = new Set<ReturnType<typeof setInterval>>();
  const send = (data: unknown) => server.send(JSON.stringify(data));
  const clearTimers = () => {
    for (const timer of timers) clearInterval(timer);
    timers.clear();
  };

  server.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(String(event.data)) as Record<string, any>;
      if (graphqlSocket) {
        if (data.type === 'connection_init') {
          send({ type: 'connection_ack' });
          return;
        }
        if (data.type === 'complete') {
          clearTimers();
          return;
        }
        if (data.type === 'subscribe') {
          const id = String(data.id ?? '1');
          const query = String(data.payload?.query ?? '');
          const owner = owners[0];
          const emit = () => {
            if (query.includes('ownerActivity')) {
              send({ id, type: 'next', payload: { data: { ownerActivity: owner } } });
            } else {
              send({ id, type: 'next', payload: { data: { petAdopted: pets[0] } } });
            }
          };
          emit();
          const timer = setInterval(emit, 1000);
          timers.add(timer);
        }
        return;
      }

      if (data.type === 'cortex-client-heartbeat') {
        send({ type: 'cortex-server-heartbeat-ack' });
      } else if (data.type === 'subscribe' && data.channel) {
        send(channelEvent(String(data.channel)));
        const timer = setInterval(() => send(channelEvent(String(data.channel))), 1000);
        timers.add(timer);
      } else if (data.channel) {
        send(channelEvent(String(data.channel), data.payload ?? {}));
      } else {
        send({ error: 'invalid' });
      }
    } catch {
      send({ error: 'invalid' });
    }
  });
  server.addEventListener('close', clearTimers);
  server.addEventListener('error', clearTimers);

  return new Response(null, { status: 101, webSocket: client });
}

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  if (path === '/images/built-with-cortex.svg' && (method === 'GET' || method === 'HEAD')) {
    return builtWithCortexLogoResponse(method);
  }

  if (
    ['/images/built-by-cortex.svg', '/assets/built-by-cortex.svg'].includes(path) &&
    (method === 'GET' || method === 'HEAD')
  ) {
    return new Response(null, {
      status: 308,
      headers: {
        ...corsHeaders,
        'Cache-Control': 'public, max-age=3600',
        Location: builtWithCortexLogoUrl,
      },
    });
  }

  if (url.hostname === 'static.cortexdocs.dev') {
    return json({ code: 'not_found' }, 404);
  }

  if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
    if (path === '/ws') return websocketResponse(request, false);
    if (path === '/graphql') return websocketResponse(request, true);
    return json({ code: 'not_found' }, 404);
  }

  if (path === '/health' && method === 'GET')
    return json({ status: 'ok', runtime: 'cloudflare-worker' });
  if (path === '/graphql' && method === 'POST') return handleGraphql(request);
  if (path === '/rpc' && method === 'POST') return handleRpc(await readJson(request));

  if (path === '/pets' && method === 'GET') return json({ data: pets });
  if (path === '/pets' && method === 'POST') {
    if (request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')) {
      const form = await request.formData();
      const attachments = form.getAll('attachments').filter((value) => typeof value !== 'string');
      const profilePicture = form.get('profilePic');
      const pet = newPet(Object.fromEntries(form.entries()));
      return json(
        {
          ...pet,
          profile_pic_filename: typeof profilePicture === 'string' ? null : profilePicture?.name,
          profile_pic_size: typeof profilePicture === 'string' ? null : profilePicture?.size,
          profile_pic_content_type:
            typeof profilePicture === 'string' ? null : profilePicture?.type,
          attachment_count: attachments.length,
          attachment_content_types: attachments.map((file) => file.type),
        },
        201,
      );
    }
    const pet = newPet(await readJson(request));
    pets.push(pet);
    return json(pet, 201);
  }
  if (path === '/pets/stream' && method === 'GET') {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        for (const pet of pets) controller.enqueue(encoder.encode(`${JSON.stringify(pet)}\n`));
        controller.close();
      },
    });
    return withCors(new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson' } }));
  }
  if (path === '/uploads/raw' && method === 'POST') {
    const body = await request.arrayBuffer();
    return json(
      {
        size: body.byteLength,
        content_type: request.headers.get('content-type') ?? 'application/octet-stream',
      },
      201,
    );
  }
  if (path.startsWith('/pets/')) {
    const id = decodeURIComponent(path.slice('/pets/'.length));
    const pet = pets.find((candidate) => candidate.id === id);
    if (method === 'GET')
      return pet ? json(pet) : json({ code: 'not_found', message: 'Not found' }, 404);
    if (method === 'PUT') {
      if (!pet) return json({ code: 'not_found', message: 'Not found' }, 404);
      Object.assign(pet, await readJson(request), { updatedAt: new Date().toISOString() });
      return json(pet);
    }
    if (method === 'DELETE') {
      const index = pets.findIndex((candidate) => candidate.id === id);
      if (index >= 0) pets.splice(index, 1);
      return new Response(null, { status: 204, headers: corsHeaders });
    }
  }

  if (path === '/owners' && method === 'GET') return json({ data: owners });
  if (path === '/owners' && method === 'POST') {
    const body = await readJson(request);
    return json({ id: `owner-${crypto.randomUUID()}`, ...body }, 201);
  }
  if (path.startsWith('/owners/') && method === 'GET') {
    const owner = owners.find(
      (candidate) => candidate.id === decodeURIComponent(path.slice('/owners/'.length)),
    );
    return owner ? json(owner) : json({ code: 'not_found', message: 'Not found' }, 404);
  }

  const grpcMatch = /^\/grpc\/(PetService|OwnerService)\/([A-Za-z]+)$/.exec(path);
  if (grpcMatch && method === 'POST') {
    const [, service, operation] = grpcMatch;
    const body = await readJson(request);
    if (service === 'PetService' && operation === 'ListPets') return json({ data: pets });
    if (service === 'PetService' && operation === 'GetPet')
      return json(pets.find((pet) => pet.id === body.id) ?? pets[0]);
    if (service === 'PetService' && operation === 'CreatePet')
      return json(newPet(body, 'pet-grpc'));
    if (service === 'PetService' && operation === 'UpdatePet') return json({ ...pets[0], ...body });
    if (service === 'PetService' && operation === 'DeletePet') return json({});
    if (service === 'PetService' && operation === 'WatchPets') return json({ data: pets });
    if (service === 'OwnerService' && operation === 'ListOwners') return json({ data: owners });
    if (service === 'OwnerService' && operation === 'GetOwner')
      return json(owners.find((owner) => owner.id === body.id) ?? owners[0]);
    if (service === 'OwnerService' && operation === 'CreateOwner') {
      return json({ id: `owner-grpc-${crypto.randomUUID()}`, name: body.name, email: body.email });
    }
  }

  return json({ code: 'not_found' }, 404);
}

export default {
  fetch(request: Request): Promise<Response> {
    return handleRequest(request).catch((error: unknown) => {
      console.error(error);
      return json(
        { code: 'internal_error', message: 'The demo API could not process the request.' },
        500,
      );
    });
  },
} satisfies ExportedHandler;
