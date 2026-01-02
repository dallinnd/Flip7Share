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
let usedCards = [], bonuses = [], mult = 1, busted = false, currentGrandTotal = 0;
let targetPlayerCount = 4, hasCelebrated = false;

// FIX: Counter logic with proper range and display update
window.adjustCount = (v) => {
    let newVal = targetPlayerCount + v;
    if (newVal >= 1 && newVal <= 20) {
        targetPlayerCount = newVal;
        const disp = document.getElementById('playerCountDisplay');
        if (disp) disp.innerText = targetPlayerCount;
    }
};

window.hostGameFromUI = async () => {
    if(!myName || myName.trim() === "") return alert("Please enter your name first!");
    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    gameCode = newCode;
    localStorage.setItem('f7_code', gameCode);
    try {
        await set(ref(db, `games/${gameCode}`), { host: myName, targetCount: targetPlayerCount, status: "waiting", roundNum: 1 });
        await set(ref(db, `games/${gameCode}/players/${myName}`), { name: myName, history: [0], submitted: false });
        onValue(ref(db, `games/${gameCode}`), syncApp);
    } catch (e) { alert("Hosting failed: " + e.message); }
};

window.openJoinPopup = () => {
    let c = prompt("Enter 6-digit code:");
    if(c && myName) { gameCode = c; localStorage.setItem('f7_code', c); joinGame(c); }
    else if (!myName) alert("Enter your name on the home screen first!");
};

window.showScreen = (id) => {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    const target = document.getElementById(id);
    if (target) target.style.display = 'flex';
};

window.triggerBust = () => {
    busted = !busted;
    if(busted) { 
        usedCards = []; bonuses = []; mult = 1; hasCelebrated = false; 
    }
    updateUI();
};

window.toggleMod = (id, val) => {
    if(id === 'm2') mult = (mult === 2) ? 1 : 2;
    else bonuses.includes(val) ? bonuses = bonuses.filter(b=>b!==val) : bonuses.push(val);
    updateUI();
};

window.closeCelebration = () => {
    document.getElementById('celebration-overlay').style.display = 'none';
};

window.resumeGame = () => joinGame(gameCode);
window.leaveGame = () => { if(confirm("Leave?")) { localStorage.removeItem('f7_code'); location.reload(); }};

async function joinGame(code) {
    const pRef = ref(db, `games/${code}/players/${myName}`);
    const snap = await get(pRef);
    if (!snap.exists()) await set(pRef, { name: myName, history: [0], submitted: false });
    onValue(ref(db, `games/${code}`), syncApp);
}

function updateUI() {
    let sum = usedCards.reduce((a, b) => a + b, 0);
    let totalB = bonuses.reduce((a, b) => a + b, 0);
    const hasF7 = (usedCards.length === 7);
    
    // BUG FIX: Celebration Popup Trigger
    if(hasF7 && !hasCelebrated && !busted) {
        document.getElementById('celebration-overlay').style.display = 'flex';
        hasCelebrated = true;
    }
    if(!hasF7) hasCelebrated = false;

    let roundScore = busted ? 0 : (sum * mult) + totalB + (hasF7 ? 15 : 0);
    const rDisp = document.getElementById('round-display');
    const gDisp = document.getElementById('grand-display');
    
    if (rDisp) rDisp.innerText = busted ? "BUST" : roundScore;
    if (gDisp) gDisp.innerText = currentGrandTotal + roundScore;
    
    document.getElementById('bust-toggle-btn').className = busted ? "big-btn bust-btn bust-active" : "big-btn bust-btn";
    const banner = document.getElementById('flip7-banner');
    if (banner) banner.style.display = (hasF7 && !busted) ? 'block' : 'none';

    // Update Grid highlights
    const grid = document.getElementById('cardGrid');
    if(grid) {
        for(let i=0; i<=12; i++) {
            const b = grid.children[i];
            if(b) b.style.background = usedCards.includes(i) ? "var(--teal)" : "rgba(255,255,255,0.2)";
        }
    }
    const m2Btn = document.getElementById('btn-m2');
    if (m2Btn) m2Btn.className = (mult === 2) ? "mod-btn-active" : "";
    [2,4,6,8,10].forEach(v => {
        const b = document.getElementById('btn-p' + v);
        if(b) b.className = bonuses.includes(v) ? "mod-btn-active" : "";
    });
}

