const stageRoot = document.querySelector("#stageRoot");
const blankView = document.querySelector("#stageBlank");
const slideView = document.querySelector("#stageSlide");
const promptView = document.querySelector("#stagePrompt");
const videoView = document.querySelector("#stageVideo");
const slideImage = document.querySelector("#stageSlideImage");
const nextImage = document.querySelector("#stageNextImage");
const nextLabel = document.querySelector("#stageNextLabel");
const slideCount = document.querySelector("#stageSlideCount");
const slideNote = document.querySelector("#stageSlideNote");
const promptScroll = document.querySelector("#stagePromptScroll");
const progressOverlay = document.querySelector("#stageProgress");
const progressFill = document.querySelector("#stageProgressFill");
const progressPercent = document.querySelector("#stageProgressPercent");
const videoPlayer = document.querySelector("#stageVideoPlayer");
const videoStatus = document.querySelector("#stageVideoStatus");
const videoRemaining = document.querySelector("#stageVideoRemaining");
const fullscreenButton = document.querySelector("#stageFullscreenButton");
const clockEls = [
  document.querySelector("#stageClock"),
  document.querySelector("#stagePromptClock"),
  document.querySelector("#stageVideoClock")
];
const timerEls = [
  document.querySelector("#stageTimer"),
  document.querySelector("#stagePromptTimer"),
  document.querySelector("#stageVideoTimer")
];
const timerBlocks = {
  slide: document.querySelector("#stageTimerBlock"),
  prompt: document.querySelector("#stagePromptTimerBlock"),
  video: document.querySelector("#stageVideoTimerBlock")
};

let receiverConnection = null;
let currentMode = "blank";
let videoUrl = "";
let timerState = {
  mode: "stopwatch",
  running: false,
  elapsedMs: 0,
  durationMs: 300000,
  startedAt: 0,
  stageTimers: {
    slide: true,
    prompt: true,
    video: true
  },
  sentAt: Date.now()
};
let pendingVideoData = null;

function setMode(mode) {
  currentMode = mode;
  stageRoot.className = `stage-view ${mode}`;
  blankView.hidden = mode !== "blank";
  slideView.hidden = mode !== "slide";
  promptView.hidden = mode !== "teleprompter";
  videoView.hidden = mode !== "video";
  if (mode !== "teleprompter") {
    updateProgressOverlay({ progressEnabled: false });
  }
}

function formatClock(date = new Date()) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "--:--";
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function getTimerElapsedMs() {
  const base = Number.isFinite(timerState.elapsedMs) ? timerState.elapsedMs : 0;
  if (!timerState.running || !Number.isFinite(timerState.startedAt)) return base;
  return base + Math.max(0, Date.now() - timerState.startedAt);
}

function getTimerDisplaySeconds() {
  const elapsed = getTimerElapsedMs();
  if (timerState.mode === "countdown") {
    const duration = Number.isFinite(timerState.durationMs) ? timerState.durationMs : 0;
    return Math.max(0, (duration - elapsed) / 1000);
  }
  return elapsed / 1000;
}

function updateClockAndTimer() {
  const clock = formatClock();
  const timer = formatDuration(getTimerDisplaySeconds());
  clockEls.forEach((element) => {
    element.textContent = clock;
  });
  timerEls.forEach((element) => {
    element.textContent = timer;
  });
  updateTimerVisibility();
  updateVideoRemaining();
}

function updateTimerVisibility() {
  const visibility = timerState.stageTimers || {};
  timerBlocks.slide.hidden = visibility.slide === false;
  timerBlocks.prompt.hidden = visibility.prompt === false;
  timerBlocks.video.hidden = visibility.video === false;
}

function renderPromptBlocks(blocks, activeIndex = 0) {
  promptScroll.textContent = "";
  const content = document.createElement("div");
  content.className = "target-prompt-content";

  (Array.isArray(blocks) ? blocks : []).forEach((block, index) => {
    const item = document.createElement("section");
    item.className = "target-prompt-block";
    item.innerHTML = block.html || "";
    item.classList.toggle("active", index === activeIndex);
    content.append(item);
  });

  promptScroll.append(content);
}

function applyPromptSizing(data = {}) {
  if (Number.isFinite(data.fontSize)) {
    promptScroll.style.setProperty("--target-prompt-font-size", `${data.fontSize}px`);
  }

  if (Number.isFinite(data.zoom)) {
    promptScroll.style.setProperty("--target-prompt-zoom", String(data.zoom / 100));
  }
}

