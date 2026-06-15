export interface GrpcSpec {
  title: string;
  version: string;
  package: string;
  services: GrpcService[];
  messages: GrpcMessage[];
  enums: GrpcEnum[];
  sourceContent?: string;
}

export interface GrpcService {
  name: string;
  description?: string;
  methods: GrpcMethod[];
}

export interface GrpcMethod {
  name: string;
  description?: string;
  inputType: string;
  outputType: string;
  clientStreaming: boolean;
  serverStreaming: boolean;
}

export interface GrpcMessage {
  name: string;
  description?: string;
  fields: GrpcField[];
}

export interface GrpcField {
  name: string;
  type: string;
  number: number;
  repeated: boolean;
  optional: boolean;
  description?: string;
  mapKeyType?: string;
  mapValueType?: string;
}

export interface GrpcEnum {
  name: string;
  description?: string;
  values: GrpcEnumValue[];
}

export interface GrpcEnumValue {
  name: string;
  number: number;
}
