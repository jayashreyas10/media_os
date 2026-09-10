# Contributing to MediaOS

## Development Rules
1. **Vertical Slice Execution**: For every feature: Database → Domain Logic → API → UI → Validation → Test → Verification.
2. **Deterministic Mock Testing**: All features must pass unit and integration tests under the `mock` AI provider without paid API dependencies.
3. **Strict TypeScript**: No `any`, no ignored TypeScript diagnostics, clean builds.
4. **Database Portability**: Always maintain Prisma schema compatibility between SQLite and PostgreSQL.

## Workflow Commands
```bash
npm run dev        # Launch development server
npm run test       # Run unit test suite
npm run lint       # Lint codebase
npm run build      # Verify production build
npm run db:push    # Push schema changes to SQLite
npm run db:seed    # Seed demo data
```
