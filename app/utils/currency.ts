/**
 * Currency Formatter Utility for StockUp
 * Automatically formats money amounts with appropriate currency symbol / prefix based on shop currency.
 */

export function getCurrencySymbol(currencyCode?: string | null): string {
  const currency = (currencyCode || "USD").toUpperCase().trim();
  const symbolMap: Record<string, string> = {
    USD: "$",
    INR: "₹",
    EUR: "€",
    GBP: "£",
    CAD: "CA$",
    AUD: "A$",
    JPY: "¥",
    CNY: "¥",
    SGD: "S$",
    NZD: "NZ$",
    AED: "AED ",
  };

  return symbolMap[currency] || `${currency} `;
}

export function formatCurrency(amount: number | undefined | null, currencyCode?: string | null): string {
  const currency = (currencyCode || "USD").toUpperCase().trim();
  const symbol = getCurrencySymbol(currency);
  const val = typeof amount === "number" && !isNaN(amount) ? amount : 0;

  const formattedAmount = val.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  return `${symbol}${formattedAmount}`;
}
