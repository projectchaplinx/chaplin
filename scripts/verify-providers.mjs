import { readFile } from "node:fs/promises";

function parseEnv(source) {
  const values = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

async function request(name, url, options, expected = [200]) {
  const startedAt = performance.now();
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20_000) });
    await response.body?.cancel();
    return {
      name,
      passed: expected.includes(response.status),
      status: response.status,
      latency: `${Math.round(performance.now() - startedAt)}ms`,
      detail: response.ok ? "credentials accepted" : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      name,
      passed: false,
      status: "ERR",
      latency: `${Math.round(performance.now() - startedAt)}ms`,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const fileEnv = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
  const env = { ...fileEnv, ...process.env };
  const required = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "ELEVEN_LABS_API_KEY",
    "SEEDANCE_API_KEY",
    "OPENAI_API_KEY",
  ];
  const missing = required.filter((key) => !env[key]?.trim());
  if (missing.length) throw new Error(`Missing provider configuration: ${missing.join(", ")}`);

  const checks = [
    request(
      "Supabase REST",
      `${env.SUPABASE_URL}/rest/v1/characters?select=id&limit=1`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    ),
    request(
      "ElevenLabs",
      "https://api.elevenlabs.io/v1/voices",
      { headers: { "xi-api-key": env.ELEVEN_LABS_API_KEY } },
    ),
    request(
      "OpenAI GPT-5.6 Terra",
      "https://api.openai.com/v1/models/gpt-5.6-terra",
      { headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` } },
    ),
    request(
      "BytePlus ModelArk",
      "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks?page_num=1&page_size=1",
      { headers: { Authorization: `Bearer ${env.SEEDANCE_API_KEY}` } },
    ),
  ];
  if (env.OPENROUTER_API_KEY?.trim()) {
    checks.push(request(
      "OpenRouter",
      "https://openrouter.ai/api/v1/auth/key",
      { headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` } },
    ));
  }
  const results = await Promise.all(checks);
  if (!env.OPENROUTER_API_KEY?.trim()) {
    results.push({ name: "OpenRouter", passed: true, status: "SKIP", latency: "-", detail: "not configured" });
  }

  console.table(results);
  const failures = results.filter((result) => !result.passed);
  if (failures.length) {
    throw new Error(`${failures.length} configured provider connection${failures.length === 1 ? "" : "s"} failed.`);
  }
  console.log("All configured provider credentials were accepted without starting a paid generation.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
