import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';

interface ResolveFormProps {
  value: string;
  isProcessing: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ResolveForm({
  value,
  isProcessing,
  onChange,
  onCancel,
  onConfirm,
}: ResolveFormProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <h3 className="mb-3 font-medium text-gray-900">Anomalie loesen</h3>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Beschreiben Sie, wie die Anomalie geloest wurde..."
          className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          rows={3}
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            Abbrechen
          </Button>
          <Button onClick={onConfirm} disabled={isProcessing}>
            Loesen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
