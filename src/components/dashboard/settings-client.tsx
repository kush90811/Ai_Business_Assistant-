"use client";

import React, { useState, useEffect } from "react";
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
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getDirectImageUrl } from "@/lib/utils";
import type { SessionContext } from "@/types/auth";

const colorOptions = [
  { name: "Indigo", value: "#6366f1" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Emerald", value: "#10b981" },
  { name: "Pink", value: "#ec4899" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Rose", value: "#f43f5e" },
];

interface SettingsClientProps {
  session: SessionContext;
}

export function SettingsClient({ session }: SettingsClientProps) {
  const [activeTab, setActiveTab] = useState<"company" | "widget" | "ai">("company");
  
  // Settings Form States
  // 1. Company Profile
  const [companyName, setCompanyName] = useState("Acme Corp");
  const [websiteUrl, setWebsiteUrl] = useState("https://acme.co");
  const [supportEmail, setSupportEmail] = useState("support@acme.co");
  const [industry, setIndustry] = useState("SaaS & Tech");

  // New Business Profile States
  const [companyDescription, setCompanyDescription] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [workingHours, setWorkingHours] = useState("");
  const [socialTwitter, setSocialTwitter] = useState("");
  const [socialFacebook, setSocialFacebook] = useState("");
  const [socialLinkedin, setSocialLinkedin] = useState("");
  const [socialInstagram, setSocialInstagram] = useState("");

  // 2. Widget settings
  const [widgetTitle, setWidgetTitle] = useState("Tarkshy Assistant");
  const [accentColor, setAccentColor] = useState("#6366f1");
  const [logoUrl, setLogoUrl] = useState("");
  const [greeting, setGreeting] = useState("Hello there! Ask me anything about our plans, pricing, or custom integrations.");
  const [widgetPosition, setWidgetPosition] = useState("right");
  const [allowedDomainsStr, setAllowedDomainsStr] = useState("");

  // 3. AI settings
  const [aiModel, setAiModel] = useState("llama-3.3-70b-versatile");
  const [systemPrompt, setSystemPrompt] = useState("You are Tarkshy, a helpful automated customer support representative. Answer customer questions politely and direct high-intent sales questions to collect lead details.");
  const [temperature, setTemperature] = useState(0.4);
  const [responseLength, setResponseLength] = useState<"short" | "medium" | "detailed">("medium");

  // Save State Animation
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  const clientId = session?.tenant?.clientId;
  const supabase = createSupabaseBrowserClient();

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !clientId) return;

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      triggerToast("Logo file size must be less than 2MB.");
      return;
    }

    // Validate type
    if (!file.type.startsWith("image/")) {
      triggerToast("Only image files are allowed.");
      return;
    }

    setIsUploadingLogo(true);
    try {
      const fileExt = file.name.split(".").pop();
      const storagePath = `${clientId}/logo_${Date.now()}.${fileExt}`;

      // Upload file to Supabase storage bucket 'widget-assets'
      const { error: uploadError } = await supabase.storage
        .from("widget-assets")
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data } = supabase.storage
        .from("widget-assets")
        .getPublicUrl(storagePath);

      setLogoUrl(data.publicUrl);

      // Automatically persist the logo URL in the database
      const { error: saveError } = await supabase
        .from("widget_configs")
        .update({ logo_url: data.publicUrl })
        .eq("client_id", clientId);

      if (saveError) {
        throw saveError;
      }

      triggerToast("Logo uploaded and saved successfully!");
    } catch (err: any) {
      console.error("[Logo Upload Error] Failed to upload logo:", err);
      triggerToast(`Failed to upload logo: ${err.message || String(err)}`);
    } finally {
      setIsUploadingLogo(false);
    }
  };

  // Load configuration settings from Supabase
  useEffect(() => {
    if (!clientId) return;

    async function loadSettings() {
      // 1. Fetch Client info
      const { data: client } = await supabase
        .from("clients")
        .select("name")
        .eq("id", clientId)
        .maybeSingle();

      if (client) {
        setCompanyName(client.name);
      }

      // 2. Fetch Widget config
      const { data: config } = await supabase
        .from("widget_configs")
        .select("brand_name, primary_color, welcome_message, position, response_length, logo_url, allowed_domains")
        .eq("client_id", clientId)
        .maybeSingle();

      if (config) {
        setWidgetTitle(config.brand_name || "Tarkshy Assistant");
        setAccentColor(config.primary_color || "#6366f1");
        setGreeting(config.welcome_message || "Hello there!");
        setWidgetPosition(config.position === "bottom-left" ? "left" : "right");
        setResponseLength((config.response_length || "medium") as "short" | "medium" | "detailed");
        setLogoUrl(config.logo_url || "");
        setAllowedDomainsStr(config.allowed_domains ? config.allowed_domains.join(", ") : "");
      }

      // 3. Fetch Business Profile
      const { data: profile } = await supabase
        .from("business_profiles")
        .select("*")
        .eq("client_id", clientId)
        .maybeSingle();

      if (profile) {
        setCompanyDescription(profile.description || "");
        setCompanyAddress(profile.address || "");
        setCompanyPhone(profile.phone || "");
        setCompanyEmail(profile.email || "");
        setCompanyWebsite(profile.website || "");
        setWorkingHours(profile.working_hours || "");
        
        const social = profile.social_links || {};
        setSocialTwitter(social.twitter || "");
        setSocialFacebook(social.facebook || "");
        setSocialLinkedin(social.linkedin || "");
        setSocialInstagram(social.instagram || "");
      }
    }

    loadSettings();
  }, [clientId, supabase]);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 3000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) return;

    setIsSaving(true);
    
    try {
      // Parse comma-separated domains into array
      const allowedDomainsArray = allowedDomainsStr
        .split(",")
        .map((d) => d.trim())
        .filter((d) => d !== "");

      // 1. Update widget config
      const { error: widgetErr } = await supabase
        .from("widget_configs")
        .update({
          brand_name: widgetTitle,
          primary_color: accentColor,
          welcome_message: greeting,
          position: widgetPosition === "left" ? "bottom-left" : "bottom-right",
          response_length: responseLength,
          logo_url: getDirectImageUrl(logoUrl) || null,
          allowed_domains: allowedDomainsArray
        })
        .eq("client_id", clientId);

      if (widgetErr) {
        throw widgetErr;
      }

      // 2. Upsert business profile
      const { error: profileErr } = await supabase
        .from("business_profiles")
        .upsert({
          client_id: clientId,
          description: companyDescription,
          address: companyAddress,
          phone: companyPhone,
          email: companyEmail,
          website: companyWebsite,
          working_hours: workingHours,
          social_links: {
            twitter: socialTwitter,
            facebook: socialFacebook,
            linkedin: socialLinkedin,
            instagram: socialInstagram
          }
        }, { onConflict: "client_id" });

      if (profileErr) {
        throw profileErr;
      }

      // 3. Try to update client name
      const { error: clientErr } = await supabase
        .from("clients")
        .update({ name: companyName })
        .eq("id", clientId);

      if (clientErr) {
        throw clientErr;
      }

      triggerToast("Configuration settings updated successfully!");
    } catch (err: any) {
      console.error("[Settings] Error saving configuration:", err);
      triggerToast(`Error saving settings: ${err.message || String(err)}`);
    } finally {
      setIsSaving(false);
    }
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
                    <div className="border-b border-border/40 pb-2 mb-2 flex justify-between items-end">
                      <div>
                        <h3 className="text-sm font-semibold text-white">General Information</h3>
                        <p className="text-[10px] text-muted-foreground">Setup tenant registry metadata</p>
                      </div>
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
                      <label className="text-[11px] font-bold text-muted-foreground uppercase">Company Description</label>
                      <Textarea
                        value={companyDescription}
                        onChange={(e) => setCompanyDescription(e.target.value)}
                        placeholder="Provide a brief description of what your business does..."
                        rows={3}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase">Company Address</label>
                        <Input
                          value={companyAddress}
                          onChange={(e) => setCompanyAddress(e.target.value)}
                          placeholder="e.g. 123 Business Rd, New York, NY"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase">Working Hours</label>
                        <Input
                          value={workingHours}
                          onChange={(e) => setWorkingHours(e.target.value)}
                          placeholder="e.g. Mon-Fri: 9 AM - 5 PM"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase">Business Phone</label>
                        <Input
                          value={companyPhone}
                          onChange={(e) => setCompanyPhone(e.target.value)}
                          placeholder="e.g. +1 555-0199"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase">Business Email</label>
                        <Input
                          type="email"
                          value={companyEmail}
                          onChange={(e) => setCompanyEmail(e.target.value)}
                          placeholder="e.g. contact@mybusiness.com"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase">Website URL</label>
                      <div className="relative">
                        <Globe className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          value={companyWebsite}
                          onChange={(e) => setCompanyWebsite(e.target.value)}
                          placeholder="e.g. www.mybusiness.com"
                          className="pl-9"
                        />
                      </div>
                    </div>

                    <div className="border-b border-border/40 pb-2 mb-2 mt-6">
                      <h3 className="text-sm font-semibold text-white">Social Media Profiles</h3>
                      <p className="text-[10px] text-muted-foreground">Add links to your social channels</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase">Twitter/X Profile URL</label>
                        <Input
                          value={socialTwitter}
                          onChange={(e) => setSocialTwitter(e.target.value)}
                          placeholder="https://x.com/yourbusiness"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase">Facebook Page URL</label>
                        <Input
                          value={socialFacebook}
                          onChange={(e) => setSocialFacebook(e.target.value)}
                          placeholder="https://facebook.com/yourbusiness"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase">LinkedIn Company URL</label>
                        <Input
                          value={socialLinkedin}
                          onChange={(e) => setSocialLinkedin(e.target.value)}
                          placeholder="https://linkedin.com/company/yourbusiness"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase">Instagram URL</label>
                        <Input
                          value={socialInstagram}
                          onChange={(e) => setSocialInstagram(e.target.value)}
                          placeholder="https://instagram.com/yourbusiness"
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

                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase">Chatbot Logo</label>
                      <div className="flex gap-2">
                        <Input
                          value={logoUrl}
                          onChange={(e) => setLogoUrl(e.target.value)}
                          placeholder="Paste image URL or upload →"
                          className="flex-1"
                        />
                        <div className="relative shrink-0">
                          <input
                            type="file"
                            accept="image/*"
                            id="logo-upload-input"
                            onChange={handleLogoUpload}
                            disabled={isUploadingLogo}
                            className="hidden"
                          />
                          <Button
                            type="button"
                            disabled={isUploadingLogo}
                            onClick={() => document.getElementById("logo-upload-input")?.click()}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 h-9 shadow shadow-indigo-600/15 relative"
                          >
                            {isUploadingLogo ? "Uploading..." : "Browse"}
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Color Swatch Selector + Custom Color Picker */}
                    <div className="space-y-2.5">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase block">Theme Accent Color</label>
                      <div className="flex flex-wrap items-center gap-2">
                        {colorOptions.map((opt) => {
                          const isSelected = accentColor.toLowerCase() === opt.value.toLowerCase();
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

                        {/* Custom Color Input Option */}
                        <div className="flex items-center gap-2 ml-1">
                          <input
                            type="color"
                            value={accentColor}
                            onChange={(e) => setAccentColor(e.target.value)}
                            className="h-7 w-7 bg-transparent border-0 rounded-lg cursor-pointer shrink-0"
                          />
                          <span className="text-[10px] text-muted-foreground font-mono uppercase bg-[#09090b]/60 px-2 py-1 rounded border border-border">
                            {accentColor}
                          </span>
                        </div>
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

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase">Allowed Security Domains</label>
                        <span className="text-[9px] text-muted-foreground font-semibold">Comma-separated list (e.g. localhost:3000, mybusiness.com)</span>
                      </div>
                      <Input
                        value={allowedDomainsStr}
                        onChange={(e) => setAllowedDomainsStr(e.target.value)}
                        placeholder="e.g. localhost:3000, mybusiness.com"
                      />
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

                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase">AI Response Length / Token Limit</label>
                      <select
                        value={responseLength}
                        onChange={(e) => setResponseLength(e.target.value as "short" | "medium" | "detailed")}
                        className="flex h-9 w-full rounded-lg border border-border bg-[#09090b]/60 px-3 py-1 text-xs text-white focus-visible:outline-none focus:border-indigo-500 transition-colors"
                      >
                        <option value="short">Short (Snappy: Max 150 tokens / ~2 sentences)</option>
                        <option value="medium">Medium (Balanced: Max 400 tokens / ~1 paragraph)</option>
                        <option value="detailed">Detailed (Thorough: Max 800 tokens / multiple paragraphs)</option>
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
                  {getDirectImageUrl(logoUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img 
                      src={getDirectImageUrl(logoUrl)} 
                      alt="Logo" 
                      className="h-7 w-7 rounded-full border border-white/10 object-cover bg-neutral-900 shadow-inner shrink-0"
                    />
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center font-bold text-xs shadow-inner shrink-0">
                      {widgetTitle ? widgetTitle.charAt(0).toUpperCase() : "T"}
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-bold leading-normal truncate max-w-[150px]">{widgetTitle}</p>
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
                  {getDirectImageUrl(logoUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img 
                      src={getDirectImageUrl(logoUrl)} 
                      alt="Logo" 
                      className="h-5 w-5 rounded-full border border-white/5 object-cover bg-neutral-900 shrink-0 shadow-md"
                    />
                  ) : (
                    <div 
                      className="h-5 w-5 rounded-full text-white flex items-center justify-center shrink-0 shadow-md text-[9px]"
                      style={{ backgroundColor: accentColor }}
                    >
                      <Bot className="h-3 w-3" />
                    </div>
                  )}
                  <div className="bg-[#161622] text-neutral-200 border border-indigo-500/10 rounded-xl rounded-tl-none px-3 py-2 leading-relaxed">
                    {greeting}
                  </div>
                </div>

                {/* Simulated Lead Capture Prompt */}
                <div className="flex gap-2 items-start max-w-[85%] text-[11px] mr-auto">
                  {getDirectImageUrl(logoUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img 
                      src={getDirectImageUrl(logoUrl)} 
                      alt="Logo" 
                      className="h-5 w-5 rounded-full border border-white/5 object-cover bg-neutral-900 shrink-0 shadow-md"
                    />
                  ) : (
                    <div 
                      className="h-5 w-5 rounded-full text-white flex items-center justify-center shrink-0 shadow-md text-[9px]"
                      style={{ backgroundColor: accentColor }}
                    >
                      <Bot className="h-3 w-3" />
                    </div>
                  )}
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
              <div className="bg-[#09090b] pb-2 pt-0.5 text-center border-t border-white/[0.02]">
                <a 
                  href="https://tarkshy.com" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-[9px] text-neutral-500 hover:text-indigo-400 transition-colors font-sans flex items-center justify-center gap-1 cursor-pointer select-none"
                >
                  Powered by <span className="font-bold text-neutral-400">Tarkshy Consultancy Services</span>
                </a>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
