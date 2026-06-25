const storageKey = "teleprompter-controller-state-v1";
const unsupportedOverrideKey = "teleprompter-unsupported-override";
const unsupportedOverrideParam = "override_unsupported_flag";
const supportedSlideTypes = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
const videoSyncIntervalMs = 1000;

const els = {
  createProjectButton: document.querySelector("#createProjectButton"),
  loadProjectButton: document.querySelector("#loadProjectButton"),
  launchButton: document.querySelector("#launchButton"),
  blankPresentationButton: document.querySelector("#blankPresentationButton"),
  closePresentationButton: document.querySelector("#closePresentationButton"),
  launchStageButton: document.querySelector("#launchStageButton"),
  blankStageButton: document.querySelector("#blankStageButton"),
  closeStageButton: document.querySelector("#closeStageButton"),
  aboutButton: document.querySelector("#aboutButton"),
  aboutPanel: document.querySelector("#aboutPanel"),
  aboutMode: document.querySelector("#aboutMode"),
  aboutCommit: document.querySelector("#aboutCommit"),
  projectStatus: document.querySelector("#projectStatus"),
  screenStatus: document.querySelector("#screenStatus"),
  stageStatus: document.querySelector("#stageStatus"),
  vlcStatus: document.querySelector("#vlcStatus"),
  timerMode: document.querySelector("#timerMode"),
  timerDuration: document.querySelector("#timerDuration"),
  timerDisplay: document.querySelector("#timerDisplay"),
  timerStartButton: document.querySelector("#timerStartButton"),
  timerPauseButton: document.querySelector("#timerPauseButton"),
  timerResetButton: document.querySelector("#timerResetButton"),
  tabs: Array.from(document.querySelectorAll(".tab")),
  panels: Array.from(document.querySelectorAll(".view-panel")),
  targetFrame: document.querySelector("#targetFrame"),
  slideTitle: document.querySelector("#slideTitle"),
  slidePreview: document.querySelector("#slidePreview"),
  slideEmpty: document.querySelector("#slideEmpty"),
  slideNote: document.querySelector("#slideNote"),
  slideList: document.querySelector("#slideList"),
  prevSlideButton: document.querySelector("#prevSlideButton"),
  nextSlideButton: document.querySelector("#nextSlideButton"),
  startPromptButton: document.querySelector("#startPromptButton"),
  pausePromptButton: document.querySelector("#pausePromptButton"),
  resetPromptButton: document.querySelector("#resetPromptButton"),
  scrollSpeed: document.querySelector("#scrollSpeed"),
  scrollSpeedValue: document.querySelector("#scrollSpeedValue"),
  promptFontSize: document.querySelector("#promptFontSize"),
  promptFontSizeValue: document.querySelector("#promptFontSizeValue"),
  promptZoom: document.querySelector("#promptZoom"),
  promptZoomValue: document.querySelector("#promptZoomValue"),
  progressBarEnabled: document.querySelector("#progressBarEnabled"),
  progressBarPosition: document.querySelector("#progressBarPosition"),
  progressPercentEnabled: document.querySelector("#progressPercentEnabled"),
  teleprompterScroll: document.querySelector("#teleprompterScroll"),
  currentLineTitle: document.querySelector("#currentLineTitle"),
  currentLineText: document.querySelector("#currentLineText"),
  vlcHost: document.querySelector("#vlcHost"),
  vlcPort: document.querySelector("#vlcPort"),
  vlcPassword: document.querySelector("#vlcPassword"),
  saveVlcButton: document.querySelector("#saveVlcButton"),
  refreshVlcButton: document.querySelector("#refreshVlcButton"),
  vlcPrevButton: document.querySelector("#vlcPrevButton"),
  vlcPlayPauseButton: document.querySelector("#vlcPlayPauseButton"),
  vlcNextButton: document.querySelector("#vlcNextButton"),
  vlcStopButton: document.querySelector("#vlcStopButton"),
  vlcDocked: document.querySelector("#vlcDocked"),
  vlcNowPlaying: document.querySelector("#vlcNowPlaying"),
  playlistList: document.querySelector("#playlistList"),
  vlcConfig: document.querySelector("#vlcPanel .config-grid"),
  vlcRemotePad: document.querySelector("#vlcPanel > .workspace-grid .tool-panel > .remote-pad"),
  vlcAdvanced: document.querySelector("#vlcPanel .advanced"),
  videoStackVlc: document.querySelector("#videoStackVlc"),
  videoStackEmbedded: document.querySelector("#videoStackEmbedded"),
  embeddedVideoPanel: document.querySelector("#embeddedVideoPanel"),
  chooseVideoFolderButton: document.querySelector("#chooseVideoFolderButton"),
  embeddedVideoTitle: document.querySelector("#embeddedVideoTitle"),
  embeddedVideoPlayer: document.querySelector("#embeddedVideoPlayer"),
  embeddedVideoSeek: document.querySelector("#embeddedVideoSeek"),
  embeddedVideoElapsed: document.querySelector("#embeddedVideoElapsed"),
  embeddedVideoDuration: document.querySelector("#embeddedVideoDuration"),
  embeddedBackButton: document.querySelector("#embeddedBackButton"),
  embeddedPlayPauseButton: document.querySelector("#embeddedPlayPauseButton"),
  embeddedForwardButton: document.querySelector("#embeddedForwardButton"),
  embeddedStopButton: document.querySelector("#embeddedStopButton"),
  embeddedVideoList: document.querySelector("#embeddedVideoList")
};

const state = {
  activeView: "presentation",
  selectedSlide: 0,
  scrollSpeed: 24,
  promptFontSize: 32,
  promptZoom: 100,
  progressBarEnabled: false,
  progressBarPosition: "bottom",
  progressPercentEnabled: false,
  promptRunning: false,
  promptBlocks: [],
  activeBlock: 0,
  projectHandle: null,
  manifest: null,
  slides: [],
  slideUrls: [],
  targetReady: false,
  presentationBlanked: false,
  presentationRequest: null,
  presentationConnection: null,
  stageReady: false,
  stageBlanked: false,
  stageRequest: null,
  stageConnection: null,
  timer: {
    mode: "stopwatch",
    durationMs: 300000,
    elapsedMs: 0,
    running: false,
    startedAt: 0
  },
  about: {
    mode: "development",
    commitHash: null
  },
  videoStack: "vlc",
  embeddedVideo: {
    files: [],
    selectedId: "",
    selectedName: "",
    objectUrl: "",
    playing: false,
    seeking: false,
    duration: 0,
    currentTime: 0
  },
  vlc: {
    host: "127.0.0.1",
    port: 8090,
    password: "",
    docked: false,
    connected: false,
    playing: false
  }
};

let promptAnimation = 0;
let lastPromptTick = 0;
let vlcPollTimer = 0;
let timerRenderTimer = 0;
let videoSyncTimer = 0;

