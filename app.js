import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyConuxhGCtGvJaa6TZ1bkUvlOhhTdyTgZE",
    authDomain: "flip7share.firebaseapp.com",
    databaseURL: "https://flip7share-default-rtdb.firebaseio.com",
    projectId: "flip7share",
    storageBucket: "flip7share.firebasestorage.app",
    messagingSenderId: "467127126520",
    appId: "1:467127126520:web:0646f4fc19352eaa11ee0d"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let gameCode = localStorage.getItem('f7_code'), myName = localStorage.getItem('f7_name') || "";
let usedCards = [], bonuses = [], mult = 1, busted = false, currentGrandTotal = 0, targetPlayerCount = 4, hasCelebrated = false;

// Global Function Exports
window.adjustCount = (v) => { targetPlayerCount = Math.max(1, Math.min(20, targetPlayerCount + v)); document.getElementById('playerCountDisplay').innerText = targetPlayerCount; };
window.showScreen = (id) => { document.querySelectorAll('.screen').forEach(s => s.style.display = 'none'); document.getElementById(id).style.display = 'flex'; };
window.closeCelebration = () => document.getElementById('celebration-overlay').style.display = 'none';

window.triggerBust = () => {
    busted = !busted;
    if(busted) { usedCards = []; bonuses = []; mult = 1; hasCelebrated = false; }
    updateUI();
};

window.toggleMod = (id, val) => {
    if(id === 'm2') mult = (mult === 2) ? 1 : 2;
    else bonuses.includes(val) ? bonuses = bonuses.filter(b=>b!==val) : bonuses.push(val);
    updateUI();
};

window.revertToRound = async (r) => {
    const snap = await get(ref(db, `games/${gameCode}`));
    const data = snap.val();
    if (data.host === myName && confirm(`Edit Round ${r}? (Restores your specific cards)`)) {
        const up = { [`games/${gameCode}/roundNum`]: r };
        for (let p in data.players) up[`games/${gameCode}/players/${p}/submitted`] = false;
        await update(ref(db), up);
        
        // Restore specific state for the local user
        const saved = data.players[myName].history[r];
        if (saved && typeof saved === 'object') {
            usedCards = saved.usedCards || []; bonuses = saved.bonuses || [];
            mult = saved.mult || 1; busted = saved.busted || false;
        }
        window.showScreen('game-screen');
        updateUI();
    }
};

function updateUI() {
    let sum = usedCards.reduce((a, b) => a + b, 0);
    let totalB = bonuses.reduce((a, b) => a + b, 0);
    const hasF7 = (usedCards.length === 7);
    
    if(hasF7 && !hasCelebrated && !busted) { document.getElementById('celebration-overlay').style.display = 'flex'; hasCelebrated = true; }
    if(!hasF7) hasCelebrated = false;

    let roundScore = busted ? 0 : (sum * mult) + totalB + (hasF7 ? 15 : 0);
    document.getElementById('round-display').innerText = busted ? "BUST" : roundScore;
    document.getElementById('grand-display').innerText = currentGrandTotal + roundScore;
    document.getElementById('bust-toggle-btn').className = busted ? "big-btn bust-btn bust-active" : "big-btn bust-btn";
    
    const grid = document.getElementById('cardGrid');
    if(grid) {
        for(let i=0; i<=12; i++) {
            const b = grid.children[i];
            if(b) b.style.background = usedCards.includes(i) ? "var(--teal)" : "rgba(255,255,255,0.2)";
        }
    }
    document.getElementById('btn-m2').className = (mult === 2) ? "mod-btn-active" : "";
    [2,4,6,8,10].forEach(v => { const b = document.getElementById('btn-p' + v); if(b) b.className = bonuses.includes(v) ? "mod-btn-active" : ""; });
}

