import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureShopData } from "../db.server";
import prisma from "../db.server";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

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
    const { reportName } = body as { reportName: string };

    if (!reportName) {
      return Response.json({ error: "Report name is required" }, { status: 400 });
    }

    // Fetch live store data for deep AI analysis
    const shop = await prisma.shop.findFirst({ where: { shopDomain } });
    const products = await prisma.product.findMany({ where: { shopDomain } });
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sales = await prisma.historicalSale.findMany({
      where: { shopDomain, date: { gte: thirtyDaysAgo } },
    });
    const skuSupplierMaps = await prisma.skuSupplierMap.findMany({
      where: { shopDomain },
    });
    const suppliers = await prisma.supplier.findMany({
      where: { shopDomain },
    });
    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where: { shopDomain, poStatus: { notIn: ["Cancelled", "Received"] } },
    });

    // Compute key calculated metrics for LLM prompt context
    const totalSkus = products.length;
    const totalValue = products.reduce((acc, p) => acc + p.currentStock * p.unitCost, 0);
    const totalStockUnits = products.reduce((acc, p) => acc + p.currentStock, 0);
    const currency = shop?.currency || "INR";
    const planningHorizon = shop?.planningHorizon || "30 days";

    // Item-level calculations
    const itemsData = products.map((p) => {
      const skuSales = sales.filter((s) => s.sku === p.sku);
      const netUnitsSold = skuSales.reduce(
        (acc, s) => acc + s.quantitySold - s.returnQuantity,
        0
      );
      const dailyVelocity = netUnitsSold > 0 ? netUnitsSold / 30 : 0;
      const daysOfStock =
        dailyVelocity > 0
          ? Math.round(p.currentStock / dailyVelocity)
          : p.currentStock > 0
          ? 999
          : 0;

      const suppMap = skuSupplierMaps.find((m) => m.sku === p.sku);
      const suppRecord = suppMap
        ? suppliers.find((s) => s.supplierCode === suppMap.supplierCode)
        : null;
      const leadTime = suppMap?.leadTimeDays || suppRecord?.leadTimeDays || 7;
      const supplierName = suppRecord?.supplierName || suppMap?.supplierCode || "Default Supplier";

      const incomingQty = purchaseOrders
        .filter((po) => po.sku === p.sku)
        .reduce((acc, po) => acc + Math.max(0, po.orderedQuantity - (po.receivedQuantity || 0)), 0);

      return {
        sku: p.sku,
        name: p.productName,
        category: p.category,
        currentStock: p.currentStock,
        unitCost: p.unitCost,
        sellingPrice: p.sellingPrice,
        reorderPoint: p.reorderPoint,
        safetyStock: p.safetyStock,
        salesLast30Days: netUnitsSold,
        dailyVelocity: Math.round(dailyVelocity * 100) / 100,
        daysOfStock,
        leadTime,
        supplierName,
        incomingQty,
        stockoutRisk7d: daysOfStock <= 7 || p.currentStock <= 0,
        isSlowMoving: netUnitsSold === 0 || daysOfStock > 90,
      };
    });

    // Construct tailored LLM Prompt
    const systemPrompt = `You are StockUp AI, an elite e-commerce supply chain analyst built exclusively for StockUp. 

=== STRICT DOMAIN BOUNDARY RULES ===
1. YOU MUST ONLY GENERATE INVENTORY, SALES, REORDER, AND SUPPLY CHAIN REPORTS FOR THIS STORE.
2. STRICTLY REFUSE TO GENERATE CODE, WRITE SCRIPTS, OR ANSWER TOPICS OUTSIDE E-COMMERCE WAREHOUSE MANAGEMENT.
3. IF THE REQUEST IS UNRELATED TO STOCKUP INVENTORY, POLITELY REFUSE WITH:
   "StockUp AI is restricted exclusively to generating inventory, sales, and supply chain reports for StockUp."

Generate a clear, professional, comprehensive markdown report for a Shopify merchant based strictly on the provided real-time warehouse data. Use rich, beautiful markdown formatting with headers (##), bold key metrics, bullet points, callout blocks, and data tables. Do not include markdown code ticks (\`\`\`markdown) around the entire response. Start directly with the title.`;

    const userPrompt = `Generate the official **${reportName}** for shop "${shop?.name || shopDomain}".

=== SHOP METRICS CONTEXT ===
- Currency: ${currency}
- Planning Horizon: ${planningHorizon}
- Total Catalog SKUs: ${totalSkus}
- Total Stock Units on Hand: ${totalStockUnits.toLocaleString("en-IN")}
- Total Inventory Cost Value: ${currency} ${Math.round(totalValue).toLocaleString("en-IN")}

=== LIVE INVENTORY DATA (First 15 Active SKUs) ===
${JSON.stringify(itemsData.slice(0, 15), null, 2)}

=== REPORT REQUIREMENTS ===
Depending on the requested report "${reportName}", provide:
1. **Executive Summary**: High-level status, overall health rating, and primary risk drivers.
2. **Key Financial & Operational Metrics**: Bulleted key highlights with values formatted in ${currency}.
3. **Detailed Segment Analysis**:
   Always include a clean markdown pipe table for affected products.
   Example table structure:
   | SKU | Product Name | Category | Current Stock | Daily Velocity | Status |
   |---|---|---|---|---|---|
   | PB-10K-BLK | Power Bank 10000mAh | Power Banks | 26 | 0 | Slow Moving |
4. **Actionable AI Recommendations**: Numbered priority steps (restock orders with exact quantities, promotional discounts for slow items, supplier buffer adjustments).

Make the tone professional, crisp, and executive-ready.`;

    const llm = new ChatOpenAI({
      model: "openai/gpt-4o-mini",
      temperature: 0.3,
      maxTokens: 1500,
      apiKey: process.env.OPENROUTER_API_KEY!,
      configuration: {
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": "https://stockup.app",
          "X-Title": "StockUp Reports",
        },
      },
    });

    const response = await llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ]);

    const markdownText = typeof response.content === "string"
      ? response.content
      : Array.isArray(response.content)
      ? response.content.map((c) => (typeof c === "string" ? c : (c as any).text || "")).join("")
      : String(response.content);

    return Response.json({
      reportName,
      generatedAt: new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      content: markdownText,
      rawItems: itemsData.slice(0, 20),
    });
  } catch (err: any) {
    console.error("[AI Report Generation Error]", err);
    return Response.json(
      { error: err?.message || "Failed to generate AI report." },
      { status: 500 }
    );
  }
};
