// PROVISIONAL: built early, audited in layer L6 backend
import { z } from "zod";
import { generate } from "@/lib/llm/generate.js";
import { getEnv } from "@/lib/env.js";

const tinyTestSchema = z.object({
  status: z.literal("ok"),
  greeting: z.string(),
});

export async function GET(request) {
  const url = new URL(request.url);
  const testLlm = url.searchParams.get("llm") === "1";

  const result = {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };

  if (testLlm) {
    try {
      // Verify env variables first
      const currentEnv = getEnv(process.env);
      const llmResult = await generate({
        prompt: "Respond with a JSON object: {\"status\": \"ok\", \"greeting\": \"hello\"}",
        schema: tinyTestSchema,
        timeoutMs: 10000,
        customEnv: currentEnv,
      });
      result.llm = { status: "ok", result: llmResult };
    } catch (err) {
      result.llm = { status: "error", message: err.message };
      return Response.json(result, { status: 503 });
    }
  }

  return Response.json(result, { status: 200 });
}
