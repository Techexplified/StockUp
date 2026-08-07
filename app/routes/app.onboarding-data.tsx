import { useState, useRef, useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useSubmit, useLoaderData, useActionData, useNavigation } from "react-router";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { authenticate } from "../shopify.server";
import prisma, { ensureShopData, syncShopifyDataToDb } from "../db.server";
import {
  Upload,
  ShieldCheck,
  RefreshCw,
  Zap,
  Package,
  ShoppingCart,
  Boxes,
  FileText,
  TrendingUp,
  Download,
  Lightbulb,
  HelpCircle,
  Calendar,
  ArrowRight,
  Link2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

// Category templates and expected required headers
const TEMPLATES: Record<
  string,
  {
    fileName: string;
    driveUrl?: string;
    headers: string[];
    requiredHeaders?: string[];
    sampleRow: Record<string, string>;
  }
> = {
  products: {
    fileName: "StockPilot_Products_Inventory_Template.xlsx",
    driveUrl: "https://docs.google.com/spreadsheets/d/1uDNLheauX2w9T3TubNwi1L5DK7WoISQg/export?format=xlsx",
    headers: [
      "Product Name",
      "SKU",
      "Variant Name",
      "Category",
      "Current Stock (On Hand)",
      "Unit Cost (INR)",
      "Selling Price (INR)",
      "Reorder Point",
      "Safety Stock",
      "Active (Yes/No)",
    ],
    requiredHeaders: [
      "Product Name",
      "SKU",
      "Current Stock (On Hand)",
      "Unit Cost (INR)",
    ],
    sampleRow: {
      "Product Name": "Cotton Crew Neck T-Shirt",
      SKU: "TSH-COT-BLK-L",
      "Variant Name": "Large / Black",
      Category: "Apparel",
      "Current Stock (On Hand)": "150",
      "Unit Cost (INR)": "350",
      "Selling Price (INR)": "899",
      "Reorder Point": "25",
      "Safety Stock": "15",
      "Active (Yes/No)": "Yes",
    },
  },
  suppliers: {
    fileName: "StockPilot_Suppliers_Template.xlsx",
    driveUrl: "https://docs.google.com/spreadsheets/d/1Ze_BIchOXiFjpOazTjh9yG9370pIn_ZU/export?format=xlsx",
    headers: [
      "Supplier Name",
      "Supplier Code",
      "Contact Person",
      "Email",
      "Phone",
      "Lead Time (Days)",
      "Payment Terms",
      "Minimum Order Value (INR)",
      "Status",
      "Notes",
    ],
    requiredHeaders: [
      "Supplier Name",
      "Supplier Code",
      "Lead Time (Days)",
      "Status",
    ],
    sampleRow: {
      "Supplier Name": "Apex Textile Mills",
      "Supplier Code": "SUP-APEX-01",
      "Contact Person": "Rajesh Kumar",
      Email: "rajesh@apextextiles.com",
      Phone: "+91 98765 43210",
      "Lead Time (Days)": "14",
      "Payment Terms": "Net 30",
      "Minimum Order Value (INR)": "25000",
      Status: "Active",
      Notes: "Primary vendor for cotton tees",
    },
  },
  skus: {
    fileName: "StockPilot_SKUs_Linked_Suppliers_Template.xlsx",
    driveUrl: "https://docs.google.com/spreadsheets/d/10ftamI8u5FM8bUbWSy69TwUA0KSf8-wi/export?format=xlsx",
    headers: [
      "SKU",
      "Supplier Code",
      "Supplier SKU",
      "Unit Cost (INR)",
      "Lead Time (Days)",
      "MOQ",
      "Pack Size / Unit",
      "Preferred Supplier",
      "Status",
    ],
    requiredHeaders: [
      "SKU",
      "Supplier Code",
      "Unit Cost (INR)",
      "Lead Time (Days)",
    ],
    sampleRow: {
      SKU: "TSH-COT-BLK-L",
      "Supplier Code": "SUP-APEX-01",
      "Supplier SKU": "APX-BLK-L",
      "Unit Cost (INR)": "350",
      "Lead Time (Days)": "14",
      MOQ: "100",
      "Pack Size / Unit": "Box of 20",
      "Preferred Supplier": "Yes",
      Status: "Active",
    },
  },
  po: {
    fileName: "StockPilot_Purchase_Orders_Template.xlsx",
    driveUrl: "https://docs.google.com/spreadsheets/d/1ZGsH2PBhATrVHFEUDyU3wcgMYZzt9G-m/export?format=xlsx",
    headers: [
      "PO Number",
      "PO Date",
      "Supplier Code",
      "SKU",
      "Product Name",
      "Ordered Qty",
      "Unit Cost (INR)",
      "Expected Delivery Date",
      "Received Qty",
      "PO Status",
    ],
    requiredHeaders: [
      "PO Number",
      "PO Date",
      "Supplier Code",
      "SKU",
      "Ordered Qty",
      "Unit Cost (INR)",
      "Expected Delivery Date",
      "PO Status",
    ],
    sampleRow: {
      "PO Number": "PO-2026-001",
      "PO Date": "2026-07-20",
      "Supplier Code": "SUP-APEX-01",
      SKU: "TSH-COT-BLK-L",
      "Product Name": "Cotton Crew Neck T-Shirt",
      "Ordered Qty": "200",
      "Unit Cost (INR)": "350",
      "Expected Delivery Date": "2026-08-05",
      "Received Qty": "0",
      "PO Status": "Open",
    },
  },
  sales: {
    fileName: "StockPilot_Historical_Sales_Template.xlsx",
    driveUrl: "https://docs.google.com/spreadsheets/d/1z-3jdUVgYikiXXbKdEkiYH0vskkZXycj/export?format=xlsx",
    headers: [
      "Date",
      "Order ID",
      "SKU",
      "Product Name",
      "Quantity Sold",
      "Selling Price (INR)",
      "Discount (INR)",
      "Returns Qty",
      "Sales Channel",
    ],
    requiredHeaders: ["Date", "SKU", "Quantity Sold"],
    sampleRow: {
      Date: "2026-07-25",
      "Order ID": "#ORD-10042",
      SKU: "TSH-COT-BLK-L",
      "Product Name": "Cotton Crew Neck T-Shirt",
      "Quantity Sold": "3",
      "Selling Price (INR)": "899",
      "Discount (INR)": "50",
      "Returns Qty": "0",
      "Sales Channel": "Shopify Online Store",
    },
  },
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop, redirect: shopifyRedirect } = await ensureShopData(request, authenticate);

  if (!shop.isOnboarded) {
    return shopifyRedirect("/app/onboarding");
  }

  if (shop.isOnboardedData) {
    return shopifyRedirect("/app");
  }

  return { shop };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session, redirect: shopifyRedirect } = await authenticate.admin(request);
  const formData = await request.formData();

  const actionType = formData.get("actionType") as string;

  // Real-time Shopify data fetching when merchant clicks "Connect Shopify Store"
  if (actionType === "sync_shopify") {
    try {
      const result = await syncShopifyDataToDb(admin, session.shop);
      if (result.success) {
        const productCount = result.count || 0;
        const variantCount = result.totalVariants || productCount;
        return {
          success: true,
          actionType: "sync_shopify",
          message: `Successfully connected & fetched ${productCount} product${productCount === 1 ? "" : "s"} (${variantCount} variant${variantCount === 1 ? "" : "s"}) & sales from your Shopify store!`,
        };
      } else {
        return {
          success: false,
          actionType: "sync_shopify",
          error: typeof result.error === "string" ? result.error : "Failed to fetch data from Shopify store",
        };
      }
    } catch (err: any) {
      return {
        success: false,
        actionType: "sync_shopify",
        error: err.message || "Failed to fetch data from Shopify store",
      };
    }
  }

  // Store data in database ONLY when merchant clicks "Start Import"
  if (actionType === "finish_setup") {
    const isConnected = formData.get("connected") === "true";
    const rawStagedPayload = formData.get("stagedPayload") as string;

    // 1. Auto-sync Shopify store products & sales if store is connected
    if (isConnected) {
      await syncShopifyDataToDb(admin, session.shop);
    }

    // 2. Write all staged CSV/XLSX file data payloads to PostgreSQL database
    if (rawStagedPayload) {
      let stagedMap: Record<string, any[]> = {};
      try {
        stagedMap = JSON.parse(rawStagedPayload);
      } catch (e) {
        console.error("Failed to parse rawStagedPayload JSON:", e);
      }

      const cleanNum = (val: any) => {
        if (val === undefined || val === null) return 0;
        const num = parseFloat(val.toString().replace(/[^0-9.-]/g, ""));
        return isNaN(num) ? 0 : num;
      };

      // Process Products
      if (stagedMap.products && Array.isArray(stagedMap.products)) {
        for (const r of stagedMap.products) {
          try {
            const skuCode = r["SKU"] || r["sku"] || r["SKU Code"];
            if (!skuCode || skuCode.toString().toLowerCase().includes("variant code") || skuCode.toString().toLowerCase().includes("unique sku")) continue;

            const stockVal = Math.round(cleanNum(r["Current Stock (On Hand)"] || r["Current Stock"] || r["Stock"] || "0"));
            const unitCostVal = cleanNum(r["Unit Cost (INR)"] || r["Unit Cost"] || r["Cost"] || "0");
            const priceVal = cleanNum(r["Selling Price (INR)"] || r["Selling Price"] || r["Price"] || "0");
            const reorderVal = Math.round(cleanNum(r["Reorder Point"] || r["Reorder"] || "0"));
            const safetyVal = Math.round(cleanNum(r["Safety Stock"] || r["Safety"] || "0"));

            const rawActive = (r["Active (Yes/No)"] || r["Active"] || r["Status"] || "Yes").toString().trim().toLowerCase();
            const activeStatus = (rawActive === "no" || rawActive === "false" || rawActive === "inactive") ? "Inactive" : "Active";

            await prisma.product.upsert({
              where: { sku: skuCode },
              update: {
                productName: r["Product Name"] || r["Product"] || "",
                variantName: r["Variant Name"] || r["Variant"] || "",
                category: r["Category"] || "",
                currentStock: stockVal,
                unitCost: unitCostVal,
                sellingPrice: priceVal,
                reorderPoint: reorderVal,
                safetyStock: safetyVal,
                status: activeStatus,
              },
              create: {
                shopDomain: session.shop,
                sku: skuCode,
                productName: r["Product Name"] || r["Product"] || "Untitled Product",
                variantName: r["Variant Name"] || r["Variant"] || "",
                category: r["Category"] || "",
                currentStock: stockVal,
                unitCost: unitCostVal,
                sellingPrice: priceVal,
                reorderPoint: reorderVal,
                safetyStock: safetyVal,
                status: activeStatus,
              },
            });
          } catch (err) {
            console.error("Error inserting Product row:", r, err);
          }
        }
      }

      // Process Suppliers
      if (stagedMap.suppliers && Array.isArray(stagedMap.suppliers)) {
        for (const r of stagedMap.suppliers) {
          try {
            const suppCode = r["Supplier Code"] || r["supplierCode"];
            if (!suppCode || suppCode.toString().toLowerCase().includes("unique supplier") || suppCode.toString().toLowerCase().includes("supplier id")) continue;

            const rawStatus = (r["Status"] || "Active").toString().trim().toLowerCase();
            const activeStatus = (rawStatus === "inactive" || rawStatus === "no") ? "Inactive" : "Active";

            await prisma.supplier.upsert({
              where: { supplierCode: suppCode },
              update: {
                supplierName: r["Supplier Name"] || "",
                contactPerson: r["Contact Person"] || "",
                email: r["Email"] || "",
                phone: r["Phone"] || r["Phone Number"] || "",
                leadTimeDays: Math.round(cleanNum(r["Lead Time (Days)"] || "7")),
                paymentTerms: r["Payment Terms"] || "",
                minimumOrderValue: cleanNum(r["Minimum Order Value (INR)"] || "0"),
                status: activeStatus,
                notes: r["Notes"] || "",
              },
              create: {
                shopDomain: session.shop,
                supplierCode: suppCode,
                supplierName: r["Supplier Name"] || "Untitled Supplier",
                contactPerson: r["Contact Person"] || "",
                email: r["Email"] || "",
                phone: r["Phone"] || r["Phone Number"] || "",
                leadTimeDays: Math.round(cleanNum(r["Lead Time (Days)"] || "7")),
                paymentTerms: r["Payment Terms"] || "",
                minimumOrderValue: cleanNum(r["Minimum Order Value (INR)"] || "0"),
                status: activeStatus,
                notes: r["Notes"] || "",
              },
            });
          } catch (err) {
            console.error("Error inserting Supplier row:", r, err);
          }
        }
      }

      // Process SKUs linked to Suppliers (Bulk Batch Insert)
      if (stagedMap.skus && Array.isArray(stagedMap.skus)) {
        const skuMapsToInsert: any[] = [];
        for (const r of stagedMap.skus) {
          try {
            const skuVal = r["SKU"] || r["sku"] || r["SKU Code"] || r["Product SKU"];
            const suppCode = r["Supplier Code"] || r["supplierCode"] || r["Supplier ID"];
            if (!skuVal || !suppCode) continue;

            const skuStr = skuVal.toString().trim();
            const suppCodeStr = suppCode.toString().trim();

            if (
              skuStr.toLowerCase().includes("variant code") ||
              skuStr.toLowerCase().includes("unique sku") ||
              suppCodeStr.toLowerCase().includes("from the suppliers template")
            ) {
              continue;
            }

            const rawPackSize = r["Pack Size / Unit"] ?? r["Pack Size"] ?? "";
            const packSizeStr = rawPackSize !== undefined && rawPackSize !== null ? rawPackSize.toString().trim() : "";

            skuMapsToInsert.push({
              shopDomain: session.shop,
              sku: skuStr,
              supplierCode: suppCodeStr,
              supplierSku: (r["Supplier SKU"] || r["Supplier SKU (Optional)"] || "").toString(),
              unitCost: cleanNum(r["Unit Cost (INR)"] || r["Selling Price (INR)"] || "0"),
              leadTimeDays: Math.round(cleanNum(r["Lead Time (Days)"] || "7")),
              moq: Math.round(cleanNum(r["MOQ"] || "0")),
              packSize: packSizeStr,
              isPreferred: r["Preferred Supplier"]?.toString().trim().toLowerCase() === "yes",
            });
          } catch (err) {
            console.error("Error staging SkuSupplierMap row:", r, err);
          }
        }

        if (skuMapsToInsert.length > 0) {
          const chunkSize = 500;
          for (let i = 0; i < skuMapsToInsert.length; i += chunkSize) {
            await prisma.skuSupplierMap.createMany({
              data: skuMapsToInsert.slice(i, i + chunkSize),
            });
          }
        }
      }

      // Process Purchase Orders (Bulk Batch Insert)
      if (stagedMap.po && Array.isArray(stagedMap.po)) {
        const posToInsert: any[] = [];
        for (let idx = 0; idx < stagedMap.po.length; idx++) {
          try {
            const r = stagedMap.po[idx];
            const rawPoNum = r["PO Number"] || r["poNumber"] || r["PO #"];
            if (!rawPoNum) continue;

            const basePoStr = rawPoNum.toString().trim();
            if (
              basePoStr.toLowerCase().includes("purchase order number") ||
              basePoStr.toLowerCase().includes("po number")
            ) continue;

            const skuStr = (r["SKU"] || "").toString().trim();
            const poNum = skuStr ? `${basePoStr}__${skuStr}` : `${basePoStr}__row${idx + 1}`;

            posToInsert.push({
              shopDomain: session.shop,
              poNumber: poNum,
              supplierCode: r["Supplier Code"] || "",
              sku: skuStr,
              productName: r["Product Name"] || "Untitled Item",
              orderedQuantity: Math.round(cleanNum(r["Ordered Qty"] || r["Ordered Quantity"] || "0")),
              unitCost: cleanNum(r["Unit Cost (INR)"] || "0"),
              receivedQuantity: Math.round(cleanNum(r["Received Qty"] || r["Received Quantity"] || "0")),
              poStatus: r["PO Status"] || "Open",
            });
          } catch (err) {
            console.error("Error staging PurchaseOrder row:", err);
          }
        }

        if (posToInsert.length > 0) {
          const chunkSize = 500;
          for (let i = 0; i < posToInsert.length; i += chunkSize) {
            await prisma.purchaseOrder.createMany({
              data: posToInsert.slice(i, i + chunkSize),
            });
          }
        }
      }

      // Process Historical Sales (Bulk Batch Insert — 100x Faster, Prevents Cloudflare Timeout)
      if (stagedMap.sales && Array.isArray(stagedMap.sales)) {
        const salesToInsert: any[] = [];
        for (let idx = 0; idx < stagedMap.sales.length; idx++) {
          try {
            const r = stagedMap.sales[idx];
            const skuVal = r["SKU"] || r["sku"] || r["SKU Code"] || r["Product SKU"];
            if (!skuVal) continue;

            const skuStr = skuVal.toString().trim();
            if (skuStr.toLowerCase().includes("product sku") || skuStr.toLowerCase().includes("variant code")) continue;

            let saleDate = new Date();
            const rawDate = r["Date"] || r["Date *"] || r["Order Date"];
            if (rawDate) {
              if (typeof rawDate === "number") {
                saleDate = new Date(Math.round((rawDate - 25569) * 86400 * 1000));
              } else {
                const parsed = new Date(rawDate);
                if (!isNaN(parsed.getTime())) saleDate = parsed;
              }
            }

            const qtySoldVal = Math.round(cleanNum(r["Quantity Sold"] || r["Quantity"] || r["Units Sold"] || "0"));

            salesToInsert.push({
              shopDomain: session.shop,
              date: saleDate,
              orderId: r["Order ID"] ? r["Order ID"].toString().trim() : `#SALE-${Date.now()}-${idx}`,
              sku: skuStr,
              productName: r["Product Name"] || r["Product"] || "",
              quantitySold: qtySoldVal,
              unitSellingPrice: cleanNum(r["Selling Price (INR)"] || r["Price"] || "0"),
              discount: cleanNum(r["Discount (INR)"] || "0"),
              returnQuantity: Math.round(cleanNum(r["Returns Qty"] || r["Return Quantity"] || "0")),
              salesChannel: r["Sales Channel"] || "Manual Import",
            });
          } catch (err) {
            console.error("Error staging HistoricalSale row:", err);
          }
        }

        if (salesToInsert.length > 0) {
          const chunkSize = 500;
          for (let i = 0; i < salesToInsert.length; i += chunkSize) {
            await prisma.historicalSale.createMany({
              data: salesToInsert.slice(i, i + chunkSize),
            });
          }
        }
      }
    }

    // Mark isOnboardedData = true in database
    await prisma.shop.update({
      where: { shopDomain: session.shop },
      data: {
        isOnboardedData: true,
      },
    });

    return shopifyRedirect("/app");
  }

  return null;
};

