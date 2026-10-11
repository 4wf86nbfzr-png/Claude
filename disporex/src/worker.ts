import { runWorker } from "./server/jobs/worker";

runWorker().catch((err) => {
  console.error("Worker abgestürzt:", err);
  process.exit(1);
});
