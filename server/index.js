const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { initScheduler } = require('./services/scheduler');
const messagesRouter = require('./routes/messages');
const authRouter = require('./routes/auth');
const accountRouter = require('./routes/account');
const businessRouter = require('./routes/business');
const curricularRouter = require('./routes/curricular');
const courseRouter = require('./routes/course');
const commonRouter = require('./routes/common');
const enrollRouter = require('./routes/enroll');
const examRouter = require('./routes/exam');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

app.use('/api', messagesRouter);
app.use('/api', authRouter);
app.use('/api', accountRouter);
app.use('/api', businessRouter);
app.use('/api', curricularRouter);
app.use('/api', courseRouter);
app.use('/api', commonRouter);
app.use('/api', enrollRouter);
app.use('/api', examRouter);
initScheduler();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
