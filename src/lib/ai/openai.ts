/**
 * Raw OpenAI chat completions client — no openai npm package.
 * Zero-dependency approach consistent with the rest of this codebase.
 *
 * Usage:
 *   const json = await callOpenAI({ model: "gpt-4o-mini", systemPrompt, userContent });
 *   const data = JSON.parse(json);
 */

import { CONFIG } from "@/lib/config";

export type OpenAIModel = "gpt-4o-mini" | "gpt-4o";

type TextContentPart = {
  type: "text";
  text: string;
};

type ImageContentPart = {
  type: "image_url";
  image_url: { url: string; detail?: "low" | "high" };
};

type UserContent = string | Array<TextContentPart | ImageContentPart>;

type CallOpenAIParams = {
  model: OpenAIModel;
  systemPrompt: string;
  userContent: UserContent;
  maxTokens?: number;
  responseFormat?: "json_object";
  timeoutMs?: number;
};

/**
 * Calls the OpenAI Chat Completions API and returns the raw assistant message string.
 * Throws an Error on:
 *   - Missing or empty OPENAI_API_KEY
 *   - Non-2xx HTTP response from OpenAI
 *   - Missing choices in the response body
 */
export async function callOpenAI({
  model,
  systemPrompt,
  userContent,
  maxTokens = 2048,
  responseFormat,
  timeoutMs = 2500,
}: CallOpenAIParams): Promise<string> {
  const apiKey = CONFIG.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("openai_key_missing");
  }

  const messages: Array<{ role: string; content: UserContent }> = [
    { role: "system", content: systemPrompt },
    { role: "user",   content: userContent },
  ];

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: maxTokens,
  };

  if (responseFormat === "json_object") {
    body.response_format = { type: "json_object" };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("openai_timeout");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`openai_request_failed:${res.status}:${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("openai_empty_response");
  }

  return content;
}
