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

// Global Window Exports
window.adjustCount = (v) => { targetPlayerCount = Math.max(1, Math.min(20, targetPlayerCount + v)); document.getElementById('playerCountDisplay').innerText = targetPlayerCount; };
window.showScreen = (id) => { document.querySelectorAll('.screen').forEach(s => s.style.display = 'none'); document.getElementById(id).style.display = 'flex'; };
window.closeCelebration = () => document.getElementById('celebration-overlay').style.display = 'none';

window.triggerBust = () => {
    if ("vibrate" in navigator) navigator.vibrate(50);
    busted = !busted;
    if(busted) { usedCards = []; bonuses = []; mult = 1; hasCelebrated = false; }
    updateUI();
};

window.toggleMod = (id, val) => {
    if(id === 'm2') mult = (mult === 2) ? 1 : 2;
    else bonuses.includes(val) ? bonuses = bonuses.filter(b=>b!==val) : bonuses.push(val);
    updateUI();
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
    document.querySelector('.bust-btn').className = busted ? "big-btn bust-btn bust-active" : "big-btn bust-btn";
    document.getElementById('flip7-banner').style.display = (hasF7 && !busted) ? 'block' : 'none';

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
    currentGrandTotal = (me.history || []).reduce((a,b) => a + b, 0);
    showScreen(data.status === "waiting" ? 'lobby-screen' : 'game-screen');
    
    if(data.status === "active") {
        document.getElementById('calc-view').style.display = me.submitted ? 'none' : 'block';
        document.getElementById('waiting-view').style.display = me.submitted ? 'block' : 'none';
        const players = Object.values(data.players);
        const sorted = players.map(p => ({ ...p, total: (p.history || []).reduce((a,b)=>a+b, 0) })).sort((a,b)=>b.total-a.total);
        document.getElementById('leaderboard').innerHTML = sorted.map(p => `<div class="p-row ${p.name === myName ? 'is-me' : ''}"><div><b>${p.name} ${p.submitted ? '✅' : '⏳'}</b></div><div style="font-size:1.5rem;font-weight:800;">${p.total}</div></div>`).join("");
        document.getElementById('nextRoundBtn').style.display = (data.host === myName && players.every(p => p.submitted)) ? 'block' : 'none';
    }
    updateUI();
}

// Network Helpers
window.hostGameFromUI = async () => {
    gameCode = Math.floor(100000 + Math.random() * 900000);
    localStorage.setItem('f7_code', gameCode);
    await set(ref(db, `games/${gameCode}`), { host: myName, targetCount: targetPlayerCount, status: "waiting", roundNum: 1 });
    joinGame(gameCode);
};
window.openJoinPopup = () => { let c = prompt("Code:"); if(c) { gameCode = c; localStorage.setItem('f7_code', c); joinGame(c); } };
async function joinGame(code) { onValue(ref(db, `games/${code}`), syncApp); }
window.submitRound = async () => {
    const score = busted ? 0 : (usedCards.reduce((a,b)=>a+b, 0) * mult) + bonuses.reduce((a,b)=>a+b, 0) + (usedCards.length === 7 ? 15 : 0);
    const snap = await get(ref(db, `games/${gameCode}`));
    let h = snap.val().players[myName].history || [0];
    h[snap.val().roundNum] = score;
    await update(ref(db, `games/${gameCode}/players/${myName}`), { history: h, submitted: true });
    usedCards = []; bonuses = []; mult = 1; busted = false; updateUI();
};
window.readyForNextRound = async () => {
    const snap = await get(ref(db, `games/${gameCode}`));
    const nextR = snap.val().roundNum + 1;
    const up = { [`games/${gameCode}/roundNum`]: nextR };
    for (let p in snap.val().players) { up[`games/${gameCode}/players/${p}/submitted`] = false; }
    await update(ref(db), up);
};

// Init
document.addEventListener('DOMContentLoaded', () => {
    const nInput = document.getElementById('userNameInput');
    if(nInput) { nInput.value = myName; nInput.oninput = () => { myName = nInput.value; localStorage.setItem('f7_name', myName); }; }
    const grid = document.getElementById('cardGrid');
    for(let i=0; i<=12; i++){
        let btn = document.createElement('button'); btn.innerText = i;
        btn.onclick = () => { busted = false; if(usedCards.includes(i)) usedCards = usedCards.filter(v => v !== i); else if (usedCards.length < 7) usedCards.push(i); updateUI(); };
        grid.appendChild(btn);
    }
});