function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    state.activeView = saved.activeView || state.activeView;
    state.selectedSlide = Number.isInteger(saved.selectedSlide) ? saved.selectedSlide : state.selectedSlide;
    state.scrollSpeed = Number.isFinite(saved.scrollSpeed) ? saved.scrollSpeed : state.scrollSpeed;
    state.promptFontSize = Number.isFinite(saved.promptFontSize) ? saved.promptFontSize : state.promptFontSize;
    state.promptZoom = Number.isFinite(saved.promptZoom) ? saved.promptZoom : state.promptZoom;
    state.progressBarEnabled = typeof saved.progressBarEnabled === "boolean" ? saved.progressBarEnabled : state.progressBarEnabled;
    state.progressBarPosition = saved.progressBarPosition === "top" ? "top" : "bottom";
    state.progressPercentEnabled = typeof saved.progressPercentEnabled === "boolean" ? saved.progressPercentEnabled : state.progressPercentEnabled;
    state.videoStack = saved.videoStack === "embedded" ? "embedded" : "vlc";
    state.embeddedVideo.selectedId = typeof saved.embeddedVideo?.selectedId === "string" ? saved.embeddedVideo.selectedId : "";
    state.timer = {
      ...state.timer,
      ...(saved.timer || {}),
      running: false,
      startedAt: 0
    };
    state.timer.mode = state.timer.mode === "countdown" ? "countdown" : "stopwatch";
    state.timer.durationMs = Number.isFinite(state.timer.durationMs) ? state.timer.durationMs : 300000;
    state.timer.elapsedMs = Number.isFinite(state.timer.elapsedMs) ? state.timer.elapsedMs : 0;
    state.vlc = { ...state.vlc, ...(saved.vlc || {}) };
  } catch {
    localStorage.removeItem(storageKey);
  }
}

function savePreferences() {
  localStorage.setItem(storageKey, JSON.stringify({
    activeView: state.activeView,
    selectedSlide: state.selectedSlide,
    scrollSpeed: state.scrollSpeed,
    promptFontSize: state.promptFontSize,
    promptZoom: state.promptZoom,
    progressBarEnabled: state.progressBarEnabled,
    progressBarPosition: state.progressBarPosition,
    progressPercentEnabled: state.progressPercentEnabled,
    videoStack: state.videoStack,
    embeddedVideo: {
      selectedId: state.embeddedVideo.selectedId
    },
    timer: {
      mode: state.timer.mode,
      durationMs: state.timer.durationMs,
      elapsedMs: getTimerElapsedMs()
    },
    vlc: {
      host: state.vlc.host,
      port: state.vlc.port,
      password: state.vlc.password,
      docked: state.vlc.docked
    }
  }));
}

function supportsFileSystemAccess() {
  return "showDirectoryPicker" in window;
}

function supportsPresentationRequest() {
  return "PresentationRequest" in window && "presentation" in navigator;
}

function isTruthyOverrideValue(value) {
  return value === "1" || value?.toLowerCase() === "true";
}

function saveUnsupportedOverride() {
  localStorage.setItem(unsupportedOverrideKey, "true");
}

function hasUnsupportedOverride() {
  return localStorage.getItem(unsupportedOverrideKey) === "true";
}

function applyQueryUnsupportedOverride() {
  const url = new URL(window.location.href);
  const overrideValue = url.searchParams.get(unsupportedOverrideParam);

  if (!isTruthyOverrideValue(overrideValue)) return false;

  saveUnsupportedOverride();
  url.searchParams.delete(unsupportedOverrideParam);
  window.history.replaceState({}, document.title, url);
  return true;
}

function isChromiumishBrowser() {
  const brands = navigator.userAgentData?.brands?.map((brand) => brand.brand).join(" ") || "";
  const signal = `${brands} ${navigator.userAgent || ""} ${navigator.vendor || ""}`;
  const hasChromiumSignal = /(chromium|chrome|crios|edg|opr|opera|brave|arc|vivaldi|helium)/i.test(signal);
  const hasNonChromiumSignal = /(firefox|fxios|safari)/i.test(signal) && !/(chromium|chrome|crios|edg|opr|opera)/i.test(signal);

  return hasChromiumSignal && !hasNonChromiumSignal;
}

function shouldRedirectToUnsupported() {
  applyQueryUnsupportedOverride();

  return !hasUnsupportedOverride()
    && !isChromiumishBrowser()
    && (!supportsFileSystemAccess() || !supportsPresentationRequest());
}

function redirectToUnsupported() {
  const unsupportedUrl = new URL("unsupported.html", window.location.href);
  window.location.replace(unsupportedUrl.href);
}

function setProjectStatus(message) {
  els.projectStatus.textContent = message;
}

function setScreenStatus(message) {
  els.screenStatus.textContent = message;
}

function setStageStatus(message) {
  els.stageStatus.textContent = message;
}

function setVlcStatus(message) {
  els.vlcStatus.textContent = message;
}

function shortCommitHash(commitHash) {
  return commitHash ? commitHash.slice(0, 7) : "unavailable";
}

function renderAbout() {
  const commitText = shortCommitHash(state.about.commitHash);
  els.aboutMode.textContent = state.about.mode;
  els.aboutCommit.textContent = commitText;
  els.aboutCommit.title = state.about.commitHash || "unavailable";
}

function setAboutOpen(open) {
  els.aboutPanel.hidden = !open;
  els.aboutButton.setAttribute("aria-expanded", String(open));
}

function isAboutOpen() {
  return !els.aboutPanel.hidden;
}

async function loadAboutInfo() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch("/api/about", {
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`About API responded ${response.status}`);

    const about = await response.json();
    state.about = {
      mode: about.mode === "production" ? "production" : "development",
      commitHash: typeof about.commitHash === "string" && about.commitHash ? about.commitHash : null
    };
  } catch {
    state.about = {
      mode: "development",
      commitHash: null
    };
  } finally {
    window.clearTimeout(timeout);
    renderAbout();
  }
}

function getDisplay(display) {
  return display === "stage"
    ? {
      readyKey: "stageReady",
      blankedKey: "stageBlanked",
      requestKey: "stageRequest",
      connectionKey: "stageConnection",
      url: "stage.html",
      label: "Stage",
      setStatus: setStageStatus,
      renderButtons: renderStageButtons,
      renderBlank: renderStageBlankButton
    }
    : {
      readyKey: "targetReady",
      blankedKey: "presentationBlanked",
      requestKey: "presentationRequest",
      connectionKey: "presentationConnection",
      url: "target.html",
      label: "Presentation",
      setStatus: setScreenStatus,
      renderButtons: renderPresentationButtons,
      renderBlank: renderBlankButton
    };
}

function postToDisplay(display, message, options = {}) {
  const target = getDisplay(display);
  if (!state[target.readyKey] && !options.force) return;

  const connection = state[target.connectionKey];
  if (connection && connection.state === "connected") {
    connection.send(JSON.stringify(message));
    return;
  }

  if (display === "presenter" && els.targetFrame.contentWindow) {
    els.targetFrame.contentWindow.postMessage(message, window.location.origin);
  }
}

function postToDisplays(message, options = {}) {
  postToDisplay("presenter", message, options);
  postToDisplay("stage", message, options);
}

function blankDisplay(display) {
  postToDisplay(display, { type: "target:blank" });
}

function blankTarget() {
  blankDisplay("presenter");
}

function setDisplayBlanked(display, blanked) {
  const target = getDisplay(display);
  state[target.blankedKey] = blanked;
  target.renderBlank();

  if (blanked) {
    blankDisplay(display);
    return;
  }

  syncActiveViewToDisplay(display);
}

function setPresentationBlanked(blanked) {
  setDisplayBlanked("presenter", blanked);
}

function setStageBlanked(blanked) {
  setDisplayBlanked("stage", blanked);
}

function closeDisplayWindow(display) {
  postToDisplay(display, { type: "target:close" }, { force: true });
}

function closeTargetWindow() {
  closeDisplayWindow("presenter");
}

function extensionFor(path) {
  return path.split(".").pop().toLowerCase();
}

function normalizeManifest(manifest) {
  return {
    teleprompter: manifest.teleprompter || "teleprompter.md",
    slides: Array.isArray(manifest.slides) ? manifest.slides : [],
    vlc: {
      host: manifest.vlc?.host || state.vlc.host,
      port: manifest.vlc?.port || state.vlc.port,
      password: manifest.vlc?.password ?? state.vlc.password
    }
  };
}

