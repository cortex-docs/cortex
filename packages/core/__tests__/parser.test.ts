import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { OpenAPIParser, resolveOpenApiServers } from '../src/openapi/parser';

const FIXTURE_PATH = path.join(__dirname, '../__fixtures__/petstore.yaml');
const COMPONENT_FIXTURE_PATH = path.join(__dirname, '../__fixtures__/openapi-path-components.yaml');
const TOLERANT_FIXTURE_PATH = path.join(__dirname, '../__fixtures__/openapi-tolerant.yaml');

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
      expect(createPet.requestBody!.contentType).toBe('multipart/form-data');
      expect(createPet.requestBody!.required).toBe(true);
      const createPetSchema = spec.schemas.get(createPet.requestBody!.schema.name!)!;
      expect(createPetSchema.properties?.profilePic?.format).toBe('binary');
      expect(createPetSchema.properties?.attachments?.items?.format).toBe('binary');

      const uploadFile = spec.operations.find((o) => o.operationId === 'uploadFile')!;
      expect(uploadFile.requestBody?.contentType).toBe('application/pdf');
      expect(uploadFile.requestBody?.schema).toMatchObject({ type: 'string', format: 'binary' });
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

    it('resolves component references and merges path parameters', async () => {
      const spec = await parser.parse(COMPONENT_FIXTURE_PATH);
      const operation = spec.operations[0];

      expect(operation.parameters).toHaveLength(2);
      expect(operation.parameters.find((parameter) => parameter.name === 'petId')).toMatchObject({
        in: 'path',
        required: true,
      });
      expect(operation.parameters.find((parameter) => parameter.name === 'tenant')).toMatchObject({
        description: 'Operation tenant',
        required: true,
      });
      expect(operation.requestBody?.schema).toMatchObject({
        ref: '#/components/schemas/PetInput',
        required: ['name'],
      });
      expect(operation.requestBody?.schema.properties).toHaveProperty('name');
      expect(operation.responses[0].schema?.properties).toHaveProperty('id');
    });

    it('falls back to a default resource for blank or missing tags', async () => {
      const spec = await parser.parse(TOLERANT_FIXTURE_PATH);

      expect(spec.resources.map((resource) => resource.name)).toEqual(['default']);
      expect(spec.operations[0].resourceName).toBe('default');
      expect(spec.schemas.get('Measurement')?.required).toBeUndefined();
    });

    it('resolves relative remote servers and their default variables', () => {
      expect(
        resolveOpenApiServers('https://docs.example.com/openapi.json', [
          {
            url: '/{version}/',
            variables: { version: { default: 'v2' } },
          },
        ]),
      ).toEqual([{ url: 'https://docs.example.com/v2', description: undefined }]);
    });

    it('uses the remote document origin when servers are omitted', () => {
      expect(resolveOpenApiServers('https://api.example.com/spec/openapi.json', [])).toEqual([
        { url: 'https://api.example.com', description: undefined },
      ]);
      expect(resolveOpenApiServers(TOLERANT_FIXTURE_PATH, [])).toEqual([]);
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

    it('reports non-structural producer incompatibilities as warnings', async () => {
      const result = await parser.validate(TOLERANT_FIXTURE_PATH);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings.some((warning) => warning.message.includes('schema validation'))).toBe(
        true,
      );
    });
  });
});
