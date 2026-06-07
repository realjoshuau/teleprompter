const projectHandleDb = "teleprompter-project-handles";
const projectHandleStore = "handles";
const recentProjectHandleKey = "recentProjectHandle";
const editorSessionFlag = "teleprompter-open-editor-after-create";
const placeholderImageUrl = "https://loremflickr.com/1280/720/nature";

const chooseDirectoryButton = document.querySelector("#chooseDirectoryButton");
const createStatus = document.querySelector("#createStatus");

function supportsFileSystemAccess() {
  return "showDirectoryPicker" in window;
}

function setStatus(message) {
  createStatus.textContent = message;
}

function openProjectDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(projectHandleDb, 1);
    request.addEventListener("upgradeneeded", () => {
      request.result.createObjectStore(projectHandleStore);
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

async function saveRecentProjectHandle(directoryHandle) {
  const db = await openProjectDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(projectHandleStore, "readwrite");
    transaction.objectStore(projectHandleStore).put(directoryHandle, recentProjectHandleKey);
    transaction.addEventListener("complete", resolve);
    transaction.addEventListener("error", () => reject(transaction.error));
  });
  db.close();
}

async function assertEmptyDirectory(directoryHandle) {
  for await (const entry of directoryHandle.values()) {
    throw new Error(`Choose an empty folder. Found "${entry.name}" in this one.`);
  }
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

async function ensureDirectory(directoryHandle, path) {
  await getHandleFromPath(directoryHandle, path, { create: true, directory: true });
}

async function writeFile(directoryHandle, path, content) {
  const handle = await getHandleFromPath(directoryHandle, path, { create: true });
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function fetchPlaceholderSlide() {
  const response = await fetch(placeholderImageUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Placeholder image responded ${response.status}`);
  return response.blob();
}

async function scaffoldProject(directoryHandle) {
  await assertEmptyDirectory(directoryHandle);
  await ensureDirectory(directoryHandle, "slides");

  const manifest = {
    teleprompter: "teleprompter.md",
    slides: [],
    vlc: {
      host: "127.0.0.1",
      port: 8090,
      password: ""
    }
  };

  try {
    const imageBlob = await fetchPlaceholderSlide();
    await writeFile(directoryHandle, "slides/001.jpg", imageBlob);
    manifest.slides.push({
      title: "First Slide",
      file: "slides/001.jpg",
      note: "Replace this starter image or edit this speaker note."
    });
  } catch (error) {
    manifest.notes = `Starter image download failed: ${error.message}. Upload your first slide in the editor.`;
  }

  await writeFile(directoryHandle, "manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(
    directoryHandle,
    "teleprompter.md",
    "# Teleprompter\n\nAdd your script here.\n\nEach paragraph or line becomes a prompt line.\n"
  );
}

async function createProject() {
  if (!supportsFileSystemAccess()) {
    setStatus("File System Access API is unavailable. Use Chromium on localhost or HTTPS.");
    return;
  }

  const directoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
  chooseDirectoryButton.disabled = true;
  setStatus(`Creating project in ${directoryHandle.name}...`);

  try {
    await scaffoldProject(directoryHandle);
    await saveRecentProjectHandle(directoryHandle);
    sessionStorage.setItem(editorSessionFlag, "true");
    setStatus("Project created. Opening editor...");
    window.location.href = "../?editor=1";
  } catch (error) {
    chooseDirectoryButton.disabled = false;
    setStatus(error.message);
  }
}

chooseDirectoryButton.addEventListener("click", () => {
  createProject().catch((error) => {
    chooseDirectoryButton.disabled = false;
    setStatus(error.message);
  });
});

if (!supportsFileSystemAccess()) {
  setStatus("File System Access API requires Chromium on localhost or HTTPS.");
}
