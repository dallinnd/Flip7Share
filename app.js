import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// Service Worker for PWA
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.log(err));
}

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
let usedCards = [], bonuses = [], mult = 1, busted = false, currentGrandTotal = 0;

// Init
const nInput = document.getElementById('userNameInput');
if(nInput) {
    nInput.value = myName;
    nInput.oninput = () => { myName = nInput.value; localStorage.setItem('f7_name', myName); };
}
if(gameCode && myName) document.getElementById('resume-btn').style.display = 'block';

// Navigation
window.showScreen = (id) => {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'flex';
};

// UI & Logic
const grid = document.getElementById('cardGrid');
if (grid && grid.children.length === 0) {
    for(let i=1; i<=12; i++){
        let btn = document.createElement('button');
        btn.innerText = i;
        btn.onclick = () => {
            if ("vibrate" in navigator) navigator.vibrate(10);
            busted = false;
            if(usedCards.includes(i)) usedCards = usedCards.filter(v => v !== i);
            else if (usedCards.length < 7) usedCards.push(i);
            updateUI();
        };
        grid.appendChild(btn);
    }
}

window.toggleMod = (id, val) => {
    if ("vibrate" in navigator) navigator.vibrate(10);
    if(id === 'm2') mult = (mult === 2) ? 1 : 2;
    else bonuses.includes(val) ? bonuses = bonuses.filter(b=>b!==val) : bonuses.push(val);
    updateUI();
};

window.triggerBust = () => {
    if ("vibrate" in navigator) navigator.vibrate([100, 50, 100]);
    busted = true; usedCards = []; bonuses = []; mult = 1;
    updateUI();
};

function updateUI() {
    let sum = usedCards.reduce((a, b) => a + b, 0);
    let totalB = bonuses.reduce((a, b) => a + b, 0);
    const hasF7 = (usedCards.length === 7);
    let roundScore = busted ? 0 : (sum * mult) + totalB + (hasF7 ? 15 : 0);

    const rDisp = document.getElementById('round-display');
    const gDisp = document.getElementById('grand-display');
    
    rDisp.innerText = busted ? "BUST" : roundScore;
    gDisp.innerText = currentGrandTotal + roundScore;
    rDisp.style.color = busted ? "#ff4444" : (hasF7 ? "var(--gold)" : "white");

    // Banner & Buttons
    document.getElementById('flip7-banner').style.display = (hasF7 && !busted) ? 'block' : 'none';
    for(let i=1; i<=12; i++) {
        const b = grid.children[i-1];
        if(b) b.style.background = usedCards.includes(i) ? "var(--teal)" : "rgba(255,255,255,0.2)";
    }
    document.getElementById('btn-m2').className = (mult === 2) ? "mod-btn-active" : "";
    [2, 4, 6, 8, 10].forEach(v => {
        const btn = document.getElementById('btn-p' + v);
        if(btn) btn.className = bonuses.includes(v) ? "mod-btn-active" : "";
    });
}

// Sync
function syncApp(snap) {
    const data = snap.val();
    if(!data) return;
    const me = data.players[myName];
    if(!me) return;

    currentGrandTotal = (me.history || []).reduce((a,b) => a + b, 0);
    
    if (data.status === "waiting") {
        showScreen('lobby-screen');
    } else {
        showScreen('game-screen');
        document.getElementById('calc-view').style.display = me.submitted ? 'none' : 'block';
        document.getElementById('waiting-view').style.display = me.submitted ? 'block' : 'none';
    }

    const players = Object.values(data.players);
    const sorted = players.map(p => ({ ...p, total: (p.history || []).reduce((a,b)=>a+b, 0) })).sort((a,b)=>b.total-a.total);
    document.getElementById('leaderboard').innerHTML = sorted.map(p => `
        <div class="p-row ${p.name === myName ? 'is-me' : ''}">
            <div><b>${p.name} ${p.submitted ? '✅' : '⏳'}</b></div>
            <div style="font-size:1.5rem;font-weight:800;">${p.total}</div>
        </div>`).join("");

    updateUI();
}

// Networking
window.hostGameFromUI = () => hostGame(4);
async function hostGame(target) {
    gameCode = Math.floor(100000 + Math.random() * 900000);
    localStorage.setItem('f7_code', gameCode);
    await set(ref(db, `games/${gameCode}`), { host: myName, targetCount: target, status: "waiting", roundNum: 1 });
    joinGame(gameCode);
}
window.openJoinPopup = () => {
    let c = prompt("Code:");
    if(c) { gameCode = c; localStorage.setItem('f7_code', c); joinGame(c); }
};
async function joinGame(code) {
    onValue(ref(db, `games/${code}`), syncApp);
}
window.submitRound = async () => {
    let sum = usedCards.reduce((a, b) => a + b, 0);
    let totalB = bonuses.reduce((a, b) => a + b, 0);
    const score = busted ? 0 : (sum * mult) + totalB + (usedCards.length === 7 ? 15 : 0);
    const snap = await get(ref(db, `games/${gameCode}`));
    const data = snap.val();
    let h = data.players[myName].history || [0];
    h[data.roundNum] = score;
    await update(ref(db, `games/${gameCode}/players/${myName}`), { history: h, submitted: true });
    usedCards = []; bonuses = []; mult = 1; busted = false;
};
