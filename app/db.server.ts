import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient;
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient();

export default prisma;

export async function ensureShopData(request: Request, authenticate: any) {
  let authResult;
  try {
    authResult = await authenticate.admin(request);
  } catch (err: any) {
    if (
      err?.message?.includes("closed the connection") ||
      err?.message?.includes("Server has closed the connection") ||
      err?.code === "P1001" ||
      err?.code === "P1017"
    ) {
      console.warn("[Neon DB] Connection closed by serverless pooler. Reconnecting to PostgreSQL...");
      try {
        await prisma.$disconnect();
      } catch (e) {
        // ignore disconnect error
      }
      await prisma.$connect();
      authResult = await authenticate.admin(request);
    } else {
      throw err;
    }
  }
  const { admin, session, redirect } = authResult;
  const shopDomain = session.shop;

  // 1. Check whether shop data already exists in database
  let shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  // 2. If it does not exist, fetch shop data from Shopify Admin API and store it in database
  if (!shop) {
    try {
      const response = await admin.graphql(`
        #graphql
        query getShopDetails {
          shop {
            name
            email
            myshopifyDomain
            currencyCode
            billingAddress {
              country
            }
          }
        }
      `);
      const json = await response.json();
      const shopData = json.data?.shop;

      shop = await prisma.shop.create({
        data: {
          shopDomain,
          name: shopData?.name || shopDomain,
          email: shopData?.email || "",
          currency: shopData?.currencyCode || "USD",
          country: shopData?.billingAddress?.country || null,
          isOnboarded: false,
          connectedToShopify: false,
        },
      });
    } catch (error) {
      console.error("Error fetching shop data from Shopify:", error);
      // Fallback create if API call fails
      shop = await prisma.shop.create({
        data: {
          shopDomain,
          name: shopDomain,
          email: "",
          currency: "USD",
          isOnboarded: false,
          connectedToShopify: false,
        },
      });
    }
  }

  return { admin, session, redirect, shop };
}

/**
 * Source of truth check: returns true if connectedToShopify is true for the given shop.
 */
export async function isShopifySyncEnabled(shopDomain: string): Promise<boolean> {
  if (!shopDomain) return false;
  try {
    const shop = await prisma.shop.findUnique({
      where: { shopDomain },
      select: { connectedToShopify: true },
    });
    return shop?.connectedToShopify === true;
  } catch (err) {
    console.error("Error checking isShopifySyncEnabled:", err);
    return false;
  }
}

/**
 * Update connectedToShopify status for a shop.
 */
export async function setConnectedToShopify(shopDomain: string, connected: boolean) {
  if (!shopDomain) return;
  try {
    await prisma.shop.update({
      where: { shopDomain },
      data: { connectedToShopify: connected },
    });
  } catch (err) {
    console.error("Error setting connectedToShopify:", err);
  }
}

