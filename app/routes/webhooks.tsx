import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);

  console.log(`[Compliance Webhook] Received ${topic} for ${shop}`);

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
    case "SHOP_REDACT":
      return new Response(null, { status: 200 });
    default:
      return new Response("Unhandled compliance topic", { status: 404 });
  }
};