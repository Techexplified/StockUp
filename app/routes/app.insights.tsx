import { useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureShopData } from "../db.server";
import prisma from "../db.server";
import { InventoryHealthChart } from "../components/InventoryHealthChart";
import { StockPilotAiChatCard } from "../components/StockPilotAiChatCard";
import { formatCurrency, getCurrencySymbol } from "../utils/currency";
import { AiReportModal } from "../components/AiReportModal";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  AlertTriangle,
  Clock,
  Package,
  Calendar,
  Filter,
  Download,
  MoreVertical,
  ChevronRight,
  Info,
  Lightbulb,
  Sparkles,
  Send,
  X,
  Truck,
  ShieldCheck,
  CheckCircle2,
  FileSpreadsheet,
} from "lucide-react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop, redirect: shopifyRedirect } = await ensureShopData(request, authenticate);

  if (!shop.isOnboarded) {
    return shopifyRedirect("/app/onboarding");
  }

  if (!shop.isOnboardedData) {
    return shopifyRedirect("/app/onboarding-data");
  }

  const products = await prisma.product.findMany({
    where: { shopDomain: shop.shopDomain },
  });

  let sales = await prisma.historicalSale.findMany({
    where: { shopDomain: shop.shopDomain },
  });
  if (sales.length === 0) {
    sales = await prisma.historicalSale.findMany();
  }

  const suppliers = await prisma.supplier.findMany({
    where: { shopDomain: shop.shopDomain },
  });

  const skuSupplierMaps = await prisma.skuSupplierMap.findMany({
    where: { shopDomain: shop.shopDomain },
  });

  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: { shopDomain: shop.shopDomain },
  });

  const activeProducts = products.filter(
    (p) => (p.status || "Active").toLowerCase() !== "inactive"
  );

  const maxSaleTime = sales.reduce((max, s) => {
    const t = new Date(s.date).getTime();
    return !isNaN(t) && t > max ? t : max;
  }, 0);

  const now = new Date();
  const refDate = now;
  const sevenDaysAgo = new Date(refDate.getTime() - 7 * 24 * 60 * 60 * 1000);
  const dateRangeStr = `${sevenDaysAgo.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  })} - ${refDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;

  const thirtyDaysAgo = new Date(refDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(refDate.getTime() - 90 * 24 * 60 * 60 * 1000);

  let totalInvVal = 0;
  let totalCogs30 = 0;
  let totalStockoutVal = 0;
  let totalOverstockVal = 0;
  let overstockCount = 0;
  let slowMovingCount = 0;

  // Health distribution counters — SAME 4-category logic as Dashboard
  let outOfStockCount = 0;
  let slowDeadCount = 0;   // "Slow / Dead Stock" bucket
  let lowStockCount = 0;
  let healthyCount = 0;    // "Healthy" = in stock, not slow, not low

  // Additional detail counters for the distribution chart labels
  let atRiskCount = 0;      // subset of lowStockCount (≤7 days)

  const productAnalytics: any[] = [];

  activeProducts.forEach((p) => {
    const currentStock = p.currentStock || 0;

    const suppMap = skuSupplierMaps.find((m) => m.sku === p.sku);
    const preferredSuppMap = skuSupplierMaps.find((m) => m.sku === p.sku && m.isPreferred);
    const supplierObj = suppliers.find(
      (s) => s.supplierCode === (suppMap?.supplierCode || preferredSuppMap?.supplierCode)
    );

    const unitCost = p.unitCost || p.sellingPrice || 0;

    const sellingPrice = p.sellingPrice || unitCost * 1.5;
    const itemVal = currentStock * unitCost;
    totalInvVal += itemVal;

    // Sales velocity — normalized SKU matching & product name matching
    const cleanSkuStr = (str: string) => (str || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    const pSkuClean = cleanSkuStr(p.sku);
    const pNameNorm = (p.productName || "").trim().toLowerCase();

    const skuSales = sales.filter((s) => {
      const sSkuClean = cleanSkuStr(s.sku);
      const sNameNorm = (s.productName || "").trim().toLowerCase();
      return (sSkuClean && pSkuClean && sSkuClean === pSkuClean) || (sNameNorm && pNameNorm && sNameNorm === pNameNorm);
    });
    const sales90 = skuSales.filter((s) => new Date(s.date) >= ninetyDaysAgo);
    const sales30 = skuSales.filter((s) => new Date(s.date) >= thirtyDaysAgo);

    const netUnits30 = sales30.reduce(
      (acc, s) => acc + (s.quantitySold || 0) - (s.returnQuantity || 0),
      0
    );
    const netUnits90 = sales90.reduce(
      (acc, s) => acc + (s.quantitySold || 0) - (s.returnQuantity || 0),
      0
    );

    const dailySalesVelocity = netUnits30 > 0 ? netUnits30 / 30 : (netUnits90 > 0 ? netUnits90 / 90 : 0);
    const daysOfStockVal = dailySalesVelocity > 0 ? currentStock / dailySalesVelocity : 999;

    totalCogs30 += netUnits30 * unitCost;

    const leadTime = suppMap?.leadTimeDays || supplierObj?.leadTimeDays || 7;
    const safetyStock = p.safetyStock || 0;
    const calculatedROP = Math.ceil(dailySalesVelocity * leadTime + safetyStock);
    const effectiveROP =
      p.reorderPoint !== null && p.reorderPoint !== undefined && p.reorderPoint > 0
        ? p.reorderPoint
        : calculatedROP > 0
          ? calculatedROP
          : 10;

    const targetStock = Math.ceil(dailySalesVelocity * (leadTime + 30) + safetyStock);

    // Standardized single source of truth classification (identical to Dashboard)
    const isOOS = currentStock <= 0;
    const isDead = currentStock > 0 && skuSales.length > 0 && netUnits90 === 0;
    const isSlow = currentStock > 0 && dailySalesVelocity > 0 && (daysOfStockVal > 90 || (netUnits30 === 0 && netUnits90 > 0));
    const isSlowOrDead = currentStock > 0 && (isDead || isSlow);
    const isLowStock = currentStock > 0 && currentStock <= effectiveROP && !isSlowOrDead;

    let itemStockoutVal = 0;
    let itemOverstockVal = 0;
    let isAtRisk = false;

    let status = "In stock";
    if (isOOS) {
      status = "Out of stock";
      outOfStockCount++;
      itemStockoutVal = Math.ceil((dailySalesVelocity || 1) * 7) * sellingPrice;
      totalStockoutVal += itemStockoutVal;
    } else if (isSlowOrDead) {
      status = "Slow moving";
      slowDeadCount++;
      slowMovingCount++;
      if (daysOfStockVal > 90 || (targetStock > 0 && currentStock >= 3 * targetStock)) {
        overstockCount++;
        const excessUnits = Math.max(0, currentStock - targetStock);
        itemOverstockVal = excessUnits * unitCost;
        totalOverstockVal += itemOverstockVal;
      }
    } else if (isLowStock) {
      status = "Low stock";
      lowStockCount++;
      if (dailySalesVelocity > 0 && daysOfStockVal <= 7) {
        atRiskCount++;
        isAtRisk = true;
        itemStockoutVal = Math.max(0, Math.ceil(dailySalesVelocity * 7 - currentStock)) * sellingPrice;
        totalStockoutVal += itemStockoutVal;
      }
    } else {
      status = "In stock";
      healthyCount++;
    }

    productAnalytics.push({
      id: p.id,
      sku: p.sku,
      productName: p.productName,
      category: p.category || "General",
      currentStock,
      unitCost,
      sellingPrice,
      itemVal,
      dailySalesVelocity,
      daysOfStock: Math.round(daysOfStockVal),
      status,
      supplierName: supplierObj?.supplierName || suppMap?.supplierCode || "MobileMart",
      leadTime,
      isAtRisk,
      stockoutVal: itemStockoutVal,
      overstockVal: itemOverstockVal,
      cogs30: netUnits30 * unitCost,
    });
  });

  const totalSkus = activeProducts.length;

  // Turnover ratio calculation: (COGS 30d * 12) / Total Inventory Value
  const turnoverRatioVal = totalInvVal > 0 ? (totalCogs30 * 12) / totalInvVal : 4.2;
  const stockTurnoverRatio = `${turnoverRatioVal.toFixed(1)}x`;

  // Percentage distribution
  const denom = totalSkus > 0 ? totalSkus : 1;
  const inStockPct = Math.round((healthyCount / denom) * 100);
  const lowStockPct = Math.round(((lowStockCount + atRiskCount) / denom) * 100);
  const outOfStockPct = Math.round((outOfStockCount / denom) * 100);
  const overstockPct = Math.round((overstockCount / denom) * 100);
  const slowMovingPct = Math.round((slowMovingCount / denom) * 100);

  // Supplier lead time analysis
  const highLeadTimeSuppliers = suppliers.filter((s) => (s.leadTimeDays || 7) > 10);
  const highLeadTimeCount = highLeadTimeSuppliers.length;

  // Reconstruct Historical Inventory Value Trends for Daily (8d), Weekly (8w), and Monthly (6m)
  const computeTrend = (stepDays: number, count: number, labelFormatter: (d: Date, idx: number) => string) => {
    const points: { dateStr: string; val: number }[] = [];
    if (totalInvVal <= 0 || activeProducts.length === 0 || sales.length === 0) return points;

    for (let i = count - 1; i >= 0; i--) {
      const targetDay = new Date(refDate.getTime() - i * stepDays * 24 * 60 * 60 * 1000);
      targetDay.setHours(23, 59, 59, 999);

      const salesAfterTarget = sales.filter((s) => new Date(s.date) > targetDay);
      const valueOfUnitsSoldAfterTarget = salesAfterTarget.reduce((acc, s) => {
        const pMatch = activeProducts.find(
          (p) => (p.sku || "").trim().toLowerCase() === (s.sku || "").trim().toLowerCase()
        );
        const uCost = pMatch?.unitCost || pMatch?.sellingPrice || 0;
        const netQty = (s.quantitySold || 0) - (s.returnQuantity || 0);
        return acc + netQty * uCost;
      }, 0);

      const dayVal = Math.round(totalInvVal + valueOfUnitsSoldAfterTarget);
      const dateLabel = labelFormatter(targetDay, count - 1 - i);
      points.push({ dateStr: dateLabel, val: dayVal });
    }
    return points;
  };

  const dailyTrend = computeTrend(1, 8, (d) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
  );

  const weeklyTrend = computeTrend(7, 8, (d, idx) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
  );

  const monthlyTrend = computeTrend(30, 6, (d) =>
    d.toLocaleDateString("en-GB", { month: "short" })
  );

  const categories = Array.from(new Set(activeProducts.map((p) => p.category || "General")));
  const supplierNames = Array.from(new Set(productAnalytics.map((p) => p.supplierName)));

  return {
    shop,
    dateRangeStr,
    maxSaleTime,
    metrics: {
      totalInventoryValue: totalInvVal,
      stockTurnoverRatio: totalInvVal > 0 ? stockTurnoverRatio : "-",
      stockoutValue: Math.round(totalStockoutVal),
      slowMovingCount: slowDeadCount,
      slowMovingPct: Math.round((slowDeadCount / (totalSkus || 1)) * 100),
      overstockValue: Math.round(totalOverstockVal),
      totalSkus,
      inStockCount: healthyCount,
      inStockPct: Math.round((healthyCount / (totalSkus || 1)) * 100),
      lowStockCount: lowStockCount,
      lowStockPct: Math.round((lowStockCount / (totalSkus || 1)) * 100),
      outOfStockCount: outOfStockCount,
      outOfStockPct: Math.round((outOfStockCount / (totalSkus || 1)) * 100),
      overstockCount,
      overstockPct: Math.round((overstockCount / (totalSkus || 1)) * 100),
      atRiskCount,
      highLeadTimeCount,
    },
    dailyTrend,
    weeklyTrend,
    monthlyTrend,
    categories,
    suppliers: supplierNames,
    productAnalytics,
    rawSales: sales.map((s) => ({ sku: s.sku, date: s.date, qty: (s.quantitySold || 0) - (s.returnQuantity || 0) })),
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
    align === "right" ? "right-0" : align === "left" ? "left-0" : "left-1/2 -translate-x-1/2";

  return (
    <div
      className="relative inline-flex items-center"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onClick={(e) => { e.stopPropagation(); setIsVisible(!isVisible); }}
    >
      <button
        type="button"
        className="w-5 h-5 rounded-full bg-slate-100 hover:bg-purple-100 text-slate-400 hover:text-purple-600 flex items-center justify-center transition-all cursor-pointer border border-slate-200/60"
        aria-label={`Information about ${title}`}
      >
        <Info className="w-3 h-3" />
      </button>
      {isVisible && (
        <div
          className={`absolute ${alignClass} top-full mt-2.5 w-72 p-4 bg-white border border-slate-200/90 rounded-2xl shadow-xl z-[9999] text-xs text-slate-700 space-y-2.5 pointer-events-none`}
          style={{ filter: "drop-shadow(0 10px 15px rgba(0,0,0,0.08))" }}
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-600" />
              {title}
            </span>
            <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100/80">
              Calculation Logic
            </span>
          </div>
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 font-mono text-[11px] text-purple-900 font-semibold tracking-tight overflow-x-auto">
            <span className="text-slate-400 font-sans font-normal text-[10px] block mb-0.5 uppercase tracking-wider">Formula:</span>
            {formula}
          </div>
          <p className="text-slate-600 text-[11px] leading-relaxed font-normal">{explanation}</p>
        </div>
      )}
    </div>
  );
}

export default function InsightsPage() {
  const { shop, dateRangeStr, maxSaleTime, metrics, dailyTrend, weeklyTrend, monthlyTrend, categories, suppliers, productAnalytics, rawSales } = useLoaderData<typeof loader>();

  const [categoryFilter, setCategoryFilter] = useState("All");
  const [supplierFilter, setSupplierFilter] = useState("All");
  const [timeframe, setTimeframe] = useState("Daily");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [showAiDrawer, setShowAiDrawer] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<Array<{ sender: "user" | "ai"; text: string }>>([
    {
      sender: "ai",
      text: "Hello! I am StockUp AI. Ask me anything about your inventory health, stockout risks, or performance metrics.",
    },
  ]);
  const [isAsking, setIsAsking] = useState(false);

  // Filter products by selected Category & Supplier
  const filteredProducts = productAnalytics.filter(
    (p: any) =>
      (categoryFilter === "All" || (p.category || "").toLowerCase() === categoryFilter.toLowerCase()) &&
      (supplierFilter === "All" || (p.supplierName || "").toLowerCase() === supplierFilter.toLowerCase())
  );

  const filteredTotalInvVal = filteredProducts.reduce((acc: number, p: any) => acc + (p.itemVal || 0), 0);

  const computeFilteredTrend = (stepDays: number, count: number, labelFormatter: (d: Date, idx: number) => string) => {
    if (filteredProducts.length === 0 || filteredTotalInvVal <= 0 || !rawSales || rawSales.length === 0) return [];

    const filteredSkus = new Set(filteredProducts.map((p: any) => (p.sku || "").trim().toLowerCase()));
    const refDate = maxSaleTime && maxSaleTime > 0 ? new Date(maxSaleTime) : new Date();

    const points: { dateStr: string; val: number }[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const targetDay = new Date(refDate.getTime() - i * stepDays * 24 * 60 * 60 * 1000);
      targetDay.setHours(23, 59, 59, 999);

      const salesAfterTarget = rawSales.filter(
        (s: any) => filteredSkus.has((s.sku || "").trim().toLowerCase()) && new Date(s.date) > targetDay
      );
      const valueOfUnitsSoldAfterTarget = salesAfterTarget.reduce((acc: number, s: any) => {
        const pMatch = filteredProducts.find(
          (p: any) => (p.sku || "").trim().toLowerCase() === (s.sku || "").trim().toLowerCase()
        );
        const uCost = pMatch?.unitCost || pMatch?.sellingPrice || 0;
        return acc + s.qty * uCost;
      }, 0);

      const dayVal = Math.round(filteredTotalInvVal + valueOfUnitsSoldAfterTarget);
      const dateLabel = labelFormatter(targetDay, count - 1 - i);
      points.push({ dateStr: dateLabel, val: dayVal });
    }
    return points;
  };

  const isAllFilter = categoryFilter === "All" && supplierFilter === "All";

  // Dynamic metrics calculated based on selected category & supplier filters
  const filteredHealthyCount = filteredProducts.filter((p: any) => p.status === "In stock").length;
  const filteredLowStockCount = filteredProducts.filter((p: any) => p.status === "Low stock").length;
  const filteredOutOfStockCount = filteredProducts.filter((p: any) => p.status === "Out of stock").length;
  const filteredSlowStockCount = filteredProducts.filter((p: any) => p.status === "Slow moving").length;

  const dynamicDailyTrend = isAllFilter ? dailyTrend : computeFilteredTrend(1, 8, (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }));
  const dynamicWeeklyTrend = isAllFilter ? weeklyTrend : computeFilteredTrend(7, 8, (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }));
  const dynamicMonthlyTrend = isAllFilter ? monthlyTrend : computeFilteredTrend(30, 6, (d) => d.toLocaleDateString("en-GB", { month: "short" }));

  const activeTrend = timeframe === "Weekly" ? dynamicWeeklyTrend : timeframe === "Monthly" ? dynamicMonthlyTrend : dynamicDailyTrend;

  const chartW = 500;
  const chartH = 140;
  const maxVal = Math.max(...activeTrend.map((t: { val: number }) => t.val), 1);

  const formatCurrencyLabel = (val: number) => {
    return formatCurrency(val, shop?.currency);
  };

  const yMaxLabel = formatCurrencyLabel(maxVal);
  const yMidLabel = formatCurrencyLabel(Math.round(maxVal * 0.66));
  const yLowLabel = formatCurrencyLabel(Math.round(maxVal * 0.33));

  const chartPoints = activeTrend.map((t: { val: number; dateStr: string }, idx: number) => {
    const x = activeTrend.length > 1 ? (idx / (activeTrend.length - 1)) * chartW : chartW / 2;
    const y = chartH - (t.val / (maxVal || 1)) * (chartH - 20);
    return { x, y, val: t.val, dateStr: t.dateStr };
  });

  const svgPathD = chartPoints.map((p: { x: number; y: number }, i: number) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const svgPolygonPoints = `${svgPathD} L ${chartW} 150 L 0 150 Z`;

  const handleAskQuestion = (questionText?: string) => {
    const textToSend = questionText || chatInput;
    if (!textToSend.trim()) return;

    const newMsgs = [...chatMessages, { sender: "user" as const, text: textToSend }];
    setChatMessages(newMsgs);
    if (!questionText) setChatInput("");
    setIsAsking(true);

    setTimeout(() => {
      let reply = `Based on current DB velocity, ${metrics.atRiskCount} products are at risk of stockout within 7 days. Total inventory value is ${formatCurrency(metrics.totalInventoryValue, shop?.currency)}.`;
      const lower = textToSend.toLowerCase();
      if (lower.includes("risk")) {
        reply = `${metrics.atRiskCount} items are currently at risk of stocking out within 7 days, representing ${formatCurrency(metrics.stockoutValue, shop?.currency)} in potential lost revenue.`;
      } else if (lower.includes("reorder")) {
        reply = `We recommend reordering ${metrics.atRiskCount} SKUs today to prevent stockouts across your top categories.`;
      } else if (lower.includes("slow")) {
        reply = `You have ${metrics.slowMovingCount} slow-moving items (${metrics.slowMovingPct}% of inventory) with no sales in 30 days.`;
      } else if (lower.includes("forecast")) {
        reply = `Forecasted demand for next week is ~1,850 units across top categories, representing an estimated ₹1.4L in revenue.`;
      } else if (lower.includes("health") || lower.includes("summarize")) {
        reply = `Overall inventory health: ${metrics.inStockPct}% In Stock, ${metrics.lowStockPct}% Low Stock, ${metrics.outOfStockPct}% Out of Stock, ${metrics.overstockPct}% Overstocked.`;
      }

      setChatMessages([...newMsgs, { sender: "ai" as const, text: reply }]);
      setIsAsking(false);
    }, 700);
  };

  const [showAllReports, setShowAllReports] = useState(false);
  const reportFetcher = useFetcher<{
    reportName?: string;
    generatedAt?: string;
    content?: string;
    rawItems?: any[];
    error?: string;
  }>();

  const [selectedReport, setSelectedReport] = useState<{
    name: string;
    description: string;
  } | null>(null);

  const handleGenerateReport = (reportName: string, description: string) => {
    setSelectedReport({ name: reportName, description });
    reportFetcher.submit(
      { reportName },
      {
        method: "POST",
        action: "/app/api/ai-report",
        encType: "application/json",
      }
    );
  };

  const lastGenDateStr = `${new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}, 08:30 AM`;

  const handleDownloadReport = (reportName: string) => {
    let csvHeader = `SKU,Product Name,Category,Current Stock,Unit Cost (${getCurrencySymbol(shop?.currency)}),Selling Price (${getCurrencySymbol(shop?.currency)}),Inventory Value (${getCurrencySymbol(shop?.currency)}),Status,Supplier\n`;
    let csvRows = "";
    let recordCount = 0;

    if (productAnalytics && productAnalytics.length > 0) {
      let filtered = [...productAnalytics];
      if (reportName.includes("Slow")) {
        filtered = filtered.filter((p) => p.dailySalesVelocity === 0 || p.daysOfStock > 90);
      } else if (reportName.includes("Stockout")) {
        filtered = filtered.filter((p) => p.status === "Low stock" || p.status === "Out of stock" || p.currentStock <= 10);
      } else if (reportName.includes("Health")) {
        filtered = filtered.sort((a, b) => a.status.localeCompare(b.status));
      } else if (reportName.includes("Valuation")) {
        filtered = filtered.sort((a, b) => b.itemVal - a.itemVal);
      } else if (reportName.includes("Supplier")) {
        csvHeader = `Supplier Name,Total SKUs Supplied,Total Inventory Value (${getCurrencySymbol(shop?.currency)}),Lead Time (Days)\n`;
        const suppMapObj: Record<string, { skus: number; val: number; leadTime: number }> = {};
        filtered.forEach((p) => {
          const supp = p.supplierName || "Default Supplier";
          if (!suppMapObj[supp]) {
            suppMapObj[supp] = { skus: 0, val: 0, leadTime: p.leadTime || 7 };
          }
          suppMapObj[supp].skus += 1;
          suppMapObj[supp].val += p.itemVal;
        });

        const suppEntries = Object.entries(suppMapObj);
        recordCount = suppEntries.length;
        csvRows = suppEntries
          .map(([supp, d]) => `"${supp}",${d.skus},${d.val},${d.leadTime}`)
          .join("\n");
      }

      if (!reportName.includes("Supplier")) {
        recordCount = filtered.length;
        csvRows = filtered
          .map(
            (p) =>
              `"${p.sku}","${(p.productName || "").replace(/"/g, '""')}","${p.category}",${p.currentStock},${p.unitCost},${p.sellingPrice},${p.itemVal},"${p.status}","${p.supplierName}"`
          )
          .join("\n");
      }
    } else {
      recordCount = 1;
      csvRows = `"SKU-001","Sample Item","Electronics",50,150,300,7500,"In stock","MobileMart"`;
    }

    const fullCsv = csvHeader + csvRows;
    const blob = new Blob([fullCsv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${reportName.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setToastMessage(`Downloaded "${reportName}.csv" (${recordCount} records exported from DB)!`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const reportsList = [
    {
      name: "Inventory Summary Report",
      description: "Overview of inventory value, stock levels and key metrics.",
      frequency: "Weekly",
      lastGenerated: lastGenDateStr,
      iconColor: "text-emerald-600 bg-emerald-50",
    },
    {
      name: "Stock Health Report",
      description: "Detailed view of in stock, low stock, out of stock and overstock items.",
      frequency: "Weekly",
      lastGenerated: lastGenDateStr,
      iconColor: "text-blue-600 bg-blue-50",
    },
    {
      name: "Slow Moving Items Report",
      description: "List of items with low movement and aging stock.",
      frequency: "Weekly",
      lastGenerated: lastGenDateStr,
      iconColor: "text-amber-600 bg-amber-50",
    },
    {
      name: "Stockout Analysis Report",
      description: "Analysis of stockout items and lost sales.",
      frequency: "Weekly",
      lastGenerated: lastGenDateStr,
      iconColor: "text-rose-600 bg-rose-50",
    },
    {
      name: "Inventory Valuation Report",
      description: "Inventory value and valuation breakdown.",
      frequency: "Monthly",
      lastGenerated: lastGenDateStr,
      iconColor: "text-purple-600 bg-purple-50",
    },
    {
      name: "Supplier Performance Report",
      description: "Supplier-wise performance and lead time analysis.",
      frequency: "Monthly",
      lastGenerated: lastGenDateStr,
      iconColor: "text-teal-600 bg-teal-50",
    },
  ];

  return (
    <div className="min-h-screen bg-[#f1f1f1] text-slate-900 font-sans p-4 md:p-8">
      <div className="max-w-[1600px] mx-auto space-y-6">

        {/* TOAST NOTIFICATION */}
        {toastMessage && (
          <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="text-xs font-semibold">{toastMessage}</span>
          </div>
        )}

        {/* TOP HEADER BAR */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-purple-100/80 text-purple-600 flex items-center justify-center shrink-0 border border-purple-200/60 shadow-2xs">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
                Insights
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Track performance, uncover insights and download reports to make smarter inventory decisions.
              </p>
            </div>
          </div>
        </div>

        {/* TOP METRIC CARDS (5 CARDS GRID MATCHING WIREFRAME WITH REAL DB DATA) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* CARD 1: Total Inventory Value */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs hover:shadow-md transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 font-bold text-base">
                  {getCurrencySymbol(shop?.currency)}
                </div>
                <span className="text-xs font-semibold text-slate-600">Total Inventory Value</span>
              </div>
              <MetricTooltip
                title="Total Inventory Value"
                formula="Sum(Current Stock × Unit Cost)"
                explanation="The total cost value of all units currently held in your warehouse across every active product SKU."
                align="left"
              />
            </div>
            <div className="mt-3">
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                {formatCurrency(metrics.totalInventoryValue, shop?.currency)}
              </h2>
            </div>
          </div>

          {/* CARD 2: Stock Turnover Ratio */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs hover:shadow-md transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <RefreshCw className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-semibold text-slate-600">Stock Turnover Ratio</span>
              </div>
              <MetricTooltip
                title="Stock Turnover Ratio"
                formula="COGS (30d) / Avg Inventory Value"
                explanation="How many times your entire inventory was sold and replaced over the last 30 days. A higher ratio means faster-moving, healthier stock."
                align="left"
              />
            </div>
            <div className="mt-3">
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                {metrics.stockTurnoverRatio}
              </h2>
            </div>
          </div>

          {/* CARD 3: Stockout Value */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs hover:shadow-md transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-semibold text-slate-600">Stockout Value</span>
              </div>
              <MetricTooltip
                title="Stockout Value"
                formula="Sum(Daily Velocity × 7d × Selling Price)"
                explanation="Estimated revenue at risk from out-of-stock and at-risk SKUs over the next 7 days, assuming no restock action is taken."
                align="center"
              />
            </div>
            <div className="mt-3">
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                {formatCurrency(metrics.stockoutValue, shop?.currency)}
              </h2>
            </div>
          </div>

          {/* CARD 4: Slow Moving Items */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs hover:shadow-md transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                  <Clock className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-semibold text-slate-600">Slow Moving Items</span>
              </div>
              <MetricTooltip
                title="Slow Moving Items"
                formula="Count(Days of Stock > 90d OR 0 sales in 30d)"
                explanation="Products with more than 90 days of stock remaining, or zero net sales in the last 30 days — indicating excess or dead inventory tying up capital."
                align="right"
              />
            </div>
            <div className="mt-3">
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                {metrics.slowMovingCount}
              </h2>
              <p className="text-xs font-medium text-slate-500 mt-1">
                {metrics.slowMovingPct}% of total inventory
              </p>
            </div>
          </div>

          {/* CARD 5: Overstock Value */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs hover:shadow-md transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <Package className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-semibold text-slate-600">Overstock Value</span>
              </div>
              <MetricTooltip
                title="Overstock Value"
                formula="Sum(Excess Units × Unit Cost)"
                explanation="Capital tied up in excess inventory. Excess Units = max(0, Current Stock − Target Stock), for all SKUs where stock coverage exceeds 90 days."
                align="right"
              />
            </div>
            <div className="mt-3">
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                {formatCurrency(metrics.overstockValue, shop?.currency)}
              </h2>
            </div>
          </div>
        </div>

        {/* DATE & FILTERS BAR */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Date Range Selector */}
            {/* <button className="bg-white border border-slate-200 text-slate-700 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 hover:bg-slate-50 transition-all cursor-pointer shadow-2xs">
              <Calendar className="w-4 h-4 text-purple-600" />
              <span>{dateRangeStr}</span>
              <span className="text-slate-400">∨</span>
            </button> */}

            {/* Category Dropdown */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-white border border-slate-200 text-slate-700 px-3.5 py-2 rounded-xl text-xs font-semibold focus:outline-none cursor-pointer hover:border-slate-300 shadow-2xs"
            >
              <option value="All">Category: All</option>
              {categories.map((c: string, idx: number) => (
                <option key={idx} value={c}>
                  {c}
                </option>
              ))}
            </select>

            {/* Supplier Dropdown */}
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="bg-white border border-slate-200 text-slate-700 px-3.5 py-2 rounded-xl text-xs font-semibold focus:outline-none cursor-pointer hover:border-slate-300 shadow-2xs"
            >
              <option value="All">Supplier: All</option>
              {suppliers.map((s: string, idx: number) => (
                <option key={idx} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Filters Button */}
          {/* <button className="bg-white border border-slate-200 text-slate-700 px-3.5 py-2 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-all flex items-center gap-2 cursor-pointer shadow-2xs">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <span>Filters</span>
            <span className="text-slate-400">∨</span>
          </button> */}
        </div>

        {/* MIDDLE CHARTS SECTION (2 CHARTS GRID MATCHING WIREFRAME) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

          {/* LEFT CHART (SPAN 7/12): Inventory Value Over Time */}
          <div className="lg:col-span-7 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-extrabold text-slate-900">
                  Inventory Value Over Time
                </h3>
                <Info className="w-4 h-4 text-slate-400" />
              </div>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                className="bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-xl text-xs font-semibold focus:outline-none cursor-pointer shadow-2xs"
              >
                <option value="Daily">Daily </option>
                <option value="Weekly">Weekly </option>
                <option value="Monthly">Monthly </option>
              </select>
            </div>

            {/* SVG AREA CHART OR EMPTY STATE */}
            {activeTrend.length > 0 && metrics.totalInventoryValue > 0 ? (
              <div className="relative pt-6 pb-2">
                {/* Y Axis Labels */}
                <div className="absolute left-0 top-6 bottom-8 flex flex-col justify-between text-[10px] font-semibold text-slate-400">
                  <span>{yMaxLabel}</span>
                  <span>{yMidLabel}</span>
                  <span>{yLowLabel}</span>
                  <span>₹0</span>
                </div>

                {/* Area Chart SVG */}
                <div className="ml-12">
                  <svg className="w-full h-48 overflow-visible" viewBox="0 0 500 160" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="purpleGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Horizontal Grid lines */}
                    <line x1="0" y1="10" x2="500" y2="10" stroke="#f1f5f9" strokeDasharray="4 4" />
                    <line x1="0" y1="60" x2="500" y2="60" stroke="#f1f5f9" strokeDasharray="4 4" />
                    <line x1="0" y1="110" x2="500" y2="110" stroke="#f1f5f9" strokeDasharray="4 4" />
                    <line x1="0" y1="150" x2="500" y2="150" stroke="#e2e8f0" />

                    {/* Area fill */}
                    {chartPoints.length > 0 && (
                      <polygon points={svgPolygonPoints} fill="url(#purpleGradient)" />
                    )}

                    {/* Smooth line */}
                    {chartPoints.length > 0 && (
                      <path
                        d={svgPathD}
                        fill="none"
                        stroke="#7c3aed"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}

                    {/* Data Point Circles */}
                    {chartPoints.map((pt: { x: number; y: number; val: number }, idx: number) => (
                      <circle
                        key={idx}
                        cx={pt.x}
                        cy={pt.y}
                        r={idx === chartPoints.length - 1 ? 5 : 3.5}
                        fill="#7c3aed"
                        stroke="#ffffff"
                        strokeWidth={idx === chartPoints.length - 1 ? 2 : 1}
                      />
                    ))}
                  </svg>

                  {/* X Axis Labels */}
                  <div className="flex justify-between text-[11px] font-semibold text-slate-400 mt-2">
                    {chartPoints.map((t: { dateStr: string }, idx: number) => (
                      <span key={idx}>{t.dateStr}</span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-48 flex flex-col items-center justify-center bg-slate-50/60 rounded-2xl border border-dashed border-slate-200/90 p-6 text-center">
                <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mb-2.5 shadow-2xs">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <h4 className="text-xs font-bold text-slate-800">
                  No data available for the selected period.
                </h4>
                <p className="text-[11px] text-slate-500 font-medium max-w-xs mt-1">
                  Historical inventory value snapshots for {timeframe.toLowerCase()} view will populate as sales and stock movements occur.
                </p>
              </div>
            )}
          </div>

          {/* RIGHT CHART (SPAN 5/12): Inventory Health Distribution — shared component */}
          <div className="lg:col-span-5">
            <InventoryHealthChart
              healthyCount={filteredHealthyCount}
              lowStockCount={filteredLowStockCount}
              outOfStockCount={filteredOutOfStockCount}
              slowStockCount={filteredSlowStockCount}
              showCard={true}
              showScore={true}
              showBanner={true}
              badgeText={isAllFilter ? "All SKUs" : `${filteredProducts.length} SKUs`}
            />
          </div>
        </div>

        {/* BOTTOM MAIN GRID (REPORTS & INSIGHTS 8 COLS / SIDEBAR 4 COLS) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

          {/* LEFT SIDE (SPAN 8/12): REPORTS & TOP INSIGHTS */}
          <div className="lg:col-span-8 space-y-6">

            {/* REPORTS SECTION TABLE CONTAINER */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-2xs space-y-4">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">Reports</h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Download detailed reports to analyze and share inventory performance.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50">
                      <th className="py-3 px-4">Report Name</th>
                      <th className="py-3 px-4">Description</th>
                      <th className="py-3 px-4">Frequency</th>
                      <th className="py-3 px-4">Last Generated</th>
                      <th className="py-3 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {(showAllReports ? reportsList : reportsList.slice(0, 3)).map((rep, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5 font-bold text-slate-900">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${rep.iconColor}`}>
                              <FileSpreadsheet className="w-4 h-4" />
                            </div>
                            <span>{rep.name}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 font-medium text-[11px] max-w-xs">
                          {rep.description}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-700">
                          {rep.frequency}
                        </td>
                        <td className="py-3.5 px-4 font-medium text-slate-500 text-[11px] whitespace-nowrap">
                          {rep.lastGenerated}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleGenerateReport(rep.name, rep.description)}
                              className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-xl font-bold text-xs shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-purple-200" />
                              <span>Generate</span>
                            </button>
                            {/* <button
                              type="button"
                              onClick={() => handleDownloadReport(rep.name)}
                              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-all cursor-pointer"
                              title="Export CSV Data directly"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button> */}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* View All Reports Button */}
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setShowAllReports(!showAllReports)}
                  className="border border-purple-200 text-purple-700 hover:bg-purple-50 font-bold text-xs px-6 py-2.5 rounded-xl shadow-2xs transition-all cursor-pointer inline-flex items-center gap-1.5"
                >
                  <span>{showAllReports ? "Show fewer reports" : "View all reports"}</span>
                  <ChevronRight className={`w-4 h-4 text-purple-600 transition-transform ${showAllReports ? "rotate-90" : ""}`} />
                </button>
              </div>
            </div>

            {/* TOP INSIGHTS CONTAINER (DYNAMICALLY GENERATED FROM DB METRICS) */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-slate-900">Top Insights</h3>
              </div>

              <div className="space-y-3">
                {/* Insight 1: Risk of Stockout */}
                <div className="bg-slate-50/60 border border-slate-200/70 hover:border-purple-200 rounded-2xl p-4 flex items-center justify-between gap-4 transition-all cursor-pointer group">
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-extrabold text-slate-900 group-hover:text-purple-700 transition-colors">
                        {metrics.atRiskCount} items are at risk of stockout
                      </div>
                      <div className="text-[11px] font-medium text-slate-500 mt-0.5">
                        These items may run out within 7 days.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Insight 2: Slow Moving */}
                <div className="bg-slate-50/60 border border-slate-200/70 hover:border-purple-200 rounded-2xl p-4 flex items-center justify-between gap-4 transition-all cursor-pointer group">
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shrink-0">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-extrabold text-slate-900 group-hover:text-purple-700 transition-colors">
                        {metrics.slowMovingCount} slow moving items
                      </div>
                      <div className="text-[11px] font-medium text-slate-500 mt-0.5">
                        These items haven't moved in the last 30 days.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Insight 3: Overstock */}
                <div className="bg-slate-50/60 border border-slate-200/70 hover:border-purple-200 rounded-2xl p-4 flex items-center justify-between gap-4 transition-all cursor-pointer group">
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
                      <Package className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-extrabold text-slate-900 group-hover:text-purple-700 transition-colors">
                        Overstock of {formatCurrency(metrics.overstockValue, shop?.currency)}
                      </div>
                      <div className="text-[11px] font-medium text-slate-500 mt-0.5">
                        {metrics.overstockCount} items are overstocked and tying up capital.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Insight 4: Value Growth */}
                <div className="bg-slate-50/60 border border-slate-200/70 hover:border-purple-200 rounded-2xl p-4 flex items-center justify-between gap-4 transition-all cursor-pointer group">
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 border border-purple-100 flex items-center justify-center shrink-0">
                      <TrendingUp className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-extrabold text-slate-900 group-hover:text-purple-700 transition-colors">
                        Total Inventory Valuation: {formatCurrency(metrics.totalInventoryValue, shop?.currency)}
                      </div>
                      <div className="text-[11px] font-medium text-slate-500 mt-0.5">
                        Calculated across {metrics.totalSkus} active catalog SKUs.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Insight 5: Lead Time */}
                <div className="bg-slate-50/60 border border-slate-200/70 hover:border-purple-200 rounded-2xl p-4 flex items-center justify-between gap-4 transition-all cursor-pointer group">
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 border border-teal-100 flex items-center justify-center shrink-0">
                      <Truck className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-extrabold text-slate-900 group-hover:text-purple-700 transition-colors">
                        {metrics.highLeadTimeCount || 0} suppliers have high lead time
                      </div>
                      <div className="text-[11px] font-medium text-slate-500 mt-0.5">
                        Monitor lead times to avoid stock delays.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT SIDEBAR (SPAN 4/12): WHAT DO THESE MEAN, TIPS, & ASK STOCKPILOT AI) */}
          <div className="lg:col-span-4 space-y-6">

            {/* CARD 1: What do these mean? */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs space-y-3.5">
              <h3 className="text-sm font-extrabold text-slate-900">What do these mean?</h3>

              <div className="space-y-3 text-xs">
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0 mt-0.5 font-bold">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-extrabold text-slate-900 block">At risk</span>
                    <span className="text-slate-500 font-medium text-[11px]">
                      Stock may run out within 7 days based on sales velocity.
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0 mt-0.5 font-bold">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-extrabold text-slate-900 block">Low stock</span>
                    <span className="text-slate-500 font-medium text-[11px]">
                      Stock is low but expected to last more than 7 days.
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5 font-bold">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-extrabold text-slate-900 block">In stock</span>
                    <span className="text-slate-500 font-medium text-[11px]">
                      Good stock level.
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shrink-0 mt-0.5 font-bold">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-extrabold text-slate-900 block">Days of Stock</span>
                    <span className="text-slate-500 font-medium text-[11px]">
                      How many days your current stock will last based on recent sales.
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* CARD 2: Tips */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs space-y-3">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-extrabold text-slate-900">Tips</h3>
              </div>

              <ul className="space-y-2 text-xs font-medium text-slate-600 list-disc list-inside leading-relaxed">
                <li>Review insights weekly.</li>
                <li>Focus on at-risk and stockout items to avoid lost sales.</li>
                <li>Reduce slow moving and overstock items to free up cash.</li>
              </ul>
            </div>

            {/* CARD 3: Ask StockPilot AI Drawer */}
            <StockPilotAiChatCard metrics={metrics} />

          </div>
        </div>

      </div>

      <AiReportModal
        isOpen={Boolean(selectedReport)}
        onClose={() => setSelectedReport(null)}
        reportName={selectedReport?.name || ""}
        reportDescription={selectedReport?.description || ""}
        reportData={reportFetcher.data || null}
        isLoading={reportFetcher.state !== "idle"}
        onRegenerate={() => {
          if (selectedReport) {
            handleGenerateReport(selectedReport.name, selectedReport.description);
          }
        }}
      />
    </div>
  );
}
