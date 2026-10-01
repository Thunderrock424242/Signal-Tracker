import {
  routeDistance,
  estimateRegion,
  signalTrend,
  detectPeaks,
  type SignalSession,
  type KnownBeacon,
  type FrequencyBookmark,
} from "../../packages/core/src/index";
import {
  escapeHTML as e,
  icon,
  button,
  empty,
  number,
  date,
  duration,
} from "./ui";
import { measurementGroup, groups, spectrumFrames } from "./visuals";
import type { CloudConfig } from "./auth";
export interface ViewState {
  sessions: SignalSession[];
  selected?: SignalSession;
  source?: string;
  smoothing: boolean;
  opacity: number;
  beacons: KnownBeacon[];
  bookmarks: FrequencyBookmark[];
  cloud: CloudConfig;
  signedIn: boolean;
  pending: number;
}
const simulated = (s: SignalSession) =>
  s.measurements.some((m) => m.provenance === "simulated") ||
  s.spectrum.some((f) => f.provenance === "simulated");
const badge = (s: SignalSession) =>
  `<span class="tag ${simulated(s) ? "amber" : ""}">${simulated(s) ? "SIMULATED DATA · NOT LIVE" : "RECORDED MEASUREMENTS"}</span>`;
const panelHead = (title: string, right = "") =>
  `<div class="panel-head"><h2>${title}</h2>${right}</div>`;
const selectSource = (s: SignalSession, source?: string) =>
  `<select id="source" aria-label="Measurement source">${groups(s)
    .map(
      (g, i, a) =>
        `<option value="${e(g.id)}" ${g.id === (source ?? a.at(-1)?.id) ? "selected" : ""}>${e(g.label)}</option>`,
    )
    .join("")}</select>`;
