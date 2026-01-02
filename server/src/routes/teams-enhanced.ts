/**
 * Enhanced Teams API Routes - Full CRUD operations
 */

import { Router, Request, Response } from 'express';
import { teamServiceEnhanced } from '../services/team-service-enhanced.js';
import { validateSchema } from '../middleware/validation.js';
import { z } from 'zod';

const router: Router = Router();

// Validation schemas
const teamMemberSchema = z.object({
  modelId: z.string().min(1),
  provider: z.string().min(1),
  role: z.string().min(1),
  systemPrompt: z.string().optional()
});

const specialistSchema = teamMemberSchema.extend({
  id: z.string().min(1),
  triggers: z.array(z.string())
});

const createTeamSchema = z.object({
  projectHash: z.string().min(1),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  mainArchitect: teamMemberSchema,
  executor: teamMemberSchema.optional(),
  specialists: z.array(specialistSchema).default([]),
  isActive: z.boolean().default(false)
});

const updateTeamSchema = createTeamSchema.partial().omit({ projectHash: true });

/**
 * GET /api/teams
 * List all teams, optionally filtered by projectHash
 */
router.get('/teams', async (req: Request, res: Response) => {
  try {
    const { projectHash } = req.query;
    const teams = await teamServiceEnhanced.listTeams(projectHash as string);
    return res.json(teams);
  } catch (error: any) {
    console.error('[Teams API] List error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/teams/:id
 * Get specific team by ID
 */
router.get('/teams/:id', async (req: Request, res: Response) => {
  try {
    const team = await teamServiceEnhanced.getTeam(req.params.id!);

    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    return res.json(team);
  } catch (error: any) {
    console.error('[Teams API] Get error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/teams/active
 * Get active team for a project
 */
router.get('/teams/active', async (req: Request, res: Response) => {
  try {
    const { projectHash } = req.query;

    if (!projectHash) {
      return res.status(400).json({ error: 'projectHash query parameter required' });
    }

    const team = await teamServiceEnhanced.getActiveTeam(projectHash as string);

    if (!team) {
      return res.status(404).json({ error: 'No active team found' });
    }

    return res.json(team);
  } catch (error: any) {
    console.error('[Teams API] Get active error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/teams
 * Create a new team
 */
router.post('/teams', validateSchema(createTeamSchema), async (req: Request, res: Response) => {
  try {
    const team = await teamServiceEnhanced.createTeam(req.body);
    return res.status(201).json(team);
  } catch (error: any) {
    console.error('[Teams API] Create error:', error);

    if (error.message.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }

    return res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /api/teams/:id
 * Update a team
 */
router.put('/teams/:id', validateSchema(updateTeamSchema), async (req: Request, res: Response) => {
  try {
    const team = await teamServiceEnhanced.updateTeam(req.params.id!, req.body);
    return res.json(team);
  } catch (error: any) {
    console.error('[Teams API] Update error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    return res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/teams/:id
 * Delete a team
 */
router.delete('/teams/:id', async (req: Request, res: Response) => {
  try {
    const success = await teamServiceEnhanced.deleteTeam(req.params.id!);
    return res.json({ success });
  } catch (error: any) {
    console.error('[Teams API] Delete error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/teams/:id/activate
 * Activate a team (deactivates others in same project)
 */
router.post('/teams/:id/activate', async (req: Request, res: Response) => {
  try {
    await teamServiceEnhanced.activateTeam(req.params.id!);
    return res.json({ success: true, active: true });
  } catch (error: any) {
    console.error('[Teams API] Activate error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/teams/:id/deactivate
 * Deactivate a team
 */
router.post('/teams/:id/deactivate', async (req: Request, res: Response) => {
  try {
    await teamServiceEnhanced.deactivateTeam(req.params.id!);
    return res.json({ success: true, active: false });
  } catch (error: any) {
    console.error('[Teams API] Deactivate error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/teams/:id/specialists
 * Add a specialist to team
 */
router.post('/teams/:id/specialists', validateSchema(z.object({ specialist: specialistSchema })), async (req: Request, res: Response) => {
  try {
    const team = await teamServiceEnhanced.addSpecialist(req.params.id!, req.body.specialist);
    return res.json(team);
  } catch (error: any) {
    console.error('[Teams API] Add specialist error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    if (error.message.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }

    return res.status(400).json({ error: error.message });
  }
});

/**
 * DELETE /api/teams/:id/specialists/:specialistId
 * Remove a specialist from team
 */
router.delete('/teams/:id/specialists/:specialistId', async (req: Request, res: Response) => {
  try {
    const team = await teamServiceEnhanced.removeSpecialist(req.params.id!, req.params.specialistId!);
    return res.json(team);
  } catch (error: any) {
    console.error('[Teams API] Remove specialist error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    return res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/teams/context
 * Get team execution context for current project
 */
router.get('/teams/context', async (req: Request, res: Response) => {
  try {
    const { projectHash } = req.query;

    if (!projectHash) {
      return res.status(400).json({ error: 'projectHash query parameter required' });
    }

    const context = await teamServiceEnhanced.getTeamContext(projectHash as string);

    if (!context) {
      return res.status(404).json({ error: 'No active team found' });
    }

    return res.json(context);
  } catch (error: any) {
    console.error('[Teams API] Get context error:', error);
    return res.status(500).json({ error: error.message });
  }
});

export const teamsEnhancedRouter = router;
