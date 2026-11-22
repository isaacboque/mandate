/** Splits text on **bold** spans. Parts are plain text for React to render as text, never as HTML; an unmatched marker stays as typed. */
export interface Part { text: string; bold?: true }

export function splitBold(input: string): Part[] {
  const out: Part[] = [];
  const re = /\*\*(?=\S)([^*\n]*?\S)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    if (m.index > last) out.push({ text: input.slice(last, m.index) });
    out.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < input.length) out.push({ text: input.slice(last) });
  return out;
}
