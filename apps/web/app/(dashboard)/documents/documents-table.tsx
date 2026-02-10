import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { formatDate, formatFileSize, getExtractionStatusBadge } from '../../lib/formatting';
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
    <Card>
      <CardHeader>
        <CardTitle>Hochgeladene Dokumente</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
          </div>
        ) : documents.length === 0 ? (
          <div className="py-12 text-center">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">Keine Dokumente</h3>
            <p className="mt-1 text-sm text-gray-500">Laden Sie Ihr erstes Dokument hoch.</p>
          </div>
        ) : (
          <div className="space-y-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Dateiname
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Typ
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Groesse
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Hochgeladen
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">
                    Aktionen
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <div className="flex items-center">
                        <svg
                          className="mr-2 h-5 w-5 text-gray-400"
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
                          className="max-w-xs truncate text-sm text-gray-900"
                          title={doc.originalFilename}
                        >
                          {doc.originalFilename}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500">
                      {doc.mimeType.split('/')[1]?.toUpperCase() || 'N/A'}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500">
                      {formatFileSize(doc.fileSize)}
                    </td>
                    <td className="px-4 py-4">{getExtractionStatusBadge(doc.extractionStatus)}</td>
                    <td className="px-4 py-4 text-sm text-gray-500">
                      {formatDate(doc.uploadedAt)}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void onDownload(doc)}
                          title="Herunterladen"
                          aria-label="Herunterladen"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                            />
                          </svg>
                        </Button>
                        {(doc.extractionStatus === 'failed' ||
                          doc.extractionStatus === 'manual') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void onRetry(doc)}
                            title="Erneut verarbeiten"
                            aria-label="Erneut verarbeiten"
                          >
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                              />
                            </svg>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDelete(doc)}
                          title="Loeschen"
                          aria-label="Loeschen"
                          className="text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

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
