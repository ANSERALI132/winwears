/**
 * Everything under /api/admin.
 *
 * The guard is applied once, here, rather than per route file Ã¢â‚¬â€ one place to
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
import { adminAiRouter } from './ai';
import { adminCrmRouter } from './crm';
import { adminDashboardRouter } from './dashboard';
import { adminRfqRouter } from './rfq';
import { adminQuotationsRouter } from './quotations';
import { adminOrdersRouter } from './orders';
import { adminProductionRouter } from './production';
import { adminQcRouter } from './qc';

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
/* Knowledge first: /ai/knowledge must not be swallowed by /ai. */
adminRouter.use('/ai/knowledge', adminKnowledgeRouter);
adminRouter.use('/ai', adminAiRouter);
adminRouter.use('/crm', adminCrmRouter);
adminRouter.use('/dashboard', adminDashboardRouter);
adminRouter.use('/rfq', adminRfqRouter);
adminRouter.use('/quotations', adminQuotationsRouter);
adminRouter.use('/orders', adminOrdersRouter);
adminRouter.use('/production', adminProductionRouter);
adminRouter.use('/qc', adminQcRouter);
