const SVG_DANGEROUS_PATTERNS = [
  /<script[\s>]/i,
  /<\/script>/i,
  /\bon\w+\s*=/i,
  /javascript:/i,
  /data:text\/html/i,
  /data:application\/javascript/i,
  /<foreignObject/i,
  /xlink:href\s*=\s*["'](?!#)/i,
  /<svg[^>]*onload/i,
];

export function validateSvgContent(buffer: Buffer): { valid: boolean; error?: string } {
  try {
    const text = buffer.toString('utf-8');

    if (!text.trim().startsWith('<')) {
      return { valid: false, error: 'File does not appear to be valid SVG/XML' };
    }

    if (!/<svg[\s>]/i.test(text)) {
      return { valid: false, error: 'File does not contain SVG root element' };
    }

    for (const pattern of SVG_DANGEROUS_PATTERNS) {
      if (pattern.test(text)) {
        return {
          valid: false,
          error: `SVG contains potentially dangerous content: ${pattern.source}`,
        };
      }
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Failed to parse SVG content' };
  }
}

export function sanitizeSvg(buffer: Buffer): Buffer | null {
  try {
    let text = buffer.toString('utf-8');
    text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
    text = text.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
    text = text.replace(/javascript:[^"']*/gi, '');
    text = text.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '');
    return Buffer.from(text, 'utf-8');
  } catch {
    return null;
  }
}
