import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { GraphQLParser } from '@cortex/core';
import { GqlTemplateEngine, createGqlPluginForLanguage } from '../src/languages/gql-template-plugin';

const GQL_FIXTURE = path.join(__dirname, '../../core/__fixtures__/petstore.graphql');

async function generateFiles() {
  const parser = new GraphQLParser();
  const spec = await parser.parse(GQL_FIXTURE);
  const engine = new GqlTemplateEngine();
  const langConfig = createGqlPluginForLanguage('typescript')!;
  return engine.generate(spec, '@test/petstore-gql', '0.1.0', langConfig);
}

function getBuilder(files: Array<{ path: string; content: string }>) {
  return files.find((f) => f.path.includes('gql-query-builder'))!;
}

function getClient(files: Array<{ path: string; content: string }>) {
  return files.find((f) => f.path.includes('gql-client'))!;
}

describe('GraphQL Query Builder — File Generation', () => {
  it('generates gql-query-builder.ts', async () => {
    const files = await generateFiles();
    const builder = getBuilder(files);
    expect(builder).toBeDefined();
    expect(builder.path).toBe('src/gql-query-builder.ts');
    expect(builder.content.length).toBeGreaterThan(0);
  });
});

describe('GraphQL Query Builder — Runtime Infrastructure', () => {
  it('includes createSelector function', async () => {
    const files = await generateFiles();
    const builder = getBuilder(files);
    expect(builder.content).toContain('function createSelector()');
  });

  it('includes createRootProxy function', async () => {
    const files = await generateFiles();
    const builder = getBuilder(files);
    expect(builder.content).toContain('function createRootProxy');
  });

  it('includes SelectorBase interface', async () => {
    const files = await generateFiles();
    const builder = getBuilder(files);
    expect(builder.content).toContain('interface SelectorBase');
    expect(builder.content).toContain('__buildSelection');
  });
});

describe('GraphQL Query Builder — Selector Interfaces', () => {
  it('generates PetSelector with all scalar/enum fields', async () => {
    const files = await generateFiles();
    const b = getBuilder(files).content;
    expect(b).toContain('export interface PetSelector<T extends {} = {}>');
    expect(b).toContain('id(): PetSelector<T & { id: string }>');
    expect(b).toContain('name(): PetSelector<T & { name: string }>');
    expect(b).toContain('species(): PetSelector<T & { species: Species }>');
    expect(b).toContain('status(): PetSelector<T & { status: PetStatus }>');
    expect(b).toContain('createdAt(): PetSelector<T & { createdAt: string }>');
  });

  it('generates nullable scalar fields with | null', async () => {
    const files = await generateFiles();
    const b = getBuilder(files).content;
    expect(b).toContain('breed(): PetSelector<T & { breed: string | null }>');
    expect(b).toContain('age(): PetSelector<T & { age: number | null }>');
    expect(b).toContain('ownerId(): PetSelector<T & { ownerId: string | null }>');
    expect(b).toContain('phone(): OwnerSelector<T & { phone: string | null }>');
  });

  it('generates OwnerSelector with nested object field (pets)', async () => {
    const files = await generateFiles();
    const b = getBuilder(files).content;
    expect(b).toContain('export interface OwnerSelector<T extends {} = {}>');
    expect(b).toMatch(/pets<S extends \{\}>\(fn: \(s: PetSelector\) => PetSelector<S>\): OwnerSelector<T & \{ pets: S\[\] \}>/);
  });

  it('generates PetConnectionSelector with nested data and scalar nextCursor', async () => {
    const files = await generateFiles();
    const b = getBuilder(files).content;
    expect(b).toContain('export interface PetConnectionSelector<T extends {} = {}>');
    expect(b).toMatch(/data<S extends \{\}>\(fn: \(s: PetSelector\) => PetSelector<S>\): PetConnectionSelector<T & \{ data: S\[\] \}>/);
    expect(b).toContain('nextCursor(): PetConnectionSelector<T & { nextCursor: string | null }>');
  });

  it('generates OwnerConnectionSelector', async () => {
    const files = await generateFiles();
    const b = getBuilder(files).content;
    expect(b).toContain('export interface OwnerConnectionSelector<T extends {} = {}>');
    expect(b).toMatch(/data<S extends \{\}>\(fn: \(s: OwnerSelector\) => OwnerSelector<S>\): OwnerConnectionSelector<T & \{ data: S\[\] \}>/);
  });
});

