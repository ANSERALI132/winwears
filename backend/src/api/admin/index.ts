/**
 * Everything under /api/admin.
 *
 * The guard is applied once, here, rather than per route file — one place to
 * read, and no way for a new endpoint to be added without it.
 */
import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { adminProductsRouter } from './products';
import { adminCategoriesRouter } from './categories';
import { adminImagesRouter } from './images';
import { adminQuotesRouter, adminMessagesRouter } from './enquiries';
import { adminStatsRouter, adminSettingsRouter, adminUsersRouter, adminActivityRouter } from './system';
import { adminPortabilityRouter } from './portability';
import { adminKnowledgeRouter } from './knowledge';

export const adminRouter = Router();

adminRouter.use(requireAuth);

adminRouter.use('/stats', adminStatsRouter);
adminRouter.use('/products/:productId/images', adminImagesRouter);
adminRouter.use('/products', adminProductsRouter);
adminRouter.use('/categories', adminCategoriesRouter);
adminRouter.use('/quotes', adminQuotesRouter);
adminRouter.use('/messages', adminMessagesRouter);
adminRouter.use('/settings', adminSettingsRouter);
adminRouter.use('/users', adminUsersRouter);
adminRouter.use('/activity', adminActivityRouter);
adminRouter.use('/portability', adminPortabilityRouter);
adminRouter.use('/ai/knowledge', adminKnowledgeRouter);
