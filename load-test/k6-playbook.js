/**
 * Playbook Load Test — k6 Script
 * Phase 7.4: Post-Deploy Performance Validation
 *
 * Target: 250 concurrent virtual users (VUs) simulating a full shift of BPO operations
 * Duration: 5-minute ramp-up → 10-minute sustained load → 2-minute ramp-down
 *
 * Prerequisites:
 * 1. Install k6: https://k6.io/docs/getting-started/installation/
 * 2. Set environment variables:
 *    - K6_BASE_URL: The deployed Playbook URL (e.g., https://play-book.manus.space)
 *    - K6_SESSION_COOKIE: A valid app_session_id cookie value (login first, copy from browser)
 * 3. Run: k6 run --env K6_BASE_URL=https://play-book.manus.space --env K6_SESSION_COOKIE=<cookie> load-test/k6-playbook.js
 *
 * Performance Targets (SLOs):
 * - p95 response time < 500ms for read operations
 * - p95 response time < 1000ms for write operations
 * - Error rate < 1% (excluding expected 4xx)
 * - Zero 5xx errors under normal load
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ── Custom Metrics ──
const errorRate = new Rate('errors');
const readLatency = new Trend('read_latency', true);
const writeLatency = new Trend('write_latency', true);
const sseConnectTime = new Trend('sse_connect_time', true);
const apiErrors = new Counter('api_errors');
const slowRequests = new Counter('slow_requests');

// ── Configuration ──
const BASE_URL = __ENV.K6_BASE_URL || 'https://play-book.manus.space';
const SESSION_COOKIE = __ENV.K6_SESSION_COOKIE || '';

// Performance thresholds (SLOs)
export const options = {
  scenarios: {
    // Scenario 1: Ramp to 250 VUs over 5 min, sustain for 10 min, ramp down over 2 min
    sustained_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m', target: 250 },   // Ramp up
        { duration: '10m', target: 250 },  // Sustained peak
        { duration: '2m', target: 0 },     // Ramp down
      ],
      gracefulRampDown: '30s',
    },
    // Scenario 2: Spike test — sudden burst of 100 users
    spike_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 100 },  // Sudden spike
        { duration: '1m', target: 100 },   // Hold spike
        { duration: '30s', target: 0 },    // Drop
      ],
      startTime: '17m', // Start after sustained load completes
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    // Global thresholds
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],       // Less than 1% failure rate
    errors: ['rate<0.01'],

    // Custom metric thresholds
    read_latency: ['p(95)<500'],           // Reads under 500ms at p95
    write_latency: ['p(95)<1000'],         // Writes under 1000ms at p95
    slow_requests: ['count<50'],           // Fewer than 50 slow requests total
  },
};

// ── Helpers ──

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Cookie': `app_session_id=${SESSION_COOKIE}`,
  };
}

function checkResponse(res, name, isWrite = false) {
  const success = check(res, {
    [`${name}: status 2xx`]: (r) => r.status >= 200 && r.status < 300,
    [`${name}: response time < 1s`]: (r) => r.timings.duration < 1000,
  });

  if (!success) {
    errorRate.add(1);
    if (res.status >= 500) {
      apiErrors.add(1);
    }
  } else {
    errorRate.add(0);
  }

  // Track latency by operation type
  if (isWrite) {
    writeLatency.add(res.timings.duration);
  } else {
    readLatency.add(res.timings.duration);
  }

  // Track slow requests
  if (res.timings.duration > 500) {
    slowRequests.add(1);
  }

  return success;
}

// ── Test Scenarios ──

export default function () {
  const headers = getHeaders();

  // Simulate realistic user behavior: each VU performs a mix of operations
  // weighted by frequency (reads are 80% of traffic, writes 20%)
  const scenario = Math.random();

  if (scenario < 0.30) {
    // 30% — Dashboard load (most common: attendance + employees)
    dashboardLoad(headers);
  } else if (scenario < 0.50) {
    // 20% — Employee roster browsing
    employeeRoster(headers);
  } else if (scenario < 0.65) {
    // 15% — Attendance operations
    attendanceOps(headers);
  } else if (scenario < 0.75) {
    // 10% — Coaching/performance reads
    coachingReads(headers);
  } else if (scenario < 0.85) {
    // 10% — Task management
    taskManagement(headers);
  } else if (scenario < 0.92) {
    // 7% — Notifications
    notificationOps(headers);
  } else if (scenario < 0.97) {
    // 5% — Write operations (attendance updates, coaching entries)
    writeOperations(headers);
  } else {
    // 3% — Heavy operations (bulk imports, exports)
    heavyOperations(headers);
  }

  // Think time: simulate human reading/thinking between actions (1-5 seconds)
  sleep(Math.random() * 4 + 1);
}

// ── Scenario Functions ──

function dashboardLoad(headers) {
  group('Dashboard Load', () => {
    // Parallel requests that happen on dashboard open
    const responses = http.batch([
      ['GET', `${BASE_URL}/api/io/employees/slim`, null, { headers, tags: { name: 'GET /employees/slim' } }],
      ['GET', `${BASE_URL}/api/io/attendance?date=${todayStr()}`, null, { headers, tags: { name: 'GET /attendance' } }],
      ['GET', `${BASE_URL}/api/io/notifications`, null, { headers, tags: { name: 'GET /notifications' } }],
    ]);

    responses.forEach((res, i) => {
      const names = ['employees/slim', 'attendance', 'notifications'];
      checkResponse(res, `Dashboard: ${names[i]}`);
    });
  });
}

function employeeRoster(headers) {
  group('Employee Roster', () => {
    const res = http.get(`${BASE_URL}/api/io/employees`, { headers, tags: { name: 'GET /employees' } });
    checkResponse(res, 'Employee list');

    // Simulate clicking into a specific employee
    if (res.status === 200) {
      sleep(0.5);
      // Get attendance for a specific employee (simulated OHR)
      const attRes = http.get(`${BASE_URL}/api/io/attendance?date=${todayStr()}`, {
        headers,
        tags: { name: 'GET /attendance (filtered)' },
      });
      checkResponse(attRes, 'Employee attendance');
    }
  });
}

function attendanceOps(headers) {
  group('Attendance Operations', () => {
    // Load attendance for today
    const res = http.get(`${BASE_URL}/api/io/attendance?date=${todayStr()}`, {
      headers,
      tags: { name: 'GET /attendance' },
    });
    checkResponse(res, 'Attendance load');

    // Check available months
    sleep(0.3);
    const monthsRes = http.get(`${BASE_URL}/api/io/attendance/available-months`, {
      headers,
      tags: { name: 'GET /attendance/available-months' },
    });
    checkResponse(monthsRes, 'Available months');
  });
}

function coachingReads(headers) {
  group('Coaching & Performance', () => {
    const res = http.get(`${BASE_URL}/api/io/coaching`, {
      headers,
      tags: { name: 'GET /coaching' },
    });
    checkResponse(res, 'Coaching list');

    sleep(0.5);
    const insightsRes = http.get(`${BASE_URL}/api/io/insights`, {
      headers,
      tags: { name: 'GET /insights' },
    });
    checkResponse(insightsRes, 'Insights');
  });
}

function taskManagement(headers) {
  group('Task Management', () => {
    const res = http.get(`${BASE_URL}/api/io/tasks`, {
      headers,
      tags: { name: 'GET /tasks' },
    });
    checkResponse(res, 'Task list');

    sleep(0.3);
    const myTasks = http.get(`${BASE_URL}/api/io/tasks/my-tasks`, {
      headers,
      tags: { name: 'GET /tasks/my-tasks' },
    });
    checkResponse(myTasks, 'My tasks');
  });
}

function notificationOps(headers) {
  group('Notifications', () => {
    const res = http.get(`${BASE_URL}/api/io/notifications`, {
      headers,
      tags: { name: 'GET /notifications' },
    });
    checkResponse(res, 'Notifications');
  });
}

function writeOperations(headers) {
  group('Write Operations', () => {
    // Simulate posting a coaching entry
    const coachingPayload = JSON.stringify({
      employee_ohr: 'LOADTEST001',
      type: 'coaching',
      notes: `Load test coaching entry at ${new Date().toISOString()}`,
      date: todayStr(),
    });

    const res = http.post(`${BASE_URL}/api/io/coaching`, coachingPayload, {
      headers,
      tags: { name: 'POST /coaching' },
    });
    // Accept 2xx or 4xx (validation errors are expected for fake data)
    const success = check(res, {
      'Write: status not 5xx': (r) => r.status < 500,
      'Write: response time < 1s': (r) => r.timings.duration < 1000,
    });

    writeLatency.add(res.timings.duration);
    if (res.status >= 500) {
      apiErrors.add(1);
      errorRate.add(1);
    } else {
      errorRate.add(0);
    }
  });
}

function heavyOperations(headers) {
  group('Heavy Operations', () => {
    // Simulate export request
    const res = http.get(`${BASE_URL}/api/io/attendance/export?date=${todayStr()}`, {
      headers,
      tags: { name: 'GET /attendance/export' },
    });

    // Heavy ops have relaxed timing (up to 3s acceptable)
    const success = check(res, {
      'Heavy: status not 5xx': (r) => r.status < 500,
      'Heavy: response time < 3s': (r) => r.timings.duration < 3000,
    });

    writeLatency.add(res.timings.duration);
    if (res.status >= 500) {
      apiErrors.add(1);
      errorRate.add(1);
    } else {
      errorRate.add(0);
    }
  });
}

// ── Utilities ──

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Lifecycle Hooks ──

export function handleSummary(data) {
  // Generate a human-readable summary report
  const now = new Date().toISOString().replace(/[:.]/g, '-');
  return {
    'stdout': textSummary(data),
    [`load-test/results/report-${now}.json`]: JSON.stringify(data, null, 2),
  };
}

function textSummary(data) {
  const metrics = data.metrics;
  const duration = metrics.http_req_duration;
  const failed = metrics.http_req_failed;

  let report = `
╔══════════════════════════════════════════════════════════════╗
║          PLAYBOOK LOAD TEST RESULTS                         ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Target: 250 concurrent users                                ║
║  Duration: ${Math.round((data.state?.testRunDurationMs || 0) / 1000)}s                                            ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║  RESPONSE TIMES                                              ║
║  ─────────────────────────────────────────────               ║
║  p50:  ${duration?.values?.['p(50)']?.toFixed(1) || 'N/A'}ms                                          ║
║  p95:  ${duration?.values?.['p(95)']?.toFixed(1) || 'N/A'}ms  (target: <500ms)                   ║
║  p99:  ${duration?.values?.['p(99)']?.toFixed(1) || 'N/A'}ms  (target: <1000ms)                  ║
║  max:  ${duration?.values?.max?.toFixed(1) || 'N/A'}ms                                          ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║  ERROR RATE                                                  ║
║  ─────────────────────────────────────────────               ║
║  HTTP failures: ${((failed?.values?.rate || 0) * 100).toFixed(2)}%  (target: <1%)                  ║
║  5xx errors:    ${metrics.api_errors?.values?.count || 0}                                          ║
║  Slow requests: ${metrics.slow_requests?.values?.count || 0}  (>500ms)                          ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║  THROUGHPUT                                                  ║
║  ─────────────────────────────────────────────               ║
║  Total requests: ${metrics.http_reqs?.values?.count || 0}                                     ║
║  Requests/sec:   ${metrics.http_reqs?.values?.rate?.toFixed(1) || 'N/A'}                                       ║
║  VUs peak:       ${metrics.vus_max?.values?.value || 0}                                          ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║  CUSTOM METRICS                                              ║
║  ─────────────────────────────────────────────               ║
║  Read latency p95:  ${metrics.read_latency?.values?.['p(95)']?.toFixed(1) || 'N/A'}ms                              ║
║  Write latency p95: ${metrics.write_latency?.values?.['p(95)']?.toFixed(1) || 'N/A'}ms                              ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║  THRESHOLDS                                                  ║
║  ─────────────────────────────────────────────               ║
`;

  if (data.thresholds) {
    for (const [name, result] of Object.entries(data.thresholds)) {
      const status = result.ok ? '✅ PASS' : '❌ FAIL';
      report += `║  ${status}  ${name.padEnd(40)}    ║\n`;
    }
  }

  report += `║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`;
  return report;
}
