# Contributing to ArchiCore OSS

Thank you for your interest in contributing to ArchiCore OSS!

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/ArchiCore-Team/archicore.git`
3. Install dependencies: `npm install`
4. Build the project: `npm run build`
5. Run the CLI: `node dist/cli.js --help`

## Development

```bash
# Watch mode (auto-rebuild on changes)
npm run dev

# Type checking
npm run typecheck

# Build
npm run build
```

## Project Structure

```
src/
  analyzers/       # Security, dead code, duplication, metrics, narrator
  code-index/      # AST parser, symbol extractor, dependency graph
  graph/           # Neo4j client and Cypher queries
  search/          # BM25 full-text search
  export/          # JSON, HTML, Markdown, CSV, GraphML exporters
  plugins/         # Optional LLM integrations (Ollama, OpenAI)
  server/          # Express REST API
  utils/           # Shared utilities
  cli.ts           # CLI entry point
  index.ts         # Library entry point
```

## Submitting Changes

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make your changes
3. Run type checking: `npm run typecheck`
4. Build to verify: `npm run build`
5. Commit with a clear message
6. Push and open a Pull Request

## Guidelines

- Write TypeScript (no plain JS)
- Follow existing code style
- Keep changes focused (one feature or fix per PR)
- Add comments only where logic is not self-evident
- Test on a real project before submitting

## Reporting Bugs

Open an issue on GitHub with:
- Steps to reproduce
- Expected vs actual behavior
- Node.js version and OS
- Project type being analyzed (Vue, React, Python, etc.)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
