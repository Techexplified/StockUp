-- CreateTable
CREATE TABLE IF NOT EXISTS "Shop" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "currency" TEXT,
    "country" TEXT,
    "isOnboarded" BOOLEAN NOT NULL DEFAULT false,
    "isOnboardedData" BOOLEAN NOT NULL DEFAULT false,
    "connectedToShopify" BOOLEAN NOT NULL DEFAULT false,
    "role" TEXT,
    "goals" TEXT,
    "priority" TEXT,
    "manageSuppliers" TEXT,
    "leadTime" TEXT,
    "safetyStock" TEXT,
    "threshold" TEXT,
    "planningHorizon" TEXT,
    "recStyle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Product" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "variantName" TEXT,
    "category" TEXT,
    "currentStock" INTEGER NOT NULL DEFAULT 0,
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "sellingPrice" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "reorderPoint" INTEGER NOT NULL DEFAULT 0,
    "safetyStock" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Supplier" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "supplierCode" TEXT NOT NULL,
    "contactPerson" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "leadTimeDays" INTEGER NOT NULL DEFAULT 7,
    "paymentTerms" TEXT,
    "minimumOrderValue" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SkuSupplierMap" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "supplierCode" TEXT NOT NULL,
    "supplierSku" TEXT,
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "leadTimeDays" INTEGER NOT NULL DEFAULT 7,
    "moq" INTEGER,
    "packSize" TEXT,
    "isPreferred" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkuSupplierMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "poDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supplierCode" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "orderedQuantity" INTEGER NOT NULL DEFAULT 0,
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "expectedDeliveryDate" TIMESTAMP(3),
    "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
    "poStatus" TEXT NOT NULL DEFAULT 'Pending',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "HistoricalSale" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantitySold" INTEGER NOT NULL DEFAULT 0,
    "unitSellingPrice" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "returnQuantity" INTEGER NOT NULL DEFAULT 0,
    "salesChannel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HistoricalSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AiChatMessage" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Shop_shopDomain_key" ON "Shop"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Product_shopDomain_idx" ON "Product"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Supplier_supplierCode_key" ON "Supplier"("supplierCode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Supplier_shopDomain_idx" ON "Supplier"("shopDomain");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SkuSupplierMap_shopDomain_idx" ON "SkuSupplierMap"("shopDomain");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SkuSupplierMap_sku_idx" ON "SkuSupplierMap"("sku");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SkuSupplierMap_supplierCode_idx" ON "SkuSupplierMap"("supplierCode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseOrder_shopDomain_idx" ON "PurchaseOrder"("shopDomain");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseOrder_poNumber_idx" ON "PurchaseOrder"("poNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PurchaseOrder_sku_idx" ON "PurchaseOrder"("sku");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "HistoricalSale_shopDomain_idx" ON "HistoricalSale"("shopDomain");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "HistoricalSale_orderId_idx" ON "HistoricalSale"("orderId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "HistoricalSale_sku_idx" ON "HistoricalSale"("sku");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiChatMessage_shopDomain_idx" ON "AiChatMessage"("shopDomain");
