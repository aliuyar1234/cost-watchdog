import http from 'k6/http';
import { check, sleep } from 'k6';

const API_URL = __ENV.API_URL || 'http://localhost:3001/api/v1';
const ACCESS_TOKEN = __ENV.ACCESS_TOKEN;

export const options = {
  vus: 10,
  duration: '30s',
};

export default function () {
  const params = ACCESS_TOKEN
    ? { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
    : { headers: {} };

  const list = http.get(`${API_URL}/anomalies?status=new&limit=20`, params);
  check(list, { 'GET /anomalies 200': (r) => r.status === 200 });

  const stats = http.get(`${API_URL}/anomalies/stats`, params);
  check(stats, { 'GET /anomalies/stats 200': (r) => r.status === 200 });

  sleep(1);
}
