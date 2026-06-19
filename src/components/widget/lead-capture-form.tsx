"use client";

import React, { useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";

interface LeadCaptureFormProps {
  clientId: string;
  sessionId?: string;
  accentColor: string;
  onSubmitSuccess: (leadDetails: { name: string; email: string; phone: string }) => void;
}

export function LeadCaptureForm({ clientId, sessionId, accentColor, onSubmitSuccess }: LeadCaptureFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email && !phone) {
      setErrorMsg("Please provide at least an email or phone number.");
      return;
    }
    setErrorMsg("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/widget/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          sessionId,
          name: name.trim() || "Anonymous Visitor",
          email: email.trim().toLowerCase() || null,
          phone: phone.trim() || null,
          source: "chatbot-widget"
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to submit contact details.");
      }

      setSubmitted(true);
      setTimeout(() => {
        onSubmitSuccess({
          name: name.trim() || "Anonymous Visitor",
          email: email.trim() || "",
          phone: phone.trim() || ""
        });
      }, 1500);

    } catch (err: unknown) {
      console.error(err);
      setErrorMsg(err instanceof Error ? err.message : "Submission failure.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-[#161622] border border-white/5 rounded-2xl p-4 text-center space-y-2 text-white animate-fade-in shadow-xl">
        <CheckCircle2 
          className="h-8 w-8 mx-auto animate-bounce" 
          style={{ color: accentColor }}
        />
        <h4 className="text-xs font-bold">Contact Saved!</h4>
        <p className="text-[10px] text-neutral-400">Thank you, our team will get in touch soon.</p>
      </div>
    );
  }

  return (
    <div className="bg-[#161622] border border-white/5 rounded-2xl p-4 space-y-3 shadow-xl animate-fade-in text-left">
      <div className="space-y-0.5">
        <h4 className="text-xs font-bold text-white">Let&apos;s keep in touch!</h4>
        <p className="text-[10px] text-neutral-400">Please provide your details to request support or a sales callback.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2.5">
        <div className="space-y-1">
          <label className="text-[9px] uppercase font-bold tracking-wider text-neutral-500">Your Name</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. John Doe"
            disabled={submitting}
            className="w-full bg-[#0d0d12] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-neutral-700 disabled:opacity-50"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[9px] uppercase font-bold tracking-wider text-neutral-500">Email Address</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e.g. john@company.com"
            disabled={submitting}
            className="w-full bg-[#0d0d12] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-neutral-700 disabled:opacity-50"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[9px] uppercase font-bold tracking-wider text-neutral-500">Phone Number</label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. +1 555-0199"
            disabled={submitting}
            className="w-full bg-[#0d0d12] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-neutral-700 disabled:opacity-50"
          />
        </div>

        {errorMsg && (
          <p className="text-[10px] text-rose-400 font-medium">{errorMsg}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          style={{ backgroundColor: accentColor }}
          className="w-full h-8.5 rounded-lg text-white text-[11px] font-bold flex items-center justify-center gap-1.5 shadow-md hover:scale-[1.02] active:scale-[0.98] transition-transform focus:outline-none"
        >
          {submitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            "Submit Details"
          )}
        </button>
      </form>
    </div>
  );
}
