import { getGroqChatCompletion } from "@/lib/groq";
import { VisitorProfile, PendingConfirmation } from "./types";

export class SalesEngine {
  /**
   * Performs deterministic extraction using regex for email, phone, website, and LinkedIn.
   */
  public static deterministicExtract(text: string): Partial<VisitorProfile> {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i;
    const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
    const linkedinRegex = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+/i;
    const websiteRegex = /(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[a-zA-Z0-9-_./?%&=]*)?/i;

    const emailMatch = text.match(emailRegex);
    const phoneMatch = text.match(phoneRegex);
    const linkedinMatch = text.match(linkedinRegex);
    
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
   * Extracts entities from the latest message using Groq.
   */
  public static async extractEntities(message: string): Promise<Partial<VisitorProfile>> {
    const deterministic = this.deterministicExtract(message);

    let name: string | null = null;
    let company: string | null = null;
    let industry: string | null = null;
    let teamSize: string | null = null;
    let monthlyVisitors: string | null = null;
    let budget: string | null = null;
    let currentChatbot: string | null = null;
    let businessGoals: string | null = null;
    let city: string | null = null;
    let country: string | null = null;
    let jobTitle: string | null = null;

    try {
      const systemPrompt = `You are an AI assistant specialized in extracting lead profile information from a single user message.
Analyze the message and extract the following fields:
- name (person's full or first name. Do NOT extract titles or pronouns. If no explicit personal name is mentioned, set to null)
- company (company or business name)
- industry (the vertical/industry of the company, e.g., SaaS, Retail, Healthcare)
- teamSize (number of employees, e.g., "10-50", "under 100", "500")
- monthlyVisitors (number of monthly website visitors, e.g. "50k", "10,000", "1M")
- budget (budget details, e.g., "$1000/mo", "flexible", "$500")
- currentChatbot (any existing chatbot they currently use, e.g., Intercom, Zendesk, None)
- businessGoals (their main goal, e.g., "automate support", "capture leads", "increase sales")
- city (city)
- country (country)
- jobTitle (job title, e.g. "CTO", "Founder", "Manager")

You MUST respond with a valid JSON object ONLY, matching the keys above. If an entity is not found in the message, set its value to null. Do not invent any information.

Example JSON output:
{
  "name": "Kush",
  "company": "Tarkshy",
  "industry": "Consulting",
  "teamSize": "10-20",
  "monthlyVisitors": "5000",
  "budget": "$1000/mo",
  "currentChatbot": "None",
  "businessGoals": "automate lead capture",
  "city": "Ahmedabad",
  "country": "India",
  "jobTitle": "Founder"
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
        const parsed = JSON.parse(jsonStr);
        
        name = parsed.name?.trim() || null;
        company = parsed.company?.trim() || null;
        industry = parsed.industry?.trim() || null;
        teamSize = parsed.teamSize?.trim() || null;
        monthlyVisitors = parsed.monthlyVisitors?.trim() || null;
        budget = parsed.budget?.trim() || null;
        currentChatbot = parsed.currentChatbot?.trim() || null;
        businessGoals = parsed.businessGoals?.trim() || null;
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
      console.warn("[Sales Engine] LLM entity extraction failed:", err);
    }

    return {
      name,
      email: deterministic.email || null,
      phone: deterministic.phone || null,
      company,
      industry,
      website: deterministic.website || null,
      teamSize,
      monthlyVisitors,
      budget,
      currentChatbot,
      businessGoals,
      city,
      country,
      jobTitle,
      linkedin: deterministic.linkedin || null,
    };
  }

  /**
   * Helper to retrieve value from existing lead structure.
   */
  public static getLeadFieldValue(lead: any, field: string): string | null {
    if (["name", "email", "phone"].includes(field)) {
      return lead[field] || null;
    }
    return lead.metadata?.[field] || null;
  }

  /**
   * Classifies if the message is a confirmation (yes/no/unrelated).
   */
  public static classifyConfirmation(message: string): "yes" | "no" | "unrelated" {
    const text = message.trim().toLowerCase();
    
    const yesRegex = /^(yes|y|yeah|yep|yup|sure|ok|okay|agree|correct|confirm|go ahead|do it|replace|please do)/i;
    const noRegex = /^(no|n|nope|nah|dont|do not|keep|cancel|stop|reject|dont replace)/i;

    if (yesRegex.test(text)) return "yes";
    if (noRegex.test(text)) return "no";

    if (text === "yes" || text === "y" || text.includes("yes please") || text.includes("go ahead")) return "yes";
    if (text === "no" || text === "n" || text.includes("no thanks") || text.includes("dont do it")) return "no";

    return "unrelated";
  }

  /**
   * Evaluates the extracted fields against the existing lead to detect updates or conflicts.
   * Returns updates object, or conflict details if a conflict is found.
   */
  public static evaluateUpdates(
    existingLead: any,
    extracted: Partial<VisitorProfile>
  ): {
    updates: any;
    conflict: PendingConfirmation | null;
  } {
    const updates: any = {};
    const newMetadata = { ...(existingLead?.metadata || {}) };
    let metadataChanged = false;
    let conflict: PendingConfirmation | null = null;

    const fieldsToCheck = [
      "name",
      "email",
      "phone",
      "company",
      "industry",
      "website",
      "teamSize",
      "monthlyVisitors",
      "budget",
      "currentChatbot",
      "businessGoals",
      "city",
      "country",
      "jobTitle",
      "linkedin"
    ];

    for (const field of fieldsToCheck) {
      const newValue = (extracted as any)[field];
      if (newValue === null || newValue === undefined || String(newValue).trim() === "") continue;

      const existingValue = this.getLeadFieldValue(existingLead || {}, field);

      if (existingValue === null || existingValue === undefined || String(existingValue).trim() === "" || String(existingValue) === "Anonymous Visitor") {
        // Enrichment: field was empty, fill it
        if (["name", "email", "phone"].includes(field)) {
          updates[field] = newValue;
        } else {
          newMetadata[field] = newValue;
          metadataChanged = true;
        }
      } else if (field === "businessGoals") {
        newMetadata[field] = newValue;
        metadataChanged = true;
      } else if (String(existingValue).trim().toLowerCase() !== String(newValue).trim().toLowerCase() && !conflict) {
        conflict = {
          field,
          value: newValue,
          original: existingValue,
        };
      }
    }

    if (metadataChanged) {
      updates.metadata = newMetadata;
    }

    return { updates, conflict };
  }

  /**
   * Suggests remaining fields with warm, consultative phrasing tied to business value.
   */
  public static getQualificationPromptSnippet(remainingFields: string[]): string {
    if (remainingFields.length === 0) {
      return "\n\nSales Qualification: All key details have been collected! Focus on understanding their needs deeper, recommending the best-fit solution, and naturally guiding them toward booking a demo or scheduling a call.";
    }

    const priorityOrder = [
      "name",
      "company",
      "businessGoals",
      "website",
      "industry",
      "budget",
      "currentChatbot",
      "teamSize",
      "monthlyVisitors",
    ];

    const nextField = priorityOrder.find((f) => remainingFields.includes(f)) || remainingFields[0];

    const fieldDescriptions: Record<string, string> = {
      name: "their name — so you can personalize the conversation (e.g., 'May I know your name so I can address you properly?')",
      company: "their company name — so you can understand their business better (e.g., 'What is the name of your company?')",
      businessGoals: "their main business goals — what they want to achieve with AI (e.g., 'What's the biggest challenge you'd like to solve with automation?')",
      website: "their company website — so you can see their current setup and recommend the right solution (e.g., 'Could you share your website URL? I'd love to see what you offer.')",
      industry: "their industry — so you can tailor recommendations (e.g., 'What industry are you in?')",
      budget: "their budget range — so you can suggest the right plan (e.g., 'Do you have a monthly budget in mind for this kind of solution?')",
      currentChatbot: "whether they currently use any chatbot solution — to understand their existing workflow (e.g., 'Are you using any chatbot or live chat tool right now?')",
      teamSize: "their team size — to recommend the right scale of solution (e.g., 'How big is your team?')",
      monthlyVisitors: "their monthly website traffic — to size the solution appropriately (e.g., 'Approximately how many visitors does your website get each month?')",
    };

    const desc = fieldDescriptions[nextField] || nextField;

    return `\n\nSales Qualification: We are gradually learning about the visitor. The next piece of information to collect is: ${desc}.
IMPORTANT:
1. Do NOT ask for any detail that is already known (check the Visitor Profile).
2. Ask exactly ONE question, naturally woven into the conversation.
3. Frame the question in terms of how it helps YOU help THEM — not as a form to fill out.
4. Keep the conversation warm, consultative, and professional.`;
  }
}
