import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { checkRateLimit, buildRateLimitKey } from "@/lib/rate-limit";
import { checkAllowedDomain } from "@/lib/domain-check";

const LeadPayloadSchema = z.object({
  clientId: z.string().uuid("clientId must be a valid UUID"),
  sessionId: z.string().uuid().optional(),
  name: z.string().max(200).optional(),
  email: z.string().email("Invalid email format").optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  source: z.string().max(100).optional(),
}).refine(
  (data) => (data.email && data.email !== "") || (data.phone && data.phone !== ""),
  { message: "Please provide at least an email or phone number.", path: ["email"] }
);

export async function POST(request: Request) {
  console.log("[API /api/widget/lead] Incoming request reached");
  try {
    // 0. Parse and validate payload
    let rawPayload: unknown;
    try {
      rawPayload = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    console.log("[API /api/widget/lead] Payload:", JSON.stringify(rawPayload));

    const parsed = LeadPayloadSchema.safeParse(rawPayload);
    if (!parsed.success) {
      console.log("[API /api/widget/lead] Validation failed:", parsed.error.flatten());
      return NextResponse.json(
        { error: "Validation failed.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { clientId, sessionId, name, email, phone, source } = parsed.data;

    // 1. Rate limiting — 60 req/min
    const rlKey = buildRateLimitKey(request, clientId);
    const rlResult = checkRateLimit(rlKey, 60);
    if (!rlResult.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again shortly." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil((rlResult.retryAfterMs || 60000) / 1000)) },
        }
      );
    }

    const supabase = createSupabaseServiceClient();

    // 2. Domain enforcement
    const domainResult = await checkAllowedDomain(request, clientId, supabase);
    if (!domainResult.allowed) {
      return NextResponse.json({ error: domainResult.reason }, { status: 403 });
    }

    console.log("[API /api/widget/lead] Validation passed");

    // 3. Check if a lead already exists for this session
    let existingLead = null;
    if (sessionId) {
      const { data: leads, error: fetchError } = await supabase
        .from("leads")
        .select("*")
        .eq("session_id", sessionId)
        .limit(1);

      if (fetchError) {
        console.error("[API /api/widget/lead] Error fetching existing lead:", fetchError);
      } else if (leads && leads.length > 0) {
        existingLead = leads[0];
        console.log("[API /api/widget/lead] Existing lead found:", existingLead.id);
      }
    }

    let leadId = null;

    if (existingLead) {
      // Update existing lead
      console.log("[API /api/widget/lead] Database operation: UPDATE");
      const { data: updated, error: updateError } = await supabase
        .from("leads")
        .update({
          name: name || existingLead.name,
          email: email || existingLead.email,
          phone: phone || existingLead.phone,
          source: source || existingLead.source || "chatbot-widget"
        })
        .eq("id", existingLead.id)
        .select("id")
        .single();

      if (updateError) {
        console.error("[API /api/widget/lead] Update error:", updateError);
        throw updateError;
      }
      leadId = updated.id;
      console.log("[API /api/widget/lead] Lead updated successfully:", leadId);
    } else {
      // Insert new lead
      console.log("[API /api/widget/lead] Database operation: INSERT");
      const { data: inserted, error: insertError } = await supabase
        .from("leads")
        .insert({
          client_id: clientId,
          session_id: sessionId || null,
          name: name || "Anonymous Visitor",
          email: email || null,
          phone: phone || null,
          source: source || "chatbot-widget",
          status: "new"
        })
        .select("id")
        .single();

      if (insertError) {
        console.error("[API /api/widget/lead] Insert error:", insertError);
        throw insertError;
      }
      leadId = inserted.id;
      console.log("[API /api/widget/lead] Lead inserted successfully:", leadId);
    }

    console.log("[API /api/widget/lead] Final response status: 200");
    return NextResponse.json({ success: true, leadId });
  } catch (error: any) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[API /api/widget/lead] Error occurred:", errMsg);
    return NextResponse.json({ error: `Internal Server Error: ${errMsg}` }, { status: 500 });
  }
}
