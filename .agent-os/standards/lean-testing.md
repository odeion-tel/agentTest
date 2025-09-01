---
description: Lean Testing Charter for Agent OS
globs:
alwaysApply: true
version: 1.0
encoding: UTF-8
---

# Lean Testing Charter

## Purpose

Minimize token usage and developer effort by focusing on **risk-based, minimal testing**.  
Testing exists to reduce risk at the lowest possible cost — not to maximize coverage vanity metrics.

## Core Principles

### 0. Test Layer Order (Data → Pure → Impure)

Order of attempt and budget:

1. Data: validate schemas, types, and transformations at boundaries.
2. Pure: verify function-level logic with examples + up to 2 invariants.
3. Impure: minimal contract/E2E checks for side effects and wiring.

Rule:

- Do not write tests in a higher layer until the lower layer is specified and passing.
- If a higher-layer test fails, add/adjust the lower-layer spec first.

### 1. Risk-First Testing

- Identify the **top 3 risks** for each feature.
- Write only the smallest set of tests that falsify those risks.
- Exclude low-severity or redundant scenarios.

### 2. Minimal Test Plan Flow

1. **Propose a Lean Test Plan**

   - List top risks
   - Minimal test set for each risk
   - Estimated token cost
   - STOP and wait for user approval

2. **Generate Approved Tests Only**

   - Prefer assertions over scaffolding
   - Use table-driven tests (≤6 rows)
   - Use single stable snapshots when possible

3. **Execution Constraints**
   - Max 200 lines of test code per request
   - Max 2 iterations unless user approves more
   - Always return a **Cost Report**: tokens_in, tokens_out, estimated_cost
     Layered budgets (default caps):
   - Data layer: ≤ 40% of the test token budget
   - Pure layer: ≤ 40%
   - Impure layer: ≤ 20% (golden path only; guardrails over matrices)

### 3. Golden Path + Invariants

- Always include one golden-path test for the primary workflow.
- Add up to two invariants (e.g., idempotence, ordering, monotonicity).
- Do not generate large case matrices unless explicitly requested.

### 4. Contract Tests over Unit Exhaustion

- Prefer API/contract-level tests at boundaries.
- Only write deep unit tests if a risk cannot be covered at the contract level.

### 5. Debugging Rules

- Before suggesting fixes, always produce a **minimal reproducible example** (≤30 lines).
- If blocked, output `BLOCKED_REASON` instead of exploring blindly.

## Integration with Agent OS

- **create-tasks.md**

  - Replace “1.1 Write tests” subtasks with:
    - “1.1 Propose Lean Test Plan for [COMPONENT]”
    - “1.2 Write approved minimal tests”

- **execute-task.md** Step 5 (Task Execution)

  - Follow the Lean Test Plan flow: propose → approve → implement.

- **execute-tasks.md** Phase 2 (Task Execution Loop)
  - Ensure test generation respects Lean Testing Charter constraints.

## Example Output Format

```
Lean Test Plan

Risks:
- User input validation failure
- Data integrity on save
- Unauthorized access

Minimal Tests:

- Golden-path: Valid input saves correctly
- Invariant: Save is idempotent
- Contract: API rejects unauthorized requests
```
