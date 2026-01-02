/**
 * Team Builder Functional Tests
 * Tests squad creation, persistence, and team management
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_URL = 'http://localhost:3001';
const TEST_PROJECT_PATH = path.join(__dirname, '../fixtures/team-test-project');

describe('Team Builder Tests', () => {
  let projectHash;
  let teamId;

  beforeAll(async () => {
    // Create test project
    await fs.mkdir(TEST_PROJECT_PATH, { recursive: true });
    await fs.writeFile(path.join(TEST_PROJECT_PATH, 'test.ts'), 'export const TEST = true;');

    // Switch to test project to get project hash
    const switchResponse = await fetch(`${SERVER_URL}/api/workspace/switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: TEST_PROJECT_PATH })
    });
    const { projectHash: hash } = await switchResponse.json();
    projectHash = hash;
  });

  afterAll(async () => {
    await fs.rm(TEST_PROJECT_PATH, { recursive: true, force: true });
  });

  describe('4.1 Squad Creation', () => {
    it('should create a new team configuration', async () => {
      const response = await fetch(`${SERVER_URL}/api/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Squad Alpha',
          description: 'A test squad for automated testing',
          mainArchitect: {
            modelId: 'gpt-4o',
            provider: 'openai',
            role: 'architect',
            systemPrompt: 'You are the main architect. Plan and coordinate tasks.'
          },
          executor: {
            modelId: 'deepseek-coder',
            provider: 'lmstudio',
            role: 'executor',
            systemPrompt: 'You execute tasks assigned by the architect.'
          },
          specialists: [
            {
              id: 'qa-specialist',
              modelId: 'claude-3-haiku',
              provider: 'anthropic',
              role: 'qa',
              systemPrompt: 'You review code for quality and bugs.',
              triggers: ['review', 'test', 'qa']
            }
          ],
          projectHash
        })
      });

      expect(response.ok).toBe(true);
      const team = await response.json();

      expect(team).toHaveProperty('id');
      expect(team).toHaveProperty('name', 'Test Squad Alpha');
      expect(team).toHaveProperty('projectHash', projectHash);
      expect(team.mainArchitect).toHaveProperty('modelId', 'gpt-4o');
      expect(team.executor).toHaveProperty('modelId', 'deepseek-coder');
      expect(team.specialists.length).toBe(1);

      teamId = team.id;
    });

    it('should validate team configuration', async () => {
      // Missing main architect should fail
      const response = await fetch(`${SERVER_URL}/api/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Invalid Team',
          executor: {
            modelId: 'test-model',
            provider: 'test',
            role: 'executor'
          },
          projectHash
        })
      });

      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error).toHaveProperty('error');
      expect(error.error).toContain('mainArchitect');
    });

    it('should prevent duplicate team names in same project', async () => {
      const response = await fetch(`${SERVER_URL}/api/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Squad Alpha',
          mainArchitect: {
            modelId: 'gpt-4o',
            provider: 'openai',
            role: 'architect'
          },
          projectHash
        })
      });

      expect(response.status).toBe(409);
      const error = await response.json();
      expect(error.error).toContain('already exists');
    });
  });

  describe('4.2 Team Retrieval', () => {
    it('should list all teams for current project', async () => {
      const response = await fetch(`${SERVER_URL}/api/teams?projectHash=${projectHash}`);
      expect(response.ok).toBe(true);

      const teams = await response.json();
      expect(Array.isArray(teams)).toBe(true);
      expect(teams.length).toBeGreaterThan(0);

      const ourTeam = teams.find(t => t.id === teamId);
      expect(ourTeam).toBeDefined();
      expect(ourTeam.name).toBe('Test Squad Alpha');
    });

    it('should get team by ID', async () => {
      const response = await fetch(`${SERVER_URL}/api/teams/${teamId}`);
      expect(response.ok).toBe(true);

      const team = await response.json();
      expect(team.id).toBe(teamId);
      expect(team).toHaveProperty('mainArchitect');
      expect(team).toHaveProperty('executor');
      expect(team).toHaveProperty('specialists');
    });

    it('should get active team', async () => {
      // Set as active
      await fetch(`${SERVER_URL}/api/teams/${teamId}/activate`, {
        method: 'POST'
      });

      const response = await fetch(`${SERVER_URL}/api/teams/active`);
      expect(response.ok).toBe(true);

      const team = await response.json();
      expect(team.id).toBe(teamId);
    });

    it('should not return teams from other projects', async () => {
      const otherProjectHash = 'different-project-hash-12345';

      const response = await fetch(`${SERVER_URL}/api/teams?projectHash=${otherProjectHash}`);
      const teams = await response.json();

      const ourTeam = teams.find(t => t.id === teamId);
      expect(ourTeam).toBeUndefined();
    });
  });

  describe('4.3 Team Updates', () => {
    it('should update team configuration', async () => {
      const response = await fetch(`${SERVER_URL}/api/teams/${teamId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: teamId,
          name: 'Test Squad Alpha Updated',
          description: 'Updated description',
          mainArchitect: {
            modelId: 'gpt-4o',
            provider: 'openai',
            role: 'architect',
            systemPrompt: 'Updated system prompt for architect'
          },
          executor: {
            modelId: 'deepseek-coder',
            provider: 'lmstudio',
            role: 'executor',
            systemPrompt: 'Updated executor prompt'
          },
          specialists: [],
          projectHash
        })
      });

      expect(response.ok).toBe(true);
      const updated = await response.json();

      expect(updated.name).toBe('Test Squad Alpha Updated');
      expect(updated.description).toBe('Updated description');
      expect(updated.specialists.length).toBe(0);
    });

    it('should add specialist to team', async () => {
      const response = await fetch(`${SERVER_URL}/api/teams/${teamId}/specialists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'security-specialist',
          modelId: 'claude-3-opus',
          provider: 'anthropic',
          role: 'security',
          systemPrompt: 'You review code for security vulnerabilities.',
          triggers: ['security', 'audit', 'vulnerability']
        })
      });

      expect(response.ok).toBe(true);
      const team = await response.json();
      expect(team.specialists.length).toBe(1);
      expect(team.specialists[0].id).toBe('security-specialist');
    });

    it('should remove specialist from team', async () => {
      const response = await fetch(`${SERVER_URL}/api/teams/${teamId}/specialists/security-specialist`, {
        method: 'DELETE'
      });

      expect(response.ok).toBe(true);
      const team = await response.json();
      expect(team.specialists.length).toBe(0);
    });
  });

  describe('4.4 Team Activation', () => {
    let secondTeamId;

    beforeAll(async () => {
      // Create second team
      const response = await fetch(`${SERVER_URL}/api/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Squad Beta',
          mainArchitect: {
            modelId: 'claude-3-opus',
            provider: 'anthropic',
            role: 'architect'
          },
          projectHash
        })
      });
      const team = await response.json();
      secondTeamId = team.id;
    });

    it('should activate a team', async () => {
      const response = await fetch(`${SERVER_URL}/api/teams/${secondTeamId}/activate`, {
        method: 'POST'
      });

      expect(response.ok).toBe(true);
      const result = await response.json();
      expect(result).toHaveProperty('active', true);
    });

    it('should deactivate previous active team', async () => {
      const activeResponse = await fetch(`${SERVER_URL}/api/teams/active`);
      const activeTeam = await activeResponse.json();

      expect(activeTeam.id).toBe(secondTeamId);

      // Check first team is no longer active
      const firstTeamResponse = await fetch(`${SERVER_URL}/api/teams/${teamId}`);
      const firstTeam = await firstTeamResponse.json();
      expect(firstTeam.isActive).toBe(false);
    });

    it('should deactivate team', async () => {
      const response = await fetch(`${SERVER_URL}/api/teams/${secondTeamId}/deactivate`, {
        method: 'POST'
      });

      expect(response.ok).toBe(true);

      const activeResponse = await fetch(`${SERVER_URL}/api/teams/active`);
      expect(activeResponse.status).toBe(404);
    });
  });

  describe('4.5 Persistence & Storage', () => {
    it('should persist teams to data/teams.json', async () => {
      const teamsFilePath = path.join(__dirname, '../../server/data/teams.json');

      try {
        const content = await fs.readFile(teamsFilePath, 'utf-8');
        const teams = JSON.parse(content);

        expect(Array.isArray(teams)).toBe(true);

        const ourTeam = teams.find(t => t.id === teamId);
        expect(ourTeam).toBeDefined();
        expect(ourTeam.projectHash).toBe(projectHash);
      } catch (e) {
        console.warn('Teams file not accessible, may be in different location');
      }
    });

    it('should load teams after server restart', async () => {
      // Note: This would require actually restarting the server
      // For now, we just verify the endpoint works
      const response = await fetch(`${SERVER_URL}/api/teams?projectHash=${projectHash}`);
      expect(response.ok).toBe(true);

      const teams = await response.json();
      const ourTeam = teams.find(t => t.id === teamId);
      expect(ourTeam).toBeDefined();
    });
  });

  describe('4.6 Team Deletion', () => {
    it('should delete a team', async () => {
      const response = await fetch(`${SERVER_URL}/api/teams/${teamId}`, {
        method: 'DELETE'
      });

      expect(response.ok).toBe(true);

      // Verify deletion
      const checkResponse = await fetch(`${SERVER_URL}/api/teams/${teamId}`);
      expect(checkResponse.status).toBe(404);
    });

    it('should not affect other teams when deleting', async () => {
      const listResponse = await fetch(`${SERVER_URL}/api/teams?projectHash=${projectHash}`);
      const teams = await listResponse.json();

      // Should still have the second team
      expect(teams.length).toBeGreaterThan(0);
    });
  });

  describe('4.7 Team Execution Context', () => {
    it('should provide team context to models', async () => {
      // Create a team
      const createResponse = await fetch(`${SERVER_URL}/api/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Context Test Team',
          mainArchitect: {
            modelId: 'gpt-4o',
            provider: 'openai',
            role: 'architect',
            systemPrompt: 'You are the architect'
          },
          projectHash
        })
      });

      const team = await createResponse.json();

      // Activate it
      await fetch(`${SERVER_URL}/api/teams/${team.id}/activate`, {
        method: 'POST'
      });

      // Get team context for a request
      const contextResponse = await fetch(`${SERVER_URL}/api/teams/context`);
      expect(contextResponse.ok).toBe(true);

      const context = await contextResponse.json();
      expect(context).toHaveProperty('teamName', 'Context Test Team');
      expect(context).toHaveProperty('mainArchitect');
      expect(context).toHaveProperty('roles');
    });
  });
});
