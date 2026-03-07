import type { SourceItem } from "@/domain/models";
import { codePointLength } from "@/core/validation/text";

export function isValidSourceItem(item: SourceItem): boolean {
  const title = item.title.trim();
  const url = item.url.trim();
  const source = item.source.trim();

  if (codePointLength(title) < 1 || codePointLength(title) > 120) {
    return false;
  }

  if (source.length < 1 || source.length > 40 || !/^[a-z0-9_-]+$/.test(source)) {
    return false;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
  } catch {
    return false;
  }

  return true;
}

export function normalizeSources(items: SourceItem[]): SourceItem[] {
  const output: SourceItem[] = [];
  const seenUrls = new Set<string>();

  for (const item of items) {
    const normalized: SourceItem = {
      title: item.title.trim(),
      url: item.url.trim(),
      source: item.source.trim()
    };

    if (!isValidSourceItem(normalized)) {
      continue;
    }

    if (seenUrls.has(normalized.url)) {
      continue;
    }

    seenUrls.add(normalized.url);
    output.push(normalized);

    if (output.length === 5) {
      break;
    }
  }

  return output;
}
