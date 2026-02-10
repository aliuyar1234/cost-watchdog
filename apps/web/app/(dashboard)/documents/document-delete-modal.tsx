import { Button } from '../../components/ui/button';
import { Modal } from '../../components/ui/modal';
import type { ManagedDocument } from './types';

interface DocumentDeleteModalProps {
  document: ManagedDocument;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

export function DocumentDeleteModal({
  document,
  isDeleting,
  onCancel,
  onConfirm,
}: DocumentDeleteModalProps) {
  return (
    <Modal title="Dokument loeschen" onClose={onCancel}>
      <p className="text-gray-700">
        Moechten Sie &quot;{document.originalFilename}&quot; wirklich loeschen?
      </p>
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="outline" onClick={onCancel} disabled={isDeleting}>
          Abbrechen
        </Button>
        <Button variant="destructive" onClick={() => void onConfirm()} disabled={isDeleting}>
          {isDeleting ? 'Loeschen...' : 'Loeschen'}
        </Button>
      </div>
    </Modal>
  );
}
