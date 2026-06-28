const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { initScheduler } = require('./services/scheduler');
const { attachSessionUser, enforceUnoConsistency } = require('./services/sessionService');
const messagesRouter = require('./routes/messages');
const authRouter = require('./routes/auth');
const accountRouter = require('./routes/account');
const businessRouter = require('./routes/business');
const curricularRouter = require('./routes/curricular');
const courseRouter = require('./routes/course');
const commonRouter = require('./routes/common');
const enrollRouter = require('./routes/enroll');
const examRouter = require('./routes/exam');
const trainingprogramRouter = require('./routes/trainingprogram');
const aiRouter = require('./routes/ai');
const dbadminRouter = require('./routes/dbadmin');

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:3000')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || corsOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true
}));

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
    });
    next();
  });
}

// API 路由 — AcademyDBMS 教务系统 (/api/academy)
const academyApi = express.Router();
academyApi.use(attachSessionUser);
academyApi.use(enforceUnoConsistency());

academyApi.use('/', authRouter);
academyApi.use('/', messagesRouter);
academyApi.use('/', accountRouter);
academyApi.use('/', businessRouter);
academyApi.use('/', curricularRouter);
academyApi.use('/', courseRouter);
academyApi.use('/', commonRouter);
academyApi.use('/', enrollRouter);
academyApi.use('/', examRouter);
academyApi.use('/', trainingprogramRouter);
academyApi.use('/', aiRouter);

academyApi.use((req, res) => {
  res.status(404).json({ success: false, message: `AcademyDBMS endpoint not found: ${req.method} ${req.originalUrl}` });
});

app.use('/api/academy', academyApi);

// API 路由 — DBAdmin (/api/dbadmin)
app.use('/api/dbadmin', dbadminRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// 静态文件服务（仅生产模式）
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
const clientIndexPath = path.join(clientDistPath, 'index.html');

if (fs.existsSync(clientDistPath) && fs.existsSync(clientIndexPath)) {
  console.log(`[Info] Serving static files from: ${clientDistPath}`);
  app.use(express.static(clientDistPath, {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
    etag: true,
    lastModified: true
  }));

  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/academy') || req.path.startsWith('/api/dbadmin')) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }
    return res.sendFile(clientIndexPath);
  });
} else {
  console.log(`[Warn] Client dist not found at: ${clientDistPath}`);
  console.log('[Warn] Static file serving disabled. Build client first or run in dev mode.');
}

// 全局错误处理中间件
app.use((err, req, res, next) => {
  console.error(`[Error] ${err.stack || err.message || err}`);
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

// 优雅关闭
let server;

function gracefulShutdown(signal) {
  console.log(`\n[Server] Received ${signal}. Starting graceful shutdown...`);
  server.close(() => {
    console.log('[Server] HTTP server closed.');
    const db = require('./db');
    db.end().catch(() => {}).finally(() => {
      console.log('[Server] Database connections closed.');
      process.exit(0);
    });
  });
  setTimeout(() => {
    console.error('[Server] Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
}

// 启动服务
server = app.listen(PORT, () => {
  console.log(`[Server] AcademyDBMS running on port ${PORT}`);
  console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
});

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  console.error('[Fatal] Uncaught exception:', err);
  gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  console.error('[Fatal] Unhandled rejection:', reason);
});