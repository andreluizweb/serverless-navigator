export interface HandlerEntry {
  raw: string;
  line: number;
  functionLine: number;
  valueStart: number;
  functionName: string;
}

export interface SchemaEntry {
  raw: string; // valor completo, ex: "${file(schemas/book.json)}"
  filePath: string; // caminho extraído, ex: "schemas/book.json"
  line: number;
  valueStart: number;
  functionName: string;
}

export interface ParsedServerless {
  handlers: HandlerEntry[];
  schemas: SchemaEntry[];
  data: Record<string, unknown>;
}

export function parseServerlessYaml(text: string): ParsedServerless {
  const lines = text.split('\n');
  const data = parseToObject(lines);
  const handlers = extractHandlers(lines);
  const schemas = extractSchemas(lines);
  return { handlers, schemas, data };
}

function getIndent(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

function extractHandlers(lines: string[]): HandlerEntry[] {
  const handlers: HandlerEntry[] = [];
  let inFunctions = false;
  let functionsIndent = -1;
  let currentFunctionName = '';
  let currentFunctionIndent = -1;
  let currentFunctionLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }

    const indent = getIndent(line);

    if (/^functions\s*:/.test(trimmed) && indent === 0) {
      inFunctions = true;
      functionsIndent = indent;
      continue;
    }

    if (inFunctions && indent === 0 && /^\S+\s*:/.test(trimmed)) {
      inFunctions = false;
      currentFunctionName = '';
      currentFunctionIndent = -1;
      currentFunctionLine = -1;
      continue;
    }

    if (!inFunctions) {
      continue;
    }

    const keyMatch = trimmed.match(/^([\w][\w.-]*)\s*:\s*(.*)$/);
    if (!keyMatch) {
      continue;
    }

    const key = keyMatch[1];
    const value = keyMatch[2];

    if (indent >= functionsIndent + 1 && indent <= functionsIndent + 4) {
      if (key !== 'handler') {
        const isChildOfFunction = currentFunctionIndent >= 0 && indent > currentFunctionIndent;
        if (!isChildOfFunction) {
          currentFunctionName = key;
          currentFunctionIndent = indent;
          currentFunctionLine = i;
        }
      }
    }

    if (key === 'handler' && currentFunctionName && indent > currentFunctionIndent) {
      const rawValue = value.replace(/\s+#.*$/, '').trim();
      if (rawValue) {
        const valueStart = line.indexOf(rawValue, line.indexOf('handler'));
        handlers.push({
          raw: rawValue,
          line: i,
          functionLine: currentFunctionLine,
          valueStart,
          functionName: currentFunctionName,
        });
      }
    }
  }

  return handlers;
}

function extractSchemas(lines: string[]): SchemaEntry[] {
  const schemas: SchemaEntry[] = [];
  let inFunctions = false;
  let currentFunctionName = '';
  let currentFunctionIndent = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }

    const indent = getIndent(line);

    if (/^functions\s*:/.test(trimmed) && indent === 0) {
      inFunctions = true;
      continue;
    }

    if (inFunctions && indent === 0 && /^\S+\s*:/.test(trimmed)) {
      inFunctions = false;
      currentFunctionName = '';
      currentFunctionIndent = -1;
      continue;
    }

    if (!inFunctions) {
      continue;
    }

    const keyMatch = trimmed.match(/^([\w][\w.-]*)\s*:\s*(.*)$/);
    if (!keyMatch) {
      continue;
    }

    const key = keyMatch[1];
    const value = keyMatch[2];

    if (indent >= 1 && indent <= 4) {
      if (key !== 'handler') {
        const isChildOfFunction = currentFunctionIndent >= 0 && indent > currentFunctionIndent;
        if (!isChildOfFunction) {
          currentFunctionName = key;
          currentFunctionIndent = indent;
        }
      }
    }

    if (key === 'schema' && currentFunctionName) {
      const rawValue = value.replace(/\s+#.*$/, '').trim();
      const fileMatch = rawValue.match(/^\$\{file\(([^)]+)\)\}$/);
      if (fileMatch) {
        const valueStart = line.indexOf(rawValue);
        schemas.push({
          raw: rawValue,
          filePath: fileMatch[1],
          line: i,
          valueStart,
          functionName: currentFunctionName,
        });
      }
    }
  }

  return schemas;
}

function parseToObject(lines: string[]): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  const stack: { indent: number; obj: Record<string, unknown> }[] = [
    { indent: -1, obj: root },
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }

    const indent = getIndent(line);
    const keyMatch = trimmed.match(/^([\w][\w.-]*)\s*:\s*(.*)$/);
    if (!keyMatch) {
      continue;
    }

    const key = keyMatch[1];
    let value = keyMatch[2].replace(/\s+#.*$/, '').trim();

    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].obj;

    if (value === '' || value === '|' || value === '>') {
      const child: Record<string, unknown> = {};
      parent[key] = child;
      stack.push({ indent, obj: child });
    } else {
      if ((value.startsWith("'") && value.endsWith("'")) ||
          (value.startsWith('"') && value.endsWith('"'))) {
        value = value.slice(1, -1);
      }
      parent[key] = value;
    }
  }

  return root;
}
