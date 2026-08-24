import { describe, it, expect } from 'vitest';
import {
  toCamelCase,
  toPascalCase,
  toSnakeCase,
  toKebabCase,
  toUpperSnakeCase,
  singularize,
  pluralize,
  titleToPascalCase,
} from '../src/utils/naming';

describe('naming utilities', () => {
  describe('toCamelCase', () => {
    it('converts kebab-case', () => {
      expect(toCamelCase('my-variable')).toBe('myVariable');
    });

    it('converts snake_case', () => {
      expect(toCamelCase('my_variable')).toBe('myVariable');
    });

    it('converts PascalCase', () => {
      expect(toCamelCase('MyVariable')).toBe('myVariable');
    });

    it('handles multiple words', () => {
      expect(toCamelCase('get-user-by-id')).toBe('getUserById');
    });

    it('sanitizes punctuation, leading digits, and reserved identifiers', () => {
      expect(toCamelCase('data.source')).toBe('dataSource');
      expect(toCamelCase('24-hour-value')).toBe('_24HourValue');
      expect(toCamelCase('default')).toBe('_default');
    });
  });

  describe('toPascalCase', () => {
    it('converts kebab-case', () => {
      expect(toPascalCase('my-variable')).toBe('MyVariable');
    });

    it('converts snake_case', () => {
      expect(toPascalCase('my_variable')).toBe('MyVariable');
    });

    it('keeps PascalCase', () => {
      expect(toPascalCase('MyVariable')).toBe('MyVariable');
    });

    it('creates a valid identifier from a numeric name', () => {
      expect(toPascalCase('24-hour-value')).toBe('_24HourValue');
    });
  });

  describe('toSnakeCase', () => {
    it('converts camelCase', () => {
      expect(toSnakeCase('myVariable')).toBe('my_variable');
    });

    it('converts PascalCase', () => {
      expect(toSnakeCase('MyVariable')).toBe('my_variable');
    });

    it('converts kebab-case', () => {
      expect(toSnakeCase('my-variable')).toBe('my_variable');
    });

    it('sanitizes arbitrary separators and reserved identifiers', () => {
      expect(toSnakeCase('data.source')).toBe('data_source');
      expect(toSnakeCase('type')).toBe('_type');
    });
  });

  describe('toKebabCase', () => {
    it('converts camelCase', () => {
      expect(toKebabCase('myVariable')).toBe('my-variable');
    });

    it('converts PascalCase', () => {
      expect(toKebabCase('MyVariable')).toBe('my-variable');
    });

    it('converts snake_case', () => {
      expect(toKebabCase('my_variable')).toBe('my-variable');
    });
  });

  describe('toUpperSnakeCase', () => {
    it('converts camelCase', () => {
      expect(toUpperSnakeCase('myVariable')).toBe('MY_VARIABLE');
    });
  });

  describe('titleToPascalCase', () => {
    it('creates a valid client class identifier', () => {
      expect(titleToPascalCase('24 hour API')).toBe('_24HourApi');
      expect(titleToPascalCase('')).toBe('_');
    });
  });

  describe('singularize', () => {
    it('removes trailing s', () => {
      expect(singularize('pets')).toBe('pet');
    });

    it('handles -ies', () => {
      expect(singularize('categories')).toBe('category');
    });

    it('handles -ses', () => {
      expect(singularize('addresses')).toBe('address');
    });

    it('leaves singular words alone', () => {
      expect(singularize('user')).toBe('user');
    });
  });

  describe('pluralize', () => {
    it('adds s', () => {
      expect(pluralize('pet')).toBe('pets');
    });

    it('handles words ending in y', () => {
      expect(pluralize('category')).toBe('categories');
    });

    it('handles words ending in s', () => {
      expect(pluralize('address')).toBe('addresses');
    });
  });
});
