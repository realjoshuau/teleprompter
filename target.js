const stage = document.querySelector("#targetStage");
const blankView = document.querySelector("#targetBlank");
const slideView = document.querySelector("#targetSlide");
const promptView = document.querySelector("#targetPrompt");
const videoView = document.querySelector("#targetVideo");
const slideImage = document.querySelector("#targetSlideImage");
const promptScroll = document.querySelector("#targetPromptScroll");
const progressOverlay = document.querySelector("#targetProgress");
const progressFill = document.querySelector("#targetProgressFill");
const progressPercent = document.querySelector("#targetProgressPercent");
const videoPlayer = document.querySelector("#targetVideoPlayer");
const videoStatus = document.querySelector("#targetVideoStatus");

let promptBlocks = [];
let receiverConnection = null;
let currentMode = "blank";
let videoUrl = "";
let pendingVideoData = null;

function setMode(mode) {
  currentMode = mode;
  stage.className = `target-stage ${mode}`;
  blankView.hidden = mode !== "blank";
  slideView.hidden = mode !== "slide";
  promptView.hidden = mode !== "teleprompter";
  videoView.hidden = mode !== "video";
  if (mode !== "teleprompter") {
    updateProgressOverlay({ progressEnabled: false });
  }
}

function renderPromptBlocks(blocks, activeIndex = 0) {
  promptBlocks = Array.isArray(blocks) ? blocks : [];
  promptScroll.textContent = "";

  const content = document.createElement("div");
  content.className = "target-prompt-content";

  promptBlocks.forEach((block, index) => {
    const item = document.createElement("section");
    item.className = "target-prompt-block";
    item.innerHTML = block.html || "";
    if (index === activeIndex) item.classList.add("active");
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

  if (!anchorBlock) {
    return Number.isFinite(data.scrollTop) ? data.scrollTop : 0;
  }

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

function showSlide(src, alt) {
  slideImage.src = src || "";
  slideImage.alt = alt || "Current slide";
  setMode("slide");
}

function showPrompt(data) {
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
}

async function loadVideo(data = {}, file = data.file) {
  unloadVideo();
  setMode("video");

  try {
    videoStatus.hidden = false;
    videoStatus.textContent = "Loading embedded video from local file access...";

    if (file instanceof Blob) {
      videoUrl = URL.createObjectURL(file);
      videoPlayer.src = videoUrl;
    } else if (data.id) {
      if (!window.videoStore) throw new Error("Video store is unavailable.");
      const localFile = await window.videoStore.getVideoFile(data.id);
      videoUrl = URL.createObjectURL(localFile);
      videoPlayer.src = videoUrl;
    } else if (typeof data.src === "string" && data.src) {
      videoPlayer.src = data.src;
    } else {
      throw new Error("Video id was not received from the controller.");
    }
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
}

function blank() {
  slideImage.removeAttribute("src");
  unloadVideo();
  setMode("blank");
}

function closePresentationWindow() {
  blank();

  const connection = receiverConnection;
  receiverConnection = null;

  try {
    connection?.close();
  } catch {
    // The controller may terminate the connection first.
  }

  window.close();
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
    closePresentationWindow();
    return;
  }

  if (message.type === "target:slide") {
    showSlide(message.src, message.alt);
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
      loadVideo(message);
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
  connection.addEventListener("close", closePresentationWindow);
  connection.addEventListener("terminate", closePresentationWindow);
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

setMode("blank");
connectPresentationReceiver().catch(() => setMode("blank"));
