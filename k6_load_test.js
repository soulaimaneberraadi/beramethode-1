import http from 'k6/http';
import { check, sleep } from 'k6';

// k6 Options: 10 concurrent Virtual Users running for 20 seconds
export const options = {
  vus: 10,
  duration: '20s',
  thresholds: {
    http_req_failed: ['rate<0.01'], // Fail test if more than 1% of requests fail
    http_req_duration: ['p(95)<400'], // 95% of requests must respond in < 400ms
  },
};

// The default function represents the VU loop
export default function () {
  const BASE_URL = 'http://localhost:7000';

  // 1. Authenticate virtual user (cookies are managed automatically by k6 per VU)
  const loginPayload = JSON.stringify({
    email: 'guest@local',
    password: 'guest2024',
  });

  const loginParams = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const loginRes = http.post(`${BASE_URL}/api/auth/login`, loginPayload, loginParams);
  
  check(loginRes, {
    'login success (200)': (r) => r.status === 200,
  });

  // Proceed only if login succeeded
  if (loginRes.status === 200) {
    // 2. Fetch Models
    const modelsRes = http.get(`${BASE_URL}/api/models`);
    check(modelsRes, {
      'get models status is 200': (r) => r.status === 200,
    });

    // 3. Fetch Subcontracting Orders
    const subcontractRes = http.get(`${BASE_URL}/api/subcontract`);
    check(subcontractRes, {
      'get subcontract status is 200': (r) => r.status === 200,
    });

    // 4. Fetch Invoices (Sales)
    const invoicesRes = http.get(`${BASE_URL}/api/facturation/factures?type=VENTE`);
    check(invoicesRes, {
      'get invoices status is 200': (r) => r.status === 200,
    });
  }

  // Sleep 1 second before the next iteration to simulate user typing/thinking
  sleep(1);
}
