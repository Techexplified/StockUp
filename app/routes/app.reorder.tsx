import { useState, useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureShopData } from "../db.server";
import prisma from "../db.server";
import {
  ShoppingBag,
  Package,
  AlertTriangle,
  Clock,
  Sparkles,
  Search,
  SlidersHorizontal,
  Download,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Calendar,
  X,
  Send,
  IndianRupee,
  ShoppingCart,
  Info,
  Lightbulb,
  CheckCircle2,
  Plus,
  FileText,
  CheckCircle,
  Trash2,
  Minus,
  ArrowLeft,
  Users,
  Layers,
  Mail,
  Check,
} from "lucide-react";
import { StockPilotAiChatCard } from "../components/StockPilotAiChatCard";
import { formatCurrency, getCurrencySymbol } from "../utils/currency";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await ensureShopData(request, authenticate);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create_bulk_po") {
    const poNumber = (formData.get("poNumber") as string)?.trim() || `PO-${Date.now().toString().slice(-6)}`;
    const supplierCode = (formData.get("supplierCode") as string)?.trim() || "MobileMart";
    const poDateStr = (formData.get("poDate") as string)?.trim();
    const expectedDeliveryDateStr = (formData.get("expectedDeliveryDate") as string)?.trim();
    const notes = (formData.get("notes") as string)?.trim();
    const itemsJson = (formData.get("itemsJson") as string)?.trim();

    let items: any[] = [];
    try {
      items = JSON.parse(itemsJson || "[]");
    } catch (e) {
      return { error: "Invalid purchase cart items payload." };
    }

    if (items.length === 0) {
      return { error: "Purchase Cart is empty. Please select at least 1 item." };
    }

    const poDate = poDateStr ? new Date(poDateStr) : new Date();
    const expectedDeliveryDate = expectedDeliveryDateStr ? new Date(expectedDeliveryDateStr) : null;

    try {
      // Create PO records for each item in the cart
      const createdPOs = await Promise.all(
        items.map((item) =>
          prisma.purchaseOrder.create({
            data: {
              shopDomain: shop.shopDomain,
              poNumber,
              poDate,
              supplierCode: supplierCode || item.supplierName || "Supplier",
              sku: item.sku,
              productName: item.name,
              orderedQuantity: parseInt(item.qty || "1", 10),
              unitCost: parseFloat(item.unitCost || "0"),
              expectedDeliveryDate,
              poStatus: "Open",
              notes: notes || null,
            },
          })
        )
      );

      const totalUnits = items.reduce((acc, i) => acc + (parseInt(i.qty, 10) || 0), 0);
      return {
        success: true,
        message: `Purchase Order "${poNumber}" created for ${createdPOs.length} items (${totalUnits.toLocaleString("en-IN")} units) successfully!`,
        poNumber,
      };
    } catch (err: any) {
      console.error("Error creating bulk purchase order:", err);
      return { error: `Failed to save Purchase Order: ${err.message}` };
    }
  }

  if (intent === "create_po") {
    const poNumber = (formData.get("poNumber") as string)?.trim();
    const poDateStr = (formData.get("poDate") as string)?.trim();
    const supplierCode = (formData.get("supplierCode") as string)?.trim();
    const sku = (formData.get("sku") as string)?.trim();
    const productName = (formData.get("productName") as string)?.trim();
    const orderedQuantityStr = (formData.get("orderedQuantity") as string)?.trim();
    const unitCostStr = (formData.get("unitCost") as string)?.trim();
    const expectedDeliveryDateStr = (formData.get("expectedDeliveryDate") as string)?.trim();
    const poStatus = (formData.get("poStatus") as string)?.trim() || "Open";
    const notes = (formData.get("notes") as string)?.trim();

    // Field Validations
    if (!poNumber || !supplierCode || !sku || !productName) {
      return { error: "PO Number, Supplier Code, SKU, and Product Name are required." };
    }

    const orderedQuantity = parseInt(orderedQuantityStr || "0", 10);
    if (isNaN(orderedQuantity) || orderedQuantity <= 0) {
      return { error: "Ordered Quantity must be greater than 0." };
    }

    const unitCost = parseFloat(unitCostStr || "0");
    if (isNaN(unitCost) || unitCost < 0) {
      return { error: "Unit Cost must be a valid non-negative number." };
    }

    const poDate = poDateStr ? new Date(poDateStr) : new Date();
    const expectedDeliveryDate = expectedDeliveryDateStr ? new Date(expectedDeliveryDateStr) : null;

    try {
      const createdPO = await prisma.purchaseOrder.create({
        data: {
          shopDomain: shop.shopDomain,
          poNumber,
          poDate,
          supplierCode,
          sku,
          productName,
          orderedQuantity,
          unitCost,
          expectedDeliveryDate,
          poStatus,
          notes: notes || null,
        },
      });

      return {
        success: true,
        message: `Purchase Order "${createdPO.poNumber}" created and persisted to database successfully!`,
        po: createdPO,
      };
    } catch (err: any) {
      console.error("Error creating purchase order:", err);
      return { error: `Failed to save Purchase Order: ${err.message}` };
    }
  }

  return { error: "Invalid action intent." };
};

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

  const skuSupplierMaps = await prisma.skuSupplierMap.findMany({
    where: { shopDomain: shop.shopDomain },
  });

  const suppliers = await prisma.supplier.findMany({
    where: { shopDomain: shop.shopDomain },
  });

  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: { shopDomain: shop.shopDomain },
  });

  const activeProducts = products.filter(
    (p) => (p.status || "Active").toLowerCase() !== "inactive"
  );

  const hasRealData = activeProducts.length > 0;
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

  let totalItemsToReorder = 0;
  let totalAtRiskCount = 0;
  let totalRecommendedUnitsSum = 0;
  let totalEstOrderValueSum = 0;

  const rawHorizon = shop?.planningHorizon || "30 days";
  const parsedHorizon = parseInt(rawHorizon, 10);
  const planningHorizonDays = !isNaN(parsedHorizon) && parsedHorizon > 0 ? parsedHorizon : 30;

  let existingPOs = await prisma.purchaseOrder.findMany({
    where: { shopDomain: shop.shopDomain },
    select: { sku: true },
  });
  if (existingPOs.length === 0) {
    existingPOs = await prisma.purchaseOrder.findMany({
      select: { sku: true },
    });
  }
  const existingPoSkus = Array.from(new Set(existingPOs.map((p) => p.sku)));

  const mappedRecommendations = activeProducts.map((p) => {
    // Step 1: Calculate Inventory Position = Current Stock + Incoming Qty
    const currentStock = p.currentStock || 0;
    const skuPOs = purchaseOrders.filter(
      (po) => po.sku === p.sku && po.poStatus !== "Cancelled" && po.poStatus !== "Received"
    );
    const incomingQty = skuPOs.reduce(
      (acc, po) => acc + Math.max(0, (po.orderedQuantity || 0) - (po.receivedQuantity || 0)),
      0
    );
    const inventoryPosition = currentStock + incomingQty;

    // Daily Sales Velocity = Net Units Sold (last 30 days) ÷ 30 (Robust SKU & product name matching)
    const cleanSkuStr = (str: string) => (str || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    const pSkuClean = cleanSkuStr(p.sku);
    const pNameNorm = (p.productName || "").trim().toLowerCase();

    const skuSales = sales.filter((s) => {
      const sSkuClean = cleanSkuStr(s.sku);
      const sNameNorm = (s.productName || "").trim().toLowerCase();
      return (sSkuClean && pSkuClean && sSkuClean === pSkuClean) || (sNameNorm && pNameNorm && sNameNorm === pNameNorm);
    });
    const sales30 = skuSales.filter((s) => new Date(s.date) >= thirtyDaysAgo);
    const netUnits30 = sales30.reduce((acc, s) => acc + (s.quantitySold || 0) - (s.returnQuantity || 0), 0);

    let dailySalesVelocity = netUnits30 > 0 ? netUnits30 / 30 : 0;
    if (dailySalesVelocity === 0) {
      const sales90 = skuSales.filter((s) => new Date(s.date) >= ninetyDaysAgo);
      const netUnits90 = sales90.reduce((acc, s) => acc + (s.quantitySold || 0) - (s.returnQuantity || 0), 0);
      dailySalesVelocity = netUnits90 > 0 ? netUnits90 / 90 : 2.5;
    }

    // Lead Time: SKU Supplier Lead Time → Supplier Master Lead Time → Default 7
    const suppMap = skuSupplierMaps.find((m) => m.sku === p.sku);
    const preferredSuppMap = skuSupplierMaps.find((m) => m.sku === p.sku && m.isPreferred);
    const supplierObj = suppliers.find((s) => s.supplierCode === (suppMap?.supplierCode || preferredSuppMap?.supplierCode));
    const supplierName = supplierObj?.supplierName || suppMap?.supplierCode || preferredSuppMap?.supplierCode || "MobileMart";
    const isPreferred = suppMap?.isPreferred ?? true;

    const leadTime = suppMap?.leadTimeDays || supplierObj?.leadTimeDays || 7;
    const safetyStock = p.safetyStock || 0;

    // Step 2: Determine Reorder Point (ROP)
    let rop = p.reorderPoint && p.reorderPoint > 0 ? p.reorderPoint : 0;
    if (!rop) {
      rop = Math.ceil(dailySalesVelocity * leadTime + safetyStock);
    }

    // Days of Stock = Current Stock / Daily Sales Velocity
    const daysOfStockVal = dailySalesVelocity > 0 ? currentStock / dailySalesVelocity : (currentStock > 0 ? 999 : 0);
    const daysOfStock = Math.max(0, Math.round(daysOfStockVal));

    // Step 3: Check Reorder Trigger (Condition 1: Inv Pos <= ROP | Condition 2: Days of Stock <= Lead Time)
    const condition1 = inventoryPosition <= rop;
    const condition2 = daysOfStockVal <= leadTime;
    const isReorderTriggered = condition1 || condition2;

    let status = "In stock";
    let statusColor = "bg-emerald-50 text-emerald-700 border-emerald-200";
    let daysColor = "text-slate-600";

    if (daysOfStock <= 7 || currentStock <= 0) {
      status = "At risk";
      statusColor = "bg-rose-50 text-rose-700 border-rose-200";
      daysColor = "text-rose-600 font-bold";
      totalAtRiskCount++;
    } else if (daysOfStock <= 14 || condition1 || condition2) {
      status = "Low stock";
      statusColor = "bg-amber-50 text-amber-700 border-amber-200";
      daysColor = "text-amber-600 font-bold";
    }

    // Step 1: Calculate Target Stock using merchant's configured Planning Horizon
    const targetStock = Math.ceil(dailySalesVelocity * (leadTime + planningHorizonDays) + safetyStock);

    // Calculate Recommended Quantity only if reorder is triggered or item is at risk/low stock
    let finalRecQty = 0;
    if (isReorderTriggered || status === "At risk" || status === "Low stock") {
      const rawRecQty = Math.max(1, targetStock - currentStock - incomingQty);
      const moq = suppMap?.moq && suppMap.moq > 0 ? suppMap.moq : 0;
      const qtyAfterMoq = moq > 0 ? Math.max(rawRecQty, moq) : rawRecQty;

      let packSize = 1;
      if (suppMap?.packSize) {
        const parsedPack = parseInt(suppMap.packSize, 10);
        if (!isNaN(parsedPack) && parsedPack > 0) {
          packSize = parsedPack;
        }
      }
      finalRecQty = packSize > 1 ? Math.ceil(qtyAfterMoq / packSize) * packSize : qtyAfterMoq;
    }

    const applicableUnitCost = p.unitCost || p.sellingPrice || 0;

    // SKU Estimated Order Value = Final Recommended Qty * Applicable Unit Cost
    const estValue = finalRecQty * applicableUnitCost;

    if (status === "At risk" || status === "Low stock" || isReorderTriggered) {
      totalItemsToReorder++;
      totalRecommendedUnitsSum += finalRecQty;
      totalEstOrderValueSum += estValue;
    }

    const isOrdered = existingPoSkus.includes(p.sku);
    let tabCategory = "Reviewed";
    if (isOrdered) {
      tabCategory = "Ordered";
    } else if (status === "At risk") {
      tabCategory = "At Risk";
    } else if (status === "Low stock" || isReorderTriggered) {
      tabCategory = "New";
    } else {
      tabCategory = "Reviewed";
    }

    return {
      id: p.id,
      name: p.productName,
      sku: p.sku,
      variant: p.variantName || p.category || "Standard",
      supplierName,
      isPreferred,
      status,
      statusColor,
      daysOfStock: `${daysOfStock} days`,
      daysColor,
      recommendedQty: `${finalRecQty} Units`,
      recommendedQtyNum: finalRecQty,
      unitCost: applicableUnitCost,
      estOrderValue: estValue,
      category: p.category || "General",
      tabCategory,
    };
  });

  return {
    shop,
    dateRangeStr,
    metrics: {
      itemsToReorder: totalItemsToReorder,
      skusCount: activeProducts.length,
      atRiskCount: totalAtRiskCount,
      totalRecommendedQty: totalRecommendedUnitsSum,
      estOrderValue: totalEstOrderValueSum,
    },
    recommendationsList: mappedRecommendations,
    existingPoSkus,
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
      onClick={(e) => {
        e.stopPropagation();
        setIsVisible(!isVisible);
      }}
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

export default function ReorderPage() {
  const { shop, metrics, recommendationsList, existingPoSkus,dateRangeStr } = useLoaderData<typeof loader>();
  const poFetcher = useFetcher<any>();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [supplierFilter, setSupplierFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [activeTab, setActiveTab] = useState("All Recommendations");
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [showAiDrawer, setShowAiDrawer] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<Array<{ sender: "user" | "ai"; text: string }>>([]);
  const [isAsking, setIsAsking] = useState(false);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [submittingItemId, setSubmittingItemId] = useState<string | null>(null);
  const [savedSkus, setSavedSkus] = useState<string[]>(existingPoSkus || []);
  const [pendingPoSkus, setPendingPoSkus] = useState<string[]>([]);

  // Purchase Cart Modal state
  const [isCartModalOpen, setIsCartModalOpen] = useState(false);
  const [cartSupplier, setCartSupplier] = useState("Select supplier");
  const [cartDeliveryDate, setCartDeliveryDate] = useState("");
  const [cartNotes, setCartNotes] = useState("");
  const [cartItems, setCartItems] = useState<any[]>([]);

  // Success Modal state
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [successModalData, setSuccessModalData] = useState<any>({
    poNumber: "PO-2026-0724-001",
    supplierName: "MobileMart",
    totalItems: 8,
    totalUnits: 830,
    expectedDeliveryDate: "30 July 2026",
    totalCost: 46280,
  });

  useEffect(() => {
    if (poFetcher.state === "idle") {
      setSubmittingItemId(null);
    }
    if (poFetcher.data?.success) {
      const createdPoNum =
        poFetcher.data.poNumber ||
        poFetcher.data.po?.poNumber ||
        `PO-${new Date().getFullYear()}-${(new Date().getMonth() + 1).toString().padStart(2, "0")}${new Date().getDate().toString().padStart(2, "0")}-001`;

      let formattedDeliveryDate = "30 July 2026";
      if (cartDeliveryDate) {
        try {
          const d = new Date(cartDeliveryDate);
          formattedDeliveryDate = d.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          });
        } catch (e) {
          formattedDeliveryDate = cartDeliveryDate;
        }
      } else {
        const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        formattedDeliveryDate = d.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });
      }

      setSuccessModalData({
        poNumber: createdPoNum,
        supplierName: cartSupplier !== "Select supplier" ? cartSupplier : (cartItems[0]?.supplierName || "MobileMart"),
        totalItems: cartItems.length || 1,
        totalUnits: totalCartUnitsCount || 100,
        expectedDeliveryDate: formattedDeliveryDate,
        totalCost: totalCartCost || 46280,
      });

      setIsCartModalOpen(false);
      setIsSuccessModalOpen(true);

      if (poFetcher.data?.po?.sku) {
        setSavedSkus((prev) => Array.from(new Set([...prev, poFetcher.data.po.sku])));
      }
      if (cartItems.length > 0) {
        setSavedSkus((prev) => Array.from(new Set([...prev, ...cartItems.map((i) => i.sku)])));
        setCartItems([]);
        setPendingPoSkus([]);
      }
    }
  }, [poFetcher.data, poFetcher.state]);

  const handleDownloadPoPdf = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setToastMessage("Please allow popups to save PO as PDF.");
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${successModalData.poNumber || "Purchase_Order"}</title>
          <style>
            body {
              font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              padding: 40px;
              color: #0f172a;
              max-width: 800px;
              margin: 0 auto;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 2px solid #7c3aed;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 24px;
              font-weight: 800;
              color: #7c3aed;
            }
            .title {
              font-size: 28px;
              font-weight: 900;
              text-align: right;
              color: #0f172a;
            }
            .po-number {
              font-size: 14px;
              font-weight: 700;
              color: #64748b;
            }
            .grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 20px;
              background-color: #f8fafc;
              padding: 20px;
              border-radius: 12px;
              border: 1px solid #e2e8f0;
              margin-bottom: 30px;
            }
            .label {
              font-size: 11px;
              color: #64748b;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-bottom: 4px;
            }
            .value {
              font-size: 15px;
              font-weight: 800;
              color: #0f172a;
            }
            .footer {
              margin-top: 50px;
              padding-top: 20px;
              border-top: 1px solid #e2e8f0;
              font-size: 12px;
              color: #94a3b8;
              text-align: center;
            }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="logo">StockPilot V1</div>
              <div style="font-size: 12px; color: #64748b; margin-top: 2px;">Smart Inventory Management</div>
            </div>
            <div>
              <div class="title">PURCHASE ORDER</div>
              <div class="po-number">${successModalData.poNumber}</div>
            </div>
          </div>

          <div class="grid">
            <div>
              <div class="label">Purchase Order No.</div>
              <div class="value">${successModalData.poNumber}</div>
            </div>
            <div>
              <div class="label">Expected Delivery</div>
              <div class="value">${successModalData.expectedDeliveryDate}</div>
            </div>
            <div>
              <div class="label">Supplier</div>
              <div class="value">${successModalData.supplierName}</div>
            </div>
            <div>
              <div class="label">Total Units</div>
              <div class="value">${successModalData.totalUnits.toLocaleString("en-IN")} Units</div>
            </div>
            <div>
              <div class="label">Total Items</div>
              <div class="value">${successModalData.totalItems} Items</div>
            </div>
            <div>
              <div class="label">Estimated Total Cost</div>
              <div class="value">${formatCurrency(successModalData.totalCost, shop?.currency)}</div>
              <div style="font-size: 10px; color: #94a3b8;">Excluding taxes</div>
            </div>
          </div>

          <div style="margin-top: 20px; font-size: 13px; color: #334155; line-height: 1.6; background-color: #f1f5f9; padding: 16px; border-radius: 8px;">
            <strong>Note to Supplier:</strong><br />
            Please confirm receipt of Purchase Order <strong>${successModalData.poNumber}</strong> and confirm the expected dispatch & delivery schedule.
          </div>

          <div class="footer">
            Generated on ${new Date().toLocaleDateString("en-IN")} by StockPilot V1 System
          </div>

          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();

    setToastMessage(`Opening PDF dialog for ${successModalData.poNumber}...`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleEmailSupplier = () => {
    const subject = encodeURIComponent(`Purchase Order: ${successModalData.poNumber}`);
    const body = encodeURIComponent(
      `Hello ${successModalData.supplierName},\n\nPlease find Purchase Order ${successModalData.poNumber} for ${successModalData.totalUnits} units (Estimated Cost: ${formatCurrency(successModalData.totalCost, shop?.currency)}).\nExpected Delivery Date: ${successModalData.expectedDeliveryDate}.\n\nThank you!`
    );
    window.location.href = `mailto:supplier@example.com?subject=${subject}&body=${body}`;
    setToastMessage(`Opened email client for ${successModalData.supplierName}`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleDirectAddPo = (item: any) => {
    const newItem = {
      id: item.id,
      name: item.name,
      sku: item.sku,
      qty: item.recommendedQtyNum || 50,
      unitCost: item.unitCost || (item.estOrderValue && item.recommendedQtyNum ? Math.round(item.estOrderValue / item.recommendedQtyNum) : 150),
      supplierName: item.supplierName,
      icon: "📦",
    };

    setCartItems((prev) => {
      const exists = prev.some((i) => i.sku === item.sku);
      if (exists) return prev;
      return [...prev, newItem];
    });

    setPendingPoSkus((prev) => Array.from(new Set([...prev, item.sku])));
    setToastMessage(`"${item.name}" added to Review Order`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleOpenCartModal = () => {
    const isNotOrdered = (r: any) => !savedSkus.includes(r.sku) && r.tabCategory !== "Ordered";

    if (selectedRows.length > 0) {
      const selectedItems = recommendationsList
        .filter((r: any) => selectedRows.includes(r.id) && isNotOrdered(r))
        .map((r: any) => ({
          id: r.id,
          name: r.name,
          sku: r.sku,
          qty: r.recommendedQtyNum || 50,
          unitCost: r.unitCost || (r.estOrderValue && r.recommendedQtyNum ? Math.round(r.estOrderValue / r.recommendedQtyNum) : 150),
          supplierName: r.supplierName,
          icon: "📦",
        }));
      setCartItems(selectedItems);
    } else {
      // Filter out any items that have already been ordered or saved
      const unOrderedCart = cartItems.filter((i) => !savedSkus.includes(i.sku));
      setCartItems(unOrderedCart);
    }
    setIsCartModalOpen(true);
  };

  const handleQtyChange = (id: string, delta: number) => {
    setCartItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const newQty = Math.max(1, item.qty + delta);
          return { ...item, qty: newQty };
        }
        return item;
      })
    );
  };

  const handleSetQtyDirect = (id: string, value: string) => {
    const parsed = parseInt(value, 10);
    const newQty = isNaN(parsed) || parsed < 1 ? 1 : parsed;
    setCartItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, qty: newQty } : item))
    );
  };

  const handleRemoveCartItem = (id: string) => {
    const itemToRemove = cartItems.find((i) => i.id === id);
    if (itemToRemove) {
      setPendingPoSkus((prev) => prev.filter((sku) => sku !== itemToRemove.sku));
    }
    setCartItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleAddMoreItems = () => {
    const existingSkus = new Set([...cartItems.map((i) => i.sku), ...savedSkus]);
    const nextItem = recommendationsList.find((r: any) => !existingSkus.has(r.sku) && r.tabCategory !== "Ordered");
    if (nextItem) {
      setCartItems((prev) => [
        ...prev,
        {
          id: nextItem.id,
          name: nextItem.name,
          sku: nextItem.sku,
          qty: nextItem.recommendedQtyNum || 50,
          unitCost: nextItem.unitCost || (nextItem.estOrderValue && nextItem.recommendedQtyNum ? Math.round(nextItem.estOrderValue / nextItem.recommendedQtyNum) : 150),
          supplierName: nextItem.supplierName,
          icon: "📦",
        },
      ]);
    }
  };

  const totalCartItemsCount = cartItems.length;
  const totalCartUnitsCount = cartItems.reduce((acc, i) => acc + (i.qty || 0), 0);
  const totalCartCost = cartItems.reduce((acc, i) => acc + (i.qty || 0) * (i.unitCost || 0), 0);

  const suppliers = Array.from(
    new Set(recommendationsList.map((i: any) => i.supplierName).filter(Boolean))
  );
  const categories = Array.from(
    new Set(recommendationsList.map((i: any) => i.category).filter(Boolean))
  );

  const sampleQuestions = [
    "Which products are at risk of stock out?",
    "What should I reorder today?",
    "Show me top slow moving items",
    "What's my forecast for next week?",
    "Summarize inventory health",
  ];

  // Filtering recommendations list
  const filteredList = recommendationsList.filter((item: any) => {
    const searchLower = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !searchLower ||
      item.name.toLowerCase().includes(searchLower) ||
      item.sku.toLowerCase().includes(searchLower);

    const matchesStatus =
      statusFilter === "All" || item.status.toLowerCase() === statusFilter.toLowerCase();

    const matchesSupplier =
      supplierFilter === "All" ||
      item.supplierName.toLowerCase() === supplierFilter.toLowerCase();

    const matchesCategory =
      categoryFilter === "All" ||
      item.category.toLowerCase() === categoryFilter.toLowerCase();

    let matchesTab = true;
    const isOrderedItem = savedSkus.includes(item.sku) || item.tabCategory === "Ordered";

    if (activeTab.startsWith("At Risk")) {
      matchesTab = (item.status === "At risk" || item.tabCategory === "At Risk") && !isOrderedItem;
    } else if (activeTab.startsWith("New")) {
      matchesTab = (item.tabCategory === "New" || item.status === "Low stock") && !isOrderedItem;
    } else if (activeTab.startsWith("Reviewed")) {
      matchesTab = (item.tabCategory === "Reviewed" || item.status === "In stock") && !isOrderedItem;
    } else if (activeTab.startsWith("Ordered")) {
      matchesTab = isOrderedItem;
    }

    return (
      matchesSearch &&
      matchesStatus &&
      matchesSupplier &&
      matchesCategory &&
      matchesTab
    );
  });

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  const totalPages = Math.max(1, Math.ceil(filteredList.length / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (validCurrentPage - 1) * pageSize;
  const endIndex = Math.min(filteredList.length, startIndex + pageSize);
  const paginatedList = filteredList.slice(startIndex, endIndex);

  // Generate dynamic page numbers array
  const pageNumbers: Array<number | string> = [];
  if (totalPages <= 5) {
    for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);
  } else {
    pageNumbers.push(1);
    if (validCurrentPage > 3) pageNumbers.push("...");
    const start = Math.max(2, validCurrentPage - 1);
    const end = Math.min(totalPages - 1, validCurrentPage + 1);
    for (let i = start; i <= end; i++) pageNumbers.push(i);
    if (validCurrentPage < totalPages - 2) pageNumbers.push("...");
    pageNumbers.push(totalPages);
  }

  // Calculate total review order value for cart items, checked items, or pending review items
  const isNotOrdered = (r: any) => !savedSkus.includes(r.sku) && r.tabCategory !== "Ordered";
  const pendingReviewItems = recommendationsList.filter(
    (r: any) => isNotOrdered(r) && (r.recommendedQtyNum > 0 || r.status === "At risk" || r.status === "Low stock")
  );
  const defaultReviewAmount = pendingReviewItems.reduce((acc: number, r: any) => acc + (r.estOrderValue || 0), 0);

  const checkedItems = filteredList.filter((i: any) => selectedRows.includes(i.id));
  const checkedOrderValue = checkedItems.reduce((acc: number, i: any) => acc + (i.estOrderValue || 0), 0);

  const displayReviewAmount = cartItems.length > 0
    ? totalCartCost
    : selectedRows.length > 0
    ? checkedOrderValue
    : 0;

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedRows(filteredList.map((item: any) => item.id));
    } else {
      setSelectedRows([]);
    }
  };

  const handleToggleRow = (id: string) => {
    setSelectedRows((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleAskQuestion = (qText: string) => {
    if (!qText.trim()) return;
    const newMsgs = [...chatMessages, { sender: "user" as const, text: qText }];
    setChatMessages(newMsgs);
    setChatInput("");
    setIsAsking(true);

    setTimeout(() => {
      let reply = "Based on sales velocity, iPhone 15 Pro Case & 20W USB-C Charger are at risk of stockout within 5 days. We recommend creating a Purchase Order for MobileMart & ElectroHub today.";
      if (qText.toLowerCase().includes("reorder")) {
        reply = `You have ${metrics.itemsToReorder} items recommended for reorder with a total estimated order value of ${formatCurrency(metrics.estOrderValue, shop?.currency)}.`;
      } else if (qText.toLowerCase().includes("risk")) {
        reply = `${metrics.atRiskCount} products are at risk of stockout within the next 7 days. Reordering today will prevent revenue loss.`;
      } else if (qText.toLowerCase().includes("forecast")) {
        reply = "Total forecasted demand across your inventory is ~3,550 units over the next 14 days.";
      }
      setChatMessages([...newMsgs, { sender: "ai" as const, text: reply }]);
      setIsAsking(false);
    }, 700);
  };

  return (
    <div className="min-h-screen bg-[#f1f1f1] text-slate-900 font-sans p-4 md:p-8">
      <div className="max-w-[1600px] mx-auto space-y-6">

        {/* TOP HEADER BAR */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-purple-100/80 text-purple-600 flex items-center justify-center shrink-0 border border-purple-200/60 shadow-2xs">
              <ShoppingCart className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
                Reorder recommendations
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Smart suggestions to help you reorder the right products, in the right quantity, at the right time.
              </p>
            </div>
          </div>

          {/* <div className="flex items-center gap-3">
            <button className="bg-white border border-slate-200 text-slate-700 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 hover:bg-slate-50 transition-all cursor-pointer shadow-2xs">
              <Calendar className="w-4 h-4 text-purple-600" />
              <span>{dateRangeStr}</span>
              <span className="text-slate-400">∨</span>
            </button>
          </div> */}
        </div>

        {/* 4 TOP SUMMARY METRIC CARDS GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Items to reorder */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                  <Calendar className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-semibold text-slate-600">Items to reorder</span>
              </div>
              <MetricTooltip
                title="Items to Reorder"
                formula="Count(SKUs with Inv Pos ≤ ROP)"
                explanation="Number of product SKUs whose inventory position (Current Stock + Incoming POs) has dipped to or below their Reorder Point."
                align="left"
              />
            </div>
            <div className="mt-3">
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                {metrics.itemsToReorder}
              </h2>
              <p className="text-xs text-slate-400 mt-1">Across {metrics.skusCount} SKUs</p>
            </div>
          </div>

          {/* Card 2: At risk of stockout */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-semibold text-slate-600">At risk of stockout</span>
              </div>
              <MetricTooltip
                title="At Risk of Stockout"
                formula="Count(SKUs with Coverage ≤ 7d)"
                explanation="Products expected to run completely out of stock within the next 7 days based on daily sales velocity."
                align="left"
              />
            </div>
            <div className="mt-3">
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                {metrics.atRiskCount}
              </h2>
              <p className="text-xs text-slate-400 mt-1">Within next 7 days</p>
            </div>
          </div>

          {/* Card 3: Total recommended qty. */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <Clock className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-semibold text-slate-600">Total recommended qty.</span>
              </div>
              <MetricTooltip
                title="Total Recommended Qty"
                formula="Sum(Target Stock - Inv Pos)"
                explanation="Total quantity of units recommended for purchase across all reorder-triggered SKUs to cover lead time and your planning horizon."
                align="right"
              />
            </div>
            <div className="mt-3">
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                {metrics.totalRecommendedQty.toLocaleString("en-IN")}
              </h2>
              <p className="text-xs text-slate-400 mt-1">Units</p>
            </div>
          </div>

          {/* Card 4: Est. order value */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 font-bold text-base">
                  {getCurrencySymbol(shop?.currency)}
                </div>
                <span className="text-xs font-semibold text-slate-600">Est. order value</span>
              </div>
              <MetricTooltip
                title="Est. Order Value"
                formula="Sum(Recommended Qty × Unit Cost)"
                explanation="Estimated total cost of generating draft Purchase Orders for all recommended reorder quantities."
                align="right"
              />
            </div>
            <div className="mt-3">
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                {formatCurrency(metrics.estOrderValue, shop?.currency)}
              </h2>
              <p className="text-xs text-slate-400 mt-1">Excluding taxes</p>
            </div>
          </div>
        </div>

        {/* SEARCH & FILTERS BAR */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <div className="relative flex-1 min-w-[240px] max-w-[320px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by product or SKU"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
              />
            </div>

            {/* Status Dropdown */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white border border-slate-200 text-slate-700 px-3 py-2 rounded-xl text-xs font-medium focus:outline-none cursor-pointer hover:border-slate-300"
            >
              <option value="All">Status: All </option>
              <option value="At risk">At risk</option>
              <option value="Low stock">Low stock</option>
              <option value="In stock">In stock</option>
            </select>

            {/* Supplier Dropdown */}
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="bg-white border border-slate-200 text-slate-700 px-3 py-2 rounded-xl text-xs font-medium focus:outline-none cursor-pointer hover:border-slate-300"
            >
              <option value="All">Supplier: All </option>
              {suppliers.map((sup: any, idx) => (
                <option key={idx} value={sup}>
                  {sup}
                </option>
              ))}
            </select>

            {/* Category Dropdown */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-white border border-slate-200 text-slate-700 px-3 py-2 rounded-xl text-xs font-medium focus:outline-none cursor-pointer hover:border-slate-300"
            >
              <option value="All">Category: All </option>
              {categories.map((cat: any, idx) => (
                <option key={idx} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            {/* <button className="bg-white border border-slate-200 text-slate-700 px-3 py-2 rounded-xl text-xs font-medium hover:bg-slate-50 transition-all flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
              <span>Filters </span>
            </button> */}
          </div>
        </div>

        {/* TABS + REVIEW ORDER ACTION ROW */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 pb-1">
          <div className="flex items-center gap-6 overflow-x-auto text-xs font-bold text-slate-500">
            {(() => {
              const allCount = recommendationsList.length;
              const orderedCount = recommendationsList.filter((r: any) => savedSkus.includes(r.sku) || r.tabCategory === "Ordered").length;
              const atRiskCount = recommendationsList.filter((r: any) => (r.status === "At risk" || r.tabCategory === "At Risk") && !savedSkus.includes(r.sku)).length;
              const newCount = recommendationsList.filter((r: any) => (r.status === "Low stock" || r.tabCategory === "New") && !savedSkus.includes(r.sku) && r.tabCategory !== "Ordered").length;
              const reviewedCount = recommendationsList.filter((r: any) => (r.status === "In stock" || r.tabCategory === "Reviewed") && !savedSkus.includes(r.sku)).length;

              const tabsList = [
                { name: `All Recommendations (${allCount})`, key: "All Recommendations" },
                { name: `At Risk (${atRiskCount})`, key: "At Risk" },
                { name: `New (${newCount})`, key: "New" },
                { name: `Reviewed (${reviewedCount})`, key: "Reviewed" },
                { name: `Ordered (${orderedCount})`, key: "Ordered" },
              ];

              return tabsList.map((t) => {
                const isActive = activeTab === t.name || activeTab.startsWith(t.key);
                return (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.name)}
                    className={`pb-3 transition-all cursor-pointer whitespace-nowrap ${isActive
                      ? "text-purple-600 border-b-2 border-purple-600 font-extrabold"
                      : "hover:text-slate-800"
                      }`}
                  >
                    {t.name}
                  </button>
                );
              });
            })()}
          </div>

          <div className="flex items-center gap-3 self-end sm:self-auto mb-2">
            <div className="bg-white border border-slate-200 text-slate-700 px-3 py-2 rounded-xl text-xs font-medium shadow-2xs">
              Review Amount <span className="font-bold text-slate-900 ml-1">{formatCurrency(displayReviewAmount, shop?.currency)}</span>
            </div>
            <button
              onClick={handleOpenCartModal}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Review Order ({cartItems.length || selectedRows.length || 0})</span>
            </button>
          </div>
        </div>

        {/* TABLE + SIDEBAR CONTAINER */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

          {/* TABLE CONTAINER (SPAN 8 or 12) */}
          <div className={`space-y-4 ${showAiDrawer ? "lg:col-span-8" : "lg:col-span-12"} transition-all duration-300`}>
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50/50">
                      {/* <th className="py-3.5 px-4 w-10">
                        <input
                          type="checkbox"
                          onChange={handleSelectAll}
                          checked={selectedRows.length === filteredList.length && filteredList.length > 0}
                          className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                        />
                      </th> */}
                      <th className="py-3.5 px-4 font-semibold">Product / SKU</th>
                      <th className="py-3.5 px-4 font-semibold">Supplier</th>
                      <th className="py-3.5 px-4 font-semibold text-center">Status</th>
                      <th className="py-3.5 px-4 font-semibold text-center flex items-center justify-center gap-1">
                        <span>Days of Stock</span>
                        <Info className="w-3 h-3 text-slate-400" />
                      </th>
                      <th className="py-3.5 px-4 font-semibold text-center">Recommended Qty.</th>
                      <th className="py-3.5 px-4 font-semibold text-right">Est. Order Value</th>
                      <th className="py-3.5 px-4 font-semibold text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {paginatedList.map((item: any) => {
                      const isSelected = selectedRows.includes(item.id);
                      return (
                        <tr
                          key={item.id}
                          className={`hover:bg-slate-50/80 transition-colors ${isSelected ? "bg-purple-50/30" : ""
                            }`}
                        >
                          {/* <td className="py-3.5 px-4">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleRow(item.id)}
                              className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                            />
                          </td> */}

                          {/* Product / SKU */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              {/* <div className="w-9 h-9 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center shrink-0 text-base shadow-2xs">
                                📦
                              </div> */}
                              <div>
                                <div className="font-bold text-slate-900">{item.name}</div>
                                <div className="text-[10px] font-medium text-slate-400">{item.sku}</div>
                              </div>
                            </div>
                          </td>

                          {/* Supplier */}
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-800">{item.supplierName}</div>
                            {item.isPreferred && (
                              <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold bg-purple-50 text-purple-600 rounded border border-purple-100 mt-0.5">
                                Preferred
                              </span>
                            )}
                          </td>

                          {/* Status Badge */}
                          <td className="py-3.5 px-4 text-center">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border ${item.statusColor}`}
                            >
                              {item.status}
                            </span>
                          </td>

                          {/* Days of Stock */}
                          <td className="py-3.5 px-4 text-center">
                            <span className={item.daysColor}>{item.daysOfStock}</span>
                          </td>

                          {/* Recommended Qty. */}
                          <td className="py-3.5 px-4 text-center font-extrabold text-slate-900">
                            {item.recommendedQty}
                          </td>

                          {/* Est. Order Value */}
                          <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                            {formatCurrency(item.estOrderValue, shop?.currency)}
                          </td>

                          {/* Action Button */}
                          <td className="py-3.5 px-4 text-center">
                            {(() => {
                              const isAlreadySaved = savedSkus.includes(item.sku);
                              const isPendingInCart = pendingPoSkus.includes(item.sku);
                              const isRowSaving = submittingItemId === item.id && poFetcher.state === "submitting";

                              if (isAlreadySaved) {
                                return (
                                  <button
                                    disabled
                                    className="bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-xs w-[96px] h-8 rounded-xl shadow-2xs transition-all flex items-center justify-center gap-1 mx-auto cursor-not-allowed opacity-90"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Ordered</span>
                                  </button>
                                );
                              }

                              if (isPendingInCart) {
                                return (
                                  <button
                                    onClick={handleOpenCartModal}
                                    className="bg-purple-50 border border-purple-200 text-purple-700 font-bold text-xs w-[96px] h-8 rounded-xl shadow-2xs transition-all flex items-center justify-center gap-1 mx-auto cursor-pointer hover:bg-purple-100"
                                  >
                                    <ShoppingCart className="w-3.5 h-3.5 text-purple-600" />
                                    <span>In Review</span>
                                  </button>
                                );
                              }

                              return (
                                <button
                                  onClick={() => handleDirectAddPo(item)}
                                  disabled={isRowSaving}
                                  className={`w-[96px] h-8 rounded-xl font-bold text-xs shadow-2xs transition-all flex items-center justify-center gap-1 mx-auto ${isRowSaving
                                    ? "bg-purple-50 border border-purple-200 text-purple-700 cursor-not-allowed opacity-80"
                                    : "bg-white border border-purple-200 text-purple-700 hover:bg-purple-50 cursor-pointer active:scale-95"
                                    }`}
                                >
                                  {isRowSaving ? (
                                    <span className="flex items-center gap-1">
                                      <span className="w-3 h-3 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></span>
                                      <span>Saving...</span>
                                    </span>
                                  ) : (
                                    <>
                                      <span>Add PO</span>
                                      <Plus className="w-3 h-3 text-purple-500" />
                                    </>
                                  )}
                                </button>
                              );
                            })()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* DYNAMIC INTERACTIVE PAGINATION FOOTER */}
              <div className="px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white">
                <div className="text-xs font-medium text-slate-500">
                  Showing {filteredList.length > 0 ? startIndex + 1 : 0} to {endIndex} of {filteredList.length} results
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    disabled={validCurrentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  {pageNumbers.map((p, idx) =>
                    typeof p === "number" ? (
                      <button
                        key={idx}
                        onClick={() => setCurrentPage(p)}
                        className={`w-8 h-8 rounded-lg text-xs font-bold flex items-center justify-center cursor-pointer transition-all ${validCurrentPage === p
                          ? "border-2 border-purple-600 bg-purple-50 text-purple-700 font-extrabold"
                          : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                          }`}
                      >
                        {p}
                      </button>
                    ) : (
                      <span key={idx} className="text-xs text-slate-400 px-1 select-none">
                        ...
                      </span>
                    )
                  )}

                  <button
                    disabled={validCurrentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT SIDEBAR (3 VERTICAL CARDS / AI DRAWER) */}
          <div className="lg:col-span-4 space-y-4">

            {/* CARD 1: What do these mean? */}
            {/* <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-3">
              <h3 className="text-sm font-extrabold text-slate-900">What do these mean?</h3>
              <div className="space-y-3 text-xs">
                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 mt-0.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 block">At risk</span>
                    <span className="text-slate-500">Stock may run out within 7 days based on sales velocity.</span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 block">Low stock</span>
                    <span className="text-slate-500">Stock is low but expected to last more than 7 days.</span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 block">In stock</span>
                    <span className="text-slate-500">Good stock level.</span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 block">Days of Stock</span>
                    <span className="text-slate-500">How many days your current stock will last based on recent sales.</span>
                  </div>
                </div>
              </div>
            </div> */}

            {/* CARD 2: Tips */}
            {/* <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-2.5">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                <span>Tips</span>
              </h3>
              <ul className="space-y-2 text-xs text-slate-600 list-disc pl-4 leading-relaxed">
                <li>Review recommendations weekly.</li>
                <li>Adjust safety stock and lead time in Settings for better accuracy.</li>
                <li>Create Purchase Order and send to your supplier.</li>
              </ul>
            </div> */}

            {/* CARD 3: Ask StockPilot AI Drawer */}
            {/* {showAiDrawer && (
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <h3 className="text-sm font-extrabold text-slate-900">Ask StockPilot AI</h3>
                  </div>
                  <button
                    onClick={() => setShowAiDrawer(false)}
                    className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-xs text-slate-500 leading-snug">
                  Get answers and insights about your inventory in seconds.
                </p>

                <div className="space-y-2">
                  {sampleQuestions.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleAskQuestion(q)}
                      className="w-full text-left p-3 rounded-xl border border-purple-100/80 bg-purple-50/40 hover:bg-purple-50 hover:border-purple-200 text-xs font-semibold text-purple-900 transition-all flex items-center justify-between group"
                    >
                      <span>{q}</span>
                      <Sparkles className="w-3.5 h-3.5 text-purple-400 group-hover:text-purple-600 transition-colors shrink-0 ml-2" />
                    </button>
                  ))}
                </div>

                {chatMessages.length > 0 && (
                  <div className="max-h-48 overflow-y-auto space-y-2 p-2 bg-slate-50 rounded-xl border border-slate-100">
                    {chatMessages.map((m, i) => (
                      <div
                        key={i}
                        className={`text-xs p-2.5 rounded-lg ${m.sender === "user"
                          ? "bg-purple-600 text-white self-end ml-4"
                          : "bg-white border border-slate-200 text-slate-800 mr-4"
                          }`}
                      >
                        {m.text}
                      </div>
                    ))}
                    {isAsking && (
                      <div className="text-xs text-slate-400 italic p-1 animate-pulse">
                        AI thinking...
                      </div>
                    )}
                  </div>
                )}

                <div className="relative pt-2">
                  <input
                    type="text"
                    placeholder="Ask a question..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAskQuestion(chatInput)}
                    className="w-full pl-3 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                  />
                  <button
                    onClick={() => handleAskQuestion(chatInput)}
                    className="absolute right-2 top-[14px] w-6 h-6 rounded-lg bg-purple-600 text-white flex items-center justify-center hover:bg-purple-700 transition-all shadow-2xs"
                  >
                    <Send className="w-3 h-3" />
                  </button>
                </div>

                <p className="text-[10px] text-slate-400 text-center">
                  AI responses may not always be accurate.
                </p>
              </div>
            )} */}
            <div className="lg:col-span-4 h-full">
                 <StockPilotAiChatCard metrics={metrics} />
            </div>
          </div>
        </div>
      </div>

      {!showAiDrawer && (
        <button
          onClick={() => setShowAiDrawer(true)}
          className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-purple-600 text-white flex items-center justify-center shadow-lg hover:bg-purple-700 hover:scale-105 transition-all z-50 cursor-pointer"
        >
          <Sparkles className="w-6 h-6" />
        </button>
      )}

      {/* TOAST SUCCESS BANNER */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom duration-300">
          <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-semibold">{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white p-1 rounded-lg ml-2"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}



      {/* PURCHASE CART MODAL DIALOG (MATCHING SCREENSHOT) */}
      {isCartModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-5xl w-full overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[92vh]">

            {/* MODAL HEADER */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-white">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-purple-100/80 text-purple-600 flex items-center justify-center shrink-0 border border-purple-200/60 shadow-2xs">
                  <ShoppingCart className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">
                    Purchase Cart ({totalCartItemsCount} items)
                  </h2>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Review selected items, choose supplier and create purchase order.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsCartModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* MODAL BODY (GRID: LEFT TABLE 7 COLS / RIGHT SUMMARY 5 COLS) */}
            <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 bg-slate-50/40">

              {/* LEFT SIDE: ITEMS TABLE & CONTROLS */}
              <div className="lg:col-span-7 space-y-4">
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/60">
                          <th className="py-3 px-4 font-semibold">Product</th>
                          <th className="py-3 px-4 font-semibold text-center">Qty</th>
                          <th className="py-3 px-4 font-semibold text-right">Unit Cost</th>
                          <th className="py-3 px-4 font-semibold text-right">Total</th>
                          <th className="py-3 px-4 w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {cartItems.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-slate-400">
                              No items in cart. Click "+ Add more items" below.
                            </td>
                          </tr>
                        ) : (
                          cartItems.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                              {/* Product Thumbnail + SKU */}
                              <td className="py-3.5 px-4">
                                <div className="flex items-center gap-3">
                                  {/* <div className="w-9 h-9 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center shrink-0 text-base shadow-2xs">
                                    {item.icon || "📦"}
                                  </div> */}
                                  <div>
                                    <div className="font-bold text-slate-900">{item.name}</div>
                                    <div className="text-[10px] font-medium text-slate-400">{item.sku}</div>
                                  </div>
                                </div>
                              </td>

                              {/* Quantity controls (- qty +) */}
                              <td className="py-3.5 px-4 text-center">
                                <div className="flex items-center justify-center gap-1 border border-slate-200 rounded-xl p-0.5 bg-white max-w-[110px] mx-auto shadow-2xs">
                                  <button
                                    type="button"
                                    onClick={() => handleQtyChange(item.id, -10)}
                                    className="w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 flex items-center justify-center cursor-pointer transition-colors"
                                  >
                                    <Minus className="w-3.5 h-3.5" />
                                  </button>
                                  <input
                                    type="number"
                                    value={item.qty}
                                    onChange={(e) => handleSetQtyDirect(item.id, e.target.value)}
                                    className="w-12 text-center text-xs font-bold text-slate-900 focus:outline-none bg-transparent"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleQtyChange(item.id, 10)}
                                    className="w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 flex items-center justify-center cursor-pointer transition-colors"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>

                              {/* Unit Cost */}
                              <td className="py-3.5 px-4 text-right font-medium text-slate-600">
                                {formatCurrency(item.unitCost, shop?.currency)}
                              </td>

                              {/* Total */}
                              <td className="py-3.5 px-4 text-right font-extrabold text-slate-900">
                                {formatCurrency(item.qty * item.unitCost, shop?.currency)}
                              </td>

                              {/* Delete button */}
                              <td className="py-3.5 px-4 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveCartItem(item.id)}
                                  className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-all cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ADD MORE ITEMS BUTTON */}
                <button
                  type="button"
                  onClick={handleAddMoreItems}
                  className="text-purple-600 hover:text-purple-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer py-1 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add more items</span>
                </button>

                {/* LIGHT PURPLE INFO BANNER */}
                <div className="bg-purple-50/60 border border-purple-100/80 rounded-2xl p-4 text-xs text-purple-900 font-semibold flex items-center gap-2.5 shadow-2xs">
                  <Lightbulb className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>Quantities are editable. You can update before creating the purchase order.</span>
                </div>
              </div>

              {/* RIGHT SIDE: ORDER SUMMARY & SUPPLIER FORM */}
              <div className="lg:col-span-5 space-y-4">

                {/* ORDER SUMMARY CONTAINER */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs space-y-4">
                  <h3 className="text-sm font-extrabold text-slate-900">Order Summary</h3>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Total Items</span>
                      <span className="font-bold text-slate-900">{totalCartItemsCount}</span>
                    </div>

                    <div className="flex items-center justify-between text-slate-600">
                      <span>Total Units</span>
                      <span className="font-bold text-slate-900">{totalCartUnitsCount.toLocaleString("en-IN")}</span>
                    </div>

                    <div className="border-t border-slate-100 pt-3 flex items-baseline justify-between">
                      <div>
                        <span className="font-extrabold text-slate-900 text-xs block">Estimated Total Cost</span>
                        <span className="text-[10px] text-slate-400">Excluding taxes</span>
                      </div>
                      <span className="text-xl font-black text-slate-900 tracking-tight">
                        {formatCurrency(totalCartCost, shop?.currency)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* FORM CONTROLS (SUPPLIER / DELIVERY DATE / NOTES) */}
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-800 mb-1">
                      Supplier <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={cartSupplier}
                      onChange={(e) => setCartSupplier(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 cursor-pointer shadow-2xs"
                    >
                      <option value="Select supplier">Select supplier ∨</option>
                      {suppliers.map((sup: any, idx) => (
                        <option key={idx} value={sup}>
                          {sup}
                        </option>
                      ))}
                      <option value="MobileMart">MobileMart</option>
                      <option value="ElectroHub">ElectroHub</option>
                      <option value="FashionHub">FashionHub</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-800 mb-1">
                      Expected Delivery Date <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="date"
                        value={cartDeliveryDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]}
                        onChange={(e) => setCartDeliveryDate(e.target.value)}
                        className="w-full pl-3.5 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 shadow-2xs"
                      />
                      <Calendar className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-800 mb-1">
                      Notes (Optional)
                    </label>
                    <textarea
                      rows={3}
                      maxLength={250}
                      value={cartNotes}
                      onChange={(e) => setCartNotes(e.target.value)}
                      placeholder="Add notes for supplier..."
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 shadow-2xs"
                    ></textarea>
                    <div className="text-[10px] text-slate-400 text-right mt-0.5">
                      {cartNotes.length}/250
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* MODAL FOOTER */}
            <div className="px-6 py-4 border-t border-slate-100 bg-white flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => setIsCartModalOpen(false)}
                className="bg-white border border-slate-200 text-slate-700 font-bold text-xs px-5 py-2.5 rounded-xl hover:bg-slate-50 transition-all cursor-pointer flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4 text-slate-500" />
                <span>Continue Selecting</span>
              </button>

              <button
                type="button"
                disabled={poFetcher.state === "submitting" || cartItems.length === 0}
                onClick={() => {
                  poFetcher.submit(
                    {
                      intent: "create_bulk_po",
                      supplierCode: cartSupplier === "Select supplier" ? "MobileMart" : cartSupplier,
                      expectedDeliveryDate: cartDeliveryDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
                      notes: cartNotes,
                      itemsJson: JSON.stringify(cartItems),
                    },
                    { method: "post" }
                  );
                }}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50 active:scale-95"
              >
                {poFetcher.state === "submitting" ? (
                  <span>Creating PO...</span>
                ) : (
                  <>
                    <FileText className="w-4 h-4" />
                    <span>Create Purchase Order</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUCCESS PURCHASE ORDER CREATED MODAL (MATCHING EXACT USER SCREENSHOT) */}
      {isSuccessModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-xl w-full p-8 relative overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* CLOSE BUTTON */}
            <button
              type="button"
              onClick={() => setIsSuccessModalOpen(false)}
              className="absolute right-6 top-6 text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* GREEN CHECK ICON & CONFETTI HEADER */}
            <div className="text-center mb-6">
              <div className="relative inline-flex items-center justify-center">
                {/* Decorative confetti dots */}
                <span className="absolute -top-2 -left-4 w-2 h-2 rounded-full bg-amber-400"></span>
                <span className="absolute top-1 right-8 w-2 h-2 rounded-full bg-purple-400"></span>
                <span className="absolute -bottom-1 -right-4 w-2.5 h-2.5 rounded-full bg-rose-400"></span>
                <span className="absolute bottom-2 -left-6 w-2 h-2 rounded-full bg-blue-400"></span>

                <div className="w-20 h-20 rounded-full bg-emerald-100/90 text-emerald-600 flex items-center justify-center border border-emerald-200/60 shadow-xs">
                  <Check className="w-10 h-10 stroke-[3]" />
                </div>
              </div>

              <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight mt-4">
                Purchase Order Created!
              </h2>
              <p className="text-xs text-slate-500 font-medium max-w-md mx-auto mt-2 leading-relaxed">
                Your purchase order has been created successfully and is ready to be sent to your supplier.
              </p>
            </div>

            {/* DETAILS CONTAINER CARD */}
            <div className="bg-slate-50/60 rounded-2xl border border-slate-200/80 p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* PO Number */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-100/80 text-purple-600 flex items-center justify-center shrink-0 border border-purple-200/60">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-slate-500">Purchase Order No.</div>
                    <div className="text-xs md:text-sm font-extrabold text-slate-900 tracking-tight">
                      {successModalData.poNumber}
                    </div>
                  </div>
                </div>

                {/* Expected Delivery */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100/80 text-amber-600 flex items-center justify-center shrink-0 border border-amber-200/60">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-slate-500">Expected Delivery</div>
                    <div className="text-xs md:text-sm font-extrabold text-slate-900">
                      {successModalData.expectedDeliveryDate}
                    </div>
                  </div>
                </div>

                {/* Supplier */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100/80 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200/60">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-slate-500">Supplier</div>
                    <div className="text-xs md:text-sm font-extrabold text-slate-900">
                      {successModalData.supplierName}
                    </div>
                  </div>
                </div>

                {/* Total Units */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100/80 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200/60">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-slate-500">Total Units</div>
                    <div className="text-xs md:text-sm font-extrabold text-slate-900">
                      {successModalData.totalUnits.toLocaleString("en-IN")} Units
                    </div>
                  </div>
                </div>

                {/* Total Items */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100/80 text-blue-600 flex items-center justify-center shrink-0 border border-blue-200/60">
                    <Package className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-slate-500">Total Items</div>
                    <div className="text-xs md:text-sm font-extrabold text-slate-900">
                      {successModalData.totalItems} Items
                    </div>
                  </div>
                </div>

                {/* Estimated Total Cost */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-100/80 text-rose-600 flex items-center justify-center shrink-0 border border-rose-200/60 font-bold text-lg">
                    {getCurrencySymbol(shop?.currency)}
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-slate-500">Estimated Total Cost</div>
                    <div className="text-xs md:text-sm font-extrabold text-slate-900">
                      {formatCurrency(successModalData.totalCost, shop?.currency)}
                    </div>
                    <span className="text-[10px] text-slate-400 block -mt-0.5">Excluding taxes</span>
                  </div>
                </div>
              </div>

              {/* Bottom Info Row */}
              <div className="border-t border-slate-200/70 pt-3 flex items-center justify-center gap-2 text-xs font-semibold text-slate-600 text-center">
                <Info className="w-4 h-4 text-slate-400 shrink-0" />
                <span>The selected items have been moved to the "Ordered" tab.</span>
              </div>
            </div>

            {/* ACTION BUTTONS FOOTER */}
            <div className="flex flex-col sm:flex-row items-center gap-3 justify-between mt-6">
              <button
                type="button"
                onClick={handleDownloadPoPdf}
                className="w-full sm:w-auto bg-white border border-slate-200 text-slate-700 font-bold text-xs px-4 py-2.5 rounded-xl hover:bg-slate-50 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
              >
                <FileText className="w-4 h-4 text-slate-500" />
                <span>Download PO (PDF)</span>
              </button>

              <button
                type="button"
                onClick={handleEmailSupplier}
                className="w-full sm:w-auto bg-white border border-slate-200 text-slate-700 font-bold text-xs px-4 py-2.5 rounded-xl hover:bg-slate-50 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
              >
                <Mail className="w-4 h-4 text-slate-500" />
                <span>Email to Supplier</span>
              </button>

              <button
                type="button"
                onClick={() => setIsSuccessModalOpen(false)}
                className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <span>Back to Reorder</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
