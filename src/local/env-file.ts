export function parseEnv(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    values[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
  }
  return values;
}

export function upsertEnv(text: string, updates: Record<string, string>): string {
  for (const [key, value] of Object.entries(updates)) {
    if (/[\r\n]/.test(value)) throw new Error(`${key} must be a single line.`);
  }
  const pending = new Map(Object.entries(updates));
  const lines = text === "" ? [] : text.replace(/\n$/, "").split("\n");
  const updated = lines.map((line) => {
    const key = line.split("=")[0]?.trim();
    if (!key || line.trim().startsWith("#") || !pending.has(key)) return line;
    const value = pending.get(key);
    pending.delete(key);
    return `${key}=${value}`;
  });
  for (const [key, value] of pending) updated.push(`${key}=${value}`);
  return `${updated.join("\n")}\n`;
}
