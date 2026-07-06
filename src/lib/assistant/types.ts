export type AssistantMode = "standard" | "sales" | "support";

export type UserIntent =
  | "greeting"
  | "small_talk"
  | "product_inquiry"
  | "pricing_inquiry"
  | "demo_request"
  | "support_request"
  | "technical_issue"
  | "purchase_intent"
  | "feature_comparison"
  | "general_question";

export interface PendingConfirmation {
  field: string;
  value: string;
  original: string;
}

export interface AssistantSessionState {
  mode: AssistantMode;
  lastIntent?: UserIntent;
}

export interface VisitorProfile {
  id?: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  industry: string | null;
  website: string | null;
  teamSize: string | null;
  monthlyVisitors: string | null;
  budget: string | null;
  currentChatbot: string | null;
  businessGoals: string | null;
  city?: string | null;
  country?: string | null;
  jobTitle?: string | null;
  linkedin?: string | null;
}

export const QUALIFICATION_FIELDS: Array<keyof VisitorProfile> = [
  "name",
  "company",
  "industry",
  "website",
  "teamSize",
  "monthlyVisitors",
  "budget",
  "currentChatbot",
  "businessGoals",
];

/**
 * Priority fields that must be collected before advancing past qualification.
 */
export const PRIORITY_FIELDS: Array<keyof VisitorProfile> = [
  "name",
  "company",
  "email",
  "businessGoals",
];

/**
 * Ordered conversation stages for deterministic sales flow.
 */
export type ConversationStage =
  | "greeting"
  | "business_discovery"
  | "pain_point_discovery"
  | "qualification"
  | "recommendation"
  | "objection_handling"
  | "demo_booking"
  | "close";

/**
 * Metadata stored in chat_sessions.metadata to track conversation progression.
 */
export interface StageMetadata {
  currentStage: ConversationStage;
  currentGoal: string;
  completedFields: string[];
  pendingFields: string[];
}
