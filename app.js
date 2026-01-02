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

let gameCode, isHost = false, myName = localStorage.getItem('f7name') || "Player";
let runningSum = 0, multiplier = 1, modifiers = 0, busted = false;

// UI Setup
window.showScreen = (id) => {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'block';
};

// Name Edit with Keyboard Activation
window.activateNameEdit = () => {
    const input = document.getElementById('userNameInput');
    input.readOnly = false;
    input.focus();
    input.onblur = () => {
        input.readOnly = true;
        myName = input.value;
        localStorage.setItem('f7name', myName);
    };
};

// Generate Card Buttons 1-12
const grid = document.getElementById('cardGrid');
for(let i=1; i<=12; i++) {
    let btn = document.createElement('button');
    btn.innerText = i;
    btn.onclick = () => { runningSum += i; updateCalc(); };
    grid.appendChild(btn);
}

// Calc Logic
window.setX2 = () => { multiplier = 2; updateCalc(); };
window.addModifier = (v) => { modifiers += v; updateCalc(); };
window.triggerBust = () => { busted = true; runningSum = 0; multiplier = 1; modifiers = 0; updateCalc(); };
function updateCalc() {
    const total = busted ? 0 : (runningSum * multiplier) + modifiers;
    document.getElementById('calc-display').innerText = busted ? "BUST!" : `Total: ${total}`;
}

// Firebase Logic
window.hostGame = async () => {
    gameCode = Math.floor(100000 + Math.random() * 900000);
    isHost = true;
    await set(ref(db, 'games/' + gameCode), { host: myName, round: 1 });
    document.getElementById('host-controls').style.display = 'flex';
    joinGame(gameCode);
};

window.openJoinPopup = () => {
    const c = prompt("Enter 6-digit code:");
    if(c) joinGame(c);
};

async function joinGame(c) {
    gameCode = c;
    await update(ref(db, `games/${gameCode}/players/${myName}`), { name: myName, grandTotal: 0 });
    onValue(ref(db, `games/${gameCode}`), syncGame);
    showScreen('game-screen');
}

window.submitRound = () => {
    const total = busted ? 0 : (runningSum * multiplier) + modifiers;
    update(ref(db, `games/${gameCode}/players/${myName}`), { 
        lastRound: total, 
        grandTotal: increment(total) 
    });
    triggerBust(); busted = false; updateCalc();
};

function syncGame(snap) {
    const data = snap.val();
    if(!data) return;
    document.getElementById('roomCodeDisplay').innerText = `Room: ${gameCode} | Round: ${data.round}`;
    let lb = document.getElementById('leaderboard');
    lb.innerHTML = "";
    Object.values(data.players || {}).forEach(p => {
        lb.innerHTML += `<div>${p.name}: <b>${p.grandTotal}</b></div>`;
        if(p.grandTotal >= 200) alert(p.name + " WINS!");
    });
}
