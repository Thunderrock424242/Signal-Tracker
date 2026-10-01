import {
  distanceMeters,
  detectPeaks,
  smoothRSSI,
  wrapLongitude,
  estimateRegion,
  type SignalSession,
  type SignalMeasurement,
  type SpectrumFrame,
  type PublicInfrastructure,
} from "../../packages/core/src/index";
export function measurementGroup(
  s: SignalSession,
  source?: string,
): SignalMeasurement[] {
  const domain = (m: SignalMeasurement) =>
    JSON.stringify([
      m.receiverID,
      m.signalIdentifier,
      m.frequencyHz,
      m.rssiDbm !== undefined ? "dbm" : m.powerUnit,
      m.provenance,
    ]);
  const selected =
    source ?? (s.measurements.at(-1) ? domain(s.measurements.at(-1)!) : "");
  return s.measurements.filter((m) => domain(m) === selected);
}
export function groups(s: SignalSession): { id: string; label: string }[] {
  return [
    ...new Map(
      s.measurements.map((m) => {
        const id = JSON.stringify([
          m.receiverID,
          m.signalIdentifier,
          m.frequencyHz,
          m.rssiDbm !== undefined ? "dbm" : m.powerUnit,
          m.provenance,
        ]);
        const label = `${m.receiverID} · ${m.rssiDbm !== undefined ? "dBm" : m.powerUnit}${m.frequencyHz ? " · " + (m.frequencyHz / 1e6).toFixed(3) + " MHz" : ""} · ${m.provenance}`;
        return [id, { id, label }];
      }),
    ).values(),
  ];
}
type Draw = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) => void;
export function mountCanvas(canvas: HTMLCanvasElement, draw: Draw): () => void {
  const update = () => {
    const { width, height } = canvas.getBoundingClientRect(),
      ratio = Math.min(devicePixelRatio || 1, 2);
    if (!width || !height) return;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw(context, width, height);
  };
  const observer = new ResizeObserver(update);
  observer.observe(canvas);
  update();
  return () => observer.disconnect();
}
function grid(c: CanvasRenderingContext2D, w: number, h: number) {
  c.fillStyle = "#101e19";
  c.fillRect(0, 0, w, h);
  c.strokeStyle = "#26342c";
  c.lineWidth = 0.5;
  for (let x = 0; x < w; x += 40) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, h);
    c.stroke();
  }
  for (let y = 0; y < h; y += 40) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(w, y);
    c.stroke();
  }
}
export function mapDrawing(
  s: SignalSession,
  samples: SignalMeasurement[],
  opacity: number,
  replay = 1,
  publicLayer: PublicInfrastructure[] = [],
): Draw {
  return (c, w, h) => {
    grid(c, w, h);
    const limit = Math.max(1, Math.floor(samples.length * replay)),
      visible = samples.slice(0, limit);
    const cutoff =
      visible.at(-1)?.timestamp ??
      s.route.at(Math.max(0, Math.floor(s.route.length * replay) - 1))
        ?.timestamp;
    const route = s.route.filter((p) => !cutoff || p.timestamp <= cutoff),
      points = route.length
        ? route
        : visible.flatMap((m) => (m.location ? [m.location] : [])),
      origin = points[0];
    if (!origin) {
      c.fillStyle = "#9cac9f";
      c.font = "13px system-ui";
      c.fillText("No geographic fixes in this recording.", 24, h / 2);
      return;
    }
    const xy = (p: { latitude: number; longitude: number }) => ({
      x:
        wrapLongitude(p.longitude - origin.longitude) *
        111320 *
        Math.cos((origin.latitude * Math.PI) / 180),
      y: (p.latitude - origin.latitude) * 111320,
    });
    const region = estimateRegion(visible),
      positions = points.map(xy);
    let minX = Math.min(...positions.map((p) => p.x)),
      maxX = Math.max(...positions.map((p) => p.x)),
      minY = Math.min(...positions.map((p) => p.y)),
      maxY = Math.max(...positions.map((p) => p.y));
    if (region) {
      const p = xy({
        latitude: region.centerLatitude,
        longitude: region.centerLongitude,
      });
      minX = Math.min(minX, p.x - region.radiusMeters);
      maxX = Math.max(maxX, p.x + region.radiusMeters);
      minY = Math.min(minY, p.y - region.radiusMeters);
      maxY = Math.max(maxY, p.y + region.radiusMeters);
    }
    const scale = Math.min(
      (w - 90) / Math.max(120, maxX - minX),
      (h - 90) / Math.max(120, maxY - minY),
    );
    const project = (p: { latitude: number; longitude: number }) => {
      const n = xy(p);
      return {
        x: w / 2 + (n.x - (minX + maxX) / 2) * scale,
        y: h / 2 - (n.y - (minY + maxY) / 2) * scale,
      };
    };
    const powers = visible
        .map((m) => m.rssiDbm ?? m.powerDb!)
        .filter(Number.isFinite),
      low = Math.min(...powers),
      high = Math.max(...powers);
    for (
      let i = 0;
      i < visible.length;
      i += Math.max(1, Math.ceil(visible.length / 600))
    ) {
      const m = visible[i]!;
      if (!m.location) continue;
      const p = project(m.location),
        strength = ((m.rssiDbm ?? m.powerDb!) - low) / Math.max(1, high - low),
        radius = 8 + strength * 17,
        gradient = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
      gradient.addColorStop(
        0,
        `rgba(${Math.round(80 + strength * 60)},${Math.round(130 + strength * 110)},${Math.round(220 - strength * 70)},${opacity * 0.65})`,
      );
      gradient.addColorStop(1, "rgba(110,230,166,0)");
      c.fillStyle = gradient;
      c.beginPath();
      c.arc(p.x, p.y, radius, 0, Math.PI * 2);
      c.fill();
    }
    if (region) {
      const p = project({
        latitude: region.centerLatitude,
        longitude: region.centerLongitude,
      });
      c.beginPath();
      c.arc(p.x, p.y, region.radiusMeters * scale, 0, Math.PI * 2);
      c.fillStyle = "#c7b67d0c";
      c.fill();
      c.strokeStyle = "#b4a771";
      c.lineWidth = 1.4;
      c.setLineDash([5, 5]);
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = "#cabb91";
      c.font = "10px ui-monospace,monospace";
      c.fillText("ESTIMATED AREA", p.x - 43, p.y - 12);
      c.fillText(
        "~" + Math.round(region.radiusMeters) + " m radius",
        p.x - 43,
        p.y + 5,
      );
    }
    c.beginPath();
    route.forEach((p, i) => {
      const n = project(p);
      if (i && !p.segmentStart) c.lineTo(n.x, n.y);
      else c.moveTo(n.x, n.y);
    });
    c.strokeStyle = "#a7dfb9";
    c.lineWidth = 2;
    c.stroke();
    visible.forEach((m, i) => {
      if (!m.location || i % Math.max(1, Math.floor(visible.length / 24)))
        return;
      const p = project(m.location);
      c.fillStyle = "#86cba4";
      c.beginPath();
      c.arc(p.x, p.y, 2, 0, Math.PI * 2);
      c.fill();
    });
    if (route[0]) {
      const p = project(route[0]);
      c.fillStyle = "#a7dfb9";
      c.fillRect(p.x - 4, p.y - 4, 8, 8);
      c.font = "10px ui-monospace,monospace";
      c.fillText("START", p.x - 17, p.y + 21);
    }
    if (route.at(-1)) {
      const p = project(route.at(-1)!);
      c.strokeStyle = "#a7dfb94a";
      c.lineWidth = 7;
      c.beginPath();
      c.arc(p.x, p.y, 6, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = "#eaf9ee";
      c.beginPath();
      c.arc(p.x, p.y, 4, 0, Math.PI * 2);
      c.fill();
    }
    for (const waypoint of s.waypoints) {
      const p = project(waypoint);
      c.fillStyle = "#87bce0";
      c.font = "14px system-ui";
      c.fillText("◆", p.x - 6, p.y + 5);
    }
    if (s.lastServicePoint) {
      const p = project(s.lastServicePoint);
      c.fillStyle = "#87bce0";
      c.beginPath();
      c.arc(p.x, p.y, 5, 0, Math.PI * 2);
      c.fill();
    }
    for (const infrastructure of publicLayer) {
      const p = project(infrastructure);
      if (p.x < 20 || p.y < 20 || p.x > w - 20 || p.y > h - 20) continue;
      c.fillStyle = "#bba8dc";
      c.fillRect(p.x - 3, p.y - 3, 6, 6);
      c.font = "9px ui-monospace,monospace";
      c.fillText("PUBLIC DATABASE", p.x + 8, p.y + 3);
    }
    c.fillStyle = "#90a999";
    c.font = "10px ui-monospace,monospace";
    c.fillText("N", w - 27, 24);
    c.beginPath();
    c.moveTo(w - 23, 31);
    c.lineTo(w - 23, 54);
    c.strokeStyle = "#90a999";
    c.stroke();
    const scaleMeters = Math.max(1, Math.round(60 / scale / 10) * 10);
    c.fillText(scaleMeters + " m", 25, h - 21);
    c.beginPath();
    c.moveTo(25, h - 33);
    c.lineTo(25 + scaleMeters * scale, h - 33);
    c.stroke();
    c.fillStyle = "#769083";
    c.fillText(
      "LOCAL COORDINATES · NO TERRAIN BASEMAP",
      Math.max(25, w - 287),
      h - 21,
    );
  };
}
export function graphDrawing(
  samples: SignalMeasurement[],
  smoothing: boolean,
  distanceAxis = false,
): Draw {
  return (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const values = samples.map((m) => m.rssiDbm ?? m.powerDb!),
      series = smoothing ? smoothRSSI(values) : values;
    if (!series.length) return;
    const min = Math.floor((Math.min(...series) - 5) / 10) * 10,
      max = Math.ceil((Math.max(...series) + 5) / 10) * 10,
      pad = 36,
      plotW = w - pad - 12,
      plotH = h - 45;
    let walked = 0;
    const distances = samples.map((m, i) => {
      if (i && m.location && samples[i - 1]?.location)
        walked += distanceMeters(m.location, samples[i - 1]!.location!);
      return walked;
    });
    const axis = distanceAxis
        ? distances
        : samples.map(
            (m) =>
              (Date.parse(m.timestamp) - Date.parse(samples[0]!.timestamp)) /
              1000,
          ),
      last = Math.max(1, axis.at(-1)!);
    c.font = "9px ui-monospace,monospace";
    for (let v = min; v <= max; v += 10) {
      const y = 10 + ((max - v) / (max - min)) * plotH;
      c.strokeStyle = "#ffffff0c";
      c.beginPath();
      c.moveTo(pad, y);
      c.lineTo(w, y);
      c.stroke();
      c.fillStyle = "#7e9186";
      c.fillText(String(v), 2, y + 3);
    }
    const pts = series.map((v, i) => ({
      x: pad + ((axis[i] ?? 0) / last) * plotW,
      y: 10 + ((max - v) / (max - min)) * plotH,
    }));
    c.beginPath();
    pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.strokeStyle = "#a1e4b9";
    c.lineWidth = 1.8;
    c.stroke();
    const gradient = c.createLinearGradient(0, 10, 0, h);
    gradient.addColorStop(0, "#83dab52b");
    gradient.addColorStop(1, "#83dab500");
    c.lineTo(pts.at(-1)!.x, plotH + 10);
    c.lineTo(pad, plotH + 10);
    c.closePath();
    c.fillStyle = gradient;
    c.fill();
    c.fillStyle = "#7e9186";
    c.fillText("0", pad, h - 9);
    c.fillText(
      Math.round(last) + (distanceAxis ? " m traveled" : " s elapsed"),
      w - 103,
      h - 9,
    );
  };
}
export function spectrumFrames(s: SignalSession): SpectrumFrame[] {
  const last = s.spectrum.at(-1);
  return last
    ? s.spectrum.filter(
        (f) =>
          f.receiverID === last.receiverID &&
          f.centerFrequencyHz === last.centerFrequencyHz &&
          f.spanHz === last.spanHz &&
          f.bins.length === last.bins.length &&
          f.powerUnit === last.powerUnit &&
          f.provenance === last.provenance,
      )
    : [];
}
export function spectrumDrawing(
  frame: SpectrumFrame,
  waterfall: boolean,
  frames: SpectrumFrame[],
  zoom = 1,
  pan = 0.5,
  cursor = 0.5,
): Draw {
  return (c, w, h) => {
    grid(c, w, h);
    const count = Math.max(2, Math.round(frame.bins.length / zoom)),
      start = Math.floor((frame.bins.length - count) * pan),
      bins = frame.bins.slice(start, start + count);
    if (waterfall) {
      const history = frames.slice(-128),
        ch = h / Math.max(1, history.length),
        cw = w / count;
      history.forEach((f, row) =>
        f.bins.slice(start, start + count).forEach((v, col) => {
          const t = Math.max(0, Math.min(1, (v + 110) / 65));
          c.fillStyle = `hsl(${215 - t * 150} 58% ${8 + t * 55}%)`;
          c.fillRect(col * cw, row * ch, cw + 0.5, ch + 0.5);
        }),
      );
    } else {
      const min = Math.min(-110, ...bins) - 5,
        max = Math.max(...bins) + 10;
      c.beginPath();
      bins.forEach((v, i) => {
        const x = (i / (count - 1)) * w,
          y = 14 + ((max - v) / (max - min)) * (h - 37);
        if (i) c.lineTo(x, y);
        else c.moveTo(x, y);
      });
      c.strokeStyle = "#a7eac1";
      c.lineWidth = 1.5;
      c.stroke();
      c.fillStyle = "#81988a";
      c.font = "10px ui-monospace,monospace";
      c.fillText(frame.powerUnit.toUpperCase(), 12, 18);
      for (const peak of detectPeaks(frame)) {
        if (peak.index >= start && peak.index < start + count) {
          const x = ((peak.index - start) / (count - 1)) * w;
          c.fillStyle = "#dec38a";
          c.fillText("▼", x - 4, 27);
        }
      }
    }
    c.strokeStyle = "#f4e6b699";
    c.lineWidth = 1;
    c.setLineDash([3, 4]);
    c.beginPath();
    c.moveTo(cursor * w, 0);
    c.lineTo(cursor * w, h);
    c.stroke();
    c.setLineDash([]);
  };
}
