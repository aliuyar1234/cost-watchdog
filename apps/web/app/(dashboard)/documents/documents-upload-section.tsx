import type { DropzoneInputProps, DropzoneRootProps } from 'react-dropzone';
import { Card, CardContent } from '../../components/ui/card';

interface DocumentsUploadSectionProps {
  getRootProps: <T extends DropzoneRootProps>(props?: T) => T;
  getInputProps: <T extends DropzoneInputProps>(props?: T) => T;
  isDragActive: boolean;
  isUploading: boolean;
  uploadError: string;
  uploadSuccess: string;
  error: string | null;
}

export function DocumentsUploadSection({
  getRootProps,
  getInputProps,
  isDragActive,
  isUploading,
  uploadError,
  uploadSuccess,
  error,
}: DocumentsUploadSectionProps) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="pt-6">
        <div
          {...getRootProps({
            role: 'button',
            tabIndex: 0,
            'aria-label': 'Dokumente hochladen',
          })}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition ${
            isDragActive
              ? 'border-slate-500 bg-slate-50/85'
              : 'border-slate-300/90 bg-white/60 hover:border-slate-400'
          } ${isUploading ? 'pointer-events-none opacity-50' : ''}`}
        >
          <input {...getInputProps({ 'aria-label': 'Dokument auswaehlen' })} />
          {isUploading ? (
            <div className="flex flex-col items-center">
              <div className="mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-slate-900" />
              <p className="text-slate-600">Dokumente werden hochgeladen...</p>
            </div>
          ) : (
            <>
              <svg
                className="mx-auto h-12 w-12 text-slate-400"
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
              <p className="mt-4 text-lg font-medium text-slate-900">
                {isDragActive ? 'Dateien hier ablegen' : 'Dateien hierher ziehen'}
              </p>
              <p className="mt-2 text-sm text-slate-500">oder klicken zum Auswaehlen</p>
              <p className="mt-1 text-xs text-slate-400">
                CSV als Standard-Ingest, PDF nur via LLM (max. 10MB)
              </p>
            </>
          )}
        </div>

        {uploadError && (
          <div className="mt-4 whitespace-pre-line rounded-xl border border-rose-200 bg-rose-50/90 p-3 text-sm text-rose-700">
            {uploadError}
          </div>
        )}

        {uploadSuccess && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/90 p-3 text-sm text-emerald-700">
            {uploadSuccess}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/90 p-3 text-sm text-rose-700">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
