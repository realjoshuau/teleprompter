const storageKey = "teleprompter-controller-state-v1";
const unsupportedOverrideKey = "teleprompter-unsupported-override";
const unsupportedOverrideParam = "override_unsupported_flag";
const supportedSlideTypes = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

const els = {
  createProjectButton: document.querySelector("#createProjectButton"),
  loadProjectButton: document.querySelector("#loadProjectButton"),
  launchButton: document.querySelector("#launchButton"),
  blankPresentationButton: document.querySelector("#blankPresentationButton"),
  closePresentationButton: document.querySelector("#closePresentationButton"),
  projectStatus: document.querySelector("#projectStatus"),
  screenStatus: document.querySelector("#screenStatus"),
  vlcStatus: document.querySelector("#vlcStatus"),
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
  playlistList: document.querySelector("#playlistList")
};

const state = {
  activeView: "presentation",
  selectedSlide: 0,
  scrollSpeed: 24,
  promptRunning: false,
  promptLines: [],
  activeLine: 0,
  projectHandle: null,
  manifest: null,
  slides: [],
  slideUrls: [],
  targetReady: false,
  presentationBlanked: false,
  presentationRequest: null,
  presentationConnection: null,
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

function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    state.activeView = saved.activeView || state.activeView;
    state.selectedSlide = Number.isInteger(saved.selectedSlide) ? saved.selectedSlide : state.selectedSlide;
    state.scrollSpeed = Number.isFinite(saved.scrollSpeed) ? saved.scrollSpeed : state.scrollSpeed;
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

function setVlcStatus(message) {
  els.vlcStatus.textContent = message;
}

function postToTarget(message) {
  if (!state.targetReady) return;

  if (state.presentationConnection && state.presentationConnection.state === "connected") {
    state.presentationConnection.send(JSON.stringify(message));
    return;
  }

  if (els.targetFrame.contentWindow) {
    els.targetFrame.contentWindow.postMessage(message, window.location.origin);
  }
}

function blankTarget() {
  postToTarget({ type: "target:blank" });
}

function setPresentationBlanked(blanked) {
  state.presentationBlanked = blanked;
  renderBlankButton();

  if (blanked) {
    blankTarget();
    return;
  }

  syncActiveViewToTarget();
}

function closeTargetWindow() {
  postToTarget({ type: "target:close" });
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

    state.promptLines = markdownToLines(promptText);
    state.slides = await Promise.all(state.manifest.slides.map((slide, index) => loadSlide(directoryHandle, slide, index)));
    state.slideUrls = state.slides.map((slide) => slide.url).filter(Boolean);

    state.vlc = {
      ...state.vlc,
      host: state.manifest.vlc.host,
      port: state.manifest.vlc.port,
      password: state.manifest.vlc.password
    };

    state.selectedSlide = Math.min(state.selectedSlide, Math.max(state.slides.length - 1, 0));
    state.activeLine = 0;
    setProjectStatus(`Loaded ${directoryHandle.name}: ${state.slides.length} slide(s), ${state.promptLines.length} prompt line(s).`);
    renderAll();
    await launchTarget();
  } catch (error) {
    setProjectStatus(`Project load failed: ${error.message}`);
    state.manifest = null;
    state.slides = [];
    state.promptLines = [];
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

function markdownToLines(markdown) {
  return markdown
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line
      .replace(/^#{1,6}\s*/, "")
      .replace(/^[-*+]\s+/, "")
      .replace(/^\d+\.\s+/, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .trim())
    .filter(Boolean);
}

async function launchTarget() {
  state.targetReady = false;
  setScreenStatus("Launching presentation display...");

  try {
    if (!supportsPresentationRequest()) {
      throw new Error("Presentation Request API is unavailable in this browser.");
    }

    const targetUrl = new URL("target.html", window.location.href);
    state.presentationRequest = new PresentationRequest([targetUrl.href]);
    navigator.presentation.defaultRequest = state.presentationRequest;
    const connection = await state.presentationRequest.start();
    attachPresentationConnection(connection);
    state.targetReady = true;
    state.presentationBlanked = false;
    renderBlankButton();
    setScreenStatus("Presentation display connected.");
    syncActiveViewToTarget();
  } catch (error) {
    setScreenStatus(`Launch failed: ${error.message}`);
  }
}

function attachPresentationConnection(connection) {
  state.presentationConnection = connection;

  connection.addEventListener("connect", () => {
    state.targetReady = true;
    state.presentationBlanked = false;
    renderBlankButton();
    setScreenStatus("Presentation display connected.");
    syncActiveViewToTarget();
  });

  connection.addEventListener("close", () => {
    state.targetReady = false;
    setScreenStatus("Presentation display closed.");
  });

  connection.addEventListener("terminate", () => {
    state.targetReady = false;
    setScreenStatus("Presentation display terminated.");
  });
}

async function setActiveView(view, options = {}) {
  if (state.activeView === view && !options.force) return;

  if (view !== "vlc" && !state.vlc.docked && !options.skipVlcStop) {
    stopVlc({ quiet: true, timeoutMs: 900 });
  }

  state.activeView = view;
  state.promptRunning = false;
  stopPrompt();
  blankTarget();
  savePreferences();
  renderTabs();
  syncActiveViewToTarget();
}

async function closePresentationDisplay() {
  closeTargetWindow();

  try {
    if (state.presentationConnection && state.presentationConnection.state !== "terminated") {
      state.presentationConnection.terminate();
    }
  } catch {
    // Some receivers close themselves before the controller can terminate the connection.
  }

  state.targetReady = false;
  state.presentationBlanked = false;
  state.presentationConnection = null;
  state.presentationRequest = null;
  els.targetFrame.removeAttribute("src");
  renderBlankButton();
  setScreenStatus("Presentation display closed.");
}

function syncActiveViewToTarget() {
  if (state.presentationBlanked) {
    blankTarget();
    return;
  }

  if (state.activeView === "presentation") {
    syncSlideToTarget();
    return;
  }

  if (state.activeView === "teleprompter") {
    syncPromptToTarget();
    return;
  }

  blankTarget();
}

function renderAll() {
  renderTabs();
  renderBlankButton();
  renderSlides();
  renderPrompt();
  renderVlcConfig();
  syncActiveViewToTarget();
}

function renderBlankButton() {
  els.blankPresentationButton.textContent = state.presentationBlanked ? "Show Presentation" : "Blank Presentation";
  els.blankPresentationButton.setAttribute("aria-pressed", String(state.presentationBlanked));
  els.blankPresentationButton.classList.toggle("active", state.presentationBlanked);
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

function syncSlideToTarget() {
  const slide = state.slides[state.selectedSlide];
  if (!slide?.url) {
    blankTarget();
    return;
  }

  postToTarget({
    type: "target:slide",
    src: slide.url,
    alt: slide.name || `Slide ${state.selectedSlide + 1}`
  });
}

function renderPrompt() {
  els.scrollSpeed.value = String(state.scrollSpeed);
  els.scrollSpeedValue.textContent = `${state.scrollSpeed} px/s`;
  els.teleprompterScroll.textContent = "";

  state.promptLines.forEach((line, index) => {
    const item = document.createElement("p");
    item.className = "prompt-line";
    item.textContent = line;
    item.dataset.index = String(index);
    item.classList.toggle("active", index === state.activeLine);
    els.teleprompterScroll.append(item);
  });

  updateCurrentLine();
}

function updateCurrentLine() {
  const line = state.promptLines[state.activeLine] || "Load a project to show teleprompter text.";
  els.currentLineTitle.textContent = state.promptLines.length ? `Line ${state.activeLine + 1} of ${state.promptLines.length}` : "Ready";
  els.currentLineText.textContent = line;

  els.teleprompterScroll.querySelectorAll(".prompt-line").forEach((item, index) => {
    item.classList.toggle("active", index === state.activeLine);
  });
}

function syncPromptToTarget() {
  postToTarget({
    type: "target:prompt",
    lines: state.promptLines,
    scrollTop: els.teleprompterScroll.scrollTop,
    activeIndex: state.activeLine
  });
}

function syncPromptPositionToTarget() {
  postToTarget({
    type: "target:prompt-position",
    scrollTop: els.teleprompterScroll.scrollTop,
    activeIndex: state.activeLine
  });
}

function startPrompt() {
  if (!state.promptLines.length) return;
  state.promptRunning = true;
  lastPromptTick = performance.now();
  promptAnimation = requestAnimationFrame(tickPrompt);
}

function stopPrompt() {
  state.promptRunning = false;
  cancelAnimationFrame(promptAnimation);
}

function resetPrompt() {
  stopPrompt();
  els.teleprompterScroll.scrollTop = 0;
  setActiveLineFromScroll();
  syncPromptPositionToTarget();
}

function tickPrompt(now) {
  if (!state.promptRunning) return;
  const seconds = (now - lastPromptTick) / 1000;
  lastPromptTick = now;
  els.teleprompterScroll.scrollTop += state.scrollSpeed * seconds;
  setActiveLineFromScroll();
  syncPromptPositionToTarget();
  promptAnimation = requestAnimationFrame(tickPrompt);
}

function setActiveLineFromScroll() {
  const containerTop = els.teleprompterScroll.getBoundingClientRect().top;
  const marker = containerTop + els.teleprompterScroll.clientHeight * 0.36;
  let activeIndex = 0;

  els.teleprompterScroll.querySelectorAll(".prompt-line").forEach((line, index) => {
    if (line.getBoundingClientRect().top <= marker) activeIndex = index;
  });

  if (state.activeLine !== activeIndex) {
    state.activeLine = activeIndex;
    updateCurrentLine();
  }
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
  els.prevSlideButton.addEventListener("click", () => changeSlide(-1));
  els.nextSlideButton.addEventListener("click", () => changeSlide(1));
  els.startPromptButton.addEventListener("click", startPrompt);
  els.pausePromptButton.addEventListener("click", stopPrompt);
  els.resetPromptButton.addEventListener("click", resetPrompt);

  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => setActiveView(tab.dataset.view));
  });

  els.scrollSpeed.addEventListener("input", () => {
    state.scrollSpeed = Number(els.scrollSpeed.value);
    els.scrollSpeedValue.textContent = `${state.scrollSpeed} px/s`;
    savePreferences();
  });

  els.teleprompterScroll.addEventListener("scroll", () => {
    setActiveLineFromScroll();
    syncPromptPositionToTarget();
  }, { passive: true });

  els.saveVlcButton.addEventListener("click", saveVlcConfig);
  els.refreshVlcButton.addEventListener("click", pollVlc);
  els.vlcPrevButton.addEventListener("click", () => vlcCommand("pl_previous"));
  els.vlcPlayPauseButton.addEventListener("click", () => vlcCommand("pl_pause"));
  els.vlcNextButton.addEventListener("click", () => vlcCommand("pl_next"));
  els.vlcStopButton.addEventListener("click", () => stopVlc());
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

  if (!supportsFileSystemAccess()) {
    setProjectStatus("File System Access API requires Chromium on localhost or HTTPS.");
  }

  if (!supportsPresentationRequest()) {
    setScreenStatus("Presentation Request API unavailable. Use Chromium with presentation display support.");
  }

  vlcPollTimer = window.setInterval(pollVlc, 5000);
  pollVlc();
}

window.addEventListener("beforeunload", () => {
  releaseSlideUrls();
  window.clearInterval(vlcPollTimer);
});

init();
