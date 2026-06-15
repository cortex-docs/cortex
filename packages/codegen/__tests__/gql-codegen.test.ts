import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { GraphQLParser } from '@cortex/core';
import { GqlTemplateEngine, createGqlPluginForLanguage } from '../src/languages/gql-template-plugin';

const GQL_FIXTURE = path.join(__dirname, '../../core/__fixtures__/petstore.graphql');

async function generateForLanguage(language: string) {
  const parser = new GraphQLParser();
  const spec = await parser.parse(GQL_FIXTURE);
  const engine = new GqlTemplateEngine();
  const langConfig = createGqlPluginForLanguage(language)!;
  return engine.generate(spec, `@test/${language}-gql`, '0.1.0', langConfig);
}

function getFile(files: Array<{ path: string; content: string }>, name: string) {
  return files.find((f) => f.path.includes(name));
}

describe('GraphQL Codegen — All Languages', () => {
  const languages = ['typescript', 'python', 'go', 'java', 'kotlin', 'ruby', 'php', 'csharp', 'rust', 'cpp'];

  for (const language of languages) {
    describe(language, () => {
      it('generates gql-client and gql-types files', async () => {
        const files = await generateForLanguage(language);
        const client = getFile(files, 'gql-client');
        const types = getFile(files, 'gql-types');
        expect(client).toBeDefined();
        expect(types).toBeDefined();
        expect(client!.content.length).toBeGreaterThan(0);
        expect(types!.content.length).toBeGreaterThan(0);
      });

      it('generates types for all schema entities', async () => {
        const files = await generateForLanguage(language);
        const types = getFile(files, 'gql-types')!;
        expect(types.content).toContain('Pet');
        expect(types.content).toContain('Owner');
        expect(types.content).toContain('PetConnection');
        expect(types.content).toContain('OwnerConnection');
      });

      it('generates all enums', async () => {
        const files = await generateForLanguage(language);
        const types = getFile(files, 'gql-types')!;
        expect(types.content).toContain('Species');
        expect(types.content).toContain('PetStatus');
        expect(types.content).toContain('DOG');
        expect(types.content).toContain('CAT');
        expect(types.content).toContain('AVAILABLE');
      });

      it('generates all input types', async () => {
        const files = await generateForLanguage(language);
        const types = getFile(files, 'gql-types')!;
        expect(types.content).toContain('CreatePetInput');
        expect(types.content).toContain('UpdatePetInput');
        expect(types.content).toContain('CreateOwnerInput');
      });

      if (language !== 'typescript' && language !== 'rust' && language !== 'python' && language !== 'go' && language !== 'cpp') {
        it('generates operation result types', async () => {
          const files = await generateForLanguage(language);
          const types = getFile(files, 'gql-types')!;
          expect(types.content).toContain('PetsQuery');
          expect(types.content).toContain('PetQuery');
          expect(types.content).toContain('OwnersQuery');
          expect(types.content).toContain('CreatePetMutation');
          expect(types.content).toContain('DeletePetMutation');
          expect(types.content).toContain('CreateOwnerMutation');
        });

        it('generates operation variable types', async () => {
          const files = await generateForLanguage(language);
          const types = getFile(files, 'gql-types')!;
          expect(types.content).toContain('PetsQueryVariables');
          expect(types.content).toContain('PetQueryVariables');
          expect(types.content).toContain('CreatePetMutationVariables');
        });
      }

      it('generates a query builder file', async () => {
        const files = await generateForLanguage(language);
        const builder = files.find((f) => f.path.includes('gql-query-builder'));
        expect(builder).toBeDefined();
        expect(builder!.content.length).toBeGreaterThan(0);
      });

      it('generates builder methods on the client (no static operation methods)', async () => {
        const files = await generateForLanguage(language);
        const client = getFile(files, 'gql-client')!;
        expect(client.content.toLowerCase()).toContain('query');
        expect(client.content.toLowerCase()).toContain('mutat');
      });

      if (language === 'typescript') {
        it('generates query builder instead of static methods', async () => {
          const files = await generateForLanguage(language);
          const builder = files.find((f) => f.path.includes('gql-query-builder'))!;
          expect(builder).toBeDefined();
          expect(builder.content).toContain('QueryBuilder');
          expect(builder.content).toContain('MutationBuilder');
          expect(builder.content).toContain('SubscriptionBuilder');
          expect(builder.content).toContain('PetSelector');
          expect(builder.content).toContain('OwnerSelector');
        });

        it('generates query/mutate/subscribe methods on client', async () => {
          const files = await generateForLanguage(language);
          const client = getFile(files, 'gql-client')!;
          expect(client.content).toContain('async query<T extends {}>');
          expect(client.content).toContain('async mutate<T extends {}>');
          expect(client.content).toContain('subscribe<T extends {}>');
          expect(client.content).toContain('subscribeOnce<T extends {}>');
        });
      }

      if (language === 'rust') {
        it('generates query/mutate/subscribe methods on client', async () => {
          const files = await generateForLanguage(language);
          const client = getFile(files, 'gql-client')!;
          expect(client.content).toContain('pub async fn query');
          expect(client.content).toContain('pub async fn mutate');
          expect(client.content).toContain('pub fn subscribe');
          expect(client.content).not.toContain('pub async fn pets');
          expect(client.content).not.toContain('pub async fn create_pet');
        });
      }

      if (language === 'cpp') {
        it('generates query builder with selectors and builders', async () => {
          const files = await generateForLanguage(language);
          const builder = files.find((f) => f.path.includes('gql-query-builder'))!;
          expect(builder).toBeDefined();
          expect(builder.content).toContain('QueryBuilder');
          expect(builder.content).toContain('MutationBuilder');
          expect(builder.content).toContain('SubscriptionBuilder');
          expect(builder.content).toContain('PetSelector');
          expect(builder.content).toContain('OwnerSelector');
        });

        it('generates query/mutate/subscribe methods on client', async () => {
          const files = await generateForLanguage(language);
          const client = getFile(files, 'gql-client')!;
          expect(client.content).toContain('T query(Fn fn)');
          expect(client.content).toContain('T mutate(Fn fn)');
          expect(client.content).toContain('SubscriptionHandle subscribe(Fn fn, OnData on_data)');
        });
      }

      if (language === 'go') {
        it('generates query builder file with selectors and builders', async () => {
          const files = await generateForLanguage(language);
          const builder = files.find((f) => f.path.includes('gql-query-builder'))!;
          expect(builder).toBeDefined();
          expect(builder.content).toContain('QueryBuilder');
          expect(builder.content).toContain('MutationBuilder');
          expect(builder.content).toContain('SubscriptionBuilder');
          expect(builder.content).toContain('PetSelector');
          expect(builder.content).toContain('OwnerSelector');
          expect(builder.content).toContain('PetConnectionSelector');
          expect(builder.content).toContain('BuildDocument()');
        });

        it('generates query/mutate/subscribe methods on client', async () => {
          const files = await generateForLanguage(language);
          const client = getFile(files, 'gql-client')!;
          expect(client.content).toContain('func (c *Gql) Query(');
          expect(client.content).toContain('func (c *Gql) Mutate(');
          expect(client.content).toContain('func (c *Gql) Subscribe(');
          expect(client.content).toContain('func (c *Gql) SubscribeOnce(');
          expect(client.content).not.toContain('PetsDocument');
          expect(client.content).not.toContain('func (c *Gql) Pets(');
        });

        it('generates unified result types instead of per-operation types', async () => {
          const files = await generateForLanguage(language);
          const types = getFile(files, 'gql-types')!;
          expect(types.content).toContain('QueryResult');
          expect(types.content).toContain('MutationResult');
          expect(types.content).toContain('SubscriptionResult');
          expect(types.content).not.toContain('PetsQuery');
          expect(types.content).not.toContain('PetsQueryVariables');
        });
      }

      if (language === 'python') {
        it('generates query builder file with typed selectors and builders', async () => {
          const files = await generateForLanguage(language);
          const builder = files.find((f) => f.path.includes('gql-query-builder'))!;
          expect(builder).toBeDefined();
          expect(builder.content).toContain('create_query_builder');
          expect(builder.content).toContain('create_mutation_builder');
          expect(builder.content).toContain('create_subscription_builder');
          expect(builder.content).toContain('class QueryBuilder(_RootBase)');
          expect(builder.content).toContain('class PetSelector(_SelectionBase)');
          expect(builder.content).toContain('class PetsArgs(TypedDict');
          expect(builder.content).toContain('class CreatePetArgs(TypedDict');
        });

        it('generates query/mutate/subscribe methods on client', async () => {
          const files = await generateForLanguage(language);
          const client = getFile(files, 'gql-client')!;
          expect(client.content).toContain('def query(');
          expect(client.content).toContain('def mutate(');
          expect(client.content).toContain('async def subscribe_once(');
          expect(client.content).toContain('def subscribe(');
          expect(client.content).not.toContain('def pets(');
          expect(client.content).not.toContain('def create_pet(');
        });
      }
    });
  }
});

