'use client';

import { useCallback, useEffect, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { documentsApi, ApiError } from '../../lib/api';
import type { DocumentsPaginationState, DocumentsQuery, ManagedDocument } from './types';

const PAGE_LIMIT = 25;
const MAX_CONCURRENT_UPLOADS = 3;
const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

const CSV_EXPORT_GUIDE = [
  'XLS/XLSX wird nicht direkt verarbeitet.',
  'So exportierst du korrekt nach CSV:',
  '1. Datei in Excel oder Google Sheets oeffnen',
  '2. Datei > Speichern unter / Herunterladen',
  '3. Format: CSV UTF-8 (.csv)',
  '4. CSV erneut hochladen',
].join('\n');

function isLegacySpreadsheet(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  return (
    lowerName.endsWith('.xlsx') ||
    lowerName.endsWith('.xls') ||
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.type === 'application/vnd.ms-excel'
  );
}

function formatDropzoneRejection(rejections: FileRejection[]): string {
  const first = rejections[0];
  if (!first) {
    return 'Upload fehlgeschlagen. Bitte versuchen Sie es erneut.';
  }

  const hasTypeError = first.errors.some((error) => error.code === 'file-invalid-type');
  const hasSizeError = first.errors.some((error) => error.code === 'file-too-large');

  if (hasSizeError) {
    return `"${first.file.name}" ist zu gross. Maximal erlaubt sind ${Math.floor(MAX_UPLOAD_SIZE_BYTES / 1024 / 1024)}MB.`;
  }

  if (hasTypeError && isLegacySpreadsheet(first.file)) {
    return CSV_EXPORT_GUIDE;
  }

  if (hasTypeError) {
    return 'Dateityp nicht unterstützt. Erlaubt sind CSV (primär) und PDF via LLM.';
  }

  const fallback = first.errors[0]?.message;
  return fallback || 'Upload fehlgeschlagen. Bitte versuchen Sie es erneut.';
}

function normalizeUploadApiErrorMessage(message: string): string {
  if (message.includes('Supported ingest types')) {
    return `${message}\n\n${CSV_EXPORT_GUIDE}`;
  }

  return message;
}

interface UseDocumentsResult {
  documents: ManagedDocument[];
  isLoading: boolean;
  isLoadingMore: boolean;
  isUploading: boolean;
  uploadError: string;
  uploadSuccess: string;
  error: string | null;
  docToDelete: ManagedDocument | null;
  isDeleting: boolean;
  pagination: DocumentsPaginationState;
  setDocToDelete: (value: ManagedDocument | null) => void;
  getRootProps: ReturnType<typeof useDropzone>['getRootProps'];
  getInputProps: ReturnType<typeof useDropzone>['getInputProps'];
  isDragActive: boolean;
  handleDownload: (doc: ManagedDocument) => Promise<void>;
  handleRetry: (doc: ManagedDocument) => Promise<void>;
  handleLoadMore: () => Promise<void>;
  confirmDelete: () => Promise<void>;
}

export function useDocuments(): UseDocumentsResult {
  const [documents, setDocuments] = useState<ManagedDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [docToDelete, setDocToDelete] = useState<ManagedDocument | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pagination, setPagination] = useState<DocumentsPaginationState>({
    total: 0,
    limit: PAGE_LIMIT,
    offset: 0,
    hasMore: false,
  });

  const fetchDocuments = useCallback(async (params?: DocumentsQuery) => {
    const offset = params?.offset ?? 0;
    const append = params?.append ?? false;

    try {
      setError(null);
      const response = await documentsApi.list({ limit: PAGE_LIMIT, offset });
      const hasMore = response.pagination.offset + response.data.length < response.pagination.total;
      setPagination({ ...response.pagination, hasMore });
      setDocuments((prev) => (append ? [...prev, ...response.data] : response.data));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Dokumente konnten nicht geladen werden.',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDocuments();
  }, [fetchDocuments]);

  const uploadFilesConcurrently = useCallback(async (files: File[]) => {
    const workerCount = Math.min(MAX_CONCURRENT_UPLOADS, files.length);
    const errors: unknown[] = [];
    let nextIndex = 0;

    const workers = Array.from({ length: workerCount }, async () => {
      while (nextIndex < files.length) {
        const file = files[nextIndex];
        nextIndex += 1;

        if (!file) {
          continue;
        }

        try {
          await documentsApi.upload(file);
        } catch (uploadFailure) {
          errors.push(uploadFailure);
        }
      }
    });

    await Promise.all(workers);

    if (errors.length > 0) {
      throw errors[0];
    }
  }, []);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) {
        return;
      }

      setIsUploading(true);
      setUploadError('');
      setUploadSuccess('');

      try {
        await uploadFilesConcurrently(acceptedFiles);
        setUploadSuccess(`${acceptedFiles.length} Dokument(e) erfolgreich hochgeladen`);
        await fetchDocuments();
      } catch (dropError) {
        if (dropError instanceof ApiError) {
          setUploadError(normalizeUploadApiErrorMessage(dropError.message));
        } else {
          setUploadError('Upload fehlgeschlagen. Bitte versuchen Sie es erneut.');
        }
      } finally {
        setIsUploading(false);
      }
    },
    [fetchDocuments, uploadFilesConcurrently],
  );

  const onDropRejected = useCallback((fileRejections: FileRejection[]) => {
    setUploadSuccess('');
    setUploadError(formatDropzoneRejection(fileRejections));
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected,
    accept: {
      'application/pdf': ['.pdf'],
      'text/csv': ['.csv'],
    },
    maxSize: MAX_UPLOAD_SIZE_BYTES,
  });

  const handleDownload = async (doc: ManagedDocument) => {
    try {
      setError(null);
      const { downloadUrl } = await documentsApi.getDownloadUrl(doc.id);
      const opened = window.open(downloadUrl, '_blank', 'noopener,noreferrer');
      if (!opened) {
        window.location.assign(downloadUrl);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Download fehlgeschlagen.');
    }
  };

  const confirmDelete = async () => {
    if (!docToDelete) {
      return;
    }

    try {
      setIsDeleting(true);
      setError(null);
      await documentsApi.delete(docToDelete.id);
      setDocToDelete(null);
      await fetchDocuments();
    } catch (requestError) {
      if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError('Loeschen fehlgeschlagen.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRetry = async (doc: ManagedDocument) => {
    try {
      setError(null);
      await documentsApi.retryExtraction(doc.id);
      await fetchDocuments();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Erneuter Versuch fehlgeschlagen.',
      );
    }
  };

  const handleLoadMore = async () => {
    if (isLoadingMore || !pagination.hasMore) {
      return;
    }
    try {
      setIsLoadingMore(true);
      const nextOffset = pagination.offset + pagination.limit;
      await fetchDocuments({ offset: nextOffset, append: true });
    } finally {
      setIsLoadingMore(false);
    }
  };

  return {
    documents,
    isLoading,
    isLoadingMore,
    isUploading,
    uploadError,
    uploadSuccess,
    error,
    docToDelete,
    isDeleting,
    pagination,
    setDocToDelete,
    getRootProps,
    getInputProps,
    isDragActive,
    handleDownload,
    handleRetry,
    handleLoadMore,
    confirmDelete,
  };
}
