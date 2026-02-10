import { LinkButton } from '../../components/ui/link-button';

export function DashboardHeader() {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="page-heading">Dashboard</h1>
        <p className="page-subheading">Uebersicht Ihrer Kostenueberwachung</p>
      </div>
      <LinkButton href="/documents">Dokument hochladen</LinkButton>
    </div>
  );
}
