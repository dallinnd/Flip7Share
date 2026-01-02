import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, increment, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// 1. Firebase Configuration
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

// 2. Local State Variables
let gameCode = null;
let isHost = false;
let currentRound = 1;
let myName = localStorage.getItem('flip7_name') || "Player";

// Calculator state
let runningSum = 0;
let multiplier = 1;
let modifiers = 0;
let busted = false;

// 3. UI Initialization
document.getElementById('userNameInput').value = myName;

window.showScreen = (id) => {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'block';
};

// 4. Name Editing Logic
window.toggleNameEdit = () => {
    const input = document.getElementById('userNameInput');
    const isReadOnly = input.readOnly;
    input.readOnly = !isReadOnly;
    if (isReadOnly) {
        input.focus();
        input.style.borderBottom = "2px solid #4CAF50";
    } else {
        myName = input.value;
        localStorage.setItem('flip7_name', myName);
        input.style.borderBottom = "none";
    }
};

// 5. Host & Join Logic
window.hostGame = async () => {
    gameCode = Math.floor(100000 + Math.random() * 900000);
    isHost = true;
    const gameRef = ref(db, 'games/' + gameCode);
    
    await set(gameRef, {
        host: myName,
        round: 1,
        players: {} 
    });

    document.getElementById('host-controls').style.display = 'block';
    joinExistingGame(gameCode);
};

window.openJoinPopup = () => {
    const code = prompt("Enter 6-digit game code:");
    if (code) joinExistingGame(code);
};

async function joinExistingGame(code) {
    gameCode = code;
    document.getElementById('roomCodeDisplay').innerText = `Room: ${gameCode}`;
    
    // Add player to game
    await update(ref(db, `games/${gameCode}/players/${myName}`), {
        name: myName,
        roundScore: 0,
        grandTotal: 0
    });

    listenToGame();
    showScreen('game-screen');
}

// 6. Flip 7 Calculator Logic
window.addCard = (val) => {
    if (busted) return;
    runningSum += val;
    updateCalcUI();
};

window.setX2 = () => {
    multiplier = 2;
    updateCalcUI();
};

window.addModifier = (val) => {
    modifiers += val;
    updateCalcUI();
};

window.triggerBust = () => {
    busted = true;
    runningSum = 0;
    multiplier = 1;
    modifiers = 0;
    updateCalcUI();
};

function updateCalcUI() {
    const total = busted ? 0 : (runningSum * multiplier) + modifiers;
    document.getElementById('calc-display').innerText = busted ? "BUST!" : `Total: ${total}`;
}

// 7. Submission & Round Management
window.submitRound = async () => {
    const total = busted ? 0 : (runningSum * multiplier) + modifiers;
    
    await update(ref(db, `games/${gameCode}/players/${myName}`), {
        roundScore: total,
        grandTotal: increment(total)
    });

    // Reset local calculator
    runningSum = 0; multiplier = 1; modifiers = 0; busted = false;
    updateCalcUI();
    alert("Score Submitted!");
};

window.changeRound = (val) => {
    if (!isHost) return;
    currentRound += val;
    update(ref(db, `games/${gameCode}`), { round: currentRound });
};

// 8. Real-time Listener
function listenToGame() {
    onValue(ref(db, `games/${gameCode}`), (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        // Update Round Display
        document.getElementById('roomCodeDisplay').innerText = `Room: ${gameCode} | Round: ${data.round}`;

        // Update Leaderboard
        const players = data.players;
        const lb = document.getElementById('leaderboard');
        lb.innerHTML = "<h3>Scores</h3>";
        
        for (let p in players) {
            const player = players[p];
            lb.innerHTML += `<div>${player.name}: ${player.grandTotal} (Round: ${player.roundScore})</div>`;
            
            // Win Condition
            if (player.grandTotal >= 200) {
                alert(`${player.name} wins! Game over.`);
            }
        }
    });
}
