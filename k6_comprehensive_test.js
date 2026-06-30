import http from 'k6/http';
import { check, sleep, group } from 'k6';

// Configure k6 for 50 concurrent Virtual Users (VUs) running for 30s
export const options = {
  vus: 50,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<800'], // 95% of requests should be resolved in < 800ms
  },
};

const BASE_URL = 'http://localhost:7000';

export default function () {
  // --- GROUP 1: SECURITY & RESILIENCE TESTS ---
  group('Security Attacks & Vulnerability Checks', function () {
    // 1. SQL Injection attempt in authentication
    const sqlInjectionPayload = JSON.stringify({
      email: "' OR 1=1 --",
      password: "arbitrary_password' OR '1'='1",
    });
    
    const sqliRes = http.post(`${BASE_URL}/api/auth/login`, sqlInjectionPayload, {
      headers: { 'Content-Type': 'application/json' },
    });
    
    // We expect the server to reject SQL Injection attempts with 401 (Unauthorized) or 400 (Bad Request),
    // and NEVER crash with a 500 (Internal Server Error)
    check(sqliRes, {
      'SQL Injection rejected (401/400)': (r) => r.status === 401 || r.status === 400,
      'SQL Injection does not cause server crash (no 500)': (r) => r.status !== 500,
    });

    // 2. Unauthorized Access attempt (no session cookie)
    const unauthorizedRes = http.get(`${BASE_URL}/api/subcontract`);
    check(unauthorizedRes, {
      'Access blocked without credentials (401)': (r) => r.status === 401,
    });

    // 3. Malformed/Hijacked Token attempt
    const malformedParams = {
      headers: {
        'Cookie': 'token=invalid_header.malformed_payload.signature_here',
      },
    };
    const malformedRes = http.get(`${BASE_URL}/api/subcontract`, malformedParams);
    check(malformedRes, {
      'Access blocked with malformed token (401/403)': (r) => r.status === 401 || r.status === 403,
    });
  });

  // --- GROUP 2: NORMAL USER FLOW (50 CONCURRENT USERS) ---
  group('Standard User Functions Simulation', function () {
    // 1. Authenticate VU (k6 automatically cookies-jars the response token)
    const loginPayload = JSON.stringify({
      email: 'guest@local',
      password: 'guest2024',
    });

    const loginRes = http.post(`${BASE_URL}/api/auth/login`, loginPayload, {
      headers: { 'Content-Type': 'application/json' },
    });

    check(loginRes, {
      'user login success (200)': (r) => r.status === 200,
    });

    if (loginRes.status === 200) {
      // 2. Access Models list
      const modelsRes = http.get(`${BASE_URL}/api/models`);
      check(modelsRes, {
        'fetch models list (200)': (r) => r.status === 200,
      });

      // 3. Access Subcontract orders list
      const subcontractRes = http.get(`${BASE_URL}/api/subcontract`);
      check(subcontractRes, {
        'fetch subcontract list (200)': (r) => r.status === 200,
      });

      // 4. Access Sales Invoices
      const invoicesRes = http.get(`${BASE_URL}/api/facturation/factures?type=VENTE`);
      check(invoicesRes, {
        'fetch invoices list (200)': (r) => r.status === 200,
      });
    }
  });

  // Sleep 1 second between loop iterations to simulate user think time
  sleep(1);
}
