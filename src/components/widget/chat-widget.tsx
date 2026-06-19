"use client";

import React, { useState, useEffect } from "react";
import { ChatLauncher } from "./chat-launcher";
import { ChatHeader } from "./chat-header";
import { ChatMessages, type WidgetMessage } from "./chat-messages";
import { ChatInput } from "./chat-input";

export interface WidgetConfig {
  companyName: string;
  accentColor: string;
  greeting: string;
  logoUrl?: string;
  clientId: string;
}

interface ChatWidgetProps {
  config: WidgetConfig;
}

export function ChatWidget({ config }: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<WidgetMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [showQuickActions, setShowQuickActions] = useState(true);

  const { companyName, accentColor, greeting, logoUrl, clientId } = config;

  // post message resize to parent window if inside iframe
  useEffect(() => {
    if (typeof window !== "undefined" && window.parent) {
      window.parent.postMessage({ action: isOpen ? "open" : "close" }, "*");
    }
  }, [isOpen]);

  // 1. Initialize session and welcome message
  useEffect(() => {
    // Load existing sessionId from localStorage if available
    const savedSessionKey = `chatbot_session_${clientId}`;
    const savedSessionId = localStorage.getItem(savedSessionKey);
    if (savedSessionId) {
      setSessionId(savedSessionId);
      // Fetch past messages from Supabase or load a clean state
      // For a fresh preview experience, we can reload history or start fresh.
      // Let's load the saved session messages if possible.
      // For now, let's seed with the greeting and check if we want to restore.
    }

    const initialGreeting: WidgetMessage = {
      id: "msg-welcome",
      role: "assistant",
      content: greeting,
      timestamp: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    };

    setMessages([initialGreeting]);
  }, [greeting, clientId]);

  // Load chat history if session exists
  useEffect(() => {
    if (!sessionId) return;
    
    const fetchHistory = async () => {
      try {
        // Direct query or use client-side Supabase client to fetch messages
        // Since we are unauthenticated, we can do a simple fetch if there's an endpoint.
        // For simplicity and widget responsiveness, we'll maintain local state.
      } catch (err) {
        console.error("Failed to restore history:", err);
      }
    };
    fetchHistory();
  }, [sessionId]);

  const handleSendMessage = async (text: string) => {
    // 1. Append User Message
    const userMsg: WidgetMessage = {
      id: `msg-user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);
    setShowQuickActions(false);

    // 2. Local Intent Detection for Lead Capture
    const lowerText = text.toLowerCase();
    const showsBuyingIntent = 
      lowerText.includes("demo") || 
      lowerText.includes("pricing") || 
      lowerText.includes("cost") || 
      lowerText.includes("buy") || 
      lowerText.includes("pricing plan") ||
      lowerText.includes("quote") ||
      lowerText.includes("sales") || 
      lowerText.includes("callback") ||
      lowerText.includes("contact information") || 
      lowerText.includes("leave contact");

    try {
      // 3. Send message to backend /api/chat
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          clientId: clientId,
          sessionId: sessionId,
          visitorId: `widget-visitor-${clientId.slice(0, 4)}`
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to communicate with AI.");
      }

      // Save new sessionId if created
      if (data.sessionId && data.sessionId !== sessionId) {
        setSessionId(data.sessionId);
        localStorage.setItem(`chatbot_session_${clientId}`, data.sessionId);
      }

      // 4. Append Assistant Response
      const assistantMsg: WidgetMessage = {
        id: `msg-assistant-${Date.now()}`,
        role: "assistant",
        content: data.response,
        timestamp: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // 5. If user showed buying intent, inject Lead Capture Form card after the AI reply
      if (showsBuyingIntent) {
        setTimeout(() => {
          const formCard: WidgetMessage = {
            id: `msg-leadform-${Date.now()}`,
            role: "assistant",
            content: "Please fill in the form below:",
            timestamp: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
            isLeadForm: true,
          };
          setMessages((prev) => [...prev, formCard]);
        }, 800);
      }

    } catch (err: unknown) {
      console.error(err);
      const errorNotice: WidgetMessage = {
        id: `msg-error-${Date.now()}`,
        role: "assistant",
        content: "⚠️ Service is temporarily unavailable. Please try again later.",
        timestamp: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorNotice]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleLeadSubmitSuccess = (details: { name: string; email: string; phone: string }) => {
    // Append a follow-up thank you message
    const botReply: WidgetMessage = {
      id: `msg-thanks-${Date.now()}`,
      role: "assistant",
      content: `Thanks ${details.name.split(" ")[0]}! I've successfully saved your details. A sales advisor will follow up with you at ${details.email || details.phone} shortly.`,
      timestamp: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    };

    setMessages((prev) => {
      // Remove the lead form card from history to keep chat tidy, or just append thanks
      const cleaned = prev.filter(m => !m.isLeadForm);
      return [...cleaned, botReply];
    });
  };

  const handleQuickAction = (actionText: string) => {
    if (actionText === "Leave my contact information.") {
      // Directly inject the lead capture form in the message list
      const formCard: WidgetMessage = {
        id: `msg-leadform-${Date.now()}`,
        role: "assistant",
        content: "Please fill in the form below:",
        timestamp: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
        isLeadForm: true,
      };
      setMessages((prev) => [...prev, formCard]);
      setShowQuickActions(false);
    } else {
      handleSendMessage(actionText);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-4 font-sans select-none">
      {/* Expanded Chat Window */}
      {isOpen && (
        <div className="w-[360px] h-[550px] sm:w-[400px] sm:h-[600px] rounded-3xl bg-[#09090b] border border-white/5 shadow-2xl flex flex-col overflow-hidden animate-fade-in transition-all duration-300 transform scale-100 origin-bottom-right">
          <ChatHeader
            companyName={companyName}
            logoUrl={logoUrl}
            accentColor={accentColor}
            onClose={() => setIsOpen(false)}
          />
          <ChatMessages
            messages={messages}
            isTyping={isTyping}
            accentColor={accentColor}
            clientId={clientId}
            sessionId={sessionId}
            onLeadSubmitSuccess={handleLeadSubmitSuccess}
            onQuickAction={handleQuickAction}
            showQuickActions={showQuickActions}
          />
          <ChatInput
            onSendMessage={handleSendMessage}
            disabled={isTyping}
            accentColor={accentColor}
          />
        </div>
      )}

      {/* Launcher Button */}
      <ChatLauncher
        isOpen={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        accentColor={accentColor}
      />
    </div>
  );
}
