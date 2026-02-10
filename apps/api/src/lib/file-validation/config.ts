export interface AllowedFileTypeConfig {
  extensions: string[];
  hasMagicBytes: boolean;
}

export const ALLOWED_FILE_TYPES: Record<string, AllowedFileTypeConfig> = {
  'application/pdf': {
    extensions: ['.pdf'],
    hasMagicBytes: true,
  },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    extensions: ['.xlsx'],
    hasMagicBytes: true,
  },
  'application/vnd.ms-excel': {
    extensions: ['.xls'],
    hasMagicBytes: true,
  },
  'text/csv': {
    extensions: ['.csv'],
    hasMagicBytes: false,
  },
  'image/png': {
    extensions: ['.png'],
    hasMagicBytes: true,
  },
  'image/jpeg': {
    extensions: ['.jpg', '.jpeg'],
    hasMagicBytes: true,
  },
  'image/svg+xml': {
    extensions: ['.svg'],
    hasMagicBytes: false,
  },
};

export const MIME_TYPE_ALIASES: Record<string, string[]> = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['application/zip'],
  'application/vnd.ms-excel': ['application/x-cfb', 'application/x-ole-storage'],
};
