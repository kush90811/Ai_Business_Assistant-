import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Resolves indirect or page wrapper URLs (such as Google Drive sharing links)
 * into raw direct image file URLs that can be loaded in an <img> tag.
 */
export function getDirectImageUrl(url: string | undefined): string {
  if (!url) return "";
  const trimmed = url.trim();

  // 1. Google Drive file path pattern: /file/d/FILE_ID/view
  const driveFileRegex = /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/;
  const matchFile = trimmed.match(driveFileRegex);
  if (matchFile && matchFile[1]) {
    return `https://lh3.googleusercontent.com/d/${matchFile[1]}`;
  }

  // 2. Google Drive open/uc query pattern: ?id=FILE_ID
  const driveQueryRegex = /drive\.google\.com\/.*[?&]id=([a-zA-Z0-9_-]+)/;
  const matchQuery = trimmed.match(driveQueryRegex);
  if (matchQuery && matchQuery[1]) {
    return `https://lh3.googleusercontent.com/d/${matchQuery[1]}`;
  }

  return trimmed;
}

export interface LeadScoreInput {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Computes a standardized lead intent score (0 to 100) based on field completeness,
 * lead status, and optional explicit score overrides in metadata.
 */
export function calculateLeadScore(lead: LeadScoreInput | null | undefined): number {
  if (!lead) return 30;

  // Overwrite if explicit numeric score exists in metadata
  const meta = lead.metadata;
  if (meta && typeof meta === "object" && meta !== null && "score" in meta) {
    const customScore = Number((meta as Record<string, unknown>).score);
    if (!isNaN(customScore) && customScore > 0) {
      return Math.min(Math.max(customScore, 0), 100);
    }
  }

  let score = 30;
  if (lead.email && lead.email.trim() !== "") score += 40;
  if (lead.phone && lead.phone.trim() !== "") score += 20;
  if (lead.name && lead.name !== "Anonymous" && lead.name.trim() !== "") score += 10;

  if (lead.status === "qualified") score += 10;
  else if (lead.status === "contacted") score += 5;

  return Math.min(Math.max(score, 0), 100);
}