const http = require("node:http");
const next = require("next");
const { WebSocket: WsWebSocket, WebSocketServer: WsWebSocketServer } = require("ws");

const { createAccessGate } = require("./access-gate");
const { createGatewayProxy } = require("./gateway-proxy");
const { assertPublicHostAllowed, resolveHosts } = require("./network-policy");
const { loadUpstreamGatewaySettings } = require("./studio-settings");

const resolvePort = () => {
  const raw = process.env.PORT?.trim() || "3000";
  const port = Number(raw);
  if (!Number.isFinite(port) || port <= 0) return 3000;
  return port;
};

const resolvePathname = (url) => {
  const raw = typeof url === "string" ? url : "";
  const idx = raw.indexOf("?");
  return (idx === -1 ? raw : raw.slice(0, idx)) || "/";
};

async function main() {
  const dev = process.argv.includes("--dev");
  const standalone = process.argv.includes("--standalone") || process.env.CLAW3D_STANDALONE === "1";
  const hostnames = Array.from(new Set(resolveHosts(process.env)));
  const hostname = hostnames[0] ?? "127.0.0.1";
  const port = resolvePort();
  for (const host of hostnames) {
    assertPublicHostAllowed({
      host,
      studioAccessToken: process.env.STUDIO_ACCESS_TOKEN,
    });
  }

  const app = next({
    dev,
    hostname,
    port,
    ...(dev ? { webpack: true } : null),
  });
  const handle = app.getRequestHandler();

  const accessGate = createAccessGate({
    token: process.env.STUDIO_ACCESS_TOKEN,
  });

  // Gateway proxy is optional -- skip it in standalone mode or when no
  // upstream gateway settings are configured.
  let proxy = null;
  if (!standalone) {
    try {
      const settings = loadUpstreamGatewaySettings(process.env);
      if (settings.url && settings.token) {
        proxy = createGatewayProxy({
          loadUpstreamSettings: async () => {
            const s = loadUpstreamGatewaySettings(process.env);
            return { url: s.url, token: s.token };
          },
          allowWs: (req) => {
            if (resolvePathname(req.url) !== "/api/gateway/ws") return false;
            return true;
          },
          verifyClient: (info) => accessGate.allowUpgrade(info.req),
        });
        console.info("Gateway proxy enabled (upstream: %s)", settings.url);
      } else {
        console.info("Gateway proxy disabled -- no upstream gateway configured. Running standalone.");
      }
    } catch (err) {
      console.warn("Gateway proxy skipped due to config error:", err.message ?? err);
    }
  } else {
    console.info("Running in standalone mode (--standalone). Gateway proxy disabled.");
  }

  // -----------------------------------------------------------------------
  // BranceClaw WebSocket proxy: /branceclaw-ws -> ws://127.0.0.1:18800/ws
  // -----------------------------------------------------------------------
  const branceclawWss = new WsWebSocketServer({ noServer: true });

  branceclawWss.on("connection", (clientWs) => {
    const upstreamUrl = "ws://127.0.0.1:18800/ws";
    let upstream = null;
    let closed = false;

    const closeBoth = (code, reason) => {
      if (closed) return;
      closed = true;
      try { clientWs.close(code, reason); } catch {}
      try { upstream?.close(code, reason); } catch {}
    };

    try {
      upstream = new WsWebSocket(upstreamUrl);
    } catch {
      clientWs.close(1011, "upstream connection failed");
      return;
    }

    upstream.on("open", () => {
      // Flush any messages that arrived while upstream was connecting
    });

    upstream.on("message", (data) => {
      if (clientWs.readyState === WsWebSocket.OPEN) {
        clientWs.send(data);
      }
    });

    upstream.on("close", (code, reason) => {
      closeBoth(code, String(reason ?? ""));
    });

    upstream.on("error", () => {
      closeBoth(1011, "upstream error");
    });

    clientWs.on("message", (data) => {
      if (upstream && upstream.readyState === WsWebSocket.OPEN) {
        upstream.send(data);
      }
    });

    clientWs.on("close", (code, reason) => {
      closeBoth(code, String(reason ?? ""));
    });

    clientWs.on("error", () => {
      closeBoth(1011, "client error");
    });
  });

  await app.prepare();
  const handleUpgrade = app.getUpgradeHandler();
  const handleServerUpgrade = (req, socket, head) => {
    // BranceClaw WS proxy
    if (resolvePathname(req.url) === "/branceclaw-ws") {
      branceclawWss.handleUpgrade(req, socket, head, (ws) => {
        branceclawWss.emit("connection", ws, req);
      });
      return;
    }
    if (proxy && resolvePathname(req.url) === "/api/gateway/ws") {
      proxy.handleUpgrade(req, socket, head);
      return;
    }
    handleUpgrade(req, socket, head);
  };

  const createServer = () =>
    http.createServer((req, res) => {
      if (accessGate.handleHttp(req, res)) return;
      handle(req, res);
    });

  const servers = hostnames.map(() => createServer());

  const attachUpgradeHandlers = (server) => {
    server.on("upgrade", handleServerUpgrade);
    server.on("newListener", (eventName, listener) => {
      if (eventName !== "upgrade") return;
      if (listener === handleServerUpgrade) return;
      process.nextTick(() => {
        server.removeListener("upgrade", listener);
      });
    });
  };

  for (const server of servers) {
    attachUpgradeHandlers(server);
  }

  const listenOnHost = (server, host) =>
    new Promise((resolve, reject) => {
      const onError = (err) => {
        server.off("error", onError);
        reject(err);
      };
      server.once("error", onError);
      server.listen(port, host, () => {
        server.off("error", onError);
        resolve();
      });
    });

  const closeServer = (server) =>
    new Promise((resolve) => {
      if (!server.listening) return resolve();
      server.close(() => resolve());
    });

  try {
    await Promise.all(servers.map((server, index) => listenOnHost(server, hostnames[index])));
  } catch (err) {
    await Promise.all(servers.map((server) => closeServer(server)));
    throw err;
  }

  const hostForBrowser = hostnames.some((value) => value === "127.0.0.1" || value === "::1")
    ? "localhost"
    : hostname === "0.0.0.0" || hostname === "::"
      ? "localhost"
      : hostname;

  const browserUrl = `http://${hostForBrowser}:${port}`;
  console.info(`Open in browser: ${browserUrl}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
