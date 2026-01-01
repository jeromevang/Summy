# AGENTS.md - Summy Project Guidelines

This document provides comprehensive guidelines for agentic coding assistants working on the Summy project. Summy is a context management middleware for LLM conversations with React/TypeScript frontend, Express API server, RAG server, and MCP server components.

## Build/Lint/Test Commands

### Root Level Commands
- **Install dependencies**: `npm install`
- **Run all tests**: `npm test` (vitest run)
- **Run tests in watch mode**: `npm run test:watch` (vitest)
- **Build all workspaces**: `npm run build`
- **Start development servers**: `npm run dev` (runs server, client, RAG, and MCP servers concurrently)
- **Kill all processes**: `npm run kill`

### Workspace-Specific Commands

#### Client (React/TypeScript frontend)
- **Development server**: `npm run dev` (Vite on port 5173)
- **Build**: `npm run build` (Vite build)
- **Preview**: `npm run preview`

#### Server (Express API server)
- **Development server**: `npm run dev` (tsx watch on port 3001)
- **Build**: `npm run build` (TypeScript compilation)
- **Start production**: `npm run start` (node dist/index.js)
- **Dashboard**: `npm run dashboard` (CLI dashboard)

#### RAG Server (Semantic search)
- **Development server**: `npm run dev` (port 3002)

#### MCP Server (Tool integrations)
- **Development server**: `npm run dev`
- **Cursor tools**: `npm run dev:cursor-tools`
- **Continue tools**: `npm run dev:continue-tools`

### Testing Commands
- **Run all tests**: `npm test`
- **Run single test file**: `npx vitest run path/to/file.test.ts`
- **Run tests in watch mode**: `npm run test:watch`
- **Run tests with coverage**: `npx vitest run --coverage`

Test configuration (vitest.config.ts):
- Globals enabled
- Node environment
- Includes `**/*.{test,spec}.{ts,js}`
- Excludes client directory (needs jsdom for React testing)

## Code Style Guidelines

### TypeScript Configuration
- **Strict mode enabled** with all strict checks
- **ES2020+ target** for server, **ES2022** for client
- **ES modules** (type: "module")
- **Declaration files and source maps** generated
- **No unused locals/parameters** allowed
- **Experimental decorators** enabled

### Import Organization
```typescript
// 1. Node.js built-ins
import fs from 'fs';
import path from 'path';

// 2. Third-party libraries
import express from 'express';
import { z } from 'zod';
import axios from 'axios';

// 3. Local imports (relative)
import { validateSchema } from '../middleware/validation.js';
import type { ContextMessage } from './db/db-context.js';

// 4. Aliased imports (configured in tsconfig/vite)
import { db } from '@/services/database';
```

### Naming Conventions
- **Files**: kebab-case for directories, camelCase for files (`database-service.ts`)
- **Classes**: PascalCase (`DatabaseService`, `ValidationMiddleware`)
- **Functions/Methods**: camelCase (`validateSchema`, `createRateLimit`)
- **Constants**: UPPER_SNAKE_CASE (`TOOL_SCHEMAS`, `DEFAULT_PORT`)
- **Types/Interfaces**: PascalCase with descriptive names (`ContextMessage`, `ServerSettings`)
- **Variables**: camelCase (`userInput`, `responseData`)
- **Private properties**: camelCase with underscore prefix (`_dbConnection`)

### React Component Guidelines
- **Functional components** with hooks (no class components)
- **TypeScript interfaces** for props
- **Custom hooks** for shared logic
- **Event handlers** prefixed with `handle` (`handleSubmit`, `handleChange`)
- **Effect dependencies** explicitly listed

```tsx
interface UserProfileProps {
  userId: string;
  onUpdate: (user: User) => void;
}

const UserProfile: React.FC<UserProfileProps> = ({ userId, onUpdate }) => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    fetchUser(userId).then(setUser);
  }, [userId]);

  const handleUpdate = (updatedUser: User) => {
    setUser(updatedUser);
    onUpdate(updatedUser);
  };

  return (
    <div>
      {/* Component JSX */}
    </div>
  );
};
```

### Error Handling
- **Explicit error handling** required
- **Try/catch blocks** for async operations
- **Zod schemas** for input validation
- **Custom error types** with descriptive messages
- **Logging** of errors with context

```typescript
export async function processUserRequest(input: unknown): Promise<Result> {
  try {
    const validatedInput = userRequestSchema.parse(input);
    const result = await processValidatedInput(validatedInput);

    logger.info('User request processed successfully', {
      userId: validatedInput.userId,
      operation: 'processUserRequest'
    });

    return result;
  } catch (error) {
    if (error instanceof ZodError) {
      logger.warn('Invalid user request input', {
        errors: error.errors,
        input: JSON.stringify(input).slice(0, 500)
      });
      throw new ValidationError('Invalid request format', error.errors);
    }

    logger.error('Failed to process user request', {
      error: error.message,
      stack: error.stack
    });
    throw new ProcessingError('Internal processing error', { cause: error });
  }
}
```

### Async/Await Patterns
- **Async/await** preferred over Promises
- **Promise.all** for concurrent operations
- **Proper error propagation** in async chains

```typescript
export async function initializeServices(): Promise<void> {
  try {
    const [dbConnection, cacheConnection] = await Promise.all([
      connectToDatabase(),
      connectToCache()
    ]);

    await Promise.all([
      dbConnection.migrate(),
      cacheConnection.warmup()
    ]);

    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error('Service initialization failed', { error: error.message });
    throw error;
  }
}
```