export function overview(state: ViewState): string {
  const { selected: s, sessions } = state;
  if (!s)
    return (
      empty(
        "Your fieldwork starts here",
        "Bring your iPhone recordings into one clear view. Explore signal strength, retrace your route, and review what you measured.",
        button("import", "Import recording", true, "upload") +
          button("demo", "Load demo hunt", false, "signal"),
      ) +
      `<div class="intro-grid"><article>${icon("location")}<h3>Take it into the field</h3><p>The native iPhone app records BLE power, GPS breadcrumbs and compass data, even offline.</p></article><article>${icon("map")}<h3>See the bigger picture</h3><p>Review measured strength and estimated regions. A probable source is always shown with uncertainty.</p></article><article>${icon("shield")}<h3>Keep your data yours</h3><p>Your recordings stay in this browser until you choose to export or synchronize.</p></article></div>`
    );
  const samples = measurementGroup(s, state.source),
    values = samples.map((m) => m.rssiDbm ?? m.powerDb!),
    last = samples.at(-1),
    region = estimateRegion(samples),
    meters = routeDistance(s.route);
  return `<div class="recording-bar"><div>${badge(s)}<span>${e(s.name)}</span></div><span>${date(s.startedAt)} ${icon("clock")} ${duration(s.startedAt, s.endedAt)}</span></div>
    <div class="metrics"><article><span class="metric-label">${icon("sessions")} SAVED SESSIONS</span><strong>${sessions.length.toString().padStart(2, "0")}<small>local recordings</small></strong><span class="metric-foot">Ready to review ${icon("arrow")}</span></article><article><span class="metric-label">${icon("signal")} MEASUREMENTS</span><strong>${number(s.measurements.length)}<small>recorded samples</small></strong><span class="metric-foot">${samples.length} in selected source</span></article><article><span class="metric-label">${icon("walk")} ROUTE DISTANCE</span><strong>${meters >= 1000 ? number(meters / 1000, 2) : number(meters)}<small>${meters >= 1000 ? "km" : "m"} walked</small></strong><span class="metric-foot">GPS breadcrumb trail</span></article><article><span class="metric-label">${icon("compass")} ESTIMATE CONFIDENCE</span><strong class="confidence">${region?.confidence.toUpperCase() ?? "—"}</strong><span class="metric-foot">${region ? "Geometry & sample quality" : "More separated fixes needed"}</span></article></div>
    <div class="dashboard-grid"><section class="panel map-panel">${panelHead("Signal map", '<a class="text-link" href="#/map">Expand map ' + icon("arrow") + "</a>")}<canvas id="signal-map" aria-label="Recorded route, signal strength and estimated area"></canvas><div class="map-legend"><span><i class="legend-dot mint"></i>Measured strength</span><span><i class="legend-dash"></i>Estimated area</span><span><i class="legend-dot white"></i>Last recorded position</span></div></section>
    <section class="panel hunt-panel">${panelHead("Selected signal", '<span class="tag subtle">RECORDING</span>')}<div class="target-title">${icon("signal")}<div><h3>${e(s.targetSignal === "demo-camp-beacon" ? "Camp Beacon" : s.name)}</h3><span>${e(last?.receiverID ?? "No receiver data")}</span></div></div><div class="power-reading">${number(last?.rssiDbm ?? last?.powerDb)}<span>${last?.rssiDbm !== undefined ? "dBm" : e(last?.powerUnit ?? "power")}</span></div><div class="strength-bars">${Array.from({ length: 16 }, (_, i) => `<i class="${i < Math.round(Math.min(1, Math.max(0, ((last?.rssiDbm ?? last?.powerDb ?? -110) + 110) / 70)) * 16) ? "on" : ""}"></i>`).join("")}</div><p class="trend">${icon("arrow")}${signalTrend(values) === "stronger" ? "Getting stronger" : signalTrend(values) === "weaker" ? "Getting weaker" : "Signal steady"}</p><div class="estimate-box"><span class="eyebrow">ESTIMATED SOURCE REGION</span><strong>${region ? "~" + number(region.radiusMeters) + " m radius" : "Not enough usable fixes"}</strong><p>${region ? "An uncertain observed region. The source may lie outside it." : "Walk through separated locations with usable GPS."}</p></div>${selectSource(s, state.source)}<a class="button" href="#/sessions">View recording ${icon("arrow")}</a><p class="micro">RSSI does not measure exact distance.</p></section>
    <section class="panel graph-panel">${panelHead("Signal strength over time", '<span class="tag subtle">' + (state.smoothing ? "SMOOTHED" : "RAW") + "</span>")}<canvas id="signal-graph" aria-label="Recorded signal strength over time"></canvas></section><section class="panel field-note">${panelHead("Field notes", icon("compass"))}<p>${e(s.notes || "No notes saved for this session.")}</p><div class="note-footer"><span class="status-dot"></span>Stored locally in this browser</div></section></div>
    <section class="panel recordings-panel">${panelHead("Recent recordings", '<a class="text-link" href="#/sessions">All sessions ' + icon("arrow") + "</a>")}${sessionTable(sessions.slice(0, 4))}</section>`;
}
function sessionTable(sessions: SignalSession[]): string {
  return `<div class="table-wrap"><table><thead><tr><th>RECORDING</th><th>DATE</th><th>SAMPLES</th><th>SOURCE</th><th></th></tr></thead><tbody>${sessions.map((s) => `<tr><td><div class="table-name">${icon(s.type === "wilderness" ? "compass" : "signal")}<div><strong>${e(s.name)}</strong><span>${s.type === "wilderness" ? "Wilderness navigation" : "Signal hunt"} · ${duration(s.startedAt, s.endedAt)}</span></div></div></td><td>${date(s.startedAt)}</td><td class="mono">${number(s.measurements.length)}</td><td>${badge(s)}</td><td><button class="icon-button" data-select="${s.id}" aria-label="Open ${e(s.name)}">${icon("arrow")}</button></td></tr>`).join("")}</tbody></table></div>`;
}
export function mapView(state: ViewState): string {
  const s = state.selected;
  if (!s)
    return empty(
      "No route to display",
      "Import a recording or load demo data to review a geographic signal map.",
      button("import", "Import recording", true) +
        button("demo", "Load demo hunt"),
    );
  const region = estimateRegion(measurementGroup(s, state.source));
  return `<div class="recording-bar"><div>${badge(s)}<span>${e(s.name)}</span></div>${selectSource(s, state.source)}</div><section class="panel full-map">${panelHead("Recorded signal map", '<span class="tag subtle">NORTH UP</span>')}<canvas id="signal-map" aria-label="Offline coordinate map"></canvas><div class="map-controls"><label>Heatmap opacity <input id="opacity" type="range" min="0.1" max="0.9" step="0.05" value="${state.opacity}"></label><label>Replay recording <input id="replay" type="range" min="0.02" max="1" step="0.01" value="1"></label></div><div class="map-legend"><span><i class="legend-dot mint"></i>Measured strength</span><span><i class="legend-dash"></i>Estimated area</span><span>◆ Saved waypoint</span><span><i class="legend-dot purple"></i>Public database</span></div></section><div class="info-grid"><section class="panel">${panelHead("Reading this map")}<p>The heatmap uses recorded power values from one selected receiver, target, frequency and unit. The dashed area is an estimate, never a verified transmitter location.</p><p>${region ? "Heuristic " + region.confidence + " confidence · ~" + number(region.radiusMeters) + " m uncertainty radius" : "Insufficient usable geometry for a source estimate."}</p></section><section class="panel">${panelHead("Offline route & waypoints")}<p>${number(routeDistance(s.route))} m of GPS breadcrumbs · ${s.waypoints.length} waypoints</p><p>${s.lastServicePoint ? "Last connectivity observed at " + s.lastServicePoint.latitude.toFixed(5) + ", " + s.lastServicePoint.longitude.toFixed(5) + ". Service may have changed." : "No last-connectivity point was recorded."}</p><label class="button">${icon("plus")} Import public infrastructure<input id="public-file" type="file" accept="application/json" hidden></label><p class="micro">Only explicitly imported public datasets appear. Source attribution is retained.</p></section></div>`;
}
export function sessionsView(state: ViewState): string {
  return `<section class="panel">${panelHead("Your recordings", button("import", "Import recording", false, "upload"))}${state.sessions.length ? sessionTable(state.sessions) : empty("No saved recordings", "Your local sessions will appear here.")}</section>${state.selected ? `<section class="panel session-detail">${panelHead(e(state.selected.name), badge(state.selected))}<div class="actions">${button("json", "Export JSON", true, "download")}${button("csv", "Export CSV", false, "download")}${button("geojson", "Export GeoJSON", false, "download")}${button("delete-session", "Delete recording")}</div><label>Field notes<textarea id="session-notes" maxlength="10000">${e(state.selected.notes)}</textarea></label>${button("save-notes", "Save notes")}<p class="micro">JSON is the full version-1 interchange format. CSV contains raw power samples; GeoJSON contains route and region features.</p></section>` : ""}`;
}
export function signalsView(state: ViewState): string {
  return `<div class="info-grid"><section class="panel">${panelHead("Known beacons", icon("signal"))}${state.beacons.length ? state.beacons.map((b) => `<div class="list-item"><div><strong>${e(b.name)}</strong><p class="mono">${e(b.identifier)}</p><p>${e(b.notes)}</p><span class="tag subtle">${e(b.type.toUpperCase())} ${b.tags.map(e).join(" · ")}</span></div><button class="icon-button" data-delete-beacon="${b.id}" aria-label="Delete ${e(b.name)}">${icon("close")}</button></div>`).join("") : '<p class="muted">Register your own equipment here. Web registration does not scan for devices.</p>'}</section><section class="panel">${panelHead("Register owned equipment")}<form id="beacon-form"><label>Name<input name="name" required maxlength="100" placeholder="Camp Beacon"></label><label>Identifier<input name="identifier" required maxlength="200" placeholder="CoreBluetooth identifier or bridge signal ID"></label><div class="form-row"><label>Type<select name="type"><option value="ble">BLE</option><option value="rf">External RF</option></select></label><label>Frequency Hz (optional)<input name="frequency" type="number" min="1" step="any"></label></div><label>Tags<input name="tags" maxlength="1000" placeholder="camp, equipment"></label><label>Notes<textarea name="notes" maxlength="2000"></textarea></label><button class="button primary">${icon("plus")}Save beacon</button></form></section></div><section class="panel">${panelHead("Frequency bookmarks")}<div class="bookmark-grid">${state.bookmarks.map((b) => `<article class="bookmark"><strong>${e(b.name)}</strong><p class="mono">${number(b.frequencyHz / 1e6, 4)} MHz</p><span class="micro">${number(b.bandwidthHz)} Hz · ${e(b.mode)}</span><p>${e(b.notes)}</p></article>`).join("") || '<p class="muted">Save an authorized frequency from the Spectrum page.</p>'}</div></section>`;
}
export function spectrumView(state: ViewState): string {
  const s = state.selected,
    frames = s ? spectrumFrames(s) : [],
    f = frames.at(-1);
  if (!s || !f)
    return empty(
      "Spectrum needs a receiver recording",
      "The iPhone and dashboard cannot scan arbitrary RF. Import an authorized external receiver recording, or explore simulated spectrum data.",
      button("import", "Import recording", true) +
        button("demo", "Load demo hunt"),
    );
  const peaks = detectPeaks(f);
  return `<div class="recording-bar"><div>${badge(s)}<span>${e(f.receiverID)}</span></div><span>RECORDED FRAMES · ${frames.length}</span></div><div class="spectrum-metrics"><span>Center <strong class="mono">${number(f.centerFrequencyHz / 1e6, 3)} MHz</strong></span><span>Span <strong class="mono">${number(f.spanHz / 1e6, 2)} MHz</strong></span><span>Power unit <strong class="mono">${e(f.powerUnit.toUpperCase())}</strong></span><span>Bins <strong class="mono">${f.bins.length}</strong></span></div><section class="panel">${panelHead("Recorded spectrum", '<span class="tag subtle">PEAK DETECTOR</span>')}<canvas id="spectrum-chart" aria-label="Frequency and recorded power"></canvas><div class="spectrum-axis"><span>${number((f.centerFrequencyHz - f.spanHz / 2) / 1e6, 3)} MHz</span><span>${number((f.centerFrequencyHz + f.spanHz / 2) / 1e6, 3)} MHz</span></div><div class="map-controls"><label>Zoom<input id="spectrum-zoom" type="range" min="1" max="8" step="0.1" value="1"></label><label>Pan<input id="spectrum-pan" type="range" min="0" max="1" step="0.01" value="0.5"></label><label>Cursor<input id="spectrum-cursor" type="range" min="0" max="1" step="0.01" value="0.5"></label></div><p id="cursor-frequency" class="mono micro">Cursor: ${number(f.centerFrequencyHz / 1e6, 4)} MHz</p></section><section class="panel">${panelHead("Waterfall", '<span class="micro">Frequency → &nbsp; Recorded time ↓</span>')}<canvas id="waterfall" aria-label="Frequency across time, intensity indicating recorded power"></canvas><div class="waterfall-legend"><span>WEAK</span><i></i><span>STRONG</span></div></section><div class="info-grid"><section class="panel">${panelHead("Detected peaks")}<div class="table-wrap"><table><thead><tr><th>FREQUENCY</th><th>POWER</th></tr></thead><tbody>${peaks.map((p) => `<tr><td class="mono">${number(p.frequencyHz / 1e6, 4)} MHz</td><td class="mono">${number(p.powerDb, 1)} ${e(f.powerUnit)}</td></tr>`).join("")}</tbody></table></div><p class="micro">Peaks are spectral features, not confirmed transmitters. Relative dBFS is never converted to dBm.</p></section><section class="panel">${panelHead("Save a frequency")}<form id="bookmark-form"><label>Name<input name="name" required maxlength="100" placeholder="Authorized test signal"></label><div class="form-row"><label>Frequency Hz<input name="frequency" type="number" min="1" step="any" required value="${Math.round(peaks[0]?.frequencyHz ?? f.centerFrequencyHz)}"></label><label>Bandwidth Hz<input name="bandwidth" type="number" min="1" step="any" required value="200000"></label></div><label>Mode or type<input name="mode" maxlength="50" placeholder="Test carrier"></label><label>Notes<textarea name="notes" maxlength="2000"></textarea></label><button class="button primary">Save bookmark</button></form></section></div>`;
}
export function receiversView(state: ViewState): string {
  const all = state.sessions.flatMap((s) => s.measurements),
    ids = [...new Set(all.map((m) => m.receiverID))];
  return `<div class="callout">${icon("receivers")}<div><strong>Receiver history</strong><p>This dashboard reviews imported or synchronized receiver data. Live connections and scanning belong to the iPhone app.</p></div></div><div class="receiver-grid">${
    ids
      .map((id) => {
        const samples = all
            .filter((m) => m.receiverID === id)
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
          last = samples.at(-1)!,
          elapsed =
            (Date.parse(last.timestamp) - Date.parse(samples[0]!.timestamp)) /
            1000;
        return `<section class="panel receiver-card"><div class="receiver-icon">${icon("receivers")}</div><span class="tag ${last.provenance === "simulated" ? "amber" : "subtle"}">${last.provenance === "simulated" ? "SIMULATED" : "RECORDED"}</span><h2>${e(id)}</h2><p>${e(last.receiverType.toUpperCase())} · ${samples.length} stored measurements</p><dl><dt>Latest recorded power</dt><dd>${number(last.rssiDbm ?? last.powerDb, 1)} ${last.rssiDbm !== undefined ? "dBm" : e(last.powerUnit)}</dd><dt>Average recorded interval</dt><dd>${samples.length > 1 ? number(elapsed / (samples.length - 1), 2) + " s" : "Unavailable"}</dd><dt>Last sample</dt><dd>${e(new Date(last.timestamp).toLocaleString())}</dd><dt>Battery / latency</dt><dd>Not supplied in these recordings</dd></dl></section>`;
      })
      .join("") ||
    empty(
      "No receiver history",
      "Import a session recorded with iPhone BLE or an authorized receiver bridge.",
      button("import", "Import recording", true),
    )
  }</div>`;
}
export function settingsView(state: ViewState): string {
  const c = state.cloud;
  return `<div class="info-grid"><section class="panel">${panelHead("Display & local storage")}<div class="setting-line"><div><strong>Smooth signal graphs</strong><p>Raw measurements are always preserved.</p></div><input id="smoothing" type="checkbox" ${state.smoothing ? "checked" : ""} aria-label="Smooth signal graphs"></div><div class="setting-line"><div><strong>No background uploads</strong><p>Synchronization happens only when you choose an action.</p></div>${icon("shield")}</div><div class="setting-line"><div><strong>Local recordings</strong><p>${state.sessions.length} sessions · ${state.pending} pending uploads</p></div><span class="tag">LOCAL FIRST</span></div>${button("delete-all", "Delete all local history")}<p class="micro">Deletes local sessions, beacons, bookmarks, public layers and pending uploads. Cloud history is a separate action.</p></section><section class="panel">${panelHead("Optional cloud synchronization")}<form id="cloud-form"><label class="check-label"><input type="checkbox" name="enabled" ${c.enabled ? "checked" : ""}>Enable optional synchronization</label><label>HTTPS API URL<input name="apiURL" type="url" value="${e(c.apiURL)}" placeholder="https://signal-api.example.com"></label><label>HTTPS OIDC issuer<input name="issuer" type="url" value="${e(c.issuer)}" placeholder="https://identity.example.com/"></label><label>Public client ID<input name="clientID" value="${e(c.clientID)}" maxlength="200"></label><label>API audience<input name="audience" value="${e(c.audience)}" maxlength="200"></label><button class="button">Save configuration</button></form><div class="actions">${button(state.signedIn ? "signout" : "signin", state.signedIn ? "Sign out" : "Sign in", true)}${button("sync", "Upload saved sessions")}${button("pull", "Download cloud sessions")}</div>${button("delete-cloud", "Delete my cloud history")}<p class="micro">No account is required locally. Tokens stay in memory and are cleared on reload. Your identity provider must support a public browser client with PKCE and JWT API access tokens.</p></section></div><section class="panel">${panelHead("Field limits & privacy")}<div class="info-grid borderless"><div><h3>Measurements need context</h3><p>Reflections, trees, terrain and buildings affect radio strength. GPS accuracy varies. Strong power does not guarantee proximity. Estimated regions are uncalibrated heuristics.</p></div><div><h3>Navigate with an independent backup</h3><p>Bring a map and compass, monitor battery, and share your plan. Radio hunting and last-connectivity observations are not emergency guarantees.</p></div><div><h3>Permissions stay on the phone</h3><p>CoreBluetooth and CoreLocation use public APIs. The site neither collects Wi-Fi credentials nor scans cellular traffic. Imported data stays in this browser until explicitly shared.</p></div></div></section>`;
}
