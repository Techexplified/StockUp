import { useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useSubmit, Form, redirect, useLoaderData, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import prisma, { ensureShopData } from "../db.server";
import RightSideOnboarding from "../components/rightSideOnboarding";
import RightSideOnboarding2 from "../components/rightSideOnboarding2";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop, redirect: shopifyRedirect } = await ensureShopData(request, authenticate);

  if (shop.isOnboarded && !shop.isOnboardedData) {
    return shopifyRedirect("/app/onboarding-data");
  }

  if (shop.isOnboarded && shop.isOnboardedData) {
    return shopifyRedirect("/app");
  }

  return { shop };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, redirect: shopifyRedirect } = await ensureShopData(request, authenticate);
  const formData = await request.formData();

  const role = formData.get("role") as string;
  const goals = formData.get("goals") as string;
  const priority = formData.get("priority") as string;
  const manageSuppliers = formData.get("manageSuppliers") as string;
  const leadTime = formData.get("leadTime") as string;
  const safetyStock = formData.get("safetyStock") as string;
  const threshold = formData.get("threshold") as string;
  const planningHorizon = formData.get("planningHorizon") as string;
  const recStyle = formData.get("recStyle") as string;

  const updatedShop = await prisma.shop.upsert({
    where: { shopDomain: shop.shopDomain },
    update: {
      role: role || null,
      goals: goals || null,
      priority: priority || null,
      manageSuppliers: manageSuppliers || null,
      leadTime: leadTime || null,
      safetyStock: safetyStock || null,
      threshold: threshold || null,
      planningHorizon: planningHorizon || null,
      recStyle: recStyle || null,
      isOnboarded: true,
    },
    create: {
      shopDomain: shop.shopDomain,
      name: shop.name || shop.shopDomain,
      email: shop.email || "",
      role: role || null,
      goals: goals || null,
      priority: priority || null,
      manageSuppliers: manageSuppliers || null,
      leadTime: leadTime || null,
      safetyStock: safetyStock || null,
      threshold: threshold || null,
      planningHorizon: planningHorizon || null,
      recStyle: recStyle || null,
      isOnboarded: true,
      isOnboardedData: false,
      connectedToShopify: false,
    },
  });

  // If user has not completed step 3 data import onboarding, redirect immediately to step 3 (/app/onboarding-data)
  if (!updatedShop.isOnboardedData) {
    return shopifyRedirect("/app/onboarding-data");
  }

  // If both step 1-2 & step 3 onboarding are completed, continue to main application flow
  return shopifyRedirect("/app");
};

