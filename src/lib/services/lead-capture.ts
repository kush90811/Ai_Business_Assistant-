/* eslint-disable @typescript-eslint/no-explicit-any */
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getGroqChatCompletion } from "@/lib/groq";

export type ExtractedLeadEntities = {
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  city: string | null;
  country: string | null;
  jobTitle: string | null;
  website: string | null;
  linkedin: string | null;
};

export type LeadCaptureResult = {
  hasConflict: boolean;
  response?: string;
};

export class LeadCaptureService {
  /**
   * Performs deterministic extraction using regex for email, phone, website, and LinkedIn.
   */
  public static deterministicExtract(text: string): Partial<ExtractedLeadEntities> {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i;
    // Standard phone regex matching various formats (local, international)
    const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
    const linkedinRegex = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+/i;
    const websiteRegex = /(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[a-zA-Z0-9-_./?%&=]*)?/i;

    const emailMatch = text.match(emailRegex);
    const phoneMatch = text.match(phoneRegex);
    const linkedinMatch = text.match(linkedinRegex);
    
    // For website, ensure it doesn't match an email address or a LinkedIn profile
    let website: string | null = null;
    const websiteMatch = text.match(websiteRegex);
    if (websiteMatch) {
      const matchStr = websiteMatch[0];
      if (!matchStr.includes("@") && !matchStr.toLowerCase().includes("linkedin.com")) {
        website = matchStr;
      }
    }

    return {
      email: emailMatch ? emailMatch[0].toLowerCase() : null,
      phone: phoneMatch ? phoneMatch[0].trim() : null,
      linkedin: linkedinMatch ? linkedinMatch[0].trim() : null,
      website: website || null,
    };
  }

  /**
   * Extracts entities from the latest message using Groq LLM (for name, company, city, country, jobTitle).
   * Never receives conversation history.
   */
  public static async extractEntities(message: string): Promise<ExtractedLeadEntities> {
    const deterministic = this.deterministicExtract(message);

    let name: string | null = null;
    let company: string | null = null;
    let city: string | null = null;
    let country: string | null = null;
    let jobTitle: string | null = null;

    try {
      const systemPrompt = `You are an AI assistant specialized in extracting lead and contact information from a single user message.
Analyze the message and extract the following fields:
- name (person's full or first name. Do NOT extract titles like "CTO", "CEO", "Manager", or verbs/pronouns as names. If no explicit personal name is mentioned, set this to null)
- company (company or business name. Do NOT extract generic terms)
- city (city)
- country (country)
- jobTitle (job title or role, e.g. "CTO", "Software Engineer")

You MUST respond with a valid JSON object ONLY, matching the keys above. If an entity is not found in the message, set its value to null. Do not invent any information.

Example JSON output:
{
  "name": "John Doe",
  "company": "Acme Corp",
  "city": "Boston",
  "country": "USA",
  "jobTitle": "CTO"
}`;

      const llmResponse = await getGroqChatCompletion(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        { temperature: 0.1 }
      );

      const jsonStart = llmResponse.indexOf("{");
      const jsonEnd = llmResponse.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const jsonStr = llmResponse.substring(jsonStart, jsonEnd + 1);
        const parsed = JSON.parse(jsonStr) as Partial<ExtractedLeadEntities>;
        
        name = parsed.name?.trim() || null;
        company = parsed.company?.trim() || null;
        city = parsed.city?.trim() || null;
        country = parsed.country?.trim() || null;
        jobTitle = parsed.jobTitle?.trim() || null;

        // Sanity check to prevent titles/verbs from being treated as names
        if (name) {
          const lowerName = name.toLowerCase();
          const titles = ["cto", "ceo", "cfo", "coo", "manager", "director", "founder", "owner", "president", "currently", "employee", "from"];
          if (titles.some(t => lowerName === t || lowerName.startsWith(t + " ") || lowerName.endsWith(" " + t))) {
            name = null;
          }
        }
      }
    } catch (err) {
      console.warn("[Lead Capture] LLM entity extraction failed:", err);
    }

