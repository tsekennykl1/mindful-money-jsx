import { createFileRoute } from "@tanstack/react-router";
import { verifiedBearer } from "../../lib/api-auth";

const STOCK_URL = "https://z35lnmmzgi.execute-api.ap-east-1.amazonaws.com/prod/getStockData";
const STOCK_LIST = /^[A-Za-z0-9.,_-]+$/;

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/stocks")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = await verifiedBearer(request);
        if (!token) {
          return jsonResponse({ error: "Sign in is required" }, 401);
        }

        const stocks = new URL(request.url).searchParams.get("stocks")?.trim() || "";
        if (!stocks || stocks.length > 300 || !STOCK_LIST.test(stocks)) {
          return jsonResponse({ error: "Invalid stock codes" }, 400);
        }

        try {
          const upstream = await fetch(`${STOCK_URL}?stocks=${encodeURIComponent(stocks)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          return new Response(upstream.body, {
            status: upstream.status,
            headers: {
              "Content-Type": upstream.headers.get("content-type") || "application/json",
              "Cache-Control": "no-store",
            },
          });
        } catch (error) {
          console.error("Stock service request failed", error);
          return jsonResponse({ error: "The stock service is unavailable" }, 502);
        }
      },
    },
  },
});