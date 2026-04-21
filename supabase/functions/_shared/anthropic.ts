export const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-4-20250514";
// Haiku is used for the high-volume fan-out stages (segmenter, assembler)
// — both are structured-output tasks that Haiku handles well, and Haiku
// has rate limits that are independent of the Sonnet pool, so we can
// parallelize chunks without hitting Sonnet's output-tokens/minute cap.
export const ANTHROPIC_FAST_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export interface ClaudeCallParams {
  system: string;
  user: string;
  maxTokens: number;
  model?: string;
}

export async function callClaude({
  system,
  user,
  maxTokens,
  model,
}: ClaudeCallParams): Promise<string> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY não configurado nos secrets da edge function");
  }

  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: model ?? ANTHROPIC_DEFAULT_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${errText.slice(0, 500)}`);
  }

  const data = await response.json();
  const textBlock = Array.isArray(data?.content)
    ? data.content.find((c: { type?: string }) => c.type === "text")
    : null;
  const text: string = textBlock?.text ?? "";
  if (!text) {
    throw new Error("Resposta do Claude não contém bloco de texto");
  }
  return text;
}

export function stripJsonFences(raw: string): string {
  return raw
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

export function parseJsonResponse<T>(raw: string, label = "Claude"): T {
  try {
    return JSON.parse(stripJsonFences(raw)) as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const len = raw.length;
    const head = raw.slice(0, 400);
    const tail = raw.slice(Math.max(0, raw.length - 200));
    throw new Error(
      `Falha ao parsear JSON de ${label}: ${msg}. ` +
        `length=${len} head=${head} | tail=${tail}`,
    );
  }
}
