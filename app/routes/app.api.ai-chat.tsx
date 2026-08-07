import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureShopData } from "../db.server";
import prisma from "../db.server";
import { runInventoryAgent } from "../lib/ai/inventoryAgent";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return Response.json(
      { error: "OPENROUTER_API_KEY is not configured in your .env file." },
      { status: 500 }
    );
  }

  try {
    const { session } = await ensureShopData(request, authenticate);
    const shopDomain = session.shop;

    const body = await request.json();
    const { message } = body as { message: string };

    if (!message?.trim()) {
      return Response.json({ error: "Message is required" }, { status: 400 });
    }

    // Load shop context
    const shop = await prisma.shop.findFirst({ where: { shopDomain } });

    // Load last 20 messages from DB for memory
    const dbHistory = await prisma.aiChatMessage.findMany({
      where: { shopDomain },
      orderBy: { createdAt: "asc" },
      take: 20,
    });

    const chatHistory = dbHistory.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Run the LangGraph agentic AI
    const aiReply = await runInventoryAgent({
      shopDomain,
      userMessage: message,
      chatHistory,
      shopContext: {
        shopName: shop?.name || shopDomain,
        currency: shop?.currency || "INR",
        planningHorizon: shop?.planningHorizon || "30 days",
      },
    });

    // Persist both messages to DB for memory
    await prisma.aiChatMessage.createMany({
      data: [
        { shopDomain, role: "user", content: message },
        { shopDomain, role: "assistant", content: aiReply },
      ],
    });

    // Keep history manageable — delete oldest if more than 100 messages
    const totalCount = await prisma.aiChatMessage.count({ where: { shopDomain } });
    if (totalCount > 100) {
      const oldest = await prisma.aiChatMessage.findMany({
        where: { shopDomain },
        orderBy: { createdAt: "asc" },
        take: totalCount - 100,
        select: { id: true },
      });
      await prisma.aiChatMessage.deleteMany({
        where: { id: { in: oldest.map((m) => m.id) } },
      });
    }

    return Response.json({ reply: aiReply });
  } catch (err: any) {
    console.error("[AI Chat Error]", err);
    return Response.json(
      { error: err?.message || "An unexpected error occurred." },
      { status: 500 }
    );
  }
};
