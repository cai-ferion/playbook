# Playbook Load Testing

## Overview

This directory contains the k6 load testing script for validating Playbook's performance under production-like conditions. The test simulates 250 concurrent users performing a realistic mix of BPO operations.

## Prerequisites

1. **Install k6** (one-time):
   ```bash
   # macOS
   brew install k6

   # Ubuntu/Debian
   sudo gpg -k
   sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
   echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
   sudo apt-get update && sudo apt-get install k6

   # Windows
   choco install k6
   ```

2. **Get a valid session cookie**:
   - Log into Playbook at `https://play-book.manus.space/api/site`
   - Open browser DevTools → Application → Cookies
   - Copy the `app_session_id` value

## Running the Test

### Full Load Test (250 VUs, ~19 minutes)

```bash
k6 run \
  --env K6_BASE_URL=https://play-book.manus.space \
  --env K6_SESSION_COOKIE=<your-session-cookie> \
  load-test/k6-playbook.js
```

### Quick Smoke Test (10 VUs, 1 minute)

```bash
k6 run \
  --env K6_BASE_URL=https://play-book.manus.space \
  --env K6_SESSION_COOKIE=<your-session-cookie> \
  --vus 10 --duration 1m \
  load-test/k6-playbook.js
```

### Stress Test (500 VUs — double capacity)

```bash
k6 run \
  --env K6_BASE_URL=https://play-book.manus.space \
  --env K6_SESSION_COOKIE=<your-session-cookie> \
  --stage "2m:500,5m:500,1m:0" \
  load-test/k6-playbook.js
```

## Performance Targets (SLOs)

| Metric | Target | Rationale |
|--------|--------|-----------|
| p95 response time (reads) | < 500ms | Users perceive >500ms as "slow" |
| p95 response time (writes) | < 1000ms | Writes involve DB transactions |
| Error rate | < 1% | Near-zero tolerance for BPO operations |
| 5xx errors | 0 | Server errors are unacceptable |
| Slow requests (>500ms) | < 50 total | Identifies degradation hotspots |

## Test Scenarios

The script simulates realistic user behavior with weighted scenarios:

| Scenario | Weight | Description |
|----------|--------|-------------|
| Dashboard Load | 30% | Parallel fetch of employees, attendance, notifications |
| Employee Roster | 20% | Browse employee list, click into details |
| Attendance Ops | 15% | Load attendance data, check available months |
| Coaching/Performance | 10% | Read coaching entries and insights |
| Task Management | 10% | View task lists and personal tasks |
| Notifications | 7% | Check notification feed |
| Write Operations | 5% | Post coaching entries |
| Heavy Operations | 3% | Export attendance data |

## Output

Results are saved to `load-test/results/report-<timestamp>.json` and printed to stdout in a formatted summary table.

## When to Run

- **After every deploy** — quick smoke test (10 VUs, 1 min)
- **Before major releases** — full load test (250 VUs, 19 min)
- **After schema changes** — verify no query regressions
- **Monthly** — baseline performance tracking

## Interpreting Results

### Pass Criteria
All thresholds must pass (shown as ✅ in the summary). If any threshold fails (❌), investigate:

1. **High p95 latency** → Check slow query logs, add indexes
2. **5xx errors** → Check server logs for unhandled exceptions
3. **High error rate** → Check if rate limiter is triggering (increase limits for load test IP)

### Common Issues

- **Rate limiting**: The test may trigger rate limits. Either whitelist the test IP or temporarily increase limits during testing.
- **Session expiry**: If the test runs longer than 30 minutes, the session cookie may expire. Use a fresh cookie.
- **Cold start**: First run after deploy may show higher latencies due to JIT compilation and cache warming.
