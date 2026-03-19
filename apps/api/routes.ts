// Re-export from new modular route structure
// This file is kept for backwards compatibility during the transition
// All routes have been moved to src/routes/

export { registerRoutes } from './src/routes/index.js';

// Also export middleware for use in other files
export { requireAuth, verifyClientAccess, verifyResourceOwnership } from './src/middleware/auth.js';
