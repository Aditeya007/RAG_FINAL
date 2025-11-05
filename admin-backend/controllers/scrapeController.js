const crypto = require('crypto');
const axios = require('axios');
const { runTenantScrape, runTenantUpdater } = require('../jobs/scrapeJob');
const { getUserTenantContext } = require('../services/userContextService');

const buildJobId = (prefix, resourceId) => {
  const random = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(8).toString('hex');
  return `${prefix}_${resourceId || 'tenant'}_${random}`;
};

/**
 * Mark bot data as updated after scraping/updating (LIGHTWEIGHT - no restart needed!)
 * This sets a "dirty flag" so the next chat request will auto-reload the vector store.
 * Much faster than destroying and recreating the bot instance.
 */
const refreshBotCache = async (tenantContext, forceInvalidate = true) => {
  try {
    const botEndpoint = tenantContext.botEndpoint || process.env.FASTAPI_BOT_URL || 'http://localhost:8000';
    const sharedSecret = process.env.FASTAPI_SHARED_SECRET;
    
    // Use the lightweight "mark dirty" endpoint instead of full refresh
    const refreshUrl = `${botEndpoint}/mark-data-updated`;
    const params = {
      resource_id: tenantContext.resourceId,
      vector_store_path: tenantContext.vectorStorePath,
      database_uri: tenantContext.databaseUri
    };

    console.log(`🚩 Marking data as updated for resource: ${tenantContext.resourceId}`);
    console.log(`   Next chat request will auto-reload vector store (no restart needed!)`);
    
    const response = await axios.post(refreshUrl, null, {
      params,
      headers: sharedSecret ? { 'X-Service-Secret': sharedSecret } : {},
      timeout: 5000 // 5 second timeout (much faster now)
    });

    if (response.data && response.data.status === 'success') {
      console.log(`✅ Data marked as updated! Next chat will use fresh data.`);
      return { success: true, message: response.data.message };
    } else {
      console.warn('⚠️  Mark data updated returned unexpected response:', response.data);
      return { success: false, error: 'Unexpected response from bot service' };
    }
  } catch (err) {
    console.error('❌ Failed to mark data updated:', err.message);
    // Don't fail the scrape job if marking fails
    return { success: false, error: err.message };
  }
};

