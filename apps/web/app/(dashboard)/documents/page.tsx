'use client';

import { useDocuments } from './use-documents';
import { DocumentsUploadSection } from './documents-upload-section';
import { DocumentsTable } from './documents-table';
import { DocumentDeleteModal } from './document-delete-modal';

export default function DocumentsPage() {
  const {
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
  } = useDocuments();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dokumente</h1>
        <p className="mt-1 text-gray-500">Rechnungen und Abrechnungen hochladen und verwalten</p>
      </div>

      <DocumentsUploadSection
        getRootProps={getRootProps}
        getInputProps={getInputProps}
        isDragActive={isDragActive}
        isUploading={isUploading}
        uploadError={uploadError}
        uploadSuccess={uploadSuccess}
        error={error}
      />

      <DocumentsTable
        documents={documents}
        isLoading={isLoading}
        isLoadingMore={isLoadingMore}
        hasMore={pagination.hasMore}
        onDownload={handleDownload}
        onRetry={handleRetry}
        onDelete={(doc) => setDocToDelete(doc)}
        onLoadMore={handleLoadMore}
      />

      {docToDelete && (
        <DocumentDeleteModal
          document={docToDelete}
          isDeleting={isDeleting}
          onCancel={() => {
            if (!isDeleting) {
              setDocToDelete(null);
            }
          }}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
