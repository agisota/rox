---
triggers:
  - "rag implementation"
name: rag-implementation
description: Build Retrieval-Augmented Generation (RAG) systems for LLM applications with vector databases and semantic search. Use when implementing knowledge-grounded AI, building document Q&A systems, or integrating LLMs with external knowledge bases.
---

# RAG Implementation

Master Retrieval-Augmented Generation (RAG) to build LLM applications that provide accurate, grounded responses using external knowledge sources.

## When to Use This Skill

- Building Q&A systems over proprietary documents
- Creating chatbots with current, factual information
- Implementing semantic search with natural language queries
- Reducing hallucinations with grounded responses
- Enabling LLMs to access domain-specific knowledge
- Building documentation assistants
- Creating research tools with source citation

## Core Components

### 1. Vector Databases
**Purpose**: Store and retrieve document embeddings efficiently

**Options:**
- **Pinecone**: Managed, scalable, fast queries
- **Weaviate**: Open-source, hybrid search
- **Milvus**: High performance, on-premise
- **Chroma**: Lightweight, easy to use
- **Qdrant**: Fast, filtered search
- **FAISS**: Meta's library, local deployment

### 2. Embeddings
**Purpose**: Convert text to numerical vectors for similarity search

**Models:**
- **text-embedding-ada-002** (OpenAI): General purpose, 1536 dims
- **all-MiniLM-L6-v2** (Sentence Transformers): Fast, lightweight
- **e5-large-v2**: High quality, multilingual
- **Instructor**: Task-specific instructions
- **bge-large-en-v1.5**: SOTA performance

### 3. Retrieval Strategies
**Approaches:**

## Note
Skill content truncated for token efficiency. Full version available in the source repository.
