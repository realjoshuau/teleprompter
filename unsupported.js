const unsupportedOverrideKey = "teleprompter-unsupported-override";
const unsupportedOverrideParam = "override_unsupported_flag";
const continueAnywayButton = document.querySelector("#continueAnywayButton");

function isTruthyOverrideValue(value) {
  return value === "1" || value?.toLowerCase() === "true";
}

function saveUnsupportedOverride() {
  localStorage.setItem(unsupportedOverrideKey, "true");
}

function appUrl() {
  return new URL("index.html", window.location.href);
}

function continueToApp() {
  saveUnsupportedOverride();
  window.location.href = appUrl().href;
}

function applyQueryUnsupportedOverride() {
  const url = new URL(window.location.href);

  if (isTruthyOverrideValue(url.searchParams.get(unsupportedOverrideParam))) {
    continueToApp();
  }
}

continueAnywayButton.addEventListener("click", continueToApp);
applyQueryUnsupportedOverride();