async function getHandleFromPath(rootHandle, path, options = {}) {
  const parts = path.split("/").filter(Boolean);
  let current = rootHandle;

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const isFile = index === parts.length - 1 && !options.directory;
    current = isFile
      ? await current.getFileHandle(part, { create: Boolean(options.create) })
      : await current.getDirectoryHandle(part, { create: Boolean(options.create) });
  }

  return current;
}

async function readTextFile(rootHandle, path) {
  const handle = await getHandleFromPath(rootHandle, path);
  const file = await handle.getFile();
  return file.text();
}

async function writeTextFile(directoryHandle, path, content) {
  const handle = await getHandleFromPath(directoryHandle, path, { create: true });
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function ensureDirectory(directoryHandle, path) {
  await getHandleFromPath(directoryHandle, path, { create: true, directory: true });
}

async function createProject() {
  if (!supportsFileSystemAccess()) {
    setProjectStatus("File System Access API is unavailable. Use Chromium on localhost or HTTPS.");
    return;
  }

  const directoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
  await ensureDirectory(directoryHandle, "slides");

  const manifest = {
    teleprompter: "teleprompter.md",
    slides: [
      {
        file: "slides/001.png",
        note: "Add your first slide image to slides/001.png and update this note."
      }
    ],
    vlc: {
      host: state.vlc.host,
      port: state.vlc.port,
      password: state.vlc.password
    }
  };

  await writeTextFile(directoryHandle, "manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
  await writeTextFile(directoryHandle, "teleprompter.md", "# Teleprompter\n\nAdd your script here.\n\nEach paragraph or line becomes a prompt line.\n");

  state.projectHandle = directoryHandle;
  await loadProjectFromHandle(directoryHandle);
}

async function loadProject() {
  if (!supportsFileSystemAccess()) {
    setProjectStatus("File System Access API is unavailable. Use Chromium on localhost or HTTPS.");
    return;
  }

  const directoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
  await loadProjectFromHandle(directoryHandle);
}

async function loadProjectFromHandle(directoryHandle) {
  releaseSlideUrls();
  state.projectHandle = directoryHandle;

  try {
    const manifestText = await readTextFile(directoryHandle, "manifest.json");
    state.manifest = normalizeManifest(JSON.parse(manifestText));
    const promptText = await readTextFile(directoryHandle, state.manifest.teleprompter);

    state.promptBlocks = markdownToPromptBlocks(promptText);
    state.slides = await Promise.all(state.manifest.slides.map((slide, index) => loadSlide(directoryHandle, slide, index)));
    state.slideUrls = state.slides.map((slide) => slide.url).filter(Boolean);

    state.vlc = {
      ...state.vlc,
      host: state.manifest.vlc.host,
      port: state.manifest.vlc.port,
      password: state.manifest.vlc.password
    };

    state.selectedSlide = Math.min(state.selectedSlide, Math.max(state.slides.length - 1, 0));
    state.activeBlock = 0;
    setProjectStatus(`Loaded ${directoryHandle.name}: ${state.slides.length} slide(s), ${state.promptBlocks.length} prompt block(s).`);
    renderAll();
    await launchTarget();
  } catch (error) {
    setProjectStatus(`Project load failed: ${error.message}`);
    state.manifest = null;
    state.slides = [];
    state.promptBlocks = [];
    renderAll();
  }
}

async function loadSlide(directoryHandle, slide, index) {
  const ext = extensionFor(slide.file || "");
  if (!supportedSlideTypes.has(ext)) {
    return { ...slide, index, error: `Unsupported slide type: ${slide.file}` };
  }

  try {
    const handle = await getHandleFromPath(directoryHandle, slide.file);
    const file = await handle.getFile();
    const dataUrl = await fileToDataUrl(file);
    return {
      ...slide,
      index,
      url: dataUrl,
      name: slide.file.split("/").pop()
    };
  } catch (error) {
    return { ...slide, index, error: `Missing slide: ${slide.file} (${error.message})` };
  }
}

function releaseSlideUrls() {
  state.slideUrls = [];
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function markdownToPromptBlocks(markdown) {
  const markedApi = window.marked;
  if (!markedApi) throw new Error("Marked library is unavailable.");

  const renderer = new markedApi.Renderer();
  renderer.html = ({ text }) => escapeHtml(text);

  const options = { gfm: true, breaks: false, renderer };
  return markedApi
    .lexer(markdown.replace(/\r\n/g, "\n"), options)
    .filter((token) => token.type !== "space")
    .map((token) => {
      const html = markedApi.Parser.parse([token], options).trim();
      return {
        html,
        text: htmlToText(html)
      };
    })
    .filter((block) => block.html || block.text);
}

function htmlToText(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  return (template.content.textContent || "").replace(/\s+/g, " ").trim();
}

async function launchTarget() {
  return launchDisplay("presenter");
}

async function launchStage() {
  return launchDisplay("stage");
}

async function launchDisplay(display) {
  const target = getDisplay(display);
  state[target.readyKey] = false;
  target.renderButtons();
  target.setStatus(`Launching ${target.label.toLowerCase()} display...`);

  try {
    if (!supportsPresentationRequest()) {
      throw new Error("Presentation Request API is unavailable in this browser.");
    }

    const targetUrl = new URL(target.url, window.location.href);
    state[target.requestKey] = new PresentationRequest([targetUrl.href]);
    if (display === "presenter") navigator.presentation.defaultRequest = state[target.requestKey];
    const connection = await state[target.requestKey].start();
    attachDisplayConnection(display, connection);
    state[target.readyKey] = true;
    state[target.blankedKey] = false;
    target.renderButtons();
    target.renderBlank();
    target.setStatus(`${target.label} display connected.`);
    syncTimerToDisplays();
    syncActiveViewToDisplay(display);
  } catch (error) {
    state[target.readyKey] = false;
    target.renderButtons();
    target.setStatus(`${target.label} launch failed: ${error.message}`);
  }
}

function attachPresentationConnection(connection) {
  attachDisplayConnection("presenter", connection);
}

function attachDisplayConnection(display, connection) {
  const target = getDisplay(display);
  state[target.connectionKey] = connection;

  connection.addEventListener("connect", () => {
    state[target.readyKey] = true;
    state[target.blankedKey] = false;
    target.renderButtons();
    target.renderBlank();
    target.setStatus(`${target.label} display connected.`);
    syncTimerToDisplays();
    syncActiveViewToDisplay(display);
  });

  connection.addEventListener("close", () => {
    state[target.readyKey] = false;
    target.renderButtons();
    target.setStatus(`${target.label} display closed.`);
  });

  connection.addEventListener("terminate", () => {
    state[target.readyKey] = false;
    target.renderButtons();
    target.setStatus(`${target.label} display terminated.`);
  });
}

async function setActiveView(view, options = {}) {
  if (state.activeView === view && !options.force) return;

  const leavingEmbeddedVideo = state.activeView === "vlc" && state.videoStack === "embedded" && view !== "vlc";
  if (view !== "vlc" && !state.vlc.docked && !options.skipVlcStop) {
    stopVlc({ quiet: true, timeoutMs: 900 });
  }

  if (leavingEmbeddedVideo) {
    els.embeddedVideoPlayer.pause();
    postToDisplays({ type: "target:video-unload" }, { force: true });
  }

  state.activeView = view;
  state.promptRunning = false;
  stopPrompt();
  postToDisplays({ type: "target:blank" });
  savePreferences();
  renderTabs();
  syncActiveViewToTarget();
}

async function closePresentationDisplay() {
  closeDisplay("presenter");
}

async function closeStageDisplay() {
  closeDisplay("stage");
}

function closeDisplay(display) {
  const target = getDisplay(display);
  closeDisplayWindow(display);
  terminateDisplayConnection(display);

  state[target.readyKey] = false;
  state[target.blankedKey] = false;
  state[target.connectionKey] = null;
  state[target.requestKey] = null;
  if (display === "presenter") els.targetFrame.removeAttribute("src");
  target.renderButtons();
  target.renderBlank();
  target.setStatus(`${target.label} display closed.`);
}

function terminatePresentationConnection() {
  terminateDisplayConnection("presenter");
}

function terminateDisplayConnection(display) {
  const target = getDisplay(display);
  try {
    const connection = state[target.connectionKey];
    if (connection && connection.state !== "terminated") {
      connection.terminate();
    }
  } catch {
    // Some receivers close themselves before the controller can terminate the connection.
  }
}

function closePresentationDisplayBeforeUnload() {
  closeDisplayWindow("presenter");
  closeDisplayWindow("stage");
  terminateDisplayConnection("presenter");
  terminateDisplayConnection("stage");
}

function syncActiveViewToTarget() {
  syncActiveViewToDisplay("presenter");
  syncActiveViewToDisplay("stage");
}

function syncActiveViewToDisplay(display) {
  const target = getDisplay(display);
  if (state[target.blankedKey]) {
    blankDisplay(display);
    return;
  }

  if (state.activeView === "presentation") {
    syncSlideToDisplay(display);
    return;
  }

  if (state.activeView === "teleprompter") {
    syncPromptToDisplay(display);
    return;
  }

  if (state.activeView === "vlc" && state.videoStack === "embedded") {
    syncEmbeddedVideoToDisplay(display);
    return;
  }

  blankDisplay(display);
}

function renderAll() {
  renderTabs();
  renderPresentationButtons();
  renderStageButtons();
  renderBlankButton();
  renderStageBlankButton();
  renderTimerControls();
  renderSlides();
  renderPrompt();
  renderPromptControls();
  renderVlcConfig();
  renderVideoStack();
  renderEmbeddedVideo();
  syncActiveViewToTarget();
}

function renderPresentationButtons() {
  els.launchButton.classList.toggle("active", state.targetReady);
  els.launchButton.setAttribute("aria-pressed", String(state.targetReady));
  els.closePresentationButton.classList.toggle("active", !state.targetReady);
  els.closePresentationButton.setAttribute("aria-pressed", String(!state.targetReady));
}

function renderStageButtons() {
  els.launchStageButton.classList.toggle("active", state.stageReady);
  els.launchStageButton.setAttribute("aria-pressed", String(state.stageReady));
  els.closeStageButton.classList.toggle("active", !state.stageReady);
  els.closeStageButton.setAttribute("aria-pressed", String(!state.stageReady));
}

function renderBlankButton() {
  els.blankPresentationButton.textContent = state.presentationBlanked ? "Show Presentation" : "Blank Presentation";
  els.blankPresentationButton.setAttribute("aria-pressed", String(state.presentationBlanked));
  els.blankPresentationButton.classList.toggle("active", state.presentationBlanked);
}

function renderStageBlankButton() {
  els.blankStageButton.textContent = state.stageBlanked ? "Show Stage" : "Blank Stage";
  els.blankStageButton.setAttribute("aria-pressed", String(state.stageBlanked));
  els.blankStageButton.classList.toggle("active", state.stageBlanked);
}

function durationInputToMs(value) {
  const parts = (value || "00:05:00").split(":").map((part) => Number(part));
  if (parts.length < 2 || parts.some((part) => !Number.isFinite(part))) return 300000;
  const [hours, minutes, seconds = 0] = parts.length === 3 ? parts : [0, parts[0], parts[1]];
  return Math.max(1000, ((hours * 3600) + (minutes * 60) + seconds) * 1000);
}

function msToDurationInput(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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
  const base = Number.isFinite(state.timer.elapsedMs) ? state.timer.elapsedMs : 0;
  if (!state.timer.running || !Number.isFinite(state.timer.startedAt)) return base;
  return base + Math.max(0, Date.now() - state.timer.startedAt);
}

function getTimerDisplaySeconds() {
  const elapsed = getTimerElapsedMs();
  if (state.timer.mode === "countdown") return Math.max(0, (state.timer.durationMs - elapsed) / 1000);
  return elapsed / 1000;
}

function getTimerPayload() {
  return {
    type: "target:timer-state",
    mode: state.timer.mode,
    running: state.timer.running,
    elapsedMs: state.timer.elapsedMs,
    durationMs: state.timer.durationMs,
    startedAt: state.timer.startedAt,
    sentAt: Date.now()
  };
}

function renderTimerControls() {
  els.timerMode.value = state.timer.mode;
  if (document.activeElement !== els.timerDuration) {
    els.timerDuration.value = msToDurationInput(state.timer.durationMs);
  }
  els.timerDuration.disabled = state.timer.mode !== "countdown";
  els.timerDisplay.textContent = formatDuration(getTimerDisplaySeconds());
  els.timerStartButton.classList.toggle("active", state.timer.running);
  els.timerStartButton.setAttribute("aria-pressed", String(state.timer.running));
  els.timerPauseButton.classList.toggle("active", !state.timer.running);
  els.timerPauseButton.setAttribute("aria-pressed", String(!state.timer.running));
}

function syncTimerToDisplays() {
  postToDisplays(getTimerPayload());
}

function startTimer() {
  if (state.timer.running) return;
  if (state.timer.mode === "countdown" && getTimerElapsedMs() >= state.timer.durationMs) {
    state.timer.elapsedMs = 0;
  }
  state.timer.running = true;
  state.timer.startedAt = Date.now();
  renderTimerControls();
  syncTimerToDisplays();
  savePreferences();
}

function pauseTimer() {
  state.timer.elapsedMs = getTimerElapsedMs();
  state.timer.running = false;
  state.timer.startedAt = 0;
  renderTimerControls();
  syncTimerToDisplays();
  savePreferences();
}

function resetTimer() {
  state.timer.running = false;
  state.timer.startedAt = 0;
  state.timer.elapsedMs = 0;
  renderTimerControls();
  syncTimerToDisplays();
  savePreferences();
}

function renderTabs() {
  els.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.view === state.activeView));
  els.panels.forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === state.activeView));
}

