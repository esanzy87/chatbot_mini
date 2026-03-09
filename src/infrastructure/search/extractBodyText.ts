function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function extractBodyText(html: string, maxLength: number = 4000): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");

  const text = decodeEntities(
    withoutScripts
      .replace(/<main[\s\S]*?>/gi, " ")
      .replace(/<\/main>/gi, " ")
      .replace(/<article[\s\S]*?>/gi, " ")
      .replace(/<\/article>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );

  return text.slice(0, maxLength).trim();
}
