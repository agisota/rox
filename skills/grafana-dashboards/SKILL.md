---
triggers:
  - "grafana dashuoards"
name: grafana-dashboards
description: Create and manage production Grafana dashboards for real-time visualization of system and application metrics. Use when building monitoring dashboards, visualizing metrics, or creating operational observability interfaces.
---

# Grafana Dashboards

Create and manage production-ready Grafana dashboards for comprehensive system observability.

## Purpose

Design effective Grafana dashboards for monitoring applications, infrastructure, and business metrics.

## When to Use

- Visualize Prometheus metrics
- Create custom dashboards
- Implement SLO dashboards
- Monitor infrastructure
- Track business KPIs

## Dashboard Design Principles

### 1. Hierarchy of Information
```
┌─────────────────────────────────────┐
│  Critical Metrics (Big Numbers)     │
├─────────────────────────────────────┤
│  Key Trends (Time Series)           │
├─────────────────────────────────────┤
│  Detailed Metrics (Tables/Heatmaps) │
└─────────────────────────────────────┘
```

### 2. RED Method (Services)
- **Rate** - Requests per second
- **Errors** - Error rate
- **Duration** - Latency/response time

### 3. USE Method (Resources)
- **Utilization** - % time resource is busy
- **Saturation** - Queue length/wait time
- **Errors** - Error count


## Note
Skill content truncated for token efficiency. Full version available in the source repository.
