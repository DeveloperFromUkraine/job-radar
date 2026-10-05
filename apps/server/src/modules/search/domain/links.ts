// AC-09: a source link is sent only for an ordinary web address. Pure; never throws.

export function safeUrl(url: string): string | null {
  if (!URL.canParse(url)) return null;
  const { protocol } = new URL(url);
  return protocol === "http:" || protocol === "https:" ? url : null;
}
