import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { OpenAPIParser } from '../src/openapi/parser';

const FIXTURE_PATH = path.join(__dirname, '../__fixtures__/petstore.yaml');

describe('OpenAPIParser', () => {
  const parser = new OpenAPIParser();

  describe('parse', () => {
    it('parses the petstore spec', async () => {
      const spec = await parser.parse(FIXTURE_PATH);

      expect(spec.info.title).toBe('Petstore API');
      expect(spec.info.version).toBe('1.0.0');
    });

    it('extracts servers', async () => {
      const spec = await parser.parse(FIXTURE_PATH);

      expect(spec.info.servers).toHaveLength(1);
      expect(spec.info.servers[0].url).toBe('https://api.petstore.example.com/v1');
    });

    it('extracts resources from x-cortex-resource', async () => {
      const spec = await parser.parse(FIXTURE_PATH);

      const resourceNames = spec.resources.map((r) => r.name);
      expect(resourceNames).toContain('pets');
      expect(resourceNames).toContain('owners');
    });

    it('extracts operations', async () => {
      const spec = await parser.parse(FIXTURE_PATH);

      expect(spec.operations.length).toBeGreaterThan(0);

      const listPets = spec.operations.find((o) => o.operationId === 'listPets');
      expect(listPets).toBeDefined();
      expect(listPets!.method).toBe('get');
      expect(listPets!.path).toBe('/pets');
      expect(listPets!.resourceName).toBe('pets');
    });

    it('extracts parameters', async () => {
      const spec = await parser.parse(FIXTURE_PATH);

      const listPets = spec.operations.find((o) => o.operationId === 'listPets')!;
      expect(listPets.parameters).toHaveLength(2);

      const limitParam = listPets.parameters.find((p) => p.name === 'limit');
      expect(limitParam).toBeDefined();
      expect(limitParam!.in).toBe('query');
      expect(limitParam!.required).toBe(false);
    });

    it('extracts request bodies', async () => {
      const spec = await parser.parse(FIXTURE_PATH);

      const createPet = spec.operations.find((o) => o.operationId === 'createPet')!;
      expect(createPet.requestBody).toBeDefined();
      expect(createPet.requestBody!.contentType).toBe('application/json');
      expect(createPet.requestBody!.required).toBe(true);
    });

    it('extracts schemas', async () => {
      const spec = await parser.parse(FIXTURE_PATH);

      expect(spec.schemas.has('Pet')).toBe(true);
      expect(spec.schemas.has('Error')).toBe(true);
      expect(spec.schemas.has('CreatePetRequest')).toBe(true);

      const petSchema = spec.schemas.get('Pet')!;
      expect(petSchema.properties).toBeDefined();
      expect(petSchema.properties!['name']).toBeDefined();
    });

    it('extracts x-cortex extensions', async () => {
      const spec = await parser.parse(FIXTURE_PATH);

      const listPets = spec.operations.find((o) => o.operationId === 'listPets')!;
      expect(listPets.extensions['resource']).toBe('pets');
      expect(listPets.extensions['method-name']).toBe('list');
    });
  });

  describe('validate', () => {
    it('validates a correct spec', async () => {
      const result = await parser.validate(FIXTURE_PATH);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns errors for invalid spec path', async () => {
      const result = await parser.validate('/nonexistent/spec.yaml');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
