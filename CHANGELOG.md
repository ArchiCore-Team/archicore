# Changelog

## [1.0.0] - 2026-02-10

### Added
- **AST Parser** - Tree-sitter based parsing for 40+ languages (TS, JS, Python, Go, Rust, Java, C#, PHP, Ruby, and more)
- **Vue SFC Support** - Extracts and parses `<script>` sections from Vue Single File Components
- **Symbol Extraction** - Functions, classes, interfaces, types, variables, constants (up to 500 per file)
- **Dependency Graph** - Import/export based graph with alias resolution (jsconfig.json, tsconfig.json)
- **Neo4j Integration** - Optional persistent graph storage with Cypher queries (in-memory fallback)
- **BM25 Search** - Full-text code search with camelCase/snake_case tokenization
- **Impact Analysis** - Transitive dependency traversal to predict change effects
- **Code Metrics** - Cyclomatic complexity, coupling, maintainability index, tech debt estimation
- **Security Scanner** - XSS, SQL injection, command injection, path traversal, hardcoded secrets detection
- **Dead Code Detection** - Unused variables, unreachable code, commented code blocks
- **Duplication Analysis** - Clone detection across files
- **Architecture Rules** - Configurable dependency constraint engine
- **AI Narrator** - Framework/stack detection and architecture pattern recognition
- **CLI** - Full command-line interface with compact table output
- **REST API** - Express server for programmatic access
- **Export Formats** - JSON, HTML, Markdown, CSV, GraphML
- **Non-code File Filtering** - SQL, CSS, HTML, JSON, YAML automatically excluded from symbol extraction
- **Native C++ Modules** - Optional high-performance semantic chunker and incremental indexer
- **LLM Plugins** - Optional Ollama and OpenAI integration for AI-powered analysis
