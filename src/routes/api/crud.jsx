import { createFileRoute } from "@tanstack/react-router";
import { verifiedBearer, authFailureMessage } from "../../lib/api-auth";

const CRUD_URL = "https://z35lnmmzgi.execute-api.ap-east-1.amazonaws.com/prod/lambda_crud_handler";
const ALLOWED_ACTIONS = new Set(["get", "get_all", "insert", "update", "delete"]);

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/crud")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = await verifiedBearer(request);
        if (!token) {
          return jsonResponse({ error: authFailureMessage(request) }, 401);
        }

        let body;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: "Invalid request" }, 400);
        }

        if (
          !body ||
          typeof body !== "object" ||
          typeof body.resource_name !== "string" ||
          !ALLOWED_ACTIONS.has(body.action) ||
          !body.payload ||
          typeof body.payload !== "object" ||
          Array.isArray(body.payload)
        ) {
          return jsonResponse({ error: "Invalid request" }, 400);
        }

        try {
          const upstream = await fetch(CRUD_URL, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          });
          return new Response(upstream.body, {
            status: upstream.status,
            headers: {
              "Content-Type": upstream.headers.get("content-type") || "application/json",
              "Cache-Control": "no-store",
            },
          });
        } catch (error) {
          console.error("CRUD service request failed", error);
          return jsonResponse({ error: "The data service is unavailable" }, 502);
        }
      },
    },
  },
});