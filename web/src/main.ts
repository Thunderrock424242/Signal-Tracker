import "./style.css";
import { z } from "zod";
import {
  createDemoSession,
  parseSessionJSON,
  exportJSON,
  exportCSV,
  exportGeoJSON,
  BeaconSchema,
  BookmarkSchema,
  PublicInfrastructureSchema,
  type SignalSession,
  type PublicInfrastructure,
} from "../../packages/core/src/index";
import { FieldRepository } from "./store";
import { BrowserAuth, defaultCloud, httpsURL } from "./auth";
import { SyncClient } from "./sync";
import { icon, button, escapeHTML as e } from "./ui";
import {
  overview,
  mapView,
  sessionsView,
  signalsView,
  spectrumView,
  receiversView,
  settingsView,
  type ViewState,
} from "./views";
import {
  mountCanvas,
  mapDrawing,
  graphDrawing,
  spectrumDrawing,
  measurementGroup,
  spectrumFrames,
} from "./visuals";

const repository = new FieldRepository(),
  auth = new BrowserAuth(),
  sync = new SyncClient(repository, auth),
  app = document.querySelector<HTMLDivElement>("#app")!;
const state: ViewState = {
  sessions: [],
  smoothing: true,
  opacity: 0.6,
  beacons: [],
  bookmarks: [],
  cloud: { ...defaultCloud },
  signedIn: false,
  pending: 0,
};
let publicLayer: PublicInfrastructure[] = [],
  disposers: (() => void)[] = [],
  replay = 1,
  zoom = 1,
  pan = 0.5,
  cursor = 0.5,
  busy = false;
