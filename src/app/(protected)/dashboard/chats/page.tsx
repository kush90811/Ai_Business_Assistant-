import { Calendar, Clock, ChevronRight } from "lucide-react";

import { requireSession } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface ChatSessionRecord {
  id: string;
  visitor_id: string | null;
  status: string;
  started_at: string;
  last_activity_at: string;
}

export default async function ChatsPage() {
  const session = await requireSession();
  const clientId = session.tenant?.clientId;

  const supabase = await createSupabaseServerClient();
  let sessions: ChatSessionRecord[] = [];
  const latestMessageMap = new Map<string, { content: string; created_at: string }>();

  if (clientId) {
    // 1. Fetch all chat sessions for this client
    const { data: sessionsData } = await supabase
      .from("chat_sessions")
      .select("id, visitor_id, status, started_at, last_activity_at")
      .eq("client_id", clientId)
      .order("last_activity_at", { ascending: false });

    sessions = (sessionsData as ChatSessionRecord[]) || [];

    if (sessions.length > 0) {
      // 2. Fetch messages to locate the latest message per session
      const { data: messagesData } = await supabase
        .from("chat_messages")
        .select("session_id, content, created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (messagesData) {
        for (const msg of messagesData) {
          if (!latestMessageMap.has(msg.session_id)) {
            latestMessageMap.set(msg.session_id, {
              content: msg.content,
              created_at: msg.created_at,
            });
          }
        }
      }
    }
  }

  return (
    <div className="space-y-8 p-8 max-w-5xl mx-auto">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Chatbot Conversations</h1>
        <p className="text-muted-foreground">
          Manage and monitor chatbot conversations for {session.tenant?.clientName ?? "your workspace"}
        </p>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
          <p className="text-sm font-medium">No chat sessions started yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            When visitors chat with your widget, their sessions will appear here.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {sessions.map((chatSession) => {
            const latestMsg = latestMessageMap.get(chatSession.id);
            const startedDate = chatSession.started_at
              ? new Date(chatSession.started_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "N/A";

            const lastActiveDate = chatSession.last_activity_at
              ? new Date(chatSession.last_activity_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "N/A";

            return (
              <div
                key={chatSession.id}
                className="group relative flex flex-col md:flex-row md:items-center justify-between rounded-xl border bg-card/40 p-6 backdrop-blur-sm transition-all hover:bg-accent/40 gap-4"
              >
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-sm">
                      {chatSession.visitor_id
                        ? `Visitor: ${chatSession.visitor_id}`
                        : `Session #${chatSession.id.slice(0, 8)}`}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        chatSession.status === "open"
                          ? "bg-green-500/10 text-green-500"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {chatSession.status || "open"}
                    </span>
                  </div>

                  <p className="text-sm text-muted-foreground line-clamp-1">
                    {latestMsg ? latestMsg.content : "No messages recorded"}
                  </p>

                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground pt-1">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Started: {startedDate}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Active: {lastActiveDate}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end md:self-auto text-xs text-muted-foreground group-hover:text-foreground transition-colors font-medium">
                  View Logs
                  <ChevronRight className="h-4 w-4" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