function renderSlides() {
  const slide = state.slides[state.selectedSlide];
  els.slideList.textContent = "";

  state.slides.forEach((item, index) => {
    const button = document.createElement("button");
    button.className = "slide-list-item";
    button.type = "button";
    button.classList.toggle("active", index === state.selectedSlide);
    button.innerHTML = `<strong>${index + 1}. ${escapeHtml(item.name || item.file || "Slide")}</strong><span>${escapeHtml(item.note || item.error || "No note")}</span>`;
    button.addEventListener("click", () => selectSlide(index));
    els.slideList.append(button);
  });

  els.prevSlideButton.disabled = state.selectedSlide <= 0;
  els.nextSlideButton.disabled = state.selectedSlide >= state.slides.length - 1;

  if (!slide) {
    els.slideTitle.textContent = "No slide selected";
    els.slidePreview.removeAttribute("src");
    els.slidePreview.hidden = true;
    els.slideEmpty.hidden = false;
    els.slideEmpty.textContent = state.manifest ? "No valid image slides found in the manifest." : "Load a project to preview slides.";
    els.slideNote.textContent = "Speaker notes will appear here.";
    return;
  }

  els.slideTitle.textContent = `Slide ${state.selectedSlide + 1}: ${slide.name || slide.file}`;
  els.slideNote.textContent = slide.error || slide.note || "No note for this slide.";
  els.slidePreview.hidden = !slide.url;
  els.slideEmpty.hidden = Boolean(slide.url);
  els.slideEmpty.textContent = slide.error || "";
  if (slide.url) els.slidePreview.src = slide.url;
}

