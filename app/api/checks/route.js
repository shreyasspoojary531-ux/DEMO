import crypto from "node:crypto";
import { z } from "zod";
import { createCheck } from "@/lib/db/index.js";

const createCheckSchema = z.object({
  text: z.string().min(1, "Message text is required").max(10000, "Text must not exceed 10,000 characters"),
  language: z.enum(["en", "hi"]).optional().default("en"),
});

export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { error: "Invalid JSON body", code: "INVALID_BODY" },
        { status: 400 }
      );
    }

    const validation = createCheckSchema.safeParse(body);
    if (!validation.success) {
      const errorMsg = validation.error.issues.map((i) => i.message).join(", ");
      return Response.json(
        { error: errorMsg, code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const checkId = crypto.randomUUID();
    createCheck({
      id: checkId,
      language: validation.data.language,
      status: "created",
    });

    return Response.json({ checkId, status: "created" }, { status: 201 });
  } catch (err) {
    return Response.json(
      { error: "Internal server error", code: "SERVER_ERROR", message: err.message },
      { status: 500 }
    );
  }
}
