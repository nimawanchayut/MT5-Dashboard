/**
 * ══════════════════════════════════════════════════════════
 * MT5 PORTFOLIO — TELEGRAM COMMAND CENTER BOT (Node.js)
 * ══════════════════════════════════════════════════════════
 * 
 * SETUP:
 *   npm install node-telegram-bot-api firebase-admin
 *   node telegram-bot.js
 * 
 * ENV (or fill directly below):
 *   BOT_TOKEN   = Telegram Bot Token
 *   CHAT_ID     = Authorized Chat ID
 *   FIREBASE_URL = Firebase Realtime Database URL
 *   FIREBASE_SA  = Path to serviceAccountKey.json
 */

const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');

// ─── CONFIGURATION ───────────────────────────────────────
const BOT_TOKEN = process.env.BOT_TOKEN || '8329716477:AAGIOyG6kbuQew6pVarOPaQQAOe17R9ZyKo';
const ALLOWED_CHAT_ID = parseInt(process.env.CHAT_ID || '7398513802');
const FIREBASE_URL = process.env.FIREBASE_URL || 'https://YOUR_PROJECT-default-rtdb.asia-southeast1.firebasedatabase.app';
const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SA || './serviceAccountKey.json';
// ─────────────────────────────────────────────────────────

// Init Firebase Admin
let db;
try {
  const serviceAccount = require(SERVICE_ACCOUNT_PATH);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: FIREBASE_URL
  });
  db = admin.database();
  console.log('[Firebase] Admin SDK connected');
} catch(e) {
  console.error('[Firebase] Failed to init:', e.message);
  console.warn('[Firebase] Running without DB — commands will show errors');
}

// Init Bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log('[Bot] MT5 Command Center Bot started');

// ─── AUTH GUARD ──────────────────────────────────────────
function isAllowed(chatId) {
  return parseInt(chatId) === ALLOWED_CHAT_ID;
}

function guard(msg, cb) {
  const cid = msg.chat.id;
  if(!isAllowed(cid)) {
    bot.sendMessage(cid, '⛔ Unauthorized. This bot is private.');
    console.warn(`[Security] Blocked access from chat ${cid}`);
    return;
  }
  cb(cid);
}

// ─── MATH HELPERS ────────────────────────────────────────
function calcPortStats(deals) {
  const dealArr = Object.values(deals || {});
  let netDeposit = 0, totalProfit = 0;
  let winCount = 0, tradeCount = 0, grossWin = 0, grossLoss = 0;
  
  dealArr.forEach(d => {
    if(d.type === 'DEAL_TYPE_BALANCE') {
      netDeposit += (d.profit || 0);
    } else {
      // CRITICAL: Trade Profit = DEAL_PROFIT + DEAL_SWAP + DEAL_COMMISSION
      const tp = (d.profit || 0) + (d.swap || 0) + (d.commission || 0);
      totalProfit += tp;
      tradeCount++;
      if(tp > 0) { winCount++; grossWin += tp; }
      else { grossLoss += Math.abs(tp); }
    }
  });
  
  // Growth % — safe division (no error when netDeposit = 0)
  const growth = (netDeposit !== 0) ? (totalProfit / netDeposit) * 100 : 0;
  const winRate = (tradeCount > 0) ? (winCount / tradeCount) * 100 : 0;
  const pf = (grossLoss > 0) ? grossWin / grossLoss : (grossWin > 0 ? 999 : 0);
  
  return { netDeposit, totalProfit, growth, winRate, pf, tradeCount, winCount };
}

function fmt(n) { return `$${Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`; }
function fmtPct(n) { return `${Number(n||0).toFixed(2)}%`; }
function emo(n) { return n >= 0 ? '🟢' : '🔴'; }

