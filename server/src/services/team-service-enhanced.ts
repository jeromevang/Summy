/**
 * Enhanced Team Service - Full CRUD operations with database backend
 */

import { db } from '../../../database/src/db/client.js';
import { teams } from '../../../database/src/db/schema.js';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

export interface TeamMember {
  modelId: string;
  provider: string;
  role: string;
  systemPrompt?: string;
}

export interface Specialist extends TeamMember {
  id: string;
  triggers: string[];
}

export interface Team {
  id: string;
  projectHash: string;
  name: string;
  description?: string;
  mainArchitect: TeamMember;
  executor?: TeamMember;
  specialists: Specialist[];
  isActive: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

export class TeamServiceEnhanced {
  /**
   * Create a new team
   */
  async createTeam(data: Omit<Team, 'id' | 'createdAt' | 'updatedAt'>): Promise<Team> {
    const id = crypto.randomUUID();
    const now = new Date();

    // Validate required fields
    if (!data.name || !data.mainArchitect) {
      throw new Error('Team name and main architect are required');
    }

    // Check for duplicate name in project
    const existing = await this.listTeams(data.projectHash);
    if (existing.some(t => t.name === data.name)) {
      throw new Error(`Team "${data.name}" already exists in this project`);
    }

    // If this is set as active, deactivate others
    if (data.isActive) {
      await this.deactivateAll(data.projectHash);
    }

    const team: Team = {
      id,
      ...data,
      createdAt: now,
      updatedAt: now
    };

    await db.insert(teams).values({
      id: team.id,
      projectHash: team.projectHash,
      name: team.name,
      description: team.description,
      mainArchitect: JSON.stringify(team.mainArchitect),
      executor: team.executor ? JSON.stringify(team.executor) : null,
      specialists: JSON.stringify(team.specialists),
      isActive: team.isActive,
      createdAt: team.createdAt,
      updatedAt: now
    });

    return team;
  }

  /**
   * Get team by ID
   */
  async getTeam(id: string): Promise<Team | null> {
    const result = await db.select().from(teams).where(eq(teams.id, id)).limit(1);

    if (result.length === 0) {
      return null;
    }

    return this.rowToTeam(result[0]);
  }

  /**
   * List all teams, optionally filtered by project
   */
  async listTeams(projectHash?: string): Promise<Team[]> {
    const results = projectHash
      ? await db.select().from(teams).where(eq(teams.projectHash, projectHash))
      : await db.select().from(teams);

    return results.map(r => this.rowToTeam(r));
  }

  /**
   * Update team
   */
  async updateTeam(id: string, updates: Partial<Omit<Team, 'id' | 'createdAt'>>): Promise<Team> {
    const existing = await this.getTeam(id);
    if (!existing) {
      throw new Error(`Team ${id} not found`);
    }

    // If activating, deactivate others in same project
    if (updates.isActive && !existing.isActive) {
      await this.deactivateAll(existing.projectHash);
    }

    const now = new Date();
    const updateData: any = {
      updatedAt: now
    };

    if (updates.name) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.mainArchitect) updateData.mainArchitect = JSON.stringify(updates.mainArchitect);
    if (updates.executor !== undefined) {
      updateData.executor = updates.executor ? JSON.stringify(updates.executor) : null;
    }
    if (updates.specialists) updateData.specialists = JSON.stringify(updates.specialists);
    if (updates.isActive !== undefined) updateData.isActive = updates.isActive;

    await db.update(teams).set(updateData).where(eq(teams.id, id));

    return this.getTeam(id) as Promise<Team>;
  }

  /**
   * Delete team
   */
  async deleteTeam(id: string): Promise<boolean> {
    const result = await db.delete(teams).where(eq(teams.id, id));
    return true;
  }