function selectSlide(index) {
  state.selectedSlide = Math.max(0, Math.min(index, state.slides.length - 1));
  savePreferences();
  renderSlides();
  if (state.activeView === "presentation") syncSlideToTarget();
}

function changeSlide(delta) {
  selectSlide(state.selectedSlide + delta);
}

function isEditableTarget(target) {
  if (!(target instanceof Element)) return false;

  return Boolean(target.closest("input, textarea, select, button, [contenteditable=''], [contenteditable='true']"));
}

function handleSlideKeyboard(event) {
  if (state.activeView !== "presentation" || event.repeat || isEditableTarget(event.target)) return;

  const slideKeys = {
    ArrowLeft: -1,
    ArrowUp: -1,
    ArrowRight: 1,
    ArrowDown: 1,
    " ": 1,
    Spacebar: 1
  };
  const delta = slideKeys[event.key];
  if (!delta) return;

  event.preventDefault();
  changeSlide(delta);
}

function handlePromptKeyboard(event) {
  if (state.activeView !== "teleprompter" || event.repeat || isEditableTarget(event.target)) return;

  const promptKeys = {
    ArrowUp: -1,
    ArrowDown: 1,
    " ": 1,
    Space: 1,
    Spacebar: 1
  };
  const delta = promptKeys[event.key];
  if (!delta) return;

  event.preventDefault();
  changePromptBlock(delta);
}

function syncSlideToTarget() {
  syncSlideToDisplay("presenter");
  syncSlideToDisplay("stage");
}

function syncSlideToDisplay(display) {
  const slide = state.slides[state.selectedSlide];
  if (!slide?.url) {
    blankDisplay(display);
    return;
  }

  const nextSlide = state.slides[state.selectedSlide + 1];
  postToDisplay(display, {
    type: "target:slide",
    src: slide.url,
    alt: slide.name || `Slide ${state.selectedSlide + 1}`,
    currentIndex: state.selectedSlide,
    totalSlides: state.slides.length,
    note: slide.error || slide.note || "No note for this slide.",
    nextSrc: nextSlide?.url || "",
    nextAlt: nextSlide?.name || (nextSlide ? `Slide ${state.selectedSlide + 2}` : ""),
    nextNote: nextSlide?.note || nextSlide?.error || ""
  });
}

function renderPrompt() {
  els.scrollSpeed.value = String(state.scrollSpeed);
  els.scrollSpeedValue.textContent = `${state.scrollSpeed} px/s`;
  els.promptFontSize.value = String(state.promptFontSize);
  els.promptFontSizeValue.textContent = `${state.promptFontSize} px`;
  els.promptZoom.value = String(state.promptZoom);
  els.promptZoomValue.textContent = `${state.promptZoom}%`;
  applyPromptSizing(els.teleprompterScroll);
  els.teleprompterScroll.textContent = "";

  const content = document.createElement("div");
  content.className = "prompt-content";

  state.promptBlocks.forEach((block, index) => {
    const item = document.createElement("section");
    item.className = "prompt-block";
    item.innerHTML = block.html;
    item.dataset.index = String(index);
    item.classList.toggle("active", index === state.activeBlock);
    content.append(item);
  });

  els.teleprompterScroll.append(content);

  updateCurrentLine();
}

function updateCurrentLine() {
  const block = state.promptBlocks[state.activeBlock];
  const text = block?.text || "Load a project to show teleprompter text.";
  els.currentLineTitle.textContent = state.promptBlocks.length ? `Block ${state.activeBlock + 1} of ${state.promptBlocks.length}` : "Ready";
  els.currentLineText.textContent = text;

  els.teleprompterScroll.querySelectorAll(".prompt-block").forEach((item, index) => {
    item.classList.toggle("active", index === state.activeBlock);
  });
}

function syncPromptToTarget() {
  syncPromptToDisplay("presenter");
  syncPromptToDisplay("stage");
}

function syncPromptToDisplay(display) {
  const anchor = getPromptAnchor();
  const progressState = getPromptProgressState(anchor);

  postToDisplay(display, {
    type: "target:prompt",
    blocks: state.promptBlocks,
    scrollTop: els.teleprompterScroll.scrollTop,
    anchorIndex: anchor.index,
    anchorProgress: anchor.progress,
    activeIndex: state.activeBlock,
    zoom: state.promptZoom,
    ...progressState
  });
}

function syncPromptPositionToTarget() {
  syncPromptPositionToDisplay("presenter");
  syncPromptPositionToDisplay("stage");
}

function syncPromptPositionToDisplay(display) {
  const anchor = getPromptAnchor();
  const progressState = getPromptProgressState(anchor);

  postToDisplay(display, {
    type: "target:prompt-position",
    scrollTop: els.teleprompterScroll.scrollTop,
    anchorIndex: anchor.index,
    anchorProgress: anchor.progress,
    activeIndex: state.activeBlock,
    zoom: state.promptZoom,
    ...progressState
  });
}

function startPrompt() {
  if (!state.promptBlocks.length) return;
  if (state.promptRunning) return;

  state.promptRunning = true;
  lastPromptTick = performance.now();
  renderPromptControls();
  promptAnimation = requestAnimationFrame(tickPrompt);
}

function stopPrompt() {
  state.promptRunning = false;
  cancelAnimationFrame(promptAnimation);
  renderPromptControls();
}

function resetPrompt() {
  stopPrompt();
  els.teleprompterScroll.scrollTop = 0;
  setActiveBlockFromScroll();
  syncPromptPositionToTarget();
}

function tickPrompt(now) {
  if (!state.promptRunning) return;
  const seconds = (now - lastPromptTick) / 1000;
  lastPromptTick = now;
  els.teleprompterScroll.scrollTop += state.scrollSpeed * seconds;
  setActiveBlockFromScroll();
  syncPromptPositionToTarget();
  promptAnimation = requestAnimationFrame(tickPrompt);
}

function setActiveBlockFromScroll() {
  const containerTop = els.teleprompterScroll.getBoundingClientRect().top;
  const marker = containerTop + els.teleprompterScroll.clientHeight * 0.36;
  let activeIndex = 0;

  els.teleprompterScroll.querySelectorAll(".prompt-block").forEach((block, index) => {
    if (block.getBoundingClientRect().top <= marker) activeIndex = index;
  });

  if (state.activeBlock !== activeIndex) {
    state.activeBlock = activeIndex;
    updateCurrentLine();
  }
}

function changePromptBlock(delta) {
  if (!state.promptBlocks.length) return;

  const nextIndex = Math.max(0, Math.min(state.promptBlocks.length - 1, state.activeBlock + delta));
  if (nextIndex === state.activeBlock) return;

  const blocks = Array.from(els.teleprompterScroll.querySelectorAll(".prompt-block"));
  const nextBlock = blocks[nextIndex];
  if (!nextBlock) return;

  state.activeBlock = nextIndex;
  const containerTop = els.teleprompterScroll.getBoundingClientRect().top;
  const marker = containerTop + els.teleprompterScroll.clientHeight * 0.36;
  const nextTop = nextBlock.getBoundingClientRect().top;
  els.teleprompterScroll.scrollTop += nextTop - marker;
  updateCurrentLine();
  syncPromptPositionToTarget();
}

