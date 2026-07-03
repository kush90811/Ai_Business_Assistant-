import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export async function POST(request: Request) {
  console.log("[API /api/widget/lead] Incoming request reached");
  try {
    const payload = await request.json();
    console.log("[API /api/widget/lead] Payload:", JSON.stringify(payload));

    const { clientId, sessionId, name, email, phone, source } = payload;

    // Validation
    if (!clientId) {
      console.log("[API /api/widget/lead] Validation failed: clientId is missing");
      return NextResponse.json({ error: "clientId is required" }, { status: 400 });
    }

    if (!email && !phone) {
      console.log("[API /api/widget/lead] Validation failed: email and phone are both missing");
      return NextResponse.json({ error: "Please provide at least an email or phone number." }, { status: 400 });
    }

    console.log("[API /api/widget/lead] Validation passed");

    const supabase = createSupabaseServiceClient();

    // Check if a lead already exists for this session
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
