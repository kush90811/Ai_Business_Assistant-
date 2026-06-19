"use client";

import React from "react";
import { MessageSquare, X } from "lucide-react";

interface ChatLauncherProps {
  isOpen: boolean;
  onClick: () => void;
  accentColor: string;
}

export function ChatLauncher({ isOpen, onClick, accentColor }: ChatLauncherProps) {
  return (
    <button
      onClick={onClick}
      style={{ backgroundColor: accentColor }}
      className="h-14 w-14 rounded-full shadow-2xl flex items-center justify-center text-white transition-all duration-300 hover:scale-105 active:scale-95 focus:outline-none border border-white/10 relative"
      aria-label={isOpen ? "Close Chat" : "Open Chat"}
    >
      <div
        className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${
          isOpen ? "transform rotate-90 opacity-0 scale-75" : "opacity-100 scale-100"
        }`}
      >
        <MessageSquare className="h-6 w-6" />
      </div>
      <div
        className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${
          isOpen ? "opacity-100 scale-100 transform rotate-0" : "transform -rotate-90 opacity-0 scale-75"
        }`}
      >
        <X className="h-6 w-6" />
      </div>
    </button>
  );
}
