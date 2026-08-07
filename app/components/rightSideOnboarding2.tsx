import React from "react";
import {
  Sparkles,
  TrendingUp,
  ShoppingCart,
  Shield,
  CalendarDays,
  Wand2,
  Bot,
  Lock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Boxes,
} from "lucide-react";

const previewItems = [
  {
    icon: TrendingUp,
    title: "Stockout Risk",
    description:
      "We’ll flag products running low based on your risk threshold.",
    rightLabel: "At Risk when",
    highlight: "≤ 7 days",
    highlightColor: "text-red-500",
    suffix: "of stock remaining",
  },
  {
    icon: ShoppingCart,
    title: "Reorder Recommendation",
    description:
      "Smart quantities calculated using your safety stock and planning horizon.",
    rightLabel: "Example",
    highlight: "150 units",
    highlightColor: "text-violet-600",
    suffix: "recommended",
  },
  {
    icon: Shield,
    title: "Safety Stock",
    description:
      "We’ll keep this additional buffer while planning your reorders.",
    rightLabel: "Target",
    highlight: "14 days",
    highlightColor: "text-green-600",
    suffix: "of cover",
  },
  {
    icon: CalendarDays,
    title: "Planning Horizon",
    description:
      "We’ll look ahead this far when forecasting demand and planning orders.",
    rightLabel: "Planning for next",
    highlight: "30 days",
    highlightColor: "text-blue-600",
    suffix: "",
  },
];

function InfoIconCard({
  icon: Icon,
  title,
  description,
  rightLabel,
  highlight,
  highlightColor,
  suffix,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  rightLabel: string;
  highlight: string;
  highlightColor: string;
  suffix: string;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[1.7fr_0.9fr] border-b border-slate-200 last:border-b-0">
      <div className="flex gap-4 p-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-600">
          <Icon className="h-5 w-5" />
        </div>

        <div>
          <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 max-w-md text-[13px] leading-5 text-slate-600">
            {description}
          </p>
        </div>
      </div>

      <div className="flex flex-col justify-center border-t border-slate-200 px-5 py-4 md:border-l md:border-t-0">
        <span className="text-[12px] font-medium text-slate-500">
          {rightLabel}
        </span>
        <span className={`mt-1 text-[28px] font-bold leading-none ${highlightColor}`}>
          {highlight}
        </span>
        {suffix ? (
          <span className="mt-1 text-[13px] text-slate-600">{suffix}</span>
        ) : null}
      </div>
    </div>
  );
}

export default function StockUpPreferencesPreview() {
  return (
    <div className="min-h-screen bg-[#f7f5fb] px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-[760px]">
        {/* Header */}
        <div className="mb-6 flex items-start gap-3">
          <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 text-violet-600">
            <Sparkles className="h-5 w-5" />
          </div>

          <div>
            <h1 className="text-[34px] font-bold tracking-[-0.02em] text-slate-900">
              How your preferences shape StockUp
            </h1>
            <p className="mt-2 max-w-[620px] text-[15px] leading-6 text-slate-600">
              We’ll use these settings with your Shopify data to forecast demand
              and generate accurate reorder recommendations.
            </p>
          </div>
        </div>

        {/* Main card */}
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[20px] font-semibold text-slate-900">
              Your personalised preview
            </h2>

            <span className="rounded-full bg-violet-50 px-4 py-1.5 text-[12px] font-medium text-violet-600">
              This is just an example
            </span>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200">
            {previewItems.map((item) => (
              <InfoIconCard key={item.title} {...item} />
            ))}
          </div>

          {/* AI section */}
          <div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50 p-5">
            <div className="flex gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600">
                <Wand2 className="h-5 w-5" />
              </div>

              <div>
                <h3 className="text-[16px] font-semibold text-violet-700">
                  StockUp AI
                </h3>
                <p className="mt-1 max-w-[560px] text-[13px] leading-5 text-slate-600">
                  Your AI assistant will use these preferences to prioritise
                  insights, explain recommendations and answer your questions.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-violet-200 bg-white/70 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-600 text-white">
                  <Bot className="h-4 w-4" />
                </div>

                <div className="w-full">
                  <p className="text-[13px] font-medium text-slate-800">
                    What should I prioritise today?
                  </p>

                  <div className="mt-3 inline-block rounded-2xl bg-violet-100 px-4 py-3 text-[13px] leading-5 text-slate-700">
                    <p>I’ve identified 3 products at stockout risk in the next 7 days.</p>
                    <p className="mt-1">
                      I’ve prioritised them based on your{" "}
                      <span className="font-semibold text-violet-700">
                        Balanced
                      </span>{" "}
                      strategy.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Shopify details card */}
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.4fr_0.7fr_0.9fr_1fr] md:items-center">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-50 text-green-600">
                <ShoppingCart className="h-5 w-5" />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <p className="text-[14px] font-semibold text-slate-900">
                    Store details detected from Shopify
                  </p>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                </div>
                <p className="mt-1 text-[12px] text-slate-600">
                  We’ll use your store settings and data automatically.
                </p>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 text-slate-400">
                <CircleDollarSign className="h-4 w-4" />
                <span className="text-[12px] font-medium">Currency</span>
              </div>
              <p className="mt-1 text-[13px] font-medium text-slate-800">INR</p>
            </div>

            <div>
              <div className="flex items-center gap-2 text-slate-400">
                <Clock3 className="h-4 w-4" />
                <span className="text-[12px] font-medium">Time zone</span>
              </div>
              <p className="mt-1 text-[13px] font-medium text-slate-800">
                Asia/Kolkata
              </p>
            </div>

            <div>
              <div className="flex items-center gap-2 text-slate-400">
                <Boxes className="h-4 w-4" />
                <span className="text-[12px] font-medium">
                  Products & variants
                </span>
              </div>
              <p className="mt-1 text-[13px] font-medium text-slate-800">
                Will be synced automatically
              </p>
            </div>
          </div>
        </div>

        {/* Footer note */}
        <div className="mt-4 flex items-center gap-2 text-[12px] text-slate-500">
          <Lock className="h-3.5 w-3.5" />
          <span>You can update these preferences anytime in Settings.</span>
        </div>
      </div>
    </div>
  );
}
