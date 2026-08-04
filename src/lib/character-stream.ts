export function completedJsonValue(source: string, key: string): unknown {
  const match = new RegExp(`"${key}"\\s*:`).exec(source);
  if (!match) return undefined;
  let start = match.index + match[0].length;
  while (/\s/.test(source[start] ?? "")) start += 1;
  const opener = source[start];
  if (opener !== `"` && opener !== "[") return undefined;
  let inString = opener === `"`;
  let escaped = false;
  let depth = opener === "[" ? 1 : 0;
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === `"`) {
      if (opener === `"` && inString) {
        try {
          return JSON.parse(source.slice(start, index + 1));
        } catch {
          return undefined;
        }
      }
      inString = !inString;
      continue;
    }
    if (!inString && opener === "[") {
      if (character === "[") depth += 1;
      if (character === "]") depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(source.slice(start, index + 1));
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}

export function characterBuildProgress(elapsedSeconds: number, completedFieldCount: number) {
  if (completedFieldCount > 0) {
    return {
      percent: Math.min(100, completedFieldCount * 20),
      estimated: false,
    };
  }

  // Time-to-first-token can take several seconds. Keep this deliberately below
  // the first real field milestone so the UI stays alive without claiming that
  // actor data has arrived.
  return {
    percent: Math.min(18, 3 + Math.floor(Math.max(0, elapsedSeconds) * 1.25)),
    estimated: true,
  };
}
