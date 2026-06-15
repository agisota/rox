---
triggers:
  - "distriuuted tracing"
name: distributed-tracing
description: Implement distributed tracing with Jaeger and Tempo to track requests across microservices and identify performance bottlenecks. Use when debugging microservices, analyzing request flows, or implementing observability for distributed systems.
---

# Distributed Tracing

Implement distributed tracing with Jaeger and Tempo for request flow visibility across microservices.

## Purpose

Track requests across distributed systems to understand latency, dependencies, and failure points.

## When to Use

- Debug latency issues
- Understand service dependencies
- Identify bottlenecks
- Trace error propagation
- Analyze request paths

## Distributed Tracing Concepts

### Trace Structure
```
Trace (Request ID: abc123)
  ↓
Span (frontend) [100ms]
  ↓
Span (api-gateway) [80ms]
  ├→ Span (auth-service) [10ms]
  └→ Span (user-service) [60ms]
      └→ Span (database) [40ms]
```

### Key Components
- **Trace** - End-to-end request journey
- **Span** - Single operation within a trace
- **Context** - Metadata propagated between services
- **Tags** - Key-value pairs for filtering
- **Logs** - Timestamped events within a span

## Jaeger Setup


## Note
Skill content truncated for token efficiency. Full version available in the source repository.
