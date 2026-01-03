import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- Firebase Configuration ---
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

// --- State Variables ---
let gameCode = localStorage.getItem('f7_code'), 
    myName = localStorage.getItem('f7_name') || "";
let usedCards = [], bonuses = [], mult = 1, busted = false, currentGrandTotal = 0;
let targetPlayerCount = 4, hasCelebrated = false;

// --- Live Sync Helper ---
async function syncLiveScore(score) {
    if (!gameCode || !myName) return;
    await update(ref(db, `games/${gameCode}/players/${myName}`), { 
        liveScore: score, 
        isBusted: busted 
    });
}

// --- UI Rendering ---
function updateUI() {
    let sum = usedCards.reduce((a, b) => a + b, 0);
    let totalB = bonuses.reduce((a, b) => a + b, 0);
    const hasF7 = (usedCards.length === 7);
    
    // Celebration Trigger
    if(hasF7 && !hasCelebrated && !busted) {
        const overlay = document.getElementById('celebration-overlay');
        if (overlay) overlay.style.display = 'flex';
        hasCelebrated = true;
    }
    if(!hasF7) hasCelebrated = false;

    let roundScore = busted ? 0 : (sum * mult) + totalB + (hasF7 ? 15 : 0);
    
    // Update Score Displays
    const rDisp = document.getElementById('round-display');
    const gDisp = document.getElementById('grand-display');
    if (rDisp) rDisp.innerText = busted ? "BUST" : roundScore;
    if (gDisp) gDisp.innerText = currentGrandTotal + roundScore;
    
    // Broadcast Score to Leaderboard
    syncLiveScore(roundScore);

    // Highlight Selected Cards
    const grid = document.getElementById('cardGrid');
    if(grid) {
        for(let i=0; i<=12; i++) {
            const b = grid.children[i];
            if(b) b.style.background = usedCards.includes(i) ? "var(--teal)" : "rgba(255,255,255,0.2)";
        }
    }

    // Toggle Button Styles
    document.getElementById('bust-toggle-btn').className = busted ? "big-btn bust-btn bust-active" : "big-btn bust-btn";
    const banner = document.getElementById('flip7-banner');
    if (banner) banner.style.display = (hasF7 && !busted) ? 'block' : 'none';
    
    document.getElementById('btn-m2').className = (mult === 2) ? "mod-btn-active" : "";
    [2,4,6,8,10].forEach(v => {
        const b = document.getElementById('btn-p' + v);
        if(b) b.className = bonuses.includes(v) ? "mod-btn-active" : "";
    });
}

// --- Firebase Sync Logic ---
function syncApp(snap) {
    const data = snap.val(); 
    if(!data) return;
    
    // Fix for Code Display: ensure we use the actual DB key if local variable is missing
    const activeCode = gameCode || snap.key;
    gameCode = activeCode;

    const me = data.players[myName]; 
    if(!me) return;
    
    const playersArr = Object.values(data.players || {});

    // Update Room Code Displays
    const lobbyCodeDisp = document.getElementById('roomDisplayLobby');
    if (lobbyCodeDisp) lobbyCodeDisp.innerText = "Game: " + activeCode;
    const gameCodeDisp = document.getElementById('roomCodeDisplay');
    if (gameCodeDisp) gameCodeDisp.innerText = `CODE: ${activeCode} | R${data.roundNum}`;

    // Calculate Grand Total from completed rounds
    const history = me.history || [0];
    currentGrandTotal = history.reduce((acc, entry, idx) => {
        if (idx > 0 && idx < data.roundNum) return acc + (typeof entry === 'object' ? entry.score : entry);
        return acc;
    }, 0);
    
    if (data.status === "waiting") {
        window.showScreen('lobby-screen');
        document.getElementById('lobby-status').innerText = `Joined: ${playersArr.length} / ${data.targetCount}`;
        document.getElementById('player-list').innerHTML = playersArr.map(p => `<div class="p-row"><b>${p.name}</b></div>`).join("");
        
        if(playersArr.length >= data.targetCount && data.host === myName) {
            update(ref(db, `games/${gameCode}`), { status: "active" });
        }
    } else {
        window.showScreen('game-screen');
        document.getElementById('calc-view').style.display = me.submitted ? 'none' : 'block';
        document.getElementById('waiting-view').style.display = me.submitted ? 'block' : 'none';
        
        // Live Leaderboard Ranking (Horse Race)
        const sorted = playersArr.map(p => {
            const grand = (p.history || []).reduce((a,b) => a + (typeof b === 'object' ? b.score : b), 0);
            const live = p.submitted ? 0 : (p.liveScore || 0);
            return { ...p, displayTotal: grand + live };
        }).sort((a,b) => b.displayTotal - a.displayTotal);
        
        document.getElementById('leaderboard').innerHTML = sorted.map(p => `
            <div class="p-row ${p.displayTotal >= 200 ? 'threshold-reached' : ''} ${p.isBusted ? 'busted-row' : ''}">
                <b>${p.name} ${p.submitted ? '✅' : '<span class="live-icon">⚡</span>'}</b>
                <span>${p.isBusted ? 'BUST' : p.displayTotal + ' pts'}</span>
            </div>`).join("");
        
        document.getElementById('nextRoundBtn').style.display = (data.host === myName && playersArr.every(p => p.submitted)) ? 'block' : 'none';
    }
    updateUI();
}