const truncateLog = (value) => {
  if (!value) {
    return value;
  }
  const maxLength = 8_192;
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}\n... [truncated ${value.length - maxLength} chars]`;
};

const ensureTenantResources = (tenantContext) => {
  if (!tenantContext.vectorStorePath || !tenantContext.resourceId) {
    const error = new Error('Tenant resources are incomplete. Re-provision before running scrape.');
    error.statusCode = 503;
    throw error;
  }
};

const toBooleanOrUndefined = (value) => {
  if (typeof value === 'undefined' || value === null) {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }
  return undefined;
};

const parseIntegerOrUndefined = (value) => {
  if (typeof value === 'undefined' || value === null || value === '') {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
};

exports.startScrape = async (req, res) => {
  req.setTimeout(0);
  if (typeof res.setTimeout === 'function') {
    res.setTimeout(0);
  }

  const startUrl = typeof req.body.startUrl === 'string' ? req.body.startUrl.trim() : '';
  const sitemapUrl = typeof req.body.sitemapUrl === 'string' ? req.body.sitemapUrl.trim() : undefined;
  const embeddingModelName = typeof req.body.embeddingModelName === 'string' ? req.body.embeddingModelName.trim() : undefined;
  const collectionName = typeof req.body.collectionName === 'string' ? req.body.collectionName.trim() : undefined;
  const domain = typeof req.body.domain === 'string' ? req.body.domain.trim() : undefined;
  const respectRobots = toBooleanOrUndefined(req.body.respectRobots);
  const aggressiveDiscovery = toBooleanOrUndefined(req.body.aggressiveDiscovery);
  const maxDepth = parseIntegerOrUndefined(req.body.maxDepth);
  const maxLinksPerPage = parseIntegerOrUndefined(req.body.maxLinksPerPage);

  try {
    const userId = req.tenantUserId || req.user.userId;
    const userRole = req.user.role;

    // Regular users can only scrape their own data
    if (userRole === 'user' && req.tenantUserId && req.tenantUserId !== req.user.userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: You can only scrape your own data'
      });
    }
    const tenantContext = await getUserTenantContext(userId);
    ensureTenantResources(tenantContext);

    console.log('🧭 Starting tenant scrape', {
      tenantUserId: tenantContext.userId,
      resourceId: tenantContext.resourceId,
      databaseUri: tenantContext.databaseUri,
      vectorStorePath: tenantContext.vectorStorePath
    });

    const jobId = buildJobId('scrape', tenantContext.resourceId);
    const scrapeOptions = {
      startUrl,
      sitemapUrl,
      resourceId: tenantContext.resourceId,
      userId: tenantContext.userId,
      vectorStorePath: tenantContext.vectorStorePath,
      collectionName,
      embeddingModelName,
      domain,
      maxDepth,
      maxLinksPerPage,
      respectRobots,
      aggressiveDiscovery,
      jobId,
      logLevel: process.env.SCRAPER_LOG_LEVEL || 'INFO'
    };

    const result = await runTenantScrape(scrapeOptions);

    // Refresh bot cache after successful scrape so bot uses new data
    const cacheRefresh = await refreshBotCache(tenantContext);

    res.json({
      success: true,
      jobId,
      resourceId: tenantContext.resourceId,
      summary: result.summary,
      stdout: truncateLog(result.stdout),
      stderr: truncateLog(result.stderr),
      cacheRefreshed: cacheRefresh.success,
      documentCount: cacheRefresh.documentCount
    });
  } catch (err) {
    console.error('❌ Scrape job failed:', {
      userId: req.tenantUserId || req.user.userId,
      error: err.message,
      code: err.code,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });

    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: err.message,
      code: err.code,
      summary: err.summary || null
    });
  }
};

exports.runUpdater = async (req, res) => {
  req.setTimeout(0);
  if (typeof res.setTimeout === 'function') {
    res.setTimeout(0);
  }

  const startUrl = typeof req.body.startUrl === 'string' ? req.body.startUrl.trim() : '';
  const sitemapUrl = typeof req.body.sitemapUrl === 'string' ? req.body.sitemapUrl.trim() : undefined;
  const embeddingModelName = typeof req.body.embeddingModelName === 'string' ? req.body.embeddingModelName.trim() : undefined;
  const collectionName = typeof req.body.collectionName === 'string' ? req.body.collectionName.trim() : undefined;
  const domain = typeof req.body.domain === 'string' ? req.body.domain.trim() : undefined;
  const mongoUriOverride = typeof req.body.mongoUri === 'string' ? req.body.mongoUri.trim() : undefined;
  const respectRobots = toBooleanOrUndefined(req.body.respectRobots);
  const aggressiveDiscovery = toBooleanOrUndefined(req.body.aggressiveDiscovery);
  const maxDepth = parseIntegerOrUndefined(req.body.maxDepth);
  const maxLinksPerPage = parseIntegerOrUndefined(req.body.maxLinksPerPage);

  try {
    const userId = req.tenantUserId || req.user.userId;
    const userRole = req.user.role;

    // Regular users can only update their own data
    if (userRole === 'user' && req.tenantUserId && req.tenantUserId !== req.user.userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: You can only update your own data'
      });
    }
    const tenantContext = await getUserTenantContext(userId);
    ensureTenantResources(tenantContext);

    const effectiveMongoUri = mongoUriOverride || tenantContext.databaseUri;

    console.log('🧭 Starting tenant updater', {
      tenantUserId: tenantContext.userId,
      resourceId: tenantContext.resourceId,
      databaseUri: effectiveMongoUri,
      vectorStorePath: tenantContext.vectorStorePath
    });

    const jobId = buildJobId('update', tenantContext.resourceId);
    const updaterOptions = {
      startUrl,
      sitemapUrl,
      resourceId: tenantContext.resourceId,
      userId: tenantContext.userId,
      vectorStorePath: tenantContext.vectorStorePath,
      collectionName,
      embeddingModelName,
      domain,
      maxDepth,
      maxLinksPerPage,
      respectRobots,
      aggressiveDiscovery,
      mongoUri: effectiveMongoUri,
      jobId,
      logLevel: process.env.UPDATER_LOG_LEVEL || 'INFO'
    };

    const result = await runTenantUpdater(updaterOptions);

    // Refresh bot cache after successful update so bot uses new data
    const cacheRefresh = await refreshBotCache(tenantContext);

    res.json({
      success: true,
      jobId,
      resourceId: tenantContext.resourceId,
      summary: result.summary,
      stdout: truncateLog(result.stdout),
      stderr: truncateLog(result.stderr),
      cacheRefreshed: cacheRefresh.success,
      documentCount: cacheRefresh.documentCount
    });
  } catch (err) {
    console.error('❌ Updater job failed:', {
      userId: req.tenantUserId || req.user.userId,
      error: err.message,
      code: err.code,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });

    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: err.message,
      code: err.code,
      summary: err.summary || null
    });
  }
};
