import { useState, useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import { Sparkles, Send, X, Loader2, Bot, User } from "lucide-react";

export interface StockPilotAiMetrics {
  totalInventoryValue: number;
  totalActiveSKUs?: number;
  totalStockUnits?: number;
  lowStockCount: number;
  outOfStockCount: number;
  slowDeadCount?: number;
  atRisk7DaysCount?: number;
  totalStockoutRiskVal?: number;
  avgStockCoverageDays?: number;
  totalForecastDemandUnits?: number;
  healthyCount?: number;
}

export interface StockPilotProductItem {
  id?: string;
  productName: string;
  sku: string;
  currentStock: number;
  dailySalesVelocity?: number;
  daysOfStock?: number;
  unitCost?: number;
  sellingPrice?: number;
  itemVal?: number;
}

interface ChatMessage {
  sender: "user" | "ai";
  text: string;
}

interface StockPilotAiChatCardProps {
  metrics: StockPilotAiMetrics;
  products?: StockPilotProductItem[];
  title?: string;
  subtitle?: string;
  onClose?: () => void;
  className?: string;
}

const PRESET_QUESTIONS = [
  "Which products are at risk of stockout?",
  "What should I reorder today?",
  "Show me slow-moving items",
  "Give me an inventory summary",
  "Which SKUs have zero sales in 30 days?",
];

function FormattedChatMessage({ text, isUser }: { text: string; isUser: boolean }) {
  if (isUser) {
    return <div className="whitespace-pre-wrap">{text}</div>;
  }

  const renderInlineBold = (str: string) => {
    const parts = str.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={idx} className="font-extrabold text-slate-900">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });
  };

  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      elements.push(<div key={`empty-${index}`} className="h-1" />);
      return;
    }

    if (trimmed.startsWith("##") || trimmed.startsWith("#")) {
      const headerText = trimmed.replace(/^#+\s*/, "");
      elements.push(
        <h4 key={index} className="font-extrabold text-slate-900 text-xs mt-1 mb-0.5">
          {renderInlineBold(headerText)}
        </h4>
      );
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const bulletText = trimmed.slice(2);
      elements.push(
        <div key={index} className="flex items-start gap-1.5 my-0.5 pl-0.5">
          <span className="text-purple-600 font-bold shrink-0 text-[10px] mt-0.5">•</span>
          <span className="flex-1">{renderInlineBold(bulletText)}</span>
        </div>
      );
    } else if (/^\d+\.\s/.test(trimmed)) {
      const numMatch = trimmed.match(/^(\d+\.)\s*(.*)/);
      if (numMatch) {
        elements.push(
          <div key={index} className="flex items-start gap-1.5 my-0.5 pl-0.5">
            <span className="text-purple-600 font-bold shrink-0 text-[10px]">{numMatch[1]}</span>
            <span className="flex-1">{renderInlineBold(numMatch[2])}</span>
          </div>
        );
      } else {
        elements.push(<p key={index} className="my-0.5">{renderInlineBold(trimmed)}</p>);
      }
    } else {
      elements.push(
        <p key={index} className="my-0.5 leading-relaxed">
          {renderInlineBold(trimmed)}
        </p>
      );
    }
  });

  return <div className="space-y-0.5">{elements}</div>;
}

export function StockPilotAiChatCard({
  title = "StockLyn AI",
  subtitle = "Ask anything about your inventory — powered by real-time data.",
  onClose,
  className,
}: StockPilotAiChatCardProps) {
  const fetcher = useFetcher<{ reply?: string; error?: string }>();
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasStarted, setHasStarted] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const isLoading = fetcher.state !== "idle";

  // Inner container scroll only (prevents full page scroll jump)
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Handle AI response coming back
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.reply) {
        setMessages((prev) => [
          ...prev,
          { sender: "ai", text: fetcher.data!.reply! },
        ]);
      } else if (fetcher.data.error) {
        setMessages((prev) => [
          ...prev,
          {
            sender: "ai",
            text: `⚠️ ${fetcher.data!.error}`,
          },
        ]);
      }
    }
  }, [fetcher.state, fetcher.data]);

  const sendMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    setHasStarted(true);
    setMessages((prev) => [...prev, { sender: "user", text: trimmed }]);
    setChatInput("");

    fetcher.submit(
      { message: trimmed },
      {
        method: "POST",
        action: "/app/api/ai-chat",
        encType: "application/json",
      }
    );
  };

  return (
    <div className={`bg-white rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col h-full max-h-[380px] overflow-hidden relative ${className || ""}`}>
      {/* Decorative glow */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-purple-100/40 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3 relative z-10 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900">{title}</h3>
            <p className="text-[10px] text-slate-500 font-normal leading-tight">
              {subtitle}
            </p>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 cursor-pointer p-1 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Messages area */}
      <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-4 pb-2 space-y-3 min-h-0">
        {!hasStarted && messages.length === 0 ? (
          <div className="space-y-2 pt-1">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1">
              Suggested Questions
            </p>
            {PRESET_QUESTIONS.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => sendMessage(q)}
                disabled={isLoading}
                className="w-full text-left px-3 py-2 rounded-xl bg-purple-50/70 hover:bg-purple-100/70 border border-purple-100/60 text-[11px] font-medium text-slate-700 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <span className="text-purple-400 text-xs shrink-0">💡</span>
                <span className="line-clamp-1">{q}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-3 pt-2">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 ${
                  msg.sender === "user" ? "flex-row-reverse" : ""
                }`}
              >
                {/* Avatar */}
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                    msg.sender === "user"
                      ? "bg-purple-600"
                      : "bg-slate-100 border border-slate-200"
                  }`}
                >
                  {msg.sender === "user" ? (
                    <User className="w-3 h-3 text-white" />
                  ) : (
                    <Bot className="w-3 h-3 text-purple-600" />
                  )}
                </div>

                {/* Bubble */}
                <div
                  className={`max-w-[85%] text-[11px] leading-relaxed rounded-2xl px-3 py-2 ${
                    msg.sender === "user"
                      ? "bg-purple-600 text-white rounded-tr-sm whitespace-pre-wrap"
                      : "bg-slate-50 border border-slate-200/70 text-slate-800 rounded-tl-sm"
                  }`}
                >
                  <FormattedChatMessage text={msg.text} isUser={msg.sender === "user"} />
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-3 h-3 text-purple-600" />
                </div>
                <div className="bg-slate-50 border border-slate-200/70 rounded-2xl rounded-tl-sm px-3 py-2 flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 text-purple-500 animate-spin" />
                  <span className="text-[11px] text-slate-500 font-medium">
                    Analyzing inventory data...
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="px-4 pb-4 pt-2 shrink-0 border-t border-slate-100 mt-1">
        <div className="relative">
          <input
            type="text"
            placeholder="Ask about your inventory..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(chatInput);
              }
            }}
            disabled={isLoading}
            className="w-full pl-3.5 pr-11 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-400/20 focus:border-purple-400 transition-all font-normal disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => sendMessage(chatInput)}
            disabled={!chatInput.trim() || isLoading}
            className="absolute right-1.5 top-1.5 w-7 h-7 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            {isLoading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Send className="w-3 h-3" />
            )}
          </button>
        </div>
        {/* <p className="text-[10px] text-center text-slate-400 font-normal mt-1.5">
          Powered by OpenRouter · gpt-4o-mini · Live DB data
        </p> */}
      </div>
    </div>
  );
}

export const StockUpAiChatCard = StockPilotAiChatCard;
