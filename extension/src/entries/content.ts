// Content script des onglets x.com : assemblage seulement, la logique vit dans
// features/. Les styles importés ici forment content.css.
import "../features/timeline/timeline.css";
import { startRunner } from "../features/blocking/runner.ts";
import { watchBlocks } from "../features/notifications/watch.ts";
import { watchTimeline } from "../features/timeline/timeline.ts";
import { watchHealth } from "../features/x/health.ts";
import { answerPings } from "../features/x/session.ts";

answerPings();
startRunner();
watchTimeline();
watchBlocks();
watchHealth();
