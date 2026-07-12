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
  const [visitorId, setVisitorId] = useState<string>("");
  const [showQuickActions, setShowQuickActions] = useState(true);

  const { companyName, accentColor, greeting, logoUrl, clientId } = config;

  // post message resize to parent window if inside iframe
  useEffect(() => {
    if (typeof window !== "undefined" && window.parent) {
      window.parent.postMessage({ action: isOpen ? "open" : "close" }, "*");
    }
  }, [isOpen]);

  // Consolidated widget initialization
  useEffect(() => {
    async function initializeWidget() {
      const visitorKey = `chatbot_visitor_${clientId}`;
      const savedSessionKey = `chatbot_session_${clientId}`;
      
      const storedVisitorId = localStorage.getItem(visitorKey);
      const storedSessionId = localStorage.getItem(savedSessionKey);

      try {
        const response = await fetch("/api/widget/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId,
            visitorId: storedVisitorId || null,
            sessionId: storedSessionId || null,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          
          // Backend signals that all data for this visitor was deleted.
          // Clear stale localStorage and start completely fresh.
          if (data.resetVisitor) {
            console.log("[Widget] Backend signaled reset. Clearing stale visitor data.");
            localStorage.removeItem(visitorKey);
            localStorage.removeItem(savedSessionKey);

            const freshVisitorId = `visitor_${Math.random().toString(36).substring(2, 15)}`;
            setVisitorId(freshVisitorId);
            localStorage.setItem(visitorKey, freshVisitorId);
            setSessionId(undefined);
            setMessages([
              {
                id: "msg-welcome",
                role: "assistant",
                content: data.greeting || greeting,
                timestamp: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
              },
            ]);
            return;
          }

          setVisitorId(data.visitorId);
          localStorage.setItem(visitorKey, data.visitorId);

          if (data.sessionId) {
            setSessionId(data.sessionId);
            localStorage.setItem(savedSessionKey, data.sessionId);
          } else {
            setSessionId(undefined);
            localStorage.removeItem(savedSessionKey);
          }

          if (data.history && data.history.length > 0) {
            setMessages(data.history);
          } else {
            setMessages([
              {
                id: "msg-welcome",
                role: "assistant",
                content: data.greeting || greeting,
                timestamp: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
              },
            ]);
          }
        } else {
          throw new Error("Failed to initialize widget backend state.");
        }
      } catch (err) {
        console.error("[Widget Init Fail] Falling back to local defaults:", err);
        const resolvedVisitorId = storedVisitorId || `visitor_${Math.random().toString(36).substring(2, 15)}`;
        setVisitorId(resolvedVisitorId);
        localStorage.setItem(visitorKey, resolvedVisitorId);

        if (storedSessionId) {
          setSessionId(storedSessionId);
        }

        setMessages([
          {
            id: "msg-welcome",
            role: "assistant",
            content: greeting,
            timestamp: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
          },
        ]);
      }
    }

    initializeWidget();
  }, [clientId, greeting]);

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

    try {
      // 2. Send message to backend /api/chat
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          clientId: clientId,
          sessionId: sessionId,
          visitorId: visitorId || undefined
        }),
      });

      console.log("[Widget] Sent visitorId:", visitorId, "sessionId:", sessionId);

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to communicate with AI.");
      }

      // Save new sessionId if created
      if (data.sessionId && data.sessionId !== sessionId) {
        setSessionId(data.sessionId);
        localStorage.setItem(`chatbot_session_${clientId}`, data.sessionId);
      }

      // 3. Append Assistant Response
      const assistantMsg: WidgetMessage = {
        id: `msg-assistant-${Date.now()}`,
        role: "assistant",
        content: data.response,
        timestamp: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // 4. Show Lead Capture Form only when backend stage is "demo_booking"
      //    or user explicitly asked to leave contact info — NOT from keyword matching.
      const lowerText = text.toLowerCase();
      const explicitContactRequest = lowerText.includes("leave contact") || lowerText.includes("contact information");
      const isAtDemoStage = data.stage === "demo_booking";
      
      if (isAtDemoStage || explicitContactRequest) {
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
            logoUrl={logoUrl}
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
          <div className="bg-[#09090b] pb-2 pt-0.5 text-center border-t border-white/[0.02]">
            <a 
              href="https://tarkshy.com" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-[10px] text-neutral-500 hover:text-indigo-400 transition-colors font-sans flex items-center justify-center gap-1 cursor-pointer select-none"
            >
              Powered by <span className="font-bold text-neutral-400">Tarkshy Consultancy Services</span>
            </a>
          </div>
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
