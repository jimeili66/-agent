# Custom Product Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add custom product entry, image upload, and AI-assisted product draft generation to the livestream Agent workbench.

**Architecture:** FastAPI receives product creation requests and stores them in the existing in-memory `PRODUCTS` list. FastAPI also saves uploaded product images to a static uploads directory and produces product drafts through an OpenAI-compatible call with local fallback. React renders a compact form in the product selector area, uploads images, asks for a generated draft, posts products to the API, and falls back safely if generation is unavailable.

**Tech Stack:** FastAPI, Pydantic, React, TypeScript, Vite, pytest, httpx, multipart file uploads.

## Global Constraints

- Keep the existing FastAPI + React/Vite architecture.
- Keep the dashboard professional and compact.
- Do not add SQLite persistence in this iteration.
- New products must work with existing script generation, danmu answer, tool logs, and review report flows.
- Uploaded product images are stored under `backend/uploads/products/` and served from `/uploads/products/`.
- AI draft generation must fall back to local rules when `OPENAI_API_KEY` is missing.

---

### Task 1: Backend Product Creation API

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/test_api.py`

**Interfaces:**
- Produces: `ProductCreateRequest`
- Produces: `POST /api/products/ -> Product`

Steps:
- [ ] Add failing pytest for creating a product.
- [ ] Run the single test and confirm it fails with 404 or missing model.
- [ ] Add `ProductCreateRequest` model and endpoint.
- [ ] Run backend tests and confirm all pass.

### Task 2: Frontend Product Entry

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Consumes: `createProduct(payload: ProductCreatePayload): Promise<Product>`
- Produces: Product form with submit handler.

Steps:
- [ ] Add frontend product-create types and API client.
- [ ] Add controlled form state in `App.tsx`.
- [ ] Parse comma-separated fields and validate required values.
- [ ] Submit to backend, append/select created product, regenerate script state.
- [ ] Add compact styles for the form.
- [ ] Run `npm run build`.

### Task 3: End-to-End Verification

**Files:**
- No production file changes expected.

Steps:
- [ ] Run `python -m pytest backend/tests/test_api.py -q`.
- [ ] Run `npm run build`.
- [ ] Check `GET /api/health/`.
- [ ] Browser-test adding a product, selecting it, and generating script/review.

### Task 4: Image Upload and AI Draft

**Files:**
- Modify: `requirements.txt`
- Modify: `backend/app/main.py`
- Modify: `backend/app/models.py`
- Modify: `backend/app/services.py`
- Modify: `backend/tests/test_api.py`
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Produces: `POST /api/uploads/product-image/ -> { imageUrl, fileName }`
- Produces: `POST /api/products/draft/ -> ProductDraftResponse`
- Consumes: `uploadProductImage(file: File): Promise<UploadedImageResponse>`
- Consumes: `requestProductDraft(payload): Promise<ProductDraftResponse>`

Steps:
- [ ] Add failing backend tests for image upload and product draft fallback.
- [ ] Implement upload endpoint and static mount.
- [ ] Implement product draft endpoint with OpenAI-compatible generation plus local fallback.
- [ ] Add frontend upload and draft API helpers.
- [ ] Add file input and "AI 生成资料/话术" action to the product form.
- [ ] Run backend tests, frontend build, health check, and browser verification.
