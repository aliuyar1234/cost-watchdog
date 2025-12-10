import { describe, it, expect } from 'vitest';
import {
  validateFileMagicBytes,
  sanitizeFilename,
  validateFilenameExtension,
  validateFile,
  sanitizeSvg,
  ALLOWED_FILE_TYPES,
} from '../src/lib/file-validation.js';

describe('File Validation Library', () => {
  describe('Magic Byte Validation', () => {
    it('should validate PDF files correctly', async () => {
      // PDF magic bytes: %PDF
      const pdfBuffer = Buffer.from('%PDF-1.4 dummy content');
      const result = await validateFileMagicBytes(pdfBuffer, 'application/pdf');

      expect(result.valid).toBe(true);
      expect(result.declaredType).toBe('application/pdf');
    });

    it('should reject file with mismatched magic bytes', async () => {
      // Create a valid PNG buffer with enough bytes for detection
      const pngBuffer = Buffer.alloc(100);
      pngBuffer.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
      // Add IHDR chunk header for valid PNG
      pngBuffer.set([0x00, 0x00, 0x00, 0x0d], 8); // IHDR length
      pngBuffer.set([0x49, 0x48, 0x44, 0x52], 12); // IHDR type

      const result = await validateFileMagicBytes(pngBuffer, 'application/pdf');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not match declared type');
    });

    it('should validate PNG files correctly', async () => {
      // Create a valid PNG buffer with enough bytes
      const pngBuffer = Buffer.alloc(100);
      pngBuffer.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
      pngBuffer.set([0x00, 0x00, 0x00, 0x0d], 8);
      pngBuffer.set([0x49, 0x48, 0x44, 0x52], 12);

      const result = await validateFileMagicBytes(pngBuffer, 'image/png');

      expect(result.valid).toBe(true);
    });

    it('should validate JPEG files correctly', async () => {
      // Create a valid JPEG buffer with enough bytes
      const jpegBuffer = Buffer.alloc(100);
      jpegBuffer.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00], 0);

      const result = await validateFileMagicBytes(jpegBuffer, 'image/jpeg');

      expect(result.valid).toBe(true);
    });

    it('should reject unknown MIME types', async () => {
      const buffer = Buffer.from('test');
      const result = await validateFileMagicBytes(buffer, 'application/unknown');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not allowed');
    });

    it('should accept CSV without magic bytes (text validation)', async () => {
      const csvBuffer = Buffer.from('name,value\ntest,123\n');
      const result = await validateFileMagicBytes(csvBuffer, 'text/csv');

      expect(result.valid).toBe(true);
    });

    it('should reject binary content declared as CSV', async () => {
      // Binary content with null bytes
      const binaryBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      const result = await validateFileMagicBytes(binaryBuffer, 'text/csv');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('CSV');
    });

    it('should reject PNG magic bytes declared as CSV', async () => {
      const pngBuffer = Buffer.from('\x89PNG\r\n\x1a\n');
      const result = await validateFileMagicBytes(pngBuffer, 'text/csv');

      expect(result.valid).toBe(false);
    });
  });

  describe('SVG Validation', () => {
    it('should accept valid SVG', async () => {
      const svgBuffer = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>'
      );
      const result = await validateFileMagicBytes(svgBuffer, 'image/svg+xml');

      expect(result.valid).toBe(true);
    });

    it('should reject SVG with script tag', async () => {
      const svgBuffer = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert("xss")</script></svg>'
      );
      const result = await validateFileMagicBytes(svgBuffer, 'image/svg+xml');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('dangerous');
    });

    it('should reject SVG with onclick handler', async () => {
      const svgBuffer = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><circle onclick="alert(1)"/></svg>'
      );
      const result = await validateFileMagicBytes(svgBuffer, 'image/svg+xml');

      expect(result.valid).toBe(false);
    });

    it('should reject SVG with javascript URL', async () => {
      const svgBuffer = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text>click</text></a></svg>'
      );
      const result = await validateFileMagicBytes(svgBuffer, 'image/svg+xml');

      expect(result.valid).toBe(false);
    });

    it('should reject SVG with foreignObject', async () => {
      const svgBuffer = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body>html</body></foreignObject></svg>'
      );
      const result = await validateFileMagicBytes(svgBuffer, 'image/svg+xml');

      expect(result.valid).toBe(false);
    });

    it('should reject non-SVG XML', async () => {
      const xmlBuffer = Buffer.from(
        '<?xml version="1.0"?><html><body>not svg</body></html>'
      );
      const result = await validateFileMagicBytes(xmlBuffer, 'image/svg+xml');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('SVG root element');
    });
  });

  describe('SVG Sanitization', () => {
    it('should remove script tags', () => {
      const svgBuffer = Buffer.from(
        '<svg><script>alert(1)</script><circle/></svg>'
      );
      const sanitized = sanitizeSvg(svgBuffer);

      expect(sanitized).not.toBeNull();
      expect(sanitized!.toString()).not.toContain('script');
      expect(sanitized!.toString()).toContain('circle');
    });

    it('should remove event handlers', () => {
      const svgBuffer = Buffer.from(
        '<svg><circle onclick="alert(1)" r="50"/></svg>'
      );
      const sanitized = sanitizeSvg(svgBuffer);

      expect(sanitized).not.toBeNull();
      expect(sanitized!.toString()).not.toContain('onclick');
    });

    it('should remove javascript URLs', () => {
      const svgBuffer = Buffer.from(
        '<svg><a href="javascript:alert(1)">link</a></svg>'
      );
      const sanitized = sanitizeSvg(svgBuffer);

      expect(sanitized).not.toBeNull();
      expect(sanitized!.toString()).not.toContain('javascript');
    });
  });

  describe('Filename Sanitization', () => {
    it('should sanitize path traversal attempts', () => {
      const result = sanitizeFilename('../../../etc/passwd');
      expect(result.sanitized).not.toContain('..');
      expect(result.changed).toBe(true);
    });

    it('should remove null bytes', () => {
      const result = sanitizeFilename('file\x00.pdf');
      expect(result.sanitized).not.toContain('\x00');
    });

    it('should handle Windows reserved names', () => {
      const result = sanitizeFilename('CON.txt');
      expect(result.sanitized).not.toBe('CON.txt');
      expect(result.sanitized.toUpperCase().startsWith('CON.')).toBe(false);
    });

    it('should extract basename from paths', () => {
      const result = sanitizeFilename('/path/to/file.pdf');
      expect(result.sanitized).toBe('file.pdf');
    });

    it('should handle Windows paths', () => {
      const result = sanitizeFilename('C:\\Users\\test\\file.pdf');
      expect(result.sanitized).not.toContain('\\');
      expect(result.sanitized).not.toContain(':');
    });

    it('should not change valid filenames', () => {
      const result = sanitizeFilename('valid_file-123.pdf');
      expect(result.sanitized).toBe('valid_file-123.pdf');
      expect(result.changed).toBe(false);
    });

    it('should handle empty filenames', () => {
      const result = sanitizeFilename('');
      expect(result.sanitized).toBe('unnamed_file');
    });

    it('should handle filenames with only dots', () => {
      const result = sanitizeFilename('...');
      expect(result.sanitized.length).toBeGreaterThan(0);
      expect(result.sanitized).not.toBe('...');
    });

    it('should trim whitespace from ends', () => {
      const result = sanitizeFilename('  file.pdf  ');
      expect(result.sanitized).toBe('file.pdf');
    });

    it('should limit filename length', () => {
      const longName = 'a'.repeat(300) + '.pdf';
      const result = sanitizeFilename(longName);
      expect(result.sanitized.length).toBeLessThanOrEqual(255);
      expect(result.sanitized.endsWith('.pdf')).toBe(true);
    });
  });

  describe('Extension Validation', () => {
    it('should accept valid extensions for MIME type', () => {
      const result = validateFilenameExtension('document.pdf', 'application/pdf');
      expect(result.valid).toBe(true);
    });

    it('should accept xlsx for spreadsheet MIME type', () => {
      const result = validateFilenameExtension(
        'spreadsheet.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      expect(result.valid).toBe(true);
    });

    it('should accept both jpg and jpeg', () => {
      const result1 = validateFilenameExtension('image.jpg', 'image/jpeg');
      const result2 = validateFilenameExtension('image.jpeg', 'image/jpeg');

      expect(result1.valid).toBe(true);
      expect(result2.valid).toBe(true);
    });

    it('should reject mismatched extensions', () => {
      const result = validateFilenameExtension('document.exe', 'application/pdf');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not match');
    });

    it('should be case insensitive for extensions', () => {
      const result = validateFilenameExtension('DOCUMENT.PDF', 'application/pdf');
      expect(result.valid).toBe(true);
    });

    it('should reject unknown MIME types', () => {
      const result = validateFilenameExtension('file.exe', 'application/x-executable');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unknown MIME type');
    });
  });

  describe('Complete File Validation', () => {
    it('should pass for valid PDF', async () => {
      const pdfBuffer = Buffer.from('%PDF-1.4 dummy content');
      const result = await validateFile(pdfBuffer, 'document.pdf', 'application/pdf');

      expect(result.valid).toBe(true);
      expect(result.sanitizedFilename).toBe('document.pdf');
      expect(result.errors.length).toBe(0);
    });

    it('should sanitize filename and validate content', async () => {
      const pdfBuffer = Buffer.from('%PDF-1.4 dummy content');
      const result = await validateFile(pdfBuffer, '../../../document.pdf', 'application/pdf');

      expect(result.valid).toBe(true);
      expect(result.sanitizedFilename).not.toContain('..');
    });

    it('should collect multiple errors', async () => {
      // Full PNG file (with enough bytes for detection) declared as PDF with wrong extension
      const pngBuffer = Buffer.alloc(100);
      pngBuffer.writeUInt8(0x89, 0);
      pngBuffer.writeUInt8(0x50, 1); // P
      pngBuffer.writeUInt8(0x4e, 2); // N
      pngBuffer.writeUInt8(0x47, 3); // G
      pngBuffer.writeUInt8(0x0d, 4);
      pngBuffer.writeUInt8(0x0a, 5);
      pngBuffer.writeUInt8(0x1a, 6);
      pngBuffer.writeUInt8(0x0a, 7);
      // Add more PNG header bytes
      pngBuffer.fill(0, 8, 100);

      const result = await validateFile(pngBuffer, 'image.exe', 'application/pdf');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject when extension mismatches MIME type', async () => {
      const csvBuffer = Buffer.from('a,b,c\n1,2,3');
      const result = await validateFile(csvBuffer, 'data.txt', 'text/csv');

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('extension'))).toBe(true);
    });
  });

  describe('ALLOWED_FILE_TYPES Configuration', () => {
    it('should have PDF configured', () => {
      expect(ALLOWED_FILE_TYPES['application/pdf']).toBeDefined();
      expect(ALLOWED_FILE_TYPES['application/pdf'].extensions).toContain('.pdf');
      expect(ALLOWED_FILE_TYPES['application/pdf'].hasMagicBytes).toBe(true);
    });

    it('should have XLSX configured', () => {
      expect(ALLOWED_FILE_TYPES['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']).toBeDefined();
    });

    it('should have CSV configured without magic bytes', () => {
      expect(ALLOWED_FILE_TYPES['text/csv']).toBeDefined();
      expect(ALLOWED_FILE_TYPES['text/csv'].hasMagicBytes).toBe(false);
    });

    it('should have image types configured', () => {
      expect(ALLOWED_FILE_TYPES['image/png']).toBeDefined();
      expect(ALLOWED_FILE_TYPES['image/jpeg']).toBeDefined();
    });
  });
});
