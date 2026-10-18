// PROVISIONAL: built early, audited in layer L6 backend
import { getCheck } from "@/lib/db/index.js";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    if (!id) {
      return Response.json(
        { error: "Check ID is required", code: "MISSING_ID" },
        { status: 400 }
      );
    }

    const check = getCheck(id);
    if (!check) {
      return Response.json(
        { error: "Check not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    return Response.json({
      check,
      entities: [],
    });
  } catch (err) {
    return Response.json(
      { error: "Internal server error", code: "SERVER_ERROR", message: err.message },
      { status: 500 }
    );
  }
}
