import {
  toCamelCase,
  toPascalCase,
  toSnakeCase,
  toKebabCase,
  toUpperSnakeCase,
} from '@cortex-docs/core';
import type { NamingConventions } from './plugin';

export function getLanguageNaming(language: string): NamingConventions {
  switch (language) {
    case 'typescript':
      return {
        className: toPascalCase,
        methodName: toCamelCase,
        fileName: toKebabCase,
        propertyName: toCamelCase,
        enumValue: toPascalCase,
        parameterName: toCamelCase,
      };
    case 'python':
      return {
        className: toPascalCase,
        methodName: toSnakeCase,
        fileName: toSnakeCase,
        propertyName: toSnakeCase,
        enumValue: toUpperSnakeCase,
        parameterName: toSnakeCase,
      };
    case 'go':
      return {
        className: toPascalCase,
        methodName: toPascalCase,
        fileName: toSnakeCase,
        propertyName: toPascalCase,
        enumValue: toPascalCase,
        parameterName: toCamelCase,
      };
    case 'java':
    case 'kotlin':
      return {
        className: toPascalCase,
        methodName: toCamelCase,
        fileName: toPascalCase,
        propertyName: toCamelCase,
        enumValue: toUpperSnakeCase,
        parameterName: toCamelCase,
      };
    case 'ruby':
      return {
        className: toPascalCase,
        methodName: toSnakeCase,
        fileName: toSnakeCase,
        propertyName: toSnakeCase,
        enumValue: toUpperSnakeCase,
        parameterName: toSnakeCase,
      };
    case 'php':
      return {
        className: toPascalCase,
        methodName: toCamelCase,
        fileName: toPascalCase,
        propertyName: toCamelCase,
        enumValue: toUpperSnakeCase,
        parameterName: toCamelCase,
      };
    case 'csharp':
      return {
        className: toPascalCase,
        methodName: toPascalCase,
        fileName: toPascalCase,
        propertyName: toPascalCase,
        enumValue: toPascalCase,
        parameterName: toCamelCase,
      };
    case 'rust':
      return {
        className: toPascalCase,
        methodName: toSnakeCase,
        fileName: toSnakeCase,
        propertyName: toSnakeCase,
        enumValue: toPascalCase,
        parameterName: toSnakeCase,
      };
    case 'cpp':
    case 'c':
      return {
        className: toPascalCase,
        methodName: toSnakeCase,
        fileName: toSnakeCase,
        propertyName: toSnakeCase,
        enumValue: toUpperSnakeCase,
        parameterName: toSnakeCase,
      };
    default:
      return {
        className: toPascalCase,
        methodName: toCamelCase,
        fileName: toKebabCase,
        propertyName: toCamelCase,
        enumValue: toUpperSnakeCase,
        parameterName: toCamelCase,
      };
  }
}
