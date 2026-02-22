import { parseServerlessYaml } from '../src/yaml-parser';
import { resolveVariables } from '../src/variable-resolver';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function runTest(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: unknown) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ✗ ${name}: ${msg}`);
  }
}

console.log('\nServerless Navigator Tests\n');

// Test 1
runTest('testBasicHandlerExtraction', () => {
  const yaml = `
service: my-service

functions:
  hello:
    handler: src/functions/hello.handler
    events:
      - http: GET /hello
  goodbye:
    handler: src/functions/goodbye.main
    events:
      - http: GET /goodbye
`;
  const result = parseServerlessYaml(yaml);
  assert(result.handlers.length === 2, `Expected 2 handlers, got ${result.handlers.length}`);
  assert(result.handlers[0].raw === 'src/functions/hello.handler', `Wrong raw for handler 0: ${result.handlers[0].raw}`);
  assert(result.handlers[0].functionName === 'hello', `Wrong functionName for handler 0: ${result.handlers[0].functionName}`);
  assert(result.handlers[1].raw === 'src/functions/goodbye.main', `Wrong raw for handler 1: ${result.handlers[1].raw}`);
  assert(result.handlers[1].functionName === 'goodbye', `Wrong functionName for handler 1: ${result.handlers[1].functionName}`);
});

// Test 2
runTest('testHandlerWithVariables', () => {
  const yaml = `
service: my-service

custom:
  handlersPath: src/functions

functions:
  hello:
    handler: \${self:custom.handlersPath}/hello.handler
`;
  const result = parseServerlessYaml(yaml);
  assert(result.handlers.length === 1, `Expected 1 handler, got ${result.handlers.length}`);
  assert(
    result.handlers[0].raw === '${self:custom.handlersPath}/hello.handler',
    `Raw should preserve variable: ${result.handlers[0].raw}`,
  );
});

// Test 3
runTest('testHandlerWithInlineComment', () => {
  const yaml = `
service: my-service

functions:
  hello:
    handler: src/handler.main # this is a comment
`;
  const result = parseServerlessYaml(yaml);
  assert(result.handlers.length === 1, `Expected 1 handler, got ${result.handlers.length}`);
  assert(result.handlers[0].raw === 'src/handler.main', `Comment should be stripped: ${result.handlers[0].raw}`);
});

// Test 4
runTest('testNoHandlersOutsideFunctions', () => {
  const yaml = `
service: my-service

custom:
  handler: should/not/be/extracted.handler

functions:
  hello:
    handler: src/functions/hello.handler

resources:
  Resources:
    handler: should/also/not/be/extracted.handler
`;
  const result = parseServerlessYaml(yaml);
  assert(result.handlers.length === 1, `Expected 1 handler, got ${result.handlers.length}`);
  assert(result.handlers[0].functionName === 'hello', `Wrong functionName: ${result.handlers[0].functionName}`);
});

// Test 5
runTest('testDataParsing', () => {
  const yaml = `
service: my-service

custom:
  prefix: src/functions
  nested:
    value: deep-value

provider:
  name: aws
  runtime: nodejs18.x
