import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, increment } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = { /* PASTE YOUR CONFIG HERE */ };
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Initialization
let gameCode = localStorage.getItem('f7_code');
let myName = localStorage.getItem('f7_name') || "";
let usedCards = JSON.parse(localStorage.getItem('f7_used') || "[]");
let multipliers = 1, bonus = 0, isBusted = false;

const nameInput = document.getElementById('userNameInput');
nameInput.value = myName;
nameInput.oninput = () => {
    myName = nameInput.value;
    localStorage.setItem('f7_name', myName);
};

if(gameCode && myName) document.getElementById('resume-btn').style.display = 'block';

// Navigation
window.showScreen = (id) => {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'block';
};

// --- Flip 7 Card Logic ---
const grid = document.getElementById('cardGrid');
for(let i=1; i<=12; i++){
    let btn = document.createElement('button');
    btn.id = 'card-'+i; btn.innerText = i;
    btn.onclick = () => {
        if(usedCards.includes(i)) usedCards = usedCards.filter(v => v !== i);
        else usedCards.push(i);
        updateUI();
    };
    grid.appendChild(btn);
}

window.toggleMod = (id, val, mult) => {
    if(id === 'm2') multipliers = (multipliers === 2) ? 1 : 2;
    else bonus = (bonus === val) ? 0 : val;
    updateUI();
};

window.triggerBust = () => {
    isBusted = true; usedCards = []; multipliers = 1; bonus = 0;
    updateUI();
};

function updateUI() {
    let sum = usedCards.reduce((a, b) => a + b, 0);
    let total = isBusted ? 0 : (sum * multipliers) + bonus;
    document.getElementById('calc-display').innerText = isBusted ? "BUST!" : "Total: " + total;
    
    // Highlight used cards in Teal
    for(let i=1; i<=12; i++) {
        let b = document.getElementById('card-'+i);
        b.style.background = usedCards.includes(i) ? "var(--teal)" : "rgba(255,255,255,0.2)";
    }
    localStorage.setItem('f7_used', JSON.stringify(usedCards));
}

// --- Firebase Sync ---
window.hostGame = async () => {
    if(!myName) return alert("Please enter your name first!");
    gameCode = Math.floor(100000 + Math.random() * 900000);
    localStorage.setItem('f7_code', gameCode);
    await set(ref(db, 'games/' + gameCode), { host: myName, players: {} });
    joinGame(gameCode);
};

window.openJoinPopup = () => {
    if(!myName) return alert("Please enter your name first!");
    let c = prompt("Enter 6-digit Code:");
    if(c) { gameCode = c; localStorage.setItem('f7_code', c); joinGame(c); }
};

async function joinGame(code) {
    await update(ref(db, `games/${code}/players/${myName}`), { name: myName, grandTotal: 0, submitted: false });
    onValue(ref(db, `games/${code}`), syncGame);
    showScreen('game-screen');
}

window.submitRound = async () => {
    let sum = usedCards.reduce((a, b) => a + b, 0);
    let total = isBusted ? 0 : (sum * multipliers) + bonus;
    await update(ref(db, `games/${gameCode}/players/${myName}`), { 
        lastScore: total, grandTotal: increment(total), submitted: true 
    });
    document.getElementById('calc-view').style.display = 'none';
    document.getElementById('waiting-view').style.display = 'block';
};

function syncGame(snap) {
    const data = snap.val();
    if(!data) return;
    const players = Object.values(data.players);
    const allDone = players.every(p => p.submitted === true);

    let lb = document.getElementById('leaderboard');
    lb.innerHTML = "";
    players.sort((a,b) => b.grandTotal - a.grandTotal).forEach(p => {
        lb.innerHTML += `<div class="p-row"><span>${p.name}</span><span>${p.grandTotal}</span></div>`;
    });

    document.getElementById('nextRoundBtn').style.display = allDone ? 'block' : 'none';
    if(players.every(p => p.submitted === false)) resetLocalRound();
}

window.readyForNextRound = async () => {
    await update(ref(db, `games/${gameCode}/players/${myName}`), { submitted: false });
};

function resetLocalRound() {
    usedCards = []; multipliers = 1; bonus = 0; isBusted = false;
    updateUI();
    document.getElementById('calc-view').style.display = 'block';
    document.getElementById('waiting-view').style.display = 'none';
}