describe('GraphQL Query Builder — Root Builder Interfaces', () => {
  it('generates QueryBuilder with all query operations', async () => {
    const files = await generateFiles();
    const b = getBuilder(files).content;
    expect(b).toContain('export interface QueryBuilder<T extends {} = {}>');
    expect(b).toContain('pets<S extends {}>');
    expect(b).toContain('pet<S extends {}>');
    expect(b).toContain('owners<S extends {}>');
    expect(b).toContain('owner<S extends {}>');
  });

  it('generates QueryBuilder with correct args types', async () => {
    const files = await generateFiles();
    const b = getBuilder(files).content;
    expect(b).toContain('pets<S extends {}>(args: { limit?: number; cursor?: string }');
    expect(b).toContain('pet<S extends {}>(args: { id: string }');
    expect(b).toContain('owners<S extends {}>(args: { limit?: number }');
    expect(b).toContain('owner<S extends {}>(args: { id: string }');
  });

  it('generates overload without args for all-optional operations', async () => {
    const files = await generateFiles();
    const b = getBuilder(files).content;
    const builderSection = b.slice(b.indexOf('interface QueryBuilder'), b.indexOf('interface MutationBuilder'));
    const petsOverloads = builderSection.match(/pets<S extends \{\}>\(/g);
    expect(petsOverloads).toHaveLength(2);
    const ownersOverloads = builderSection.match(/owners<S extends \{\}>\(/g);
    expect(ownersOverloads).toHaveLength(2);
  });

  it('does not generate overload for required-args operations', async () => {
    const files = await generateFiles();
    const b = getBuilder(files).content;
    const petOverloads = b.match(/\bpet<S extends \{\}>\(/g);
    expect(petOverloads).toHaveLength(1);
    const ownerOverloads = b.match(/\bowner<S extends \{\}>\(/g);
    expect(ownerOverloads).toHaveLength(1);
  });

  it('handles nullable return types with | null', async () => {
    const files = await generateFiles();
    const b = getBuilder(files).content;
    expect(b).toContain('pet: S | null');
    expect(b).toContain('owner: S | null');
  });

  it('generates MutationBuilder with all mutation operations', async () => {
    const files = await generateFiles();
    const b = getBuilder(files).content;
    expect(b).toContain('export interface MutationBuilder<T extends {} = {}>');
    expect(b).toContain('createPet<S extends {}>');
    expect(b).toContain('updatePet<S extends {}>');
    expect(b).toContain('createOwner<S extends {}>');
  });

  it('handles scalar return types (deletePet returns boolean)', async () => {
    const files = await generateFiles();
    const b = getBuilder(files).content;
    expect(b).toContain('deletePet(args: { id: string }): MutationBuilder<T & { deletePet: boolean }>');
  });

  it('generates SubscriptionBuilder', async () => {
    const files = await generateFiles();
    const b = getBuilder(files).content;
    expect(b).toContain('export interface SubscriptionBuilder<T extends {} = {}>');
    expect(b).toContain('petAdopted<S extends {}>');
    expect(b).toContain('ownerActivity<S extends {}>');
  });

  it('generates mutation arg types with input references', async () => {
    const files = await generateFiles();
    const b = getBuilder(files).content;
    expect(b).toContain('createPet<S extends {}>(args: { input: CreatePetInput }');
    expect(b).toContain('updatePet<S extends {}>(args: { id: string; input: UpdatePetInput }');
    expect(b).toContain('createOwner<S extends {}>(args: { input: CreateOwnerInput }');
  });
});

describe('GraphQL Query Builder — Factory Functions', () => {
  it('generates createQueryBuilder with arg definitions', async () => {
    const files = await generateFiles();
    const b = getBuilder(files).content;
    expect(b).toContain('export function createQueryBuilder(): QueryBuilder');
    expect(b).toContain("pets: [{ name: 'limit', gqlType: 'Int' }");
    expect(b).toContain("pet: [{ name: 'id', gqlType: 'ID!' }]");
  });

  it('generates createMutationBuilder with arg definitions', async () => {
    const files = await generateFiles();
    const b = getBuilder(files).content;
    expect(b).toContain('export function createMutationBuilder(): MutationBuilder');
    expect(b).toContain("createPet: [{ name: 'input', gqlType: 'CreatePetInput!' }]");
    expect(b).toContain("deletePet: [{ name: 'id', gqlType: 'ID!' }]");
  });

  it('generates createSubscriptionBuilder with arg definitions', async () => {
    const files = await generateFiles();
    const b = getBuilder(files).content;
    expect(b).toContain('export function createSubscriptionBuilder(): SubscriptionBuilder');
    expect(b).toContain("petAdopted: [{ name: 'species', gqlType: 'Species' }]");
    expect(b).toContain("ownerActivity: [{ name: 'ownerId', gqlType: 'ID!' }]");
  });
});

describe('GraphQL Query Builder — Client Integration', () => {
  it('imports builder types and factories in client', async () => {
    const files = await generateFiles();
    const c = getClient(files).content;
    expect(c).toContain("from './gql-query-builder'");
    expect(c).toContain('QueryBuilder');
    expect(c).toContain('createQueryBuilder');
    expect(c).toContain('MutationBuilder');
    expect(c).toContain('createMutationBuilder');
  });

  it('generates query() method on GqlClient', async () => {
    const files = await generateFiles();
    const c = getClient(files).content;
    expect(c).toContain('async query<T extends {}>(fn: (q: QueryBuilder) => QueryBuilder<T>): Promise<T>');
    expect(c).toContain('createQueryBuilder()');
    expect(c).toContain("__buildDocument('query')");
  });

  it('generates mutate() method on GqlClient', async () => {
    const files = await generateFiles();
    const c = getClient(files).content;
    expect(c).toContain('async mutate<T extends {}>(fn: (m: MutationBuilder) => MutationBuilder<T>): Promise<T>');
    expect(c).toContain('createMutationBuilder()');
    expect(c).toContain("__buildDocument('mutation')");
  });

  it('generates subscribe() method on GqlClient', async () => {
    const files = await generateFiles();
    const c = getClient(files).content;
    expect(c).toContain('subscribe<T extends {}>(');
    expect(c).toContain('createSubscriptionBuilder()');
    expect(c).toContain("__buildDocument('subscription')");
  });

  it('does not generate static per-operation methods (builder-only)', async () => {
    const files = await generateFiles();
    const c = getClient(files).content;
    expect(c).not.toContain('PetsQueryVariables');
    expect(c).not.toContain('PetsDocument');
    expect(c).not.toContain('async pets(');
  });
});

describe('GraphQL Query Builder — Imports', () => {
  it('imports enum types from gql-types', async () => {
    const files = await generateFiles();
    const b = getBuilder(files).content;
    expect(b).toContain('Species');
    expect(b).toContain('PetStatus');
    expect(b).toContain("from './gql-types'");
  });

  it('imports input types from gql-types', async () => {
    const files = await generateFiles();
    const b = getBuilder(files).content;
    expect(b).toContain('CreatePetInput');
    expect(b).toContain('UpdatePetInput');
    expect(b).toContain('CreateOwnerInput');
  });
});
