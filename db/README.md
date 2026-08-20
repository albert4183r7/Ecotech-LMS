# Local database

`custom.db` is the local SQLite database and is deliberately **not** tracked in
git. Versioning it means one machine's data silently overwrites another's on
merge, which is exactly what happened once already.

To create it from scratch:

```bash
npx prisma db push   # schema
npm run db:seed      # optional demo content
```
