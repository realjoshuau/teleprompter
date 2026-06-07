const stage = document.querySelector("#targetStage");
const blankView = document.querySelector("#targetBlank");
const slideView = document.querySelector("#targetSlide");
const promptView = document.querySelector("#targetPrompt");
const slideImage = document.querySelector("#targetSlideImage");
const promptScroll = document.querySelector("#targetPromptScroll");

let promptBlocks = [];
let receiverConnection = null;

function setMode(mode) {
  stage.className = `target-stage ${mode}`;
  blankView.hidden = mode !== "blank";
  slideView.hidden = mode !== "slide";
  promptView.hidden = mode !== "teleprompter";
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

function updatePromptPosition(scrollTop, activeIndex, data = {}) {
  applyPromptSizing(data);
  promptScroll.scrollTop = Number.isFinite(scrollTop) ? scrollTop : 0;
  promptScroll.querySelectorAll(".target-prompt-block").forEach((block, index) => {
    block.classList.toggle("active", index === activeIndex);
  });
}

function showSlide(src, alt) {
  slideImage.src = src || "";
  slideImage.alt = alt || "Current slide";
  setMode("slide");
}

function showPrompt(data) {
  applyPromptSizing(data);
  renderPromptBlocks(data.blocks, data.activeIndex);
  updatePromptPosition(data.scrollTop, data.activeIndex, data);
  setMode("teleprompter");
}

function blank() {
  slideImage.removeAttribute("src");
  setMode("blank");
}

function closePresentationWindow() {
  blank();

  try {
    receiverConnection?.close();
  } catch {
    // The controller may terminate the connection first.
  }

  window.close();
}

function handleControllerMessage(message) {
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
    updatePromptPosition(message.scrollTop, message.activeIndex, message);
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
  connection.addEventListener("message", (event) => {
    handleControllerMessage(parseConnectionMessage(event.data));
  });
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
