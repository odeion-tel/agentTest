# Development Best Practices

## Context

Global development guidelines for Agent OS projects.

<conditional-block context-check="core-principles">
IF this Core Principles section already read in current context:
  SKIP: Re-reading this section
  NOTE: "Using Core Principles already in context"
ELSE:
  READ: The following principles

## Core Principles

### Clarity Over Cleverness

- Optimize for human understanding, not just fewer lines of code
- Write code (or prompts) that a new contributor can grasp in minutes
- Comment for "why decisions were made," not "what the code does"

### Problem Specification as the New Skill

- Treat development as problem translation: the clearer the framing, the better the solution
- Express goals, inputs, outputs, and constraints explicitly in natural language or structured prompts
- Validate AI-generated code as you would a junior engineer’s work

### Functional Hierarchy (Data → Transformations → Actions)

- Model data clearly first — everything flows from well-defined data
- Prefer pure functions where possible; isolate side effects for clarity and testability
- Keep transformations explicit to make reasoning easier

### Pragmatic Reuse (DRY with Judgment)

- Eliminate duplication when it reduces long-term maintenance risk
- Allow some redundancy if it improves readability or avoids brittle abstractions
- Reuse components and utilities where they clarify intent

### Structure for Navigation

- Keep files/modules focused on a single responsibility
- Organize codebases to match how developers (and AI assistants) search for context
- Use consistent naming conventions so purpose is inferable

### Human-AI Collaboration

- Use agentic coding tools as accelerators, not replacements
- Pair with AI for generation, testing, and refactoring — always review outputs
- Let AI handle repetition; reserve human focus for architecture, validation, and edge cases

### Framework & Tooling (Hono Best Practice)

- Minimize boilerplate; choose framework patterns that reduce friction
- In Hono:
  - Prefer `app.route()` for scalability
  - Use JSX Renderer Middleware and Zod Validator Middleware where appropriate
  - Avoid unnecessary controllers

### Documentation as a Living System

- Generate and consolidate docs continuously with AI assistance
- Store tribal knowledge in CLAUDE.md (or equivalent) for easy ingestion
- Treat documentation as an interface — anyone should understand workflows quickly

  </conditional-block>

<conditional-block context-check="dependencies" task-condition="choosing-external-library">
IF current task involves choosing an external library:
  IF Dependencies section already read in current context:
    SKIP: Re-reading this section
    NOTE: "Using Dependencies guidelines already in context"
  ELSE:
    READ: The following guidelines
ELSE:
  SKIP: Dependencies section not relevant to current task

## Dependencies

### Dependency Discipline

When adding third-party dependencies:

- Dependencies are long-term commitments — add them sparingly
- Favor actively maintained, well-documented, and widely used libraries
- Prefer small, composable packages over monolithic frameworks
- Do NOT use React, Angular, or Vue

  </conditional-block>
