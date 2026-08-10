import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { syncSingleOrderToDb } from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, topic } = await authenticate.webhook(request);
  console.log(`[Webhook] Received ${topic} for ${shop}`);

  await syncSingleOrderToDb(shop, payload);

  return new Response();
};
