import { defineChannel, GET, POST } from "eve/channels";
import { createApiHandlers } from "../../src/api/handlers.js";
import { config } from "../../src/config.js";
import { createReportStore } from "../../src/reports/store.js";

const store = createReportStore(config.dataDir);
const handlers = createApiHandlers({ config, store });

export default defineChannel({
  routes: [
    GET("/api/health", async () => handlers.health()),
    POST("/api/audits", (request, { from }) =>
      handlers.audits(request, (address) => from(address)),
    ),
    GET("/api/reports", (request) => handlers.reports(request)),
    GET("/api/reports/:id", (request, { params }) => handlers.report(request, params.id ?? "")),
    POST("/api/reports/:id/findings/:findingId/confirm", (request, { params }) =>
      handlers.confirmFinding(request, params.id ?? "", params.findingId ?? ""),
    ),
  ],
});