export async function syncShopifyDataToDb(admin: any, shopDomain: string, forceConnect: boolean = true) {
  try {
    if (forceConnect) {
      await setConnectedToShopify(shopDomain, true);
    } else {
      const enabled = await isShopifySyncEnabled(shopDomain);
      if (!enabled) {
        return { success: false, error: "Shopify sync is disabled (connectedToShopify = false)" };
      }
    }

    let hasNextPage = true;
    let endCursor: string | null = null;
    let totalSyncedProducts = 0;
    let totalSyncedVariants = 0;

    const syncedSkus = new Set<string>();

    // 1. Fetch ALL Products, Variants, SKUs, Stock Levels & COGS from Shopify with Cursor Pagination
    while (hasNextPage) {
      const productsRes: any = await admin.graphql(
        `
        #graphql
        query getProductsForSync($cursor: String) {
          products(first: 50, after: $cursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              title
              productType
              vendor
              status
              variants(first: 100) {
                nodes {
                  id
                  title
                  sku
                  price
                  inventoryQuantity
                  inventoryItem {
                    unitCost {
                      amount
                    }
                  }
                }
              }
            }
          }
        }
      `,
        { variables: { cursor: endCursor } }
      );

      const productsJson = await productsRes.json();
      console.log("SYNC DEBUG productsJson keys:", Object.keys(productsJson));

      const rawErrors = productsJson.errors || productsJson.graphQLErrors;
      if (rawErrors) {
        console.error("Shopify GraphQL Sync Error Details:", JSON.stringify(rawErrors, null, 2));
        let errMsg = "";
        if (Array.isArray(rawErrors) && rawErrors.length > 0) {
          errMsg = rawErrors[0]?.message || "";
        } else if (typeof rawErrors === "object") {
          if (Array.isArray(rawErrors.graphQLErrors) && rawErrors.graphQLErrors.length > 0) {
            errMsg = rawErrors.graphQLErrors[0]?.message || "";
          } else if (rawErrors.message) {
            errMsg = rawErrors.message;
          }
        }
        if (errMsg && !productsJson.data?.products?.nodes?.length) {
          throw new Error(`Shopify API error: ${errMsg}`);
        }
      }

      const productsData = productsJson.data?.products;
      const productsList = productsData?.nodes || [];
      hasNextPage = productsData?.pageInfo?.hasNextPage || false;
      endCursor = productsData?.pageInfo?.endCursor || null;

      for (const prod of productsList) {
        totalSyncedProducts++;
        const variantsList = prod.variants?.nodes || [];

        for (const variant of variantsList) {
          totalSyncedVariants++;
          const rawSku = variant.sku ? variant.sku.trim() : "";
          const variantNumericId = variant.id ? variant.id.split("/").pop() : Math.random().toString(36).substring(7);
          const skuCode = rawSku || `SKU-${variantNumericId}`;
          syncedSkus.add(skuCode);

          const stockQty = typeof variant.inventoryQuantity === "number" ? variant.inventoryQuantity : 0;
          const unitCostVal = parseFloat(variant.inventoryItem?.unitCost?.amount || "0.0");
          const priceVal = parseFloat(variant.price || "0.0");

          await prisma.product.upsert({
            where: { sku: skuCode },
            update: {
              productName: prod.title,
              variantName: variant.title,
              category: prod.productType || "General",
              currentStock: stockQty,
              unitCost: unitCostVal,
              sellingPrice: priceVal,
              status: prod.status === "ARCHIVED" ? "Inactive" : "Active",
            },
            create: {
              shopDomain,
              productName: prod.title,
              sku: skuCode,
              variantName: variant.title,
              category: prod.productType || "General",
              currentStock: stockQty,
              unitCost: unitCostVal,
              sellingPrice: priceVal,
              status: prod.status === "ARCHIVED" ? "Inactive" : "Active",
            },
          });

          // Auto-create Supplier stub from product vendor if present
          if (prod.vendor) {
            const supplierCode = `SUP-${prod.vendor.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)}`;
            await prisma.supplier.upsert({
              where: { supplierCode },
              update: { supplierName: prod.vendor },
              create: {
                shopDomain,
                supplierName: prod.vendor,
                supplierCode,
                status: "Active",
              },
            });
          }
        }
      }
    }

    // Hard delete any SKUs in database that no longer exist in Shopify
    if (syncedSkus.size > 0) {
      await prisma.product.deleteMany({
        where: {
          shopDomain,
          sku: { notIn: Array.from(syncedSkus) },
        },
      });
    }

    // 2. Fetch Historical Orders & Sales from Shopify with Cursor Pagination (Non-fatal if read_orders scope is ungranted)
    try {
      let ordersHasNext = true;
      let ordersEndCursor: string | null = null;

      while (ordersHasNext) {
        const ordersRes: any = await admin.graphql(
          `
          #graphql
          query getOrdersForSync($cursor: String) {
            orders(first: 50, after: $cursor) {
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                id
                name
                createdAt
                lineItems(first: 50) {
                  nodes {
                    title
                    sku
                    quantity
                    originalUnitPriceSet {
                      shopMoney {
                        amount
                      }
                    }
                  }
                }
              }
            }
          }
        `,
          { variables: { cursor: ordersEndCursor } }
        );

        const ordersJson = await ordersRes.json();

        const orderErrors = ordersJson.errors || ordersJson.graphQLErrors;
        if (orderErrors && !ordersJson.data?.orders) {
          console.warn("Shopify GraphQL Orders Fetch Warnings/Errors:", JSON.stringify(orderErrors, null, 2));
          break; // Non-fatal if orders read fails or scope is restricted
        }

        const ordersData = ordersJson.data?.orders;
        const ordersList = ordersData?.nodes || [];
        ordersHasNext = ordersData?.pageInfo?.hasNextPage || false;
        ordersEndCursor = ordersData?.pageInfo?.endCursor || null;

        for (const order of ordersList) {
          for (const item of order.lineItems?.nodes || []) {
            const itemSku = item.sku ? item.sku.trim() : "";
            if (!itemSku) continue;
            const priceVal = parseFloat(item.originalUnitPriceSet?.shopMoney?.amount || "0.0");

            await prisma.historicalSale.create({
              data: {
                shopDomain,
                date: new Date(order.createdAt),
                orderId: order.name || order.id,
                sku: itemSku,
                productName: item.title,
                quantitySold: item.quantity,
                unitSellingPrice: priceVal,
                salesChannel: "Shopify Store",
              },
            });
          }
        }
      }
    } catch (ordersErr: any) {
      console.warn("[Shopify Sync] Orders query skipped or permission denied:", ordersErr?.message || ordersErr);
    }

    return { success: true, count: totalSyncedProducts, totalVariants: totalSyncedVariants };
  } catch (error: any) {
    console.error("Error syncing Shopify data to database:", error);
    return { success: false, error: error?.message || String(error) };
  }
}