function getPromptAnchor() {
  const blocks = Array.from(els.teleprompterScroll.querySelectorAll(".prompt-block"));
  const activeBlock = blocks[state.activeBlock];

  if (!activeBlock) {
    return { index: 0, progress: 0 };
  }

  const containerTop = els.teleprompterScroll.getBoundingClientRect().top;
  const marker = containerTop + els.teleprompterScroll.clientHeight * 0.36;
  const activeTop = activeBlock.getBoundingClientRect().top;
  const nextBlock = blocks[state.activeBlock + 1];
  const nextTop = nextBlock?.getBoundingClientRect().top ?? activeTop + activeBlock.getBoundingClientRect().height;
  const span = nextTop - activeTop;
  const progress = span > 0 ? (marker - activeTop) / span : 0;

  return {
    index: state.activeBlock,
    progress: Math.max(0, Math.min(1, progress))
  };
}

function getPromptProgressState(anchor = getPromptAnchor()) {
  const lastBlockIndex = state.promptBlocks.length - 1;
  let progressValue = 0;

  if (lastBlockIndex > 0) {
    progressValue = (state.activeBlock + anchor.progress) / lastBlockIndex;
  } else if (lastBlockIndex === 0 && state.activeBlock === 0) {
    progressValue = 1;
  }

  return {
    progressEnabled: state.progressBarEnabled,
    progressPosition: state.progressBarPosition,
    progressPercentEnabled: state.progressPercentEnabled,
    progressValue: Math.max(0, Math.min(1, progressValue))
  };
}

function applyPromptSizing(element) {
  element.style.setProperty("--prompt-font-size", `${state.promptFontSize}px`);
  element.style.setProperty("--prompt-zoom", String(state.promptZoom / 100));
}

function renderPromptControls() {
  els.startPromptButton.classList.toggle("active", state.promptRunning);
  els.startPromptButton.setAttribute("aria-pressed", String(state.promptRunning));
  els.pausePromptButton.classList.toggle("active", !state.promptRunning);
  els.pausePromptButton.setAttribute("aria-pressed", String(!state.promptRunning));
  els.progressBarEnabled.checked = state.progressBarEnabled;
  els.progressBarPosition.value = state.progressBarPosition;
  els.progressBarPosition.disabled = !state.progressBarEnabled;
  els.progressPercentEnabled.checked = state.progressPercentEnabled;
  els.progressPercentEnabled.disabled = !state.progressBarEnabled;
}

function renderVlcConfig() {
  els.vlcHost.value = state.vlc.host;
  els.vlcPort.value = String(state.vlc.port);
  els.vlcPassword.value = state.vlc.password;
  els.vlcDocked.checked = state.vlc.docked;
}

function saveVlcConfig() {
  state.vlc.host = els.vlcHost.value.trim() || "127.0.0.1";
  state.vlc.port = Number(els.vlcPort.value) || 8090;
  state.vlc.password = els.vlcPassword.value;
  savePreferences();
  pollVlc();
}

function renderVideoStack() {
  const embedded = state.videoStack === "embedded";
  els.videoStackVlc.checked = !embedded;
  els.videoStackEmbedded.checked = embedded;
  els.embeddedVideoPanel.hidden = !embedded;
  els.vlcConfig.hidden = embedded;
  els.vlcRemotePad.hidden = embedded;
  els.vlcAdvanced.hidden = embedded;
  els.playlistList.hidden = embedded;
  els.embeddedVideoList.hidden = !embedded;
  els.refreshVlcButton.hidden = embedded;
  els.vlcNowPlaying.textContent = embedded
    ? (state.embeddedVideo.selectedName || "No video selected")
    : els.vlcNowPlaying.textContent;
}

function renderEmbeddedVideo() {
  const video = state.embeddedVideo;
  els.embeddedVideoTitle.textContent = video.selectedName || "No video selected";
  els.embeddedVideoElapsed.textContent = formatDuration(video.currentTime);
  els.embeddedVideoDuration.textContent = formatDuration(video.duration);
  els.embeddedVideoSeek.max = Number.isFinite(video.duration) ? String(video.duration) : "0";
  if (!video.seeking) els.embeddedVideoSeek.value = Number.isFinite(video.currentTime) ? String(video.currentTime) : "0";
  els.embeddedPlayPauseButton.textContent = video.playing ? "Pause" : "Play";
  els.embeddedVideoList.textContent = "";

  if (!video.files.length) {
    els.embeddedVideoList.textContent = "Choose a video folder to list videos.";
    return;
  }

  video.files.forEach((item) => {
    const button = document.createElement("button");
    button.className = "playlist-item";
    button.type = "button";
    button.classList.toggle("active", item.id === video.selectedId);
    button.textContent = item.name;
    button.addEventListener("click", () => selectEmbeddedVideo(item.id));
    els.embeddedVideoList.append(button);
  });
}

function releaseEmbeddedVideoUrl() {
  els.embeddedVideoPlayer.pause();
  els.embeddedVideoPlayer.removeAttribute("src");
  els.embeddedVideoPlayer.load();
  if (state.embeddedVideo.objectUrl) URL.revokeObjectURL(state.embeddedVideo.objectUrl);
  state.embeddedVideo.objectUrl = "";
}

async function loadStoredVideoList() {
  if (!window.videoStore) return;
  try {
    state.embeddedVideo.files = await window.videoStore.loadStoredVideos();
    const selected = state.embeddedVideo.files.find((item) => item.id === state.embeddedVideo.selectedId);
    state.embeddedVideo.selectedName = selected?.name || "";
    if (!selected) state.embeddedVideo.selectedId = "";
    renderVideoStack();
    renderEmbeddedVideo();
    if (state.videoStack === "embedded" && state.embeddedVideo.selectedId) {
      await loadEmbeddedVideo(state.embeddedVideo.selectedId, { quiet: true });
    }
  } catch (error) {
    setVlcStatus(`Embedded video list unavailable: ${error.message}`);
  }
}

async function chooseVideoFolder() {
  if (!supportsFileSystemAccess()) {
    setVlcStatus("File System Access API requires Chromium on localhost or HTTPS.");
    return;
  }
  if (!window.videoStore) {
    setVlcStatus("Embedded video storage is unavailable.");
    return;
  }

  try {
    const directoryHandle = await window.showDirectoryPicker({ startIn: "videos" });
    state.embeddedVideo.files = await window.videoStore.storeVideoDirectory(directoryHandle);
    state.embeddedVideo.selectedId = state.embeddedVideo.files[0]?.id || "";
    state.embeddedVideo.selectedName = state.embeddedVideo.files[0]?.name || "";
    renderEmbeddedVideo();
    savePreferences();
    if (state.embeddedVideo.selectedId) await loadEmbeddedVideo(state.embeddedVideo.selectedId);
    setVlcStatus(`Loaded ${state.embeddedVideo.files.length} embedded video(s).`);
  } catch (error) {
    setVlcStatus(`Video folder failed: ${error.message}`);
  }
}

async function selectEmbeddedVideo(id) {
  state.embeddedVideo.selectedId = id;
  const selected = state.embeddedVideo.files.find((item) => item.id === id);
  state.embeddedVideo.selectedName = selected?.name || "";
  state.embeddedVideo.currentTime = 0;
  state.embeddedVideo.duration = 0;
  state.embeddedVideo.playing = false;
  renderVideoStack();
  renderEmbeddedVideo();
  savePreferences();
  await loadEmbeddedVideo(id);
}

