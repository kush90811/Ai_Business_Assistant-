"use client";

import React, { useEffect, useRef } from "react";
import { Bot, User } from "lucide-react";
import { LeadCaptureForm } from "./lead-capture-form";

export interface WidgetMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  isLeadForm?: boolean;
}

interface ChatMessagesProps {
  messages: WidgetMessage[];
  isTyping?: boolean;
  accentColor: string;
  clientId: string;
  sessionId?: string;
  onLeadSubmitSuccess: (details: { name: string; email: string; phone: string }) => void;
  onQuickAction: (actionText: string) => void;
  showQuickActions?: boolean;
}

export function ChatMessages({
  messages,
  isTyping,
  accentColor,
  clientId,
  sessionId,
  onLeadSubmitSuccess,
  onQuickAction,
  showQuickActions
}: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0d0d12]/95 scrollbar-thin scrollbar-thumb-white/5 scrollbar-track-transparent">
      {messages.map((m) => {
        const isBot = m.role === "assistant";

        if (m.isLeadForm) {
          return (
            <div key={m.id} className="max-w-[90%] mr-auto pl-1">
              <LeadCaptureForm
                clientId={clientId}
                sessionId={sessionId}
                accentColor={accentColor}
                onSubmitSuccess={onLeadSubmitSuccess}
              />
            </div>
          );
        }

        return (
          <div 
            key={m.id} 
            className={`flex gap-2.5 text-xs max-w-[85%] ${
              isBot ? "mr-auto" : "ml-auto flex-row-reverse"
            }`}
          >
            <div className={`h-6 w-6 rounded-full border flex items-center justify-center shrink-0 ${
              isBot 
                ? "bg-indigo-950 border-indigo-500/20 text-indigo-400" 
                : "bg-neutral-800 border-neutral-700 text-neutral-300"
            }`}
            style={isBot ? { borderColor: `${accentColor}30`, color: accentColor } : undefined}
          >
            {isBot ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
          </div>

          <div className="space-y-1">
            <div 
              className={`rounded-2xl px-3.5 py-2.5 leading-relaxed shadow-sm whitespace-pre-wrap ${
                isBot 
                  ? "bg-[#161622] text-neutral-200 border border-white/5 rounded-tl-none" 
                  : "text-white rounded-tr-none"
              }`}
              style={!isBot ? { backgroundColor: accentColor } : undefined}
            >
              {m.content}
            </div>
            <p className={`text-[9px] text-neutral-500 ${isBot ? "text-left" : "text-right"}`}>
              {m.timestamp}
            </p>
          </div>
        </div>
        );
      })}

      {/* Quick Actions Helper */}
      {showQuickActions && messages.length === 1 && (
        <div className="pl-8 flex flex-col gap-1.5 items-start animate-fade-in">
          <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider mb-1">Suggested actions:</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onQuickAction("I would like to book a sales demo.")}
              className="px-3 py-1.5 rounded-lg border border-white/5 bg-[#161622] text-neutral-300 hover:text-white hover:border-neutral-600 text-[10px] font-semibold transition-all hover:scale-[1.02]"
            >
              📅 Book a Demo
            </button>
            <button
              onClick={() => onQuickAction("How do I connect the widget to my website?")}
              className="px-3 py-1.5 rounded-lg border border-white/5 bg-[#161622] text-neutral-300 hover:text-white hover:border-neutral-600 text-[10px] font-semibold transition-all hover:scale-[1.02]"
            >
              💻 Integration Guide
            </button>
            <button
              onClick={() => onQuickAction("Leave my contact information.")}
              className="px-3 py-1.5 rounded-lg border border-white/5 bg-[#161622] text-neutral-300 hover:text-white hover:border-neutral-600 text-[10px] font-semibold transition-all hover:scale-[1.02]"
            >
              💬 Leave Contact Details
            </button>
          </div>
        </div>
      )}

      {/* Typing Indicator */}
      {isTyping && (
        <div className="flex gap-2.5 text-xs mr-auto max-w-[80%] animate-fade-in">
          <div 
            className="h-6 w-6 rounded-full bg-indigo-950 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0"
            style={{ borderColor: `${accentColor}30`, color: accentColor }}
          >
            <Bot className="h-3.5 w-3.5" />
          </div>
          <div className="bg-[#161622] border border-white/5 rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-1.5">
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
