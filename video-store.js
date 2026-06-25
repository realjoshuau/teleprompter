(function () {
  const dbName = "teleprompter-video-store";
  const dbVersion = 1;
  const folderKey = "video-folder";
  const supportedVideoTypes = new Set(["mp4", "webm", "ogg", "ogv", "mov", "m4v"]);

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, dbVersion);

      request.addEventListener("upgradeneeded", () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings");
        if (!db.objectStoreNames.contains("videos")) db.createObjectStore("videos", { keyPath: "id" });
      });

      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error));
    });
  }

  async function withStore(storeName, mode, action) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      let value;

      try {
        value = action(store);
      } catch (error) {
        reject(error);
        return;
      }

      transaction.addEventListener("complete", () => resolve(value));
      transaction.addEventListener("error", () => reject(transaction.error));
      transaction.addEventListener("abort", () => reject(transaction.error));
    }).finally(() => db.close());
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error));
    });
  }

  async function getSetting(key) {
    const db = await openDb();
    try {
      const transaction = db.transaction("settings", "readonly");
      const store = transaction.objectStore("settings");
      return await requestToPromise(store.get(key));
    } finally {
      db.close();
    }
  }

  async function setSetting(key, value) {
    await withStore("settings", "readwrite", (store) => {
      store.put(value, key);
    });
  }

  async function getAllVideos() {
    const db = await openDb();
    try {
      const transaction = db.transaction("videos", "readonly");
      const store = transaction.objectStore("videos");
      return await requestToPromise(store.getAll());
    } finally {
      db.close();
    }
  }

  async function getVideo(id) {
    if (!id) return null;
    const db = await openDb();
    try {
      const transaction = db.transaction("videos", "readonly");
      const store = transaction.objectStore("videos");
      return await requestToPromise(store.get(id));
    } finally {
      db.close();
    }
  }

  async function replaceVideos(records) {
    await withStore("videos", "readwrite", (store) => {
      store.clear();
      records.forEach((record) => store.put(record));
    });
  }

  function extensionFor(name) {
    return name.split(".").pop().toLowerCase();
  }

  function isSupportedVideo(name) {
    return supportedVideoTypes.has(extensionFor(name || ""));
  }

  async function verifyPermission(handle, mode = "read") {
    if (!handle) return false;
    const options = { mode };
    if (typeof handle.queryPermission === "function" && await handle.queryPermission(options) === "granted") return true;
    if (typeof handle.requestPermission === "function") return await handle.requestPermission(options) === "granted";
    return true;
  }

  async function storeVideoDirectory(directoryHandle) {
    const allowed = await verifyPermission(directoryHandle);
    if (!allowed) throw new Error("Video folder permission was not granted.");

    const records = [];
    for await (const entry of directoryHandle.values()) {
      if (entry.kind !== "file" || !isSupportedVideo(entry.name)) continue;
      records.push({
        id: `video:${entry.name}`,
        name: entry.name,
        handle: entry
      });
    }

    records.sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" }));
    await setSetting(folderKey, directoryHandle);
    await replaceVideos(records);
    return records.map(({ id, name }) => ({ id, name }));
  }

  async function loadStoredVideos() {
    const records = await getAllVideos();
    return records.map(({ id, name }) => ({ id, name }));
  }

  async function getVideoFile(id) {
    const record = await getVideo(id);
    if (!record?.handle) throw new Error("Video handle was not found. Reselect the video folder from the controller.");
    const allowed = await verifyPermission(record.handle);
    if (!allowed) throw new Error("Video permission was not granted. Reselect the video folder from the controller.");
    return record.handle.getFile();
  }

  window.videoStore = {
    getVideoFile,
    loadStoredVideos,
    storeVideoDirectory,
    supportedVideoTypes
  };
})();