// ─── /start ──────────────────────────────────────────────
bot.onText(/\/start/, (msg) => {
  guard(msg, cid => {
    bot.sendMessage(cid, `
🖥 *MT5 Portfolio Command Center*
_Authorized access granted_

*Available Commands:*
/status — Portfolio grand overview
/port \\[ID\\] — Deep dive into specific portfolio
/list — List all portfolio IDs
/closeall — 🚨 Emergency close all positions
/velocity — Real\\-time profit velocity
/help — Show this menu

⚡ Data updates in real\\-time via Firebase
    `.trim(), { parse_mode: 'MarkdownV2' });
  });
});

bot.onText(/\/help/, (msg) => bot.emit('text', { ...msg, text: '/start' }));

// ─── /status ─────────────────────────────────────────────
bot.onText(/\/status/, async (msg) => {
  guard(msg, async cid => {
    if(!db) return bot.sendMessage(cid, '❌ Firebase not configured');
    const loadMsg = await bot.sendMessage(cid, '⏳ Fetching portfolio data...');
    try {
      const snap = await db.ref('/portfolios').once('value');
      const ports = snap.val() || {};
      const portArr = Object.entries(ports);
      if(!portArr.length) return bot.sendMessage(cid, '📭 No portfolios found in database');

      let totalEquity=0, totalBalance=0, totalNetDep=0, totalProfit=0, maxDDs=[];
      let liveCount=0;

      portArr.forEach(([id, port]) => {
        totalEquity += (port.stats?.equity || 0);
        totalBalance += (port.stats?.balance || 0);
        const s = calcPortStats(port.deals);
        totalNetDep += s.netDeposit;
        totalProfit += s.totalProfit;
        if(port.stats?.maxDD) maxDDs.push(port.stats.maxDD);
        if(port.info?.status === 'live') liveCount++;
      });
      
      const growth = totalNetDep !== 0 ? (totalProfit / totalNetDep) * 100 : 0;
      const avgDD = maxDDs.length ? maxDDs.reduce((a,b)=>a+b,0)/maxDDs.length : 0;
      
      // Velocity
      const now = Date.now();
      const midnight = new Date(); midnight.setHours(0,0,0,0);
      let todayProfit=0, todayTrades=0;
      portArr.forEach(([,port])=>{
        Object.values(port.deals||{}).forEach(d=>{
          if(d.type!=='DEAL_TYPE_BALANCE'&&d.time>=midnight.getTime()){
            todayProfit+=(d.profit||0)+(d.swap||0)+(d.commission||0);
            todayTrades++;
          }
        });
      });

      const text = `
📊 *PORTFOLIO GRAND OVERVIEW*
_Updated: ${new Date().toLocaleString('en-US', {timeZone:'Asia/Bangkok'})}_

━━━━━━━━━━━━━━━━━━━━
💼 *Portfolios:* ${portArr.length} total \\(${liveCount} live\\)

💰 *Total Equity:* ${escMd(fmt(totalEquity))}
🏦 *Total Balance:* ${escMd(fmt(totalBalance))}
📥 *Net Deposit:* ${escMd(fmt(totalNetDep))}
${emo(totalProfit)} *Grand Profit:* ${escMd(fmt(totalProfit))}
📈 *Overall Growth:* ${escMd(fmtPct(growth))}
📉 *Avg Max DD:* ${escMd(fmtPct(avgDD))}

━━━━━━━━━━━━━━━━━━━━
⚡ *TODAY'S VELOCITY*
${emo(todayProfit)} Profit: ${escMd(fmt(todayProfit))}
🔄 Trades closed: ${todayTrades}
      `.trim();
      
      bot.deleteMessage(cid, loadMsg.message_id).catch(()=>{});
      bot.sendMessage(cid, text, { parse_mode: 'MarkdownV2' });
    } catch(e) {
      console.error('/status error:', e);
      bot.sendMessage(cid, `❌ Error: ${e.message}`);
    }
  });
});

