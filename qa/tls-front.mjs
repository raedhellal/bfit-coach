// An https front for `next start`, for the session-epoch witnesses (BUG-745, ADR-0033 D33.14).
//
// A production build marks the session cookies `Secure`, and names the epoch cookie
// `__Host-evoli_pro_epoch`, which a browser accepts only with `Secure` from a secure origin.
// Chromium treats http://localhost as secure; WebKit does not, and drops every one of them,
// so on plain http a WebKit sign-out clears nothing and writes no epoch. Re-adding the cookies
// without `Secure` (`qa/start-build.ts` on the s3i train) cannot work for a `__Host-` name, and
// would not see the epoch the SERVER writes at the sign-out. So the witnesses talk to this front
// instead: a self-signed certificate (`ignoreHTTPSErrors`), every request piped to the
// `next start` behind it, and a redirect's `Location` re-pointed at https.
//
//   TLS_FRONT_PORT=3530 TLS_TARGET_PORT=3531 node qa/tls-front.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";

const front = Number(process.env.TLS_FRONT_PORT);
const target = Number(process.env.TLS_TARGET_PORT);
if (!front || !target) throw new Error("TLS_FRONT_PORT and TLS_TARGET_PORT are required");

const dir = mkdtempSync(join(tmpdir(), "coach-tls-"));
const keyFile = join(dir, "key.pem");
const certFile = join(dir, "cert.pem");
execFileSync(
  "openssl",
  ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyFile, "-out", certFile, "-days", "2",
    "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"],
  { stdio: "ignore" }
);
const key = readFileSync(keyFile);
const cert = readFileSync(certFile);
rmSync(dir, { recursive: true, force: true });

const server = https.createServer({ key, cert }, (req, res) => {
  const upstream = http.request(
    {
      host: "127.0.0.1",
      port: target,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, "x-forwarded-proto": "https" },
    },
    (answer) => {
      const headers = { ...answer.headers };
      if (typeof headers.location === "string") {
        headers.location = headers.location.replace(/^http:\/\/[^/]+/, `https://${req.headers.host}`);
      }
      res.writeHead(answer.statusCode ?? 502, headers);
      answer.pipe(res);
    }
  );
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  req.pipe(upstream);
});
// eslint-disable-next-line no-console
server.listen(front, () => console.log(`tls-front https://localhost:${front} -> http://127.0.0.1:${target}`));
