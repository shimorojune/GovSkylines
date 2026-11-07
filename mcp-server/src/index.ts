// HTTP entry (Streamable HTTP on /mcp): used by `skybridge dev` / `skybridge start`.
import { restrictToLoopback } from "./loopback.js";
import { app } from "./server.js";

restrictToLoopback(app.express);

export default await app.run();
