const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();

const Database = require('./db/schema');
const ConversationEngine = require('./bot/conversationEngine');
const checkInScheduler = require('./scheduler/checkInScheduler');
const { sendWhatsAppMessage, parseIncomingMessage } = require('./services/twilioService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const db = new Database();
const engine = new ConversationEngine();

app.get('/health', (req, res) => {
  res.json({ status: 'Study Buddy Bot is running 🤖' });
});

app.post('/webhook/incoming', async (req, res) => {
  try {
    const { phoneNumber, messageText } = parseIncomingMessage(req);

    console.log(`📨 Message from ${phoneNumber}: ${messageText}`);

    const response = await engine.handleMessage(phoneNumber, messageText);

    await sendWhatsAppMessage(phoneNumber, response);

    res.sendStatus(200);
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.sendStatus(500);
  }
});

app.post('/admin/trigger-checkin', async (req, res) => {
  try {
    await checkInScheduler.sendNightlyCheckIns();
    res.json({ message: 'Check-ins triggered' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/user/:phoneNumber/stats', async (req, res) => {
  try {
    const user = await db.get(
      'SELECT * FROM users WHERE phone = ?',
      [req.params.phoneNumber]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const completedTasks = await db.all(
      'SELECT * FROM tasks WHERE user_id = ? AND completed = 1',
      [user.id]
    );

    const allTasks = await db.all(
      'SELECT * FROM tasks WHERE user_id = ?',
      [user.id]
    );

    res.json({
      phone: user.phone,
      streak: user.streak_count,
      completedTasks: completedTasks.length,
      totalTasks: allTasks.length,
      completionRate: allTasks.length > 0 ? ((completedTasks.length / allTasks.length) * 100).toFixed(1) : 0,
      joinedDate: user.created_at,
      lastCheckIn: user.last_checkin
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/user/:phoneNumber/tasks', async (req, res) => {
  try {
    const user = await db.get(
      'SELECT * FROM users WHERE phone = ?',
      [req.params.phoneNumber]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const tasks = await db.all(
      `SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`,
      [user.id]
    );

    res.json({ tasks });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  try {
    await db.init();
    checkInScheduler.start();

    app.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════════╗
║     🤖 STUDY BUDDY BOT STARTED 🤖     ║
╚════════════════════════════════════════╝
📱 WhatsApp/SMS Bot Ready
🌐 Server running on port ${PORT}
🌙 Nightly check-ins: 9:00 PM daily
📊 Database: Active & Ready
      `);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;