async function loadEmbeddedVideo(id, options = {}) {
  if (!id) return;
  try {
    if (!window.videoStore) throw new Error("Video store is unavailable.");
    releaseEmbeddedVideoUrl();
    const file = await window.videoStore.getVideoFile(id);
    state.embeddedVideo.objectUrl = URL.createObjectURL(file);
    els.embeddedVideoPlayer.src = state.embeddedVideo.objectUrl;
    els.embeddedVideoPlayer.currentTime = state.embeddedVideo.currentTime || 0;
    els.embeddedVideoPlayer.load();
    renderEmbeddedVideo();
    if (state.activeView === "vlc" && state.videoStack === "embedded") syncEmbeddedVideoToDisplays();
  } catch (error) {
    if (!options.quiet) setVlcStatus(`Video load failed: ${error.message}`);
  }
}

function setVideoStack(stack) {
  const nextStack = stack === "embedded" ? "embedded" : "vlc";
  if (state.videoStack === nextStack) return;

  state.videoStack = nextStack;
  state.embeddedVideo.playing = false;
  if (nextStack === "vlc") {
    postToDisplays({ type: "target:video-unload" }, { force: true });
    releaseEmbeddedVideoUrl();
    state.embeddedVideo.playing = false;
    state.embeddedVideo.currentTime = 0;
    pollVlc();
  } else {
    stopVlc({ quiet: true, timeoutMs: 900 });
    if (state.embeddedVideo.selectedId && !state.embeddedVideo.objectUrl) {
      loadEmbeddedVideo(state.embeddedVideo.selectedId, { quiet: true });
    }
    if (state.activeView === "vlc") syncEmbeddedVideoToDisplays();
    setVlcStatus("Embedded video mode.");
  }
  renderVideoStack();
  renderEmbeddedVideo();
  savePreferences();
  syncActiveViewToTarget();
}

function getEmbeddedVideoPayload() {
  return {
    type: "target:video-load",
    id: state.embeddedVideo.selectedId,
    name: state.embeddedVideo.selectedName,
    currentTime: state.embeddedVideo.currentTime,
    playing: state.embeddedVideo.playing
  };
}

function syncEmbeddedVideoToDisplay(display) {
  if (!state.embeddedVideo.selectedId) {
    postToDisplay(display, { type: "target:video-unload" });
    return;
  }
  postToDisplay(display, getEmbeddedVideoPayload());
}

function syncEmbeddedVideoToDisplays() {
  syncEmbeddedVideoToDisplay("presenter");
  syncEmbeddedVideoToDisplay("stage");
}

function sendEmbeddedVideoControl(action, extra = {}) {
  const message = {
    type: "target:video-control",
    action,
    ...extra
  };
  postToDisplays(message);
}

function playPauseEmbeddedVideo() {
  if (!state.embeddedVideo.selectedId) return;
  if (els.embeddedVideoPlayer.paused) {
    els.embeddedVideoPlayer.play().catch((error) => setVlcStatus(`Embedded play failed: ${error.message}`));
  } else {
    els.embeddedVideoPlayer.pause();
  }
}

function stopEmbeddedVideo() {
  els.embeddedVideoPlayer.pause();
  els.embeddedVideoPlayer.currentTime = 0;
  state.embeddedVideo.currentTime = 0;
  state.embeddedVideo.playing = false;
  renderEmbeddedVideo();
  sendEmbeddedVideoControl("stop");
}

function skipEmbeddedVideo(delta) {
  if (!state.embeddedVideo.selectedId) return;
  els.embeddedVideoPlayer.currentTime = Math.max(0, els.embeddedVideoPlayer.currentTime + delta);
  state.embeddedVideo.currentTime = els.embeddedVideoPlayer.currentTime;
  renderEmbeddedVideo();
  sendEmbeddedVideoControl("skip", { delta });
}

function vlcBaseUrl() {
  return `http://${state.vlc.host}:${state.vlc.port}/requests`;
}

function vlcHeaders() {
  return {
    Authorization: `Basic ${btoa(`:${state.vlc.password}`)}`
  };
}