`;
  const result = parseServerlessYaml(yaml);
  const data = result.data as Record<string, unknown>;
  assert(data['service'] === 'my-service', `service should be 'my-service'`);

  const custom = data['custom'] as Record<string, unknown>;
  assert(custom['prefix'] === 'src/functions', `custom.prefix should be 'src/functions'`);

  const nested = custom['nested'] as Record<string, unknown>;
  assert(nested['value'] === 'deep-value', `custom.nested.value should be 'deep-value'`);

  const provider = data['provider'] as Record<string, unknown>;
  assert(provider['name'] === 'aws', `provider.name should be 'aws'`);
  assert(provider['runtime'] === 'nodejs18.x', `provider.runtime should be 'nodejs18.x'`);
});

// Test 6
runTest('testSelfVariableResolution', () => {
  const data = {
    custom: {
      prefix: 'src/functions',
    },
  };
  const result = resolveVariables('${self:custom.prefix}/hello.handler', data);
  assert(result === 'src/functions/hello.handler', `Expected 'src/functions/hello.handler', got '${result}'`);
});

// Test 7
runTest('testOptAndEnvDefaults', () => {
  const data = {};
  const optResult = resolveVariables("${opt:stage, 'dev'}", data);
  assert(optResult === 'dev', `Expected 'dev', got '${optResult}'`);

  const envResult = resolveVariables('${env:NODE_ENV, "production"}', data);
  assert(envResult === 'production', `Expected 'production', got '${envResult}'`);
});

// Test 8
runTest('testUnresolvableVariables', () => {
  const data = {};
  const result = resolveVariables('${self:custom.missing}', data);
  assert(result === '${self:custom.missing}', `Unresolvable should stay as-is: ${result}`);
});

// Test 9
runTest('testNestedVariables', () => {
  const data = {
    custom: {
      basePath: 'src',
      fullPath: '${self:custom.basePath}/functions',
    },
  };
  const result = resolveVariables('${self:custom.fullPath}/hello.handler', data);
  assert(result === 'src/functions/hello.handler', `Expected 'src/functions/hello.handler', got '${result}'`);
});

// Test 10
runTest('testMultipleVariablesInOneLine', () => {
  const data = {
    custom: {
      dir: 'src',
      subdir: 'functions',
    },
  };
  const result = resolveVariables('${self:custom.dir}/${self:custom.subdir}/create.handler', data);
  assert(result === 'src/functions/create.handler', `Expected 'src/functions/create.handler', got '${result}'`);
});

// Test 11
runTest('testSchemaExtraction', () => {
  const yaml = `
service: my-service

functions:
  bookSlot:
    handler: src/handlers/booking.bookSlot
    events:
      - http:
          path: /book
          method: post
          request:
            schemas:
              application/json:
                name: BookSlot
                schema: \${file(schemas/book-slot.json)}
  cancelSlot:
    handler: src/handlers/booking.cancelSlot
    events:
      - http:
          path: /cancel
          method: post
          request:
            schemas:
              application/json:
                name: CancelSlot
                schema: \${file(schemas/cancel-slot.json)}
`;
  const result = parseServerlessYaml(yaml);
  assert(result.schemas.length === 2, `Expected 2 schemas, got ${result.schemas.length}`);
  assert(result.schemas[0].filePath === 'schemas/book-slot.json', `Wrong filePath for schema 0: ${result.schemas[0].filePath}`);
  assert(result.schemas[0].functionName === 'bookSlot', `Wrong functionName for schema 0: ${result.schemas[0].functionName}`);
  assert(result.schemas[1].filePath === 'schemas/cancel-slot.json', `Wrong filePath for schema 1: ${result.schemas[1].filePath}`);
  assert(result.schemas[1].functionName === 'cancelSlot', `Wrong functionName for schema 1: ${result.schemas[1].functionName}`);
});

// Test 12
runTest('testSchemaNotExtractedOutsideFunctions', () => {
  const yaml = `
service: my-service

custom:
  schema: \${file(schemas/should-not-extract.json)}

functions:
  hello:
    handler: src/hello.handler
    events:
      - http:
          path: /hello
          method: post
          request:
            schemas:
              application/json:
                schema: \${file(schemas/hello.json)}
`;
  const result = parseServerlessYaml(yaml);
  assert(result.schemas.length === 1, `Expected 1 schema, got ${result.schemas.length}`);
  assert(result.schemas[0].filePath === 'schemas/hello.json', `Wrong filePath: ${result.schemas[0].filePath}`);
});

// Test 13
runTest('testSchemaWithoutFileRef', () => {
  const yaml = `
service: my-service

functions:
  hello:
    handler: src/hello.handler
    events:
      - http:
          path: /hello
          method: post
          request:
            schemas:
              application/json:
                schema: inline-schema-value
`;
  const result = parseServerlessYaml(yaml);
  assert(result.schemas.length === 0, `Expected 0 schemas for non-file ref, got ${result.schemas.length}`);
});

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