function syncApp(snap) {
    const data = snap.val(); if(!data) return;
    const me = data.players[myName]; if(!me) return;
    const playersArr = Object.values(data.players || {});

    // BUG FIX: Calculate grand total up to previous round
    const history = me.history || [0];
    currentGrandTotal = history.reduce((acc, entry, idx) => {
        if (idx > 0 && idx < data.roundNum) {
            return acc + (typeof entry === 'object' ? entry.score : entry);
        }
        return acc;
    }, 0);
    
    if (data.status === "waiting") {
        window.showScreen('lobby-screen');
        document.getElementById('roomDisplayLobby').innerText = "Game: " + gameCode;
        document.getElementById('lobby-status').innerText = `Joined: ${playersArr.length} / ${data.targetCount}`;
        document.getElementById('player-list').innerHTML = playersArr.map(p => `<div class="p-row"><b>${p.name}</b></div>`).join("");
        if(playersArr.length >= data.targetCount && data.host === myName) update(ref(db, `games/${gameCode}`), { status: "active" });
    } else {
        window.showScreen('game-screen');
        document.getElementById('roomCodeDisplay').innerText = `CODE: ${gameCode} | R${data.roundNum}`;
        document.getElementById('calc-view').style.display = me.submitted ? 'none' : 'block';
        document.getElementById('waiting-view').style.display = me.submitted ? 'block' : 'none';
        
        const sorted = playersArr.map(p => ({ 
            ...p, 
            total: (p.history || []).reduce((a,b) => a + (typeof b === 'object' ? b.score : b), 0) 
        })).sort((a,b)=>b.total-a.total);
        
        document.getElementById('leaderboard').innerHTML = sorted.map(p => `
            <div class="p-row ${p.total >= 200 ? 'threshold-reached' : ''}">
                <b>${p.name} ${p.submitted ? '✅' : '⏳'}</b>
                <span>${p.total} ${p.total >= 200 ? '🔥' : 'pts'}</span>
            </div>`).join("");
        
        // Logs UI logic
        let hHTML = "";
        for (let r = data.roundNum; r >= 1; r--) {
            let rows = playersArr.map(p => {
                let sObj = p.history && p.history[r];
                let sVal = sObj ? (typeof sObj === 'object' ? sObj.score : sObj) : 0;
                return `<div class="history-row"><span>${p.name}</span><b>${sVal}</b></div>`;
            }).join("");
            hHTML += `
                <div class="history-block" onclick="window.revertToRound(${r})">
                    <span class="round-label">ROUND ${r} ${data.host === myName ? '↩️' : ''}</span>
                    ${rows}
                </div>`;
        }
        document.getElementById('history-log-container').innerHTML = hHTML;
        document.getElementById('nextRoundBtn').style.display = (data.host === myName && playersArr.every(p => p.submitted)) ? 'block' : 'none';
    }
    updateUI();
}

window.submitRound = async () => {
    const snap = await get(ref(db, `games/${gameCode}`));
    const rNum = snap.val().roundNum;
    const score = busted ? 0 : (usedCards.reduce((a,b)=>a+b, 0) * mult) + bonuses.reduce((a,b)=>a+b, 0) + (usedCards.length === 7 ? 15 : 0);
    const roundState = { score, usedCards: [...usedCards], bonuses: [...bonuses], mult, busted };
    let h = (await get(ref(db, `games/${gameCode}/players/${myName}`))).val().history || [0];
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

window.revertToRound = async (r) => {
    const snap = await get(ref(db, `games/${gameCode}`));
    const data = snap.val();
    if (data.host === myName && confirm(`Rewind to Round ${r}?`)) {
        const up = { [`games/${gameCode}/roundNum`]: r };
        for (let p in data.players) {
            up[`games/${gameCode}/players/${p}/history`] = (data.players[p].history || [0]).slice(0, r + 1);
            up[`games/${gameCode}/players/${p}/submitted`] = false;
        }
        await update(ref(db), up);
        const saved = data.players[myName].history[r];
        if (saved && typeof saved === 'object') {
            usedCards = saved.usedCards || []; bonuses = saved.bonuses || [];
            mult = saved.mult || 1; busted = saved.busted || false;
        } else { usedCards = []; bonuses = []; mult = 1; busted = false; }
        window.showScreen('game-screen');
        updateUI();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const nInput = document.getElementById('userNameInput');
    if(nInput) {
        nInput.value = myName;
        nInput.oninput = () => { myName = nInput.value; localStorage.setItem('f7_name', myName); };
    }
    const grid = document.getElementById('cardGrid');
    if (grid) {
        grid.innerHTML = "";
        for(let i=0; i<=12; i++){
            let btn = document.createElement('button'); btn.innerText = i;
            btn.onclick = () => { 
                // BUG FIX: Selection un-busts the user
                if (busted) {
                    busted = false;
                    usedCards = [i];
                } else {
                    if(usedCards.includes(i)) usedCards = usedCards.filter(v=>v!==i); 
                    else if(usedCards.length < 7) usedCards.push(i);
                }
                updateUI(); 
            };
            grid.appendChild(btn);
        }
    }
    // FIX: Initialize the counter display correctly
    const countDisp = document.getElementById('playerCountDisplay');
    if(countDisp) countDisp.innerText = targetPlayerCount;
});
