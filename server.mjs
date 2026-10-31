import {recommendation,checkInstall} from './lib/model-selection.mjs';
import {modelInventory} from './lib/model-inventory.mjs';
import { extractDocument, documentLimit } from './lib/documents.mjs';
import { createServer } from "node:http";
import {
  readFile,
  writeFile,
  mkdir,
  rename,
  rm,
  readdir,
} from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { state, save, device } from "./lib/actors.mjs";
import { profile, root, dashboard } from "./lib/data.mjs";
import { health } from "./lib/health.mjs";
import {
  initializeWorker,
  createTask,
  enqueue,
  getJob,
  cancelJob,
  evaluate,
  fineTune,
  requestReport,
  startAgentLoop,
  stopWorker,
} from "./lib/jobs.mjs";
const port = Number(process.env.PORT ?? 4173),
  localOrigin = `http://127.0.0.1:${port}`;
await mkdir(root, { recursive: true });
let token;
try {
  token = (await readFile(path.join(root, "pairing-token"), "utf8")).trim();
} catch (e) {
  if (e.code !== "ENOENT") throw e;
  token = randomBytes(32).toString("hex");
  await writeFile(path.join(root, "pairing-token"), token, { mode: 0o600 });
}
let hostedOrigin = process.env.LOCAL_LAB_ORIGIN;
try {
  hostedOrigin ??= (
    await readFile(path.join(root, "allowed-origin"), "utf8")
  ).trim();
} catch {}
if (hostedOrigin && new URL(hostedOrigin).origin !== hostedOrigin)
  throw Error("LOCAL_LAB_ORIGIN must be one exact origin");
