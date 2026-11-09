# Custom Product Entry Design

## Goal

Allow users to add a custom livestream product from the workbench and immediately use it for script generation, danmu answering, tool logs, and review reports.

## Scope

- Add an in-memory FastAPI endpoint: `POST /api/products/`.
- Accept the same product fields used by the current workbench: name, category, selling points, prices, promotion rule, stock, notes, suitable users, and image metadata.
- Add a compact product entry form in the frontend product area.
- After successful submit, append the product to the current product list, select it, refresh script sections, and keep the workbench usable if the backend is unavailable.
- Add image upload from the user's computer or phone browser through `POST /api/uploads/product-image/`.
- Add advanced product draft generation through `POST /api/products/draft/`.
- Use an OpenAI-compatible model call when `OPENAI_API_KEY` is configured; otherwise fall back to local keyword inference.
- Do not add database persistence in this iteration.

## Data Flow

1. User fills the frontend product form.
2. Frontend normalizes comma-separated selling points and suitable users into arrays.
3. Frontend calls `POST /api/products/`.
4. Backend assigns the next product id, appends it to the in-memory `PRODUCTS` list, and returns the created product.
5. Frontend selects the created product and regenerates local/remote script content.
6. If the API request fails, frontend creates a local-only product with a high timestamp id and shows a fallback notice.

## Image Upload Flow

1. User selects a local image file in the product form.
2. Frontend sends multipart form data to `POST /api/uploads/product-image/`.
3. Backend validates image content type and saves the file under `backend/uploads/products/`.
4. FastAPI serves the uploaded file through `/uploads/products/<filename>`.
5. Frontend writes the returned URL into the product image field and shows the uploaded image in the workbench.

## Advanced Draft Flow

1. User enters at least a product name.
2. Frontend calls `POST /api/products/draft/`.
3. Backend tries an OpenAI-compatible structured JSON response if `OPENAI_API_KEY` exists.
4. If model generation is unavailable or invalid, backend uses keyword inference so the classroom demo stays stable.
5. Backend returns product fields plus structured script sections.
6. Frontend fills the product form and updates the script preview.

## Validation

- Required text fields must be non-empty.
- `price`, `livePrice`, and `stock` must be non-negative numbers.
- `sellingPoints` and `suitableFor` must contain at least one item.
- If `imageUrl` is omitted, use `/products/cup.jpg` as a neutral placeholder path.
- Uploaded files must be image MIME types only.
- Generated copy must avoid absolute claims, treatment claims, and misleading price promises.
