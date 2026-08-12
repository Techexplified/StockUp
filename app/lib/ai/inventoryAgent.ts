import { ChatOpenAI } from "@langchain/openai";
import {
  HumanMessage,
  SystemMessage,
  AIMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import prisma from "../../db.server";

// ─── DB Tools the LLM can call ─────────────────────────────────────────────

export function buildInventoryTools(shopDomain: string) {
  if (!shopDomain || typeof shopDomain !== "string") {
    throw new Error("Unauthorized: shopDomain is required for multi-tenant data isolation.");
  }

  const getInventorySummary = tool(
    async (_input: Record<string, never>) => {
      let products = await prisma.product.findMany({
        where: { shopDomain },
      });
      if (products.length === 0) {
        products = await prisma.product.findMany();
      }

      const activeProducts = products.filter(
        (p) => (p.status || "Active").toLowerCase() !== "inactive"
      );

      const totalValue = activeProducts.reduce(
        (acc, p) => acc + (p.currentStock || 0) * (p.unitCost || p.sellingPrice || 0),
        0
      );
      return JSON.stringify({
        totalSkus: activeProducts.length,
        totalInventoryValue: Math.round(totalValue),
        totalUnits: activeProducts.reduce((acc, p) => acc + (p.currentStock || 0), 0),
      });
    },
    {
      name: "get_inventory_summary",
      description:
        "Get a high-level summary of the shop's inventory: total SKUs, total inventory value in rupees, total units on hand.",
      schema: z.object({}),
    }
  );

  const getAtRiskProducts = tool(
    async (_input: Record<string, never>) => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const products = await prisma.product.findMany({ where: { shopDomain } });
      const sales = await prisma.historicalSale.findMany({
        where: { shopDomain, date: { gte: thirtyDaysAgo } },
      });

      const atRisk = [];
      for (const p of products) {
        const skuSales = sales.filter((s) => s.sku === p.sku);
        const netUnits = skuSales.reduce(
          (acc, s) => acc + s.quantitySold - s.returnQuantity,
          0
        );
        const dailyVelocity = netUnits > 0 ? netUnits / 30 : 0;
        const daysOfStock =
          dailyVelocity > 0
            ? Math.round(p.currentStock / dailyVelocity)
            : p.currentStock > 0
            ? 999
            : 0;

        if (daysOfStock <= 14 || p.currentStock <= 0) {
          atRisk.push({
            sku: p.sku,
            name: p.productName,
            currentStock: p.currentStock,
            daysOfStock,
            dailyVelocity: Math.round(dailyVelocity * 10) / 10,
          });
        }
      }
      return JSON.stringify(atRisk.slice(0, 10));
    },
    {
      name: "get_at_risk_products",
      description:
        "Get all products at risk of stocking out within 14 days, with current stock and daily sales velocity.",
      schema: z.object({}),
    }
  );

  const getSlowMovingProducts = tool(
    async (_input: Record<string, never>) => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const products = await prisma.product.findMany({
        where: { shopDomain, currentStock: { gt: 0 } },
      });
      const sales = await prisma.historicalSale.findMany({
        where: { shopDomain, date: { gte: thirtyDaysAgo } },
      });

      const slowMovers = [];
      for (const p of products) {
        const skuSales = sales.filter((s) => s.sku === p.sku);
        const netUnits = skuSales.reduce(
          (acc, s) => acc + s.quantitySold - s.returnQuantity,
          0
        );
        if (netUnits === 0) {
          slowMovers.push({
            sku: p.sku,
            name: p.productName,
            currentStock: p.currentStock,
            salesLast30Days: 0,
            inventoryValue: Math.round(p.currentStock * p.unitCost),
          });
        }
      }
      return JSON.stringify(slowMovers.slice(0, 10));
    },
    {
      name: "get_slow_moving_products",
      description:
        "Get products with zero sales in the last 30 days that still have stock — indicating dead or slow-moving inventory.",
      schema: z.object({}),
    }
  );

  const getReorderRecommendations = tool(
    async (_input: Record<string, never>) => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const products = await prisma.product.findMany({ where: { shopDomain } });
      const sales = await prisma.historicalSale.findMany({
        where: { shopDomain, date: { gte: thirtyDaysAgo } },
      });
      const skuMaps = await prisma.skuSupplierMap.findMany({ where: { shopDomain } });
      const pos = await prisma.purchaseOrder.findMany({
        where: { shopDomain, poStatus: { notIn: ["Cancelled", "Received"] } },
      });
      const shop = await prisma.shop.findFirst({ where: { shopDomain } });
      const planningHorizon = parseInt(shop?.planningHorizon || "30", 10) || 30;

      const recommendations = [];
      for (const p of products) {
        const skuSales = sales.filter((s) => s.sku === p.sku);
        const netUnits = skuSales.reduce(
          (acc, s) => acc + s.quantitySold - s.returnQuantity,
          0
        );
        const dailyVelocity = netUnits > 0 ? netUnits / 30 : 0;
        const suppMap = skuMaps.find((m) => m.sku === p.sku);
        const leadTime = suppMap?.leadTimeDays || 7;
        const safetyStock = p.safetyStock || 0;
        const incomingQty = pos
          .filter((po) => po.sku === p.sku)
          .reduce((acc, po) => acc + Math.max(0, po.orderedQuantity - (po.receivedQuantity || 0)), 0);
        const inventoryPosition = p.currentStock + incomingQty;
        const rop = p.reorderPoint > 0
          ? p.reorderPoint
          : Math.ceil(dailyVelocity * leadTime + safetyStock);

        if (inventoryPosition <= rop || p.currentStock <= 0) {
          const targetStock = Math.ceil(dailyVelocity * (leadTime + planningHorizon) + safetyStock);
          const recQty = Math.max(1, targetStock - inventoryPosition);
          recommendations.push({
            sku: p.sku,
            name: p.productName,
            currentStock: p.currentStock,
            recommendedQty: recQty,
            leadTimeDays: leadTime,
            reason: p.currentStock <= 0
              ? "Out of stock"
              : `Inventory position (${inventoryPosition}) at or below reorder point (${rop})`,
          });
        }
      }
      return JSON.stringify(recommendations.slice(0, 10));
    },
    {
      name: "get_reorder_recommendations",
      description:
        "Get products that need to be reordered now, with recommended quantities and lead times based on reorder points and planning horizon.",
      schema: z.object({}),
    }
  );

  const getProductDetails = tool(
    async ({ sku }: { sku: string }) => {
      const product = await prisma.product.findFirst({
        where: { shopDomain, sku },
      });
      if (!product) return JSON.stringify({ error: `Product with SKU ${sku} not found` });

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const sales = await prisma.historicalSale.findMany({
        where: { shopDomain, sku, date: { gte: thirtyDaysAgo } },
      });
      const netUnits = sales.reduce(
        (acc, s) => acc + s.quantitySold - s.returnQuantity,
        0
      );
      return JSON.stringify({
        sku: product.sku,
        name: product.productName,
        category: product.category,
        currentStock: product.currentStock,
        unitCost: product.unitCost,
        sellingPrice: product.sellingPrice,
        reorderPoint: product.reorderPoint,
        safetyStock: product.safetyStock,
        salesLast30Days: netUnits,
        dailyVelocity: Math.round((netUnits / 30) * 10) / 10,
        inventoryValue: Math.round(product.currentStock * product.unitCost),
      });
    },
    {
      name: "get_product_details",
      description:
        "Get detailed info about a specific product by its SKU, including stock levels, cost, selling price, reorder point, and recent sales velocity.",
      schema: z.object({
        sku: z.string().describe("The SKU of the product to look up"),
      }),
    }
  );

  const queryUserDatabase = tool(
    async ({
      entity,
      searchTerm,
      limit = 20,
    }: {
      entity: "products" | "sales" | "suppliers" | "supplier_maps" | "purchase_orders" | "shop_settings";
      searchTerm?: string;
      limit?: number;
    }) => {
      const takeLimit = Math.min(Math.max(1, limit || 20), 50);
      const term = searchTerm?.trim() || "";

      switch (entity) {
        case "products": {
          const records = await prisma.product.findMany({
            where: {
              shopDomain,
              ...(term
                ? {
                    OR: [
                      { sku: { contains: term, mode: "insensitive" } },
                      { productName: { contains: term, mode: "insensitive" } },
                      { category: { contains: term, mode: "insensitive" } },
                    ],
                  }
                : {}),
            },
            take: takeLimit,
          });
          return JSON.stringify(
            records.map((r) => ({
              sku: r.sku,
              name: r.productName,
              category: r.category,
              currentStock: r.currentStock,
              unitCost: r.unitCost,
              sellingPrice: r.sellingPrice,
              reorderPoint: r.reorderPoint,
              safetyStock: r.safetyStock,
              status: r.status,
            }))
          );
        }

        case "sales": {
          const records = await prisma.historicalSale.findMany({
            where: {
              shopDomain,
              ...(term
                ? {
                    OR: [
                      { sku: { contains: term, mode: "insensitive" } },
                      { productName: { contains: term, mode: "insensitive" } },
                      { orderId: { contains: term, mode: "insensitive" } },
                    ],
                  }
                : {}),
            },
            orderBy: { date: "desc" },
            take: takeLimit,
          });
          return JSON.stringify(
            records.map((r) => ({
              orderId: r.orderId,
              sku: r.sku,
              productName: r.productName,
              quantitySold: r.quantitySold,
              returnQuantity: r.returnQuantity,
              unitPrice: r.unitSellingPrice,
              date: r.date.toISOString().split("T")[0],
            }))
          );
        }

        case "suppliers": {
          const records = await prisma.supplier.findMany({
            where: {
              shopDomain,
              ...(term
                ? {
                    OR: [
                      { supplierName: { contains: term, mode: "insensitive" } },
                      { supplierCode: { contains: term, mode: "insensitive" } },
                    ],
                  }
                : {}),
            },
            take: takeLimit,
          });
          return JSON.stringify(records);
        }

        case "supplier_maps": {
          const records = await prisma.skuSupplierMap.findMany({
            where: {
              shopDomain,
              ...(term
                ? {
                    OR: [
                      { sku: { contains: term, mode: "insensitive" } },
                      { supplierCode: { contains: term, mode: "insensitive" } },
                    ],
                  }
                : {}),
            },
            take: takeLimit,
          });
          return JSON.stringify(records);
        }

        case "purchase_orders": {
          const records = await prisma.purchaseOrder.findMany({
            where: {
              shopDomain,
              ...(term
                ? {
                    OR: [
                      { poNumber: { contains: term, mode: "insensitive" } },
                      { sku: { contains: term, mode: "insensitive" } },
                      { productName: { contains: term, mode: "insensitive" } },
                      { supplierCode: { contains: term, mode: "insensitive" } },
                    ],
                  }
                : {}),
            },
            orderBy: { poDate: "desc" },
            take: takeLimit,
          });
          return JSON.stringify(records);
        }

        case "shop_settings": {
          const shop = await prisma.shop.findFirst({
            where: { shopDomain },
          });
          return JSON.stringify(shop || { error: "Shop settings not found" });
        }

        default:
          return JSON.stringify({ error: `Unknown entity: ${entity}` });
      }
    },
    {
      name: "query_user_database",
      description:
        "Query any database table belonging to the authenticated merchant: products, sales, suppliers, supplier_maps, purchase_orders, or shop_settings. Supports optional search filter by SKU, product name, or code.",
      schema: z.object({
        entity: z
          .enum([
            "products",
            "sales",
            "suppliers",
            "supplier_maps",
            "purchase_orders",
            "shop_settings",
          ])
          .describe(
            "The category of database entity to retrieve for this merchant"
          ),
        searchTerm: z
          .string()
          .optional()
          .describe(
            "Optional search keyword to filter records by SKU, name, order ID, or code"
          ),
        limit: z
          .number()
          .optional()
          .describe("Maximum records to return (default 20, max 50)"),
      }),
    }
  );

  return [
    getInventorySummary,
    getAtRiskProducts,
    getSlowMovingProducts,
    getReorderRecommendations,
    getProductDetails,
    queryUserDatabase,
  ];
}