function resolvePromptScrollTop(data = {}) {
  if (!Number.isFinite(data.anchorIndex) || !Number.isFinite(data.anchorProgress)) {
    return Number.isFinite(data.scrollTop) ? data.scrollTop : 0;
  }

  const blocks = Array.from(promptScroll.querySelectorAll(".target-prompt-block"));
  const anchorIndex = Math.max(0, Math.min(blocks.length - 1, data.anchorIndex));
  const anchorBlock = blocks[anchorIndex];
  if (!anchorBlock) return Number.isFinite(data.scrollTop) ? data.scrollTop : 0;

  const scrollRect = promptScroll.getBoundingClientRect();
  const blockRect = anchorBlock.getBoundingClientRect();
  const nextBlock = blocks[anchorIndex + 1];
  const nextTop = nextBlock?.getBoundingClientRect().top ?? blockRect.top + blockRect.height;
  const progress = Math.max(0, Math.min(1, data.anchorProgress));
  const marker = scrollRect.top + promptScroll.clientHeight * 0.36;
  const targetAnchor = blockRect.top + (nextTop - blockRect.top) * progress;
  return promptScroll.scrollTop + targetAnchor - marker;
}

function updatePromptPosition(scrollTop, activeIndex, data = {}) {
  applyPromptSizing(data);
  promptScroll.scrollTop = resolvePromptScrollTop({ ...data, scrollTop });
  promptScroll.querySelectorAll(".target-prompt-block").forEach((block, index) => {
    block.classList.toggle("active", index === activeIndex);
  });
  if (currentMode === "teleprompter") {
    updateProgressOverlay(data);
  }
}

function updateProgressOverlay(data = {}) {
  const enabled = Boolean(data.progressEnabled);
  progressOverlay.hidden = !enabled;

  if (!enabled) {
    progressFill.style.width = "0%";
    progressPercent.hidden = true;
    progressPercent.textContent = "";
    return;
  }

  const value = Number.isFinite(data.progressValue) ? Math.max(0, Math.min(1, data.progressValue)) : 0;
  const percent = Math.round(value * 100);

  progressOverlay.classList.toggle("target-progress-top", data.progressPosition === "top");
  progressOverlay.classList.toggle("target-progress-bottom", data.progressPosition !== "top");
  progressFill.style.width = `${value * 100}%`;
  progressPercent.hidden = !data.progressPercentEnabled;
  progressPercent.textContent = data.progressPercentEnabled ? `${percent}%` : "";
}

function showSlide(data = {}) {
  slideImage.src = data.src || "";
  slideImage.alt = data.alt || "Current slide";
  slideCount.textContent = Number.isFinite(data.currentIndex) && Number.isFinite(data.totalSlides)
    ? `Slide ${data.currentIndex + 1} of ${data.totalSlides}`
    : "Slide";
  slideNote.textContent = data.note || "No notes.";

  if (data.nextSrc) {
    nextImage.hidden = false;
    nextImage.src = data.nextSrc;
    nextImage.alt = data.nextAlt || "Next slide";
    nextLabel.textContent = data.nextNote || "Next slide";
  } else {
    nextImage.hidden = true;
    nextImage.removeAttribute("src");
    nextLabel.textContent = "No next slide";
  }

  setMode("slide");
}

function showPrompt(data = {}) {
  applyPromptSizing(data);
  renderPromptBlocks(data.blocks, data.activeIndex);
  setMode("teleprompter");
  updatePromptPosition(data.scrollTop, data.activeIndex, data);
}

function unloadVideo() {
  pendingVideoData = null;
  videoPlayer.pause();
  videoPlayer.removeAttribute("src");
  videoPlayer.load();
  if (videoUrl) URL.revokeObjectURL(videoUrl);
  videoUrl = "";
  videoStatus.hidden = false;
  videoStatus.textContent = "No embedded video loaded.";
  updateVideoRemaining();
}

async function loadVideo(data = {}, file = data.file) {
  unloadVideo();
  setMode("video");

  try {
    if (!(file instanceof Blob)) throw new Error("Video file was not received from the controller.");
    videoUrl = URL.createObjectURL(file);
    videoPlayer.src = videoUrl;
    videoPlayer.currentTime = Number.isFinite(data.currentTime) ? data.currentTime : 0;
    videoPlayer.muted = true;
    videoStatus.hidden = true;
    if (data.playing) await videoPlayer.play().catch(() => {});
  } catch (error) {
    videoStatus.hidden = false;
    videoStatus.textContent = error.message;
  }
}

