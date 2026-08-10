import type { ActionFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import { syncSingleProductToDb } from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, topic } = await authenticate.webhook(request);
  console.log(`[Webhook] Received ${topic} for ${shop}`);

  let admin;
  try {
    const authResult = await unauthenticated.admin(shop);
    admin = authResult.admin;
  } catch (e) {
    console.warn(`[Webhook ${topic}] Could not acquire unauthenticated admin client:`, e);
  }

  await syncSingleProductToDb(admin, shop, payload);

  return new Response();
};