// ─── /list ───────────────────────────────────────────────
bot.onText(/\/list/, async (msg) => {
  guard(msg, async cid => {
    if(!db) return bot.sendMessage(cid, '❌ Firebase not configured');
    try {
      const snap = await db.ref('/portfolios').once('value');
      const ports = snap.val() || {};
      const lines = Object.entries(ports).map(([id, p]) => {
        const s = calcPortStats(p.deals);
        const status = p.info?.status||'idle';
        const statusEmo = status==='live'?'🟢':status==='error'?'🔴':'🟡';
        return `${statusEmo} \`${id}\` — ${escMd(p.info?.name||id)} — ${escMd(fmt(p.stats?.equity||0))}`;
      }).join('\n');
      bot.sendMessage(cid, `📋 *Portfolio List \\(${Object.keys(ports).length}\\)*\n\n${lines}`, { parse_mode: 'MarkdownV2' });
    } catch(e) {
      bot.sendMessage(cid, `❌ Error: ${e.message}`);
    }
  });
});

// ─── /port [ID] ──────────────────────────────────────────
bot.onText(/\/port (.+)/, async (msg, match) => {
  guard(msg, async cid => {
    if(!db) return bot.sendMessage(cid, '❌ Firebase not configured');
    const portId = match[1].trim().toUpperCase();
    try {
      const snap = await db.ref(`/portfolios/${portId}`).once('value');
      const port = snap.val();
      if(!port) return bot.sendMessage(cid, `❌ Portfolio \`${portId}\` not found`);
      
      const info = port.info || {};
      const stats = port.stats || {};
      const s = calcPortStats(port.deals);
      
      // Today's profit for this port
      const midnight = new Date(); midnight.setHours(0,0,0,0);
      let todayP=0, todayT=0;
      Object.values(port.deals||{}).forEach(d=>{
        if(d.type!=='DEAL_TYPE_BALANCE'&&d.time>=midnight.getTime()){
          todayP+=(d.profit||0)+(d.swap||0)+(d.commission||0); todayT++;
        }
      });
      
      const text = `
🖥 *${escMd(info.name||portId)}*
ID: \`${portId}\` \\| Login: \`${info.login||'—'}\`
Server: ${escMd(info.server||'—')}
Status: ${info.status==='live'?'🟢 LIVE':info.status==='error'?'🔴 ERROR':'🟡 IDLE'}

━━━━━━━━━━━━━━━━━━━━
💰 *Financial*
  Equity: ${escMd(fmt(stats.equity||0))}
  Balance: ${escMd(fmt(stats.balance||0))}
  Net Deposit: ${escMd(fmt(s.netDeposit))}
  Total Profit: ${emo(s.totalProfit)} ${escMd(fmt(s.totalProfit))}
  Growth: ${emo(s.growth)} ${escMd(fmtPct(s.growth))}

━━━━━━━━━━━━━━━━━━━━
📊 *Performance*
  Total Trades: ${s.tradeCount}
  Win Rate: ${escMd(fmtPct(s.winRate))}
  Profit Factor: ${escMd(String(s.pf.toFixed(2)))}
  Max DD: ${escMd(fmtPct(stats.maxDD||0))}

━━━━━━━━━━━━━━━━━━━━
⚡ *Today*
  Profit: ${emo(todayP)} ${escMd(fmt(todayP))}
  Trades: ${todayT}
      `.trim();
      
      bot.sendMessage(cid, text, { parse_mode: 'MarkdownV2' });
    } catch(e) {
      bot.sendMessage(cid, `❌ Error fetching ${portId}: ${e.message}`);
    }
  });
});

