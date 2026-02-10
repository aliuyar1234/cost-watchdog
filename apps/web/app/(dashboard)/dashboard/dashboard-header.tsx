import { LinkButton } from '../../components/ui/link-button';

export function DashboardHeader() {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-gray-500">Uebersicht Ihrer Kostenueberwachung</p>
      </div>
      <LinkButton href="/documents">Dokument hochladen</LinkButton>
    </div>
  );
}
