# Requirements Document: Comprehensive Architecture Documentation

## Introduction

This feature creates comprehensive, educational documentation for the Atlas Commerce Lab codebase that explains the complete system architecture, design decisions, data flows, and integration patterns. The documentation will serve as both a learning resource for developers new to the codebase and a reference guide for understanding how the microservices-based ecommerce platform with AI capabilities operates.

The system combines NestJS (backend API gateway), FastAPI (AI service), React/Vite (frontend), MongoDB (primary database), Redis (task queue), Qdrant (vector database), and Ollama (local LLM) into a cohesive production-style teaching platform.

## Glossary

- **Documentation_System**: The comprehensive architecture documentation being created
- **NestJS_Gateway**: The Node.js/NestJS backend service acting as the API gateway
- **AI_Service**: The Python/FastAPI microservice handling AI orchestration
- **Vector_Database**: Qdrant vector database for semantic search and embeddings
- **Task_Queue**: Redis-based asynchronous job processing system with RQ workers
- **Frontend**: React/Vite single-page application
- **Ollama**: Local LLM inference engine running on the host machine
- **Data_Flow**: The complete request/response path through the system
- **Module_Architecture**: NestJS module-based organization pattern
- **Streaming_Response**: Server-sent events for real-time AI token delivery
- **RAG_System**: Retrieval-Augmented Generation using vector embeddings
- **API_Gateway_Pattern**: Architectural pattern where NestJS acts as the central orchestrator
- **Microservices_Architecture**: The distributed system design with specialized services
- **Dependency_Injection**: NestJS pattern for managing service dependencies
- **Embedding_Generation**: Process of converting text to vector representations
- **Background_Worker**: Async job processor (ai-worker) consuming Redis queue tasks

## Requirements

### Requirement 1: REST API Architecture Documentation

**User Story:** As a developer learning the codebase, I want comprehensive documentation of the NestJS REST API architecture, so that I understand how the backend orchestrates requests between services.

#### Acceptance Criteria

1. THE Documentation_System SHALL document the API gateway pattern and explain why NestJS acts as the central orchestrator
2. THE Documentation_System SHALL document all NestJS modules (catalog, payments, AI, auth) with their responsibilities and boundaries
3. THE Documentation_System SHALL document the endpoint design patterns including request validation, error handling, and response normalization
4. THE Documentation_System SHALL document the complete request/response flow from frontend through NestJS to downstream services
5. THE Documentation_System SHALL explain how the NestJS_Gateway orchestrates between MongoDB, AI_Service, and payment providers
6. THE Documentation_System SHALL document the module-based architecture and how features are encapsulated
7. THE Documentation_System SHALL document the controller/service/provider separation pattern with code examples
8. THE Documentation_System SHALL explain why business logic stays in services rather than controllers
9. THE Documentation_System SHALL document the global exception filter and validation pipe configuration
10. THE Documentation_System SHALL document CORS configuration and why it enables local development ergonomics

### Requirement 2: Qdrant Vector Database Documentation

**User Story:** As a developer implementing AI features, I want detailed documentation of how Qdrant enables semantic search and AI memory, so that I can extend the RAG capabilities.

#### Acceptance Criteria

1. THE Documentation_System SHALL document how Qdrant provides long-term memory for the AI system
2. THE Documentation_System SHALL document the embedding generation process using Ollama
3. THE Documentation_System SHALL document vector storage including collection creation and vector dimensions
4. THE Documentation_System SHALL document semantic retrieval using cosine similarity search
5. THE Documentation_System SHALL explain how RAG_System combines vector search with LLM generation
6. THE Documentation_System SHALL document the memory service architecture including store_message and search_relevant_context methods
7. THE Documentation_System SHALL document collection initialization and vector size detection
8. THE Documentation_System SHALL explain the payload structure for stored vectors (role, content, thread_id, timestamp)
9. THE Documentation_System SHALL document similarity score thresholds and result filtering
10. THE Documentation_System SHALL explain use cases: conversation history storage and knowledge base indexing

### Requirement 3: Redis Queue System Documentation

