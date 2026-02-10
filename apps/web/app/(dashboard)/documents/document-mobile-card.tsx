import { formatDate, formatFileSize, getExtractionStatusBadge } from '../../lib/formatting';
import type { ManagedDocument } from './types';
import { DocumentActions } from './document-actions';

interface DocumentMobileCardProps {
  doc: ManagedDocument;
  onDownload: (doc: ManagedDocument) => Promise<void>;
  onRetry: (doc: ManagedDocument) => Promise<void>;
  onDelete: (doc: ManagedDocument) => void;
}

function getFileTypeLabel(mimeType: string): string {
  return mimeType.split('/')[1]?.toUpperCase() || 'N/A';
}

export function DocumentMobileCard({
  doc,
  onDownload,
  onRetry,
  onDelete,
}: DocumentMobileCardProps) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900" title={doc.originalFilename}>
            {doc.originalFilename}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {getFileTypeLabel(doc.mimeType)} | {formatFileSize(doc.fileSize)}
          </p>
        </div>
        {getExtractionStatusBadge(doc.extractionStatus)}
      </div>

      <p className="mb-2 text-xs text-slate-500">Hochgeladen: {formatDate(doc.uploadedAt)}</p>
      <DocumentActions doc={doc} onDownload={onDownload} onRetry={onRetry} onDelete={onDelete} />
    </div>
  );
}
