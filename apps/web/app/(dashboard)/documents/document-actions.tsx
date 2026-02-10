import type { ReactNode } from 'react';
import { Button } from '../../components/ui/button';
import type { ManagedDocument } from './types';

interface DocumentActionsProps {
  doc: ManagedDocument;
  onDownload: (doc: ManagedDocument) => Promise<void>;
  onRetry: (doc: ManagedDocument) => Promise<void>;
  onDelete: (doc: ManagedDocument) => void;
}

interface ActionButtonProps {
  title: string;
  ariaLabel: string;
  className?: string;
  onClick: () => void;
  children: ReactNode;
}

function ActionButton({ title, ariaLabel, className, onClick, children }: ActionButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      className={className}
    >
      {children}
    </Button>
  );
}

export function DocumentActions({ doc, onDownload, onRetry, onDelete }: DocumentActionsProps) {
  return (
    <div className="flex items-center justify-end gap-2">
      <ActionButton
        title="Herunterladen"
        ariaLabel="Herunterladen"
        onClick={() => void onDownload(doc)}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
      </ActionButton>

      {(doc.extractionStatus === 'failed' || doc.extractionStatus === 'manual') && (
        <ActionButton
          title="Erneut verarbeiten"
          ariaLabel="Erneut verarbeiten"
          onClick={() => void onRetry(doc)}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </ActionButton>
      )}

      <ActionButton
        title="Loeschen"
        ariaLabel="Loeschen"
        className="text-red-600 hover:bg-red-50 hover:text-red-700"
        onClick={() => onDelete(doc)}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      </ActionButton>
    </div>
  );
}
