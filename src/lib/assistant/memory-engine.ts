import type { SupabaseClient } from "@supabase/supabase-js";
import { VisitorProfile, QUALIFICATION_FIELDS } from "./types";

type LeadRow = {
  id?: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  session_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

export class MemoryEngine {
  /**
   * Fetches the visitor profile (lead row) from the database using visitorId or sessionId.
   */
  public static async getVisitorProfile(
    supabase: SupabaseClient,
    clientId: string,
    visitorId?: string,
    sessionId?: string
  ): Promise<LeadRow | null> {
    let existingLead: LeadRow | null = null;

    if (visitorId) {
      const { data: sessions } = await supabase
        .from("chat_sessions")
        .select("id")
        .eq("visitor_id", visitorId)
        .eq("client_id", clientId);

      if (sessions && sessions.length > 0) {
        const sessionIds = sessions.map((s: { id: string }) => s.id);
        const { data: leadsByVisitor } = await supabase
          .from("leads")
          .select("*")
          .in("session_id", sessionIds)
          .order("created_at", { ascending: false })
          .limit(1);

        if (leadsByVisitor && leadsByVisitor.length > 0) {
          existingLead = leadsByVisitor[0];
        }
      }
    }

    if (!existingLead && sessionId) {
      const { data: leadsBySession } = await supabase
        .from("leads")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (leadsBySession && leadsBySession.length > 0) {
        existingLead = leadsBySession[0];
      }
    }

    return existingLead;
  }

  /**
   * Converts the DB lead row into a structured VisitorProfile object.
   */
  public static mapToVisitorProfile(lead: LeadRow | null): VisitorProfile {
    if (!lead) {
      return {
        name: null,
        email: null,
        phone: null,
        company: null,
        industry: null,
        website: null,
        teamSize: null,
        monthlyVisitors: null,
        budget: null,
        currentChatbot: null,
        businessGoals: null,
        city: null,
        country: null,
        jobTitle: null,
        linkedin: null,
      };
    }

    const meta = (lead.metadata as Record<string, string | null>) || {};
    return {
      id: lead.id,
      name: lead.name || null,
      email: lead.email || null,
      phone: lead.phone || null,
      company: meta.company || null,
      industry: meta.industry || null,
      website: meta.website || null,
      teamSize: meta.teamSize || null,
      monthlyVisitors: meta.monthlyVisitors || null,
      budget: meta.budget || null,
      currentChatbot: meta.currentChatbot || null,
      businessGoals: meta.businessGoals || null,
      city: meta.city || null,
      country: meta.country || null,
      jobTitle: meta.jobTitle || null,
      linkedin: meta.linkedin || null,
    };
  }

  /**
   * Identifies which of the key qualification fields are already filled and which are remaining.
   */
  public static getQualificationStatus(profile: VisitorProfile): {
    filledFields: string[];
    remainingFields: Array<keyof VisitorProfile>;
  } {
    const filledFields: string[] = [];
    const remainingFields: Array<keyof VisitorProfile> = [];

    for (const field of QUALIFICATION_FIELDS) {
      const val = profile[field];
      if (val !== null && val !== undefined && String(val).trim() !== "" && String(val) !== "Anonymous Visitor") {
        filledFields.push(field);
      } else {
        remainingFields.push(field);
      }
    }

    return { filledFields, remainingFields };
  }

  /**
   * Compiles historical conversation transcripts from previous sessions of this visitor.
   * Only loads history if at least one lead still exists for those sessions,
   * ensuring that deleted visitor data doesn't leak stale memories into the LLM.
   */
  public static async getBackgroundContext(
    supabase: SupabaseClient,
    clientId: string,
    visitorId?: string,
    currentSessionId?: string
  ): Promise<string> {
    if (!visitorId) return "";

    const { data: otherSessions } = await supabase
      .from("chat_sessions")
      .select("id")
      .eq("visitor_id", visitorId)
      .eq("client_id", clientId)
      .neq("id", currentSessionId || "");

    if (otherSessions && otherSessions.length > 0) {
      const otherSessionIds = otherSessions.map((s: { id: string }) => s.id);

      // Coherence check: only load history if at least one lead still exists
      // for these sessions. If the admin deleted all leads, treat as no history.
      const { data: linkedLeads } = await supabase
        .from("leads")
        .select("id")
        .in("session_id", otherSessionIds)
        .limit(1);

      if (!linkedLeads || linkedLeads.length === 0) {
        console.log(`[Memory Engine] No leads found for visitor's other sessions. Skipping background context.`);
        return "";
      }
      
      const { data: pastMsgs } = await supabase
        .from("chat_messages")
        .select("role, content, created_at")
        .in("session_id", otherSessionIds)
        .order("created_at", { ascending: false })
        .limit(20);

      if (pastMsgs && pastMsgs.length > 0) {
        const chronologicalMsgs = [...pastMsgs].reverse();
        console.log(`[Memory Engine] Loaded ${pastMsgs.length} historical messages.`);
        return chronologicalMsgs
          .map((m) => `${m.role === "user" ? "Visitor" : "AI Assistant"}: ${m.content}`)
          .join("\n");
      }
    }

    return "";
  }

  /**
   * Generates a descriptive summary string of known visitor properties for the LLM system prompt.
   */
  public static getKnownInfoPromptString(profile: VisitorProfile): string {
    const infoLines: string[] = [];
    const fieldsToPrint: Array<{ label: string; key: keyof VisitorProfile }> = [
      { label: "Name", key: "name" },
      { label: "Email", key: "email" },
      { label: "Phone", key: "phone" },
      { label: "Company", key: "company" },
      { label: "Industry", key: "industry" },
      { label: "Website", key: "website" },
      { label: "Team Size", key: "teamSize" },
      { label: "Monthly Website Visitors", key: "monthlyVisitors" },
      { label: "Monthly Budget", key: "budget" },
      { label: "Current Chatbot Solution", key: "currentChatbot" },
      { label: "Business Goals", key: "businessGoals" },
      { label: "City", key: "city" },
      { label: "Country", key: "country" },
      { label: "Job Title", key: "jobTitle" },
      { label: "LinkedIn", key: "linkedin" }
    ];

    for (const item of fieldsToPrint) {
      const val = profile[item.key];
      if (val !== null && val !== undefined && String(val).trim() !== "" && String(val) !== "Anonymous Visitor") {
        infoLines.push(`${item.label}: ${val}`);
      }
    }

    if (infoLines.length === 0) return "";
    return `Visitor Profile (Known information from CRM/Leads, greet them by name if they are returning): \n${infoLines.join("\n")}`;
  }
}