// --- Game Actions ---
window.submitRound = async () => {
    const snap = await get(ref(db, `games/${gameCode}`));
    const rNum = snap.val().roundNum;
    const score = busted ? 0 : (usedCards.reduce((a,b)=>a+b, 0) * mult) + bonuses.reduce((a,b)=>a+b, 0) + (usedCards.length === 7 ? 15 : 0);
    
    let h = (await get(ref(db, `games/${gameCode}/players/${myName}`))).val().history || [0];
    h[rNum] = { score, usedCards: [...usedCards], bonuses: [...bonuses], mult, busted };
    
    await update(ref(db, `games/${gameCode}/players/${myName}`), { 
        history: h, submitted: true, liveScore: 0, isBusted: false 
    });
    
    // Clear calculator for next round
    usedCards = []; bonuses = []; mult = 1; busted = false; 
    updateUI();
};

window.editScore = async () => {
    if (!gameCode || !myName) return;
    
    const snap = await get(ref(db, `games/${gameCode}`));
    const rNum = snap.val().roundNum;
    const me = snap.val().players[myName];

    // Restore previous selections for this round
    if (me.history && me.history[rNum]) {
        const prev = me.history[rNum];
        usedCards = [...(prev.usedCards || [])];
        bonuses = [...(prev.bonuses || [])];
        mult = prev.mult || 1;
        busted = prev.busted || false;
    }

    await update(ref(db, `games/${gameCode}/players/${myName}`), { submitted: false });
    updateUI();
};

window.readyForNextRound = async () => {
    const snap = await get(ref(db, `games/${gameCode}`));
    const up = { [`games/${gameCode}/roundNum`]: snap.val().roundNum + 1 };
    for (let p in snap.val().players) up[`games/${gameCode}/players/${p}/submitted`] = false;
    await update(ref(db), up);
};

// --- Navigation & Setup ---
window.adjustCount = (v) => {
    targetPlayerCount = Math.max(1, Math.min(20, targetPlayerCount + v));
    const disp = document.getElementById('playerCountDisplay');
    if (disp) disp.innerText = targetPlayerCount;
};

window.hostGameFromUI = async () => {
    if(!myName || myName.trim() === "") return alert("Enter your name first!");
    gameCode = Math.floor(100000 + Math.random() * 900000).toString();
    localStorage.setItem('f7_code', gameCode);
    await set(ref(db, `games/${gameCode}`), { host: myName, targetCount: targetPlayerCount, status: "waiting", roundNum: 1 });
    await set(ref(db, `games/${gameCode}/players/${myName}`), { name: myName, history: [0], submitted: false });
    onValue(ref(db, `games/${gameCode}`), syncApp);
};

window.openJoinPopup = () => {
    let c = prompt("Enter 6-digit code:");
    if(c && myName) joinGame(c);
};

async function joinGame(code) {
    gameCode = code;
    localStorage.setItem('f7_code', code);
    const pRef = ref(db, `games/${code}/players/${myName}`);
    const snap = await get(pRef);
    if (!snap.exists()) await set(pRef, { name: myName, history: [0], submitted: false });
    onValue(ref(db, `games/${code}`), syncApp);
}

window.showScreen = (id) => {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    const target = document.getElementById(id);
    if (target) target.style.display = 'flex';
};

window.triggerBust = () => {
    busted = !busted;
    if(busted) { usedCards = []; bonuses = []; mult = 1; }
    updateUI();
};

window.toggleMod = (id, val) => {
    if(id === 'm2') mult = (mult === 2) ? 1 : 2;
    else bonuses.includes(val) ? bonuses = bonuses.filter(b=>b!==val) : bonuses.push(val);
    updateUI();
};

window.resumeGame = () => { if(gameCode) joinGame(gameCode); };
window.leaveGame = () => { if(confirm("Leave?")) { localStorage.removeItem('f7_code'); location.reload(); }};
window.closeCelebration = () => document.getElementById('celebration-overlay').style.display = 'none';

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    const nInput = document.getElementById('userNameInput');
    if(nInput) {
        nInput.value = myName;
        nInput.oninput = () => { myName = nInput.value; localStorage.setItem('f7_name', myName); };
    }
    
    if(gameCode) document.getElementById('resume-btn').style.display = 'block';

    const grid = document.getElementById('cardGrid');
    if(grid) {
        grid.innerHTML = "";
        for(let i=0; i<=12; i++){
            let btn = document.createElement('button');
            btn.innerText = i;
            btn.onclick = () => { 
                if (busted) { busted = false; usedCards = [i]; } 
                else {
                    if(usedCards.includes(i)) usedCards = usedCards.filter(v=>v!==i); 
                    else if(usedCards.length < 7) usedCards.push(i);
                }
                updateUI(); 
            };
            grid.appendChild(btn);
        }
    }
});
