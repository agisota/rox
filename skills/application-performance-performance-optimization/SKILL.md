---
triggers:
  - "application performance performance optimization"
name: application-performance-performance-optimization
description: "Use when working with application performance performance optimization"
---

Optimize application performance end-to-end using specialized performance and optimization agents:

[Extended thinking: This workflow orchestrates a comprehensive performance optimization process across the entire application stack. Starting with deep profiling and baseline establishment, the workflow progresses through targeted optimizations in each system layer, validates improvements through load testing, and establishes continuous monitoring for sustained performance. Each phase builds on insights from previous phases, creating a data-driven optimization strategy that addresses real bottlenecks rather than theoretical improvements. The workflow emphasizes modern observability practices, user-centric performance metrics, and cost-effective optimization strategies.]

## Phase 1: Performance Profiling & Baseline

### 1. Comprehensive Performance Profiling

- Use Task tool with subagent_type="performance-engineer"
- Prompt: "Profile application performance comprehensively for: $ARGUMENTS. Generate flame graphs for CPU usage, heap dumps for memory analysis, trace I/O operations, and identify hot paths. Use APM tools like DataDog or New Relic if available. Include database query profiling, API response times, and frontend rendering metrics. Establish performance baselines for all critical user journeys."
- Context: Initial performance investigation
- Output: Detailed performance profile with flame graphs, memory analysis, bottleneck identification, baseline metrics

### 2. Observability Stack Assessment

- Use Task tool with subagent_type="observability-engineer"
- Prompt: "Assess current observability setup for: $ARGUMENTS. Review existing monitoring, distributed tracing with OpenTelemetry, log aggregation, and metrics collection. Identify gaps in visibility, missing metrics, and areas needing better instrumentation. Recommend APM tool integration and custom metrics for business-critical operations."
- Context: Performance profile from step 1
- Output: Observability assessment report, instrumentation gaps, monitoring recommendations

### 3. User Experience Analysis

- Use Task tool with subagent_type="performance-engineer"
- Prompt: "Analyze user experience metrics for: $ARGUMENTS. Measure Core Web Vitals (LCP, FID, CLS), page load times, time to interactive, and perceived performance. Use Real User Monitoring (RUM) data if available. Identify user journeys with poor performance and their business impact."