describe('GraphQL Codegen — TypeScript Specifics', () => {
  it('generates Maybe/InputMaybe utility types', async () => {
    const files = await generateForLanguage('typescript');
    const types = getFile(files, 'gql-types')!;
    expect(types.content).toContain('export type Maybe<T> = T | null;');
    expect(types.content).toContain('export type InputMaybe<T> = Maybe<T>;');
  });

  it('generates Scalars type map', async () => {
    const files = await generateForLanguage('typescript');
    const types = getFile(files, 'gql-types')!;
    expect(types.content).toContain('export type Scalars = {');
    expect(types.content).toContain("ID: { input: string; output: string };");
    expect(types.content).toContain("Int: { input: number; output: number };");
  });

  it('generates types with __typename discriminator', async () => {
    const files = await generateForLanguage('typescript');
    const types = getFile(files, 'gql-types')!;
    expect(types.content).toContain("__typename?: 'Pet';");
    expect(types.content).toContain("__typename?: 'Owner';");
  });

  it('uses export type instead of interface for schema types', async () => {
    const files = await generateForLanguage('typescript');
    const types = getFile(files, 'gql-types')!;
    expect(types.content).toContain('export type Pet = {');
    expect(types.content).toContain('export type Owner = {');
    expect(types.content).not.toContain('export interface Pet');
  });

  it('wraps nullable fields with Maybe<T>', async () => {
    const files = await generateForLanguage('typescript');
    const types = getFile(files, 'gql-types')!;
    expect(types.content).toContain('breed?: Maybe<string>;');
    expect(types.content).toContain('age?: Maybe<number>;');
    expect(types.content).toContain('phone?: Maybe<string>;');
  });

  it('wraps input nullable fields with InputMaybe<T>', async () => {
    const files = await generateForLanguage('typescript');
    const types = getFile(files, 'gql-types')!;
    expect(types.content).toContain('breed?: InputMaybe<string>;');
    expect(types.content).toContain('age?: InputMaybe<number>;');
  });

  it('uses Array<T> for list types', async () => {
    const files = await generateForLanguage('typescript');
    const types = getFile(files, 'gql-types')!;
    expect(types.content).toContain('data: Array<Pet>;');
    expect(types.content).toContain('pets: Array<Pet>;');
  });

  it('preserves enum references in types', async () => {
    const files = await generateForLanguage('typescript');
    const types = getFile(files, 'gql-types')!;
    expect(types.content).toContain('species: Species;');
    expect(types.content).toContain('status: PetStatus;');
  });

  it('does not generate static operation types (builder-only)', async () => {
    const files = await generateForLanguage('typescript');
    const types = getFile(files, 'gql-types')!;
    expect(types.content).not.toContain('PetsQuery');
    expect(types.content).not.toContain('PetsQueryVariables');
    expect(types.content).not.toContain('Exact<');
  });

  it('generates client class with builder methods only', async () => {
    const files = await generateForLanguage('typescript');
    const client = getFile(files, 'gql-client')!;
    expect(client.content).toContain('export class Gql');
    expect(client.content).toContain('export class GqlError extends Error');
    expect(client.content).toContain('async query<T extends {}>');
    expect(client.content).toContain('async mutate<T extends {}>');
    expect(client.content).toContain('subscribe<T extends {}>');
    expect(client.content).toContain('subscribeOnce<T extends {}>');
    expect(client.content).not.toContain('PetsDocument');
    expect(client.content).not.toContain('async pets(');
  });

  it('generates query builder file with selectors for all types', async () => {
    const files = await generateForLanguage('typescript');
    const builder = files.find((f) => f.path.includes('gql-query-builder'))!;
    expect(builder.content).toContain('PetSelector');
    expect(builder.content).toContain('OwnerSelector');
    expect(builder.content).toContain('PetConnectionSelector');
    expect(builder.content).toContain('OwnerConnectionSelector');
    expect(builder.content).toContain('QueryBuilder');
    expect(builder.content).toContain('MutationBuilder');
    expect(builder.content).toContain('SubscriptionBuilder');
    expect(builder.content).toContain('createQueryBuilder');
    expect(builder.content).toContain('createMutationBuilder');
    expect(builder.content).toContain('createSubscriptionBuilder');
  });
});
