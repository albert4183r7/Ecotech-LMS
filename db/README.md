# Local database

`custom.db` is the local SQLite database and is deliberately **not** tracked in
git. Versioning it means one machine's data silently overwrites another's on
merge, which is exactly what happened once already.

To create it from scratch:

```bash
npx prisma db push   # schema
npm run db:seed      # optional demo content
```

## The path matters

Prisma resolves a relative `DATABASE_URL` from `prisma/schema.prisma`, not from
the project root. `file:./db/custom.db` therefore creates `prisma/db/custom.db`
and leaves the real database untouched.

Use:

```
DATABASE_URL=file:../db/custom.db
```

If you already have a `prisma/db/custom.db`, that is where your data went. Move
it to `db/custom.db` and fix the path, or point `DATABASE_URL` at it directly.
