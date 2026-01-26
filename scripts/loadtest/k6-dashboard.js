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

  const dashboard = http.get(`${API_URL}/analytics/dashboard`, params);
  check(dashboard, { 'GET /analytics/dashboard 200': (r) => r.status === 200 });

  const trends = http.get(`${API_URL}/analytics/trends?months=12`, params);
  check(trends, { 'GET /analytics/trends 200': (r) => r.status === 200 });

  const byCostType = http.get(`${API_URL}/analytics/by-cost-type?limit=8`, params);
  check(byCostType, { 'GET /analytics/by-cost-type 200': (r) => r.status === 200 });

  sleep(1);
}
