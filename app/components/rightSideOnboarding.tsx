import { useState } from "react";

const AlertTriangleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

const BoxIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
    <line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
);

const TargetIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <circle cx="12" cy="12" r="6"/>
    <circle cx="12" cy="12" r="2"/>
    <line x1="22" y1="12" x2="20" y2="12"/>
    <line x1="4" y1="12" x2="2" y2="12"/>
    <line x1="12" y1="4" x2="12" y2="2"/>
    <line x1="12" y1="22" x2="12" y2="20"/>
  </svg>
);

const WandIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M17.8 6.2L19 5M12.2 6.2L11 5M12.2 11.8L11 13"/>
    <path d="M3 21l9-9"/>
    <path d="M12.2 6.2L3 15.1 8.9 21l9.2-9.2-5.9-5.6z"/>
  </svg>
);

const BarChartIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/>
    <line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6" y1="20" x2="6" y2="14"/>
  </svg>
);

const ShieldCheckIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <polyline points="9 12 11 14 15 10"/>
  </svg>
);

const SparkleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="#7c3aed">
    <path d="M12 2l2.4 7.6H22l-6.4 4.6 2.4 7.4L12 17.2l-6 4.4 2.4-7.4L2 9.6h7.6z"/>
  </svg>
);

const BotIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="10" rx="2"/>
    <circle cx="12" cy="5" r="2"/>
    <path d="M12 7v4"/>
    <line x1="8" y1="16" x2="8" y2="16"/>
    <line x1="16" y1="16" x2="16" y2="16"/>
  </svg>
);

const SettingsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/>
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>
  </svg>
);

// Mini preview: reorder priorities (list with alert)
const ReorderPreview = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "5px", width: "90px" }}>
    {[70, 55, 45].map((w, i) => (
      <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <div style={{ height: "7px", width: `${w}%`, background: i === 2 ? "#e5e7eb" : "#d8d4f5", borderRadius: "3px" }} />
        {i === 2 && <AlertTriangleIcon />}
      </div>
    ))}
  </div>
);

// Mini preview: smarter recommendations
const SmartRecommendPreview = () => (
  <div style={{
    display: "flex", alignItems: "center", gap: "6px",
    background: "#f3f0ff", borderRadius: "8px", padding: "6px 10px"
  }}>
    <BoxIcon />
    <div>
      <div style={{ fontSize: "10px", color: "#7c3aed", fontWeight: 500 }}>Reorder</div>
      <div style={{ fontSize: "13px", color: "#7c3aed", fontWeight: 700 }}>150 units</div>
    </div>
  </div>
);

// Mini preview: insights chart
const InsightsPreview = () => (
  <svg width="88" height="48" viewBox="0 0 88 48">
    <polyline
      points="4,40 20,32 36,28 52,18 68,10 84,4"
      fill="none"
      stroke="#7c3aed"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="84" cy="4" r="3.5" fill="#7c3aed" />
  </svg>
);

const features = [
  {
    icon: <TargetIcon />,
    title: "Reorder Priorities",
    description: "Know which products need attention first.",
    preview: <ReorderPreview />,
  },
  {
    icon: <WandIcon />,
    title: "Smarter Recommendations",
    description: "Reorder suggestions adapt to your inventory goals.",
    preview: <SmartRecommendPreview />,
  },
  {
    icon: <BarChartIcon />,
    title: "Relevant Insights",
    description: "Focus on the risks and performance metrics that matter to you.",
    preview: <InsightsPreview />,
  },
];

