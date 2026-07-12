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