/**
 * Agents Router - Handle agent data and monitoring
 */

import { publicProcedure, router } from '../_core/trpc';
import { z } from 'zod';

export const agentsRouter = router({
  // Get list of currently monitored agents
  list: publicProcedure.query(async () => {
    // TODO: Fetch from database or cache
    return [];
  }),

  // Get agent details
  getById: publicProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    // TODO: Fetch from database
    return null;
  }),

  // Start monitoring Claude Code directory
  startMonitoring: publicProcedure.mutation(async () => {
    // TODO: Start file system watcher
    return { success: true, message: 'Monitoring started' };
  }),

  // Stop monitoring
  stopMonitoring: publicProcedure.mutation(async () => {
    // TODO: Stop file system watcher
    return { success: true, message: 'Monitoring stopped' };
  }),
});
