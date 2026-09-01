import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";

// Dev-only: lets the running page POST a canvas render to disk so renders can be
// inspected outside the browser. Never included in a production build.
function screenshotSink() {
  return {
    name: "screenshot-sink",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__shot", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          return res.end();
        }
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          try {
            const { name = "shot", dataUrl } = JSON.parse(body);
            const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
            const ext = dataUrl.slice(11, dataUrl.indexOf(";"));
            const dir = path.resolve(process.cwd(), ".shots");
            fs.mkdirSync(dir, { recursive: true });
            const file = path.join(dir, `${name}.${ext === "jpeg" ? "jpg" : ext}`);
            fs.writeFileSync(file, Buffer.from(b64, "base64"));
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ ok: true, file, bytes: Buffer.byteLength(b64, "base64") }));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: String(err) }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [screenshotSink()],
});
