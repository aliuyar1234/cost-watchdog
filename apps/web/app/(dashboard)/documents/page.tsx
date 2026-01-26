'use client';

import { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Modal } from '../../components/ui/modal';
import { documentsApi, type Document, ApiError } from '../../lib/api';
import { formatDate, formatFileSize, getExtractionStatusBadge } from '../../lib/formatting';

const PAGE_LIMIT = 25;

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [docToDelete, setDocToDelete] = useState<Document | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pagination, setPagination] = useState({
    total: 0,
    limit: PAGE_LIMIT,
    offset: 0,
    hasMore: false,
  });

  const fetchDocuments = async (params?: { offset?: number; append?: boolean }) => {
    const offset = params?.offset ?? 0;
    const append = params?.append ?? false;

    try {
      setError(null);
      const response = await documentsApi.list({ limit: PAGE_LIMIT, offset });
      const hasMore = response.pagination.offset + response.data.length < response.pagination.total;
      setPagination({ ...response.pagination, hasMore });
      setDocuments((prev) => (append ? [...prev, ...response.data] : response.data));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Dokumente konnten nicht geladen werden.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchDocuments();
  }, []);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    setIsUploading(true);
    setUploadError('');
    setUploadSuccess('');

    try {
      for (const file of acceptedFiles) {
        await documentsApi.upload(file);
      }
      setUploadSuccess(`${acceptedFiles.length} Dokument(e) erfolgreich hochgeladen`);
      await fetchDocuments();
    } catch (error) {
      if (error instanceof ApiError) {
        setUploadError(error.message);
      } else {
        setUploadError('Upload fehlgeschlagen. Bitte versuchen Sie es erneut.');
      }
    } finally {
      setIsUploading(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
    maxSize: 10 * 1024 * 1024, // 10MB
  });

  const handleDownload = async (doc: Document) => {
    try {
      setError(null);
      const { downloadUrl } = await documentsApi.getDownloadUrl(doc.id);
      const opened = window.open(downloadUrl, '_blank', 'noopener,noreferrer');
      if (!opened) {
        window.location.assign(downloadUrl);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Download fehlgeschlagen.');
    }
  };

  const handleDelete = async (doc: Document) => {
    setDocToDelete(doc);
  };

  const confirmDelete = async () => {
    if (!docToDelete) return;

    try {
      setIsDeleting(true);
      setError(null);
      await documentsApi.delete(docToDelete.id);
      setDocToDelete(null);
      await fetchDocuments();
    } catch (error) {
      if (error instanceof ApiError) {
        setError(error.message);
      } else {
        setError('Löschen fehlgeschlagen.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRetry = async (doc: Document) => {
    try {
      setError(null);
      await documentsApi.retryExtraction(doc.id);
      await fetchDocuments();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Erneuter Versuch fehlgeschlagen.');
    }
  };

  const handleLoadMore = async () => {
    if (isLoadingMore || !pagination.hasMore) return;
    try {
      setIsLoadingMore(true);
      const nextOffset = pagination.offset + pagination.limit;
      await fetchDocuments({ offset: nextOffset, append: true });
    } finally {
      setIsLoadingMore(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dokumente</h1>
        <p className="mt-1 text-gray-500">Rechnungen und Abrechnungen hochladen und verwalten</p>
      </div>

      {/* Upload Zone */}
      <Card>
        <CardContent className="pt-6">
          <div
            {...getRootProps({
              role: 'button',
              tabIndex: 0,
              'aria-label': 'Dokumente hochladen',
            })}
            className={`cursor-pointer rounded-lg border-2 border-dashed p-12 text-center transition-colors ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'} ${isUploading ? 'pointer-events-none opacity-50' : ''} `}
          >
            <input {...getInputProps({ 'aria-label': 'Dokument auswählen' })} />
            {isUploading ? (
              <div className="flex flex-col items-center">
                <div className="mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" />
                <p className="text-gray-600">Dokumente werden hochgeladen...</p>
              </div>
            ) : (
              <>
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
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                <p className="mt-4 text-lg font-medium text-gray-900">
                  {isDragActive ? 'Dateien hier ablegen' : 'Dateien hierher ziehen'}
                </p>
                <p className="mt-2 text-sm text-gray-500">oder klicken zum Auswählen</p>
                <p className="mt-1 text-xs text-gray-400">PDF, Excel, CSV (max. 10MB)</p>
              </>
            )}
          </div>

          {uploadError && (
            <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{uploadError}</div>
          )}

          {uploadSuccess && (
            <div className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-700">
              {uploadSuccess}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}
        </CardContent>
      </Card>

      {/* Documents List */}
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
                      Größe
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
                      <td className="px-4 py-4">
                        {getExtractionStatusBadge(doc.extractionStatus)}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {formatDate(doc.uploadedAt)}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownload(doc)}
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
                              onClick={() => handleRetry(doc)}
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
                            onClick={() => handleDelete(doc)}
                            title="Löschen"
                            aria-label="Löschen"
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

              {pagination.hasMore && (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="outline"
                    onClick={() => void handleLoadMore()}
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

      {docToDelete && (
        <Modal
          title="Dokument löschen"
          onClose={() => {
            if (isDeleting) return;
            setDocToDelete(null);
          }}
        >
          <p className="text-gray-700">
            Möchten Sie &quot;{docToDelete.originalFilename}&quot; wirklich löschen?
          </p>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setDocToDelete(null)} disabled={isDeleting}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmDelete()}
              disabled={isDeleting}
            >
              {isDeleting ? 'Löschen...' : 'Löschen'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