/**
 * Real-Time Sync: Sync a single product (by GraphQL ID or payload) when product is created/updated in Shopify.
 */
export async function syncSingleProductToDb(
  admin: any,
  shopDomain: string,
  productIdOrPayload: any
) {
  try {
    const enabled = await isShopifySyncEnabled(shopDomain);
    if (!enabled) {
      return { success: false, error: "Shopify sync is disabled (connectedToShopify = false)" };
    }

    let rawId = typeof productIdOrPayload === "object" ? productIdOrPayload?.id : productIdOrPayload;
    if (!rawId) return { success: false, error: "No product ID provided" };

    const productGid = String(rawId).startsWith("gid://")
      ? String(rawId)
      : `gid://shopify/Product/${rawId}`;

    if (admin) {
      const res: any = await admin.graphql(
        `
        #graphql
        query getSingleProduct($id: ID!) {
          product(id: $id) {
            id
            title
            productType
            vendor
            status
            variants(first: 100) {
              nodes {
                id
                title
                sku
                price
                inventoryQuantity
                inventoryItem {
                  unitCost {
                    amount
                  }
                }
              }
            }
          }
        }
      `,
        { variables: { id: productGid } }
      );

      const json = await res.json();
      const prod = json?.data?.product;

      if (prod) {
        const variantsList = prod.variants?.nodes || [];
        const currentProductSkus = new Set<string>();

        for (const variant of variantsList) {
          const rawSku = variant.sku ? variant.sku.trim() : "";
          const variantNumericId = variant.id ? variant.id.split("/").pop() : Math.random().toString(36).substring(7);
          const skuCode = rawSku || `SKU-${variantNumericId}`;
          currentProductSkus.add(skuCode);

          const stockQty = typeof variant.inventoryQuantity === "number" ? variant.inventoryQuantity : 0;
          const unitCostVal = parseFloat(variant.inventoryItem?.unitCost?.amount || "0.0");
          const priceVal = parseFloat(variant.price || "0.0");

          await prisma.product.upsert({
            where: { sku: skuCode },
            update: {
              productName: prod.title,
              variantName: variant.title,
              category: prod.productType || "General",
              currentStock: stockQty,
              unitCost: unitCostVal > 0 ? unitCostVal : undefined,
              sellingPrice: priceVal,
              status: prod.status === "ARCHIVED" ? "Inactive" : "Active",
            },
            create: {
              shopDomain,
              productName: prod.title,
              sku: skuCode,
              variantName: variant.title,
              category: prod.productType || "General",
              currentStock: stockQty,
              unitCost: unitCostVal,
              sellingPrice: priceVal,
              status: prod.status === "ARCHIVED" ? "Inactive" : "Active",
            },
          });

          if (prod.vendor) {
            const supplierCode = `SUP-${prod.vendor.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)}`;
            await prisma.supplier.upsert({
              where: { supplierCode },
              update: { supplierName: prod.vendor },
              create: {
                shopDomain,
                supplierName: prod.vendor,
                supplierCode,
                status: "Active",
              },
            });
          }
        }

        // Delete variants under this product that were removed in Shopify
        if (prod.title) {
          await prisma.product.deleteMany({
            where: {
              shopDomain,
              productName: prod.title,
              sku: { notIn: Array.from(currentProductSkus) },
            },
          });
        }

        return { success: true };
      }
    }

    // Fallback if admin is not available: use webhook payload directly
    if (typeof productIdOrPayload === "object" && productIdOrPayload.variants) {
      const prod = productIdOrPayload;
      const variantsList = prod.variants || [];
      const currentProductSkus = new Set<string>();

      for (const variant of variantsList) {
        const rawSku = variant.sku ? variant.sku.trim() : "";
        const variantNumericId = variant.id ? String(variant.id) : Math.random().toString(36).substring(7);
        const skuCode = rawSku || `SKU-${variantNumericId}`;
        currentProductSkus.add(skuCode);

        const stockQty = typeof variant.inventory_quantity === "number" ? variant.inventory_quantity : 0;
        const priceVal = parseFloat(variant.price || "0.0");

        await prisma.product.upsert({
          where: { sku: skuCode },
          update: {
            productName: prod.title,
            variantName: variant.title,
            category: prod.product_type || "General",
            currentStock: stockQty,
            sellingPrice: priceVal,
            status: prod.status === "archived" ? "Inactive" : "Active",
          },
          create: {
            shopDomain,
            productName: prod.title,
            sku: skuCode,
            variantName: variant.title,
            category: prod.product_type || "General",
            currentStock: stockQty,
            unitCost: priceVal > 0 ? priceVal * 0.6 : 0.0,
            sellingPrice: priceVal,
            status: prod.status === "archived" ? "Inactive" : "Active",
          },
        });
      }

      if (prod.title) {
        await prisma.product.deleteMany({
          where: {
            shopDomain,
            productName: prod.title,
            sku: { notIn: Array.from(currentProductSkus) },
          },
        });
      }

      return { success: true };
    }

    return { success: false, error: "Product data not found" };
  } catch (error: any) {
    console.error("Error in syncSingleProductToDb:", error);
    return { success: false, error: error?.message || String(error) };
  }
}

