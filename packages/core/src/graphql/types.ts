export interface GraphQLSpec {
  title: string;
  version: string;
  description?: string;
  endpoint: string;
  queries: GraphQLOperation[];
  mutations: GraphQLOperation[];
  subscriptions: GraphQLOperation[];
  types: GraphQLType[];
  enums: GraphQLEnum[];
  inputs: GraphQLInput[];
  /** Custom scalar names declared by the schema. */
  scalars?: string[];
}

export interface GraphQLOperation {
  name: string;
  description?: string;
  args: GraphQLField[];
  returnType: string;
  returnTypeRaw: string;
}

export interface GraphQLType {
  name: string;
  description?: string;
  fields: GraphQLField[];
}

export interface GraphQLField {
  name: string;
  type: string;
  typeRaw: string;
  required: boolean;
  description?: string;
  isList: boolean;
}

export interface GraphQLEnum {
  name: string;
  description?: string;
  values: string[];
}

export interface GraphQLInput {
  name: string;
  description?: string;
  fields: GraphQLField[];
}
