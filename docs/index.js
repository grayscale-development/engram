const installCommand = "npx --yes github:grayscale-development/graph-ai init";

const copyButton = document.querySelector("#copy-command");
copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(installCommand);
    document.querySelector("#copy-state").textContent = "copied";
    document.querySelector("#copy-hint").textContent = "Ready to paste.";
    window.setTimeout(() => { document.querySelector("#copy-state").textContent = "copy"; }, 1600);
  } catch {
    document.querySelector("#copy-hint").textContent = installCommand;
  }
});
