---
name: False positive report
about: ArchiCore flagged something that isn't actually a vulnerability
title: "[FALSE POSITIVE]"
labels: false-positive, scanner
assignees: ArchiCore-Team

---

**What was flagged?**
- Finding type: [e.g. sql-injection, xss, command-injection]
- File and line:
- Code snippet:

```
paste the flagged code here
```

**Why it's a false positive**
Explain the context — why this code is safe in practice.

**Project context**
- Language / framework:
- Is the flagged code in a test file, config, or docs?
- Is there sanitization happening elsewhere that ArchiCore missed?

**ArchiCore version**
`archicore --version`
