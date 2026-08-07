import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError, redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { ensureShopData } from "../db.server";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "s-app-nav": any;
      "s-link": any;
    }
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop, redirect: shopifyRedirect } = await ensureShopData(request, authenticate);

  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/$/, "");

  const isStep3DataImport = pathname.endsWith("/onboarding-data");
  const isStep12Onboarding = pathname.endsWith("/onboarding");

  // 1. If step 1 & 2 onboarding is not completed and not currently on /app/onboarding ➜ Redirect to /app/onboarding
  if (!shop.isOnboarded && !isStep12Onboarding) {
    return shopifyRedirect("/app/onboarding");
  }

  // 2. If step 1 & 2 is completed BUT step 3 data import (isOnboardedData) is false and not currently on /app/onboarding-data ➜ Redirect to /app/onboarding-data
  if (shop.isOnboarded && !shop.isOnboardedData && !isStep3DataImport) {
    return shopifyRedirect("/app/onboarding-data");
  }

  // 3. If both step 1-2 & step 3 data import are completed, prevent access to onboarding pages and redirect to /app
  if (shop.isOnboarded && shop.isOnboardedData && (isStep12Onboarding || isStep3DataImport)) {
    return shopifyRedirect("/app");
  }

  return { apiKey: process.env.SHOPIFY_API_KEY || "", shop };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Dashboard</s-link>
        <s-link href="/app/inventory">Inventory</s-link>
        <s-link href="/app/reorder">Reorder</s-link>
        <s-link href="/app/insights">Insights</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
