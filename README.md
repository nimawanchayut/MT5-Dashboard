# MT5 Portfolio Command Center

## 📁 Files

| File | Description |
|------|-------------|
| `index.html` | Dashboard หลัก — deploy ขึ้น GitHub Pages |
| `telegram-bot.js` | Telegram Bot (Node.js) |

---

## 🚀 Deploy บน GitHub Pages

1. สร้าง repo ใหม่บน GitHub (public)
2. Upload `index.html` ขึ้น root ของ repo
3. ไปที่ Settings → Pages → Source: `main branch / root`
4. URL จะได้เป็น `https://USERNAME.github.io/REPO/`

---

## 🔥 Firebase Setup

### 1. สร้าง Firebase Project
- ไปที่ https://console.firebase.google.com
- สร้าง project ใหม่
- เปิด **Realtime Database** (ไม่ใช่ Firestore)
- ตั้ง Rules เป็น read: true, write: false (สำหรับ dashboard อ่านอย่างเดียว)

### 2. Database Rules (firebase-rules.json)
```json
{
  "rules": {
    ".read": true,
    ".write": false,
    "commands": {
      ".read": false,
      ".write": "auth != null"
    }
  }
}
```

### 3. Data Structure ใน Firebase Realtime Database

```
/portfolios
  /{portId}               ← เช่น PORT01, PORT02
    /info
      name: "Alpha Scalper"
      login: "100001"
      server: "ICMarkets-Live01"
      status: "live"        ← live | idle | error
    /stats
      equity: 12500.50
      balance: 12450.00
      maxDD: 8.5            ← Max Drawdown %
    /deals
      /{dealId}
        time: 1718000000000   ← Unix timestamp (ms)
        profit: 45.50         ← DEAL_PROFIT
        swap: -1.20           ← DEAL_SWAP
        commission: -2.00     ← DEAL_COMMISSION
        type: "TRADE"         ← หรือ "DEAL_TYPE_BALANCE"
    /equity_curve
      /{index}
        time: 1718000000000
        equity: 12500.50

/commands
  /{portId}
    closeAll: false           ← MT5 EA อ่านค่านี้ทุก tick
    timestamp: 1718000000000
```

---

## 📊 กฎคำนวณ (Critical Math Rules)

```javascript
// ✅ Trade Profit = DEAL_PROFIT + DEAL_SWAP + DEAL_COMMISSION
const tradePnL = deal.profit + deal.swap + deal.commission;

// ✅ Net Deposit = ผลรวมทุก DEAL_TYPE_BALANCE (ฝาก+, ถอน-, โยกเงิน-)
const netDeposit = deals
  .filter(d => d.type === 'DEAL_TYPE_BALANCE')
  .reduce((sum, d) => sum + d.profit, 0);

// ✅ Growth % — ไม่ Error เมื่อ Net Deposit = 0
const growth = netDeposit !== 0 ? (totalProfit / netDeposit) * 100 : 0;
```

---

## 🤖 Telegram Bot Setup

### Install Dependencies
```bash
npm install node-telegram-bot-api firebase-admin
```

### Firebase Service Account
1. Firebase Console → Project Settings → Service Accounts
2. Generate new private key → download `serviceAccountKey.json`
3. วางไว้ในโฟลเดอร์เดียวกับ `telegram-bot.js`

### Run
```bash
node telegram-bot.js
```

### PM2 (Production)
```bash
npm install -g pm2
pm2 start telegram-bot.js --name mt5-bot
pm2 save && pm2 startup
```

### Commands
| Command | Description |
|---------|-------------|
| `/start` | เมนูหลัก |
| `/status` | สรุปภาพรวมทุกพอร์ต |
| `/list` | รายการพอร์ตทั้งหมด |
| `/port PORT01` | ดูข้อมูลเจาะจงพอร์ต |
| `/velocity` | กำไร Real-time (1h/6h/Today) |
| `/closeall` | ส่งคำสั่งปิดไม้ฉุกเฉิน |

---

## 🖥 MT5 Expert Advisor — Firebase Integration (MQL5 snippet)

```mql5
// ติดตั้ง Firebase HTTP library และใส่ใน EA
// ตรวจสอบ closeAll command ทุก tick

string portId = "PORT01";
string fbUrl = "https://YOUR_PROJECT.firebasedatabase.app";

void OnTick() {
   // Read closeAll command
   string url = fbUrl + "/commands/" + portId + "/closeAll.json";
   string result = HTTPGet(url);
   
   if(result == "true") {
      // Close all positions
      for(int i = PositionsTotal()-1; i >= 0; i--) {
         ulong ticket = PositionGetTicket(i);
         trade.PositionClose(ticket);
      }
      // Write stats back to Firebase
      WriteStatsToFirebase();
   }
}

void WriteStatsToFirebase() {
   string statsJson = StringFormat(
      "{\"equity\":%.2f,\"balance\":%.2f,\"maxDD\":%.2f}",
      AccountInfoDouble(ACCOUNT_EQUITY),
      AccountInfoDouble(ACCOUNT_BALANCE),
      maxDrawdown
   );
   string url = fbUrl + "/portfolios/" + portId + "/stats.json";
   HTTPPut(url, statsJson);
}
```

---

## 🎨 UI Sections

1. **Portfolio Grand Overview** — Total Equity, Balance, Net Deposit, Grand Profit, Growth%, Max DD%
2. **Velocity & Momentum** — กำไรแบบ Real-time แยก 1h/6h/Today อัปเดตทุก 5 วินาที
3. **Deep-Dive Portfolios** — Accordion รองรับ 20+ พอร์ต พร้อม Equity Curve chart
4. **Advanced Performance Grid** — Sortable table + Date Range Filter

---

## 🔧 Customization

แก้ไข `FIREBASE_CONFIG` ใน `index.html`:

```javascript
const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

ค่า config ดูได้จาก Firebase Console → Project Settings → Your apps → Web app