export default function StockUpAI() {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#f5f4fb",
      display: "flex",
      justifyContent: "center",
      alignItems: "flex-start",
      padding: "40px 16px",
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    }}>
      <div style={{ width: "100%", maxWidth: "480px" }}>

        {/* Header */}
        <div style={{ marginBottom: "24px", paddingLeft: "4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <SparkleIcon />
            <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 700, color: "#1e1148", letterSpacing: "-0.3px" }}>
              Meet your personalised StockLyn AI
            </h1>
          </div>
          <p style={{ margin: 0, fontSize: "14px", color: "#6b7280", lineHeight: 1.55 }}>
            Your preferences help StockLyn prioritise the recommendations, risks and insights that matter to your business.
          </p>
        </div>

        {/* Main card */}
        <div style={{
          background: "white",
          borderRadius: "16px",
          padding: "24px",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06), 0 4px 24px rgba(124,58,237,0.07)",
          marginBottom: "16px",
        }}>

          {/* Card header */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
            <span style={{ fontSize: "16px", fontWeight: 700, color: "#1e1148" }}>Your StockLyn AI</span>
            <span style={{
              fontSize: "12px", fontWeight: 500,
              color: "#7c3aed", background: "#f3f0ff",
              borderRadius: "20px", padding: "3px 10px",
              border: "1px solid #e0d7ff"
            }}>
              Personalisation preview
            </span>
          </div>

          {/* Feature rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {features.map((f, i) => (
              <div
                key={i}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  display: "flex", alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 12px",
                  borderRadius: "12px",
                  background: hovered === i ? "#f9f8ff" : "transparent",
                  transition: "background 0.15s",
                  cursor: "default",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", flex: 1 }}>
                  {/* Icon bubble */}
                  <div style={{
                    width: "44px", height: "44px", borderRadius: "12px",
                    background: "#ede9ff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    {f.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "#1e1148", marginBottom: "3px" }}>
                      {f.title}
                    </div>
                    <div style={{ fontSize: "13px", color: "#6b7280", lineHeight: 1.45, maxWidth: "200px" }}>
                      {f.description}
                    </div>
                  </div>
                </div>
                {/* Preview widget */}
                <div style={{ flexShrink: 0, marginLeft: "12px" }}>
                  {f.preview}
                </div>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div style={{ height: "1px", background: "#f3f0ff", margin: "16px 0" }} />

          {/* Chat preview */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {/* User bubble */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{
                width: "26px", height: "26px", borderRadius: "50%",
                background: "#7c3aed", display: "flex", alignItems: "center",
                justifyContent: "center", flexShrink: 0,
              }}>
                <span style={{ color: "white", fontSize: "11px", fontWeight: 700 }}>V</span>
              </div>
              <span style={{ fontSize: "13px", color: "#1e1148", fontWeight: 500 }}>You</span>
              <span style={{ fontSize: "13px", color: "#374151" }}>What should I prioritise today?</span>
            </div>

            {/* AI response */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
              <div style={{
                width: "26px", height: "26px", borderRadius: "50%",
                background: "#7c3aed", display: "flex", alignItems: "center",
                justifyContent: "center", flexShrink: 0, marginTop: "1px",
              }}>
                <BotIcon />
              </div>
              <div>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#7c3aed", marginBottom: "3px" }}>
                  StockLyn AI
                </div>
                <div style={{ fontSize: "13px", color: "#374151", lineHeight: 1.5 }}>
                  3 products are at immediate stockout risk. I've prioritised them based on your{" "}
                  <span style={{ color: "#16a34a", fontWeight: 600 }}>Balanced</span>{" "}
                  inventory strategy.
                </div>
              </div>
            </div>
          </div>

          {/* Settings note */}
          <div style={{
            display: "flex", alignItems: "center", gap: "8px",
            marginTop: "18px", paddingTop: "14px",
            borderTop: "1px solid #f3f0ff",
          }}>
            <SettingsIcon />
            <span style={{ fontSize: "13px", color: "#9ca3af" }}>You can change these preferences later.</span>
          </div>
        </div>

        {/* Security footer */}
        <div style={{
          background: "white",
          borderRadius: "14px",
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <ShieldCheckIcon />
            <div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e1148", marginBottom: "2px" }}>
                Your Shopify data stays secure
              </div>
              <div style={{ fontSize: "12px", color: "#6b7280", lineHeight: 1.45 }}>
                We only access the data we need to provide accurate insights and recommendations.
              </div>
            </div>
          </div>
          {/* Shopify bag icon */}
          <div style={{ flexShrink: 0, marginLeft: "16px" }}>
            <svg width="36" height="36" viewBox="0 0 109 124" fill="none">
              <path d="M74.7 14.8s-.4-2.5-2.3-4.3c-2.2-2-5.2-2-5.2-2s-18.2-1.3-20 0c-1.1.8-1.4 1.5-1.5 2.8-.5 5.8 0 11.7 0 11.7H74.7v-8.2z" fill="#96BF48"/>
              <path d="M93.5 21.4s-1-.2-2.6-.4c-1.6-.2-3.4-.3-3.4-.3s-1.6-16.5-1.8-18.1C85.5 1 84 .1 82.7 0 81.4-.1 70.7 0 70.7 0s2.4 1.5 3.4 4.9c.7 2.4.6 9.9.6 9.9H93.5v6.6z" fill="#5E8E3E"/>
              <path d="M70.7 14.8s.1-7.5-.6-9.9C69.1 1.5 66.7 0 66.7 0s-17.7 1.2-20 1.4c-2.3.2-4.4 1.5-4.7 4.3-.5 5.8 0 11.7 0 11.7h28.7v-2.6z" fill="#96BF48"/>
              <path fill="#96BF48" d="M8.5 37.4L0 123.7l84.1 0 8.5-86.3z"/>
              <path fill="#5E8E3E" d="M56.9 37.4l-5.6 86.3 41.3 0 5.6-86.3z"/>
              <path d="M38.1 65.2c0 0 1.9 1.4 5.5 1.4 5.5 0 8.2-3.5 8.2-3.5V52.6s-3.8 1.2-8.2 1.2c-3.6 0-5.5-1.3-5.5-1.3v12.7z" fill="#fff"/>
            </svg>
          </div>
        </div>

      </div>
    </div>
  );
}