export default function OnboardingRoute() {
  const submit = useSubmit();
  const navigation = useNavigation();
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1 Form State
  const [role, setRole] = useState("");
  const [isRoleOpen, setIsRoleOpen] = useState(false);
  const [manageSuppliers, setManageSuppliers] = useState("");
  const [isSupplierOpen, setIsSupplierOpen] = useState(false);
  const [goals, setGoals] = useState<string[]>([
    "prevent_stockouts",
    "improve_reordering",
  ]);
  const [priority, setPriority] = useState<"availability" | "balanced" | "lean">("balanced");

  // Step 2 Form State
  const [leadTime, setLeadTime] = useState("14 days");
  const [safetyStock, setSafetyStock] = useState("14 days");
  const [threshold, setThreshold] = useState("7 days of stock remaining");
  const [planningHorizon, setPlanningHorizon] = useState("30 days");
  const [recStyle, setRecStyle] = useState<"lean" | "balanced" | "safe">("balanced");

  const toggleGoal = (id: string) => {
    setGoals((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  };

  const isStep1Valid = Boolean(
    role &&
    role.trim() !== "" &&
    goals.length > 0 &&
    priority &&
    manageSuppliers &&
    manageSuppliers.trim() !== ""
  );

  const isStep2Valid = Boolean(
    leadTime &&
    safetyStock &&
    threshold &&
    planningHorizon &&
    recStyle
  );

  const isNavigatingFinish = isSubmitting || navigation.state !== "idle";

  const handleFinishSetup = () => {
    setIsSubmitting(true);
    const formData = new FormData();
    formData.append("role", role);
    formData.append("goals", goals.join(","));
    formData.append("priority", priority);
    formData.append("manageSuppliers", manageSuppliers);
    formData.append("leadTime", leadTime);
    formData.append("safetyStock", safetyStock);
    formData.append("threshold", threshold);
    formData.append("planningHorizon", planningHorizon);
    formData.append("recStyle", recStyle);

    submit(formData, { method: "post" });
  };

  return (
    <div className="min-h-screen bg-[#f1f1f1] text-[#101828] font-sans flex flex-col justify-between">
      <div className="min-h-screen">
        
        {/* LEFT COLUMN: FORM CONTENT */}
        <div className="lg:col-span-7 px-6 py-8 md:px-12 md:py-10 flex flex-col justify-between max-w-3xl mx-auto w-full">
          <div>
            {/* BRAND HEADER */}
            {/* <div className="flex items-center gap-3 mb-8">
              <div className="w-8 h-8 text-[#7c3aed]">
                <svg viewBox="0 0 36 36" fill="none" className="w-full h-full">
                  <path d="M18 3L4 10.5V25.5L18 33L32 25.5V10.5L18 3Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/>
                  <path d="M18 3V18M18 18L32 10.5M18 18L4 10.5" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/>
                  <path d="M18 18V33" stroke="currentColor" strokeWidth="2.5"/>
                </svg>
              </div>
              <span className="text-2xl font-bold tracking-tight text-[#101828]">StockPilot</span>
            </div> */}

                <header className="mb-8 space-y-5">
                  {/* STEP INDICATOR BAR */}
                  <div className="flex items-center gap-3 pb-4 border-b border-[#EAECF0]">
                    <div className={`flex items-center gap-2 text-xs font-bold ${currentStep === 1 ? "text-[#101828]" : "text-[#12B76A]"}`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                        currentStep === 1 ? "bg-[#7c3aed] text-white shadow-xs" : "bg-[#ECFDF3] text-[#12B76A] border border-[#abf4d1]"
                      }`}>
                        {currentStep === 1 ? "1" : "✓"}
                      </div>
                      <span>1. Customise experience</span>
                    </div>

                    <div className="w-10 h-0.5 bg-[#EAECF0]" />

                    <div className={`flex items-center gap-2 text-xs font-bold ${currentStep === 2 ? "text-[#101828]" : "text-[#98A2B3]"}`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                        currentStep === 2 ? "bg-[#7c3aed] text-white shadow-xs" : "bg-[#F2F4F7] text-[#98A2B3]"
                      }`}>
                        2
                      </div>
                      <span>2. Inventory preferences</span>
                    </div>
                  </div>

                  <div>
                    <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-[#101828] mb-1.5">
                      {currentStep === 1 && "Let's personalise StockLyn for you"}
                    </h1>
                    <p className="text-[#475467] text-sm md:text-base leading-relaxed">
                      {currentStep === 1 && "Tell us how you manage inventory so we can tailor your experience and AI recommendations."}
                    </p>
                  </div>
                </header>
            {/* STEP 1 FORM */}
            {currentStep === 1 && (
              <div className="space-y-6">

                {/* 1. YOUR ROLE - CUSTOM DROPDOWN */}
                <div className="space-y-2 relative">
                  <label className="block text-sm font-semibold text-[#101828]">
                    1. Your Role
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsRoleOpen(!isRoleOpen)}
                      className={`w-full pl-11 pr-10 py-3.5 bg-white border text-left rounded-xl text-sm font-medium transition-all flex items-center justify-between cursor-pointer ${
                        isRoleOpen
                          ? "border-[#7c3aed] ring-4 ring-[#7c3aed]/10"
                          : "border-[#EAECF0] hover:border-[#D0C9FF]"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="absolute left-3.5 text-[#667085]">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>
                        <span className={role ? "text-[#101828] font-semibold" : "text-[#667085]"}>
                          {role || "Select your role"}
                        </span>
                      </div>
                      <div className="text-[#667085]">
                        <svg
                          className={`w-5 h-5 transition-transform duration-200 ${isRoleOpen ? "rotate-180 text-[#7c3aed]" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>

                    {/* CUSTOM DROPDOWN MENU MATCHING SCREENSHOT */}
                    {isRoleOpen && (
                      <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-[#EAECF0] rounded-2xl shadow-2xl z-50 py-2.5 space-y-0.5 max-h-80 overflow-y-auto">
                        {[
                          "CEO / Founder",
                          "Demand / Supply Planner",
                          "Stock Buyer",
                          "Sales / Marketing",
                          "Finance",
                          "Operations Manager",
                          "Other",
                        ].map((option) => {
                          const isSelected = role === option;
                          return (
                            <div
                              key={option}
                              onClick={() => {
                                setRole(option);
                                setIsRoleOpen(false);
                              }}
                              className={`px-4 py-3 flex items-center gap-3.5 cursor-pointer transition-colors ${
                                isSelected
                                  ? "bg-[#f3f0ff] text-[#2D2554]"
                                  : "hover:bg-[#F9FAFB] text-[#2D2554]"
                              }`}
                            >
                              {/* Selection Indicator Circle */}
                              <div
                                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                                  isSelected
                                    ? "border-[#7c3aed] bg-[#7c3aed]"
                                    : "border-[#A49BCC]"
                                }`}
                              >
                                {isSelected && (
                                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                )}
                              </div>
                              <span className="text-sm font-bold tracking-tight">
                                {option}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. GOALS (MULTI-SELECT) */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-[#101828]">
                    2. What do you primarily want StockLyn to help with? <span className="font-normal text-[#667085]">(Select all that apply)</span>
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                    {[
                      { id: "prevent_stockouts", title: "Prevent stockouts", icon: "box" },
                      { id: "reduce_excess", title: "Reduce excess stock", icon: "arrow-down" },
                      { id: "improve_reordering", title: "Improve reordering", icon: "cart" },
                      { id: "understand_performance", title: "Understand inventory performance", icon: "chart" },
                      { id: "save_time", title: "Save time managing inventory", icon: "clock" },
                    ].map((g) => {
                      const isSelected = goals.includes(g.id);
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => toggleGoal(g.id)}
                          className={`p-3.5 border rounded-xl flex flex-col items-center text-center justify-between gap-2.5 transition-all text-xs font-medium ${
                            isSelected
                              ? "border-[#7c3aed] bg-[#f3f0ff] text-[#7c3aed] ring-2 ring-[#7c3aed]/10 font-semibold"
                              : "border-[#EAECF0] bg-white text-[#344054] hover:border-[#D0C9FF] hover:bg-[#f3f0ff]/50"
                          }`}
                        >
                          <div className={`p-2 rounded-lg ${isSelected ? "bg-[#7c3aed] text-white" : "bg-[#F9FAFB] text-[#475467]"}`}>
                            {g.icon === "box" && (
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                            )}
                            {g.icon === "arrow-down" && (
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                            )}
                            {g.icon === "cart" && (
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                            )}
                            {g.icon === "chart" && (
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                            )}
                            {g.icon === "clock" && (
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            )}
                          </div>
                          <span>{g.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. PRIORITISATION (RADIO CARDS) */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-[#101828]">
                    3. What should StockLyn prioritise?
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      {
                        id: "availability",
                        title: "Availability",
                        desc: "Avoid stockouts and lost sales",
                        icon: "shield",
                      },
                      {
                        id: "balanced",
                        title: "Balanced",
                        desc: "Balance availability and inventory cost",
                        recommended: true,
                        icon: "scale",
                      },
                      {
                        id: "lean",
                        title: "Lean Inventory",
                        desc: "Reduce excess inventory and capital tied up in stock",
                        icon: "leaf",
                      },
                    ].map((item) => {
                      const isSelected = priority === item.id;
                      return (
                        <div
                          key={item.id}
                          onClick={() => setPriority(item.id as any)}
                          className={`p-4 border rounded-xl cursor-pointer transition-all flex flex-col justify-between min-h-[110px] relative ${
                            isSelected
                              ? "border-[#7c3aed] bg-[#FBFBFF] ring-2 ring-[#7c3aed]/10 shadow-sm"
                              : "border-[#EAECF0] bg-white hover:border-[#D0C9FF]"
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isSelected ? "border-[#7c3aed] bg-[#7c3aed]" : "border-[#D0D5DD]"}`}>
                                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                </div>
                                <span className="text-sm font-semibold text-[#101828]">{item.title}</span>
                              </div>
                              <div className="text-[#7c3aed]">
                                {item.icon === "shield" && <svg className="w-5 h-5 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>}
                                {item.icon === "scale" && <svg className="w-5 h-5 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 6l9-3 9 3m-18 6l9-3 9 3m-18 6l9-3 9 3" /></svg>}
                                {item.icon === "leaf" && <svg className="w-5 h-5 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>}
                              </div>
                            </div>
                            <p className="text-xs text-[#475467] leading-relaxed">{item.desc}</p>
                          </div>
                          {item.recommended && (
                            <span className="mt-3 inline-block self-start text-[11px] font-semibold text-[#7c3aed] bg-[#EEEDFF] px-2.5 py-0.5 rounded-full">
                              Recommended
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 4. SUPPLIERS AND PURCHASE ORDERS - CUSTOM DROPDOWN */}
                <div className="space-y-2 relative">
                  <label className="block text-sm font-semibold text-[#101828]">
                    4. Do you manage suppliers and purchase orders?
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsSupplierOpen(!isSupplierOpen)}
                      className={`w-full pl-11 pr-10 py-3.5 bg-white border text-left rounded-xl text-sm font-medium transition-all flex items-center justify-between cursor-pointer ${
                        isSupplierOpen
                          ? "border-[#7c3aed] ring-4 ring-[#7c3aed]/10"
                          : "border-[#EAECF0] hover:border-[#D0C9FF]"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="absolute left-3.5 text-[#667085]">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2m-4-1v8m0 0l3-3m-3 3L9 8m-5 5h2.586a1 1 0 01.707.293l2.414 2.414a1 1 0 00.707.293h3.172a1 1 0 00.707-.293l2.414-2.414a1 1 0 01.707-.293H20" />
                          </svg>
                        </div>
                        <span className={manageSuppliers ? "text-[#101828] font-semibold" : "text-[#667085]"}>
                          {manageSuppliers || "Select an option"}
                        </span>
                      </div>
                      <div className="text-[#667085]">
                        <svg
                          className={`w-5 h-5 transition-transform duration-200 ${isSupplierOpen ? "rotate-180 text-[#7c3aed]" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>

                    {/* CUSTOM DROPDOWN MENU */}
                    {isSupplierOpen && (
                      <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-[#EAECF0] rounded-2xl shadow-2xl z-50 py-2.5 space-y-0.5 max-h-80 overflow-y-auto">
                        {[
                          "Yes, I manage suppliers and purchase orders",
                          "No, direct inventory stock only"
                        ].map((option) => {
                          const isSelected = manageSuppliers === option;
                          return (
                            <div
                              key={option}
                              onClick={() => {
                                setManageSuppliers(option);
                                setIsSupplierOpen(false);
                              }}
                              className={`px-4 py-3 flex items-center gap-3.5 cursor-pointer transition-colors ${
                                isSelected
                                  ? "bg-[#f3f0ff] text-[#2D2554]"
                                  : "hover:bg-[#F9FAFB] text-[#2D2554]"
                              }`}
                            >
                              <div
                                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                                  isSelected
                                    ? "border-[#7c3aed] bg-[#7c3aed]"
                                    : "border-[#A49BCC]"
                                }`}
                              >
                                {isSelected && (
                                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                )}
                              </div>
                              <span className="text-sm font-bold tracking-tight">
                                {option}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* PRIMARY ACTION BUTTON */}
                <button
                  type="button"
                  disabled={!isStep1Valid}
                  onClick={() => {
                    if (isStep1Valid) setCurrentStep(2);
                  }}
                  className={`w-full py-3.5 px-6 rounded-xl font-semibold text-base transition-all flex items-center justify-center gap-2 shadow-sm mt-4 ${
                    isStep1Valid
                      ? "bg-[#7c3aed] hover:bg-[#6d28d9] text-white cursor-pointer"
                      : "bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300/80 shadow-none"
                  }`}
                >
                  <span>Continue</span>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>
                {!isStep1Valid && (
                  <p className="text-xs text-amber-600 text-center font-medium mt-2.5 flex items-center justify-center gap-1.5">
                    <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>Please fill all required fields (Role & Supplier management) to continue.</span>
                  </p>
                )}
              </div>
            )}

            {/* STEP 2 FORM */}
            {currentStep === 2 && (
              <div className="space-y-5">
                <header className="mb-6">
                  <h1 className="text-3xl font-bold tracking-tight text-[#101828] mb-2">
                    Set up your inventory preferences
                  </h1>
                  <p className="text-[#475467] text-base">
                    Help StockLyn understand how you manage stock so we can make more accurate recommendations.
                  </p>
                </header>

                {/* ROW 1: LEAD TIME */}
                <div className="p-4 border border-[#EAECF0] rounded-xl flex items-center justify-between bg-white gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-lg bg-[#f3f0ff] text-[#7c3aed] flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-[#101828]">1. Typical supplier lead time</h3>
                      <p className="text-xs text-[#475467]">Average time from placing an order to receiving stock.</p>
                    </div>
                  </div>
                  <select
                    value={leadTime}
                    onChange={(e) => setLeadTime(e.target.value)}
                    className="py-2 px-3 bg-white border border-[#EAECF0] rounded-lg text-xs font-semibold text-[#101828] focus:outline-none focus:border-[#7c3aed] cursor-pointer"
                  >
                    <option value="7 days">7 days</option>
                    <option value="14 days">14 days</option>
                    <option value="21 days">21 days</option>
                    <option value="30 days">30 days</option>
                    <option value="60 days">60 days</option>
                  </select>
                </div>

                {/* ROW 2: SAFETY STOCK */}
                <div className="p-4 border border-[#EAECF0] rounded-xl flex items-center justify-between bg-white gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-lg bg-[#f3f0ff] text-[#7c3aed] flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-[#101828]">2. Preferred safety stock</h3>
                      <p className="text-xs text-[#475467]">Extra stock you want to keep on hand to cover demand variability.</p>
                    </div>
                  </div>
                  <select
                    value={safetyStock}
                    onChange={(e) => setSafetyStock(e.target.value)}
                    className="py-2 px-3 bg-white border border-[#EAECF0] rounded-lg text-xs font-semibold text-[#101828] focus:outline-none focus:border-[#7c3aed] cursor-pointer"
                  >
                    <option value="7 days">7 days</option>
                    <option value="14 days">14 days</option>
                    <option value="21 days">21 days</option>
                    <option value="30 days">30 days</option>
                  </select>
                </div>

                {/* ROW 3: THRESHOLD */}
                <div className="p-4 border border-[#EAECF0] rounded-xl flex items-center justify-between bg-white gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-lg bg-[#f3f0ff] text-[#7c3aed] flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-[#101828]">3. Stockout risk threshold</h3>
                      <p className="text-xs text-[#475467]">Get alerted when stock is running low.</p>
                    </div>
                  </div>
                  <select
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                    className="py-2 px-3 bg-white border border-[#EAECF0] rounded-lg text-xs font-semibold text-[#101828] focus:outline-none focus:border-[#7c3aed] cursor-pointer"
                  >
                    <option value="3 days of stock remaining">3 days of stock remaining</option>
                    <option value="7 days of stock remaining">7 days of stock remaining</option>
                    <option value="14 days of stock remaining">14 days of stock remaining</option>
                  </select>
                </div>

                {/* ROW 4: HORIZON */}
                <div className="p-4 border border-[#EAECF0] rounded-xl flex items-center justify-between bg-white gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-lg bg-[#f3f0ff] text-[#7c3aed] flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-[#101828]">4. Reorder planning horizon</h3>
                      <p className="text-xs text-[#475467]">How far ahead you want StockLyn to plan your reorders.</p>
                    </div>
                  </div>
                  <select
                    value={planningHorizon}
                    onChange={(e) => setPlanningHorizon(e.target.value)}
                    className="py-2 px-3 bg-white border border-[#EAECF0] rounded-lg text-xs font-semibold text-[#101828] focus:outline-none focus:border-[#7c3aed] cursor-pointer"
                  >
                    <option value="14 days">14 days</option>
                    <option value="30 days">30 days</option>
                    <option value="60 days">60 days</option>
                    <option value="90 days">90 days</option>
                  </select>
                </div>

                {/* ROW 5: RECOMMENDATION STYLE */}
                <div className="space-y-2 pt-2">
                  <label className="block text-sm font-semibold text-[#101828]">
                    5. Reorder recommendation style
                  </label>
                  <p className="text-xs text-[#667085]">How conservative should StockLyn be with recommendations?</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    {[
                      {
                        id: "lean",
                        title: "Lean",
                        desc: "Lower inventory holding, higher tolerance for stockout risk.",
                      },
                      {
                        id: "balanced",
                        title: "Balanced",
                        desc: "Balance availability with inventory holding.",
                        recommended: true,
                      },
                      {
                        id: "safe",
                        title: "Safe",
                        desc: "Maintain higher buffers to minimise stockout risk.",
                      },
                    ].map((item) => {
                      const isSelected = recStyle === item.id;
                      return (
                        <div
                          key={item.id}
                          onClick={() => setRecStyle(item.id as any)}
                          className={`p-3.5 border rounded-xl cursor-pointer transition-all flex flex-col justify-between min-h-[100px] ${
                            isSelected
                              ? "border-[#7c3aed] bg-[#FBFBFF] ring-2 ring-[#7c3aed]/10"
                              : "border-[#EAECF0] bg-white hover:border-[#D0C9FF]"
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isSelected ? "border-[#7c3aed] bg-[#7c3aed]" : "border-[#D0D5DD]"}`}>
                                {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                              </div>
                              <span className="text-xs font-semibold text-[#101828]">{item.title}</span>
                            </div>
                            <p className="text-[11px] text-[#475467] leading-normal">{item.desc}</p>
                          </div>
                          {item.recommended && (
                            <span className="mt-2 inline-block self-start text-[10px] font-semibold text-[#7c3aed] bg-[#EEEDFF] px-2 py-0.5 rounded-full">
                              Recommended
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* STEP 2 ACTIONS */}
                <div className="flex items-center gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="py-3 px-5 border border-[#EAECF0] bg-white text-[#344054] rounded-xl font-semibold text-sm hover:bg-[#F9FAFB] transition-colors flex items-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    <span>Back</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleFinishSetup}
                    disabled={!isStep2Valid || isNavigatingFinish}
                    className={`flex-1 text-white py-3.5 px-6 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-sm ${
                      !isStep2Valid || isNavigatingFinish
                        ? "bg-slate-300 text-slate-500 cursor-not-allowed border border-slate-300 opacity-80"
                        : "bg-[#7c3aed] hover:bg-[#6d28d9] cursor-pointer"
                    }`}
                  >
                    {isNavigatingFinish ? (
                      <>
                        <svg className="w-4 h-4 animate-spin text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Saving Preferences...</span>
                      </>
                    ) : (
                      <>
                        <span>Finish Setup</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

         
        </div>

        {/* RIGHT COLUMN: DYNAMIC LIVE AI PREVIEW PANEL */}
        {/* <div className="lg:col-span-5 bg-[#F8F9FC] border-l border-[#EAECF0] px-8 py-10 flex flex-col justify-between"> */}
          {/* {currentStep === 1 ? <RightSideOnboarding /> : <RightSideOnboarding2 />} */}

          {/* BOTTOM SHOPIFY SECURE BANNER */}
          {/* <div className="mt-6 pt-4 border-t border-[#EAECF0]">
            <div className="bg-white border border-[#EAECF0] rounded-xl p-3.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <svg className="w-5 h-5 text-[#12B76A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <div>
                  <span className="font-semibold block text-[#101828]">Store details detected from Shopify ✓</span>
                  <span className="text-[11px] text-[#667085]">We'll use your store settings and data automatically</span>
                </div>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-[#475467] font-medium border-l border-[#EAECF0] pl-3">
                <div>Currency: <strong className="text-[#101828]">INR</strong></div>
                <div>Time zone: <strong className="text-[#101828]">Asia/Kolkata</strong></div>
              </div>
            </div>
          </div> */}
        {/* </div> */}

      </div>
    </div>
  );
}
