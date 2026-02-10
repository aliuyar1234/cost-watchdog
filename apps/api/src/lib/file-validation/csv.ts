const BINARY_SIGNATURES: number[][] = [
  [0x89, 0x50, 0x4e, 0x47], // PNG
  [0xff, 0xd8, 0xff], // JPEG
  [0x25, 0x50, 0x44, 0x46], // PDF
  [0x50, 0x4b, 0x03, 0x04], // ZIP/XLSX
  [0xd0, 0xcf, 0x11, 0xe0], // OLE/XLS
];

function startsWithSignature(buffer: Buffer, signature: number[]): boolean {
  if (buffer.length < signature.length) {
    return false;
  }

  for (let i = 0; i < signature.length; i += 1) {
    if (buffer[i] !== signature[i]) {
      return false;
    }
  }
  return true;
}

function containsDisallowedControlChars(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    const isAsciiControl = code < 32 && code !== 9 && code !== 10 && code !== 13;
    const isC1Control = code >= 127 && code <= 159;
    if (isAsciiControl || isC1Control) {
      return true;
    }
  }

  return false;
}

export function validateCsvContent(buffer: Buffer): boolean {
  try {
    const text = buffer.toString('utf-8');
    if (text.includes('\0')) {
      return false;
    }

    if (containsDisallowedControlChars(text)) {
      return false;
    }

    for (const signature of BINARY_SIGNATURES) {
      if (startsWithSignature(buffer, signature)) {
        return false;
      }
    }

    return text.trim().length > 0;
  } catch {
    return false;
  }
}
