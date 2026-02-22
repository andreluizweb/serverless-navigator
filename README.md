# Serverless Navigator

VS Code extension that adds smart navigation to `serverless.yml` files. Handler values become clickable links that open the referenced source file and jump straight to the exported function. Schema references using `${file(...)}` also become navigable links to the JSON schema file.

## Features

- **Clickable links** on `handler:` values — jump to the file and exported function
- **Clickable links** on `schema: ${file(...)}` — open the JSON schema directly
- **CodeLens buttons** above handler and schema lines for quick navigation
- **Variable resolution** — supports `${self:...}`, `${opt:...}`, `${env:...}`
- **Monorepo support** — resolves paths relative to both `serverless.yml` and workspace root
- **Zero runtime dependencies** — lightweight and fast

## How it works

Open any `serverless.yml` or `serverless.yaml` file and you'll see:

1. Handler values are underlined and clickable — clicking navigates to the source file and positions the cursor at the exported function
2. CodeLens buttons appear above each handler line showing the file path and export name
3. Schema `${file(...)}` references are clickable links to the JSON schema file

## Supported patterns

### Handlers

```yaml
functions:
  hello:
    handler: src/functions/hello.handler
```

### Schemas

```yaml
functions:
  createUser:
    handler: src/handlers/user.create
    events:
      - http:
          method: post
          request:
            schemas:
              application/json:
                schema: ${file(schemas/create-user.json)}
```

### Variables

```yaml
custom:
  handlersPath: src/functions

functions:
  hello:
    handler: ${self:custom.handlersPath}/hello.handler
```

## Development

```bash
npm install
npm run compile
npm run test
```

Press `F5` in VS Code to launch the Extension Development Host for testing.
