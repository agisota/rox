---
triggers:
  - "tdd workflows tdd cycle"
name: tdd-workflows-tdd-cycle
description: "Use when working with tdd workflows tdd cycle"
---

Execute a comprehensive Test-Driven Development (TDD) workflow with strict red-green-refactor discipline:

[Extended thinking: This workflow enforces test-first development through coordinated agent orchestration. Each phase of the TDD cycle is strictly enforced with fail-first verification, incremental implementation, and continuous refactoring. The workflow supports both single test and test suite approaches with configurable coverage thresholds.]

## Configuration

### Coverage Thresholds
- Minimum line coverage: 80%
- Minimum branch coverage: 75%
- Critical path coverage: 100%

### Refactoring Triggers
- Cyclomatic complexity > 10
- Method length > 20 lines
- Class length > 200 lines
- Duplicate code blocks > 3 lines

## Phase 1: Test Specification and Design

### 1. Requirements Analysis
- Use Task tool with subagent_type="comprehensive-review::architect-review"
- Prompt: "Analyze requirements for: $ARGUMENTS. Define acceptance criteria, identify edge cases, and create test scenarios. Output a comprehensive test specification."
- Output: Test specification, acceptance criteria, edge case matrix
- Validation: Ensure all requirements have corresponding test scenarios
