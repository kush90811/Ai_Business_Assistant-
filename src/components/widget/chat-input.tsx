"use client";

import React, { useState } from "react";
import { Send } from "lucide-react";

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
  accentColor: string;
}

export function ChatInput({ onSendMessage, disabled, accentColor }: ChatInputProps) {
  const [text, setText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || disabled) return;
    onSendMessage(text.trim());
    setText("");
  };

  return (
    <form 
      onSubmit={handleSubmit} 
      className="p-3 border-t border-white/5 bg-[#09090b]/90 flex items-center gap-2"
    >
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type a message..."
        disabled={disabled}
        className="flex-1 bg-[#121217] border border-white/5 text-neutral-200 text-xs rounded-xl px-3 py-2 h-9 focus:outline-none focus:border-neutral-700 disabled:opacity-50 placeholder:text-neutral-500"
      />
      <button
        type="submit"
        disabled={!text.trim() || disabled}
        style={{ backgroundColor: text.trim() && !disabled ? accentColor : "rgba(255,255,255,0.04)" }}
        className={`h-9 w-9 rounded-xl flex items-center justify-center transition-all focus:outline-none shrink-0 ${
          text.trim() && !disabled 
            ? "text-white hover:scale-105 active:scale-95 shadow-md" 
            : "text-neutral-600 cursor-not-allowed"
        }`}
      >
        <Send className="h-3.5 w-3.5" />
      </button>
    </form>
  );
}