### Documentation
- **JSDoc comments** for public APIs
- **TypeScript types** as primary documentation
- **Inline comments** for complex logic
- **README files** for module-level documentation

```typescript
/**
 * Validates and processes a user request
 * @param input - Raw input data from the client
 * @returns Promise resolving to processed result
 * @throws ValidationError if input validation fails
 * @throws ProcessingError if business logic fails
 */
export async function processUserRequest(input: unknown): Promise<Result> {
  // Complex validation logic here
  const validatedInput = validateInput(input);

  // Business logic processing
  return await processValidatedInput(validatedInput);
}
```

### Database/Service Layer Patterns
- **Repository pattern** for data access
- **Service classes** for business logic
- **Dependency injection** through constructor parameters
- **Interface segregation** for clean APIs

```typescript
interface UserRepository {
  findById(id: string): Promise<User | null>;
  save(user: User): Promise<void>;
}

class UserService {
  constructor(private readonly userRepo: UserRepository) {}

  async getUserProfile(userId: string): Promise<UserProfile> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError(`User ${userId} not found`);
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt
    };
  }
}
```

### Testing Patterns
- **Vitest** with globals enabled
- **Descriptive test names** (`describe`, `it`)
- **Arrange-Act-Assert** pattern
- **Mock external dependencies**
- **Test error conditions** and edge cases

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('UserService', () => {
  describe('getUserProfile', () => {
    it('should return user profile for valid user', async () => {
      // Arrange
      const mockRepo = {
        findById: vi.fn().mockResolvedValue({
          id: '123',
          name: 'John Doe',
          email: 'john@example.com',
          createdAt: new Date()
        })
      };
      const service = new UserService(mockRepo);

      // Act
      const result = await service.getUserProfile('123');

      // Assert
      expect(result).toEqual({
        id: '123',
        name: 'John Doe',
        email: 'john@example.com',
        createdAt: expect.any(Date)
      });
      expect(mockRepo.findById).toHaveBeenCalledWith('123');
    });

    it('should throw NotFoundError for non-existent user', async () => {
      const mockRepo = {
        findById: vi.fn().mockResolvedValue(null)
      };
      const service = new UserService(mockRepo);

      await expect(service.getUserProfile('999'))
        .rejects
        .toThrow(NotFoundError);
    });
  });
});
```

## Cursor Rules Integration

### Project Overview
Summy consists of:
- React/TypeScript frontend (port 5173)
- Express API server (port 3001)
- RAG server for semantic code search (port 3002)
- MCP server for tool integrations

### Memory System
- **WORKING_MEMORY.md**: Project-specific context that persists between sessions
- **GLOBAL_MEMORY.md**: Cross-project user preferences

**Always check WORKING_MEMORY.md first** when starting work on this project.

### When to Update Memory Files
Update WORKING_MEMORY.md when:
- Tasks complete
- Conversations exceed 5-10 turns
- Before switching tasks
- At natural stopping points

### Coding Standards (from .cursorrules)
- Use TypeScript for all new code
- Prefer functional components with hooks in React
- Use async/await over promises
- Error handling should be explicit
- Update memory files proactively

### Important Paths
- `server/src/` - Express API server
- `client/src/` - React frontend
- `rag-server/src/` - RAG/embeddings server
- `mcp-server/src/` - MCP tools server

## Development Workflow

### 1. Environment Setup
```bash
npm install
npm run build
```

### 2. Development
```bash
# Start all services
npm run dev

# Or start individual services
npm run dev:server
npm run dev:client
npm run dev:rag
npm run dev:mcp
```

### 3. Testing
```bash
# Run all tests
npm test

# Run specific test
npx vitest run server/src/__tests__/validation.test.ts

# Watch mode
npm run test:watch
```

### 4. Building
```bash
# Build all workspaces
npm run build

# Build individual workspaces
npm run build:server
npm run build:client
npm run build:rag
npm run build:mcp
```

### 5. Code Quality
- TypeScript compilation ensures type safety
- Vitest ensures functionality
- Manual code review for style consistency

## Commit Guidelines

### Commit Message Format
```
type(scope): description

[optional body]

[optional footer]
```

### Types
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance tasks

### Examples
```
feat(auth): add user registration endpoint
fix(validation): handle empty input gracefully
refactor(database): migrate to new schema structure
test(api): add integration tests for user routes
```

## Security Considerations

### Input Validation
- Use Zod schemas for all external inputs
- Sanitize user inputs to prevent XSS
- Implement rate limiting on API endpoints

### Error Handling
- Never expose internal errors to clients
- Log errors with appropriate context
- Use custom error types for different failure modes

### Secrets Management
- Never commit secrets to repository
- Use environment variables for configuration
- Validate all configuration on startup

## Performance Guidelines

### Frontend
- Use React.memo for expensive components
- Implement proper loading states
- Optimize bundle size with code splitting

### Backend
- Use connection pooling for databases
- Implement caching where appropriate
- Monitor memory usage and response times

### Database
- Use indexes for frequently queried fields
- Implement pagination for large result sets
- Use transactions for data consistency</content>
<parameter name="filePath">C:\Users\Jerome\Documents\Projects\Summy\AGENTS.md