**User Story:** As a developer optimizing performance, I want comprehensive documentation of the Redis queue architecture, so that I understand how async processing keeps the API responsive.

#### Acceptance Criteria

1. THE Documentation_System SHALL document how Redis acts as a message broker and task queue
2. THE Documentation_System SHALL document the RQ (Redis Queue) library integration
3. THE Documentation_System SHALL document the async job processing architecture with the ai-worker container
4. THE Documentation_System SHALL document the separation between ai-service (API) and ai-worker (background processor)
5. THE Documentation_System SHALL document use cases including bulk embedding generation
6. THE Documentation_System SHALL explain how task enqueuing keeps the API responsive
7. THE Documentation_System SHALL document the task_service.py enqueue_task function
8. THE Documentation_System SHALL document the process_bulk_embeddings_task background job
9. THE Documentation_System SHALL explain the worker command: "rq worker ai_tasks --url redis://redis:6379/0"
10. THE Documentation_System SHALL document future optimization opportunities (catalog caching, session store, rate limiting)

### Requirement 4: NestJS Workflow and Architecture Documentation

**User Story:** As a developer new to NestJS, I want detailed documentation of the framework patterns used in this codebase, so that I can contribute effectively.

#### Acceptance Criteria

1. THE Documentation_System SHALL document the module-based architecture pattern
2. THE Documentation_System SHALL document dependency injection with examples from the codebase
3. THE Documentation_System SHALL document how controllers, services, and providers work together
4. THE Documentation_System SHALL document the AppModule as the root dependency graph
5. THE Documentation_System SHALL document middleware and filters including GlobalHttpExceptionFilter
6. THE Documentation_System SHALL document MongoDB integration using Mongoose with connection configuration
7. THE Documentation_System SHALL document the ValidationPipe configuration (whitelist, transform, forbidNonWhitelisted)
8. THE Documentation_System SHALL document production-ready patterns including health checks
9. THE Documentation_System SHALL document error handling and exception normalization
10. THE Documentation_System SHALL document the bootstrap function in main.ts including rawBody configuration for webhooks
11. THE Documentation_System SHALL explain why rawBody preservation matters for Stripe webhook signature verification

### Requirement 5: Complete Data Flow Documentation

**User Story:** As a developer debugging issues, I want step-by-step documentation of complete data flows, so that I understand exactly what happens during user interactions.

#### Acceptance Criteria

1. THE Documentation_System SHALL document the complete flow from frontend request to AI response
2. THE Documentation_System SHALL document the Nginx reverse proxy layer and path-based routing
3. THE Documentation_System SHALL document the NestJS_Gateway request processing and validation
4. THE Documentation_System SHALL document the AI_Service orchestration with Ollama
5. THE Documentation_System SHALL document streaming response flow: Ollama → Python → Node.js → Nginx → Browser
6. THE Documentation_System SHALL document the TextDecoder usage for processing streaming bytes in the frontend
7. THE Documentation_System SHALL document React state updates during token streaming
8. THE Documentation_System SHALL document the markdown rendering pipeline with syntax highlighting
9. THE Documentation_System SHALL document the smart scroll behavior during streaming
10. THE Documentation_System SHALL document error propagation through the stack
11. THE Documentation_System SHALL document timeout handling at each layer (Ollama, FastAPI, NestJS)

### Requirement 6: Microservices Architecture Documentation

**User Story:** As a system architect, I want comprehensive documentation of how all services work together, so that I understand the distributed system design.

#### Acceptance Criteria

1. THE Documentation_System SHALL document the complete microservices architecture
2. THE Documentation_System SHALL document each service's responsibility: Frontend, NestJS_Gateway, AI_Service, MongoDB, Redis, Qdrant, Ollama
3. THE Documentation_System SHALL document service communication patterns and protocols
4. THE Documentation_System SHALL document the Docker Compose orchestration
5. THE Documentation_System SHALL document service dependencies and startup order
6. THE Documentation_System SHALL document health checks for each service
7. THE Documentation_System SHALL document the internal Docker network (assistant-network)
8. THE Documentation_System SHALL document how services discover each other (DNS-based service names)
9. THE Documentation_System SHALL explain the separation of concerns: why AI logic stays in AI_Service
10. THE Documentation_System SHALL document the host.docker.internal pattern for accessing Ollama
11. THE Documentation_System SHALL explain why this architecture enables swapping providers (OpenAI, Anthropic) easily

