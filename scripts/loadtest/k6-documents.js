import http from 'k6/http';
import { check, sleep } from 'k6';

const API_URL = __ENV.API_URL || 'http://localhost:3001/api/v1';
const ACCESS_TOKEN = __ENV.ACCESS_TOKEN;

export const options = {
  vus: 10,
  duration: '30s',
};

function getAuthParams() {
  return ACCESS_TOKEN ? { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } } : { headers: {} };
}

export default function () {
  const params = getAuthParams();

  const offset = (__ITER % 4) * 25;
  const list = http.get(`${API_URL}/documents?limit=25&offset=${offset}`, params);
  check(list, { 'GET /documents 200': (r) => r.status === 200 });

  if (list.status === 200) {
    try {
      const body = list.json();
      const firstId = body?.data?.[0]?.id;
      if (firstId) {
        const detail = http.get(`${API_URL}/documents/${firstId}`, params);
        check(detail, { 'GET /documents/:id 200': (r) => r.status === 200 });
      }
    } catch {
      // ignore JSON parsing errors
    }
  }

  sleep(1);
}