async function vlcRequest(path, params = {}, options = {}) {
  const url = new URL(`${vlcBaseUrl()}/${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs || 3500);

  let response;
  try {
    response = await fetch(url, {
      headers: vlcHeaders(),
      cache: "no-store",
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) throw new Error(`VLC responded ${response.status}`);
  const text = await response.text();
  if (path.endsWith(".json")) return JSON.parse(text);
  return text;
}

async function pollVlc() {
  if (state.videoStack !== "vlc") return;

  try {
    const status = await vlcRequest("status.json");
    const playlist = await vlcRequest("playlist.json");
    const isPlaying = status.state === "playing";
    state.vlc.connected = true;
    state.vlc.playing = isPlaying;
    renderVlcStatus(status, playlist);

    if (isPlaying && state.activeView !== "vlc" && !state.vlc.docked) {
      await setActiveView("vlc", { skipVlcStop: true });
    }
  } catch (error) {
    state.vlc.connected = false;
    state.vlc.playing = false;
    els.vlcNowPlaying.textContent = "Not connected";
    setVlcStatus(`VLC unavailable: ${error.message}`);
    els.playlistList.textContent = "";
  }
}

function renderVlcStatus(status, playlist) {
  const title = status.information?.category?.meta?.title
    || status.information?.category?.meta?.filename
    || "VLC playback";

  els.vlcNowPlaying.textContent = status.state === "playing" ? title : "Not playing";
  setVlcStatus(`VLC ${status.state || "connected"}`);
  renderPlaylist(playlist);
}

function renderPlaylist(playlist) {
  els.playlistList.textContent = "";
  const items = flattenPlaylist(playlist.children || []);

  if (!items.length) {
    els.playlistList.textContent = "Playlist is empty.";
    return;
  }

  items.forEach((item) => {
    const button = document.createElement("button");
    button.className = "playlist-item";
    button.type = "button";
    button.classList.toggle("active", item.current === "current");
    button.textContent = item.name || item.uri || "Untitled media";
    button.addEventListener("click", () => vlcCommand("pl_play", { id: item.id }));
    els.playlistList.append(button);
  });
}

function flattenPlaylist(nodes) {
  return nodes.flatMap((node) => {
    const children = Array.isArray(node.children) ? flattenPlaylist(node.children) : [];
    return node.type === "leaf" ? [node] : children;
  });
}

async function vlcCommand(command, params = {}) {
  try {
    await vlcRequest("status.json", { command, ...params });
    await pollVlc();
  } catch (error) {
    setVlcStatus(`VLC command failed: ${error.message}`);
  }
}

async function stopVlc(options = {}) {
  if (!state.vlc.password && !state.vlc.connected) return;

  try {
    await vlcRequest("status.json", { command: "pl_stop" }, { timeoutMs: options.timeoutMs || 1200 });
    state.vlc.playing = false;
    if (!options.quiet) await pollVlc();
  } catch (error) {
    if (!options.quiet) setVlcStatus(`VLC stop failed: ${error.message}`);
  }
}

function escapeHtml(value) {
  const span = document.createElement("span");
  span.textContent = value;
  return span.innerHTML;
}

function bindEvents() {
  els.createProjectButton.addEventListener("click", () => createProject().catch((error) => setProjectStatus(error.message)));
  els.loadProjectButton.addEventListener("click", () => loadProject().catch((error) => setProjectStatus(error.message)));
  els.launchButton.addEventListener("click", launchTarget);
  els.blankPresentationButton.addEventListener("click", () => setPresentationBlanked(!state.presentationBlanked));
  els.closePresentationButton.addEventListener("click", closePresentationDisplay);
  els.launchStageButton.addEventListener("click", launchStage);
  els.blankStageButton.addEventListener("click", () => setStageBlanked(!state.stageBlanked));
  els.closeStageButton.addEventListener("click", closeStageDisplay);
  els.aboutButton.addEventListener("click", (event) => {
    event.stopPropagation();
    setAboutOpen(!isAboutOpen());
  });
  els.aboutPanel.addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("click", () => setAboutOpen(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setAboutOpen(false);
    handleSlideKeyboard(event);
    handlePromptKeyboard(event);
  });
  els.prevSlideButton.addEventListener("click", () => changeSlide(-1));
  els.nextSlideButton.addEventListener("click", () => changeSlide(1));
  els.startPromptButton.addEventListener("click", startPrompt);
  els.pausePromptButton.addEventListener("click", stopPrompt);
  els.resetPromptButton.addEventListener("click", resetPrompt);
  els.timerStartButton.addEventListener("click", startTimer);
  els.timerPauseButton.addEventListener("click", pauseTimer);
  els.timerResetButton.addEventListener("click", resetTimer);
  els.timerMode.addEventListener("change", () => {
    const nextMode = els.timerMode.value === "countdown" ? "countdown" : "stopwatch";
    state.timer.running = false;
    state.timer.startedAt = 0;
    state.timer.elapsedMs = 0;
    state.timer.mode = nextMode;
    renderTimerControls();
    syncTimerToDisplays();
    savePreferences();
  });
  els.timerDuration.addEventListener("change", () => {
    state.timer.durationMs = durationInputToMs(els.timerDuration.value);
    if (state.timer.mode === "countdown") resetTimer();
    renderTimerControls();
    syncTimerToDisplays();
    savePreferences();
  });

  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => setActiveView(tab.dataset.view));
  });

  els.scrollSpeed.addEventListener("input", () => {
    state.scrollSpeed = Number(els.scrollSpeed.value);
    els.scrollSpeedValue.textContent = `${state.scrollSpeed} px/s`;
    savePreferences();
  });

  els.promptFontSize.addEventListener("input", () => {
    state.promptFontSize = Number(els.promptFontSize.value);
    els.promptFontSizeValue.textContent = `${state.promptFontSize} px`;
    applyPromptSizing(els.teleprompterScroll);
    setActiveBlockFromScroll();
    syncPromptPositionToTarget();
    savePreferences();
  });

  els.promptZoom.addEventListener("input", () => {
    state.promptZoom = Number(els.promptZoom.value);
    els.promptZoomValue.textContent = `${state.promptZoom}%`;
    applyPromptSizing(els.teleprompterScroll);
    setActiveBlockFromScroll();
    syncPromptPositionToTarget();
    savePreferences();
  });

  els.progressBarEnabled.addEventListener("change", () => {
    state.progressBarEnabled = els.progressBarEnabled.checked;
    renderPromptControls();
    syncPromptPositionToTarget();
    savePreferences();
  });

  els.progressBarPosition.addEventListener("change", () => {
    state.progressBarPosition = els.progressBarPosition.value === "top" ? "top" : "bottom";
    syncPromptPositionToTarget();
    savePreferences();
  });

  els.progressPercentEnabled.addEventListener("change", () => {
    state.progressPercentEnabled = els.progressPercentEnabled.checked;
    syncPromptPositionToTarget();
    savePreferences();
  });

  els.teleprompterScroll.addEventListener("scroll", () => {
    setActiveBlockFromScroll();
    syncPromptPositionToTarget();
  }, { passive: true });

  els.saveVlcButton.addEventListener("click", saveVlcConfig);
  els.refreshVlcButton.addEventListener("click", pollVlc);
  els.vlcPrevButton.addEventListener("click", () => vlcCommand("pl_previous"));
  els.vlcPlayPauseButton.addEventListener("click", () => vlcCommand("pl_pause"));
  els.vlcNextButton.addEventListener("click", () => vlcCommand("pl_next"));
  els.vlcStopButton.addEventListener("click", () => stopVlc());
  els.videoStackVlc.addEventListener("change", () => setVideoStack("vlc"));
  els.videoStackEmbedded.addEventListener("change", () => setVideoStack("embedded"));
  els.chooseVideoFolderButton.addEventListener("click", chooseVideoFolder);
  els.embeddedPlayPauseButton.addEventListener("click", playPauseEmbeddedVideo);
  els.embeddedStopButton.addEventListener("click", stopEmbeddedVideo);
  els.embeddedBackButton.addEventListener("click", () => skipEmbeddedVideo(-10));
  els.embeddedForwardButton.addEventListener("click", () => skipEmbeddedVideo(10));
  els.embeddedVideoSeek.addEventListener("input", () => {
    state.embeddedVideo.seeking = true;
    state.embeddedVideo.currentTime = Number(els.embeddedVideoSeek.value) || 0;
    renderEmbeddedVideo();
  });
  els.embeddedVideoSeek.addEventListener("change", () => {
    state.embeddedVideo.seeking = false;
    els.embeddedVideoPlayer.currentTime = Number(els.embeddedVideoSeek.value) || 0;
    state.embeddedVideo.currentTime = els.embeddedVideoPlayer.currentTime;
    renderEmbeddedVideo();
    sendEmbeddedVideoControl("seek", { currentTime: state.embeddedVideo.currentTime });
  });
  els.embeddedVideoPlayer.addEventListener("loadedmetadata", () => {
    state.embeddedVideo.duration = els.embeddedVideoPlayer.duration;
    renderEmbeddedVideo();
  });
  els.embeddedVideoPlayer.addEventListener("timeupdate", () => {
    state.embeddedVideo.currentTime = els.embeddedVideoPlayer.currentTime;
    state.embeddedVideo.duration = els.embeddedVideoPlayer.duration;
    renderEmbeddedVideo();
  });
  els.embeddedVideoPlayer.addEventListener("play", () => {
    state.embeddedVideo.playing = true;
    renderEmbeddedVideo();
    sendEmbeddedVideoControl("play", { currentTime: els.embeddedVideoPlayer.currentTime });
  });
  els.embeddedVideoPlayer.addEventListener("pause", () => {
    state.embeddedVideo.playing = false;
    renderEmbeddedVideo();
    sendEmbeddedVideoControl("pause", { currentTime: els.embeddedVideoPlayer.currentTime });
  });
  els.vlcDocked.addEventListener("change", () => {
    state.vlc.docked = els.vlcDocked.checked;
    savePreferences();
  });
}

function init() {
  if (shouldRedirectToUnsupported()) {
    redirectToUnsupported();
    return;
  }

  loadPreferences();
  bindEvents();
  renderAll();
  loadAboutInfo();
  loadStoredVideoList();

  if (!supportsFileSystemAccess()) {
    setProjectStatus("File System Access API requires Chromium on localhost or HTTPS.");
  }

  if (!supportsPresentationRequest()) {
    setScreenStatus("Presentation Request API unavailable. Use Chromium with presentation display support.");
  }

  vlcPollTimer = window.setInterval(pollVlc, 5000);
  timerRenderTimer = window.setInterval(() => {
    if (state.timer.mode === "countdown" && state.timer.running && getTimerDisplaySeconds() <= 0) {
      pauseTimer();
    }
    renderTimerControls();
  }, 250);
  videoSyncTimer = window.setInterval(() => {
    if (state.videoStack === "embedded" && state.activeView === "vlc" && state.embeddedVideo.playing) {
      state.embeddedVideo.currentTime = els.embeddedVideoPlayer.currentTime;
      sendEmbeddedVideoControl("seek", { currentTime: state.embeddedVideo.currentTime });
    }
  }, videoSyncIntervalMs);
  pollVlc();
}

window.addEventListener("beforeunload", () => {
  closePresentationDisplayBeforeUnload();
  releaseSlideUrls();
  releaseEmbeddedVideoUrl();
  window.clearInterval(vlcPollTimer);
  window.clearInterval(timerRenderTimer);
  window.clearInterval(videoSyncTimer);
});

init();