    return {
      name,
      email: deterministic.email || null,
      phone: deterministic.phone || null,
      company,
      city,
      country,
      jobTitle,
      website: deterministic.website || null,
      linkedin: deterministic.linkedin || null,
    };
  }

  /**
   * Helper to get a field's value from a lead (checks core columns and metadata).
   */
  private static getLeadFieldValue(lead: any, field: string): string | null {
    if (["name", "email", "phone"].includes(field)) {
      return lead[field] || null;
    }
    return lead.metadata?.[field] || null;
  }

  /**
   * Classifies if the user's message is a confirmation (yes/no).
   */
  private static classifyConfirmation(message: string): "yes" | "no" | "unrelated" {
    const text = message.trim().toLowerCase();
    
    const yesRegex = /^(yes|y|yeah|yep|yup|sure|ok|okay|agree|correct|confirm|go ahead|do it|replace|please do)/i;
    const noRegex = /^(no|n|nope|nah|dont|do not|keep|cancel|stop|reject|dont replace)/i;

    if (yesRegex.test(text)) return "yes";
    if (noRegex.test(text)) return "no";

    // Fallback simple keyword match
    if (text === "yes" || text === "y" || text.includes("yes please") || text.includes("go ahead")) return "yes";
    if (text === "no" || text === "n" || text.includes("no thanks") || text.includes("dont do it")) return "no";

    return "unrelated";
  }

  /**
   * Processes the latest message, identifies the visitor, and handles progressive enrichment and conflicts.
   */
  public static async processMessage(
    message: string,
    clientId: string,
    sessionId: string,
    visitorId?: string
  ): Promise<LeadCaptureResult> {
    console.log(`[Lead Capture] Processing message: "${message}" (visitorId: ${visitorId}, sessionId: ${sessionId})`);

    const supabase = createSupabaseServiceClient();
    let existingLead: any = null;

    // 1. Identify Visitor & Find Existing Lead
    if (visitorId) {
      // Find all sessions for this visitor
      const { data: sessions } = await supabase
        .from("chat_sessions")
        .select("id")
        .eq("visitor_id", visitorId);

      if (sessions && sessions.length > 0) {
        const sessionIds = sessions.map(s => s.id);
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

    // 2. Handle Pending Confirmation State Machine
    if (existingLead && existingLead.metadata?.pending_confirmation) {
      const pending = existingLead.metadata.pending_confirmation;
      const classification = this.classifyConfirmation(message);

      console.log(`[Lead Capture] Pending confirmation found for field '${pending.field}'. User response classified as: ${classification}`);

      if (classification === "yes") {
        // Apply the pending value
        const updates: any = {};
        const newMetadata = { ...existingLead.metadata };
        delete newMetadata.pending_confirmation;

        if (["name", "email", "phone"].includes(pending.field)) {
          updates[pending.field] = pending.value;
        } else {
          newMetadata[pending.field] = pending.value;
        }
        updates.metadata = newMetadata;

        console.log(`[Lead Capture] UPDATE executed? Yes (Applying pending confirmation)`);
        console.log(`[Lead Capture] Values before update:`, JSON.stringify(existingLead));
        console.log(`[Lead Capture] Updates to apply:`, JSON.stringify(updates));

        await supabase
          .from("leads")
          .update(updates)
          .eq("id", existingLead.id);

        const { data: updatedLead } = await supabase
          .from("leads")
          .select("*")
          .eq("id", existingLead.id)
          .single();
        console.log(`[Lead Capture] Values after update:`, JSON.stringify(updatedLead));

        console.log(`[Lead Capture Return] Conflict confirmed. Applied pending value for ${pending.field}. Returning { hasConflict: true }`);
        return {
          hasConflict: true,
          response: `Thank you. I have updated your ${pending.field} to ${pending.value}.`,
        };
      } else if (classification === "no") {
        // Discard the pending value
        const newMetadata = { ...existingLead.metadata };
        delete newMetadata.pending_confirmation;

        await supabase
          .from("leads")
          .update({ metadata: newMetadata })
          .eq("id", existingLead.id);

        console.log(`[Lead Capture] UPDATE executed? Yes (Cleared pending confirmation)`);
        console.log(`[Lead Capture Return] Conflict declined. Keeping original value for ${pending.field}. Returning { hasConflict: true }`);
        return {
          hasConflict: true,
          response: `No problem. I will keep your ${pending.field} as ${pending.original}.`,
        };
      } else {
        // Unrelated message: Clear pending confirmation and continue normal processing
        console.log("[Lead Capture] User message unrelated to confirmation. Clearing pending state.");
        const newMetadata = { ...existingLead.metadata };
        delete newMetadata.pending_confirmation;
        
        await supabase
          .from("leads")
          .update({ metadata: newMetadata })
          .eq("id", existingLead.id);
          
        existingLead.metadata = newMetadata; // update local object
      }
    }

    // 3. Extract Entities from the Latest Message
    const extracted = await this.extractEntities(message);
    const hasAnyEntity = Object.values(extracted).some(val => val !== null);

    if (!hasAnyEntity) {
      console.log("[Lead Capture Return] No lead entities detected in message. Skipping database updates. Returning { hasConflict: false }");
      return { hasConflict: false };
    }

    console.log("[Lead Capture] Extracted entities:", JSON.stringify(extracted));
    console.log(`[Lead Capture] Existing lead found? ${existingLead ? "Yes" : "No"}`);
    if (existingLead) {
      console.log(`[Lead Capture] Existing lead ID: ${existingLead.id}`);
    }

    // 4. Create or Update Lead
    if (existingLead) {
      const updates: any = {};
      const newMetadata = { ...existingLead.metadata };
      let metadataChanged = false;
      let conflictField: string | null = null;
      let conflictValue: string | null = null;
      let conflictOriginal: string | null = null;

      // Check all fields for enrichment or conflicts
      const fieldsToCheck = ["name", "email", "phone", "company", "city", "country", "jobTitle", "website", "linkedin"];

      for (const field of fieldsToCheck) {
        const newValue = (extracted as any)[field];
        if (!newValue) continue;

        const existingValue = this.getLeadFieldValue(existingLead, field);

        if (!existingValue) {
          // Progressive Enrichment: field is currently empty, update it
          if (["name", "email", "phone"].includes(field)) {
            updates[field] = newValue;
          } else {
            newMetadata[field] = newValue;
            metadataChanged = true;
          }
        } else if (existingValue !== newValue && !conflictField) {
          // Conflict Detected! Store the first conflict we find
          conflictField = field;
          conflictValue = newValue;
          conflictOriginal = existingValue;
        }
      }

      if (metadataChanged) {
        updates.metadata = newMetadata;
      }

      // If a conflict is detected, set the pending state and return the conflict response
      if (conflictField) {
        newMetadata.pending_confirmation = {
          field: conflictField,
          value: conflictValue,
          original: conflictOriginal,
        };
        updates.metadata = newMetadata;

        console.log(`[Lead Capture] Conflict detected on field '${conflictField}'. Setting pending confirmation.`);
        await supabase
          .from("leads")
          .update(updates)
          .eq("id", existingLead.id);

        console.log(`[Lead Capture Return] Conflict detected on field '${conflictField}'. Returning { hasConflict: true }`);
        return {
          hasConflict: true,
          response: `I already have your ${conflictField} as ${conflictOriginal}. Do you want me to replace it with ${conflictValue}?`,
        };
      }

      // Ensure the lead is linked to the active session
      if (existingLead.session_id !== sessionId) {
        updates.session_id = sessionId;
      }

      if (Object.keys(updates).length > 0) {
        console.log(`[Lead Capture] UPDATE executed? Yes`);
        console.log(`[Lead Capture] Values before update:`, JSON.stringify(existingLead));
        console.log(`[Lead Capture] Updates to apply:`, JSON.stringify(updates));

        await supabase
          .from("leads")
          .update(updates)
          .eq("id", existingLead.id);

        const { data: updatedLead } = await supabase
          .from("leads")
          .select("*")
          .eq("id", existingLead.id)
          .single();
        console.log(`[Lead Capture] Values after update:`, JSON.stringify(updatedLead));
      } else {
        console.log(`[Lead Capture] UPDATE executed? No (No new fields to enrich)`);
      }
    } else {
      // Create new lead
      const metadata = {
        company: extracted.company,
        city: extracted.city,
        country: extracted.country,
        jobTitle: extracted.jobTitle,
        website: extracted.website,
        linkedin: extracted.linkedin,
      };

      console.log(`[Lead Capture] INSERT executed? Yes`);
      console.log(`[Lead Capture] Creating new lead for visitor: ${visitorId || "anonymous"}`);

      const { data: newLead, error: insertError } = await supabase
        .from("leads")
        .insert({
          client_id: clientId,
          session_id: sessionId,
          name: extracted.name,
          email: extracted.email,
          phone: extracted.phone,
          status: "new",
          source: "chatbot",
          metadata,
        })
        .select("*")
        .single();

      if (insertError) {
        console.error("[Lead Capture Error] Failed to create new lead:", insertError.message);
      } else if (newLead) {
        console.log(`[Lead Capture] Values after insert:`, JSON.stringify(newLead));
        console.log(`[Lead Capture] New lead created successfully: ${newLead.id}`);
      }
    }

    console.log(`[Lead Capture Return] Processing complete. No conflicts. Returning { hasConflict: false }`);
    return { hasConflict: false };
  }
}