function controlVideo(data = {}) {
  if (data.action === "play") {
    videoPlayer.play().catch(() => {});
  } else if (data.action === "pause") {
    videoPlayer.pause();
  } else if (data.action === "stop") {
    videoPlayer.pause();
    videoPlayer.currentTime = 0;
  } else if (data.action === "seek" && Number.isFinite(data.currentTime)) {
    videoPlayer.currentTime = Math.max(0, data.currentTime);
  } else if (data.action === "skip" && Number.isFinite(data.delta)) {
    videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime + data.delta);
  }
  updateVideoRemaining();
}

function updateVideoRemaining() {
  const remaining = videoPlayer.duration - videoPlayer.currentTime;
  videoRemaining.textContent = formatDuration(remaining);
}

function blank() {
  slideImage.removeAttribute("src");
  unloadVideo();
  setMode("blank");
}

function closeStageWindow() {
  notifyController("stage:closed");
  blank();
  const connection = receiverConnection;
  receiverConnection = null;

  try {
    connection?.close();
  } catch {
    // The controller may already be terminating the connection.
  }

  window.close();
}

function notifyController(type) {
  try {
    window.opener?.postMessage({ type }, window.location.origin);
  } catch {
    // The controller may have closed first.
  }
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  } catch {
    // Browsers require a direct button gesture; leave the window usable if fullscreen fails.
  }
}

function renderFullscreenButton() {
  fullscreenButton.textContent = document.fullscreenElement ? "Exit Full Screen" : "Full Screen";
  document.body.classList.toggle("stage-fullscreen-active", Boolean(document.fullscreenElement));
}

function handleControllerMessage(message) {
  if (message instanceof Blob || message instanceof ArrayBuffer) {
    const file = message instanceof Blob ? message : new Blob([message], { type: pendingVideoData?.fileType || "" });
    loadVideo(pendingVideoData || {}, file);
    return;
  }

  if (message.type === "target:blank") {
    blank();
    return;
  }

  if (message.type === "target:close") {
    closeStageWindow();
    return;
  }

  if (message.type === "target:timer-state") {
    timerState = { ...timerState, ...message };
    updateClockAndTimer();
    return;
  }

  if (message.type === "target:slide") {
    showSlide(message);
    return;
  }

  if (message.type === "target:prompt") {
    showPrompt(message);
    return;
  }

  if (message.type === "target:prompt-position") {
    if (currentMode === "teleprompter") updatePromptPosition(message.scrollTop, message.activeIndex, message);
    return;
  }

  if (message.type === "target:video-load") {
    if (message.file instanceof Blob) {
      loadVideo(message, message.file);
    } else {
      pendingVideoData = message;
      unloadVideo();
      setMode("video");
      pendingVideoData = message;
      videoStatus.hidden = false;
      videoStatus.textContent = "Loading embedded video from controller...";
    }
    return;
  }

  if (message.type === "target:video-control") {
    controlVideo(message);
    return;
  }

  if (message.type === "target:video-unload") {
    unloadVideo();
  }
}

function parseConnectionMessage(data) {
  if (typeof data !== "string") return data || {};
  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function attachPresentationConnection(connection) {
  receiverConnection = connection;
  if ("binaryType" in connection) connection.binaryType = "blob";
  connection.addEventListener("message", (event) => {
    handleControllerMessage(parseConnectionMessage(event.data));
  });
  connection.addEventListener("close", closeStageWindow);
  connection.addEventListener("terminate", closeStageWindow);
}

async function connectPresentationReceiver() {
  if (!navigator.presentation?.receiver) return;

  const connectionList = await navigator.presentation.receiver.connectionList;
  connectionList.connections.forEach(attachPresentationConnection);
  connectionList.addEventListener("connectionavailable", (event) => {
    attachPresentationConnection(event.connection);
  });
}

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return;
  handleControllerMessage(event.data || {});
});
window.addEventListener("beforeunload", () => notifyController("stage:closed"));
document.addEventListener("fullscreenchange", renderFullscreenButton);
fullscreenButton.addEventListener("click", toggleFullscreen);

videoPlayer.addEventListener("timeupdate", updateVideoRemaining);
videoPlayer.addEventListener("durationchange", updateVideoRemaining);
window.setInterval(updateClockAndTimer, 1000);

setMode("blank");
updateClockAndTimer();
renderFullscreenButton();
notifyController("stage:ready");
connectPresentationReceiver().catch(() => setMode("blank"));
