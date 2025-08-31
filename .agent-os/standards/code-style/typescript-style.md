# TypeScript Style Guide

## Requirement Rules

- enable strict mode in tsconfig.json. This is a best practice for all TypeScript projects.

## Validation

- Use Zod Validator Middleware

### import

```
import { zValidator } from '@hono/zod-validator'
```

### example

```
const route = app.post(
  '/posts',
  zValidator(
    'form',
    z.object({
      body: z.string(),
    })
  ),
  (c) => {
    const validated = c.req.valid('form')
    // ... use your validated data
  }
)
```
