import { useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureShopData } from "../db.server";
import prisma from "../db.server";
import { InventoryHealthChart } from "../components/InventoryHealthChart";
// import { ensureOpportunitiesInDb } from "../services/opportunity.server";
import {
  ShoppingBag,
  Package,
  AlertTriangle,
  XCircle,
  Clock,
  Sparkles,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  ChevronDown,
  Send,
  X,
  Info,
  Calendar,
  Filter,
  Megaphone,
  Tag,
  Box,
  ArrowRight,
} from "lucide-react";
import { StockPilotAiChatCard } from "../components/StockPilotAiChatCard";
import { formatCurrency } from "../utils/currency";
// ============================================================================
// 1. DATA FETCHING & BUSINESS LOGIC (SERVER SIDE)
// ============================================================================

export interface ProductPerformanceItem {
  id: string;
  productName: string;
  variantName: string;
  sku: string;
  category: string;
  unitsSold30: number;
  revenue30: number;
  dailySalesVelocity: number;
  daysOfStock: number;
  velocityTag: "High" | "Medium" | "Low";
  currentStock: number;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, shop, redirect: shopifyRedirect } = await ensureShopData(request, authenticate);

  if (!shop.isOnboarded) {
    return shopifyRedirect("/app/onboarding");
  }

  if (!shop.isOnboardedData) {
    return shopifyRedirect("/app/onboarding-data");
  }

  // 1. Database queries (Single Source of Truth)
  const products = await prisma.product.findMany({
    where: { shopDomain: shop.shopDomain },
  });

  let sales = await prisma.historicalSale.findMany({
    where: { shopDomain: shop.shopDomain },
  });
  if (sales.length === 0) {
    sales = await prisma.historicalSale.findMany();
  }

  const skuSupplierMaps = await prisma.skuSupplierMap.findMany({
    where: { shopDomain: shop.shopDomain },
  });

  // 2. Filter Active Products
  const activeProducts = products.filter(
    (p: any) => (p.status || "Active").toLowerCase() !== "inactive"
  );

  // 3. Time Windows for Velocity and Period-Over-Period Calculations
  const maxSaleTime = sales.reduce((max: number, s: any) => {
    const t = new Date(s.date).getTime();
    return !isNaN(t) && t > max ? t : max;
  }, 0);

  const now = new Date();
  const refDate = now;

  const fourteenDaysAgo = new Date(refDate.getTime() - 14 * 24 * 60 * 60 * 1000);
  const twentyEightDaysAgo = new Date(refDate.getTime() - 28 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(refDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(refDate.getTime() - 60 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(refDate.getTime() - 90 * 24 * 60 * 60 * 1000);

  // Dynamic Date Range string for Header
  const sevenDaysAgo = new Date(refDate.getTime() - 7 * 24 * 60 * 60 * 1000);
  const dateRangeStr = `${sevenDaysAgo.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  })} - ${refDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;

  // 4. State Counters & Metric Summaries
  let outOfStockCount = 0;
  let slowDeadCount = 0;
  let lowStockCount = 0;
  let healthyCount = 0;
  let atRisk7DaysCount = 0;

  let totalValueSum = 0;
  let totalStockUnits = 0;
  let totalStockoutRiskVal = 0;

  const productPerformance: ProductPerformanceItem[] = [];

  // 5. SKU-level Calculations
  activeProducts.forEach((p: any) => {
    const currentStock = p.currentStock || 0;

    const unitCost = p.unitCost || p.sellingPrice || 0;

    const sellingPrice = p.sellingPrice || (unitCost > 0 ? unitCost * 1.5 : 0);

    totalValueSum += currentStock * unitCost;
    totalStockUnits += currentStock;

    // Case-insensitive SKU matching & product name + variant matching
    const cleanStr = (str: string | null | undefined) => (str || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    const pSkuClean = cleanStr(p.sku);
    const pNameClean = cleanStr(p.productName);
    const pVariantClean = cleanStr(p.variantName);
    const pFullClean = pNameClean + pVariantClean;

    const skuSales = sales.filter((s: any) => {
      const sSkuClean = cleanStr(s.sku);
      const sNameClean = cleanStr(s.productName);
      if (sSkuClean && pSkuClean && (sSkuClean === pSkuClean || sSkuClean.includes(pSkuClean) || pSkuClean.includes(sSkuClean))) {
        return true;
      }
      if (sNameClean && pNameClean && (sNameClean.includes(pNameClean) || pNameClean.includes(sNameClean) || sNameClean.includes(pFullClean) || pFullClean.includes(sNameClean))) {
        return true;
      }
      return false;
    });
    const sales90Days = skuSales.filter((s: any) => new Date(s.date) >= ninetyDaysAgo);
    const sales30Days = skuSales.filter((s: any) => new Date(s.date) >= thirtyDaysAgo);

    const netUnitsSold90 = sales90Days.reduce((acc: number, s: any) => acc + (s.quantitySold || 0) - (s.returnQuantity || 0), 0);
    const netUnitsSold30 = sales30Days.reduce((acc: number, s: any) => acc + (s.quantitySold || 0) - (s.returnQuantity || 0), 0);
    const revenue30 = sales30Days.reduce((acc: number, s: any) => acc + (s.quantitySold || 0) * (s.unitSellingPrice || sellingPrice), 0);

    const totalAllTimeUnits = skuSales.reduce((acc: number, s: any) => acc + (s.quantitySold || 0) - (s.returnQuantity || 0), 0);
    const dailySalesVelocity = netUnitsSold30 > 0 ? netUnitsSold30 / 30 : (netUnitsSold90 > 0 ? netUnitsSold90 / 90 : (totalAllTimeUnits > 0 ? totalAllTimeUnits / 90 : 0.02));
    const daysOfStock = dailySalesVelocity > 0 ? currentStock / dailySalesVelocity : 999;

    const suppMap = skuSupplierMaps.find((m: any) => m.sku === p.sku);
    const leadTime = suppMap?.leadTimeDays || 7;
    const safetyStock = p.safetyStock || 0;
    const calculatedROP = Math.ceil(dailySalesVelocity * leadTime + safetyStock);
    const effectiveROP =
      p.reorderPoint !== null && p.reorderPoint !== undefined && p.reorderPoint > 0
        ? p.reorderPoint
        : calculatedROP > 0
          ? calculatedROP
          : 10;

    // Classification (Priority assignment)
    const isOOS = currentStock <= 0;
    const isDead = currentStock > 0 && skuSales.length > 0 && netUnitsSold90 === 0;
    const isSlow = currentStock > 0 && dailySalesVelocity > 0 && (daysOfStock > 90 || (netUnitsSold30 === 0 && netUnitsSold90 > 0));
    const isSlowOrDead = currentStock > 0 && (isDead || isSlow);
    const isLowStock = currentStock > 0 && currentStock <= effectiveROP && !isSlowOrDead;

    if (isOOS) {
      outOfStockCount++;
      totalStockoutRiskVal += Math.ceil((dailySalesVelocity || 1) * 7) * sellingPrice;
    } else if (isSlowOrDead) {
      slowDeadCount++;
    } else if (isLowStock) {
      lowStockCount++;
      if (dailySalesVelocity > 0 && daysOfStock <= 7) {
        atRisk7DaysCount++;
        totalStockoutRiskVal += Math.max(0, Math.ceil(dailySalesVelocity * 7 - currentStock)) * sellingPrice;
      }
    } else {
      healthyCount++;
    }

    let velocityTag: "High" | "Medium" | "Low" = "Low";
    if (dailySalesVelocity >= 5) velocityTag = "High";
    else if (dailySalesVelocity >= 1.5) velocityTag = "Medium";

    productPerformance.push({
      id: p.id,
      productName: p.productName,
      variantName: p.variantName || "",
      sku: p.sku,
      category: p.category || "General",
      unitsSold30: netUnitsSold30,
      revenue30: Math.round(revenue30),
      dailySalesVelocity,
      daysOfStock: daysOfStock === 999 ? 999 : Math.round(daysOfStock),
      velocityTag,
      currentStock,
    });
  });

  // 6. Top Selling Products (Sorted by 30-day net units sold)
  productPerformance.sort((a, b) => b.unitsSold30 - a.unitsSold30);
  const topSellingProducts = productPerformance.slice(0, 5);

  const totalActiveSKUs = activeProducts.length;

  // 7. Period-Over-Period Trend Computations
  const sales30Current = sales.filter((s: any) => new Date(s.date) >= thirtyDaysAgo);
  const sales30Previous = sales.filter(
    (s: any) => new Date(s.date) >= sixtyDaysAgo && new Date(s.date) < thirtyDaysAgo
  );

  const units30Current = sales30Current.reduce((acc: number, s: any) => acc + (s.quantitySold || 0) - (s.returnQuantity || 0), 0);
  const units30Previous = sales30Previous.reduce((acc: number, s: any) => acc + (s.quantitySold || 0) - (s.returnQuantity || 0), 0);

  let inventoryTrendPct: number | null = null;
  if (units30Previous > 0) {
    inventoryTrendPct = Math.round(((units30Current - units30Previous) / units30Previous) * 100);
  }

  // 8. Data-Driven Demand Forecast (Dynamic horizon based on shop.planningHorizon from onboarding preferences)
  const planningHorizonSetting = shop?.planningHorizon || "14 days";
  const parsedHorizonDays = parseInt(planningHorizonSetting, 10);
  const forecastDays = !isNaN(parsedHorizonDays) && parsedHorizonDays > 0 ? parsedHorizonDays : 14;

  const dayOfWeekTotals = [0, 0, 0, 0, 0, 0, 0];
  const dayOfWeekCounts = [0, 0, 0, 0, 0, 0, 0];

  sales.forEach((s: any) => {
    const d = new Date(s.date);
    if (!isNaN(d.getTime())) {
      const dayIdx = d.getDay();
      const netQty = (s.quantitySold || 0) - (s.returnQuantity || 0);
      dayOfWeekTotals[dayIdx] += Math.max(0, netQty);
      dayOfWeekCounts[dayIdx] += 1;
    }
  });

  const dayOfWeekAverages = dayOfWeekTotals.map((tot, idx) =>
    dayOfWeekCounts[idx] > 0 ? tot / dayOfWeekCounts[idx] : 0
  );

  const overallAvgDaySales =
    dayOfWeekAverages.reduce((acc, v) => acc + v, 0) / 7 || 1;

  // Day-of-Week seasonality multipliers learned from DB records
  const dayOfWeekMultipliers = dayOfWeekAverages.map((avg) =>
    overallAvgDaySales > 0 && avg > 0 ? avg / overallAvgDaySales : 1.0
  );

  // Exact unrounded Base Daily Velocity
  const baseForecastDaily = productPerformance.reduce((acc, p) => acc + p.dailySalesVelocity, 0);

  const forecastChartPoints: Array<{ label: string; val: number }> = [];
  let unroundedTotalForecast = 0;

  if (baseForecastDaily > 0) {
    const forecastStartDate = new Date();
    for (let i = 0; i < forecastDays; i++) {
      const d = new Date(forecastStartDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dayOfWeek = d.getDay();
      const dateLabel = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      const seasonalityFactor = dayOfWeekMultipliers[dayOfWeek] || 1.0;
      const dayValDecimal = baseForecastDaily * seasonalityFactor;
      unroundedTotalForecast += dayValDecimal;

      forecastChartPoints.push({
        label: dateLabel,
        val: Math.round(dayValDecimal * 10) / 10,
      });
    }
  }

  const totalForecastDemandUnits =
    baseForecastDaily > 0 ? Math.max(1, Math.round(unroundedTotalForecast)) : 0;

  // Dynamically calculate previous period sales matching the planning horizon (H)
  const horizonMs = forecastDays * 24 * 60 * 60 * 1000;
  const horizonStartDate = new Date(refDate.getTime() - horizonMs);
  const previousHorizonStartDate = new Date(refDate.getTime() - 2 * horizonMs);

  const salesHorizonCurrent = sales.filter((s: any) => new Date(s.date) >= horizonStartDate);
  const salesHorizonPrevious = sales.filter(
    (s: any) => new Date(s.date) >= previousHorizonStartDate && new Date(s.date) < horizonStartDate
  );

  const unitsHorizonCurrent = salesHorizonCurrent.reduce((acc: number, s: any) => acc + (s.quantitySold || 0) - (s.returnQuantity || 0), 0);
  const unitsHorizonPrevious = salesHorizonPrevious.reduce((acc: number, s: any) => acc + (s.quantitySold || 0) - (s.returnQuantity || 0), 0);

  let forecastVs14Pct: number | null = null;
  if (unitsHorizonPrevious > 0 && totalForecastDemandUnits > 0) {
    forecastVs14Pct = Math.round(((totalForecastDemandUnits - unitsHorizonPrevious) / unitsHorizonPrevious) * 100);
  } else if (unitsHorizonCurrent > 0 && totalForecastDemandUnits > 0) {
    forecastVs14Pct = Math.round(((totalForecastDemandUnits - unitsHorizonCurrent) / unitsHorizonCurrent) * 100);
  }

  // Average Stock Coverage Days
  const activeWithCoverage = productPerformance.filter((p) => p.daysOfStock !== 999);
  const avgStockCoverageDays =
    activeWithCoverage.length > 0
      ? Math.round(
        activeWithCoverage.reduce((acc, p) => acc + p.daysOfStock, 0) / activeWithCoverage.length
      )
      : activeProducts.length > 0
        ? 90
        : 0;

  const categories = Array.from(new Set(activeProducts.map((p: any) => p.category || "General")));

  // const rawOpps = await ensureOpportunitiesInDb(shop.shopDomain);
  // const prioWeight: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
  // const sortedOpps = [...rawOpps].sort((a, b) => {
  //   const pA = prioWeight[a.priority] || 0;
  //   const pB = prioWeight[b.priority] || 0;
  //   if (pA !== pB) return pB - pA;
  //   return (b.potentialRevenue || 0) - (a.potentialRevenue || 0);
  // });
  // const topOpportunities = sortedOpps.slice(0, 4);

  return {
    shop,
    dateRangeStr,
    metrics: {
      totalInventoryValue: totalValueSum,
      totalStockUnits,
      totalActiveSKUs,
      lowStockCount,
      outOfStockCount,
      slowDeadCount,
      healthyCount,
      atRisk7DaysCount,
      totalStockoutRiskVal: Math.round(totalStockoutRiskVal),
      avgStockCoverageDays,
      totalForecastDemandUnits,
      inventoryTrendPct,
      forecastVs14Pct,
      forecastDays,
      planningHorizonSetting,
    },
    topSellingProducts,
    forecastChartPoints,
    categories,
    dayOfWeekMultipliers,
    refTime: Date.now(),
    productPerformance,
    rawSales: sales.map((s: any) => ({
      sku: s.sku,
      date: s.date,
      qty: (s.quantitySold || 0) - (s.returnQuantity || 0),
    })),
  };
};

function MetricTooltip({
  title,
  formula,
  explanation,
  align = "center",
}: {
  title: string;
  formula: string;
  explanation: string;
  align?: "left" | "center" | "right";
}) {
  const [isVisible, setIsVisible] = useState(false);

  const alignClass =
    align === "right"
      ? "right-0 translate-x-0"
      : align === "left"
        ? "left-0 translate-x-0"
        : "left-1/2 -translate-x-1/2";

  return (
    <div
      className="relative inline-flex items-center"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onClick={() => setIsVisible(!isVisible)}
    >
      <button
        type="button"
        className="w-5 h-5 rounded-full bg-slate-100 hover:bg-purple-100 text-slate-400 hover:text-purple-600 flex items-center justify-center transition-all cursor-pointer border border-slate-200/60 shadow-2xs"
        aria-label={`Information about ${title}`}
      >
        <Info className="w-3 h-3" />
      </button>

      {isVisible && (
        <div
          className={`absolute ${alignClass} top-full mt-2.5 w-72 sm:w-80 p-4 bg-white border border-slate-200/90 rounded-2xl shadow-xl z-[9999] text-xs text-slate-700 space-y-2.5 animate-in fade-in zoom-in-95 duration-200 pointer-events-none`}
          style={{ filter: "drop-shadow(0 10px 15px rgba(0,0,0,0.08))" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-600" />
              {title}
            </span>
            <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100/80">
              Calculation Logic
            </span>
          </div>

          {/* Formula Box */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 font-mono text-[11px] text-purple-900 font-semibold tracking-tight overflow-x-auto">
            <span className="text-slate-400 font-sans font-normal text-[10px] block mb-0.5 uppercase tracking-wider">Formula:</span>
            {formula}
          </div>

          {/* Explanation */}
          <p className="text-slate-600 text-[11px] leading-relaxed font-normal">
            {explanation}
          </p>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const {
    shop,
    dateRangeStr,
    metrics,
    topSellingProducts,
    forecastChartPoints,
    categories = [],
    dayOfWeekMultipliers = [1, 1, 1, 1, 1, 1, 1],
    refTime = Date.now(),
    productPerformance = [],
    rawSales = [],
    topOpportunities = [],
  } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const [forecastCategoryFilter, setForecastCategoryFilter] = useState("All");

  const currentHour = new Date().getHours();
  const greeting =
    currentHour < 12
      ? "Good morning"
      : currentHour < 17
        ? "Good afternoon"
        : "Good evening";

  const [showAiDrawer, setShowAiDrawer] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<Array<{ sender: "user" | "ai"; text: string }>>([]);
  const [isAsking, setIsAsking] = useState(false);

  const handleSendAiMessage = (queryText?: string) => {
    const text = queryText || chatInput;
    if (!text.trim()) return;
    setChatMessages((prev) => [...prev, { sender: "user", text }]);
    if (!queryText) setChatInput("");
    setIsAsking(true);

    setTimeout(() => {
      const q = text.toLowerCase();
      let reply = `Based on your live DB records, Total Inventory Value is ${formatCurrency(metrics.totalInventoryValue, shop?.currency)}.`;

      if (q.includes("risk") || q.includes("stockout") || q.includes("stock out")) {
        reply = `⚠️ ${metrics.atRisk7DaysCount} item(s) are currently at risk of stocking out within 7 days. Total estimated risk value: ${formatCurrency(metrics.totalStockoutRiskVal, shop?.currency)}.`;
      } else if (q.includes("reorder") || q.includes("order") || q.includes("buy")) {
        reply = `🛒 You currently have ${metrics.lowStockCount + metrics.outOfStockCount} items requiring restocking. Check out the Reorder Recommendations portal to draft purchase orders!`;
      } else if (q.includes("slow") || q.includes("dead")) {
        reply = `🐢 You have ${metrics.slowDeadCount} slow-moving or dead stock item(s) tied up in inventory. Consider running targeted promotions!`;
      } else if (q.includes("forecast") || q.includes("demand")) {
        reply = `📈 14-Day Forecasted Demand: ${metrics.totalForecastDemandUnits.toLocaleString("en-IN")} units with an average stock coverage of ${metrics.avgStockCoverageDays} days.`;
      }

      setChatMessages((prev) => [...prev, { sender: "ai", text: reply }]);
      setIsAsking(false);
    }, 400);
  };

  const aiPresets = [
    "Which products are at risk of stock out?",
    "What should I reorder today?",
    "Show me slow moving items",
    "What's my forecast for next week?",
  ];

  // Dynamic Demand Forecast Calculations based on Category Filter
  const isForecastFiltered = forecastCategoryFilter !== "All";

  const filteredPerformance: ProductPerformanceItem[] = isForecastFiltered
    ? productPerformance.filter(
        (p: ProductPerformanceItem) => (p.category || "").toLowerCase() === forecastCategoryFilter.toLowerCase()
      )
    : productPerformance;

  const dynamicBaseForecastDaily = filteredPerformance.reduce(
    (acc: number, p: ProductPerformanceItem) => acc + (p.dailySalesVelocity || 0),
    0
  );

  const dynamicForecastChartPoints: Array<{ label: string; val: number }> = [];
  let dynamicUnroundedForecast = 0;

  if (dynamicBaseForecastDaily > 0) {
    for (let i = 0; i < metrics.forecastDays; i++) {
      const d = new Date(refTime + i * 24 * 60 * 60 * 1000);
      const dayOfWeek = d.getDay();
      const dateLabel = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      const seasonalityFactor = dayOfWeekMultipliers[dayOfWeek] || 1.0;
      const dayValDecimal = dynamicBaseForecastDaily * seasonalityFactor;
      dynamicUnroundedForecast += dayValDecimal;

      dynamicForecastChartPoints.push({
        label: dateLabel,
        val: Math.round(dayValDecimal * 10) / 10,
      });
    }
  }

  let dynamicTotalForecastUnits =
    dynamicBaseForecastDaily > 0 ? Math.max(1, Math.round(dynamicUnroundedForecast)) : 0;

  // Reconcile total demand to match exact sum of category demand integers when "All" is selected
  if (!isForecastFiltered && productPerformance.length > 0) {
    const categoriesSet = new Set<string>(productPerformance.map((p: ProductPerformanceItem) => p.category || "General"));
    let categorySumTotal = 0;

    categoriesSet.forEach((cat: string) => {
      const catPerf = productPerformance.filter(
        (p: ProductPerformanceItem) => (p.category || "General").toLowerCase() === cat.toLowerCase()
      );
      const catVel = catPerf.reduce((acc: number, p: ProductPerformanceItem) => acc + (p.dailySalesVelocity || 0), 0);
      let catUnrounded = 0;
      if (catVel > 0) {
        for (let i = 0; i < metrics.forecastDays; i++) {
          const d = new Date(refTime + i * 24 * 60 * 60 * 1000);
          const dayOfWeek = d.getDay();
          const seasonalityFactor = dayOfWeekMultipliers[dayOfWeek] || 1.0;
          catUnrounded += catVel * seasonalityFactor;
        }
        categorySumTotal += Math.max(1, Math.round(catUnrounded));
      }
    });

    if (categorySumTotal > 0) {
      dynamicTotalForecastUnits = categorySumTotal;
    }
  }

  // Compute trend vs previous period for selected category
  const filteredSkus = new Set(filteredPerformance.map((p: any) => (p.sku || "").trim().toLowerCase()));
  const horizonMs = (metrics.forecastDays || 14) * 24 * 60 * 60 * 1000;
  const horizonStartDate = new Date(refTime - horizonMs);
  const previousHorizonStartDate = new Date(refTime - 2 * horizonMs);

  const filteredSalesCurrent = rawSales.filter(
    (s: any) => filteredSkus.has((s.sku || "").trim().toLowerCase()) && new Date(s.date) >= horizonStartDate
  );
  const filteredSalesPrevious = rawSales.filter(
    (s: any) =>
      filteredSkus.has((s.sku || "").trim().toLowerCase()) &&
      new Date(s.date) >= previousHorizonStartDate &&
      new Date(s.date) < horizonStartDate
  );

  const filteredUnitsCurrent = filteredSalesCurrent.reduce((acc: number, s: any) => acc + s.qty, 0);
  const filteredUnitsPrevious = filteredSalesPrevious.reduce((acc: number, s: any) => acc + s.qty, 0);

  let dynamicVsPct: number | null = null;
  if (filteredUnitsPrevious > 0 && dynamicTotalForecastUnits > 0) {
    dynamicVsPct = Math.round(((dynamicTotalForecastUnits - filteredUnitsPrevious) / filteredUnitsPrevious) * 100);
  } else if (filteredUnitsCurrent > 0 && dynamicTotalForecastUnits > 0) {
    dynamicVsPct = Math.round(((dynamicTotalForecastUnits - filteredUnitsCurrent) / filteredUnitsCurrent) * 100);
  }

  const activeForecastChartPoints = isForecastFiltered ? dynamicForecastChartPoints : forecastChartPoints;
  const activeTotalForecastUnits = isForecastFiltered ? dynamicTotalForecastUnits : metrics.totalForecastDemandUnits;
  const activeVsPct = isForecastFiltered ? dynamicVsPct : metrics.forecastVs14Pct;

  const chartW = 300;
  const chartH = 120;
  const chartPad = 10;
  let forecastPath = "";
  let forecastFill = "";
  if (activeForecastChartPoints.length > 0) {
    const maxVal = Math.max(...activeForecastChartPoints.map((p: { val: number }) => p.val));
    const pts = activeForecastChartPoints.map((p: { val: number }, i: number) => {
      const x = chartPad + (i / (activeForecastChartPoints.length - 1)) * (chartW - chartPad * 2);
      const y = chartH - chartPad - (p.val / (maxVal || 1)) * (chartH - chartPad * 2);
      return { x, y };
    });
    forecastPath = pts.map((p: { x: number; y: number }, i: number) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
    forecastFill = `${forecastPath} L${pts[pts.length - 1].x},${chartH} L${pts[0].x},${chartH} Z`;
  }

  return (
    <div className="min-h-screen bg-[#f1f1f1] p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto font-sans text-slate-800">

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            {greeting}, User! <span className="text-xl">👋</span>
          </h1>
          <p className="text-xs font-medium text-slate-500 mt-0.5">
            Here's what's happening with your inventory today.
          </p>
        </div>

        {/* Date Selector Dropdown */}
        {/* <div className="relative shrink-0">
          <button
            type="button"
            className="bg-white border border-slate-200/80 rounded-xl px-4 py-2.5 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors flex items-center gap-2 cursor-pointer"
          >
             <Calendar className="w-4 h-4 text-purple-600" />
            <span>{dateRangeStr}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div> */}
      </div>

      {/* ── ROW 1: 5 METRIC CARDS ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">

        {/* Card 1: Total Inventory Value */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <ShoppingBag className="w-4.5 h-4.5" />
              </div>
              <span className="text-xs font-medium text-slate-600">Total Inventory Value</span>
            </div>
            <MetricTooltip
              title="Total Inventory Value"
              formula="Sum(Current Stock × Unit Cost)"
              explanation="Total asset cost value of all active physical inventory on hand. Unit cost is resolved from Supplier Map → Preferred Supplier Map → Product Cost."
            />
          </div>
          <div className="mt-4">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              {formatCurrency(metrics.totalInventoryValue, shop?.currency)}
            </h2>
            {metrics.inventoryTrendPct !== null ? (
              <p
                className={`text-xs font-medium mt-1 flex items-center gap-1 ${metrics.inventoryTrendPct >= 0 ? "text-emerald-600" : "text-rose-600"
                  }`}
              >
                {metrics.inventoryTrendPct >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                <span>{metrics.inventoryTrendPct >= 0 ? `↑ ${metrics.inventoryTrendPct}%` : `↓ ${Math.abs(metrics.inventoryTrendPct)}%`} vs last 30 days</span>
              </p>
            ) : (
              <p className="text-xs font-normal text-slate-400 mt-1">Based on active SKUs</p>
            )}
          </div>
        </div>

        {/* Card 2: Stock on Hand */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <Package className="w-4.5 h-4.5" />
              </div>
              <span className="text-xs font-medium text-slate-600">Stock on Hand</span>
            </div>
            <MetricTooltip
              title="Stock on Hand"
              formula="Sum(Current Stock Units)"
              explanation="Total physical quantity of inventory units currently available across all active product SKUs and variants in your database."
            />
          </div>
          <div className="mt-4">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              {metrics.totalStockUnits.toLocaleString("en-IN")}
            </h2>
            <p className="text-xs font-normal text-slate-400 mt-1">
              {metrics.totalActiveSKUs} SKUs / Variants
            </p>
          </div>
        </div>

        {/* Card 3: Low Stock Items */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4.5 h-4.5" />
              </div>
              <span className="text-xs font-medium text-slate-600">Low Stock Items</span>
            </div>
            <MetricTooltip
              title="Low Stock Items"
              formula="Stock > 0 AND Stock ≤ ROP"
              explanation="Active products whose stock has dipped to or below their calculated Reorder Point (ROP = Velocity × Lead Time + Safety Stock)."
            />
          </div>
          <div className="mt-4">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              {metrics.lowStockCount}
            </h2>
            <p className="text-xs font-medium text-amber-600 mt-1">
              Needs attention
            </p>
          </div>
        </div>

        {/* Card 4: Out of Stock Items */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <XCircle className="w-4.5 h-4.5" />
              </div>
              <span className="text-xs font-medium text-slate-600">Out of Stock Items</span>
            </div>
            <MetricTooltip
              title="Out of Stock Items"
              formula="Current Stock ≤ 0"
              explanation="Count of active SKUs with zero physical units available in warehouse, leading to immediate risk of lost revenue and stockout."
              align="right"
            />
          </div>
          <div className="mt-4">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              {metrics.outOfStockCount}
            </h2>
            <p className="text-xs font-medium text-rose-600 mt-1">
              Urgent restock
            </p>
          </div>
        </div>

        {/* Card 5: Slow / Dead Stock */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <Clock className="w-4.5 h-4.5" />
              </div>
              <span className="text-xs font-medium text-slate-600">Slow / Dead Stock</span>
            </div>
            <MetricTooltip
              title="Slow / Dead Stock"
              formula="Zero 30d Sales OR Days of Stock > 90"
              explanation="Products with positive stock (Stock > 0) that have had 0 sales in the last 30 days (Dead Stock) or over 90 days of coverage (Slow Moving)."
              align="right"
            />
          </div>
          <div className="mt-4">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              {metrics.slowDeadCount}
            </h2>
            <p className="text-xs font-normal text-slate-400 mt-1">
              Review required
            </p>
          </div>
        </div>

      </div>

      {/* ── ROW 2: HEALTH DONUT | TOP PRIORITIES | AI DRAWER ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">

        {/* Inventory Health (4/12) */}
        <div className="lg:col-span-4 h-full flex flex-col justify-between">
          <InventoryHealthChart
            healthyCount={metrics.healthyCount}
            lowStockCount={metrics.lowStockCount}
            outOfStockCount={metrics.outOfStockCount}
            slowStockCount={metrics.slowDeadCount}
            showCard={true}
            showScore={true}
            showBanner={true}
          />
        </div>

        {/* Top Priorities (4/12) */}
        <div className="lg:col-span-4 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-2xs space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-900">Top Priorities</h3>
            </div>

            <div className="space-y-3">
              {/* Priority 1: Out of Stock */}
              <button
                type="button"
                onClick={() => navigate("/app/inventory")}
                className="w-full text-left p-3.5 rounded-xl bg-rose-50/50 hover:bg-rose-50 border border-rose-100 flex items-center justify-between gap-3 group transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                    <XCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900">
                      {metrics.outOfStockCount} items out of stock
                    </h4>
                    <p className="text-[11px] font-normal text-slate-500">Restock to avoid lost sales</p>
                  </div>
                </div>
              </button>

              {/* Priority 2: Low Stock */}
              <button
                type="button"
                onClick={() => navigate("/app/reorder")}
                className="w-full text-left p-3.5 rounded-xl bg-amber-50/50 hover:bg-amber-50 border border-amber-100 flex items-center justify-between gap-3 group transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900">
                      {metrics.lowStockCount} low stock items
                    </h4>
                    <p className="text-[11px] font-normal text-slate-500">Reorder soon to stay in stock</p>
                  </div>
                </div>
              </button>

              {/* Priority 3: Slow Moving */}
              <button
                type="button"
                onClick={() => navigate("/app/insights")}
                className="w-full text-left p-3.5 rounded-xl bg-blue-50/50 hover:bg-blue-50 border border-blue-100 flex items-center justify-between gap-3 group transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900">
                      {metrics.slowDeadCount} slow moving items
                    </h4>
                    <p className="text-[11px] font-normal text-slate-500">Review and take action</p>
                  </div>
                </div>
              </button>

              {/* Priority 4: At Risk */}
              <button
                type="button"
                onClick={() => navigate("/app/reorder")}
                className="w-full text-left p-3.5 rounded-xl bg-purple-50/50 hover:bg-purple-50 border border-purple-100 flex items-center justify-between gap-3 group transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900">
                      {metrics.atRisk7DaysCount} items at risk of stock out
                    </h4>
                    <p className="text-[11px] font-normal text-slate-500">Stock may run out in 7 days</p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Ask StockPilot AI (4/12) */}
        <div className="lg:col-span-4 h-full">
          {/* {showAiDrawer ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-3 relative overflow-hidden h-full flex flex-col justify-between">
              <div className="absolute top-0 right-0 w-28 h-28 bg-purple-100/40 rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none" />

              <div>
                <div className="flex items-center justify-between relative z-10 mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center">
                      <Sparkles className="w-3.5 h-3.5" />
                    </div>
                    <h3 className="text-xs font-semibold text-slate-900">Ask StockPilot AI</h3>
                  </div>
                  <button type="button" onClick={() => setShowAiDrawer(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-[11px] text-slate-500 font-normal leading-snug mb-3">
                  Get answers and insights about your inventory in seconds.
                </p>

                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
                  {chatMessages.length === 0
                    ? aiPresets.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSendAiMessage(preset)}
                        className="w-full text-left px-3 py-2 rounded-xl bg-purple-50/60 hover:bg-purple-100/60 border border-purple-100/50 text-[11px] font-medium text-slate-700 transition-all flex items-center gap-2 cursor-pointer"
                      >
                        <span className="text-purple-400 text-xs">💡</span>
                        <span className="line-clamp-1">{preset}</span>
                      </button>
                    ))
                    : chatMessages.map((msg, i) => (
                      <div
                        key={i}
                        className={`text-[11px] p-2.5 rounded-xl ${msg.sender === "user"
                          ? "bg-purple-600 text-white ml-4"
                          : "bg-purple-50/80 text-slate-800 mr-4 border border-purple-100"
                          }`}
                      >
                        {msg.text}
                      </div>
                    ))}
                  {isAsking && (
                    <p className="text-[10px] font-medium text-purple-500 italic animate-pulse px-2">
                      AI thinking...
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2 mt-3">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Ask a question..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendAiMessage()}
                    className="w-full pl-3 pr-10 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-400/20 focus:border-purple-400 font-normal"
                  />
                  <button
                    type="button"
                    onClick={() => handleSendAiMessage()}
                    className="absolute right-1.5 top-1.5 w-7 h-7 rounded-lg bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Send className="w-3 h-3" />
                  </button>
                </div>

                <p className="text-[10px] text-center text-slate-400 font-normal">
                  AI responses may not always be accurate.
                </p>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAiDrawer(true)}
              className="w-full p-4 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Sparkles className="w-4 h-4" /> Open StockPilot AI
            </button>
          )} */}

          <StockPilotAiChatCard metrics={metrics} />

        </div>

      </div>

      {/* ── ROW 3: TOP SELLING PRODUCTS | DEMAND FORECAST ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">

        {/* Top Selling Products (7/12) */}
        <div className="lg:col-span-7 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-900">Top Selling Products</h3>
              {/* <button
                type="button"
                onClick={() => navigate("/app/insights")}
                className="text-xs font-medium text-purple-600 hover:text-purple-700 transition-colors cursor-pointer"
              >
                View report
              </button> */}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] font-medium text-slate-400 uppercase tracking-wider bg-slate-50/50">
                    <th className="py-3 px-3">Product</th>
                    <th className="py-3 px-3 text-center">Units Sold (30d)</th>
                    <th className="py-3 px-3 text-right">Revenue (30d)</th>
                    <th className="py-3 px-3 text-center">Sales Velocity</th>
                    <th className="py-3 px-3 text-right">Stock Coverage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {topSellingProducts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-xs text-slate-400 font-normal">
                        No sales recorded in the database yet.
                      </td>
                    </tr>
                  ) : (
                    topSellingProducts.map((prod: any) => (
                      <tr key={prod.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3.5 px-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200/60 flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0">
                              {prod.productName.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 truncate max-w-[150px] leading-tight">{prod.productName}</p>
                              <p className="text-[10px] text-slate-400 font-normal">{prod.variantName || prod.sku}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-center font-medium text-slate-800">
                          {prod.unitsSold30.toLocaleString("en-IN")}
                        </td>
                        <td className="py-3.5 px-3 text-right font-semibold text-slate-900">
                          {formatCurrency(prod.revenue30, shop?.currency)}
                        </td>
                        <td className="py-3.5 px-3 text-center">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${prod.velocityTag === "High"
                              ? "bg-emerald-100 text-emerald-700"
                              : prod.velocityTag === "Medium"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-slate-100 text-slate-600"
                              }`}
                          >
                            {prod.velocityTag}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-right font-medium">
                          <span
                            className={
                              prod.daysOfStock === 999 || prod.daysOfStock > 30
                                ? "text-emerald-600"
                                : prod.daysOfStock > 7
                                  ? "text-amber-600"
                                  : "text-rose-500"
                            }
                          >
                            {prod.daysOfStock === 999 ? "—" : `${prod.daysOfStock} days`}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Demand Forecast (5/12) */}
        <div className="lg:col-span-5 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-2xs flex flex-col justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900">
                  Demand Forecast{" "}
                  <span className="text-xs font-normal text-slate-400">(Next {metrics.forecastDays || 14} days)</span>
                </h3>
              </div>

              <div className="flex items-center gap-2">
                {/* Category Filter Selector Dropdown */}
                <div className="relative inline-flex items-center">
                  <Filter className="w-3 h-3 text-purple-600 absolute left-2.5 pointer-events-none" />
                  <select
                    value={forecastCategoryFilter}
                    onChange={(e) => setForecastCategoryFilter(e.target.value)}
                    className="bg-purple-50/70 hover:bg-purple-100 text-purple-900 border border-purple-200/80 pl-7 pr-7 py-1 rounded-xl text-xs font-bold focus:outline-none cursor-pointer transition-all appearance-none shadow-2xs"
                  >
                    <option value="All">All Categories</option>
                    {categories.map((cat: string, idx: number) => (
                      <option key={idx} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3 h-3 text-purple-600 absolute right-2.5 pointer-events-none" />
                </div>

                <MetricTooltip
                  title="Demand Forecast"
                  formula="Sum(Base Velocity × DayOfWeek Multiplier)"
                  explanation="Forecasts expected unit demand over your configured planning horizon using baseline sales velocity and learned historical day-of-week purchasing patterns."
                  align="right"
                />
              </div>
            </div>

            <div className="mt-3">
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Total Forecast Demand</p>
              <p className="text-2xl font-bold text-slate-900 tracking-tight mt-0.5">
                {activeTotalForecastUnits > 0
                  ? `${activeTotalForecastUnits.toLocaleString("en-IN")} Units`
                  : "0 Units"}
              </p>
              {activeVsPct !== null && (
                <p
                  className={`text-xs font-medium mt-0.5 ${activeVsPct >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                >
                  <span>{activeVsPct >= 0 ? `↑ ${activeVsPct}%` : `↓ ${Math.abs(activeVsPct)}%`} vs previous period</span>
                </p>
              )}
            </div>
          </div>

          {/* Area Chart */}
          <div className="w-full h-32 my-1">
            {activeForecastChartPoints.length > 0 ? (
              <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="none">
                <defs>
                  <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <line x1="0" y1="30" x2={chartW} y2="30" stroke="#f1f5f9" strokeDasharray="3 3" />
                <line x1="0" y1="65" x2={chartW} y2="65" stroke="#f1f5f9" strokeDasharray="3 3" />
                <line x1="0" y1="100" x2={chartW} y2="100" stroke="#f1f5f9" strokeDasharray="3 3" />
                <path d={forecastFill} fill="url(#fg)" />
                <path d={forecastPath} fill="none" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-500 font-bold">No sales velocity for {forecastCategoryFilter}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Select another category or view All Categories</p>
              </div>
            )}
          </div>

          {/* X axis labels */}
          {activeForecastChartPoints.length > 0 && (
            <div className="flex justify-between text-[10px] font-medium text-slate-400 -mt-2">
              {[0, Math.floor((activeForecastChartPoints.length - 1) * 0.25), Math.floor((activeForecastChartPoints.length - 1) * 0.5), Math.floor((activeForecastChartPoints.length - 1) * 0.75), activeForecastChartPoints.length - 1].map((i, idx) =>
                activeForecastChartPoints[i] ? <span key={idx}>{activeForecastChartPoints[i].label}</span> : null
              )}
            </div>
          )}

          {/* Bottom stats */}
          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-100">
            <div className="bg-slate-50/70 border border-slate-100 rounded-xl p-3.5 text-center">
              <p className="text-[11px] font-medium text-slate-500">Average Stock Coverage</p>
              <p className="text-lg font-bold text-slate-900 mt-0.5">
                {metrics.avgStockCoverageDays > 0 ? `${metrics.avgStockCoverageDays} Days` : "—"}
              </p>
              {metrics.avgStockCoverageDays > 0 && (
                <p
                  className={`text-[10px] font-semibold mt-0.5 ${metrics.avgStockCoverageDays >= 14 ? "text-emerald-600" : "text-amber-600"
                    }`}
                >
                  {metrics.avgStockCoverageDays >= 14 ? "Good" : "Low coverage"}
                </p>
              )}
            </div>

            <div className="bg-slate-50/70 border border-slate-100 rounded-xl p-3.5 text-center">
              <p className="text-[11px] font-medium text-slate-500">Estimated Stockout Value</p>
              <p className="text-lg font-bold text-slate-900 mt-0.5">
                {formatCurrency(metrics.totalStockoutRiskVal, shop?.currency)}
              </p>
              <p
                className={`text-[10px] font-semibold mt-0.5 ${metrics.totalStockoutRiskVal === 0 ? "text-emerald-600" : "text-rose-500"
                  }`}
              >
                {metrics.totalStockoutRiskVal === 0 ? "No risk" : "Action needed"}
              </p>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}