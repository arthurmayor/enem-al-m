export const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-4-20250514";
export const ANTHROPIC_FAST_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export interface ClaudeCallParams {
  system: string;
  user: string;
  maxTokens: number;
  model?: string;
}

export interface ClaudeToolParams<T> extends ClaudeCallParams {
  toolName: string;
  toolDescription?: string;
  // JSON Schema object describing the expected tool input. Anthropic
  // enforces this shape so the returned payload is guaranteed-parseable.
  schema: Record<string, unknown>;
}

type AnyRecord = Record<string, unknown>;

async function anthropicFetch(body: AnyRecord): Promise<AnyRecord> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY não configurado nos secrets da edge function");
  }

  // Retry 429 / 5xx with short exponential backoff (2 retries).
  const maxAttempts = 3;
  let lastErr = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      return (await response.json()) as AnyRecord;
    }

    const errText = await response.text();
    lastErr = `Anthropic API ${response.status}: ${errText.slice(0, 500)}`;

    const retriable = response.status === 429 || response.status >= 500;
    if (!retriable || attempt === maxAttempts) {
      throw new Error(lastErr);
    }
    const waitMs = 1500 * attempt;
    console.log(
      `[anthropic] attempt ${attempt} failed (${response.status}), retrying in ${waitMs}ms`,
    );
    await new Promise((r) => setTimeout(r, waitMs));
  }
  throw new Error(lastErr);
}

export async function callClaude({
  system,
  user,
  maxTokens,
  model,
}: ClaudeCallParams): Promise<string> {
  const data = await anthropicFetch({
    model: model ?? ANTHROPIC_DEFAULT_MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });

  const content = data.content;
  const textBlock = Array.isArray(content)
    ? (content as AnyRecord[]).find((c) => c.type === "text")
    : null;
  const text = (textBlock?.text as string | undefined) ?? "";
  if (!text) {
    throw new Error("Resposta do Claude não contém bloco de texto");
  }
  return text;
}

// Uses Anthropic's Tool Use with a forced tool_choice so the model is
// obligated to emit a JSON payload matching the given schema. This
// removes the entire class of "malformed JSON in the middle of a long
// string" failures that hit us in the segmenter and assembler stages.
export async function callClaudeTool<T>({
  system,
  user,
  maxTokens,
  model,
  toolName,
  toolDescription,
  schema,
}: ClaudeToolParams<T>): Promise<T> {
  const data = await anthropicFetch({
    model: model ?? ANTHROPIC_DEFAULT_MODEL,
    max_tokens: maxTokens,
    system,
    tools: [
      {
        name: toolName,
        description: toolDescription ?? `Submit the structured result for ${toolName}.`,
        input_schema: schema,
      },
    ],
    tool_choice: { type: "tool", name: toolName },
    messages: [{ role: "user", content: user }],
  });

  const content = data.content;
  const toolBlock = Array.isArray(content)
    ? (content as AnyRecord[]).find((c) => c.type === "tool_use" && c.name === toolName)
    : null;
  if (!toolBlock) {
    const stopReason = data.stop_reason;
    throw new Error(
      `Tool call de ${toolName} ausente na resposta (stop_reason=${String(stopReason)}).`,
    );
  }
  return toolBlock.input as T;
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
      `Falha ao parsear JSON de ${label}: ${msg}. length=${len} head=${head} | tail=${tail}`,
    );
  }
}
