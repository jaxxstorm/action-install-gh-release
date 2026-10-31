# Contributing

## Development

Install dependencies and rebuild the bundled action code before opening a pull request:

```bash
npm ci
npm run build
```

This repository ships the generated action bundle in `lib/`, so changes to `src/main.ts`
should include the corresponding updated files under `lib/`.

## Pull Requests

Keep pull requests focused and include a short description of the user-visible change.
If you change action inputs or behavior, update `README.md` to match.

## Security

Please do not open public issues for security vulnerabilities. Follow `SECURITY.md` for
private reporting instructions.
