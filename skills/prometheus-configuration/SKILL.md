---
triggers:
  - "prometheus configuration"
name: prometheus-configuration
description: Set up Prometheus for comprehensive metric collection, storage, and monitoring of infrastructure and applications. Use when implementing metrics collection, setting up monitoring infrastructure, or configuring alerting systems.
---

# Prometheus Configuration

Complete guide to Prometheus setup, metric collection, scrape configuration, and recording rules.

## Purpose

Configure Prometheus for comprehensive metric collection, alerting, and monitoring of infrastructure and applications.

## When to Use

- Set up Prometheus monitoring
- Configure metric scraping
- Create recording rules
- Design alert rules
- Implement service discovery

## Prometheus Architecture

```
┌──────────────┐
│ Applications │ ← Instrumented with client libraries
└──────┬───────┘
       │ /metrics endpoint
       ↓
┌──────────────┐
│  Prometheus  │ ← Scrapes metrics periodically
│    Server    │
└──────┬───────┘
       │
       ├─→ AlertManager (alerts)
       ├─→ Grafana (visualization)
       └─→ Long-term storage (Thanos/Cortex)
```

## Installation

### Kubernetes with Helm

```bash

## Note
Skill content truncated for token efficiency. Full version available in the source repository.