### Requirement 7: Architectural Decision Documentation

**User Story:** As a developer making design decisions, I want documentation explaining WHY architectural choices were made, so that I can make consistent decisions.

#### Acceptance Criteria

1. THE Documentation_System SHALL explain why NestJS was chosen as the API gateway
2. THE Documentation_System SHALL explain why AI logic is isolated in a separate FastAPI service
3. THE Documentation_System SHALL explain why MongoDB is used for primary data storage
4. THE Documentation_System SHALL explain why Qdrant was chosen for vector storage over alternatives
5. THE Documentation_System SHALL explain why Redis with RQ was chosen for task queuing
6. THE Documentation_System SHALL explain the benefits of the module-based architecture
7. THE Documentation_System SHALL explain why server-side pricing is critical for payment security
8. THE Documentation_System SHALL explain why webhook signature verification uses raw request bodies
9. THE Documentation_System SHALL explain why streaming responses improve user experience
10. THE Documentation_System SHALL explain the tradeoffs of local Ollama vs cloud LLM providers

### Requirement 8: Extension and Integration Patterns Documentation

**User Story:** As a developer extending the system, I want documentation of common extension patterns, so that I can add features correctly.

#### Acceptance Criteria

1. THE Documentation_System SHALL document how to add a new NestJS module
2. THE Documentation_System SHALL document how to add a new AI capability endpoint
3. THE Documentation_System SHALL document how to integrate a new database
4. THE Documentation_System SHALL document how to add a new payment provider
5. THE Documentation_System SHALL document how to add a new background job type
6. THE Documentation_System SHALL document how to add a new Qdrant collection
7. THE Documentation_System SHALL document how to switch from Ollama to OpenAI
8. THE Documentation_System SHALL document how to add authentication to endpoints
9. THE Documentation_System SHALL document how to add rate limiting
10. THE Documentation_System SHALL document how to add caching with Redis

### Requirement 9: Code Example Documentation

**User Story:** As a developer learning patterns, I want real code examples from the codebase, so that I can see theory applied in practice.

#### Acceptance Criteria

1. THE Documentation_System SHALL include code examples from catalog.service.ts showing service patterns
2. THE Documentation_System SHALL include code examples from ai.controller.ts showing controller patterns
3. THE Documentation_System SHALL include code examples from memory_service.py showing vector operations
4. THE Documentation_System SHALL include code examples from ollama_client.py showing streaming implementation
5. THE Documentation_System SHALL include code examples from task_service.py showing queue operations
6. THE Documentation_System SHALL include code examples showing dependency injection
7. THE Documentation_System SHALL include code examples showing error handling patterns
8. THE Documentation_System SHALL include code examples showing validation with DTOs
9. THE Documentation_System SHALL include code examples showing Mongoose schema definitions
10. THE Documentation_System SHALL include code examples showing async/await patterns in both TypeScript and Python

### Requirement 10: Deployment and Configuration Documentation

**User Story:** As a developer deploying the system, I want documentation of configuration and deployment patterns, so that I can run the system reliably.

#### Acceptance Criteria

1. THE Documentation_System SHALL document all environment variables with their purposes
2. THE Documentation_System SHALL document Docker Compose service configuration
3. THE Documentation_System SHALL document volume management for persistent data
4. THE Documentation_System SHALL document network configuration
5. THE Documentation_System SHALL document health check configuration for each service
6. THE Documentation_System SHALL document MongoDB Atlas integration
7. THE Documentation_System SHALL document Stripe webhook forwarding for local development
8. THE Documentation_System SHALL document eSewa configuration for payment testing
9. THE Documentation_System SHALL document Ollama model management
10. THE Documentation_System SHALL document production deployment considerations