const allowed = new Set([localOrigin, ...(hostedOrigin ? [hostedOrigin] : [])]);
const publicFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
]);
// Explicit inventory of built frontend assets only. No dynamic filesystem path capability.
async function addWeb(dir, prefix) {
  try {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.isSymbolicLink()) continue;
      const file = path.join(dir, e.name),
        url = prefix + e.name;
      if (e.isDirectory()) await addWeb(file, url + "/");
      else if (/\.(html|js|css|svg|png|ico|woff2)$/.test(e.name)) {
        const ext = path.extname(e.name),
          mime = {
            ".html": "text/html",
            ".js": "text/javascript",
            ".css": "text/css",
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".ico": "image/x-icon",
            ".woff2": "font/woff2",
          }[ext];
        publicFiles.set(url, [file, mime]);
        if (e.name === "index.html") publicFiles.set(prefix, [file, mime]);
      }
    }
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}
await addWeb("web/dist", "/app/");
async function jsonBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 32768) throw Error("Request too large");
  }
  return body ? JSON.parse(body) : {};
}
const server = createServer(async (req, res) => {
  const origin = req.headers.origin,
    headers = {
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
      Vary: "Origin",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    };
  const send = (status, data) => {
    res.writeHead(status, { ...headers, "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };
  if (req.headers.host !== `127.0.0.1:${port}`)
    return send(403, { error: "Unapproved Host" });
  if (origin && !allowed.has(origin))
    return send(403, { error: "Unapproved Origin" });
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  const url = new URL(req.url, localOrigin),
    pathname = url.pathname;
  if (pathname.startsWith("/api/")) {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        ...headers,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "Authorization, Content-Type, X-Filename",
        "Access-Control-Max-Age": "600",
      });
      return res.end();
    }
    const supplied = String(req.headers.authorization ?? "");
    const expected = "Bearer " + token;
    if (
      Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    )
      return send(401, { error: "Pair with the local token to connect" });
    try {
      if (pathname === "/api/health" && req.method === "GET")
        return send(200, await health());
      if(pathname==="/api/models/recommend"&&req.method==="POST")return send(200,await recommendation(await jsonBody(req)));
      if(pathname==="/api/models/inventory"&&req.method==="GET")return send(200,await modelInventory(await state()));
      if (pathname === "/api/state" && req.method === "GET") {
        const s = await state(),
          d = JSON.parse(await device.read());
        return send(200, {
          datasets: Object.entries(s)
            .filter(([k]) => k.startsWith("dataset:"))
            .map(([, v]) => v),
          tasks: Object.entries(s)
            .filter(([k]) => k.startsWith("task:"))
            .map(([, v]) => v),
          jobs: Object.entries(s)
            .filter(([k]) => k.startsWith("job:"))
            .map(([, v]) => v),
          loops:Object.entries(s).filter(([k])=>k.startsWith("loop:")).map(([,v])=>v),
          recipe: s.recipe ?? null,
          device: d,
        });
      }
      if (pathname === "/api/files" && req.method === "POST") {
        const id=randomUUID(), name=path.basename(decodeURIComponent(String(req.headers['x-filename']||'document.txt'))).slice(0,160);
        const directory=path.join(root,'documents');await mkdir(directory,{recursive:true,mode:0o700});
        const file=path.join(directory,id), tmp=file+'.part';let size=0;
        try {
          await pipeline(req,new Transform({transform(chunk,encoding,done){size+=chunk.length;done(size>documentLimit?Error('Document limit is 10 MB'):null,chunk);}}),createWriteStream(tmp,{flags:'wx',mode:0o600}));
          const text=await extractDocument(tmp,name);
          await rename(tmp,file);
          await writeFile(file+'.txt',text,{mode:0o600,flag:'wx'});
          const metadata={id,name,kind:'document',bytes:size,characters:text.length};
          await save('document:'+id,metadata);
          return send(201,metadata);
        } catch(error) {await Promise.all([tmp,file,file+'.txt'].map(f=>rm(f,{force:true})));throw error;}
      }
      if (pathname === "/api/datasets" && req.method === "POST") {
        if (!req.headers["content-type"]?.startsWith("text/csv"))
          return send(415, {
            error: "Upload a CSV with Content-Type text/csv",
          });
        const id = randomUUID(),
          file = path.join(root, "data", id + ".csv"),
          tmp = file + ".part";
        let size = 0;
        const limiter = new Transform({
          transform(chunk, enc, done) {
            size += chunk.length;
            done(
              size > 500 * 1024 * 1024 ? Error("CSV limit is 500 MB") : null,
              chunk,
            );
          },
        });
        try {
          await pipeline(
            req,
            limiter,
            createWriteStream(tmp, { flags: "wx", mode: 0o600 }),
          );
          await rename(tmp, file);
          const data = await profile(
            id,
            decodeURIComponent(req.headers["x-filename"] ?? "dataset.csv"),
          );
          await save("dataset:" + id, data);
          return send(201, data);
        } catch (e) {
          await rm(tmp, { force: true });
          throw e;
        }
      }
      if (pathname === "/api/models/install" && req.method === "POST") {
        const b = await jsonBody(req);
        await checkInstall(b.model);
        const j = await enqueue("install", null,{modelId:b.model});
        return send(202, { jobId: j.id });
      }
      if (pathname === "/api/tasks" && req.method === "POST")
        return send(202, await createTask(await jsonBody(req)));
      let match = pathname.match(/^\/api\/jobs\/([a-f0-9-]{36})(\/cancel)?$/);
      if (match) {
        if (match[2] && req.method === "POST") {
          await cancelJob(match[1]);
          return send(200, { ok: true });
        }
        if (req.method === "GET") {
          const j = await getJob(match[1]);
          return send(j ? 200 : 404, j ?? { error: "Job not found" });
        }
      }
      match = pathname.match(
        /^\/api\/tasks\/([a-f0-9-]{36})(\/(dashboard|followup|evaluate|finetune|report|agentloop))?$/,
      );
      if (match) {
        const s = await state(),
          t = s["task:" + match[1]];
        if (!t) return send(404, { error: "Task not found" });
        if (req.method === "GET" && !match[2])
          return send(200, {
            ...t,
            evaluation: s["evaluation:" + t.id] ?? t.evaluation,
          });
        if (req.method === "POST") {
          const b = await jsonBody(req);
          if (match[3] === "dashboard")
            return send(
              200,
              await dashboard(s["dataset:" + t.datasetId], t, b.filter ?? null),
            );
          if (match[3] === "followup")
            return send(
              202,
              await createTask({
                ...t,
                modelId:t.model.id,
                request: b.request,
                reuseRecipe: true,
                followup: true,
              }),
            );
          if(match[3]==='agentloop'){const j=await startAgentLoop(t.id);return send(202,{jobId:j.id});}
          if (match[3] === "report") {
            const j=await requestReport(t.id,b);
            return send(202,{jobId:j.id});
          }
          if (match[3] === "finetune") {
            const j = await fineTune(t.id);
            return send(202, { jobId: j.id });
          }
          if (match[3] === "evaluate") {
            const j = await evaluate(t.id);
            return send(202, { jobId: j.id });
          }
        }
      }
      return send(404, { error: "Endpoint not found" });
    } catch (e) {
      return send(400, { error: e.message });
    }
  }
  if (!["GET", "HEAD"].includes(req.method))
    return send(405, { error: "Method not allowed" });
  if (pathname === "/" && publicFiles.has("/app/")) {
    res.writeHead(302, { ...headers, Location: "/app/" });
    return res.end();
  }
  if (pathname === "/app") {
    res.writeHead(302, { ...headers, Location: "/app/" });
    return res.end();
  }
  const entry = publicFiles.get(pathname);
  if (!entry) return send(404, { error: "Not found" });
  try {
    const body = await readFile(entry[0]);
    res.writeHead(200, { ...headers, "Content-Type": entry[1] });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    return send(500, { error: "Could not load file" });
  }
});
await initializeWorker();
server.listen(port, "127.0.0.1", () => {
  console.log(`Local Lab: ${localOrigin}/app/`);
  console.log(
    "Pairing token stored in .local-lab/pairing-token (read locally; never commit).",
  );
  console.log("Approved hosted origin:", hostedOrigin ?? "none");
});
for (const sig of ["SIGTERM", "SIGINT"])
  process.once(sig, () => {
    stopWorker();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
