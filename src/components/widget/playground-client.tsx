"use client";

import React, { useState } from "react";
import { 
  Laptop, 
  Smartphone, 
  Settings2, 
  Sparkles, 
  Globe, 
  MessageSquare, 
  Palette, 
  Info,
  CheckCircle2,
  Copy
} from "lucide-react";
import { ChatWidget } from "./chat-widget";
import { Card, CardContent } from "@/components/ui/card";

interface PlaygroundClientProps {
  defaultClientId: string;
}

export function WidgetPlaygroundClient({ defaultClientId }: PlaygroundClientProps) {
  // Config state (Branding Customization)
  const [companyName, setCompanyName] = useState("Acme Digital");
  const [accentColor, setAccentColor] = useState("#6366f1");
  const [greeting, setGreeting] = useState("Hello! I am your AI assistant. Ask me anything about our products or plans.");
  const [logoUrl, setLogoUrl] = useState("");
  
  // UI States
  const [previewSize, setPreviewSize] = useState<"desktop" | "mobile">("desktop");
  const [mockChatOpen, setMockChatOpen] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);

  const activeConfig = {
    companyName,
    accentColor,
    greeting,
    logoUrl: logoUrl.trim() || undefined,
    clientId: defaultClientId
  };

  const handleCopyScript = () => {
    const scriptText = `<script \n  src="http://localhost:3000/embed/widget.js" \n  data-client-id="${defaultClientId}"\n  async>\n</script>`;
    navigator.clipboard.writeText(scriptText);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-neutral-200 font-sans p-4 md:p-8 space-y-8 pb-32">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            AI Chat Widget Showcase <Sparkles className="h-6 w-6 text-indigo-400 animate-pulse" />
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Simulate branding, test lead capture, and copy installation embed codes.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Side: Branding Configurator Controls */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="bg-[#0f0f13] border-white/5 shadow-xl">
            <div className="p-4 border-b border-white/5 flex items-center gap-2 text-white">
              <Settings2 className="h-4 w-4 text-indigo-400" />
              <h3 className="text-sm font-bold uppercase tracking-wider">Branding Controls</h3>
            </div>
            <CardContent className="p-4 space-y-4">
              
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-neutral-400 flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-neutral-500" />
                  Company Name
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full bg-[#161622] border border-white/5 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-neutral-700"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold tracking-wider text-neutral-400 flex items-center gap-1.5">
                  <Palette className="h-3.5 w-3.5 text-neutral-500" />
                  Accent Theme Color
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="h-9 w-9 bg-transparent border-0 rounded-lg cursor-pointer"
                  />
                  <input
                    type="text"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="flex-1 bg-[#161622] border border-white/5 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-neutral-700"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">Greeting Message</label>
                <textarea
                  value={greeting}
                  onChange={(e) => setGreeting(e.target.value)}
                  rows={4}
                  className="w-full bg-[#161622] border border-white/5 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-neutral-700 leading-relaxed"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">Logo Image URL (Optional)</label>
                <input
                  type="text"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://example.com/logo.png"
                  className="w-full bg-[#161622] border border-white/5 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-neutral-700"
                />
              </div>

            </CardContent>
          </Card>

          {/* Installation Helper Card */}
          <Card className="bg-[#0f0f13] border-white/5 shadow-xl">
            <div className="p-4 border-b border-white/5 flex items-center gap-2 text-white">
              <MessageSquare className="h-4 w-4 text-indigo-400" />
              <h3 className="text-sm font-bold uppercase tracking-wider">Embed Installation</h3>
            </div>
            <CardContent className="p-4 space-y-3">
              <p className="text-[11px] text-neutral-400 leading-normal">
                To test the widget externally, add this script inside the HTML of your website.
              </p>
              
              <div className="relative">
                <pre className="p-3 bg-[#09090b] border border-white/5 rounded-xl text-[10px] font-mono text-indigo-300 overflow-x-auto select-all leading-normal whitespace-pre">
{`<script 
  src="http://localhost:3000/embed/widget.js" 
  data-client-id="${defaultClientId.slice(0, 8)}..."
  async>
</script>`}
                </pre>
                <button
                  onClick={handleCopyScript}
                  className="absolute right-2.5 top-2.5 p-1.5 bg-[#161622] hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-lg transition-colors border border-white/5"
                  title="Copy Embed Code"
                >
                  {copiedScript ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Side: Showcase Viewports Simulation */}
        <div className="lg:col-span-8 space-y-6">
          <div className="flex items-center justify-between bg-[#0f0f13] border border-white/5 p-3.5 rounded-2xl">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 bg-emerald-400 rounded-full animate-ping" />
              <p className="text-xs font-bold text-neutral-400">Mock Website Simulator</p>
            </div>
            
            {/* Viewport Selectors */}
            <div className="flex bg-[#09090b] border border-white/5 p-0.5 rounded-xl">
              <button
                onClick={() => setPreviewSize("desktop")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
                  previewSize === "desktop" ? "bg-indigo-600 text-white shadow-sm" : "text-neutral-400 hover:text-white"
                }`}
              >
                <Laptop className="h-3.5 w-3.5" />
                Desktop Frame
              </button>
              <button
                onClick={() => setPreviewSize("mobile")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
                  previewSize === "mobile" ? "bg-indigo-600 text-white shadow-sm" : "text-neutral-400 hover:text-white"
                }`}
              >
                <Smartphone className="h-3.5 w-3.5" />
                Mobile Phone
              </button>
            </div>
          </div>

          {/* Desktop Simulator View */}
          {previewSize === "desktop" ? (
            <div className="w-full bg-[#121217] border border-white/5 rounded-3xl overflow-hidden shadow-2xl relative">
              {/* Simulated Browser Header */}
              <div className="bg-[#0f0f13] px-4 py-3 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
                </div>
                <div className="bg-[#09090b] border border-white/5 text-[10px] text-neutral-400 font-mono py-1 px-8 rounded-lg select-all">
                  https://www.yourdomain.com
                </div>
                <div className="w-10" />
              </div>

              {/* Simulated Hero Page */}
              <div className="h-[450px] p-8 flex flex-col justify-center items-center text-center space-y-5 relative">
                <div className="space-y-2 max-w-lg">
                  <h2 className="text-3xl font-extrabold text-white tracking-tight">Accelerate customer queries with AI.</h2>
                  <p className="text-xs text-neutral-400 leading-normal">
                    This frame simulates your landing page. The chatbot widget runs in the bottom-right corner. Customize branding elements on the left panel to see updates.
                  </p>
                </div>
                
                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setMockChatOpen(!mockChatOpen)}
                    style={{ backgroundColor: accentColor }}
                    className="px-4 py-2 rounded-xl text-white text-xs font-bold shadow-lg hover:scale-105 active:scale-95 transition-transform"
                  >
                    Simulate Widget Toggle
                  </button>
                </div>

                {/* Simulated Floating Launcher Preview */}
                <div className="absolute bottom-6 right-6 flex flex-col items-end gap-3 z-10">
                  {/* Mock Bubble Closed/Open Status preview */}
                  <div className="bg-[#0f0f13] border border-white/5 rounded-2xl shadow-xl p-3 flex items-center gap-2 text-[10px] text-neutral-400 max-w-[200px] animate-bounce">
                    <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-ping" />
                    <span>Click floating icon to chat</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Mobile Frame Viewport Simulator */
            <div className="flex justify-center items-center py-6">
              <div className="w-[300px] h-[550px] bg-[#121217] border-4 border-neutral-800 rounded-[36px] overflow-hidden shadow-2xl relative flex flex-col justify-between">
                {/* Phone Notch/Speaker */}
                <div className="absolute top-0 inset-x-0 h-5 bg-neutral-800 rounded-b-xl flex items-center justify-center z-20">
                  <div className="h-1.5 w-16 bg-neutral-700 rounded-full" />
                </div>

                {/* Mobile Browser Address Bar */}
                <div className="bg-[#0f0f13] pt-6 pb-2.5 px-4 border-b border-white/5 text-center text-[9px] text-neutral-500 font-mono">
                  yourdomain.com
                </div>

                {/* Mobile Hero Content */}
                <div className="flex-1 p-6 flex flex-col justify-center items-center text-center space-y-4">
                  <h3 className="text-xl font-bold text-white leading-tight">AI business chat widget</h3>
                  <p className="text-[10px] text-neutral-400 leading-normal">
                    Optimized for mobile interfaces with responsive overlays.
                  </p>
                </div>

                {/* Mobile Iframe bottom section placeholder */}
                <div className="p-4 bg-[#0f0f13] text-center text-[9px] text-neutral-600 border-t border-white/5">
                  Powered by Tarkshy AI
                </div>
              </div>
            </div>
          )}

          {/* Quick Info Box */}
          <div className="bg-[#0f0f13]/60 border border-white/5 p-4 rounded-2xl flex gap-3 text-xs leading-relaxed text-neutral-400">
            <Info className="h-4.5 w-4.5 text-indigo-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-white block">How to test lead capture?</span>
              <p className="text-[11px]">
                Open the chatbot in the bottom right corner. Type <span className="font-mono text-indigo-300 font-semibold bg-[#161622] px-1 rounded">&quot;I want to request a demo&quot;</span> or select the <span className="font-mono text-indigo-300 font-semibold bg-[#161622] px-1 rounded">&quot;Leave Contact Details&quot;</span> helper chip. An interactive lead capture card will be generated in the message stream to submit details dynamically.
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* Floating Active Live Widget (Binds to Active Customizer Config) */}
      <ChatWidget config={activeConfig} />
    </div>
  );
}