function syncApp(snap) {
    const data = snap.val(); if(!data) return;
    const me = data.players[myName]; if(!me) return;
    const players = Object.values(data.players);

    // Calc Grand Total: Handle both old Number-only history and new Object-based history
    currentGrandTotal = (me.history || []).reduce((a,b) => a + (typeof b === 'object' ? b.score : b), 0);
    
    window.showScreen(data.status === "waiting" ? 'lobby-screen' : 'game-screen');
    
    if(data.status === "active") {
        document.getElementById('calc-view').style.display = me.submitted ? 'none' : 'block';
        document.getElementById('waiting-view').style.display = me.submitted ? 'block' : 'none';
        
        const sorted = players.map(p => ({ ...p, total: (p.history || []).reduce((a,b) => a + (typeof b === 'object' ? b.score : b), 0) })).sort((a,b)=>b.total-a.total);
        
        document.getElementById('leaderboard').innerHTML = sorted.map(p => `
            <div class="p-row ${p.total >= 200 ? 'threshold-reached' : ''}">
                <b>${p.name} ${p.submitted ? '✅' : '⏳'}</b>
                <span>${p.total} ${p.total >= 200 ? '🔥' : 'pts'}</span>
            </div>`).join("");
        
        document.getElementById('nextRoundBtn').style.display = (data.host === myName && players.every(p => p.submitted)) ? 'block' : 'none';
        
        let hHTML = "";
        for (let r = data.roundNum; r >= 1; r--) {
            let rows = players.map(p => `<div>${p.name}: ${p.history[r] ? (typeof p.history[r] === 'object' ? p.history[r].score : p.history[r]) : 0}</div>`).join("");
            hHTML += `<div class="history-block" onclick="window.revertToRound(${r})"><span class="round-label">ROUND ${r}</span>${rows}</div>`;
        }
        document.getElementById('history-log-container').innerHTML = hHTML;
    }
    updateUI();
}

window.hostGameFromUI = async () => {
    gameCode = Math.floor(100000 + Math.random() * 900000);
    localStorage.setItem('f7_code', gameCode);
    await set(ref(db, `games/${gameCode}`), { host: myName, targetCount: targetPlayerCount, status: "waiting", roundNum: 1 });
    onValue(ref(db, `games/${gameCode}`), syncApp);
};

window.openJoinPopup = () => { let c = prompt("Code:"); if(c) { gameCode = c; localStorage.setItem('f7_code', c); onValue(ref(db, `games/${c}`), syncApp); } };
window.resumeGame = () => onValue(ref(db, `games/${gameCode}`), syncApp);

window.submitRound = async () => {
    const snap = await get(ref(db, `games/${gameCode}`));
    const rNum = snap.val().roundNum;
    const score = busted ? 0 : (usedCards.reduce((a,b)=>a+b, 0) * mult) + bonuses.reduce((a,b)=>a+b, 0) + (usedCards.length === 7 ? 15 : 0);
    
    const roundState = { score, usedCards: [...usedCards], bonuses: [...bonuses], mult, busted };
    let h = snap.val().players[myName].history || [0];
    h[rNum] = roundState;
    
    await update(ref(db, `games/${gameCode}/players/${myName}`), { history: h, submitted: true });
    usedCards = []; bonuses = []; mult = 1; busted = false; updateUI();
};

window.readyForNextRound = async () => {
    const snap = await get(ref(db, `games/${gameCode}`));
    const up = { [`games/${gameCode}/roundNum`]: snap.val().roundNum + 1 };
    for (let p in snap.val().players) up[`games/${gameCode}/players/${p}/submitted`] = false;
    await update(ref(db), up);
};

document.addEventListener('DOMContentLoaded', () => {
    const nInput = document.getElementById('userNameInput');
    if(nInput) { nInput.value = myName; nInput.oninput = () => { myName = nInput.value; localStorage.setItem('f7_name', myName); }; }
    const grid = document.getElementById('cardGrid');
    for(let i=0; i<=12; i++){
        let btn = document.createElement('button'); btn.innerText = i;
        btn.onclick = () => { busted = false; if(usedCards.includes(i)) usedCards = usedCards.filter(v=>v!==i); else if(usedCards.length < 7) usedCards.push(i); updateUI(); };
        grid.appendChild(btn);
    }
});
