const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
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
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json());
app.use(attachSessionUser);
app.use(enforceUnoConsistency());

app.use('/api', messagesRouter);
app.use('/api', authRouter);
app.use('/api', accountRouter);
app.use('/api', businessRouter);
app.use('/api', curricularRouter);
app.use('/api', courseRouter);
app.use('/api', commonRouter);
app.use('/api', enrollRouter);
app.use('/api', examRouter);
app.use('/api', trainingprogramRouter);
app.use('/api', aiRouter);
initScheduler();

const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
const clientIndexPath = path.join(clientDistPath, 'index.html');
if (fs.existsSync(clientDistPath) && fs.existsSync(clientIndexPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }
    return res.sendFile(clientIndexPath);
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
