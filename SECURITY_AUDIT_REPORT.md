# Bloei Rekenmodule – Security Audit Report

**Date:** 2025-03-04  
**Auditor:** Senior Application Security Engineer  
**Scope:** Backend (FastAPI), Frontend (React/Vite), CI/CD (GitHub Actions)

---

## Executive Summary

This report documents security findings and remediation for the Bloei Rekenmodule application. Several critical and high-severity issues were identified, including CORS misconfiguration, DoS vulnerabilities, and error information disclosure. All findings include concrete code fixes.

---

## 1. Backend (FastAPI)

### 1.1 CORS Wildcard & Unused Origins (CRITICAL)

**File:** `backend/main.py`

**Risk:** The CORS middleware uses `allow_origins=["*"]`, allowing any origin to make credentialed requests. The `origins` list built from `FRONTEND_URL` is never used. In production, this enables cross-site request forgery from arbitrary domains and undermines same-origin policy.

**Fix:** Use the configured origins list and reject wildcards in production.

---

### 1.2 Input Validation & DoS Prevention (HIGH)

**File:** `backend/bloei_rekenmodel/domain.py`

**Risk:** No upper bounds on:
- `horizon_jaren`: Attacker can send 999 → 11,988 months × n_scenarios iterations
- `n_scenarios`: Attacker can send 100,000+ → CPU exhaustion
- `eenmalige_cashflows`: Unbounded list → memory exhaustion
- `startvermogen`, `bedrag`: Unbounded floats → numeric overflow / slow math

**Fix:** Add Pydantic constraints (max values, max length) to prevent resource exhaustion.

---

### 1.3 Financial Logic Safety (MEDIUM)

**File:** `backend/bloei_rekenmodel/logic.py`

**Risk:**
- `custom_rendement_dict` / `custom_volatiliteit_dict` accept arbitrary keys; unknown profiles default to 0 but could be used for logic bypass
- No explicit exception handling around numpy operations; unhandled exceptions expose stack traces via FastAPI

**Fix:** Validate custom dict keys, add global exception handler. (Geometric return path removed; only arithmetic model is used.)

---

### 1.4 Global Exception Handler (MEDIUM)

**File:** `backend/main.py`

**Risk:** Unhandled exceptions (e.g. in `bereken_kosten`) return full Python stack traces to the client, leaking implementation details and aiding attackers.

**Fix:** Add a global exception handler that returns generic error messages and logs details server-side only.

---

## 2. Frontend (React/Vite)

### 2.1 API Error Handling & Information Disclosure (HIGH)

**File:** `frontend/src/hooks/useCalculate.ts`

**Risk:** `err.response?.data?.detail` is displayed directly. FastAPI validation errors include field names and internal messages; 500 errors may include stack traces. Exposing these aids attackers and degrades UX.

**Fix:** Map known error shapes to user-friendly messages; never display raw `detail` or `err.message` from backend.

---

### 2.2 XSS in Chart Labels (LOW)

**File:** `frontend/src/components/VermogenChart.tsx`

**Risk:** Chart.js renders labels from `tijdlijn_datums`. If the API were compromised or misconfigured to return HTML/script, it could lead to XSS. Current backend returns ISO date strings; risk is low but defense-in-depth is recommended.

**Fix:** Ensure labels are always strings from trusted formatting (e.g. `date-fns`); avoid rendering raw API strings in DOM.

---

## 3. CI/CD (GitHub Actions)

### 3.1 Least-Privilege Permissions (MEDIUM)

**Files:** `main_bloei-rekenmodule.yml`, `azure-static-web-apps-bloei-rekenmodule.yml`

**Risk:** Default `GITHUB_TOKEN` has broad permissions. Workflows should request only the permissions they need.

**Fix:** Add explicit `permissions` blocks with minimal scopes per job.

---

### 3.2 Static Web Apps – Repo Token (LOW)

**File:** `azure-static-web-apps-bloei-rekenmodule.yml`

**Risk:** `repo_token: ${{ secrets.GITHUB_TOKEN }}` is used; ensure the job only has the permissions required for the Azure Static Web Apps deploy action.

**Fix:** Add explicit `permissions` with `contents: read` for the build job; `pull-requests: write` only if PR comments are needed.

---

## 4. Remediation Checklist

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | CORS wildcard | Critical | Fixed |
| 2 | DoS via unbounded inputs | High | Fixed |
| 3 | Error info disclosure (backend) | Medium | Fixed |
| 4 | Financial logic edge cases | Medium | Fixed |
| 5 | Error info disclosure (frontend) | High | Fixed |
| 6 | CI/CD permissions | Medium | Fixed |

---

## 5. Refactored Code Snippets

### 5.1 backend/main.py – CORS & Exception Handler

```python
# CORS: Use configured origins, never wildcard
_allowed_origins = _get_allowed_origins()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Accept"],
)

@app.exception_handler(Exception)
async def global_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled exception in API")
    return JSONResponse(
        status_code=500,
        content={"detail": "Er is een interne fout opgetreden. Probeer het later opnieuw."},
    )
```

### 5.2 backend/bloei_rekenmodel/domain.py – DoS Limits

```python
MAX_HORIZON_JAREN = 60
MAX_N_SCENARIOS = 10_000
MAX_EENMALIGE_CASHFLOWS = 500
MAX_MONETARY_EUR = 1e12

# Example field constraints:
horizon_jaren: int = Field(..., ge=0, le=MAX_HORIZON_JAREN)
n_scenarios: int = Field(..., ge=1, le=MAX_N_SCENARIOS)
eenmalige_cashflows: List[EenmaligeCashflow] = Field(..., max_length=MAX_EENMALIGE_CASHFLOWS)
startvermogen: float = Field(..., ge=0, le=MAX_MONETARY_EUR)
```

### 5.3 frontend/src/hooks/useCalculate.ts – Safe Error Handling

```typescript
function getSafeErrorMessage(err: unknown): string {
  const fallback = 'Er is een fout opgetreden bij de berekening. Probeer het later opnieuw.';
  const status = err?.response?.status;
  if (status && SAFE_ERROR_MESSAGES[status]) return SAFE_ERROR_MESSAGES[status];
  if (status && status >= 500) return SAFE_ERROR_MESSAGES[500];
  if (status && status >= 400) return SAFE_ERROR_MESSAGES[422] ?? fallback;
  return fallback;
}
// Never use: err.response?.data?.detail or err.message directly
```

### 5.4 .github/workflows – Least-Privilege Permissions

```yaml
# build job
permissions:
  contents: read

# deploy job (Azure Web App)
permissions:
  id-token: write
  contents: read
  packages: read

# Azure Static Web Apps
permissions:
  contents: read
  pull-requests: write
```

---

*All changes have been applied to the codebase. Run tests and deploy with the updated configuration.*
