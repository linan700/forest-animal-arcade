"use strict";

const STORAGE_KEY = "forestAnimalArcade.session.v2";

const animals = {
  lion: { name: "狮子", image: "assets/lion.webp", payouts: { red: 40, yellow: 30, green: 20 } },
  panda: { name: "熊猫", image: "assets/panda.webp", payouts: { red: 20, yellow: 15, green: 10 } },
  monkey: { name: "猴子", image: "assets/monkey.webp", payouts: { red: 10, yellow: 8, green: 6 } },
  rabbit: { name: "兔子", image: "assets/rabbit.webp", payouts: { red: 6, yellow: 4, green: 3 } }
};

const colors = {
  red: { name: "红", hex: "#ff264f" },
  yellow: { name: "黄", hex: "#ffd51f" },
  green: { name: "绿", hex: "#18df73" }
};

const ringAnimals = [
  "lion", "rabbit", "monkey", "panda",
  "lion", "rabbit", "monkey", "panda",
  "lion", "rabbit", "monkey", "panda"
];

let sectors = [];
let previousRoundColors = [];

const initialState = () => ({
  balance: 10000,
  jackpot: 10000,
  selectedChip: 10,
  bets: {},
  lastBets: {},
  history: [],
  roundColors: [],
  rounds: 0,
  sound: true
});

let state = loadState();
let spinning = false;
let activeIndex = -1;
let toastTimer = null;
let audioContext = null;

const elements = {
  balance: document.querySelector("#balanceAmount"),
  balanceTop: document.querySelector("#balanceTop"),
  balanceDisplay: document.querySelector("#balanceDisplay"),
  totalBet: document.querySelector("#totalBet"),
  jackpot: document.querySelector("#jackpot"),
  sectorLayer: document.querySelector("#sectorLayer"),
  betGrid: document.querySelector("#betGrid"),
  payoutTable: document.querySelector("#payoutTable"),
  historyList: document.querySelector("#historyList"),
  roundCount: document.querySelector("#roundCount"),
  roundState: document.querySelector("#roundState"),
  resultName: document.querySelector("#resultName"),
  resultPrize: document.querySelector("#resultPrize"),
  resultAnimal: document.querySelector("#resultAnimal"),
  centerStage: document.querySelector("#centerStage"),
  wheel: document.querySelector("#wheel"),
  cinematicResult: document.querySelector("#cinematicResult"),
  cinematicEyebrow: document.querySelector("#cinematicEyebrow"),
  cinematicTitle: document.querySelector("#cinematicTitle"),
  chipSelector: document.querySelector("#chipSelector"),
  clearButton: document.querySelector("#clearButton"),
  repeatButton: document.querySelector("#repeatButton"),
  spinButton: document.querySelector("#spinButton"),
  soundToggle: document.querySelector("#soundToggle"),
  gameOverOverlay: document.querySelector("#gameOverOverlay"),
  exitGameButton: document.querySelector("#exitGameButton"),
  toast: document.querySelector("#toast")
};

const fullscreenToggle = document.querySelector("#fullscreenToggle");

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  } catch {
    showToast("当前窗口不支持全屏切换");
  }
}

fullscreenToggle?.addEventListener("click", toggleFullscreen);
document.addEventListener("fullscreenchange", () => {
  fullscreenToggle?.setAttribute("aria-pressed", document.fullscreenElement ? "true" : "false");
  fullscreenToggle?.setAttribute("title", document.fullscreenElement ? "退出全屏" : "进入全屏");
  window.arcade3d?.resize();
});

function loadState() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    return { ...initialState(), ...parsed };
  } catch {
    return initialState();
  }
}

