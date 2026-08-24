import * as fs from 'node:fs';
import {
  buildSchema,
  getNamedType,
  isEnumType,
  isInputObjectType,
  isInterfaceType,
  isListType,
  isNonNullType,
  isObjectType,
  isScalarType,
  isSpecifiedScalarType,
  isUnionType,
  type GraphQLArgument,
  type GraphQLField as NativeGraphQLField,
  type GraphQLInputField,
  type GraphQLType as NativeGraphQLType,
} from 'graphql';
import type {
  GraphQLSpec,
  GraphQLOperation,
  GraphQLType,
  GraphQLField,
  GraphQLEnum,
  GraphQLInput,
} from './types';

export class GraphQLParser {
  async parse(specPath: string, endpoint?: string): Promise<GraphQLSpec> {
    const content = await this.loadContent(specPath);
    return this.parseSchema(content, endpoint ?? 'http://localhost:4000/graphql');
  }

  private async loadContent(specPath: string): Promise<string> {
    if (specPath.startsWith('http://') || specPath.startsWith('https://')) {
      const res = await fetch(specPath, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`Failed to fetch ${specPath}: ${res.status}`);
      return res.text();
    }
    return fs.readFileSync(specPath, 'utf-8');
  }

  private parseSchema(sdl: string, endpoint: string): GraphQLSpec {
    // Use GraphQL's reference SDL parser so directives, descriptions, custom root
    // type names, multiline arguments, extensions, and schema definitions follow
    // the GraphQL specification instead of a source-format-specific regex.
    const schema = buildSchema(sdl);
    const queryType = schema.getQueryType();
    const mutationType = schema.getMutationType();
    const subscriptionType = schema.getSubscriptionType();
    const rootTypeNames = new Set(
      [queryType?.name, mutationType?.name, subscriptionType?.name].filter((name): name is string =>
        Boolean(name),
      ),
    );

    const types: GraphQLType[] = [];
    const enums: GraphQLEnum[] = [];
    const inputs: GraphQLInput[] = [];
    const scalars: string[] = [];

    for (const namedType of Object.values(schema.getTypeMap())) {
      if (namedType.name.startsWith('__')) continue;

      if (isObjectType(namedType) && !rootTypeNames.has(namedType.name)) {
        types.push({
          name: namedType.name,
          description: namedType.description ?? undefined,
          fields: Object.values(namedType.getFields()).map((field) => this.convertField(field)),
        });
      } else if (isInterfaceType(namedType)) {
        types.push({
          name: namedType.name,
          description: namedType.description ?? undefined,
          fields: Object.values(namedType.getFields()).map((field) => this.convertField(field)),
        });
      } else if (isUnionType(namedType)) {
        types.push({
          name: namedType.name,
          description: namedType.description ?? undefined,
          fields: [
            {
              name: '__typename',
              type: 'String',
              typeRaw: 'String!',
              required: true,
              isList: false,
            },
          ],
        });
      } else if (isEnumType(namedType)) {
        enums.push({
          name: namedType.name,
          description: namedType.description ?? undefined,
          values: namedType.getValues().map((value) => value.name),
        });
      } else if (isInputObjectType(namedType)) {
        inputs.push({
          name: namedType.name,
          description: namedType.description ?? undefined,
          fields: Object.values(namedType.getFields()).map((field) => this.convertField(field)),
        });
      } else if (isScalarType(namedType) && !isSpecifiedScalarType(namedType)) {
        scalars.push(namedType.name);
      }
    }

    const schemaDirective = sdl.match(/@title\("([^"]+)"\)/);

    return {
      title: schemaDirective?.[1] ?? 'GraphQL API',
      version: '1.0.0',
      description: schema.astNode?.description?.value,
      endpoint,
      queries: this.convertOperations(queryType),
      mutations: this.convertOperations(mutationType),
      subscriptions: this.convertOperations(subscriptionType),
      types,
      enums,
      inputs,
      scalars,
    };
  }

  private convertOperations(
    rootType: ReturnType<ReturnType<typeof buildSchema>['getQueryType']>,
  ): GraphQLOperation[] {
    if (!rootType) return [];

    return Object.values(rootType.getFields()).map((field) => ({
      name: field.name,
      description: field.description ?? undefined,
      args: field.args.map((arg) => this.convertArgument(arg)),
      returnType: getNamedType(field.type).name,
      returnTypeRaw: String(field.type),
    }));
  }

  private convertArgument(arg: GraphQLArgument): GraphQLField {
    return this.convertTypedValue(arg.name, arg.type, arg.description);
  }

  private convertField(
    field: NativeGraphQLField<unknown, unknown> | GraphQLInputField,
  ): GraphQLField {
    return this.convertTypedValue(field.name, field.type, field.description);
  }

  private convertTypedValue(
    name: string,
    type: NativeGraphQLType,
    description?: string | null,
  ): GraphQLField {
    const required = isNonNullType(type);
    const nullableType = required ? type.ofType : type;

    return {
      name,
      type: getNamedType(type).name,
      typeRaw: String(type),
      required,
      description: description ?? undefined,
      isList: isListType(nullableType),
    };
  }
}