  /**
   * Activate a team (deactivates others in same project)
   */
  async activateTeam(id: string): Promise<void> {
    const team = await this.getTeam(id);
    if (!team) {
      throw new Error(`Team ${id} not found`);
    }

    // Deactivate all others in project
    await this.deactivateAll(team.projectHash);

    // Activate this one
    await db.update(teams)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(teams.id, id));
  }

  /**
   * Deactivate a team
   */
  async deactivateTeam(id: string): Promise<void> {
    await db.update(teams)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(teams.id, id));
  }

  /**
   * Get active team for project
   */
  async getActiveTeam(projectHash: string): Promise<Team | null> {
    const result = await db.select()
      .from(teams)
      .where(and(
        eq(teams.projectHash, projectHash),
        eq(teams.isActive, true)
      ))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return this.rowToTeam(result[0]);
  }

  /**
   * Add specialist to team
   */
  async addSpecialist(teamId: string, specialist: Specialist): Promise<Team> {
    const team = await this.getTeam(teamId);
    if (!team) {
      throw new Error(`Team ${teamId} not found`);
    }

    // Check if specialist with same ID exists
    if (team.specialists.some(s => s.id === specialist.id)) {
      throw new Error(`Specialist ${specialist.id} already exists in team`);
    }

    team.specialists.push(specialist);

    await db.update(teams)
      .set({
        specialists: JSON.stringify(team.specialists),
        updatedAt: new Date()
      })
      .where(eq(teams.id, teamId));

    return this.getTeam(teamId) as Promise<Team>;
  }

  /**
   * Remove specialist from team
   */
  async removeSpecialist(teamId: string, specialistId: string): Promise<Team> {
    const team = await this.getTeam(teamId);
    if (!team) {
      throw new Error(`Team ${teamId} not found`);
    }

    team.specialists = team.specialists.filter(s => s.id !== specialistId);

    await db.update(teams)
      .set({
        specialists: JSON.stringify(team.specialists),
        updatedAt: new Date()
      })
      .where(eq(teams.id, teamId));

    return this.getTeam(teamId) as Promise<Team>;
  }

  /**
   * Get team execution context (for providing to models)
   */
  async getTeamContext(projectHash: string): Promise<any> {
    const team = await this.getActiveTeam(projectHash);

    if (!team) {
      return null;
    }

    return {
      teamName: team.name,
      teamDescription: team.description,
      mainArchitect: {
        model: team.mainArchitect.modelId,
        role: 'architect',
        responsibilities: 'Planning, coordination, decision-making'
      },
      executor: team.executor ? {
        model: team.executor.modelId,
        role: 'executor',
        responsibilities: 'Task execution, implementation'
      } : null,
      specialists: team.specialists.map(s => ({
        id: s.id,
        model: s.modelId,
        role: s.role,
        triggers: s.triggers
      })),
      roles: this.getRoleDescriptions(team)
    };
  }

  /**
   * Deactivate all teams in a project
   */
  private async deactivateAll(projectHash: string): Promise<void> {
    await db.update(teams)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(teams.projectHash, projectHash));
  }

  /**
   * Convert database row to Team object
   */
  private rowToTeam(row: any): Team {
    return {
      id: row.id,
      projectHash: row.project_hash,
      name: row.name,
      description: row.description,
      mainArchitect: JSON.parse(row.main_architect),
      executor: row.executor ? JSON.parse(row.executor) : undefined,
      specialists: JSON.parse(row.specialists || '[]'),
      isActive: Boolean(row.is_active),
      createdAt: new Date(row.created_at * 1000),
      updatedAt: row.updated_at ? new Date(row.updated_at * 1000) : undefined
    };
  }

  /**
   * Get role descriptions for context
   */
  private getRoleDescriptions(team: Team): Record<string, string> {
    const roles: Record<string, string> = {
      architect: 'Plans and coordinates all tasks, makes high-level decisions'
    };

    if (team.executor) {
      roles.executor = 'Executes tasks assigned by architect, implements solutions';
    }

    team.specialists.forEach(s => {
      roles[s.role] = `Specialist for ${s.role}, triggers: ${s.triggers.join(', ')}`;
    });

    return roles;
  }
}

export const teamServiceEnhanced = new TeamServiceEnhanced();
