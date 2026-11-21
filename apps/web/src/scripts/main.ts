// Progressive enhancement only: every section works and reads without this file.

/* Copy the connector URL */
async function copyText(text: string, input: HTMLInputElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers without async clipboard (or without permission).
    input.focus();
    input.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    }
  }
}

document.querySelectorAll<HTMLElement>("[data-copy-root]").forEach((root) => {
  const input = root.querySelector<HTMLInputElement>("[data-copy-source]");
  const button = root.querySelector<HTMLButtonElement>("[data-copy-button]");
  const status = root.querySelector<HTMLElement>("[data-copy-status]");
  if (!input || !button || !status) return;
  let timer: number | undefined;

  // Selecting the whole URL on focus makes manual copying painless too.
  input.addEventListener("focus", () => input.select());

  button.addEventListener("click", async () => {
    const ok = await copyText(input.value, input);
    window.clearTimeout(timer);
    if (ok) {
      root.dataset.copied = "true";
      status.textContent = "Copied to clipboard. Paste it into your AI’s connector settings.";
    } else {
      input.focus();
      input.select();
      status.textContent = "Couldn’t copy automatically. The URL is selected: press Ctrl+C or Cmd+C.";
    }
    timer = window.setTimeout(() => {
      delete root.dataset.copied;
      status.textContent = "";
    }, 4000);
  });
});

/* Tabs (WAI-ARIA tabs pattern, automatic activation) */
document.querySelectorAll<HTMLElement>("[data-tabs]").forEach((wrap) => {
  const tabs = Array.from(wrap.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const panels = tabs.map((t) => document.getElementById(t.getAttribute("aria-controls") ?? ""));

  const select = (index: number, focus: boolean) => {
    tabs.forEach((tab, i) => {
      const on = i === index;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      const panel = panels[i];
      if (panel) panel.hidden = !on;
    });
    if (focus) tabs[index].focus();
  };

  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => select(i, false));
    tab.addEventListener("keydown", (e) => {
      const last = tabs.length - 1;
      let next: number | null = null;
      if (e.key === "ArrowRight") next = i === last ? 0 : i + 1;
      else if (e.key === "ArrowLeft") next = i === 0 ? last : i - 1;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = last;
      if (next !== null) {
        e.preventDefault();
        select(next, true);
      }
    });
  });

  wrap.dataset.ready = "true";
  select(0, false);
});
