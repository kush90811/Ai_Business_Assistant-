"use client";

import React, { useState } from "react";
import { 
  Building, 
  Palette, 
  Save, 
  Check, 
  Bot, 
  User, 
  Sliders, 
  ArrowRight,
  Globe,
  Mail
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const colorOptions = [
  { name: "Indigo", value: "#6366f1" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Emerald", value: "#10b981" },
  { name: "Pink", value: "#ec4899" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Rose", value: "#f43f5e" },
];

export function SettingsClient() {
  const [activeTab, setActiveTab] = useState<"company" | "widget" | "ai">("company");
  
  // Settings Form States
  // 1. Company Profile
  const [companyName, setCompanyName] = useState("Acme Corp");
  const [websiteUrl, setWebsiteUrl] = useState("https://acme.co");
  const [supportEmail, setSupportEmail] = useState("support@acme.co");
  const [industry, setIndustry] = useState("SaaS & Tech");

  // 2. Widget settings
  const [widgetTitle, setWidgetTitle] = useState("Tarkshy Assistant");
  const [accentColor, setAccentColor] = useState("#6366f1");
  const [greeting, setGreeting] = useState("Hello there! Ask me anything about our plans, pricing, or custom integrations.");
  const [widgetPosition, setWidgetPosition] = useState("right");

  // 3. AI settings
  const [aiModel, setAiModel] = useState("llama-3.3-70b-versatile");
  const [systemPrompt, setSystemPrompt] = useState("You are Tarkshy, a helpful automated customer support representative. Answer customer questions politely and direct high-intent sales questions to collect lead details.");
  const [temperature, setTemperature] = useState(0.4);

  // Save State Animation
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 3000);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    // Simulate save duration
    setTimeout(() => {
      setIsSaving(false);
      triggerToast("Configuration settings updated successfully!");
    }, 1200);
  };

  return (
    <div className="space-y-8 relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#161622] border border-indigo-500/30 rounded-xl p-4 shadow-2xl flex items-center gap-3 animate-fade-in max-w-sm glass">
          <div className="p-1.5 bg-indigo-500/10 rounded-lg text-indigo-400">
            <Check className="h-4 w-4" />
          </div>
          <p className="text-xs font-semibold text-white leading-normal">{toastMessage}</p>
        </div>
      )}

      {/* Header */}
      <div className="border-b border-border/40 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Console Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure company branding, tweak AI prompting, and customize the live chatbot widget UI.
          </p>
        </div>
      </div>

      {/* Tab Selectors */}
      <div className="flex border-b border-border/60 gap-4">
        <button
          onClick={() => setActiveTab("company")}
          className={`pb-3 text-xs font-bold uppercase tracking-wider transition-all relative ${
            activeTab === "company" 
              ? "text-indigo-400 border-b-2 border-indigo-500 font-extrabold" 
              : "text-muted-foreground hover:text-white"
          }`}
        >
          <span className="flex items-center gap-2">
            <Building className="h-4 w-4" />
            Company Profile
          </span>
        </button>

        <button
          onClick={() => setActiveTab("widget")}
          className={`pb-3 text-xs font-bold uppercase tracking-wider transition-all relative ${
            activeTab === "widget" 
              ? "text-indigo-400 border-b-2 border-indigo-500 font-extrabold" 
              : "text-muted-foreground hover:text-white"
          }`}
        >
          <span className="flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Widget Layout
          </span>
        </button>

        <button
          onClick={() => setActiveTab("ai")}
          className={`pb-3 text-xs font-bold uppercase tracking-wider transition-all relative ${
            activeTab === "ai" 
              ? "text-indigo-400 border-b-2 border-indigo-500 font-extrabold" 
              : "text-muted-foreground hover:text-white"
          }`}
        >
          <span className="flex items-center gap-2">
            <Sliders className="h-4 w-4" />
            AI Configs
          </span>
        </button>
      </div>

      {/* Inner split grid: Form Left (8 cols) vs Widget Preview Right (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Form Configurator */}
        <div className="lg:col-span-7">
          <form onSubmit={handleSave}>
            <Card>
              <CardContent className="pt-6 space-y-6">
                
                {/* 1. Company Profile Form */}
                {activeTab === "company" && (
                  <div className="space-y-4">
                    <div className="border-b border-border/40 pb-2 mb-2">
                      <h3 className="text-sm font-semibold text-white">General Information</h3>
                      <p className="text-[10px] text-muted-foreground">Setup tenant registry metadata</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase">Company Name</label>
                        <Input
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase">Industry Sectors</label>
                        <Input
                          value={industry}
                          onChange={(e) => setIndustry(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase">Website URL</label>
                      <div className="relative">
                        <Globe className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          value={websiteUrl}
                          onChange={(e) => setWebsiteUrl(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase">Support Help Desk Email</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="email"
                          value={supportEmail}
                          onChange={(e) => setSupportEmail(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Widget Customizer Form */}
                {activeTab === "widget" && (
                  <div className="space-y-4">
                    <div className="border-b border-border/40 pb-2 mb-2">
                      <h3 className="text-sm font-semibold text-white">Visual Customizer</h3>
                      <p className="text-[10px] text-muted-foreground">Tailor the look of the embedded chat widget</p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase">Widget Header Title</label>
                      <Input
                        value={widgetTitle}
                        onChange={(e) => setWidgetTitle(e.target.value)}
                        placeholder="e.g. Help Desk Bot"
                      />
                    </div>

                    {/* Color Swatch Selector */}
                    <div className="space-y-2.5">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase block">Theme Accent Color</label>
                      <div className="flex flex-wrap gap-2">
                        {colorOptions.map((opt) => {
                          const isSelected = accentColor === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setAccentColor(opt.value)}
                              className={`h-7 px-2.5 rounded-lg border text-[10px] font-semibold flex items-center gap-1.5 transition-all ${
                                isSelected 
                                  ? "border-white bg-white/10 text-white" 
                                  : "border-border bg-transparent text-muted-foreground hover:text-white hover:bg-white/5"
                              }`}
                            >
                              <span 
                                className="h-3.5 w-3.5 rounded-full border border-white/5 shrink-0" 
                                style={{ backgroundColor: opt.value }}
                              />
                              {opt.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase">Bot Greeting Message</label>
                      <Textarea
                        value={greeting}
                        onChange={(e) => setGreeting(e.target.value)}
                        rows={3}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase">Launcher Position</label>
                      <select 
                        value={widgetPosition}
                        onChange={(e) => setWidgetPosition(e.target.value)}
                        className="flex h-9 w-full rounded-lg border border-border bg-[#09090b]/60 px-3 py-1 text-xs text-white focus-visible:outline-none focus:border-indigo-500 transition-colors"
                      >
                        <option value="right">Right Aligned (Standard)</option>
                        <option value="left">Left Aligned</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* 3. AI Settings Form */}
                {activeTab === "ai" && (
                  <div className="space-y-4">
                    <div className="border-b border-border/40 pb-2 mb-2">
                      <h3 className="text-sm font-semibold text-white">AI Agent Instructions</h3>
                      <p className="text-[10px] text-muted-foreground">Adjust model hyperparameters and system prompts</p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase">Base Language Model</label>
                      <select
                        value={aiModel}
                        onChange={(e) => setAiModel(e.target.value)}
                        className="flex h-9 w-full rounded-lg border border-border bg-[#09090b]/60 px-3 py-1 text-xs text-white focus-visible:outline-none focus:border-indigo-500 transition-colors"
                      >
                        <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile (Fast & Smart)</option>
                        <option value="gpt-4o-mini">gpt-4o-mini (Multimodal Lite)</option>
                        <option value="deepseek-r1-distill">deepseek-r1-distill (Reasoning & Code)</option>
                      </select>
                    </div>

                    {/* Temperature Slider */}
                    <div className="space-y-2.5">
                      <div className="flex justify-between items-center">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase">AI Creativity (Temperature)</label>
                        <span className="font-mono text-xs text-indigo-400 font-semibold">{temperature}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={temperature}
                        onChange={(e) => setTemperature(parseFloat(e.target.value))}
                        className="w-full h-1 bg-[#121217] rounded-lg border border-border appearance-none cursor-pointer accent-indigo-500"
                      />
                      <div className="flex justify-between text-[9px] text-muted-foreground">
                        <span>Focused (0.0)</span>
                        <span>Balanced (0.5)</span>
                        <span>Creative (1.0)</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase">System Prompt Instructions</label>
                      <Textarea
                        value={systemPrompt}
                        onChange={(e) => setSystemPrompt(e.target.value)}
                        rows={5}
                      />
                    </div>
                  </div>
                )}

                {/* Footer Save Button */}
                <div className="border-t border-border/10 pt-4 flex justify-end">
                  <Button
                    type="submit"
                    disabled={isSaving}
                    loading={isSaving}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 text-xs font-semibold px-4 h-9 shadow-lg shadow-indigo-600/15"
                  >
                    {!isSaving && <Save className="h-4 w-4" />}
                    {isSaving ? "Saving Settings..." : "Save Changes"}
                  </Button>
                </div>

              </CardContent>
            </Card>
          </form>
        </div>

        {/* Right Column: Live Chatbot Preview (5 cols) */}
        <div className="lg:col-span-5 sticky top-24">
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase block px-1">Live Widget Preview</span>
            
            {/* High-Fidelity Mock Chat Widget */}
            <div className="border border-border bg-[#09090b] rounded-2xl shadow-2xl overflow-hidden max-w-sm mx-auto flex flex-col h-[400px]">
              
              {/* Widget Header (accentColor bound!) */}
              <div 
                className="p-3.5 flex items-center justify-between text-white transition-colors duration-300"
                style={{ backgroundColor: accentColor }}
              >
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center font-bold text-xs shadow-inner">
                    T
                  </div>
                  <div>
                    <p className="text-xs font-bold leading-normal">{widgetTitle}</p>
                    <p className="text-[9px] text-white/80 flex items-center gap-1.5 leading-normal">
                      <span className="h-1.5 w-1.5 bg-emerald-400 rounded-full animate-pulse" />
                      Active Now
                    </p>
                  </div>
                </div>
              </div>

              {/* Widget Body */}
              <div className="flex-1 p-3 bg-[#0d0d12] overflow-y-auto space-y-3 flex flex-col justify-end">
                {/* Greeting Bubble */}
                <div className="flex gap-2 items-start max-w-[85%] text-[11px] mr-auto">
                  <div 
                    className="h-5 w-5 rounded-full text-white flex items-center justify-center shrink-0 shadow-md text-[9px]"
                    style={{ backgroundColor: accentColor }}
                  >
                    <Bot className="h-3 w-3" />
                  </div>
                  <div className="bg-[#161622] text-neutral-200 border border-indigo-500/10 rounded-xl rounded-tl-none px-3 py-2 leading-relaxed">
                    {greeting}
                  </div>
                </div>

                {/* Simulated Lead Capture Prompt */}
                <div className="flex gap-2 items-start max-w-[85%] text-[11px] mr-auto">
                  <div 
                    className="h-5 w-5 rounded-full text-white flex items-center justify-center shrink-0 shadow-md text-[9px]"
                    style={{ backgroundColor: accentColor }}
                  >
                    <Bot className="h-3 w-3" />
                  </div>
                  <div className="bg-[#161622] text-neutral-200 border border-indigo-500/10 rounded-xl rounded-tl-none px-3 py-2 leading-relaxed space-y-2">
                    <p>To help you best, could you please enter your email address?</p>
                    <div className="space-y-1">
                      <input 
                        type="text" 
                        placeholder="Enter your email..." 
                        disabled 
                        className="w-full bg-[#121217] border border-border text-[10px] rounded px-2 py-1 text-white/50"
                      />
                      <button 
                        type="button" 
                        disabled 
                        className="w-full text-white text-[10px] font-semibold py-1 rounded transition-colors"
                        style={{ backgroundColor: accentColor }}
                      >
                        Submit Contact
                      </button>
                    </div>
                  </div>
                </div>

                {/* User Message */}
                <div className="flex gap-2 items-start max-w-[80%] text-[11px] ml-auto flex-row-reverse">
                  <div className="h-5 w-5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700 flex items-center justify-center shrink-0 text-[9px]">
                    <User className="h-3 w-3" />
                  </div>
                  <div className="bg-white text-black rounded-xl rounded-tr-none px-3 py-1.5 leading-relaxed">
                    How much is the enterprise plan?
                  </div>
                </div>
              </div>

              {/* Widget Footer */}
              <div className="p-2 bg-[#09090b] border-t border-border/40 flex items-center gap-1">
                <input 
                  type="text" 
                  placeholder="Send a message..." 
                  disabled
                  className="bg-[#121217] border border-border text-[11px] rounded-lg px-2.5 py-1.5 flex-1 text-white/50"
                />
                <button 
                  type="button" 
                  disabled
                  className="h-7 w-7 rounded-lg text-white flex items-center justify-center shrink-0"
                  style={{ backgroundColor: accentColor }}
                >
                  <ArrowRight className="h-4.5 w-4.5" />
                </button>
              </div>

            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
