const stage = document.querySelector("#targetStage");
const blankView = document.querySelector("#targetBlank");
const slideView = document.querySelector("#targetSlide");
const promptView = document.querySelector("#targetPrompt");
const slideImage = document.querySelector("#targetSlideImage");
const promptScroll = document.querySelector("#targetPromptScroll");

let promptLines = [];
let receiverConnection = null;

function setMode(mode) {
  stage.className = `target-stage ${mode}`;
  blankView.hidden = mode !== "blank";
  slideView.hidden = mode !== "slide";
  promptView.hidden = mode !== "teleprompter";
}

function renderPromptLines(lines, activeIndex = 0) {
  promptLines = Array.isArray(lines) ? lines : [];
  promptScroll.textContent = "";

  promptLines.forEach((line, index) => {
    const item = document.createElement("p");
    item.className = "target-prompt-line";
    item.textContent = line || "\u00a0";
    if (index === activeIndex) item.classList.add("active");
    promptScroll.append(item);
  });
}

function updatePromptPosition(scrollTop, activeIndex) {
  promptScroll.scrollTop = Number.isFinite(scrollTop) ? scrollTop : 0;
  promptScroll.querySelectorAll(".target-prompt-line").forEach((line, index) => {
    line.classList.toggle("active", index === activeIndex);
  });
}

function showSlide(src, alt) {
  slideImage.src = src || "";
  slideImage.alt = alt || "Current slide";
  setMode("slide");
}

function showPrompt(data) {
  renderPromptLines(data.lines, data.activeIndex);
  updatePromptPosition(data.scrollTop, data.activeIndex);
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
    updatePromptPosition(message.scrollTop, message.activeIndex);
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
