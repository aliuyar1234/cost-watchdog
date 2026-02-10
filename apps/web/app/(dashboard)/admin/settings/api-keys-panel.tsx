export function ApiKeysPanel() {
  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <h2 className="mb-6 text-lg font-semibold">API-Schluessel</h2>
      <p className="mb-6 text-gray-600">
        Erstellen Sie API-Schluessel fuer externe Integrationen und automatisierte Datenimporte.
      </p>

      <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
        <p className="text-sm text-blue-700">
          API-Schluessel koennen unter <strong>Benutzerverwaltung &gt; API-Schluessel</strong>{' '}
          verwaltet werden. Dort koennen Sie neue Schluessel erstellen, bestehende anzeigen und
          widerrufen.
        </p>
      </div>

      <a
        href="/admin/api-keys"
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
          />
        </svg>
        API-Schluessel verwalten
      </a>
    </div>
  );
}
