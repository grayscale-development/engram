const repository = "grayscale-development/graph-ai";
const installCommand = "npx --yes github:grayscale-development/graph-ai init";
const sourceTokens = 24_521;
const briefingTokens = 73;

const duration = (from, to) => {
  const seconds = Math.max(0, Math.round((new Date(to) - new Date(from)) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

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

const updateSavings = () => {
  const sessions = Number(document.querySelector("#sessions").value);
  const price = Number(document.querySelector("#price").value);
  const fewerTokens = sessions * (sourceTokens - briefingTokens);
  document.querySelector("#sessions-output").textContent = sessions;
  document.querySelector("#price-output").textContent = `$${price.toFixed(2)}`;
  document.querySelector("#token-savings").textContent = `${(fewerTokens / 1_000_000).toFixed(1)}M`;
  document.querySelector("#cost-savings").textContent = `$${((fewerTokens / 1_000_000) * price).toFixed(2)}`;
  document.querySelector("#time-savings").textContent = `~${Math.round((sessions * 10) / 60)}h`;
};
document.querySelector("#sessions").addEventListener("input", updateSavings);
document.querySelector("#price").addEventListener("input", updateSavings);

const loadLiveData = async () => {
  try {
    const request = { headers: { Accept: "application/vnd.github+json" }, cache: "force-cache" };
    const [repoResponse, runsResponse] = await Promise.all([fetch(`https://api.github.com/repos/${repository}`, request), fetch(`https://api.github.com/repos/${repository}/actions/runs?per_page=1`, request)]);
    if (!repoResponse.ok || !runsResponse.ok) throw new Error("GitHub request failed");
    const repo = await repoResponse.json();
    const runs = await runsResponse.json();
    document.querySelector("#stars").textContent = `${repo.stargazers_count} stars`;
    const run = runs.workflow_runs[0];
    if (!run) return;
    document.querySelector("#ci-status").textContent = run.conclusion === "success" ? "CI passed" : run.status === "in_progress" ? "CI running" : "Latest CI";
    document.querySelector("#ci-detail").textContent = `Latest workflow: ${duration(run.created_at, run.updated_at)}`;
    document.querySelector("#ci-link").href = run.html_url;
    const jobsResponse = await fetch(run.jobs_url, request);
    if (!jobsResponse.ok) return;
    const jobs = await jobsResponse.json();
    const step = jobs.jobs.flatMap((job) => job.steps).find((item) => item.name === "Run npm test" && item.started_at && item.completed_at);
    if (step) {
      document.querySelector("#test-speed").textContent = duration(step.started_at, step.completed_at);
      document.querySelector("#test-detail").textContent = "latest CI test step";
    }
  } catch {
    document.querySelector("#status-dot").classList.add("unavailable");
    document.querySelector("#ci-status").textContent = "Live status unavailable";
  }
};
void loadLiveData();
