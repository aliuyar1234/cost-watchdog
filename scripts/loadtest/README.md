# Load tests (k6)

Prereqs:

- Install `k6` (https://k6.io/docs/get-started/installation/)
- Have the API running and a valid access token

Env vars:

- `API_URL` (default: `http://localhost:3001/api/v1`)
- `ACCESS_TOKEN` (JWT access token)

Examples:

```bash
k6 run scripts/loadtest/k6-dashboard.js
k6 run scripts/loadtest/k6-anomalies.js
k6 run scripts/loadtest/k6-documents.js
k6 run scripts/loadtest/k6-upload.js
```
