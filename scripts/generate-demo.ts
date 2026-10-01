import { mkdir, writeFile } from "node:fs/promises";
import { createDemoSession, SessionSchema } from "../packages/core/src/index";
const folder = new URL(
  "../ios/SignalTrackerCore/Sources/SignalTrackerCore/Resources/",
  import.meta.url,
);
await mkdir(folder, { recursive: true });
await writeFile(
  new URL("demo-session.json", folder),
  JSON.stringify(SessionSchema.parse(createDemoSession()), null, 2) + "\n",
);
console.log(
  "Wrote deterministic, labeled Swift/TypeScript interchange fixture.",
);
