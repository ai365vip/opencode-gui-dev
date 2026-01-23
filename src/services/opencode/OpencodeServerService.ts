import * as vscode from "vscode";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as net from "node:net";
import { createDecorator } from "../../di/instantiation";
import { ILogService } from "../logService";
import { IConfigurationService } from "../configurationService";

export const IOpencodeServerService = createDecorator<IOpencodeServerService>("opencodeServerService");

export interface IOpencodeServerService {
  readonly _serviceBrand: undefined;
  ensureServer(): Promise<string>;
  getBaseUrl(): string | undefined;
  dispose(): void;
}

type StartResult = {
  url: string;
  proc: ChildProcessWithoutNullStreams;
};

export class OpencodeServerService implements IOpencodeServerService {
  readonly _serviceBrand: undefined;

  private baseUrl?: string;
  private proc?: ChildProcessWithoutNullStreams;
  private startPromise?: Promise<string>;

  constructor(
    @ILogService private readonly logService: ILogService,
    @IConfigurationService private readonly configService: IConfigurationService
  ) {}

  getBaseUrl(): string | undefined {
    return this.baseUrl;
  }

  async ensureServer(): Promise<string> {
    if (this.baseUrl) {
      return this.baseUrl;
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = this.ensureServerImpl().finally(() => {
      this.startPromise = undefined;
    });

    return this.startPromise;
  }

  dispose(): void {
    try {
      this.proc?.kill();
    } catch (error) {
      this.logService.warn(`[OpencodeServerService] Failed to kill server process: ${String(error)}`);
    } finally {
      this.proc = undefined;
      this.baseUrl = undefined;
      this.startPromise = undefined;
    }
  }

  private async ensureServerImpl(): Promise<string> {
    const configuredBaseUrl =
      this.configService.getValue<string>("opencodeGui.serverBaseUrl", "http://127.0.0.1:4096") ??
      "http://127.0.0.1:4096";

    // 1) 如果用户显式配置了非本地地址：只尝试连接，不自动拉起
    if (!this.isLocalBaseUrl(configuredBaseUrl)) {
      this.baseUrl = configuredBaseUrl;
      return configuredBaseUrl;
    }

    // 2) 先探测本地 server 是否已经存在
    if (await this.checkHealth(configuredBaseUrl)) {
      this.logService.info(`[OpencodeServerService] Using existing server: ${configuredBaseUrl}`);
      this.baseUrl = configuredBaseUrl;
      return configuredBaseUrl;
    }

    // 3) 启动本地 server
    const { url, proc } = await this.startLocalServer(configuredBaseUrl);
    this.proc = proc;
    this.baseUrl = url;
    return url;
  }

  private isLocalBaseUrl(baseUrl: string): boolean {
    try {
      const url = new URL(baseUrl);
      const host = url.hostname;
      return host === "127.0.0.1" || host === "localhost";
    } catch {
      return false;
    }
  }

  private async checkHealth(baseUrl: string): Promise<boolean> {
    try {
      // OpenCode server health endpoint (per upstream server docs)
      // GET /global/health -> { healthy: true, version: string }
      const url = new URL("/global/health", baseUrl).toString();
      const res = await fetch(url, { method: "GET" });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async startLocalServer(configuredBaseUrl: string): Promise<StartResult> {
    const opencodePath = this.configService.getValue<string>("opencodeGui.opencodePath", "opencode") ?? "opencode";
    const configDir = (this.configService.getValue<string>("opencodeGui.configDir", "") ?? "").trim();

    const url = new URL(configuredBaseUrl);
    const hostname = url.hostname || "127.0.0.1";
    const bindHost = this.normalizeLocalHostname(hostname);

    const parsedPort = Number(url.port || 4096);
    const requestedPort = Number.isFinite(parsedPort) ? Math.trunc(parsedPort) : 4096;
    const initialPort =
      requestedPort <= 0 ? await this.getFreePort(bindHost) : await this.ensurePortAvailable(bindHost, requestedPort);

    const env: NodeJS.ProcessEnv = { ...process.env };
    if (configDir) {
      env.OPENCODE_CONFIG_DIR = configDir;
    }
    // 给用户一个最小可追踪的标记，便于区分 extension 启动的进程
    env.OPENCODE_IDE = "vscode";

    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

    let lastError: unknown;
    for (let attempt = 0; attempt < 5; attempt++) {
      const port = attempt === 0 ? initialPort : await this.getFreePort(bindHost);
      if (attempt > 0) {
        this.logService.warn(
          `[OpencodeServerService] Retrying opencode server start on ${hostname}:${port} (previous attempt failed)`
        );
      }

      this.logService.info(`[OpencodeServerService] Starting opencode server: ${hostname}:${port}`);

      const args = ["serve", `--hostname=${hostname}`, `--port=${port}`];
      const proc = spawn(opencodePath, args, { env, cwd, windowsHide: true });

      try {
        const listeningUrl = await this.waitForListeningUrl(proc);

        // 启动后再 health-check 一次，避免“拿到 url 但 server 还没 ready”
        const ok = await this.waitUntilHealthy(listeningUrl, 5000);
        if (!ok) {
          try {
            proc.kill();
          } catch {}
          throw new Error(`OpenCode server did not become healthy: ${listeningUrl}`);
        }

        if (port !== requestedPort) {
          vscode.window.showWarningMessage(
            `OpenCode 端口 ${requestedPort} 已被占用，已改用 ${port}（可在设置 opencodeGui.serverBaseUrl 修改）。`
          );
        }

        return { url: listeningUrl, proc };
      } catch (error) {
        lastError = error;
        try {
          proc.kill();
        } catch {}

        if (this.isAddressInUseError(error)) {
          continue;
        }

        throw error;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`Failed to start OpenCode server (unknown error): ${String(lastError)}`);
  }

  private normalizeLocalHostname(hostname: string): string {
    const h = String(hostname ?? "").trim() || "127.0.0.1";
    // Avoid IPv6 resolution surprises when probing ports.
    return h === "localhost" ? "127.0.0.1" : h;
  }

  private isAddressInUseError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    return /EADDRINUSE|address already in use|ADDRINUSE/i.test(msg);
  }

  private async ensurePortAvailable(hostname: string, port: number): Promise<number> {
    const available = await this.isPortAvailable(hostname, port);
    if (available) return port;

    const free = await this.getFreePort(hostname);
    this.logService.warn(
      `[OpencodeServerService] Port ${port} is already in use on ${hostname}; using ${free} instead`
    );
    return free;
  }

  private isPortAvailable(hostname: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.unref();
      server.once("error", () => resolve(false));
      server.once("listening", () => {
        server.close(() => resolve(true));
      });
      try {
        server.listen({ host: hostname, port, exclusive: true });
      } catch {
        resolve(false);
      }
    });
  }

  private getFreePort(hostname: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.once("error", reject);
      server.listen({ host: hostname, port: 0, exclusive: true }, () => {
        const address = server.address();
        server.close(() => {
          if (typeof address === "object" && address && typeof (address as any).port === "number") {
            resolve((address as any).port);
            return;
          }
          reject(new Error("Failed to allocate a free port"));
        });
      });
    });
  }

  private waitForListeningUrl(proc: ChildProcessWithoutNullStreams): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timeout waiting for opencode server to start"));
      }, 10000);

      let output = "";
      const onData = (chunk: unknown) => {
        output += String(chunk);
        const lines = output.split(/\r?\n/);
        for (const line of lines) {
          // 来自官方 SDK：`opencode server listening on http://...`
          if (line.startsWith("opencode server listening")) {
            const match = line.match(/on\s+(https?:\/\/[^\s]+)/);
            if (match?.[1]) {
              clearTimeout(timeout);
              cleanup();
              resolve(match[1]);
              return;
            }
          }
        }
      };

      const onExit = (code: number | null) => {
        clearTimeout(timeout);
        cleanup();
        reject(new Error(`opencode server exited with code ${code}\n${output}`));
      };

      const onError = (error: Error) => {
        clearTimeout(timeout);
        cleanup();
        reject(error);
      };

      const cleanup = () => {
        proc.stdout?.off("data", onData);
        proc.stderr?.off("data", onData);
        proc.off("exit", onExit);
        proc.off("error", onError);
      };

      proc.stdout?.on("data", onData);
      proc.stderr?.on("data", onData);
      proc.on("exit", onExit);
      proc.on("error", onError);
    });
  }

  private async waitUntilHealthy(baseUrl: string, timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await this.checkHealth(baseUrl)) {
        return true;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    return false;
  }
}