export default function OnboardingDataImport() {
  const { shop } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const [storeConnected, setStoreConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [stagedData, setStagedData] = useState<Record<string, any[]>>({});
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Handle Shopify Data Sync Response
  useEffect(() => {
    if (actionData && "actionType" in actionData && actionData.actionType === "sync_shopify") {
      setIsSyncing(false);
      if (actionData.success) {
        setStoreConnected(true);
        setSuccessMessage(actionData.message || "Shopify store connected & synced!");
      } else if (actionData.error) {
        setErrorMessage(actionData.error);
      }
    }
  }, [actionData]);

  // Hidden File Input Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-dismiss Toast notifications after 3 seconds
  useEffect(() => {
    if (errorMessage || successMessage) {
      const timer = setTimeout(() => {
        setErrorMessage(null);
        setSuccessMessage(null);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [errorMessage, successMessage]);

  // Trigger Template Download (Directly downloads .xlsx file from Google Drive)
  const handleDownloadTemplate = (categoryKey: string) => {
    const templateConfig = TEMPLATES[categoryKey];
    if (!templateConfig) return;

    if (templateConfig.driveUrl) {
      // Convert any Google Drive share link (/edit...) to direct export download URL (/export?format=xlsx)
      let directUrl = templateConfig.driveUrl;
      const docIdMatch = directUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (docIdMatch && docIdMatch[1]) {
        directUrl = `https://docs.google.com/spreadsheets/d/${docIdMatch[1]}/export?format=xlsx`;
      }

      const link = document.createElement("a");
      link.href = directUrl;
      link.setAttribute("download", templateConfig.fileName);
      link.setAttribute("target", "_blank");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      const csvContent = Papa.unparse({
        fields: templateConfig.headers,
        data: [templateConfig.sampleRow],
      });

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", templateConfig.fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Open OS File Manager
  const handleTriggerUpload = (categoryKey: string) => {
    setActiveCategory(categoryKey);
    setErrorMessage(null);
    setSuccessMessage(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  // Handle File Selected from OS File Manager
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeCategory) return;

    parseAndValidateFile(file, activeCategory);
  };

  // Drag & Drop Handler
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    // Default to 'products' category if dropped directly in zone
    parseAndValidateFile(file, activeCategory || "products");
  };

// Flexible column header normalizer to support variations and annotations (e.g. Product Name *, Unit Cost (INR) (Your Cost) *)
const normalizeHeaderName = (headerName: string): string => {
  if (!headerName) return "";

  // Cleaned version (strips newlines, *, (Optional), (Your Cost), etc.) — used as fallback
  const cleaned = headerName
    .replace(/[\r\n]+/g, " ")
    .replace(/\*/g, "")
    .replace(/\(optional\)/gi, "")
    .replace(/\(your cost\)/gi, "")
    .replace(/\(e\.g\.[^)]*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const h = cleaned.toLowerCase();

  // 1. SPECIFIC MULTI-WORD HEADERS (Check these BEFORE single-word checks)
  if (h.includes("product name") || h === "product" || h === "item name" || h.includes("name of the product")) return "Product Name";
  if (h.includes("supplier sku")) return "Supplier SKU";
  if (h.includes("supplier code") || h.includes("supplier id") || h.includes("supplier_code")) return "Supplier Code";
  if (h.includes("supplier name")) return "Supplier Name";
  if (h.includes("lead time") || h.includes("delivery time")) return "Lead Time (Days)";
  if (h.includes("unit cost") || h.includes("purchase cost")) return "Unit Cost (INR)";
  if (h.includes("unit selling price") || h.includes("selling price") || h.includes("unit price")) return "Selling Price (INR)";
  if (h.includes("current stock") || h.includes("on hand") || h.includes("available quantity")) return "Current Stock (On Hand)";
  if (h.includes("reorder point") || h.includes("reorder")) return "Reorder Point";
  if (h.includes("safety stock") || h.includes("safety")) return "Safety Stock";
  if (h.includes("active (yes/no)") || h === "active" || (h.includes("active") && !h.includes("inactive"))) return "Active (Yes/No)";
  if (h.includes("contact person") || h === "contact") return "Contact Person";
  if (h.includes("payment terms")) return "Payment Terms";
  if (h.includes("minimum order value") || h.includes("mov")) return "Minimum Order Value (INR)";
  if (h.includes("pack size") || h.includes("pack")) return "Pack Size / Unit";
  if (h.includes("preferred supplier") || h.includes("preferred")) return "Preferred Supplier";
  if (h.includes("po number") || h.includes("po #") || h === "po") return "PO Number";
  if (h.includes("po date")) return "PO Date";
  if (h.includes("ordered qty") || h.includes("ordered quantity") || h.includes("units ordered")) return "Ordered Qty";
  if (h.includes("expected delivery")) return "Expected Delivery Date";
  if (h.includes("received qty") || h.includes("received quantity")) return "Received Qty";
  if (h.includes("po status")) return "PO Status";
  if (h.includes("quantity sold") || h.includes("units sold") || h === "qty sold" || h === "qty") return "Quantity Sold";
  if (h.includes("moq") || h.includes("min order qty") || h.includes("minimum order qty")) return "MOQ";
  if (h.includes("discount")) return "Discount (INR)";
  if (h.includes("returns qty") || h.includes("return quantity") || h.includes("returns")) return "Returns Qty";
  if (h.includes("sales channel") || h.includes("channel")) return "Sales Channel";
  if (h.includes("order id") || h.includes("order #")) return "Order ID";
  if (h === "date" || h.includes("order date") || h.includes("sale date")) return "Date";
  if (h.includes("notes")) return "Notes";
  if (h === "status") return "Status";

  // 2. GENERIC SKU CHECK (Only if not Supplier SKU)
  if (h === "sku" || h === "product sku" || h.includes("sku code") || h.includes("unique sku") || (h.includes("sku") && !h.includes("supplier"))) return "SKU";

  // Fallback: return cleaned header (with * and (Optional) stripped) to avoid raw annotations polluting keys
  return cleaned;
};

  // Parse & Validate CSV or XLSX/XLS Headers
  const parseAndValidateFile = (file: File, categoryKey: string) => {
    const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");

    const validateAndSubmit = (rawFileHeaders: string[], rawRowsData: any[]) => {
      // rawFileHeaders and rawRowsData already have normalized keys from callers
      const fileHeaders = rawFileHeaders;
      const normalizedRows = rawRowsData;

      // Prioritize activeCategory if user clicked a specific card button, otherwise auto-detect category by filename or required headers
      let targetKey = activeCategory || categoryKey;

      if (!activeCategory) {
        const fileNameLc = file.name.toLowerCase();
        if (fileNameLc.includes("sku") || fileNameLc.includes("skus")) {
          targetKey = "skus";
        } else if (fileNameLc.includes("supplier")) {
          targetKey = "suppliers";
        } else if (fileNameLc.includes("purchase") || fileNameLc.includes("po")) {
          targetKey = "po";
        } else if (fileNameLc.includes("sales") || fileNameLc.includes("historical")) {
          targetKey = "sales";
        } else if (fileNameLc.includes("product") || fileNameLc.includes("inventory")) {
          targetKey = "products";
        } else {
          // Auto-detect by checking which category has all required headers present
          for (const [key, config] of Object.entries(TEMPLATES)) {
            const reqs = config.requiredHeaders || config.headers;
            if (reqs.every((h) => fileHeaders.includes(h))) {
              targetKey = key;
              break;
            }
          }
        }
      }

      const templateConfig = TEMPLATES[targetKey] || TEMPLATES[categoryKey];
      const requiredList = templateConfig.requiredHeaders || templateConfig.headers;
      const finalMissing = requiredList.filter((h) => !fileHeaders.includes(h));

      if (finalMissing.length > 0) {
        setErrorMessage(
          `Validation Failed for ${file.name}! Missing columns: ${finalMissing.join(", ")}`
        );
        return;
      }

      // Valid headers! Stage normalized rows locally in React state — do NOT store in database yet!
      setStagedData((prev) => ({
        ...prev,
        [targetKey]: normalizedRows,
      }));

      if (!uploadedFiles.includes(targetKey)) {
        setUploadedFiles((prev) => [...prev, targetKey]);
      }
      setSuccessMessage(`File "${file.name}" verified & staged! Click "Start Import" to save.`);
    };

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];

          // Read 2D array of all cells
          const raw2D: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
          if (!raw2D || raw2D.length === 0) {
            setErrorMessage(`Uploaded Excel file "${file.name}" is empty!`);
            return;
          }

          // Scan top 15 rows to find the best header row (highest score of recognized normalized names)
          let headerIdx = 0;
          let maxMatchCount = 0;

          for (let i = 0; i < Math.min(15, raw2D.length); i++) {
            const rowCells = (raw2D[i] || []).map((c) => c.toString().trim().toLowerCase());
            const matchCount = rowCells.filter((c) =>
              c.includes("sku") ||
              c.includes("supplier code") ||
              c.includes("supplier name") ||
              c.includes("product name") ||
              c.includes("unit cost") ||
              c.includes("quantity sold") ||
              c.includes("ordered qty") ||
              c.includes("po number") ||
              c.includes("lead time") ||
              c.includes("current stock") ||
              c === "date" ||
              c === "status"
            ).length;

            if (matchCount > maxMatchCount) {
              maxMatchCount = matchCount;
              headerIdx = i;
            }
          }

          // Build raw headers (original strings from Excel)
          const rawHeaders = (raw2D[headerIdx] || []).map((c) => c.toString().trim());
          // Build normalized headers for row objects so server action key lookups work
          const normalizedHeaderKeys = rawHeaders.map((h) => normalizeHeaderName(h));
          const rowsObjects: Record<string, any>[] = [];

          for (let i = headerIdx + 1; i < raw2D.length; i++) {
            const row = raw2D[i];
            if (!row || row.every((cell: any) => cell === "" || cell === null || cell === undefined)) continue;

            const obj: Record<string, any> = {};
            normalizedHeaderKeys.forEach((normH, colIdx) => {
              if (normH) obj[normH] = row[colIdx] !== undefined ? row[colIdx] : "";
            });
            rowsObjects.push(obj);
          }

          // Use normalized keys as fileHeaders for validation
          const fileHeaders = normalizedHeaderKeys.filter(Boolean);
          validateAndSubmit(fileHeaders, rowsObjects);
        } catch (err: any) {
          setErrorMessage(`Failed to read Excel file: ${err.message}`);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const rawFields = results.meta.fields || [];
          // Normalize header names for consistent key lookups
          const normalizedFields = rawFields.map((h) => normalizeHeaderName(h));
          const normalizedRows = (results.data as Record<string, any>[]).map((row) => {
            const newRow: Record<string, any> = {};
            rawFields.forEach((rawH, idx) => {
              const normH = normalizedFields[idx];
              if (normH) newRow[normH] = row[rawH];
            });
            return newRow;
          });
          validateAndSubmit(normalizedFields.filter(Boolean), normalizedRows);
        },
        error: (err) => {
          setErrorMessage(`Failed to read CSV file: ${err.message}`);
        },
      });
    }
  };

  const isNavigatingImport =
    isImporting ||
    (navigation.state !== "idle" && navigation.formData?.get("actionType") === "finish_setup");

  const handleStartImport = () => {
    setIsImporting(true);
    const formData = new FormData();
    formData.append("actionType", "finish_setup");
    formData.append("connected", storeConnected ? "true" : "false");
    formData.append("stagedPayload", JSON.stringify(stagedData));

    submit(formData, { method: "post" });
  };

  return (
    <div className="min-h-screen bg-[#f1f1f1] text-slate-900 font-sans p-6 md:p-10">
      {/* HIDDEN FILE INPUT FOR OS FILE MANAGER */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".csv, .xlsx, .xls"
        className="hidden"
      />

      <div className="max-w-7xl mx-auto space-y-6">

      {/* FLOATING TOAST NOTIFICATIONS */}
      {(errorMessage || successMessage) && (
        <div className="fixed bottom-6 right-6 z-50 max-w-lg w-full animate-bounce-short">
          {errorMessage && (
            <div className="bg-slate-900 border border-red-500/40 text-white rounded-2xl p-4 shadow-2xl flex items-start gap-3.5 backdrop-blur-md">
              <div className="w-8 h-8 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center shrink-0 mt-0.5">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="flex-1 pr-2">
                <h4 className="text-xs font-bold text-red-400">Validation Error</h4>
                <p className="text-xs text-slate-200 mt-0.5 leading-relaxed">{errorMessage}</p>
              </div>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors text-xs font-bold shrink-0"
              >
                ✕
              </button>
            </div>
          )}

          {successMessage && !errorMessage && (
            <div className="bg-slate-900 border border-green-500/40 text-white rounded-2xl p-4 shadow-2xl flex items-start gap-3.5 backdrop-blur-md">
              <div className="w-8 h-8 rounded-xl bg-green-500/20 text-green-400 flex items-center justify-center shrink-0 mt-0.5">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="flex-1 pr-2">
                <h4 className="text-xs font-bold text-green-400">Template Staged</h4>
                <p className="text-xs text-slate-200 mt-0.5 leading-relaxed">{successMessage}</p>
              </div>
              <button
                type="button"
                onClick={() => setSuccessMessage(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors text-xs font-bold shrink-0"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}

        {/* TOP BAR: DATE PICKER & HEADER */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-violet-100 text-violet-600 flex items-center justify-center shadow-sm">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Import your data to get started
              </h1>
              <p className="text-sm text-slate-500">
                Bring your data into StockPilot to unlock insights and better inventory control.
              </p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 shadow-sm">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span>18 July - 25 July 2026</span>
            <span className="text-slate-400 ml-1">▼</span>
          </div>
        </div>

        {/* MAIN LAYOUT GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* LEFT COLUMN: IMPORT OPTIONS */}
          <div className="lg:col-span-8 space-y-6">

            {/* SECTION 1: CONNECT SHOPIFY STORE */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-sm relative overflow-hidden">
              <div className="flex items-start gap-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center border border-green-100 shrink-0">
                    <img
                      src="https://cdn.shopify.com/static/images/logos/shopify-bag.png"
                      alt="Shopify"
                      width="40"
                    />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center ring-2 ring-white">
                    <Link2 className="w-3.5 h-3.5" />
                  </div>
                </div>

                <div className="space-y-4 flex-1">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      1. Connect your Shopify store
                      <span className="text-xs font-semibold text-violet-600 bg-violet-50 px-2.5 py-0.5 rounded-full">
                        Recommended
                      </span>
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                      Connect your Shopify store to automatically import products, inventory, historical sales and locations.
                    </p>
                  </div>

                  {/* 3 FEATURES ROW */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                    <div className="flex items-start gap-2.5">
                      <ShieldCheck className="w-5 h-5 text-violet-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-semibold text-slate-900">Secure & read-only access</h4>
                        <p className="text-[11px] text-slate-500">We never modify your store data</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <RefreshCw className="w-5 h-5 text-violet-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-semibold text-slate-900">Auto-sync inventory & sales</h4>
                        <p className="text-[11px] text-slate-500">Keep your data up-to-date</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <Zap className="w-5 h-5 text-violet-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-semibold text-slate-900">Save time & reduce errors</h4>
                        <p className="text-[11px] text-slate-500">No manual uploads needed</p>
                      </div>
                    </div>
                  </div>

                  {/* BUTTON ACTION */}
                  <div className="flex items-center gap-4 pt-2">
                    <button
                      type="button"
                      disabled={isSyncing}
                      onClick={() => {
                        setIsSyncing(true);
                        setErrorMessage(null);
                        setSuccessMessage(null);
                        const formData = new FormData();
                        formData.append("actionType", "sync_shopify");
                        submit(formData, { method: "post" });
                      }}
                      className={`px-6 py-3 rounded-xl font-semibold text-sm transition-all flex items-center gap-2.5 shadow-sm ${
                        isSyncing
                          ? "bg-violet-400 text-white cursor-wait"
                          : storeConnected
                          ? "bg-green-600 text-white"
                          : "bg-violet-600 hover:bg-violet-700 text-white"
                      }`}
                    >
                      {isSyncing ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Fetching & Syncing Store Data...</span>
                        </>
                      ) : storeConnected ? (
                        <span>Store Connected & Synced ✓</span>
                      ) : (
                        <span>Connect Shopify Store</span>
                      )}
                    </button>

                    <a href="#how-it-works" className="text-xs font-semibold text-violet-600 hover:underline flex items-center gap-1">
                      Learn how it works <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION 2: MANUAL DATA UPLOAD CARDS */}
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  2. Or upload your data manually
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Upload CSV or Excel files. You can upload one by one or multiple files together.
                </p>
              </div>

              {/* 5 MANUAL CARDS GRID */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  {
                    id: "products",
                    title: "Products & Inventory",
                    desc: "Upload your product list, stock levels, SKU details & attributes.",
                    icon: Package,
                  },
                  {
                    id: "suppliers",
                    title: "Suppliers",
                    desc: "Upload your supplier master data and contact details.",
                    icon: ShoppingCart,
                  },
                  {
                    id: "skus",
                    title: "SKUs linked to Suppliers",
                    desc: "Map your SKUs with suppliers, unit cost, pack size, MOQ etc.",
                    icon: Boxes,
                  },
                  {
                    id: "po",
                    title: "Purchase Orders",
                    desc: "Upload your outstanding and open purchase orders.",
                    icon: FileText,
                  },
                  {
                    id: "sales",
                    title: "Historical Sales",
                    desc: "Upload your historical sales data for better forecasting.",
                    icon: TrendingUp,
                  },
                ].map((item) => {
                  const IconComp = item.icon;
                  const isUploaded = uploadedFiles.includes(item.id);
                  return (
                    <div
                      key={item.id}
                      className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between space-y-4 shadow-sm hover:border-violet-300 transition-all"
                    >
                      <div className="space-y-2">
                        <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
                          <IconComp className="w-5 h-5" />
                        </div>
                        <h4 className="text-xs font-bold text-slate-900 leading-snug">{item.title}</h4>
                        <p className="text-[11px] text-slate-500 leading-relaxed">{item.desc}</p>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => handleTriggerUpload(item.id)}
                          className={`w-full py-2 px-2 border rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                            isUploaded
                              ? "bg-green-50 text-green-700 border-green-200"
                              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>{isUploaded ? "Uploaded ✓" : "Upload file"}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDownloadTemplate(item.id)}
                          className="w-full text-center text-[11px] font-medium text-slate-500 hover:text-violet-600 flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Download className="w-3 h-3" />
                          <span>Download template</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* DRAG AND DROP ZONE */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => handleTriggerUpload("products")}
                className="border-2 border-dashed border-violet-200 bg-[#F9F8FE] rounded-2xl p-8 text-center flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-violet-400 transition-colors"
              >
                <div className="w-14 h-14 rounded-2xl bg-violet-100 text-violet-600 flex items-center justify-center">
                  <Upload className="w-7 h-7" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Drag & drop files here to upload</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    You can upload multiple files at once. <span className="font-semibold">CSV, XLSX files only</span>. Max file size: 25MB
                  </p>
                </div>
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN: SIDEBAR HELP & DATA INFO */}
          <div className="lg:col-span-4 space-y-4">

            {/* CARD 1: WHAT DATA DO WE IMPORT? */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900">What data do we import?</h3>

              <div className="space-y-3.5 text-xs">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                    <Package className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">Products & Inventory</h4>
                    <p className="text-slate-500 text-[11px]">Product details, SKUs, stock levels, variants</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                    <ShoppingCart className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">Suppliers</h4>
                    <p className="text-slate-500 text-[11px]">Supplier details and contact information</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                    <Boxes className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">SKUs linked to Suppliers</h4>
                    <p className="text-slate-500 text-[11px]">Unit cost, pack size, MOQ and more</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">Purchase Orders</h4>
                    <p className="text-slate-500 text-[11px]">Open and outstanding POs</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">Historical Sales</h4>
                    <p className="text-slate-500 text-[11px]">Sales history for forecasting</p>
                  </div>
                </div>
              </div>
            </div>

            {/* CARD 2: IMPORT TIPS */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-3 shadow-sm">
              <div className="flex items-center gap-2 text-amber-500 font-bold text-xs">
                <Lightbulb className="w-4 h-4 fill-current" />
                <h3 className="text-slate-900">Import Tips</h3>
              </div>

              <ul className="space-y-2 text-xs text-slate-600 list-disc list-inside leading-relaxed">
                <li>Use our template for accurate imports.</li>
                <li>Remove any blank rows or columns.</li>
                <li>Date format: YYYY-MM-DD</li>
                <li>Large files may take a few minutes.</li>
              </ul>
            </div>

            {/* CARD 3: NEED HELP? */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-2 shadow-sm">
              <div className="flex items-center gap-2 text-violet-600 font-bold text-xs">
                <HelpCircle className="w-4 h-4" />
                <h3 className="text-slate-900">Need help?</h3>
              </div>
              <p className="text-xs text-slate-500">
                Check our <a href="#guide" className="text-violet-600 font-semibold hover:underline">import guide</a> or <a href="#support" className="text-violet-600 font-semibold hover:underline">contact support</a>
              </p>
            </div>

          </div>

        </div>

        {/* BOTTOM ACTION & SECURITY FOOTER */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 md:px-8 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-green-50 text-green-600 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900">Your data is safe with us</h4>
              <p className="text-[11px] text-slate-500">We use industry-standard encryption and never share your data.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleStartImport}
            disabled={isNavigatingImport || isSyncing}
            className={`w-full md:w-auto px-8 py-3.5 text-white rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-sm ${
              isNavigatingImport
                ? "bg-violet-400 cursor-not-allowed opacity-90"
                : "bg-violet-600 hover:bg-violet-700"
            }`}
          >
            {isNavigatingImport ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Importing Data & Setting Up...</span>
              </>
            ) : (
              <>
                <span>Start Import</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
