/**
 * InventoryHealthChart
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared component used by both the Dashboard (app._index.tsx) and the
 * Insights (app.insights.tsx) pages.
 *
 * Accepts the same four-category counts that both loaders produce:
 *   healthyCount / lowStockCount / outOfStockCount / slowStockCount
 *
 * Renders an SVG donut chart + legend that is 100% pixel-identical on both pages.
 * ─────────────────────────────────────────────────────────────────────────────
 */

interface InventoryHealthChartProps {
  /** Number of SKUs in each category */
  healthyCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  slowStockCount: number;
  /** Optionally show a card wrapper (default: true) */
  showCard?: boolean;
  /** Optionally show the health-score text in the donut center (default: true) */
  showScore?: boolean;
  /** Optionally show the bottom encouragement banner (default: true) */
  showBanner?: boolean;
  /** Custom badge text in top right header (default: "All SKUs") */
  badgeText?: string;
}

export function InventoryHealthChart({
  healthyCount,
  lowStockCount,
  outOfStockCount,
  slowStockCount,
  showCard = true,
  showScore = true,
  showBanner = true,
  badgeText = "All SKUs",
}: InventoryHealthChartProps) {
  const total = healthyCount + lowStockCount + outOfStockCount + slowStockCount;
  const denom = total > 0 ? total : 1;

  const healthyPct = Math.round((healthyCount / denom) * 100);
  const lowPct = Math.round((lowStockCount / denom) * 100);
  const oosPct = Math.round((outOfStockCount / denom) * 100);
  const slowPct = Math.round((slowStockCount / denom) * 100);

  const healthScore = total > 0 ? healthyPct : 0;
  const scoreLabel =
    healthScore >= 70 ? "Good" : healthScore >= 50 ? "Fair" : total > 0 ? "Critical" : "-";
  const scoreColor =
    healthScore >= 70
      ? "text-emerald-600"
      : healthScore >= 50
      ? "text-amber-600"
      : "text-rose-600";

  // SVG donut uses stroke-dasharray on a circle with circumference ≈ 100
  // (viewBox="0 0 36 36", r=15.9155 → circumference = 2π×15.9155 ≈ 100)
  const CIRC = 100;
  const PATH = "M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831";

  const segments = [
    { pct: healthyPct, color: "#22c55e", offset: 0 },                              // emerald-500
    { pct: lowPct,     color: "#fbbf24", offset: healthyPct },                     // amber-400
    { pct: oosPct,     color: "#f43f5e", offset: healthyPct + lowPct },            // rose-500
    { pct: slowPct,    color: "#8b5cf6", offset: healthyPct + lowPct + oosPct },   // violet-500
  ];

  const legend = [
    { label: "Healthy Stock",      color: "bg-emerald-500", pct: healthyPct, count: healthyCount },
    { label: "Low Stock",          color: "bg-amber-400",   pct: lowPct,     count: lowStockCount },
    { label: "Out of Stock",       color: "bg-rose-500",    pct: oosPct,     count: outOfStockCount },
    { label: "Slow / Dead Stock",  color: "bg-violet-500",  pct: slowPct,    count: slowStockCount },
  ];

  const chart = (
    <>
      {/* HEADER */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-base font-bold text-slate-900">Inventory Health</h3>
        <span className="text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
          {badgeText}
        </span>
      </div>

      {/* DONUT + LEGEND */}
      <div className="flex flex-col sm:flex-row items-center gap-6">
        {/* SVG DONUT */}
        <div className="relative w-36 h-36 shrink-0 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
            {/* Track */}
            <path
              stroke="#f1f5f9"
              strokeWidth="3.5"
              fill="none"
              d={PATH}
            />
            {/* Segments */}
            {segments.map((seg, i) =>
              seg.pct > 0 ? (
                <path
                  key={i}
                  stroke={seg.color}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  fill="none"
                  d={PATH}
                  strokeDasharray={`${seg.pct} ${CIRC}`}
                  strokeDashoffset={-seg.offset}
                />
              ) : null
            )}
          </svg>

          {/* Center text */}
          {showScore && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              {total > 0 ? (
                <>
                  <span className="text-2xl font-black text-slate-900 tracking-tight">
                    {healthScore}
                    <span className="text-xs font-normal text-slate-400">/100</span>
                  </span>
                  <span className={`text-[11px] font-bold ${scoreColor}`}>{scoreLabel}</span>
                </>
              ) : (
                <span className="text-lg font-bold text-slate-300">-</span>
              )}
            </div>
          )}
        </div>

        {/* LEGEND */}
        <div className="space-y-2.5 text-xs flex-1">
          {legend.map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${item.color}`} />
              <span className="text-slate-700 font-medium flex-1">{item.label}</span>
              <span className="font-bold text-slate-900 tabular-nums">
                {item.pct}%{" "}
                <span className="font-normal text-slate-500">({item.count.toLocaleString()})</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* BANNER */}
      {showBanner && (
        <div className="mt-5 bg-emerald-50/70 border border-emerald-100 rounded-xl p-3.5">
          <p className="text-xs text-slate-800 leading-snug">
            {total === 0 ? (
              "No inventory data found for the selected filter."
            ) : healthScore >= 70 ? (
              <>
                <span className="font-bold text-slate-900">You're doing great!</span> Your inventory
                health is better than{" "}
                <span className="font-semibold text-emerald-700">68% of stores</span> like yours.
              </>
            ) : healthScore >= 50 ? (
              <>
                <span className="font-bold text-slate-900">Fair health.</span> Consider restocking{" "}
                <span className="font-semibold text-amber-700">{lowStockCount} low-stock SKUs</span>{" "}
                to improve your score.
              </>
            ) : (
              <>
                <span className="font-bold text-rose-700">Action needed!</span>{" "}
                <span className="font-semibold">{outOfStockCount} SKUs</span> are out of stock.
                Restock urgently to recover revenue.
              </>
            )}
          </p>
        </div>
      )}
    </>
  );

  if (!showCard) return <div>{chart}</div>;

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm flex flex-col justify-between">
      {chart}
    </div>
  );
}
