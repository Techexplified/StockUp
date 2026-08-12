import { useState, useRef } from "react";
import {
  Sparkles,
  X,
  Copy,
  Download,
  Check,
  RefreshCw,
  Loader2,
  Calendar,
  AlertCircle,
  FileText,
  Printer,
} from "lucide-react";

interface AiReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportName: string;
  reportDescription: string;
  reportData: {
    generatedAt?: string;
    content?: string;
    rawItems?: any[];
    error?: string;
  } | null;
  isLoading: boolean;
  onRegenerate: () => void;
}

export function AiReportModal({
  isOpen,
  onClose,
  reportName,
  reportDescription,
  reportData,
  isLoading,
  onRegenerate,
}: AiReportModalProps) {
  const [copied, setCopied] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (reportData?.content) {
      navigator.clipboard.writeText(reportData.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleDownloadPdf = () => {
    if (!reportRef.current || !reportData?.content) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Please allow popups to download the PDF report.");
      return;
    }

    const reportHtml = reportRef.current.innerHTML;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${reportName} - StockLyn AI</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
            body {
              font-family: 'Inter', system-ui, -apple-system, sans-serif;
              color: #0f172a;
              background-color: #ffffff;
              padding: 40px;
              margin: 0;
              font-size: 13px;
              line-height: 1.6;
            }
            .header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              border-bottom: 2px solid #7c3aed;
              padding-bottom: 16px;
              margin-bottom: 24px;
            }
            .title {
              font-size: 22px;
              font-weight: 800;
              color: #0f172a;
              margin: 0;
            }
            .subtitle {
              font-size: 12px;
              color: #64748b;
              margin-top: 4px;
            }
            .badge {
              background-color: #f3e8ff;
              color: #7c3aed;
              padding: 4px 10px;
              border-radius: 6px;
              font-weight: 700;
              font-size: 11px;
              text-transform: uppercase;
            }
            .meta-bar {
              background-color: #f8fafc;
              border: 1px solid #e2e8f0;
              padding: 10px 16px;
              border-radius: 8px;
              margin-bottom: 24px;
              font-size: 11px;
              color: #475569;
              display: flex;
              justify-content: space-between;
            }
            h1, h2, h3, h4 {
              color: #0f172a;
              font-weight: 700;
              margin-top: 20px;
              margin-bottom: 10px;
            }
            h2 {
              font-size: 16px;
              border-bottom: 1px solid #e2e8f0;
              padding-bottom: 6px;
            }
            h3 {
              font-size: 14px;
            }
            ul, ol {
              padding-left: 20px;
              margin-bottom: 16px;
            }
            li {
              margin-bottom: 4px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 16px 0;
              font-size: 11px;
            }
            th, td {
              border: 1px solid #cbd5e1;
              padding: 8px 12px;
              text-align: left;
            }
            th {
              background-color: #f1f5f9;
              font-weight: 700;
              color: #1e293b;
              text-transform: uppercase;
            }
            tr:nth-child(even) {
              background-color: #f8fafc;
            }
            .badge-status {
              display: inline-block;
              padding: 2px 6px;
              border-radius: 4px;
              font-weight: 600;
              font-size: 10px;
            }
            @media print {
              body { padding: 0; }
              @page { margin: 1.5cm; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1 class="title">${reportName}</h1>
              <div class="subtitle">${reportDescription}</div>
            </div>
            <div class="badge">StockLyn AI Report</div>
          </div>
          <div class="meta-bar">
            <span>Generated on: <strong>${reportData?.generatedAt || new Date().toLocaleString()}</strong></span>
            <span>Data Source: Live Warehouse Database</span>
          </div>
          <div class="content">
            ${reportHtml}
          </div>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleExportCsv = () => {
    if (!reportData?.rawItems || reportData.rawItems.length === 0) return;

    const headers = [
      "SKU",
      "Product Name",
      "Category",
      "Current Stock",
      "Unit Cost",
      "Selling Price",
      "Daily Sales Velocity",
      "Days of Stock",
      "Supplier",
      "Lead Time (Days)",
      "Stockout Risk",
    ];

    const rows = reportData.rawItems.map((item) => [
      `"${item.sku}"`,
      `"${item.name.replace(/"/g, '""')}"`,
      `"${item.category || ""}"`,
      item.currentStock,
      item.unitCost,
      item.sellingPrice,
      item.dailyVelocity,
      item.daysOfStock,
      `"${item.supplierName || ""}"`,
      item.leadTime,
      item.stockoutRisk7d ? "HIGH RISK" : "Normal",
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `${reportName.toLowerCase().replace(/\s+/g, "_")}_${new Date()
        .toISOString()
        .slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden relative">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  {reportName}
                </h2>
                <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">
                  AI Generated
                </span>
              </div>
              <p className="text-xs text-slate-500 font-normal line-clamp-1 mt-0.5">
                {reportDescription}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-slate-200/50 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 min-h-0 bg-white">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-4 text-center">
              <div className="relative">
                <div className="w-16 h-16 rounded-3xl bg-purple-100 text-purple-600 flex items-center justify-center animate-pulse">
                  <Sparkles className="w-8 h-8" />
                </div>
                <Loader2 className="w-20 h-20 text-purple-600 animate-spin absolute -top-2 -left-2 opacity-30" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Analyzing Real-Time Inventory & Sales Data...
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  StockLyn AI is querying database SKUs, calculating velocity, and compiling strategic recommendations.
                </p>
              </div>
            </div>
          ) : reportData?.error ? (
            <div className="py-12 px-6 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-4 text-rose-800">
              <AlertCircle className="w-6 h-6 shrink-0 text-rose-600 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold">Report Generation Failed</h3>
                <p className="text-xs mt-1">{reportData.error}</p>
                <button
                  type="button"
                  onClick={onRegenerate}
                  className="mt-3 bg-rose-600 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-rose-700 transition-colors inline-flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Try Again
                </button>
              </div>
            </div>
          ) : reportData?.content ? (
            <div className="space-y-4">
              {/* Timestamp banner */}
              <div className="flex items-center justify-between text-xs text-slate-500 bg-purple-50/60 border border-purple-100 rounded-2xl px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-purple-600" />
                  <span>
                    Generated on: <strong>{reportData.generatedAt}</strong>
                  </span>
                </div>
                <span className="text-[11px] font-medium text-purple-700">
                  Live DB Snapshot
                </span>
              </div>

              {/* Rendered Markdown Output */}
              <div
                ref={reportRef}
                className="prose prose-slate max-w-none text-xs leading-relaxed space-y-4"
              >
                <FormattedMarkdown text={reportData.content} />
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer Toolbar */}
        {!isLoading && reportData?.content && (
          <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between gap-4 shrink-0">
            <button
              type="button"
              onClick={onRegenerate}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1.5 px-3 py-2 rounded-xl hover:bg-slate-200/50 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Regenerate</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold px-3.5 py-2 rounded-xl shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                    <span>Copy Text</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleExportCsv}
                className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold px-3.5 py-2 rounded-xl shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
                title="Export raw data CSV"
              >
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                <span>CSV</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadPdf}
                className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download PDF Report</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Markdown Component with Full Table Parser ───────────────────────────────

function FormattedMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: Array<
    | { type: "paragraph"; content: string }
    | { type: "h1"; content: string }
    | { type: "h2"; content: string }
    | { type: "h3"; content: string }
    | { type: "list-item"; content: string }
    | { type: "ordered-item"; content: string }
    | { type: "space" }
    | { type: "table"; headers: string[]; rows: string[][] }
  > = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check if line is part of a markdown table (starts and ends with | or contains multiple |)
    if (trimmed.startsWith("|") && trimmed.includes("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }

      if (tableLines.length >= 2) {
        // Line 0: Header
        const headerCells = tableLines[0]
          .split("|")
          .map((c) => c.trim())
          .filter((c, idx, arr) => idx > 0 && idx < arr.length - 1 || c !== "");

        // Line 1: Alignment divider line (e.g. |---|---|)
        const startIndex =
          tableLines[1] && tableLines[1].includes("---") ? 2 : 1;

        const dataRows: string[][] = [];
        for (let r = startIndex; r < tableLines.length; r++) {
          const cells = tableLines[r]
            .split("|")
            .map((c) => c.trim())
            .filter((c, idx, arr) => idx > 0 && idx < arr.length - 1 || c !== "");
          if (cells.length > 0) {
            dataRows.push(cells);
          }
        }

        blocks.push({
          type: "table",
          headers: headerCells,
          rows: dataRows,
        });
        continue;
      }
    }

    if (trimmed.startsWith("## ")) {
      blocks.push({ type: "h2", content: trimmed.replace("## ", "") });
    } else if (trimmed.startsWith("### ")) {
      blocks.push({ type: "h3", content: trimmed.replace("### ", "") });
    } else if (trimmed.startsWith("# ")) {
      blocks.push({ type: "h1", content: trimmed.replace("# ", "") });
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      blocks.push({ type: "list-item", content: trimmed.substring(2) });
    } else if (/^\d+\.\s/.test(trimmed)) {
      blocks.push({ type: "ordered-item", content: trimmed });
    } else if (trimmed === "") {
      blocks.push({ type: "space" });
    } else {
      blocks.push({ type: "paragraph", content: line });
    }

    i++;
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, idx) => {
        if (block.type === "h1") {
          return (
            <h1 key={idx} className="text-base font-extrabold text-slate-900 mt-4 mb-2">
              {block.content}
            </h1>
          );
        }
        if (block.type === "h2") {
          return (
            <h2
              key={idx}
              className="text-sm font-bold text-slate-900 border-b border-slate-200/80 pb-2 mt-5 mb-3 flex items-center gap-2"
            >
              <span className="w-2 h-2 rounded-full bg-purple-600 inline-block" />
              <span>{block.content}</span>
            </h2>
          );
        }
        if (block.type === "h3") {
          return (
            <h3 key={idx} className="text-xs font-bold text-slate-800 mt-4 mb-2">
              {block.content}
            </h3>
          );
        }
        if (block.type === "list-item") {
          return (
            <li key={idx} className="ml-4 list-disc text-slate-700 text-xs leading-relaxed">
              <span
                dangerouslySetInnerHTML={{
                  __html: formatInlineBold(block.content),
                }}
              />
            </li>
          );
        }
        if (block.type === "ordered-item") {
          return (
            <div key={idx} className="ml-2 text-xs font-medium text-slate-800 leading-relaxed">
              <span
                dangerouslySetInnerHTML={{
                  __html: formatInlineBold(block.content),
                }}
              />
            </div>
          );
        }
        if (block.type === "space") {
          return <div key={idx} className="h-1" />;
        }
        if (block.type === "table") {
          return (
            <div
              key={idx}
              className="my-4 overflow-x-auto rounded-2xl border border-slate-200 shadow-2xs bg-white"
            >
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
                    {block.headers.map((h, hIdx) => (
                      <th key={hIdx} className="py-2.5 px-3.5">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {block.rows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className="hover:bg-purple-50/30 transition-colors"
                    >
                      {row.map((cell, cIdx) => {
                        const lowerCell = cell.toLowerCase();
                        const isBadge =
                          lowerCell.includes("slow") ||
                          lowerCell.includes("stockout") ||
                          lowerCell.includes("low stock") ||
                          lowerCell.includes("risk") ||
                          lowerCell.includes("in stock");

                        return (
                          <td key={cIdx} className="py-2.5 px-3.5 text-slate-800 font-medium">
                            {isBadge ? (
                              <span
                                className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                  lowerCell.includes("slow")
                                    ? "bg-amber-100 text-amber-800"
                                    : lowerCell.includes("stockout") ||
                                      lowerCell.includes("risk")
                                    ? "bg-rose-100 text-rose-800"
                                    : lowerCell.includes("low stock")
                                    ? "bg-orange-100 text-orange-800"
                                    : "bg-emerald-100 text-emerald-800"
                                }`}
                              >
                                {cell}
                              </span>
                            ) : (
                              <span
                                dangerouslySetInnerHTML={{
                                  __html: formatInlineBold(cell),
                                }}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return (
          <p
            key={idx}
            className="text-xs text-slate-700 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: formatInlineBold(block.content) }}
          />
        );
      })}
    </div>
  );
}

function formatInlineBold(str: string): string {
  return str.replace(
    /\*\*(.*?)\*\*/g,
    "<strong class='font-bold text-slate-900'>$1</strong>"
  );
}
