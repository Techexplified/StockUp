import { useEffect, useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureShopData, pushProductUpdateToShopify, pushProductDeleteToShopify } from "../db.server";
import prisma from "../db.server";
import {
  ShoppingBag,
  Package,
  AlertTriangle,
  XCircle,
  Clock,
  Sparkles,
  Search,
  SlidersHorizontal,
  Download,
  Settings,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Calendar,
  X,
  Send,
  DollarSign,
  Tag,
  Info,
  Edit,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { StockPilotAiChatCard } from "../components/StockPilotAiChatCard";
import { formatCurrency, getCurrencySymbol } from "../utils/currency";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, shop } = await ensureShopData(request, authenticate);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "UPDATE_PRODUCT") {
    const id = formData.get("id") as string;
    const productName = formData.get("productName") as string;
    const sku = formData.get("sku") as string;
    const variantName = formData.get("variantName") as string;
    const category = formData.get("category") as string;
    const currentStock = parseInt((formData.get("currentStock") as string) || "0", 10);
    const unitCost = parseFloat((formData.get("unitCost") as string) || "0");
    const sellingPrice = parseFloat((formData.get("sellingPrice") as string) || "0");
    const reorderPoint = parseInt((formData.get("reorderPoint") as string) || "0", 10);
    const safetyStock = parseInt((formData.get("safetyStock") as string) || "0", 10);

    try {
      if (id && id.length > 5 && !id.startsWith("fallback")) {
        await prisma.product.update({
          where: { id },
          data: {
            productName,
            sku,
            variantName,
            category,
            currentStock,
            unitCost,
            sellingPrice,
            reorderPoint,
            safetyStock,
          },
        });
      } else if (sku) {
        const existing = await prisma.product.findFirst({ where: { sku } });
        if (existing) {
          await prisma.product.update({
            where: { id: existing.id },
            data: {
              productName,
              variantName,
              category,
              currentStock,
              unitCost,
              sellingPrice,
              reorderPoint,
              safetyStock,
            },
          });
        }
      }

      // Automatically push product edits to connected Shopify store (only when connectedToShopify = true)
      if (sku || productName) {
        await pushProductUpdateToShopify(admin, shop.shopDomain, {
          sku,
          productName,
          variantName,
          category,
          sellingPrice,
          currentStock,
          unitCost,
        });
      }

      return { success: true, actionType: "UPDATE", message: "Product updated in database & Shopify store successfully." };
    } catch (err: any) {
      console.error("Error updating product:", err);
      return { success: false, actionType: "UPDATE", error: err.message || "Failed to update product." };
    }
  }

  if (intent === "DELETE_PRODUCT") {
    const id = formData.get("id") as string;
    const sku = formData.get("sku") as string;

    try {
      let targetSku = sku;
      if (!targetSku && id && id.length > 5 && !id.startsWith("fallback")) {
        const prod = await prisma.product.findUnique({ where: { id } });
        if (prod) targetSku = prod.sku;
      }

      // Automatically push product deletion to connected Shopify store (only when connectedToShopify = true)
      if (targetSku) {
        await pushProductDeleteToShopify(admin, shop.shopDomain, targetSku);
      }

      if (id && id.length > 5 && !id.startsWith("fallback")) {
        await prisma.product.deleteMany({ where: { id } });
      } else if (targetSku) {
        await prisma.product.deleteMany({ where: { sku: targetSku } });
      }
      return { success: true, actionType: "DELETE", message: "Product deleted from database & Shopify store successfully." };
    } catch (err: any) {
      console.error("Error deleting product:", err);
      return { success: false, error: err.message || "Failed to delete product." };
    }
  }

  if (intent === "SYNC_SHOPIFY") {
    const { admin, session } = await authenticate.admin(request);
    try {
      const { syncShopifyDataToDb } = await import("../db.server");
      const result = await syncShopifyDataToDb(admin, session.shop);
      if (result.success) {
        return {
          success: true,
          actionType: "SYNC_SHOPIFY",
          message: `Successfully synced ${result.count || 0} product(s) from Shopify!`,
        };
      } else {
        return {
          success: false,
          actionType: "SYNC_SHOPIFY",
          error: typeof result.error === "string" ? result.error : "Failed to sync Shopify store.",
        };
      }
    } catch (err: any) {
      return { success: false, actionType: "SYNC_SHOPIFY", error: err.message || "Sync failed." };
    }
  }

  return { success: false, error: "Invalid action intent." };
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

  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: { shopDomain: shop.shopDomain },
  });

  const skuSupplierMaps = await prisma.skuSupplierMap.findMany({
    where: { shopDomain: shop.shopDomain },
  });

  const activeProducts = products.filter(
    (p) => (p.status || "Active").toLowerCase() !== "inactive"
  );

  const hasRealData = activeProducts.length > 0;

  // Anchor dataset time window to max sales date if historical sales exist
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
  const ninetyDaysAgo = new Date(refDate.getTime() - 90 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(refDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  const hasHistoricalSalesData = sales.length > 0;

  let totalValueSum = 0;
  let totalStockUnits = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let slowDeadCount = 0;

  const mappedInventory = activeProducts.map((p) => {
    const stock = p.currentStock || 0;

    const suppMap = skuSupplierMaps.find((m) => (m.sku || "").trim().toLowerCase() === (p.sku || "").trim().toLowerCase());
    const cost = p.unitCost || p.sellingPrice || 0;

    const val = stock * cost;
    totalValueSum += val;
    totalStockUnits += stock;

    // Incoming from open purchase orders for this SKU
    const pSkuNorm = (p.sku || "").trim().toLowerCase();
    const skuPOs = purchaseOrders.filter(
      (po) => (po.sku || "").trim().toLowerCase() === pSkuNorm && (po.poStatus || "Open").toLowerCase() !== "received"
    );
    const incomingQty = skuPOs.reduce(
      (acc, po) => acc + (po.orderedQuantity - (po.receivedQuantity || 0)),
      0
    );

    // Reserved quantity (safety stock or 5% allocated)
    const reservedQty = p.safetyStock || Math.min(20, Math.round(stock * 0.05));
    const availableQty = Math.max(0, stock + incomingQty - reservedQty);

    // Sales velocity calculation (Enhanced SKU & product name + variant matching)
    const cleanStr = (str: string | null | undefined) => (str || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    const pSkuClean = cleanStr(p.sku);
    const pNameClean = cleanStr(p.productName);
    const pVariantClean = cleanStr(p.variantName);
    const pFullClean = pNameClean + pVariantClean;

    const skuSales = sales.filter((s) => {
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

    const sales90 = skuSales.filter((s) => new Date(s.date) >= ninetyDaysAgo);
    const sales30 = skuSales.filter((s) => new Date(s.date) >= thirtyDaysAgo);
    const netUnits90 = sales90.reduce((acc, s) => acc + (s.quantitySold || 0) - (s.returnQuantity || 0), 0);
    const netUnits30 = sales30.reduce((acc, s) => acc + (s.quantitySold || 0) - (s.returnQuantity || 0), 0);

    const totalAllTimeUnits = skuSales.reduce((acc, s) => acc + (s.quantitySold || 0) - (s.returnQuantity || 0), 0);
    const dailyVelocity = netUnits30 > 0 ? netUnits30 / 30 : (netUnits90 > 0 ? netUnits90 / 90 : (totalAllTimeUnits > 0 ? totalAllTimeUnits / 90 : 0.02));
    const daysOfStock = Math.max(1, Math.round(stock / dailyVelocity));

    const leadTime = suppMap?.leadTimeDays || 7;
    const calculatedROP = Math.ceil(dailyVelocity * leadTime + (p.safetyStock || 0));
    const effectiveROP =
      p.reorderPoint !== null && p.reorderPoint !== undefined && p.reorderPoint > 0
        ? p.reorderPoint
        : calculatedROP > 0
          ? calculatedROP
          : 30;

    // Status classification
    const isOOS = stock <= 0;
    const isDead = stock > 0 && hasHistoricalSalesData && netUnits90 === 0;
    const isSlow = stock > 0 && (daysOfStock > 90 || (netUnits30 === 0 && netUnits90 > 0));
    const isSlowOrDead = stock > 0 && (isDead || isSlow);
    const isLow = stock > 0 && stock <= effectiveROP && !isSlowOrDead;

    if (isOOS) outOfStockCount++;
    else if (isSlowOrDead) slowDeadCount++;
    else if (isLow) lowStockCount++;

    let statusLabel = "In Stock";
    let statusColor = "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (isOOS) {
      statusLabel = "Out of Stock";
      statusColor = "bg-rose-50 text-rose-700 border-rose-200";
    } else if (isLow) {
      statusLabel = "Low Stock";
      statusColor = "bg-amber-50 text-amber-700 border-amber-200";
    }

    let coverageLabel = `${daysOfStock} days`;
    let coverageStatus = "Good";
    let coverageColor = "text-emerald-600";
    if (isOOS || stock <= 0) {
      coverageLabel = "0 days";
      coverageStatus = "Out";
      coverageColor = "text-rose-600";
    } else if (daysOfStock <= 14) {
      coverageStatus = "Low";
      coverageColor = "text-amber-600";
    } else if (daysOfStock > 90) {
      coverageStatus = "Excess";
      coverageColor = "text-purple-600";
    }

    return {
      id: p.id,
      name: p.productName,
      variant: p.variantName || p.category || "Standard",
      sku: p.sku,
      statusLabel,
      statusColor,
      stockOnHand: stock,
      incoming: incomingQty,
      reserved: reservedQty,
      available: availableQty,
      inventoryValue: val,
      coverageLabel,
      coverageStatus,
      coverageColor,
      category: p.category || "General",
      supplierCode: suppMap?.supplierCode || "SUP-001",
      productStatus: p.status || "Active",
      isSlowOrDead,
      unitCost: cost,
      sellingPrice: p.sellingPrice || 0,
      reorderPoint: p.reorderPoint || effectiveROP,
      safetyStock: p.safetyStock || 0,
    };
  });

  return {
    shop,
    dateRangeStr,
    metrics: {
      totalSKUs: activeProducts.length,
      stockOnHand: totalStockUnits,
      inventoryValue: totalValueSum,
      lowStock: lowStockCount,
      outOfStock: outOfStockCount,
      slowStock: slowDeadCount,
    },
    inventoryList: mappedInventory,
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

          <p className="text-slate-600 text-[11px] leading-relaxed font-normal">
            {explanation}
          </p>
        </div>
      )}
    </div>
  );
}

export default function InventoryPage() {
  const { shop, metrics, inventoryList, dateRangeStr} = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const syncFetcher = useFetcher();

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (syncFetcher.data) {
      const res: any = syncFetcher.data;
      if (res.success && res.actionType === "SYNC_SHOPIFY") {
        showToast(res.message || "Shopify store synced!", "success");
      } else if (res.error && res.actionType === "SYNC_SHOPIFY") {
        showToast(res.error, "error");
      }
    }
  }, [syncFetcher.data]);

  // Local state copy for instant UI updates
  const [localInventory, setLocalInventory] = useState<any[] | null>(null);
  const activeInventory = localInventory !== null ? localInventory : inventoryList;

  // Sync activeInventory if loader data updates
  useEffect(() => {
    setLocalInventory(null);
  }, [inventoryList]);

  // Edit Modal state
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [editFormData, setEditFormData] = useState({
    id: "",
    productName: "",
    sku: "",
    variantName: "",
    category: "",
    currentStock: 0,
    unitCost: 0,
    sellingPrice: 0,
    reorderPoint: 0,
    safetyStock: 0,
  });

  // Action Menu Dropdown state
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);

  // Close dropdown menu on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".action-menu-container")) {
        setOpenActionMenuId(null);
      }
    };
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, []);

  // Delete Modal state
  const [deletingItem, setDeletingItem] = useState<any | null>(null);

  const handleOpenEditModal = (item: any) => {
    setEditingItem(item);
    setEditFormData({
      id: item.id || "",
      productName: item.name || "",
      sku: item.sku || "",
      variantName: item.variant || "",
      category: item.category || "",
      currentStock: item.stockOnHand || 0,
      unitCost: item.unitCost || 0,
      sellingPrice: item.sellingPrice || 0,
      reorderPoint: item.reorderPoint || 0,
      safetyStock: item.safetyStock || 0,
    });
  };

  const handleOpenDeleteModal = (item: any) => {
    setDeletingItem(item);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Optimistic local update
    const updatedList = activeInventory.map((p: any) => {
      if ((p.id && p.id === editFormData.id) || (p.sku && p.sku === editFormData.sku)) {
        const newStock = editFormData.currentStock;
        const newCost = editFormData.unitCost;
        return {
          ...p,
          name: editFormData.productName,
          variant: editFormData.variantName,
          category: editFormData.category,
          stockOnHand: newStock,
          unitCost: newCost,
          sellingPrice: editFormData.sellingPrice,
          reorderPoint: editFormData.reorderPoint,
          safetyStock: editFormData.safetyStock,
          inventoryValue: newStock * newCost,
          available: Math.max(0, newStock + (p.incoming || 0) - (p.reserved || 0)),
          statusLabel: newStock <= 0 ? "Out of Stock" : (newStock <= editFormData.reorderPoint ? "Low Stock" : "In Stock"),
          statusColor: newStock <= 0 ? "bg-rose-50 text-rose-700 border-rose-200" : (newStock <= editFormData.reorderPoint ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"),
        };
      }
      return p;
    });
    setLocalInventory(updatedList);

    const formData = new FormData();
    formData.append("intent", "UPDATE_PRODUCT");
    formData.append("id", editFormData.id);
    formData.append("productName", editFormData.productName);
    formData.append("sku", editFormData.sku);
    formData.append("variantName", editFormData.variantName);
    formData.append("category", editFormData.category);
    formData.append("currentStock", editFormData.currentStock.toString());
    formData.append("unitCost", editFormData.unitCost.toString());
    formData.append("sellingPrice", editFormData.sellingPrice.toString());
    formData.append("reorderPoint", editFormData.reorderPoint.toString());
    formData.append("safetyStock", editFormData.safetyStock.toString());

    fetcher.submit(formData, { method: "POST" });
  };

  const handleConfirmDelete = () => {
    if (!deletingItem) return;
    setIsSubmitting(true);

    // Optimistic local deletion
    const updatedList = activeInventory.filter((p: any) => {
      if (deletingItem.id && p.id === deletingItem.id) return false;
      if (deletingItem.sku && p.sku === deletingItem.sku) return false;
      return true;
    });
    setLocalInventory(updatedList);

    const formData = new FormData();
    formData.append("intent", "DELETE_PRODUCT");
    formData.append("id", deletingItem.id || "");
    formData.append("sku", deletingItem.sku || "");

    fetcher.submit(formData, { method: "POST" });
  };

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      setIsSubmitting(false);
      const data = fetcher.data as any;
      if (data.success) {
        if (editingItem) {
          showToast("Product updated successfully.", "success");
          setEditingItem(null);
        } else if (deletingItem) {
          showToast("Product deleted successfully.", "success");
          setDeletingItem(null);
        }
      } else if (data.error) {
        showToast(data.error || "Failed to complete request.", "error");
      }
    }
  }, [fetcher.state, fetcher.data]);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [stockStatusFilter, setStockStatusFilter] = useState("All");
  const [productTypeFilter, setProductTypeFilter] = useState("All");
  const [supplierFilter, setSupplierFilter] = useState("All");
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [showAiDrawer, setShowAiDrawer] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<Array<{ sender: "user" | "ai"; text: string }>>([]);
  const [isAsking, setIsAsking] = useState(false);

  const productTypes = Array.from(
    new Set(activeInventory.map((i: any) => i.category).filter(Boolean))
  );
  const suppliers = Array.from(
    new Set(activeInventory.map((i: any) => i.supplierCode).filter(Boolean))
  );

  const sampleQuestions = [
    "Which products are at risk of stock out?",
    "What should I reorder today?",
    "Show me top slow moving items",
    "What's my forecast for next week?",
    "Summarize inventory health",
  ];

  const filteredList = activeInventory.filter((item: any) => {
    const searchLower = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !searchLower ||
      item.name.toLowerCase().includes(searchLower) ||
      item.sku.toLowerCase().includes(searchLower) ||
      item.variant.toLowerCase().includes(searchLower);

    let matchesStatus = true;
    if (statusFilter !== "All") {
      if (statusFilter === "Slow / Dead") {
        matchesStatus = !!item.isSlowOrDead;
      } else {
        matchesStatus = item.statusLabel.toLowerCase() === statusFilter.toLowerCase();
      }
    }

    const matchesStockStatus =
      stockStatusFilter === "All" ||
      (item.productStatus || "Active").toLowerCase() === stockStatusFilter.toLowerCase();

    const matchesProductType =
      productTypeFilter === "All" ||
      (item.category || "").toLowerCase() === productTypeFilter.toLowerCase();

    const matchesSupplier =
      supplierFilter === "All" ||
      (item.supplierCode || "").toLowerCase() === supplierFilter.toLowerCase();

    return (
      matchesSearch &&
      matchesStatus &&
      matchesStockStatus &&
      matchesProductType &&
      matchesSupplier
    );
  });

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, stockStatusFilter, productTypeFilter, supplierFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredList.length / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (validCurrentPage - 1) * pageSize;
  const endIndex = Math.min(filteredList.length, startIndex + pageSize);
  const paginatedList = filteredList.slice(startIndex, endIndex);

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

  const isFilterActive =
    searchTerm !== "" ||
    statusFilter !== "All" ||
    stockStatusFilter !== "All" ||
    productTypeFilter !== "All" ||
    supplierFilter !== "All";

  const handleResetFilters = () => {
    setSearchTerm("");
    setStatusFilter("All");
    setStockStatusFilter("All");
    setProductTypeFilter("All");
    setSupplierFilter("All");
    setCurrentPage(1);
  };

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

  const handleExportCSV = () => {
    const headers = ["Product", "Variant", "SKU", "Status", "Stock on Hand", "Incoming", "Reserved", "Available", "Inventory Value (INR)", "Stock Coverage"];
    const rows = filteredList.map((i: any) => [
      `"${i.name}"`,
      `"${i.variant}"`,
      `"${i.sku}"`,
      `"${i.statusLabel}"`,
      i.stockOnHand,
      i.incoming,
      i.reserved,
      i.available,
      i.inventoryValue,
      `"${i.coverageLabel}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r: any) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `StockPilot_Inventory_Export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAskQuestion = (qText: string) => {
    if (!qText.trim()) return;
    const newMsgs = [...chatMessages, { sender: "user" as const, text: qText }];
    setChatMessages(newMsgs);
    setChatInput("");
    setIsAsking(true);

    setTimeout(() => {
      let reply = "Based on your inventory velocity, iPhone 15 Pro Case & Ceramic Coffee Mugs are low in stock. We recommend placing a Purchase Order today.";
      if (qText.toLowerCase().includes("reorder")) {
        reply = `You have ${metrics.lowStock} low stock items and ${metrics.outOfStock} out-of-stock items requiring urgent reorders today.`;
      } else if (qText.toLowerCase().includes("slow")) {
        reply = `You currently have ${metrics.slowStock} slow-moving SKUs with over 90 days of stock coverage. Consider running a promotional discount.`;
      } else if (qText.toLowerCase().includes("forecast")) {
        reply = "Total forecasted demand across your inventory is estimated at ~3,550 units over the next 14 days.";
      } else if (qText.toLowerCase().includes("health")) {
        reply = `Inventory Health Summary: Total Inventory Value is ${formatCurrency(metrics.inventoryValue, shop?.currency)} across ${metrics.totalSKUs.toLocaleString()} active SKUs.`;
      }
      setChatMessages([...newMsgs, { sender: "ai" as const, text: reply }]);
      setIsAsking(false);
    }, 700);
  };

  return (
    <div className="min-h-screen bg-[#f1f1f1] text-slate-900 font-sans p-4 md:p-8">
      <div className="max-w-[1600px] mx-auto space-y-6">

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
              Inventory
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              View and manage all your inventory across products, SKUs and variants.
            </p>
          </div>

          {/* <div className="flex items-center gap-3">
            <button className="bg-white border border-slate-200 text-slate-700 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 hover:bg-slate-50 transition-all cursor-pointer shadow-2xs">
              <Calendar className="w-4 h-4 text-purple-600" />
              <span>{dateRangeStr}</span>
              <span className="text-slate-400"></span>
            </button>
          </div> */}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          <button
            onClick={() => setStatusFilter("All")}
            className={`text-left bg-white rounded-2xl p-4 md:p-5 border shadow-sm hover:shadow-md transition-all cursor-pointer relative ${statusFilter === "All" ? "border-purple-500 ring-2 ring-purple-500/10" : "border-slate-200/80"
              }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                  <Tag className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-semibold text-slate-600">Total SKUs</span>
              </div>
              <MetricTooltip
                title="Total SKUs"
                formula="Count(Active Product SKUs)"
                explanation="Total count of active product SKUs and variants managed in your database across all warehouse locations."
                align="left"
              />
            </div>
            <div className="mt-3">
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                {metrics.totalSKUs.toLocaleString("en-IN")}
              </h2>
              <p className="text-xs text-slate-400 mt-1">Across all Items</p>
            </div>
          </button>

          <button
            onClick={() => setStatusFilter("All")}
            className="text-left bg-white rounded-2xl p-4 md:p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all cursor-pointer relative"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                  <Package className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-semibold text-slate-600">Stock on Hand</span>
              </div>
              <MetricTooltip
                title="Stock on Hand"
                formula="Sum(Current Stock Units)"
                explanation="Total physical quantity of inventory units currently available across all active product SKUs in warehouse."
                align="left"
              />
            </div>
            <div className="mt-3">
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                {metrics.stockOnHand.toLocaleString("en-IN")}
              </h2>
              <p className="text-xs text-slate-400 mt-1">SKUs / Variants</p>
            </div>
          </button>

          <button
            onClick={() => setStatusFilter("All")}
            className="text-left bg-white rounded-2xl p-4 md:p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all cursor-pointer relative"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <DollarSign className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-semibold text-slate-600">Inventory Value</span>
              </div>
              <MetricTooltip
                title="Inventory Value"
                formula="Sum(Current Stock × Unit Cost)"
                explanation="Total cost value of all active physical inventory on hand, using supplier map or product unit cost."
                align="center"
              />
            </div>
            <div className="mt-3">
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                {formatCurrency(metrics.inventoryValue, shop?.currency)}
              </h2>
              <p className="text-xs text-slate-400 mt-1">Total value</p>
            </div>
          </button>

          <button
            onClick={() => setStatusFilter("Low Stock")}
            className={`text-left bg-white rounded-2xl p-4 md:p-5 border shadow-sm hover:shadow-md transition-all cursor-pointer relative ${statusFilter === "Low Stock" ? "border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/20" : "border-slate-200/80"
              }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-semibold text-slate-600">Low Stock</span>
              </div>
              <MetricTooltip
                title="Low Stock Items"
                formula="Stock > 0 AND Stock ≤ ROP"
                explanation="Count of active products whose stock level has dipped to or below their calculated Reorder Point (ROP)."
                align="center"
              />
            </div>
            <div className="mt-3">
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                {metrics.lowStock}
              </h2>
              <p className="text-xs text-slate-400 mt-1">Needs attention</p>
            </div>
          </button>

          <button
            onClick={() => setStatusFilter("Out of Stock")}
            className={`text-left bg-white rounded-2xl p-4 md:p-5 border shadow-sm hover:shadow-md transition-all cursor-pointer relative ${statusFilter === "Out of Stock" ? "border-rose-500 ring-2 ring-rose-500/20 bg-rose-50/20" : "border-slate-200/80"
              }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <XCircle className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-semibold text-slate-600">Out of Stock</span>
              </div>
              <MetricTooltip
                title="Out of Stock Items"
                formula="Current Stock ≤ 0"
                explanation="Count of active SKUs with zero physical units available in warehouse, needing immediate restocking."
                align="right"
              />
            </div>
            <div className="mt-3">
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                {metrics.outOfStock}
              </h2>
              <p className="text-xs text-slate-400 mt-1">Urgent restock</p>
            </div>
          </button>

          <button
            onClick={() => setStatusFilter("Slow / Dead")}
            className={`text-left bg-white rounded-2xl p-4 md:p-5 border shadow-sm hover:shadow-md transition-all cursor-pointer relative ${statusFilter === "Slow / Dead" ? "border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20" : "border-slate-200/80"
              }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <Clock className="w-4.5 h-4.5" />
                </div>
                <span className="text-xs font-semibold text-slate-600">Slow / Dead Stock</span>
              </div>
              <MetricTooltip
                title="Slow / Dead Stock"
                formula="Zero 30d Sales OR Days of Stock > 90"
                explanation="Products with positive stock (Stock > 0) that have zero sales in the last 30 days or over 90 days of stock coverage."
                align="right"
              />
            </div>
            <div className="mt-3">
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                {metrics.slowStock}
              </h2>
              <p className="text-xs text-slate-400 mt-1">Review required</p>
            </div>
          </button>
        </div>

        {/* SEARCH & FILTERS BAR */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Left: Search input & Dropdowns */}
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <div className="relative flex-1 min-w-[240px] max-w-[320px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by product, SKU or variant"
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
              <option value="All">Status: All</option>
              <option value="In Stock">In Stock</option>
              <option value="Low Stock">Low Stock</option>
              <option value="Out of Stock">Out of Stock</option>
              <option value="Slow / Dead">Slow / Dead Stock</option>
            </select>

            {/* Stock Status Dropdown */}
            <select
              value={stockStatusFilter}
              onChange={(e) => setStockStatusFilter(e.target.value)}
              className="bg-white border border-slate-200 text-slate-700 px-3 py-2 rounded-xl text-xs font-medium focus:outline-none cursor-pointer hover:border-slate-300"
            >
              <option value="All">Stock Status: All</option>
              <option value="Active">Active Only</option>
              <option value="Inactive">Inactive Only</option>
            </select>

            {/* Product Type Dropdown (Dynamic Categories) */}
            <select
              value={productTypeFilter}
              onChange={(e) => setProductTypeFilter(e.target.value)}
              className="bg-white border border-slate-200 text-slate-700 px-3 py-2 rounded-xl text-xs font-medium focus:outline-none cursor-pointer hover:border-slate-300"
            >
              <option value="All">Product Type: All</option>
              {productTypes.map((cat: any, idx) => (
                <option key={idx} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            {/* Supplier Dropdown (Dynamic Suppliers) */}
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="bg-white border border-slate-200 text-slate-700 px-3 py-2 rounded-xl text-xs font-medium focus:outline-none cursor-pointer hover:border-slate-300"
            >
              <option value="All">Supplier: All</option>
              {suppliers.map((sup: any, idx) => (
                <option key={idx} value={sup}>
                  {sup}
                </option>
              ))}
            </select>

            {/* Clear / Reset Filters Button */}
            {isFilterActive && (
              <button
                onClick={handleResetFilters}
                className="bg-rose-50 text-rose-600 border border-rose-200 px-3 py-2 rounded-xl text-xs font-semibold hover:bg-rose-100 transition-all flex items-center gap-1.5"
              >
                <X className="w-3.5 h-3.5" />
                <span>Reset Filters</span>
              </button>
            )}
          </div>

          {/* Right: Export & Sync */}
          <div className="flex items-center gap-2 self-end md:self-auto">
            <button
              onClick={handleExportCSV}
              className="bg-white border border-purple-200 text-purple-700 hover:bg-purple-50 px-4 py-2 rounded-xl text-xs font-semibold shadow-2xs transition-all flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>
            <syncFetcher.Form method="post">
              <input type="hidden" name="intent" value="SYNC_SHOPIFY" />
              <button
                type="submit"
                disabled={syncFetcher.state !== "idle"}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-2xs transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncFetcher.state !== "idle" ? "animate-spin" : ""}`} />
                <span>{syncFetcher.state !== "idle" ? "Syncing Store..." : "Sync with Shopify"}</span>
              </button>
            </syncFetcher.Form>
          </div>
        </div>

        {/* TABLE + AI SIDEBAR CONTAINER */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

          {/* TABLE CONTAINER (SPAN 8 or 12 depending on AI drawer toggle) */}
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
                      <th className="py-3.5 px-4 font-semibold">Product</th>
                      <th className="py-3.5 px-4 font-semibold">SKU / Variant</th>
                      <th className="py-3.5 px-4 font-semibold text-center">Status</th>
                      <th className="py-3.5 px-4 font-semibold text-center">Stock on Hand</th>
                      <th className="py-3.5 px-4 font-semibold text-center">Incoming</th>
                      <th className="py-3.5 px-4 font-semibold text-center">Reserved</th>
                      <th className="py-3.5 px-4 font-semibold text-center">Available</th>
                      <th className="py-3.5 px-4 font-semibold text-right">Inventory Value</th>
                      <th className="py-3.5 px-4 font-semibold text-center">Stock Coverage</th>
                      <th className="py-3.5 px-4 font-semibold text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {paginatedList.map((item: any, idx: number) => {
                      const isSelected = selectedRows.includes(item.id);
                      const isNearBottom = idx >= Math.max(0, paginatedList.length - 2);
                      const popoverPosClass = isNearBottom ? "bottom-full mb-1" : "top-full mt-1";

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

                          {/* Product Thumbnail + Name */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              {/* <div className="w-9 h-9 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center shrink-0 text-base shadow-2xs">
                                📦
                              </div> */}
                              <div>
                                <div className="font-bold text-slate-900">{item.name}</div>
                                <div className="text-[11px] text-slate-400">{item.variant}</div>
                              </div>
                            </div>
                          </td>

                          {/* SKU / Variant */}
                          <td className="py-3.5 px-4 font-semibold text-slate-700">
                            {item.sku}
                          </td>

                          {/* Status Badge */}
                          <td className="py-3.5 px-4 text-center">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border ${item.statusColor}`}
                            >
                              {item.statusLabel}
                            </span>
                          </td>

                          {/* Stock on Hand */}
                          <td className="py-3.5 px-4 text-center font-semibold text-slate-800">
                            {item.stockOnHand}
                          </td>

                          {/* Incoming */}
                          <td className="py-3.5 px-4 text-center text-slate-600">
                            {item.incoming}
                          </td>

                          {/* Reserved */}
                          <td className="py-3.5 px-4 text-center text-slate-600">
                            {item.reserved}
                          </td>

                          {/* Available (Green or Red) */}
                          <td
                            className={`py-3.5 px-4 text-center font-extrabold ${item.available > 0 ? "text-emerald-600" : "text-rose-600"
                              }`}
                          >
                            {item.available}
                          </td>

                          {/* Inventory Value */}
                          <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                            {formatCurrency(item.inventoryValue, shop?.currency)}
                          </td>

                          {/* Stock Coverage */}
                          <td className="py-3.5 px-4 text-center">
                            <div className="font-bold text-slate-800">{item.coverageLabel}</div>
                            <div className={`text-[10px] font-bold ${item.coverageColor}`}>
                              {item.coverageStatus}
                            </div>
                          </td>

                          {/* Action */}
                          <td className="py-3.5 px-4 text-center relative action-menu-container">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenActionMenuId((prev) => (prev === item.id ? null : item.id));
                              }}
                              className={`p-1.5 rounded-lg transition-all cursor-pointer border ${
                                openActionMenuId === item.id
                                  ? "bg-purple-100 text-purple-700 border-purple-300"
                                  : "text-slate-400 hover:text-purple-600 hover:bg-purple-50 border-transparent hover:border-purple-200"
                              }`}
                              title="Product Actions"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>

                            {openActionMenuId === item.id && (
                              <div
                                className={`absolute right-4 ${popoverPosClass} w-36 bg-white border border-slate-200/90 rounded-2xl shadow-2xl z-[9999] p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-150`}
                                style={{ filter: "drop-shadow(0 10px 15px rgba(0,0,0,0.12))" }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenActionMenuId(null);
                                    handleOpenEditModal(item);
                                  }}
                                  className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:text-purple-700 hover:bg-purple-50 rounded-xl flex items-center gap-2 transition-colors cursor-pointer"
                                >
                                  <Edit className="w-3.5 h-3.5 text-purple-600" />
                                  <span>Edit Product</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenActionMenuId(null);
                                    handleOpenDeleteModal(item);
                                  }}
                                  className="w-full text-left px-3 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl flex items-center gap-2 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                                  <span>Delete Product</span>
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* TABLE FOOTER / DYNAMIC INTERACTIVE PAGINATION */}
              <div className="px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white">
                <div className="text-xs font-medium text-slate-500">
                  Showing {filteredList.length > 0 ? startIndex + 1 : 0} to {endIndex} of {filteredList.length} items
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

          {/* RIGHT FLOATING / EMBEDDED AI DRAWER (SPAN 4) */}
          {/* {showAiDrawer && (
            <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-4 transition-all duration-300">
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

      {/* FLOATING ACTION BUTTON (FAB) FOR AI DRAWER */}
      {!showAiDrawer && (
        <button
          onClick={() => setShowAiDrawer(true)}
          className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-purple-600 text-white flex items-center justify-center shadow-lg hover:bg-purple-700 hover:scale-105 transition-all z-50 cursor-pointer"
        >
          <Sparkles className="w-6 h-6" />
        </button>
      )}

      {/* ── EDIT PRODUCT MODAL ────────────────────────────────────────────── */}
      {editingItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[99999] flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                  <Edit className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Edit Product Details</h3>
                  <p className="text-[11px] text-slate-500 font-medium">SKU: {editFormData.sku}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveEdit} className="p-6 space-y-4 overflow-y-auto">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Product Name</label>
                <input
                  type="text"
                  required
                  value={editFormData.productName}
                  onChange={(e) => setEditFormData({ ...editFormData, productName: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Variant Name</label>
                  <input
                    type="text"
                    value={editFormData.variantName}
                    onChange={(e) => setEditFormData({ ...editFormData, variantName: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Category</label>
                  <input
                    type="text"
                    value={editFormData.category}
                    onChange={(e) => setEditFormData({ ...editFormData, category: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Current Stock</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={editFormData.currentStock}
                    onChange={(e) => setEditFormData({ ...editFormData, currentStock: parseInt(e.target.value || "0", 10) })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Unit Cost ({getCurrencySymbol(shop?.currency)})</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editFormData.unitCost}
                    onChange={(e) => setEditFormData({ ...editFormData, unitCost: parseFloat(e.target.value || "0") })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Selling Price ({getCurrencySymbol(shop?.currency)})</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editFormData.sellingPrice}
                    onChange={(e) => setEditFormData({ ...editFormData, sellingPrice: parseFloat(e.target.value || "0") })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Reorder Point (ROP)</label>
                  <input
                    type="number"
                    min="0"
                    value={editFormData.reorderPoint}
                    onChange={(e) => setEditFormData({ ...editFormData, reorderPoint: parseInt(e.target.value || "0", 10) })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Safety Stock</label>
                  <input
                    type="number"
                    min="0"
                    value={editFormData.safetyStock}
                    onChange={(e) => setEditFormData({ ...editFormData, safetyStock: parseInt(e.target.value || "0", 10) })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 font-mono"
                  />
                </div>
              </div>

              {/* Modal Actions Footer */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRMATION MODAL ────────────────────────────────────────── */}
      {deletingItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[99999] flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-md overflow-hidden p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Delete Product?</h3>
                <p className="text-xs text-slate-500 font-medium">SKU: {deletingItem.sku}</p>
              </div>
            </div>

            <div className="bg-rose-50/60 border border-rose-100 rounded-xl p-3 text-xs text-rose-800 leading-relaxed font-medium">
              Are you sure you want to delete <span className="font-bold text-rose-900">{deletingItem.name}</span> ({deletingItem.variant})? This action <span className="underline font-bold">cannot be undone</span>.
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingItem(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Product
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TOAST NOTIFICATION ────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[999999] animate-in slide-in-from-bottom-5 fade-in duration-200">
          <div
            className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl border text-xs font-semibold ${
              toast.type === "success"
                ? "bg-slate-900 text-white border-slate-800"
                : "bg-rose-900 text-white border-rose-800"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="ml-2 text-slate-400 hover:text-white p-0.5 rounded-lg cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
