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
        },
      });
    }
  }

  return { admin, session, redirect, shop };
}

export async function syncShopifyDataToDb(admin: any, shopDomain: string) {
  try {
    let hasNextPage = true;
    let endCursor: string | null = null;
    let totalSyncedProducts = 0;
    let totalSyncedVariants = 0;

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
