import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, increment } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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
let usedCards = [], mult = 1, bonus = 0, busted = false;

// Init Name Input
const nameInput = document.getElementById('userNameInput');
nameInput.value = myName;
nameInput.oninput = () => { myName = nameInput.value; localStorage.setItem('f7_name', myName); };

if(gameCode && myName) document.getElementById('resume-btn').style.display = 'block';

window.showScreen = (id) => {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'block';
};

// --- Hosting & Join Logic ---
window.askPlayerCount = () => {
    if(!myName) return alert("Enter your name first!");
    const count = prompt("Total players (including you):", "4");
    if(count) hostGame(parseInt(count));
};

async function hostGame(target) {
    gameCode = Math.floor(100000 + Math.random() * 900000);
    localStorage.setItem('f7_code', gameCode);
    await set(ref(db, 'games/' + gameCode), { host: myName, targetCount: target, status: "waiting", players: {} });
    joinGame(gameCode);
}

window.openJoinPopup = () => {
    if(!myName) return alert("Enter your name first!");
    let c = prompt("6-digit code:");
    if(c) { gameCode = c; localStorage.setItem('f7_code', c); joinGame(c); }
};

window.resumeGame = () => joinGame(gameCode);

async function joinGame(code) {
    await update(ref(db, `games/${code}/players/${myName}`), { name: myName, grandTotal: 0, submitted: false, lastScore: 0 });
    onValue(ref(db, `games/${code}`), syncApp);
}

window.leaveGame = () => {
    if (confirm("Are you sure you want to leave the game?")) {
        localStorage.removeItem('f7_code');
        location.reload();
    }
};

// --- Card Grid Generation ---
const grid = document.getElementById('cardGrid');
for(let i=1; i<=12; i++){
    let btn = document.createElement('button');
    btn.id = 'c-'+i; btn.innerText = i;
    btn.onclick = () => {
        if(usedCards.includes(i)) usedCards = usedCards.filter(v => v !== i);
        else usedCards.push(i);
        updateUI();
    };
    grid.appendChild(btn);
}

// --- Calculator Logic ---
window.toggleMod = (id, val) => {
    if(id === 'm2') mult = (mult === 2) ? 1 : 2;
    else bonus = (bonus === val) ? 0 : val;
    updateUI();
};

window.triggerBust = () => { 
    busted = true; usedCards = []; mult = 1; bonus = 0; 
    const display = document.getElementById('calc-display');
    display.classList.add('shake');
    setTimeout(() => display.classList.remove('shake'), 400);
    updateUI(); 
};

function updateUI() {
    let sum = usedCards.reduce((a, b) => a + b, 0);
    let total = busted ? 0 : (sum * mult) + bonus;
    const display = document.getElementById('calc-display');
    display.innerText = busted ? "BUST!" : total;
    display.style.color = busted ? "#ff4444" : "white";

    for(let i=1; i<=12; i++) {
        const b = document.getElementById('c-'+i);
        if(b) b.style.background = usedCards.includes(i) ? "var(--teal)" : "rgba(255,255,255,0.2)";
    }
    document.getElementById('btn-m2').style.background = (mult === 2) ? "var(--teal)" : "rgba(255,255,255,0.1)";
    [2, 4, 6, 8, 10].forEach(v => {
        const b = document.getElementById('btn-p' + v);
        if(b) b.style.background = (bonus === v) ? "var(--teal)" : "rgba(255,255,255,0.1)";
    });
}

// --- Sync & Round Logic ---
function syncApp(snap) {
    const data = snap.val(); if(!data) return;
    const players = Object.values(data.players || {});
    const me = data.players[myName];
    
    if (data.status === "waiting") {
        showScreen('lobby-screen');
        document.getElementById('roomDisplayLobby').innerText = "Game: " + gameCode;
        document.getElementById('lobby-status').innerText = `Joined: ${players.length} / ${data.targetCount}`;
        document.getElementById('player-list').innerHTML = players.map(p => `<div class="p-tag">${p.name}</div>`).join("");
        if(players.length >= data.targetCount && data.host === myName) update(ref(db, 'games/'+gameCode), {status: "active"});
        return;
    }

    showScreen('game-screen');
    document.getElementById('roomCodeDisplay').innerText = "Game: " + gameCode;
    
    // Auto-Toggle Views
    if (me && me.submitted) {
        document.getElementById('calc-view').style.display = 'none';
        document.getElementById('waiting-view').style.display = 'block';
    } else {
        document.getElementById('calc-view').style.display = 'block';
        document.getElementById('waiting-view').style.display = 'none';
    }

    const allDone = players.length >= data.targetCount && players.every(p => p.submitted === true);
    let lb = document.getElementById('leaderboard');
    lb.innerHTML = "";
    
    players.sort((a,b) => b.grandTotal - a.grandTotal).forEach(p => {
        const isMeClass = p.name === myName ? 'is-me' : '';
        lb.innerHTML += `
            <div class="p-row ${isMeClass}">
                <span>${p.name} ${p.submitted ? '✅' : '⏳'}</span>
                <span>${p.grandTotal} <small>(+${p.lastScore || 0})</small></span>
            </div>`;
        if(p.grandTotal >= 200) alert(p.name + " WINS!");
    });

    // Only host can advance round
    const nextBtn = document.getElementById('nextRoundBtn');
    if (allDone && data.host === myName) {
        nextBtn.style.display = 'block';
    } else {
        nextBtn.style.display = 'none';
        if (allDone) lb.innerHTML += `<p class="pulse">Waiting for host to start next round...</p>`;
    }
}

window.submitRound = async () => {
    let sum = usedCards.reduce((a, b) => a + b, 0);
    let total = busted ? 0 : (sum * mult) + bonus;
    await update(ref(db, `games/${gameCode}/players/${myName}`), { grandTotal: increment(total), lastScore: total, submitted: true });
    usedCards = []; mult = 1; bonus = 0; busted = false; updateUI();
};

window.readyForNextRound = () => {
    // We update every player's submitted status to false
    const updates = {};
    onValue(ref(db, `games/${gameCode}/players`), (snap) => {
        const players = snap.val();
        for(let p in players) {
            updates[`games/${gameCode}/players/${p}/submitted`] = false;
        }
    }, { onlyOnce: true });
    update(ref(db), updates);
};
