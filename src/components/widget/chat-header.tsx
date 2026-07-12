"use client";

import React from "react";
import { X, Sparkles } from "lucide-react";
import { getDirectImageUrl } from "@/lib/utils";

interface ChatHeaderProps {
  companyName: string;
  logoUrl?: string;
  accentColor: string;
  onClose: () => void;
}

export function ChatHeader({ companyName, logoUrl, accentColor, onClose }: ChatHeaderProps) {
  return (
    <div 
      className="p-4 flex items-center justify-between border-b border-white/5 text-white"
      style={{ backgroundColor: accentColor }}
    >
      <div className="flex items-center gap-3">
        {getDirectImageUrl(logoUrl) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img 
            src={getDirectImageUrl(logoUrl)} 
            alt={companyName} 
            className="h-8 w-8 rounded-full border border-white/10 object-cover bg-neutral-900"
          />
        ) : (
          <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm border border-white/10 shadow-inner">
            {companyName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="space-y-0.5">
          <p className="text-xs font-bold leading-normal truncate max-w-[200px]">
            {companyName}
          </p>
          <div className="flex items-center gap-1.5 text-[10px] text-white/80 leading-normal">
            <span className="h-1.5 w-1.5 bg-emerald-400 rounded-full animate-pulse" />
            <span className="flex items-center gap-0.5">
              AI Support <Sparkles className="h-2.5 w-2.5 inline" />
            </span>
          </div>
        </div>
      </div>
      <button 
        onClick={onClose} 
        className="h-8 w-8 rounded-lg flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
        aria-label="Close Chat Window"
      >
        <X className="h-4.5 w-4.5" />
      </button>
    </div>
  );
}
