# FastAPI API Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a FastAPI backend and connect the existing React live commerce Agent dashboard to real HTTP APIs.

**Architecture:** Keep the React UI as the primary client on port 5173 and run a FastAPI backend on port 8000. The backend mirrors the current frontend data types and rule-based Agent behavior so the page works through APIs now and can later swap service internals for a real LLM or database.

**Tech Stack:** Python 3.13, FastAPI, Uvicorn, Pytest, React, Vite, TypeScript.

## Global Constraints

- Do not use Django.
- Keep the current frontend layout and product image UI intact.
- API responses must match `frontend/src/types.ts`.
- Frontend should prefer backend API calls and keep local fallback behavior if the backend is unavailable.
- Backend runs at `http://127.0.0.1:8000`; frontend runs at `http://127.0.0.1:5173`.

---

## File Structure

- Create `backend/app/main.py`: FastAPI app, CORS, route declarations.
- Create `backend/app/models.py`: Pydantic request/response models matching frontend TypeScript types.
- Create `backend/app/data.py`: Product and danmu seed data.
- Create `backend/app/services.py`: Script generation, danmu answering, tool log generation, review generation.
- Create `backend/tests/test_api.py`: API contract tests through FastAPI `TestClient`.
- Create `backend/start-dev.ps1` and `backend/start-dev.bat`: local backend startup helpers.
- Modify `requirements.txt`: add FastAPI, Uvicorn, Pytest, HTTPX.
- Create `frontend/src/api.ts`: typed client functions.
- Modify `frontend/src/App.tsx`: fetch initial API data and call backend for script, danmu answer, and review with local fallbacks.
- Modify `Dockerfile` and `docker-compose.yml`: run FastAPI backend instead of an inert Python shell.

### Task 1: Backend API Contract Tests

**Files:**
- Create: `backend/tests/test_api.py`

**Interfaces:**
- Consumes: `backend.app.main.app`
- Produces: failing tests for `/api/products/`, `/api/danmu/`, `/api/script/generate/`, `/api/danmu/answer/`, `/api/review/generate/`

- [ ] **Step 1: Write API tests**
- [ ] **Step 2: Run `python -m pytest backend/tests/test_api.py -q` and verify it fails because `backend.app` does not exist**

### Task 2: FastAPI Backend

**Files:**
- Create: `backend/app/__init__.py`
- Create: `backend/app/models.py`
- Create: `backend/app/data.py`
- Create: `backend/app/services.py`
- Create: `backend/app/main.py`
- Modify: `requirements.txt`
- Modify: `Dockerfile`
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: tests from Task 1
- Produces: FastAPI app object named `app`; endpoints returning the same JSON shape expected by the frontend client

- [ ] **Step 1: Add dependencies**
- [ ] **Step 2: Implement Pydantic models**
- [ ] **Step 3: Implement seed data**
- [ ] **Step 4: Implement rule-based service functions**
- [ ] **Step 5: Implement FastAPI routes and CORS**
- [ ] **Step 6: Run `python -m pytest backend/tests/test_api.py -q` and verify pass**

### Task 3: Frontend API Client And Integration

**Files:**
- Create: `frontend/src/api.ts`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: FastAPI endpoints from Task 2
- Produces: frontend state hydrated from backend and actions routed through backend with local fallback

- [ ] **Step 1: Write typed API client**
- [ ] **Step 2: Restore `useEffect` initial data loading**
- [ ] **Step 3: Convert script/danmu/review handlers to async backend calls with local fallback**
- [ ] **Step 4: Run `npm run build` and verify pass**

### Task 4: End-To-End Verification

**Files:**
- Create: `backend/start-dev.ps1`
- Create: `backend/start-dev.bat`

**Interfaces:**
- Consumes: backend app and frontend app
- Produces: running backend on 8000 and frontend on 5173 with API-backed interactions

- [ ] **Step 1: Start backend with `python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000` from `backend/`**
- [ ] **Step 2: Keep or start Vite frontend on `http://127.0.0.1:5173/`**
- [ ] **Step 3: Verify browser loads the dashboard, product images appear, clicking danmu creates Agent reply and tool log, generating review creates structured report**
