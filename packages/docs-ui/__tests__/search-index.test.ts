import { describe, expect, it } from 'vitest';
import { buildSearchDocuments, createSearchIndex, searchIndex } from '@/lib/search-index';

describe('search index routes', () => {
  it('uses the API source title instead of the resource name for REST result links', () => {
    const sdkData = {
      sourceTitles: { rest: ['REST API V1'] },
      resources: [
        {
          name: 'owners',
          operations: [
            {
              operationId: 'listOwners',
              method: 'GET',
              path: '/owners',
              summary: 'List all owners',
            },
          ],
        },
      ],
    };

    const documents = buildSearchDocuments(sdkData, null, null);
    const results = searchIndex(createSearchIndex(documents), 'list owners');

    expect(results[0]).toMatchObject({
      id: 'rest-listOwners',
      href: '/api-reference/rest-api-v1/listOwners',
    });
  });
});