/**
 * Real-Time Sync: Hard delete products from database when deleted in Shopify.
 */
export async function deleteProductFromDb(
  shopDomain: string,
  payload: any,
  admin?: any
) {
  try {
    const enabled = await isShopifySyncEnabled(shopDomain);
    if (!enabled) {
      return { success: false, error: "Shopify sync is disabled (connectedToShopify = false)" };
    }

    if (admin) {
      await syncShopifyDataToDb(admin, shopDomain);
      return { success: true };
    }

    const rawId = payload?.id;
    if (!rawId) return { success: false, error: "No product ID in payload" };

    // Delete products belonging to this shop matching title
    const title = payload?.title;
    if (title) {
      await prisma.product.deleteMany({
        where: { shopDomain, productName: title },
      });
    }

    // Also if variant SKUs are listed in payload
    if (Array.isArray(payload?.variants)) {
      const skus = payload.variants.map((v: any) => v.sku?.trim()).filter(Boolean);
      if (skus.length > 0) {
        await prisma.product.deleteMany({
          where: { shopDomain, sku: { in: skus } },
        });
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error in deleteProductFromDb:", error);
    return { success: false, error: error?.message || String(error) };
  }
}

/**
 * Real-Time Sync: Insert historical sale & adjust inventory stock when an order is created.
 */
export async function syncSingleOrderToDb(shopDomain: string, orderPayload: any) {
  try {
    const enabled = await isShopifySyncEnabled(shopDomain);
    if (!enabled) {
      return { success: false, error: "Shopify sync is disabled (connectedToShopify = false)" };
    }

    if (!orderPayload || !Array.isArray(orderPayload.line_items)) {
      return { success: false, error: "Invalid order payload" };
    }

    const orderId = orderPayload.name || String(orderPayload.id || "Order");
    const date = orderPayload.created_at ? new Date(orderPayload.created_at) : new Date();

    for (const item of orderPayload.line_items) {
      const itemSku = item.sku ? item.sku.trim() : "";
      if (!itemSku) continue;

      const qty = item.quantity || 1;
      const priceVal = parseFloat(item.price || "0.0");

      await prisma.historicalSale.create({
        data: {
          shopDomain,
          date,
          orderId,
          sku: itemSku,
          productName: item.title || "Order Item",
          quantitySold: qty,
          unitSellingPrice: priceVal,
          salesChannel: "Shopify Store",
        },
      });

      // Decrement product stock on hand
      const existingProduct = await prisma.product.findUnique({
        where: { sku: itemSku },
      });

      if (existingProduct) {
        const newStock = Math.max(0, existingProduct.currentStock - qty);
        await prisma.product.update({
          where: { sku: itemSku },
          data: { currentStock: newStock },
        });
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error in syncSingleOrderToDb:", error);
    return { success: false, error: error?.message || String(error) };
  }
}

/**
 * Real-Time Sync: Update stock when inventory level changes in Shopify.
 */
export async function syncInventoryItemToDb(
  admin: any,
  shopDomain: string,
  payload: any
) {
  try {
    const enabled = await isShopifySyncEnabled(shopDomain);
    if (!enabled) {
      return { success: false, error: "Shopify sync is disabled (connectedToShopify = false)" };
    }

    const inventoryItemId = payload?.inventory_item_id;
    const availableQty = payload?.available;

    if (!inventoryItemId || typeof availableQty !== "number") {
      return { success: false, error: "Invalid inventory payload" };
    }

    if (admin) {
      const itemGid = `gid://shopify/InventoryItem/${inventoryItemId}`;
      const res: any = await admin.graphql(
        `
        #graphql
        query getInventoryItemVariant($id: ID!) {
          inventoryItem(id: $id) {
            id
            variant {
              sku
              inventoryQuantity
            }
          }
        }
      `,
        { variables: { id: itemGid } }
      );

      const json = await res.json();
      const sku = json?.data?.inventoryItem?.variant?.sku?.trim();

      console.log(`Received inventory update for SKU: ${sku} with available quantity: ${availableQty}`);

      if (sku) {
        await prisma.product.updateMany({
          where: { shopDomain, sku },
          data: { currentStock: availableQty },
        });
        return { success: true };
      }
    }

    return { success: false, error: "Inventory item SKU not resolved" };
  } catch (error: any) {
    console.error("Error in syncInventoryItemToDb:", error);
    return { success: false, error: error?.message || String(error) };
  }
}

/**
 * Push product updates from StockPilot to Shopify Admin API if connectedToShopify = true.
 * Automatically creates the product in Shopify if it does not yet exist.
 */
export async function pushProductUpdateToShopify(
  admin: any,
  shopDomain: string,
  data: {
    sku: string;
    productName: string;
    variantName?: string;
    category?: string;
    sellingPrice?: number;
    currentStock?: number;
    unitCost?: number;
  }
) {
  try {
    let enabled = await isShopifySyncEnabled(shopDomain);
    if (!enabled && admin) {
      console.log(`[Shopify Push] Auto-enabling connectedToShopify = true for ${shopDomain}`);
      await setConnectedToShopify(shopDomain, true);
      enabled = true;
    }

    if (!enabled) {
      console.warn(`[Shopify Push] Skipped push to Shopify because connectedToShopify is false for ${shopDomain}`);
      return { success: false, reason: "Shopify sync is disabled (connectedToShopify = false)" };
    }

    if (!admin || (!data.sku && !data.productName)) {
      return { success: false, reason: "Missing admin client or product details" };
    }

    // 1. Search for ProductVariant & InventoryItem by SKU or Title
    let varObj: any = null;
    let productGid: string | null = null;
    let variantGid: string | null = null;
    let inventoryItemGid: string | null = null;

    if (data.sku) {
      try {
        const searchRes: any = await admin.graphql(
          `
          #graphql
          query findVariantForPush($query: String!) {
            productVariants(first: 5, query: $query) {
              nodes {
                id
                price
                inventoryItem {
                  id
                }
                product {
                  id
                  title
                  productType
                }
              }
            }
          }
        `,
          { variables: { query: `sku:${data.sku}` } }
        );

        const searchJson = await searchRes.json();
        const variantsList = searchJson?.data?.productVariants?.nodes || [];
        if (variantsList.length > 0) {
          varObj = variantsList[0];
          productGid = varObj.product?.id;
          variantGid = varObj.id;
          inventoryItemGid = varObj.inventoryItem?.id;
        }
      } catch (e) {
        console.warn("[Shopify Push] SKU query error:", e);
      }
    }

    // Fallback search by Product Title if SKU match failed
    if (!productGid && data.productName) {
      try {
        const titleRes: any = await admin.graphql(
          `
          #graphql
          query findProductByTitle($query: String!) {
            products(first: 20, query: $query) {
              nodes {
                id
                title
                productType
                variants(first: 5) {
                  nodes {
                    id
                    price
                    inventoryItem {
                      id
                    }
                  }
                }
              }
            }
          }
        `,
          { variables: { query: `title:"${data.productName}"` } }
        );
        const titleJson = await titleRes.json();
        let prods = titleJson?.data?.products?.nodes || [];
        let matchProd = prods.find((p: any) => p.title.toLowerCase() === data.productName.toLowerCase()) || prods[0];

        if (!matchProd) {
          const broadRes: any = await admin.graphql(
            `
            #graphql
            query broadSearchProducts {
              products(first: 50) {
                nodes {
                  id
                  title
                  productType
                  variants(first: 5) {
                    nodes {
                      id
                      price
                      inventoryItem {
                        id
                      }
                    }
                  }
                }
              }
            }
          `
          );
          const broadJson = await broadRes.json();
          const allProds = broadJson?.data?.products?.nodes || [];
          matchProd = allProds.find((p: any) => p.title.toLowerCase() === data.productName.toLowerCase());
        }

        if (matchProd) {
          productGid = matchProd.id;
          const vars = matchProd.variants?.nodes || [];
          if (vars.length > 0) {
            variantGid = vars[0].id;
            inventoryItemGid = vars[0].inventoryItem?.id;
          }
        }
      } catch (e) {
        console.warn("[Shopify Push] Title query error:", e);
      }
    }

    // If product does NOT exist in Shopify store, CREATE IT!
    if (!productGid) {
      console.log(`[Shopify Push] Product '${data.productName}' (${data.sku}) not found in Shopify. Creating product...`);
      const createRes: any = await admin.graphql(
        `
        #graphql
        mutation createProductInShopify($input: ProductInput!) {
          productCreate(input: $input) {
            product {
              id
              title
              productType
              variants(first: 5) {
                nodes {
                  id
                  price
                  inventoryItem {
                    id
                  }
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
        {
          variables: {
            input: {
              title: data.productName,
              productType: data.category || "General",
            },
          },
        }
      );

      const createJson = await createRes.json();
      const createdProd = createJson?.data?.productCreate?.product;
      if (createdProd) {
        productGid = createdProd.id;
        const vars = createdProd.variants?.nodes || [];
        if (vars.length > 0) {
          variantGid = vars[0].id;
          inventoryItemGid = vars[0].inventoryItem?.id;
        }
      }
    } else {
      // 2. Update existing Product Title & Product Type
      if (data.productName || data.category) {
        const productInput: any = { id: productGid };
        if (data.productName) productInput.title = data.productName;
        if (data.category) productInput.productType = data.category;

        await admin.graphql(
          `
          #graphql
          mutation updateShopifyProduct($input: ProductInput!) {
            productUpdate(input: $input) {
              product {
                id
                title
                productType
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
          { variables: { input: productInput } }
        );
      }

      // 3. Update existing Variant Price & SKU via productVariantsBulkUpdate
      if (variantGid && productGid) {
        const variantPayload: any = {
          id: variantGid,
          price: (data.sellingPrice || 0).toString(),
          inventoryItem: {
            sku: data.sku,
            ...(data.unitCost !== undefined && data.unitCost >= 0
              ? { cost: data.unitCost.toString() }
              : {}),
          },
        };

        await admin.graphql(
          `
          #graphql
          mutation updateShopifyVariantBulk($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(productId: $productId, variants: $variants) {
              productVariants {
                id
                price
                sku
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
          {
            variables: {
              productId: productGid,
              variants: [variantPayload],
            },
          }
        );
      }
    }

    // 4. Update Inventory Unit Cost & Enable Inventory Tracking
    if (inventoryItemGid) {
      try {
        const inventoryInput: any = { tracked: true };
        if (data.unitCost !== undefined && data.unitCost >= 0) {
          inventoryInput.cost = data.unitCost.toString();
        }

        await admin.graphql(
          `
          #graphql
          mutation updateInventoryItem($id: ID!, $input: InventoryItemInput!) {
            inventoryItemUpdate(id: $id, input: $input) {
              inventoryItem {
                id
                tracked
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
          {
            variables: {
              id: inventoryItemGid,
              input: inventoryInput,
            },
          }
        );
      } catch (invErr: any) {
        console.warn("[Shopify Push] inventoryItemUpdate warning:", invErr?.message);
      }
    }

    // 5. Set Inventory Quantity in Shopify using inventorySetQuantities (API 2026-04+)
    if (inventoryItemGid && data.currentStock !== undefined) {
      try {
        const locRes: any = await admin.graphql(
          `#graphql
          query getLocationsForStockUpdate {
            locations(first: 10) {
              nodes { id }
            }
          }`
        );
        const locJson = await locRes.json();
        const locations = locJson?.data?.locations?.nodes || [];
        const primaryLoc = locations[0];

        if (primaryLoc?.id) {
          const targetStock = Math.max(0, data.currentStock);

          console.log(`[Shopify Push] Setting stock → ${targetStock} at ${primaryLoc.id}...`);

          const setStockRes: any = await admin.graphql(
            `#graphql
            mutation setInventoryQuantities(
              $input: InventorySetQuantitiesInput!
              $idempotencyKey: String!
            ) {
              inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
                inventoryAdjustmentGroup {
                  reason
                }
                userErrors {
                  field
                  message
                }
              }
            }`,
            {
              variables: {
                idempotencyKey: crypto.randomUUID(), // required on 2026-04+
                input: {
                  name: "available",
                  reason: "correction",
                  quantities: [
                    {
                      inventoryItemId: inventoryItemGid,
                      locationId: primaryLoc.id,
                      quantity: targetStock,
                      // 2026-10: mandatory field; null = skip compare-and-swap check
                      changeFromQuantity: null,
                    },
                  ],
                },
              },
            }
          );

          const setStockJson = await setStockRes.json();

          // Surface top-level GraphQL errors too
          const gqlErrors = setStockJson?.errors || setStockJson?.graphQLErrors;
          if (gqlErrors && gqlErrors.length > 0) {
            console.warn(
              "[Shopify Push] inventorySetQuantities GraphQL errors:",
              JSON.stringify(gqlErrors, null, 2)
            );
          }

          const stockErrors = setStockJson?.data?.inventorySetQuantities?.userErrors;

          if (stockErrors && stockErrors.length > 0) {
            console.warn("[Shopify Push] inventorySetQuantities userErrors:", stockErrors);
          } else if (!gqlErrors || gqlErrors.length === 0) {
            console.log(`[Shopify Push] Successfully set stock → ${targetStock} in Shopify!`);
          }
        } else {
          console.warn("[Shopify Push] No active location found in Shopify store");
        }
      } catch (stockErr: any) {
        console.error("[Shopify Push] Error updating stock quantity in Shopify:", stockErr?.message || stockErr);
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error in pushProductUpdateToShopify:", error);
    return { success: false, error: error?.message || String(error) };
  }
}

/**
 * Push product deletion from StockPilot to Shopify Admin API if connectedToShopify = true.
 */
export async function pushProductDeleteToShopify(admin: any, shopDomain: string, sku: string) {
  try {
    const enabled = await isShopifySyncEnabled(shopDomain);
    if (!enabled) {
      return { success: false, reason: "Shopify sync is disabled (connectedToShopify = false)" };
    }

    if (!admin || !sku) {
      return { success: false, reason: "Missing admin client or SKU" };
    }

    let productGid: string | null = null;

    // 1. Search for Product by SKU
    try {
      const searchRes: any = await admin.graphql(
        `
        #graphql
        query findProductForDelete($query: String!) {
          productVariants(first: 5, query: $query) {
            nodes {
              id
              product {
                id
                title
              }
            }
          }
        }
      `,
        { variables: { query: `sku:${sku}` } }
      );

      const searchJson = await searchRes.json();
      const variantsList = searchJson?.data?.productVariants?.nodes || [];
      if (variantsList.length > 0) {
        productGid = variantsList[0].product?.id;
      }
    } catch (e) {
      console.warn("[Shopify Push Delete] SKU query error:", e);
    }

    // Fallback search by title if SKU query returned nothing
    if (!productGid) {
      try {
        const titleRes: any = await admin.graphql(
          `
          #graphql
          query findProductForDeleteByTitle($query: String!) {
            products(first: 5, query: $query) {
              nodes {
                id
                title
              }
            }
          }
        `,
          { variables: { query: `title:${sku}` } }
        );
        const titleJson = await titleRes.json();
        const prods = titleJson?.data?.products?.nodes || [];
        if (prods.length > 0) {
          productGid = prods[0].id;
        }
      } catch (e) {
        console.warn("[Shopify Push Delete] Title query error:", e);
      }
    }

    if (productGid) {
      const deleteRes: any = await admin.graphql(
        `
        #graphql
        mutation deleteProductFromShopify($input: ProductDeleteInput!) {
          productDelete(input: $input) {
            deletedProductId
            userErrors {
              field
              message
            }
          }
        }
      `,
        { variables: { input: { id: productGid } } }
      );
      const deleteJson = await deleteRes.json();
      console.log(`[Shopify Push Delete] Product ${productGid} deleted from Shopify:`, deleteJson?.data?.productDelete);
      return { success: true };
    }

    console.warn(`[Shopify Push Delete] Product with SKU '${sku}' not found in Shopify.`);
    return { success: true, reason: "Product not present in Shopify" };
  } catch (error: any) {
    console.error("Error in pushProductDeleteToShopify:", error);
    return { success: false, error: error?.message || String(error) };
  }
}