// ─── /velocity ───────────────────────────────────────────
bot.onText(/\/velocity/, async (msg) => {
  guard(msg, async cid => {
    if(!db) return bot.sendMessage(cid, '❌ Firebase not configured');
    try {
      const snap = await db.ref('/portfolios').once('value');
      const ports = snap.val() || {};
      const now = Date.now();
      const midnight = new Date(); midnight.setHours(0,0,0,0);
      let v1h={p:0,t:0}, v6h={p:0,t:0}, vTd={p:0,t:0};
      Object.values(ports).forEach(port=>{
        Object.values(port.deals||{}).forEach(d=>{
          if(d.type==='DEAL_TYPE_BALANCE') return;
          const tp=(d.profit||0)+(d.swap||0)+(d.commission||0);
          if(d.time>=now-3600000){v1h.p+=tp;v1h.t++;}
          if(d.time>=now-21600000){v6h.p+=tp;v6h.t++;}
          if(d.time>=midnight.getTime()){vTd.p+=tp;vTd.t++;}
        });
      });
      const text = `
⚡ *VELOCITY & MOMENTUM*
_${new Date().toLocaleString('en-US',{timeZone:'Asia/Bangkok'})}_

━━━━━━━━━━━━━━━━━━━━
🕐 *Last 1 Hour*
  Profit: ${emo(v1h.p)} ${escMd(fmt(v1h.p))}
  Trades: ${v1h.t}

🕕 *Last 6 Hours*
  Profit: ${emo(v6h.p)} ${escMd(fmt(v6h.p))}
  Trades: ${v6h.t}

📅 *Today*
  Profit: ${emo(vTd.p)} ${escMd(fmt(vTd.p))}
  Trades: ${vTd.t}
      `.trim();
      bot.sendMessage(cid, text, { parse_mode: 'MarkdownV2' });
    } catch(e) {
      bot.sendMessage(cid, `❌ Error: ${e.message}`);
    }
  });
});

// ─── /closeall ───────────────────────────────────────────
bot.onText(/\/closeall/, async (msg) => {
  guard(msg, async cid => {
    // Confirmation step
    bot.sendMessage(cid, `
🚨 *EMERGENCY CLOSE ALL POSITIONS*

⚠️ This will send closeAll command to Firebase for ALL portfolios\\.
MT5 EAs must be monitoring \`/commands/{portId}/closeAll\`\\.

Reply /confirm\\_closeall to proceed\\.
    `.trim(), { parse_mode: 'MarkdownV2' });
  });
});

bot.onText(/\/confirm_closeall/, async (msg) => {
  guard(msg, async cid => {
    if(!db) return bot.sendMessage(cid, '❌ Firebase not configured');
    try {
      const snap = await db.ref('/portfolios').once('value');
      const ports = snap.val() || {};
      const portIds = Object.keys(ports);
      
      // Write closeAll = true to /commands/{portId}
      const updates = {};
      portIds.forEach(id => {
        updates[`/commands/${id}/closeAll`] = true;
        updates[`/commands/${id}/timestamp`] = Date.now();
        updates[`/commands/${id}/sentBy`] = ALLOWED_CHAT_ID;
      });
      
      await db.ref().update(updates);
      
      bot.sendMessage(cid, `
✅ *CLOSE ALL COMMAND SENT*

📤 Sent to *${portIds.length}* portfolios:
${portIds.map(id=>`  • \`${id}\``).join('\n')}

⏱ MT5 EAs should execute within next tick\\.
Use /status to monitor positions\\.
      `.trim(), { parse_mode: 'MarkdownV2' });
      
      console.log(`[CLOSEALL] Triggered by ${cid} for ports:`, portIds);
      
      // Auto-reset closeAll after 30 seconds
      setTimeout(async () => {
        const resetUpdates = {};
        portIds.forEach(id => { resetUpdates[`/commands/${id}/closeAll`] = false; });
        await db.ref().update(resetUpdates);
        console.log('[CLOSEALL] Auto-reset after 30s');
      }, 30000);
      
    } catch(e) {
      bot.sendMessage(cid, `❌ Error sending command: ${e.message}`);
    }
  });
});

// ─── Error Handling ───────────────────────────────────────
bot.on('polling_error', (err) => {
  console.error('[Bot] Polling error:', err.code, err.message);
});

bot.on('message', (msg) => {
  if(!isAllowed(msg.chat.id)) return;
  // Log commands
  if(msg.text?.startsWith('/')) {
    console.log(`[CMD] ${msg.text} from ${msg.chat.id}`);
  }
});

// ─── Utility ─────────────────────────────────────────────
function escMd(str) {
  return String(str).replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

console.log(`[Bot] Listening for chat ID: ${ALLOWED_CHAT_ID}`);
console.log('[Bot] Commands: /start /status /list /port [ID] /velocity /closeall');
