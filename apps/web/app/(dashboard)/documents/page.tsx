'use client';

import { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { documentsApi, type Document, ApiError } from '../../lib/api';
import { formatDate, formatFileSize, getExtractionStatusBadge } from '../../lib/formatting';

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');

  const fetchDocuments = async () => {
    try {
      const response = await documentsApi.list({ limit: 100 });
      setDocuments(response.data);
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
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
      const { downloadUrl } = await documentsApi.getDownloadUrl(doc.id);
      window.open(downloadUrl, '_blank');
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const handleDelete = async (doc: Document) => {
    if (!confirm(`Möchten Sie "${doc.originalFilename}" wirklich löschen?`)) return;

    try {
      await documentsApi.delete(doc.id);
      await fetchDocuments();
    } catch (error) {
      if (error instanceof ApiError) {
        alert(error.message);
      }
    }
  };

  const handleRetry = async (doc: Document) => {
    try {
      await documentsApi.retryExtraction(doc.id);
      await fetchDocuments();
    } catch (error) {
      console.error('Retry failed:', error);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dokumente</h1>
        <p className="text-gray-500 mt-1">Rechnungen und Abrechnungen hochladen und verwalten</p>
      </div>

      {/* Upload Zone */}
      <Card>
        <CardContent className="pt-6">
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors
              ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
              ${isUploading ? 'pointer-events-none opacity-50' : ''}
            `}
          >
            <input {...getInputProps()} />
            {isUploading ? (
              <div className="flex flex-col items-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4" />
                <p className="text-gray-600">Dokumente werden hochgeladen...</p>
              </div>
            ) : (
              <>
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="mt-4 text-lg font-medium text-gray-900">
                  {isDragActive ? 'Dateien hier ablegen' : 'Dateien hierher ziehen'}
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  oder klicken zum Auswählen
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  PDF, Excel, CSV (max. 10MB)
                </p>
              </>
            )}
          </div>

          {uploadError && (
            <div className="mt-4 p-3 rounded-md bg-red-50 text-red-700 text-sm">
              {uploadError}
            </div>
          )}

          {uploadSuccess && (
            <div className="mt-4 p-3 rounded-md bg-green-50 text-green-700 text-sm">
              {uploadSuccess}
            </div>
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
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">Keine Dokumente</h3>
              <p className="mt-1 text-sm text-gray-500">Laden Sie Ihr erstes Dokument hoch.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dateiname</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Typ</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Größe</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hochgeladen</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Aktionen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {documents.map((doc) => (
                    <tr key={doc.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <div className="flex items-center">
                          <svg className="h-5 w-5 text-gray-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                          <span className="text-sm text-gray-900 truncate max-w-xs" title={doc.originalFilename}>
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
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </Button>
                          {(doc.extractionStatus === 'failed' || doc.extractionStatus === 'manual') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRetry(doc)}
                              title="Erneut verarbeiten"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(doc)}
                            title="Löschen"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
