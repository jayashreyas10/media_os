# MediaOS Security Policy

## 1. Authentication & Session Security
- User passwords are encrypted using `bcryptjs` with salt work factor 10.
- Sessions use secure, HTTP-only cookies preventing client-side script inspection.
- CSRF protection enabled via `sameSite: "lax"` cookie flags.

## 2. Secrets Management
- Zero API keys, database credentials, or auth secrets are exposed to client-side code.
- Privileged operations and database queries occur strictly in server actions and API handlers.

## 3. Prompt Injection Defense
- Untrusted external inputs are treated as evidence/data rather than system instructions.
- Strict Zod schema validation parses and validates all model outputs before saving to the database.

## 4. Immutable Audit Trail
- High-consequence actions (campaign transitions, Brand Brain edits, task runs) are logged to an append-only `AuditLog` table.
