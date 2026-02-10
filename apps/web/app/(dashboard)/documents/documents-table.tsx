import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { formatDate, formatFileSize, getExtractionStatusBadge } from '../../lib/formatting';
import { DocumentActions } from './document-actions';
import { DocumentEmptyState } from './document-empty-state';
import { DocumentMobileCard } from './document-mobile-card';
import type { ManagedDocument } from './types';

interface DocumentsTableProps {
  documents: ManagedDocument[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  onDownload: (doc: ManagedDocument) => Promise<void>;
  onRetry: (doc: ManagedDocument) => Promise<void>;
  onDelete: (doc: ManagedDocument) => void;
  onLoadMore: () => Promise<void>;
}

function getFileTypeLabel(mimeType: string): string {
  return mimeType.split('/')[1]?.toUpperCase() || 'N/A';
}

export function DocumentsTable({
  documents,
  isLoading,
  isLoadingMore,
  hasMore,
  onDownload,
  onRetry,
  onDelete,
  onLoadMore,
}: DocumentsTableProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-white/80">
        <CardTitle>Hochgeladene Dokumente</CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-slate-900" />
          </div>
        ) : documents.length === 0 ? (
          <DocumentEmptyState />
        ) : (
          <div className="space-y-5">
            <div className="space-y-3 md:hidden">
              {documents.map((doc) => (
                <DocumentMobileCard
                  key={doc.id}
                  doc={doc}
                  onDownload={onDownload}
                  onRetry={onRetry}
                  onDelete={onDelete}
                />
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    <th className="px-4 py-3">Dateiname</th>
                    <th className="px-4 py-3">Typ</th>
                    <th className="px-4 py-3">Groesse</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Hochgeladen</th>
                    <th className="px-4 py-3 text-right">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => (
                    <tr
                      key={doc.id}
                      className="border-b border-slate-100/70 transition hover:bg-white/85"
                    >
                      <td className="px-4 py-4">
                        <div className="flex items-center">
                          <svg
                            className="mr-2 h-5 w-5 text-slate-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                            />
                          </svg>
                          <span
                            className="max-w-xs truncate text-sm text-slate-900"
                            title={doc.originalFilename}
                          >
                            {doc.originalFilename}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600">
                        {getFileTypeLabel(doc.mimeType)}
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600">
                        {formatFileSize(doc.fileSize)}
                      </td>
                      <td className="px-4 py-4">
                        {getExtractionStatusBadge(doc.extractionStatus)}
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600">
                        {formatDate(doc.uploadedAt)}
                      </td>
                      <td className="px-4 py-4">
                        <DocumentActions
                          doc={doc}
                          onDownload={onDownload}
                          onRetry={onRetry}
                          onDelete={onDelete}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {hasMore && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  onClick={() => void onLoadMore()}
                  disabled={isLoadingMore}
                >
                  {isLoadingMore ? 'Laden...' : 'Mehr laden'}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
