export function resolveVariables(
  input: string,
  parsedYaml: Record<string, unknown>,
): string {
  let result = input;

  for (let i = 0; i < 10; i++) {
    const hasVars = /\$\{[^}]+\}/.test(result);
    if (!hasVars) {
      break;
    }

    result = result.replace(/\$\{([^}]+)\}/g, (_match, expr: string) => {
      return resolveExpression(expr, parsedYaml);
    });
  }

  return result;
}

function resolveExpression(
  expr: string,
  parsedYaml: Record<string, unknown>,
): string {
  const commaIndex = findTopLevelComma(expr);
  let mainExpr = expr;
  let defaultValue: string | undefined;

  if (commaIndex >= 0) {
    mainExpr = expr.slice(0, commaIndex).trim();
    defaultValue = expr.slice(commaIndex + 1).trim();
    if (
      (defaultValue.startsWith("'") && defaultValue.endsWith("'")) ||
      (defaultValue.startsWith('"') && defaultValue.endsWith('"'))
    ) {
      defaultValue = defaultValue.slice(1, -1);
    }
  }

  if (mainExpr.startsWith('self:')) {
    const path = mainExpr.slice(5);
    const value = lookupPath(parsedYaml, path);
    if (value !== undefined) {
      return String(value);
    }
    return defaultValue !== undefined ? defaultValue : `\${${expr}}`;
  }

  if (mainExpr.startsWith('opt:') || mainExpr.startsWith('env:')) {
    return defaultValue !== undefined ? defaultValue : `\${${expr}}`;
  }

  if (mainExpr.startsWith('file(')) {
    return defaultValue !== undefined ? defaultValue : `\${${expr}}`;
  }

  return defaultValue !== undefined ? defaultValue : `\${${expr}}`;
}

function lookupPath(
  obj: Record<string, unknown>,
  dotPath: string,
): unknown {
  const parts = dotPath.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function findTopLevelComma(expr: string): number {
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];

    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
    } else if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    } else if (!inSingleQuote && !inDoubleQuote) {
      if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
      } else if (ch === ',' && depth === 0) {
        return i;
      }
    }
  }

  return -1;
}