function saveState() {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatNumber(value) {
  return Math.max(0, Math.floor(value)).toLocaleString("zh-CN");
}

function totalBet() {
  return Object.values(state.bets).reduce((sum, value) => sum + value, 0);
}

function isGameOver() {
  return state.balance <= 0 && totalBet() === 0;
}

function cryptoRandom() {
  if (window.crypto?.getRandomValues) {
    const bucket = new Uint32Array(1);
    window.crypto.getRandomValues(bucket);
    return bucket[0] / 4294967296;
  }
  return Math.random();
}

function shuffled(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(cryptoRandom() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function createRoundSectors() {
  const colorPools = Object.keys(animals).reduce((pools, animal) => {
    pools[animal] = shuffled(["red", "yellow", "green"]);
    return pools;
  }, {});

  return ringAnimals.map((animal, index) => {
    const color = colorPools[animal].pop();
    return {
      index,
      key: `${animal}-${color}`,
      animal,
      color,
      payout: animals[animal].payouts[color]
    };
  });
}

function everyAnimalChanged(nextSectors) {
  if (!previousRoundColors.length) return true;

  return Object.keys(animals).every((animal) => {
    const indices = ringAnimals
      .map((ringAnimal, index) => ringAnimal === animal ? index : -1)
      .filter(index => index >= 0);
    return indices.some(index => nextSectors[index].color !== previousRoundColors[index]);
  });
}

function randomizeRoundColors() {
  let nextSectors;
  let attempts = 0;

  do {
    nextSectors = createRoundSectors();
    attempts += 1;
  } while (!everyAnimalChanged(nextSectors) && attempts < 24);

  previousRoundColors = nextSectors.map(sector => sector.color);
  sectors = nextSectors;
  state.roundColors = [...previousRoundColors];
  activeIndex = -1;
  renderWheel();
  setActiveSector(-1);
  window.arcade3d?.setRoundColors(sectors.map(sector => sector.color));
}

function restoreRoundColors(roundColors) {
  const validColors = new Set(["red", "yellow", "green"]);
  if (
    !Array.isArray(roundColors)
    || roundColors.length !== ringAnimals.length
    || roundColors.some(color => !validColors.has(color))
  ) {
    randomizeRoundColors();
    return;
  }

  sectors = ringAnimals.map((animal, index) => {
    const color = roundColors[index];
    return {
      index,
      key: `${animal}-${color}`,
      animal,
      color,
      payout: animals[animal].payouts[color]
    };
  });
  previousRoundColors = [...roundColors];
  renderWheel();
  setActiveSector(-1);
  window.arcade3d?.setRoundColors(roundColors);
}

function renderWheel() {
  elements.sectorLayer.innerHTML = sectors.map((sector, index) => {
    const angle = (index / sectors.length) * Math.PI * 2 - Math.PI / 2;
    const x = 50 + Math.cos(angle) * 41;
    const y = 50 + Math.sin(angle) * 39;
    const animal = animals[sector.animal];
    const color = colors[sector.color];
    return `
      <div class="wheel-sector" data-index="${index}" style="left:${x}%;top:${y}%;--sector-color:${color.hex}">
        <img src="${animal.image}" alt="${color.name}${animal.name}">
        <em class="sector-multiplier">×${sector.payout}</em>
      </div>`;
  }).join("");
}

function renderBetGrid() {
  const displayOrder = ["lion", "panda", "monkey", "rabbit"];
  elements.betGrid.innerHTML = displayOrder.flatMap(animalKey => ["red", "yellow", "green"].map(colorKey => {
    const animal = animals[animalKey];
    const color = colors[colorKey];
    const key = `${animalKey}-${colorKey}`;
    const amount = state.bets[key] || 0;
    return `
      <button type="button" class="bet-cell ${amount ? "has-bet" : ""}" data-bet-key="${key}"
        style="--cell-color:${color.hex}" aria-label="下注${color.name}${animal.name}，倍率${animal.payouts[colorKey]}">
        <img src="${animal.image}" alt="">
        <span class="bet-cell-name">${color.name}${animal.name}</span>
        <span class="bet-cell-multiplier">×${animal.payouts[colorKey]}</span>
        <strong class="bet-cell-amount">${amount ? formatNumber(amount) : "下注"}</strong>
      </button>`;
  })).join("");
}

function renderPayoutTable() {
  elements.payoutTable.innerHTML = Object.entries(animals).map(([, animal]) => `
    <div class="payout-row">
      <img src="${animal.image}" alt="">
      <strong>${animal.name}</strong>
      <span class="payout-value" style="background:${colors.red.hex}">${animal.payouts.red}</span>
      <span class="payout-value" style="background:${colors.yellow.hex}">${animal.payouts.yellow}</span>
      <span class="payout-value" style="background:${colors.green.hex}">${animal.payouts.green}</span>
    </div>`).join("");
}

function renderHistory() {
  elements.roundCount.textContent = `第 ${state.rounds} 局`;
  if (!state.history.length) {
    elements.historyList.innerHTML = '<div class="history-empty">尚无记录</div>';
    return;
  }

  elements.historyList.innerHTML = state.history.slice(0, 7).map(item => {
    const animal = animals[item.animal];
    const color = colors[item.color];
    return `
      <div class="history-item" style="--item-color:${color.hex}">
        <img src="${animal.image}" alt="">
        <div><strong>${color.name}${animal.name}</strong><small>${item.special}</small></div>
        <em>${item.win > 0 ? `+${formatNumber(item.win)}` : "未中"}</em>
      </div>`;
  }).join("");
}

function renderState() {
  const gameOver = isGameOver();
  const balanceText = formatNumber(state.balance);
  elements.balance.textContent = balanceText;
  elements.balanceTop.textContent = `${balanceText}元`;
  elements.balanceDisplay.classList.toggle("empty", gameOver);
  elements.totalBet.textContent = formatNumber(totalBet());
  elements.jackpot.textContent = formatNumber(state.jackpot);
  elements.clearButton.disabled = spinning || gameOver || totalBet() === 0;
  elements.repeatButton.disabled = spinning || gameOver || Object.keys(state.lastBets).length === 0;
  elements.spinButton.disabled = spinning || gameOver || totalBet() === 0;
  elements.soundToggle.textContent = state.sound ? "♪" : "×";
  elements.soundToggle.setAttribute("aria-pressed", state.sound ? "true" : "false");

  document.querySelectorAll(".chip").forEach(chip => {
    chip.classList.toggle("active", Number(chip.dataset.chip) === state.selectedChip);
    chip.disabled = spinning || gameOver;
  });

  document.querySelectorAll(".bet-cell").forEach(cell => {
    const amount = state.bets[cell.dataset.betKey] || 0;
    cell.classList.toggle("has-bet", amount > 0);
    cell.querySelector(".bet-cell-amount").textContent = amount ? formatNumber(amount) : "下注";
    cell.disabled = spinning || gameOver;
  });

  renderHistory();
}

function placeBet(key, amount = state.selectedChip) {
  if (spinning || isGameOver()) return;
  if (state.balance < amount) {
    showToast("积分不足，请选择较小筹码");
    tone(150, 0.12, "square", 0.04);
    return;
  }
  state.balance -= amount;
  state.bets[key] = (state.bets[key] || 0) + amount;
  state.jackpot += Math.max(1, Math.floor(amount * 0.02));
  tone(420 + Math.min(amount, 500), 0.05, "sine", 0.025);
  saveState();
  renderState();
}

function clearBets({ refund = true } = {}) {
  if (spinning) return;
  if (refund) state.balance += totalBet();
  state.bets = {};
  saveState();
  renderState();
}

function repeatLastBets() {
  if (spinning || isGameOver()) return;
  const required = Object.values(state.lastBets).reduce((sum, value) => sum + value, 0);
  if (!required) return;
  if (state.balance < required) {
    showToast(`重复下注需要 ${formatNumber(required)} 积分`);
    return;
  }
  state.balance -= required;
  state.bets = { ...state.lastBets };
  state.jackpot += Math.max(1, Math.floor(required * 0.02));
  saveState();
  renderState();
}

function chooseWeightedSector() {
  const weights = sectors.map(sector => Math.max(1, Math.round(72 / sector.payout)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = cryptoRandom() * total;
  for (let index = 0; index < weights.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) return sectors[index];
  }
  return sectors[sectors.length - 1];
}

function chooseSpecial() {
  const roll = cryptoRandom();
  if (roll < 0.008) return "jackpot";
  if (roll < 0.03) return "color";
  if (roll < 0.065) return "animal";
  if (roll < 0.12) return "double";
  return "normal";
}

function calculateWin(target, special, bets) {
  let win = 0;
  let jackpotAwarded = false;

  const payKey = key => {
    const sector = sectors.find(item => item.key === key);
    if (sector && bets[key]) win += bets[key] * sector.payout;
  };

  if (special === "animal") {
    ["red", "yellow", "green"].forEach(color => payKey(`${target.animal}-${color}`));
  } else if (special === "color") {
    Object.keys(animals).forEach(animal => payKey(`${animal}-${target.color}`));
  } else {
    payKey(target.key);
  }

  if (special === "double") win *= 2;
  if (special === "jackpot" && bets[target.key]) {
    win += state.jackpot;
    jackpotAwarded = true;
  }

  return { win, jackpotAwarded };
}

function specialName(special) {
  return {
    normal: "普通奖",
    double: "双倍时刻",
    animal: "动物派对",
    color: "同色狂欢",
    jackpot: "森林彩金"
  }[special];
}

async function spin() {
  if (spinning || totalBet() === 0) return;
  spinning = true;
  state.lastBets = { ...state.bets };
  const roundBets = { ...state.bets };
  const target = chooseWeightedSector();
  const special = chooseSpecial();
  const start = activeIndex < 0 ? 0 : activeIndex;
  const distance = (target.index - start + sectors.length) % sectors.length;
  const steps = 4 * sectors.length + distance;

  elements.wheel.classList.remove("winner-cinematic");
  elements.cinematicResult.classList.remove("show");
  elements.wheel.classList.add("is-spinning");

  elements.roundState.textContent = "转盘运行中";
  elements.resultName.textContent = "森林巡游";
  elements.resultPrize.textContent = "灯光正在减速";
  elements.centerStage.classList.remove("reveal");
  renderState();

  if (window.arcade3d?.ready) {
    await window.arcade3d.spinTo(target.index, {
      duration: 5600,
      onStep: sectorIndex => {
        activeIndex = sectorIndex;
        tickTone(sectorIndex + 1, sectors.length);
      }
    });
    activeIndex = target.index;
  } else {
    for (let step = 1; step <= steps; step += 1) {
      activeIndex = (start + step) % sectors.length;
      setActiveSector(activeIndex);
      tickTone(step, steps);
      const progress = step / steps;
      const delay = 35 + Math.pow(progress, 3.1) * 235;
      await wait(delay);
    }
  }

  const { win, jackpotAwarded } = calculateWin(target, special, roundBets);
  state.balance += win;
  if (jackpotAwarded) state.jackpot = 10000;
  state.rounds += 1;
  state.history.unshift({
    animal: target.animal,
    color: target.color,
    special: specialName(special),
    win,
    time: Date.now()
  });
  state.history = state.history.slice(0, 12);
  state.bets = {};

  const targetAnimal = animals[target.animal];
  const targetColor = colors[target.color];
  elements.resultAnimal.src = targetAnimal.image;
  elements.roundState.textContent = specialName(special);
  elements.resultName.textContent = `${targetColor.name}${targetAnimal.name}`;
  elements.resultPrize.textContent = win > 0 ? `赢得 ${formatNumber(win)} 元` : `倍率 ×${target.payout}`;
  elements.centerStage.classList.add("reveal");
  document.querySelector(`[data-index="${target.index}"]`)?.classList.add("winner");
  elements.wheel.classList.remove("is-spinning");
  elements.wheel.classList.add("winner-cinematic");
  elements.cinematicEyebrow.textContent = specialName(special);
  const cinematicPayout = special === "double" ? target.payout * 2 : target.payout;
  elements.cinematicTitle.textContent = `${targetColor.name}${targetAnimal.name}  ×${cinematicPayout}`;
  elements.cinematicResult.classList.add("show");
  window.arcade3d?.setWinner(target.index, special);
  if (win > 0) {
    winTone(special === "jackpot");
    showToast(`${specialName(special)}：获得 ${formatNumber(win)} 元`);
  } else {
    tone(180, 0.22, "triangle", 0.05);
    showToast(`${targetColor.name}${targetAnimal.name} ×${target.payout}，本局未押中`);
  }

  saveState();
  renderState();
  await wait(3200);
  elements.wheel.classList.remove("winner-cinematic");
  elements.cinematicResult.classList.remove("show");

  if (isGameOver()) {
    spinning = false;
    renderState();
    showGameOver();
    return;
  }

  window.arcade3d?.reset();
  randomizeRoundColors();
  elements.roundState.textContent = "请观察颜色后下注";
  elements.resultName.textContent = "本局颜色已锁定";
  elements.resultPrize.textContent = `当前余额 ${formatNumber(state.balance)} 元`;
  elements.centerStage.classList.remove("reveal");
  saveState();
  spinning = false;
  renderState();
}

function setActiveSector(index) {
  document.querySelectorAll(".wheel-sector").forEach((sector, sectorIndex) => {
    sector.classList.toggle("active", sectorIndex === index);
    if (sectorIndex !== index) sector.classList.remove("winner");
  });
}

function wait(milliseconds) {
  return new Promise(resolve => window.setTimeout(resolve, milliseconds));
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("show"), 2600);
}

function showGameOver() {
  elements.roundState.textContent = "游戏结束";
  elements.resultName.textContent = "余额已经用完";
  elements.resultPrize.textContent = "请退出后重新开始";
  elements.gameOverOverlay.hidden = false;
}

function getAudioContext() {
  if (!state.sound) return null;
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  return audioContext;
}

function tone(frequency, duration, type = "sine", volume = 0.035, delay = 0) {
  const context = getAudioContext();
  if (!context) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const startTime = context.currentTime + delay;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);
  gain.gain.setValueAtTime(volume, startTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
}

function tickTone(step, total) {
  if (step % (step < total * 0.72 ? 2 : 1) === 0) {
    tone(280 + (step % 4) * 35, 0.035, "square", 0.018);
  }
}

function winTone(isJackpot) {
  const notes = isJackpot ? [523, 659, 784, 1046, 1318] : [523, 659, 784, 1046];
  notes.forEach((note, index) => tone(note, 0.28, "triangle", 0.05, index * 0.1));
}

elements.betGrid.addEventListener("click", event => {
  const cell = event.target.closest("[data-bet-key]");
  if (cell) placeBet(cell.dataset.betKey);
});

elements.chipSelector.addEventListener("click", event => {
  const chip = event.target.closest("[data-chip]");
  if (!chip || spinning) return;
  state.selectedChip = Number(chip.dataset.chip);
  tone(520, 0.05, "sine", 0.025);
  renderState();
});

elements.clearButton.addEventListener("click", () => clearBets());
elements.repeatButton.addEventListener("click", repeatLastBets);
elements.spinButton.addEventListener("click", spin);
elements.soundToggle.addEventListener("click", () => {
  state.sound = !state.sound;
  saveState();
  renderState();
  if (state.sound) tone(620, 0.08, "sine", 0.03);
});
elements.exitGameButton.addEventListener("click", async () => {
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
  window.close();
  window.setTimeout(() => showToast("请点击窗口右上角的 × 关闭游戏"), 120);
});

window.addEventListener("keydown", event => {
  if (event.code === "Space" && !event.repeat && document.activeElement?.tagName !== "BUTTON") {
    event.preventDefault();
    spin();
  }
  if (["Digit1", "Digit2", "Digit3", "Digit4"].includes(event.code)) {
    const chips = [10, 50, 100, 500];
    state.selectedChip = chips[Number(event.code.slice(-1)) - 1];
    renderState();
  }
});

restoreRoundColors(state.roundColors);
renderBetGrid();
renderPayoutTable();
renderState();
if (isGameOver()) {
  showGameOver();
} else {
  elements.roundState.textContent = "请观察颜色后下注";
  elements.resultName.textContent = "本局颜色已锁定";
  elements.resultPrize.textContent = `起始余额 ${formatNumber(state.balance)} 元`;
  saveState();
}

const continuePortraitButton = document.querySelector("#continuePortraitButton");

if (sessionStorage.getItem("forestPortraitBypass") === "1") {
  document.body.classList.add("portrait-bypass");
}

continuePortraitButton?.addEventListener("click", () => {
  sessionStorage.setItem("forestPortraitBypass", "1");
  document.body.classList.add("portrait-bypass");
});

if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}