const nav = [
  ["dashboard", "Overview", "overview"],
  ["map", "Signal map", "map"],
  ["sessions", "Sessions", "sessions"],
  ["signals", "Saved signals", "signal"],
  ["spectrum", "Spectrum", "spectrum"],
  ["receivers", "Receivers", "receivers"],
  ["settings", "Settings", "settings"],
] as const;
const page = () =>
  location.hash.replace(/^#\/?/, "").split("?")[0] || "dashboard";
let noticeTimer: ReturnType<typeof setTimeout>;
function notice(message: string, error = false) {
  const el = document.querySelector<HTMLDivElement>("#notice")!;
  el.textContent = message;
  el.className = "visible" + (error ? " error" : "");
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    el.className = "";
  }, 6000);
}
async function refresh() {
  state.sessions = await repository.list();
  state.selected =
    state.sessions.find((s) => s.id === state.selected?.id) ??
    state.sessions[0];
  state.pending = (await sync.queue.pending()).length;
  state.signedIn = auth.signedIn;
  render();
}
function render() {
  disposers.forEach((f) => f());
  disposers = [];
  const current = page(),
    item = nav.find(([id]) => id === current) ?? nav[0],
    title =
      item[1] === "Overview"
        ? "Field overview"
        : item[1] === "Signal map"
          ? "Signal map"
          : item[1];
  const descriptions: Record<string, string> = {
    dashboard: "A clearer view of your fieldwork.",
    map: "Follow your route. Understand your measurements.",
    sessions: "Every hunt, ready to retrace.",
    signals: "Your beacons, frequencies, and field equipment.",
    spectrum: "Recorded RF power, across frequency and time.",
    receivers: "The sources behind your recordings.",
    settings: "Your instrument. Your preferences.",
  };
  const routeView: Record<string, (s: ViewState) => string> = {
    dashboard: overview,
    map: mapView,
    sessions: sessionsView,
    signals: signalsView,
    spectrum: spectrumView,
    receivers: receiversView,
    settings: settingsView,
  };
  app.innerHTML = `<aside class="sidebar"><a class="brand" href="#/dashboard"><span class="brand-mark">${icon("signal")}</span><span>SIGNAL<span class="brand-light">TRACKER</span><small>FIELD INTELLIGENCE</small></span></a><div class="workspace-label">YOUR WORKSPACE</div><nav aria-label="Main navigation">${nav.map(([id, label, svg]) => `<a href="#/${id}" class="nav-link ${id === current ? "active" : ""}" ${id === current ? 'aria-current="page"' : ""}>${icon(svg)}<span>${label}</span>${id === "sessions" && state.sessions.length ? '<small aria-hidden="true">' + state.sessions.length + "</small>" : ""}</a>`).join("")}</nav><div class="sidebar-bottom"><div class="local-card">${icon("shield")}<strong>Local by design</strong><p>Field data stays yours.<br>Sync only when you choose.</p><a href="#/settings">Privacy & controls ${icon("arrow")}</a></div><div class="edition"><i class="status-dot"></i>FIELD EDITION <span>v0.1</span></div></div></aside>
    <div class="workspace"><header class="topbar"><span class="breadcrumb">WORKSPACE <span>/</span> ${e(item[1].toUpperCase())}</span><div class="top-status"><span><i class="status-dot"></i>LOCAL WORKSPACE</span><span class="profile">ST</span></div></header><main><div class="page-heading"><div><span class="eyebrow">SIGNAL TRACKER / FIELD DASHBOARD</span><h1>${e(title)}</h1><p>${descriptions[current] ?? descriptions.dashboard}</p></div><div class="actions">${state.selected ? button("json", "Export JSON", false, "download") : ""}${button("import", "Import recording", true, "plus")}</div></div>${(routeView[current] ?? overview)(state)}<footer class="page-footer"><span>${icon("shield")}Your data. Your signals. Your field.</span><span>RECORDINGS & ESTIMATES · NO WEB SCANNING</span></footer></main></div><input id="import-file" type="file" accept="application/json,.json" hidden>`;
  visuals();
}
function visuals() {
  const s = state.selected;
  if (!s) return;
  const samples = measurementGroup(s, state.source);
  const map = document.querySelector<HTMLCanvasElement>("#signal-map");
  if (map)
    disposers.push(
      mountCanvas(
        map,
        mapDrawing(s, samples, state.opacity, replay, publicLayer),
      ),
    );
  const graph = document.querySelector<HTMLCanvasElement>("#signal-graph");
  if (graph)
    disposers.push(mountCanvas(graph, graphDrawing(samples, state.smoothing)));
  const frames = spectrumFrames(s),
    f = frames.at(-1);
  if (f) {
    const spectrum =
        document.querySelector<HTMLCanvasElement>("#spectrum-chart"),
      waterfall = document.querySelector<HTMLCanvasElement>("#waterfall");
    if (spectrum)
      disposers.push(
        mountCanvas(
          spectrum,
          spectrumDrawing(f, false, frames, zoom, pan, cursor),
        ),
      );
    if (waterfall)
      disposers.push(
        mountCanvas(
          waterfall,
          spectrumDrawing(f, true, frames, zoom, pan, cursor),
        ),
      );
  }
}
function redraw() {
  disposers.forEach((f) => f());
  disposers = [];
  visuals();
}
function download(format: string) {
  const s = state.selected;
  if (!s) throw Error("Select a recording first.");
  const data =
      format === "json"
        ? exportJSON(s)
        : format === "csv"
          ? exportCSV(s)
          : JSON.stringify(exportGeoJSON(s), null, 2),
    mime = format === "csv" ? "text/csv" : "application/json";
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `signal-tracker-${s.id}.${format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function perform(action: string) {
  if (
    busy &&
    [
      "delete-session",
      "delete-all",
      "delete-cloud",
      "save-notes",
      "signin",
      "signout",
      "demo",
    ].includes(action)
  )
    throw Error(
      "Wait for the active transfer to finish before changing or deleting data.",
    );
  if (["json", "csv", "geojson"].includes(action)) {
    download(action);
    return;
  }
  if (action === "import") {
    document.querySelector<HTMLInputElement>("#import-file")!.click();
    return;
  }
  if (action === "demo") {
    const demo = createDemoSession();
    await repository.put(demo);
    state.selected = demo;
    state.source = undefined;
    replay = 1;
    await refresh();
    notice("Simulated demo recording loaded. No live measurements.");
    return;
  }
  if (action === "delete-session") {
    if (
      !state.selected ||
      !confirm(
        "Delete this local recording and its pending upload? Cloud copies are unchanged.",
      )
    )
      return;
    await sync.queue.remove(state.selected.id);
    await repository.delete(state.selected.id);
    state.selected = undefined;
    await refresh();
    notice("Local recording deleted.");
    return;
  }
  if (action === "delete-all") {
    if (
      !confirm(
        "Delete all local recordings, beacons, bookmarks, public layers, and pending uploads? Cloud copies are unchanged.",
      )
    )
      return;
    await repository.clearHistory();
    state.beacons = [];
    state.bookmarks = [];
    state.selected = undefined;
    publicLayer = [];
    await refresh();
    notice("Local history deleted.");
    return;
  }
  if (action === "save-notes") {
    if (!state.selected) return;
    state.selected.notes =
      document.querySelector<HTMLTextAreaElement>("#session-notes")!.value;
    await sync.saveNotes(state.selected);
    notice("Field notes saved locally.");
    return;
  }
  if (action === "signin") {
    await auth.login(state.cloud);
    return;
  }
  if (action === "signout") {
    auth.signOut();
    await refresh();
    notice("Signed out. Recordings remain local.");
    return;
  }
  if (action === "sync") {
    if (busy) throw Error("A sync action is already in progress.");
    busy = true;
    try {
      const count = await sync.upload(state.cloud);
      notice(`${count} requested recordings uploaded.`);
    } finally {
      busy = false;
      await refresh();
    }
    return;
  }
  if (action === "pull") {
    if (busy) throw Error("A sync action is already in progress.");
    busy = true;
    try {
      const count = await sync.download(state.cloud);
      notice(`${count} cloud recordings downloaded.`);
    } finally {
      busy = false;
      await refresh();
    }
    return;
  }
  if (action === "delete-cloud") {
    if (
      !confirm(
        "Delete all recordings belonging to your authenticated cloud account? Local copies stay on this browser.",
      )
    )
      return;
    await sync.deleteAll(state.cloud);
    notice("Your cloud history was deleted.");
    return;
  }
}
app.addEventListener("click", (event) => {
  const target = (event.target as Element).closest<HTMLButtonElement>(
    "[data-action],[data-select],[data-delete-beacon]",
  );
  if (!target) return;
  void (async () => {
    if (target.dataset.select) {
      state.selected = state.sessions.find(
        (s) => s.id === target.dataset.select,
      );
      state.source = undefined;
      replay = 1;
      location.hash = "/sessions";
      render();
      return;
    }
    if (target.dataset.deleteBeacon) {
      state.beacons = state.beacons.filter(
        (b) => b.id !== target.dataset.deleteBeacon,
      );
      await repository.writeMeta("beacons", JSON.stringify(state.beacons));
      render();
      return;
    }
    await perform(target.dataset.action!);
  })().catch((error) =>
    notice(
      error instanceof Error ? error.message : "Action could not finish.",
      true,
    ),
  );
});
app.addEventListener("change", (event) => {
  const input = event.target as HTMLInputElement;
  void (async () => {
    if (input.id === "import-file") {
      const file = input.files?.[0];
      if (!file) return;
      if (busy)
        throw Error(
          "Wait for the active transfer before importing a recording.",
        );
      try {
        if (file.size > 2_000_000) throw Error("Recording exceeds 2 MB.");
        const s = parseSessionJSON(await file.text());
        await repository.put(s);
        state.selected = s;
        state.source = undefined;
        await refresh();
        notice("Recording imported and saved locally.");
      } catch {
        notice(
          "Import rejected: use a valid version-1 Signal Tracker JSON recording under 2 MB.",
          true,
        );
      }
      return;
    }
    if (input.id === "public-file") {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 500000) throw Error("Public layer exceeds 500 KB.");
      publicLayer = z
        .array(PublicInfrastructureSchema)
        .max(500)
        .parse(JSON.parse(await file.text()));
      await repository.writeMeta("public-layer", JSON.stringify(publicLayer));
      redraw();
      notice("Public database layer imported with attribution.");
      return;
    }
    if (input.id === "source") {
      state.source = input.value;
      render();
    }
    if (input.id === "smoothing") {
      state.smoothing = input.checked;
      await repository.writeMeta("smoothing", JSON.stringify(state.smoothing));
      render();
    }
  })().catch((error) =>
    notice(
      error instanceof Error ? error.message : "Setting could not be saved.",
      true,
    ),
  );
});
app.addEventListener("input", (event) => {
  const input = event.target as HTMLInputElement;
  if (input.id === "opacity") {
    state.opacity = Number(input.value);
    redraw();
  }
  if (input.id === "replay") {
    replay = Number(input.value);
    redraw();
  }
  if (input.id.startsWith("spectrum-")) {
    if (input.id === "spectrum-zoom") zoom = Number(input.value);
    if (input.id === "spectrum-pan") pan = Number(input.value);
    if (input.id === "spectrum-cursor") cursor = Number(input.value);
    redraw();
    const f = state.selected
      ? spectrumFrames(state.selected).at(-1)
      : undefined;
    if (f) {
      const bins = Math.max(2, Math.round(f.bins.length / zoom)),
        start = Math.floor((f.bins.length - bins) * pan),
        hz =
          f.centerFrequencyHz -
          f.spanHz / 2 +
          ((start + cursor * (bins - 1)) * f.spanHz) / (f.bins.length - 1);
      document.querySelector("#cursor-frequency")!.textContent =
        "Cursor: " + (hz / 1e6).toFixed(4) + " MHz";
    }
  }
});
app.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target as HTMLFormElement,
    data = new FormData(form),
    value = (key: string) => String(data.get(key) ?? "");
  void (async () => {
    if (busy)
      throw Error(
        "Wait for the active transfer before changing settings or saved equipment.",
      );
    if (form.id === "beacon-form") {
      const frequency = value("frequency");
      const b = BeaconSchema.parse({
        id: crypto.randomUUID(),
        name: value("name"),
        type: value("type"),
        identifier: value("identifier"),
        icon: "signal",
        notes: value("notes"),
        frequencyHz: frequency ? Number(frequency) : undefined,
        tags: value("tags")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      state.beacons.push(b);
      await repository.writeMeta("beacons", JSON.stringify(state.beacons));
      render();
      notice("Owned beacon saved locally.");
    }
    if (form.id === "bookmark-form") {
      const b = BookmarkSchema.parse({
        id: crypto.randomUUID(),
        name: value("name"),
        frequencyHz: Number(value("frequency")),
        bandwidthHz: Number(value("bandwidth")),
        mode: value("mode"),
        notes: value("notes"),
      });
      state.bookmarks.push(b);
      await repository.writeMeta("bookmarks", JSON.stringify(state.bookmarks));
      notice("Frequency bookmark saved locally.");
      form.reset();
    }
    if (form.id === "cloud-form") {
      const enabled = data.has("enabled"),
        apiURL = value("apiURL").trim(),
        issuer = value("issuer").trim(),
        clientID = value("clientID").trim(),
        audience = value("audience").trim();
      if (enabled) {
        httpsURL(apiURL);
        httpsURL(issuer);
        if (!clientID || !audience)
          throw Error("A public client ID and API audience are required.");
      }
      auth.signOut();
      state.cloud = { enabled, apiURL, issuer, clientID, audience };
      await repository.writeMeta("cloud-config", JSON.stringify(state.cloud));
      render();
      notice("Configuration saved. Sign in before requesting sync.");
    }
  })().catch((error) =>
    notice(
      error instanceof Error ? error.message : "Form could not be saved.",
      true,
    ),
  );
});
window.addEventListener("hashchange", () => {
  replay = 1;
  zoom = 1;
  pan = 0.5;
  cursor = 0.5;
  render();
  window.scrollTo(0, 0);
});
async function start() {
  render();
  try {
    const beaconData = await repository.readMeta("beacons"),
      bookmarkData = await repository.readMeta("bookmarks"),
      cloudData = await repository.readMeta("cloud-config"),
      smooth = await repository.readMeta("smoothing"),
      publicData = await repository.readMeta("public-layer");
    state.beacons = beaconData
      ? z.array(BeaconSchema).max(1000).parse(JSON.parse(beaconData))
      : [];
    state.bookmarks = bookmarkData
      ? z.array(BookmarkSchema).max(1000).parse(JSON.parse(bookmarkData))
      : [];
    if (cloudData)
      state.cloud = z
        .object({
          enabled: z.boolean(),
          apiURL: z.string().max(1000),
          issuer: z.string().max(1000),
          clientID: z.string().max(200),
          audience: z.string().max(200),
        })
        .parse(JSON.parse(cloudData));
    state.smoothing = smooth ? z.boolean().parse(JSON.parse(smooth)) : true;
    publicLayer = publicData
      ? z
          .array(PublicInfrastructureSchema)
          .max(500)
          .parse(JSON.parse(publicData))
      : [];
    await auth.finishCallback(state.cloud);
    await refresh();
  } catch (error) {
    notice(
      error instanceof Error
        ? error.message
        : "Local storage is unavailable. Your previous files have been preserved.",
      true,
    );
  }
}
void start();
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  void navigator.serviceWorker
    .register(import.meta.env.BASE_URL + "sw.js", {
      scope: import.meta.env.BASE_URL,
    })
    .catch(() => {});
}