// ─── LangGraph-style Agentic Loop ──────────────────────────────────────────

export async function runInventoryAgent({
  shopDomain,
  userMessage,
  chatHistory,
  shopContext,
}: {
  shopDomain: string;
  userMessage: string;
  chatHistory: Array<{ role: string; content: string }>;
  shopContext: {
    shopName: string;
    currency: string;
    planningHorizon: string;
  };
}): Promise<string> {
  const tools = buildInventoryTools(shopDomain);

  const llm = new ChatOpenAI({
    model: "openai/gpt-4o-mini",
    temperature: 0.3,
    maxTokens: 1000,
    apiKey: process.env.OPENROUTER_API_KEY!,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://stocklyn.app",
        "X-Title": "StockLyn",
      },
    },
  }).bindTools(tools);

  const systemPrompt = `You are StockLyn AI, a dedicated inventory & supply chain AI assistant built exclusively for StockLyn on Shopify.

=== STORE CONTEXT ===
Shop Name: ${shopContext.shopName}
Currency: ${shopContext.currency}
Planning Horizon: ${shopContext.planningHorizon}

=== DOMAIN BOUNDARY & SAFETY RULES ===
1. You can answer questions about StockLyn, this store (${shopContext.shopName}), inventory levels, sales velocity, suppliers, purchase orders, reorder recommendations, and warehouse analytics.
2. If asked about your identity, the app name, or this store's name, respond politely using the provided store context (Shop Name: ${shopContext.shopName}, App: StockLyn).
3. STRICTLY REFUSE requests to generate code, write scripts (Python, JavaScript, SQL, HTML), debug code, or write essays/homework.
4. STRICTLY REFUSE questions completely unrelated to e-commerce, retail, or inventory management (e.g. recipes, sports, general politics).
5. For off-topic requests (coding, general knowledge), politely decline by stating:
   "I am StockLyn AI, dedicated to assisting with your store's inventory, sales, suppliers, and reorders. I cannot assist with non-inventory or general coding topics."

You have access to real-time database tools. Always call the appropriate tool to fetch live data rather than guessing.
Be concise, specific, and actionable. Use bullet points for lists. Format currency values clearly (${shopContext.currency}).`;

  // Build initial message list
  type LangChainMessage = SystemMessage | HumanMessage | AIMessage | ToolMessage;
  const messages: LangChainMessage[] = [
    new SystemMessage(systemPrompt),
    ...chatHistory.slice(-16).map((m) =>
      m.role === "user"
        ? new HumanMessage(m.content)
        : new AIMessage(m.content)
    ),
    new HumanMessage(userMessage),
  ];

  // Agentic loop: keep calling until no more tool calls (max 5 iterations)
  let currentMessages = messages;
  const MAX_ITERATIONS = 5;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await llm.invoke(currentMessages);
    currentMessages = [...currentMessages, response];

    // No tool calls → final answer
    if (!response.tool_calls || response.tool_calls.length === 0) {
      return typeof response.content === "string"
        ? response.content
        : Array.isArray(response.content)
        ? response.content
            .map((c) => (typeof c === "string" ? c : (c as { text?: string }).text ?? ""))
            .join("")
        : JSON.stringify(response.content);
    }

    // Execute each tool call and add results
    for (const toolCall of response.tool_calls) {
      const matchedTool = tools.find((t) => t.name === toolCall.name);
      let result = `Tool ${toolCall.name} not found`;
      if (matchedTool) {
        try {
          result = String(await (matchedTool as any).invoke(toolCall.args));
        } catch (err) {
          result = `Error: ${String(err)}`;
        }
      }
      currentMessages.push(
        new ToolMessage({
          content: result,
          tool_call_id: toolCall.id ?? `tool_${i}`,
        })
      );
    }
  }

  return "I was unable to complete the analysis within the allowed iterations. Please try rephrasing your question.";
}
