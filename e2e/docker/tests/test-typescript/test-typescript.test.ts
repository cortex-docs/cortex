/**
 * TypeScript integration test — calls every protocol through the generated SDK.
 * REST, GraphQL (Apollo + graphql-ws), WebSocket, gRPC — all real network calls, zero mocking.
 *
 * SDK is generated to ./generated/ by globalSetup.ts before tests run.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket as NodeWS } from 'ws';
import {
  RequestTimeoutError,
  RestApiV1 as TestProjectClient,
} from './generated/typescript/src/client';
import { Graphql as GqlClient } from './generated/typescript/src/gql-client';
import { Grpc } from './generated/typescript/src/grpc-client';
import { WebsocketApi as WsClient } from './generated/typescript/src/ws-client';

Object.defineProperty(globalThis, 'WebSocket', {
  value: NodeWS,
  configurable: true,
  writable: true,
});

const BASE = process.env.MOCK_URL || 'http://localhost:4010';
const WS_URL = process.env.MOCK_WS_URL || 'ws://localhost:4010/ws';
const GQL_URL = process.env.MOCK_GQL_URL || 'http://localhost:4010/graphql';
const GQL_WS_URL = GQL_URL.replace(/^http/, 'ws');
const GENERATED_TYPESCRIPT_DIR = resolveGeneratedTypescriptDir();
const generatedRequire = createRequire(join(GENERATED_TYPESCRIPT_DIR, 'package.json'));
const TSC_BIN = generatedRequire.resolve('typescript/bin/tsc');

interface TransportStats {
  wsConnections: number;
  wsDisconnectCommands: number;
  clientHeartbeats: number;
  serverHeartbeatAcks: number;
  gqlConnections: number;
  gqlDisconnects: number;
}

async function getTransportStats(): Promise<TransportStats> {
  const response = await fetch(`${BASE}/transport/status`);
  if (!response.ok) throw new Error(`Transport status failed: ${response.status}`);
  return response.json() as Promise<TransportStats>;
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  message: string,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(message);
}

function resolveGeneratedTypescriptDir(): string {
  const localGenerated = fileURLToPath(new URL('./generated/typescript/', import.meta.url));
  if (existsSync(localGenerated)) return localGenerated;

  const envGenerated = process.env.GEN_DIR ? join(process.env.GEN_DIR, 'typescript') : undefined;
  if (envGenerated && existsSync(envGenerated)) return envGenerated;

  return fileURLToPath(new URL('../../../../generated/typescript/', import.meta.url));
}

describe('Generated TypeScript SDK', () => {
  test('builds with strict TypeScript settings', () => {
    execFileSync(process.execPath, [TSC_BIN, '--project', 'tsconfig.json'], {
      cwd: GENERATED_TYPESCRIPT_DIR,
      stdio: 'pipe',
    });
  });
});

// ─── REST ─────────────────────────────────────────────────────────

describe('REST', () => {
  let rest: TestProjectClient;

  beforeAll(() => {
    rest = new TestProjectClient({ baseUrl: BASE });
  });

  test('rest.pets.list()', async () => {
    const r = await rest.pets.list();
    expect(r.data.length).toBeGreaterThanOrEqual(2);
    expect(r.data[0].name).toBeDefined();
  });

  test('rest.pets.get("pet-1")', async () => {
    const r = await rest.pets.get('pet-1');
    expect(r.name).toBe('Rex');
  });

  test('rest.pets.create()', async () => {
    const r = await rest.pets.create({
      name: 'TsPet',
      species: 'bird',
      profilePic: {
        data: new Blob(['pet-avatar'], { type: 'image/png' }),
        fileName: 'profile.png',
        contentType: 'image/png',
      },
      attachments: [
        {
          data: new Blob(['pdf-file'], { type: 'application/pdf' }),
          fileName: 'record.pdf',
          contentType: 'application/pdf',
        },
        {
          data: new Blob(['notes'], { type: 'text/plain' }),
          fileName: 'notes.txt',
          contentType: 'text/plain',
        },
      ],
    });
    expect(r.name).toBe('TsPet');
    expect(r.profile_pic_filename).toBe('profile.png');
    expect(r.profile_pic_size).toBe(10);
    expect(r.profile_pic_content_type).toBe('image/png');
    expect(r.attachment_count).toBe(2);
    expect(r.attachment_content_types).toEqual(['application/pdf', 'text/plain']);

    const raw = await rest.uploads.uploadFile({
      data: new Blob(['raw-pdf'], { type: 'application/pdf' }),
      fileName: 'raw.pdf',
      contentType: 'application/pdf',
    });
    expect(raw.size).toBe(7);
    expect(raw.content_type).toBe('application/pdf');
  });

  test('rest.pets.delete()', async () => {
    await rest.pets.delete('pet-1');
  });

  test('rest.owners.list()', async () => {
    const r = await rest.owners.list();
    expect(r.data.length).toBeGreaterThanOrEqual(1);
    expect(r.data[0].email).toBeDefined();
  });

  test('requestStream() yields a chunked response incrementally', async () => {
    const decoder = new TextDecoder();
    let body = '';
    let chunkCount = 0;

    for await (const chunk of rest.requestStream('GET', '/pets/stream', { timeout: 2000 })) {
      chunkCount++;
      body += decoder.decode(chunk, { stream: true });
    }
    body += decoder.decode();

    const records = body
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(chunkCount).toBeGreaterThanOrEqual(2);
    expect(records.map((pet) => pet.name)).toEqual(['Rex', 'Whiskers']);
  });

  test('client and per-request HTTP timeouts cancel slow requests', async () => {
    const shortTimeoutClient = new TestProjectClient({ baseUrl: BASE, timeout: 40 });
    await expect(
      shortTimeoutClient.request('GET', '/transport/slow?delay=250'),
    ).rejects.toBeInstanceOf(RequestTimeoutError);

    const response = await shortTimeoutClient.request<{ delayed: number }>(
      'GET',
      '/transport/slow?delay=100',
      { timeout: 500 },
    );
    expect(response.delayed).toBe(100);
  });
});

// ─── GraphQL — Query Builder (Apollo Server) ──────────────────────

describe('GraphQL — Query Builder', () => {
  const gql = new GqlClient({
    endpoint: GQL_URL,
    wsEndpoint: GQL_WS_URL,
    webSocketImpl: NodeWS,
  });

  afterAll(() => {
    gql.dispose();
  });

  // ─── Query ────────────────────────────────────────────

  test('query — single root field with partial selection', async () => {
    const r = await gql.query((q) =>
      q.pets({ limit: 10 }, (p) => p.data((d) => d.id().name().species()).nextCursor()),
    );
    expect(r.pets).toBeDefined();
    expect(r.pets.data.length).toBeGreaterThanOrEqual(1);
    expect(r.pets.data[0].id).toBeDefined();
    expect(r.pets.data[0].name).toBeDefined();
    expect(r.pets.data[0].species).toBeDefined();
  });

  test('query — multi-entity (pets + owners in one call)', async () => {
    const r = await gql.query((q) =>
      q
        .pets({ limit: 5 }, (p) => p.data((d) => d.id().name()))
        .owners({ limit: 5 }, (o) => o.data((d) => d.id().name().email())),
    );
    expect(r.pets.data[0].id).toBeDefined();
    expect(r.pets.data[0].name).toBeDefined();
    expect(r.owners.data[0].id).toBeDefined();
    expect(r.owners.data[0].name).toBeDefined();
    expect(r.owners.data[0].email).toBeDefined();
  });

  test('query — single entity with required args', async () => {
    const r = await gql.query((q) => q.pet({ id: 'pet-1' }, (p) => p.id().name().species()));
    expect(r.pet).toBeDefined();
    expect(r.pet!.id).toBeDefined();
    expect(r.pet!.name).toBeDefined();
  });

  test('query — no args overload (optional args omitted)', async () => {
    const r = await gql.query((q) => q.pets((p) => p.data((d) => d.id().name())));
    expect(r.pets.data.length).toBeGreaterThanOrEqual(1);
  });

  test('query — nested selection (owners → pets)', async () => {
    const r = await gql.query((q) =>
      q.owners({ limit: 5 }, (o) =>
        o.data((d) =>
          d
            .id()
            .name()
            .pets((p) => p.id().name().species()),
        ),
      ),
    );
    expect(r.owners.data[0].id).toBeDefined();
    expect(r.owners.data[0].pets).toBeDefined();
  });

  // ─── Mutation ─────────────────────────────────────────

  test('mutate — create with input and field selection', async () => {
    const r = await gql.mutate((m) =>
      m.createPet({ input: { name: 'BuilderPet', species: 'DOG' } }, (p) =>
        p.id().name().species(),
      ),
    );
    expect(r.createPet).toBeDefined();
    expect(r.createPet.name).toBeDefined();
    expect(r.createPet.species).toBeDefined();
  });

  test('mutate — scalar return (deletePet → boolean)', async () => {
    const r = await gql.mutate((m) => m.deletePet({ id: 'pet-1' }));
    expect(r.deletePet).toBeDefined();
    expect(typeof r.deletePet).toBe('boolean');
  });

  test('mutate — multiple mutations in one call', async () => {
    const r = await gql.mutate((m) =>
      m
        .createPet({ input: { name: 'Multi1', species: 'CAT' } }, (p) => p.id().name())
        .createOwner({ input: { name: 'OwnerX', email: 'ox@test.com' } }, (o) =>
          o.id().name().email(),
        ),
    );
    expect(r.createPet.name).toBeDefined();
    expect(r.createOwner.email).toBeDefined();
  });

  // ─── Subscription (real WebSocket via graphql-ws) ──────

  test('subscribe — petAdopted receives event via WebSocket', async () => {
    const event = await gql.subscribeOnce((s) =>
      s.petAdopted({ species: 'DOG' }, (p) => p.id().name().species()),
    );
    expect(event.petAdopted).toBeDefined();
    expect(event.petAdopted.id).toBeDefined();
    expect(event.petAdopted.name).toBe('Rex');
    expect(event.petAdopted.species).toBe('DOG');
  });

  test('subscribe — ownerActivity receives event via WebSocket', async () => {
    const event = await gql.subscribeOnce((s) =>
      s.ownerActivity({ ownerId: 'owner-1' }, (o) => o.id().name().email()),
    );
    expect(event.ownerActivity).toBeDefined();
    expect(event.ownerActivity.id).toBeDefined();
    expect(event.ownerActivity.name).toBe('Alice');
    expect(event.ownerActivity.email).toBe('alice@example.com');
  });

  test('subscribe — unsubscribe stops receiving events', async () => {
    let eventCount = 0;
    const unsubscribe = gql.subscribe(
      (s) => s.petAdopted((p) => p.id().name()),
      () => {
        eventCount++;
      },
    );
    await new Promise((r) => setTimeout(r, 500));
    unsubscribe();
    const countAfterUnsub = eventCount;
    await new Promise((r) => setTimeout(r, 500));
    expect(eventCount).toBe(countAfterUnsub);
  });

  test('subscription reconnects and restores the active operation', async () => {
    const reconnecting = new GqlClient({
      endpoint: GQL_URL,
      wsEndpoint: GQL_WS_URL,
      webSocketImpl: NodeWS,
      reconnect: true,
      reconnectInterval: 50,
      maxReconnectAttempts: 5,
      heartbeatInterval: 50,
    });
    const before = await getTransportStats();
    let eventCount = 0;
    let firstEvent!: () => void;
    let recovered!: () => void;
    let rejectRecovery!: (error: Error) => void;
    const firstEventReceived = new Promise<void>((resolve) => {
      firstEvent = resolve;
    });
    const recoveredEventReceived = new Promise<void>((resolve, reject) => {
      recovered = resolve;
      rejectRecovery = reject;
    });

    const unsubscribe = reconnecting.subscribe(
      (s) => s.petAdopted({ species: 'DOG' }, (p) => p.id().name()),
      () => {
        eventCount++;
        if (eventCount === 1) firstEvent();
        if (eventCount === 2) recovered();
      },
      rejectRecovery,
    );

    try {
      await firstEventReceived;
      const disconnectResponse = await fetch(`${BASE}/transport/graphql/disconnect`, {
        method: 'POST',
      });
      expect(disconnectResponse.ok).toBe(true);
      await Promise.race([
        recoveredEventReceived,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('GraphQL reconnect timeout')), 5000),
        ),
      ]);
      const after = await getTransportStats();
      expect(after.gqlConnections).toBeGreaterThanOrEqual(before.gqlConnections + 2);
      expect(after.gqlDisconnects).toBeGreaterThan(before.gqlDisconnects);
    } finally {
      unsubscribe();
      reconnecting.dispose();
    }
  });
});

// ─── WebSocket ────────────────────────────────────────────────────

describe('WebSocket', () => {
  test('connect + receive presence', async () => {
    const ws = new WsClient({ url: WS_URL });
    await new Promise<void>((ok, no) => {
      const t = setTimeout(() => no(new Error('timeout')), 5000);
      ws.onChatPresence((msg) => {
        clearTimeout(t);
        expect(msg.userId).toBe('server');
        expect(msg.status).toBe('online');
        ok();
      });
      ws.connect().catch(no);
    });
    ws.sendChatMessages({ text: 'hello from generated SDK' });
    ws.disconnect();
  });

  test('WsClient has channel methods from AsyncAPI spec', async () => {
    const ws = new WsClient({ url: WS_URL });

    expect(typeof ws.subscribe).toBe('function');
    expect(typeof ws.send).toBe('function');
    expect(typeof ws.connect).toBe('function');
    expect(typeof ws.disconnect).toBe('function');
    expect(typeof ws.sendChatMessages).toBe('function');
    expect(typeof ws.onChatPresence).toBe('function');
  });

  test('reconnects after an unexpected server disconnect', async () => {
    const before = await getTransportStats();
    const ws = new WsClient({
      url: WS_URL,
      reconnect: true,
      reconnectInterval: 50,
      maxReconnectAttempts: 5,
      heartbeatInterval: 0,
    });
    let connected = 0;
    let disconnected = 0;
    let presenceEvents = 0;
    ws.on('connected', () => {
      connected++;
    });
    ws.on('disconnected', () => {
      disconnected++;
    });
    ws.onChatPresence(() => {
      presenceEvents++;
    });

    try {
      await ws.connect();
      await waitFor(() => presenceEvents >= 1, 'Initial WebSocket presence event was not received');
      ws.send('__control__/disconnect', {});
      await waitFor(
        () => connected >= 2 && disconnected >= 1 && presenceEvents >= 2,
        'WebSocket client did not reconnect',
      );
      const after = await getTransportStats();
      expect(after.wsConnections).toBeGreaterThanOrEqual(before.wsConnections + 2);
      expect(after.wsDisconnectCommands).toBeGreaterThan(before.wsDisconnectCommands);
    } finally {
      ws.disconnect();
    }
  });

  test('exchanges the configured client and server heartbeat messages', async () => {
    const before = await getTransportStats();
    const ws = new WsClient({
      url: WS_URL,
      reconnect: false,
      heartbeatInterval: 50,
      heartbeatTimeout: 250,
    });
    const errors: Error[] = [];
    ws.on('error', (error) => {
      errors.push(error as Error);
    });

    try {
      await ws.connect();
      await waitFor(async () => {
        const current = await getTransportStats();
        return (
          current.clientHeartbeats > before.clientHeartbeats &&
          current.serverHeartbeatAcks > before.serverHeartbeatAcks
        );
      }, 'Configured WebSocket heartbeat exchange did not complete');
      expect(errors).toEqual([]);
    } finally {
      ws.disconnect();
    }
  });

  test('closes a stale WebSocket after the heartbeat timeout', async () => {
    const ws = new WsClient({
      url: `${WS_URL}?heartbeat=ignore`,
      reconnect: false,
      heartbeatInterval: 30,
      heartbeatTimeout: 80,
    });
    let heartbeatError: Error | undefined;
    let disconnected = false;
    ws.on('error', (error) => {
      const candidate = error as Error;
      if (candidate.message.includes('heartbeat timeout')) heartbeatError = candidate;
    });
    ws.on('disconnected', () => {
      disconnected = true;
    });

    try {
      await ws.connect();
      await waitFor(
        () => heartbeatError !== undefined && disconnected,
        'Stale WebSocket was not closed after the heartbeat timeout',
      );
      expect(heartbeatError?.message).toContain('heartbeat timeout');
    } finally {
      ws.disconnect();
    }
  });
});

// ─── gRPC (real calls through generated SDK) ─────────────────────

describe('gRPC', () => {
  const GRPC_ADDR = process.env.GRPC_ADDR || 'localhost:50051';

  let petClient: Grpc;
  let ownerClient: Grpc;

  beforeAll(() => {
    petClient = new Grpc({ address: GRPC_ADDR });
    ownerClient = new Grpc({ address: GRPC_ADDR });
  });

  afterAll(() => {
    petClient?.close();
    ownerClient?.close();
  });

  // ─── PetService RPCs ──────────────────────────────────

  test('PetService.listPets — generated SDK returns pet list', async () => {
    const r = await petClient.listPets({});
    expect(r.data).toBeDefined();
    expect(r.data.length).toBeGreaterThanOrEqual(2);
    expect(r.data[0].name).toBeDefined();
  });

  test('PetService.getPet — generated SDK returns single pet by ID', async () => {
    const r = await petClient.getPet({ id: 'pet-1' });
    expect(r.name).toBe('Rex');
    expect(r.id).toBe('pet-1');
  });

  test('PetService.createPet — generated SDK creates and returns pet', async () => {
    const r = await petClient.createPet({
      name: 'GrpcTsPet',
      species: 'SPECIES_DOG',
    });
    expect(r.name).toBe('GrpcTsPet');
    expect(r.id).toBeDefined();
  });

  test('PetService.deletePet — generated SDK completes without error', async () => {
    const r = await petClient.deletePet({ id: 'pet-1' });
    expect(r).toBeDefined();
  });

  // ─── PetService server-streaming RPC ──────────────────

  test('PetService.watchPets — generated SDK server stream yields multiple pets', async () => {
    let petCount = 0;
    let firstPetName: string | undefined;
    const stream = petClient.watchPets({});
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('stream timeout')), 5000);
      stream.on('data', (pet) => {
        petCount++;
        firstPetName ??= pet.name;
      });
      stream.on('end', () => {
        clearTimeout(timeout);
        resolve();
      });
      stream.on('error', (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
    expect(petCount).toBeGreaterThanOrEqual(2);
    expect(firstPetName).toBeDefined();
  });

  // ─── OwnerService RPCs ────────────────────────────────

  test('OwnerService.listOwners — generated SDK returns owner list', async () => {
    const r = await ownerClient.listOwners({});
    expect(r.data).toBeDefined();
    expect(r.data.length).toBeGreaterThanOrEqual(1);
  });

  test('OwnerService.getOwner — generated SDK returns single owner', async () => {
    const r = await ownerClient.getOwner({ id: 'owner-1' });
    expect(r.name).toBe('Alice');
    expect(r.email).toBe('alice@example.com');
  });

  test('OwnerService.createOwner — generated SDK creates and returns owner', async () => {
    const r = await ownerClient.createOwner({
      name: 'GrpcOwner',
      email: 'grpc@test.com',
    });
    expect(r.name).toBe('GrpcOwner');
    expect(r.email).toBe('grpc@test.com');
    expect(r.id).toBeDefined();
  });

  // The strict SDK build test above validates generated source shape without mocking transport.
});
