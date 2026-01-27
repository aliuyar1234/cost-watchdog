import http from 'k6/http';
import { check, sleep } from 'k6';

const API_URL = __ENV.API_URL || 'http://localhost:3001/api/v1';
const ACCESS_TOKEN = __ENV.ACCESS_TOKEN;

export const options = {
  vus: 2,
  duration: '30s',
};

function getAuthParams() {
  return ACCESS_TOKEN ? { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } } : { headers: {} };
}

export default function () {
  const params = getAuthParams();

  const runId = `${__VU}-${__ITER}-${Date.now()}`;
  const csv = `index,value\n${runId},42\n`;

  const formData = {
    file: http.file(csv, `loadtest-${runId}.csv`, 'text/csv'),
  };

  const upload = http.post(`${API_URL}/documents/upload`, formData, params);
  check(upload, { 'POST /documents/upload 201': (r) => r.status === 201 });
  check(upload, { 'POST /documents/upload not 5xx': (r) => r.status < 500 });

  sleep(1);
}
