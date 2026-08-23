import { describe, expect, it } from 'vitest';
import type { GraphQLSpec, Operation, ParsedSpec } from '@cortex/core';
import {
  emptyParsedSpec,
  mergeGraphQLSpecs,
  mergeParsedSpecs,
} from '../src/commands/generate/spec-merge';

function operation(operationId: string, resourceName: string): Operation {
  return {
    operationId,
    method: 'get',
    path: `/${operationId}`,
    parameters: [],
    responses: [],
    tags: [resourceName],
    resourceName,
    extensions: {},
  };
}

function restSpec(operationId: string, resourceName: string): ParsedSpec {
  const spec = emptyParsedSpec('Part');
  const item = operation(operationId, resourceName);
  spec.operations = [item];
  spec.resources = [{ name: resourceName, displayName: resourceName, operations: [item] }];
  spec.schemas.set(`${operationId}Result`, { type: 'object' });
  return spec;
}

function graphQLSpec(endpoint: string, queryName: string): GraphQLSpec {
  return {
    title: 'GraphQL',
    version: '1.0.0',
    endpoint,
    queries: [
      {
        name: queryName,
        args: [],
        returnType: 'String',
        returnTypeRaw: 'String',
      },
    ],
    mutations: [],
    subscriptions: [],
    types: [],
    enums: [],
    inputs: [],
  };
}

describe('spec merging', () => {
  it('keeps operations, resources, and schemas from every OpenAPI source', () => {
    const merged = mergeParsedSpecs(
      [restSpec('listPets', 'pets'), restSpec('listOwners', 'owners')],
      'Acme API',
    );

    expect(merged?.operations.map((item) => item.operationId)).toEqual(['listPets', 'listOwners']);
    expect(merged?.resources.map((item) => item.name)).toEqual(['pets', 'owners']);
    expect(Array.from(merged?.schemas.keys() ?? [])).toEqual([
      'listPetsResult',
      'listOwnersResult',
    ]);
  });

  it('rejects duplicate OpenAPI operations', () => {
    expect(() =>
      mergeParsedSpecs([restSpec('listPets', 'pets'), restSpec('listPets', 'legacy')], 'Acme API'),
    ).toThrow('duplicate OpenAPI operationId "listPets"');
  });

  it('merges GraphQL sources only when they use the same endpoint', () => {
    const merged = mergeGraphQLSpecs(
      [
        graphQLSpec('https://api.example.com/graphql', 'pets'),
        graphQLSpec('https://api.example.com/graphql', 'owners'),
      ],
      'Acme GraphQL API',
    );
    expect(merged?.queries.map((query) => query.name)).toEqual(['pets', 'owners']);

    expect(() =>
      mergeGraphQLSpecs(
        [
          graphQLSpec('https://api.example.com/graphql', 'pets'),
          graphQLSpec('https://other.example.com/graphql', 'owners'),
        ],
        'Acme GraphQL API',
      ),
    ).toThrow('different endpoints');
  });
});
