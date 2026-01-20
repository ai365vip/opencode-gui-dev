import { createDecorator } from "../../di/instantiation";
import { ILogService } from "../logService";
import { IOpencodeServerService } from "./OpencodeServerService";

export const IOpencodeClientService = createDecorator<IOpencodeClientService>("opencodeClientService");

export type OpencodePermissionResponse = "once" | "always" | "reject";

export type OpencodeEvent = {
  type: string;
  properties: Record<string, unknown>;
};

export interface IOpencodeClientService {
  readonly _serviceBrand: undefined;

  getBaseUrl(): Promise<string>;
  globalHealth(cwd?: string): Promise<{ healthy: boolean; version: string }>;

  listCommands(cwd?: string): Promise<any>;

  listProviders(cwd?: string): Promise<any>;
  listProviderAuthMethods(cwd?: string): Promise<any>;
  listConfigProviders(cwd?: string): Promise<any>;
  listAgents(cwd?: string): Promise<any>;
  getConfig(cwd?: string): Promise<any>;
  patchConfig(body: any, cwd?: string): Promise<any>;
  setAuth(providerId: string, body: any, cwd?: string): Promise<boolean>;

  findText(pattern: string, cwd?: string): Promise<any>;
  findFiles(query: string, opts?: { dirs?: boolean }, cwd?: string): Promise<string[]>;
  findSymbols(query: string, cwd?: string): Promise<any>;
  fileList(path: string, cwd?: string): Promise<any>;
  fileRead(path: string, cwd?: string): Promise<any>;
  fileStatus(cwd?: string): Promise<any>;

  getMcpStatus(cwd?: string): Promise<Record<string, unknown>>;
  addMcpServer(name: string, config: any, cwd?: string): Promise<any>;

  listSessions(cwd?: string): Promise<any>;
  getSessionStatus(cwd?: string): Promise<any>;
  createSession(body?: { title?: string }, cwd?: string): Promise<any>;
  getSession(sessionId: string, cwd?: string): Promise<any>;
  updateSession(sessionId: string, body: { title?: string }, cwd?: string): Promise<any>;
  deleteSession(sessionId: string, cwd?: string): Promise<boolean>;
  listSessionChildren(sessionId: string, cwd?: string): Promise<any>;
  getSessionTodo(sessionId: string, cwd?: string): Promise<any>;
  getSessionDiff(sessionId: string, messageId?: string, cwd?: string): Promise<any>;
  listMessages(sessionId: string, cwd?: string): Promise<any>;

  prompt(sessionId: string, body: any, cwd?: string): Promise<any>;
  command(sessionId: string, body: any, cwd?: string): Promise<any>;
  shell(sessionId: string, body: any, cwd?: string): Promise<any>;
  abort(sessionId: string, cwd?: string): Promise<boolean>;
  revert(sessionId: string, body: { messageID: string; partID?: string }, cwd?: string): Promise<any>;
  unrevert(sessionId: string, cwd?: string): Promise<any>;
  init(sessionId: string, body: any, cwd?: string): Promise<boolean>;
  summarize(sessionId: string, body: any, cwd?: string): Promise<boolean>;
  share(sessionId: string, cwd?: string): Promise<any>;
  unshare(sessionId: string, cwd?: string): Promise<any>;
  respondPermission(
    sessionId: string,
    permissionID: string,
    response: OpencodePermissionResponse,
    cwd?: string,
    remember?: boolean
  ): Promise<boolean>;

  subscribeEvents(cwd: string, signal?: AbortSignal): AsyncIterable<OpencodeEvent>;
}

export class OpencodeClientService implements IOpencodeClientService {
  readonly _serviceBrand: undefined;

  constructor(
    @ILogService private readonly logService: ILogService,
    @IOpencodeServerService private readonly serverService: IOpencodeServerService
  ) {}

  async getBaseUrl(): Promise<string> {
    return this.serverService.ensureServer();
  }

  async globalHealth(cwd?: string): Promise<{ healthy: boolean; version: string }> {
    return this.getJson("/global/health", cwd);
  }

  async listCommands(cwd?: string): Promise<any> {
    return this.getJson("/command", cwd);
  }

  async listProviders(cwd?: string): Promise<any> {
    return this.getJson("/provider", cwd);
  }

  async listProviderAuthMethods(cwd?: string): Promise<any> {
    return this.getJson("/provider/auth", cwd);
  }

  async listConfigProviders(cwd?: string): Promise<any> {
    return this.getJson("/config/providers", cwd);
  }

  async listAgents(cwd?: string): Promise<any> {
    return this.getJson("/agent", cwd);
  }

  async getConfig(cwd?: string): Promise<any> {
    return this.getJson("/config", cwd);
  }

  async patchConfig(body: any, cwd?: string): Promise<any> {
    return this.sendJson("/config", body ?? {}, cwd, "PATCH");
  }

  async setAuth(providerId: string, body: any, cwd?: string): Promise<boolean> {
    const result = await this.sendJson(`/auth/${encodeURIComponent(providerId)}`, body ?? {}, cwd, "PUT");
    return Boolean(result);
  }

  async findText(pattern: string, cwd?: string): Promise<any> {
    const baseUrl = await this.getBaseUrl();
    const url = this.buildUrl("/find", baseUrl, cwd, { pattern: String(pattern ?? "") });
    return this.fetchJson(url, this.withDirectoryHeader({ method: "GET" }, cwd));
  }

  async findFiles(query: string, opts?: { dirs?: boolean }, cwd?: string): Promise<string[]> {
    const baseUrl = await this.getBaseUrl();
    const url = this.buildUrl("/find/file", baseUrl, cwd, {
      query: String(query ?? ""),
      dirs: opts?.dirs === undefined ? undefined : (opts.dirs ? "true" : "false"),
    });
    const res = await this.fetchJson<any>(url, this.withDirectoryHeader({ method: "GET" }, cwd));
    return Array.isArray(res) ? res.map((p) => String(p)) : [];
  }

  async findSymbols(query: string, cwd?: string): Promise<any> {
    const baseUrl = await this.getBaseUrl();
    const url = this.buildUrl("/find/symbol", baseUrl, cwd, { query: String(query ?? "") });
    return this.fetchJson(url, this.withDirectoryHeader({ method: "GET" }, cwd));
  }

  async fileList(path: string, cwd?: string): Promise<any> {
    const baseUrl = await this.getBaseUrl();
    const url = this.buildUrl("/file", baseUrl, cwd, { path: String(path ?? "") });
    return this.fetchJson(url, this.withDirectoryHeader({ method: "GET" }, cwd));
  }

  async fileRead(path: string, cwd?: string): Promise<any> {
    const baseUrl = await this.getBaseUrl();
    const url = this.buildUrl("/file/content", baseUrl, cwd, { path: String(path ?? "") });
    return this.fetchJson(url, this.withDirectoryHeader({ method: "GET" }, cwd));
  }

  async fileStatus(cwd?: string): Promise<any> {
    return this.getJson("/file/status", cwd);
  }

  async getMcpStatus(cwd?: string): Promise<Record<string, unknown>> {
    return this.getJson("/mcp", cwd);
  }

  async addMcpServer(name: string, config: any, cwd?: string): Promise<any> {
    return this.sendJson("/mcp", { name, config }, cwd);
  }

  async listSessions(cwd?: string): Promise<any> {
    return this.getJson("/session", cwd);
  }

  async getSessionStatus(cwd?: string): Promise<any> {
    return this.getJson("/session/status", cwd);
  }

  async createSession(body?: { title?: string }, cwd?: string): Promise<any> {
    return this.sendJson("/session", body ?? {}, cwd);
  }

  async getSession(sessionId: string, cwd?: string): Promise<any> {
    return this.getJson(`/session/${encodeURIComponent(sessionId)}`, cwd);
  }

  async updateSession(sessionId: string, body: { title?: string }, cwd?: string): Promise<any> {
    return this.sendJson(`/session/${encodeURIComponent(sessionId)}`, body ?? {}, cwd, "PATCH");
  }

  async deleteSession(sessionId: string, cwd?: string): Promise<boolean> {
    const baseUrl = await this.getBaseUrl();
    const url = this.buildUrl(`/session/${encodeURIComponent(sessionId)}`, baseUrl, cwd);
    const res = await this.fetchJson(url, this.withDirectoryHeader({ method: "DELETE" }, cwd));
    return Boolean(res);
  }

  async listSessionChildren(sessionId: string, cwd?: string): Promise<any> {
    return this.getJson(`/session/${encodeURIComponent(sessionId)}/children`, cwd);
  }

  async getSessionTodo(sessionId: string, cwd?: string): Promise<any> {
    return this.getJson(`/session/${encodeURIComponent(sessionId)}/todo`, cwd);
  }

  async getSessionDiff(sessionId: string, messageId?: string, cwd?: string): Promise<any> {
    const baseUrl = await this.getBaseUrl();
    const url = this.buildUrl(`/session/${encodeURIComponent(sessionId)}/diff`, baseUrl, cwd, {
      messageID: messageId,
    });
    return this.fetchJson(url, this.withDirectoryHeader({ method: "GET" }, cwd));
  }

  async listMessages(sessionId: string, cwd?: string): Promise<any> {
    return this.getJson(`/session/${encodeURIComponent(sessionId)}/message`, cwd);
  }

  async prompt(sessionId: string, body: any, cwd?: string): Promise<any> {
    // Use async prompt endpoint so output arrives via SSE events.
    // 204 No Content on success.
    return this.sendJson(`/session/${encodeURIComponent(sessionId)}/prompt_async`, body, cwd);
  }

  async command(sessionId: string, body: any, cwd?: string): Promise<any> {
    return this.sendJson(`/session/${encodeURIComponent(sessionId)}/command`, body ?? {}, cwd);
  }

  async shell(sessionId: string, body: any, cwd?: string): Promise<any> {
    return this.sendJson(`/session/${encodeURIComponent(sessionId)}/shell`, body ?? {}, cwd);
  }

  async abort(sessionId: string, cwd?: string): Promise<boolean> {
    const baseUrl = await this.getBaseUrl();
    const url = this.buildUrl(`/session/${encodeURIComponent(sessionId)}/abort`, baseUrl, cwd);
    const res = await this.fetchJson(url, this.withDirectoryHeader({ method: "POST" }, cwd));
    return Boolean(res);
  }

  async revert(sessionId: string, body: { messageID: string; partID?: string }, cwd?: string): Promise<any> {
    return this.sendJson(`/session/${encodeURIComponent(sessionId)}/revert`, body, cwd);
  }

  async unrevert(sessionId: string, cwd?: string): Promise<any> {
    return this.sendJson(`/session/${encodeURIComponent(sessionId)}/unrevert`, {}, cwd);
  }

  async init(sessionId: string, body: any, cwd?: string): Promise<boolean> {
    const res = await this.sendJson(`/session/${encodeURIComponent(sessionId)}/init`, body ?? {}, cwd);
    return Boolean(res);
  }

  async summarize(sessionId: string, body: any, cwd?: string): Promise<boolean> {
    const res = await this.sendJson(`/session/${encodeURIComponent(sessionId)}/summarize`, body ?? {}, cwd);
    return Boolean(res);
  }

  async share(sessionId: string, cwd?: string): Promise<any> {
    return this.sendJson(`/session/${encodeURIComponent(sessionId)}/share`, {}, cwd);
  }

  async unshare(sessionId: string, cwd?: string): Promise<any> {
    return this.sendJson(`/session/${encodeURIComponent(sessionId)}/share`, {}, cwd, "DELETE");
  }

  async respondPermission(
    sessionId: string,
    permissionID: string,
    response: OpencodePermissionResponse,
    cwd?: string,
    remember?: boolean
  ): Promise<boolean> {
    // Prefer the new endpoint; fall back to the deprecated session-scoped endpoint for older servers.
    try {
      const res = await this.sendJson(
        `/permission/${encodeURIComponent(permissionID)}/reply`,
        { reply: response },
        cwd
      );
      return Boolean(res);
    } catch (error) {
      this.logService.warn(
        `[OpencodeClientService] permission.reply failed, falling back to deprecated endpoint: ${String(error)}`
      );
      const result = await this.sendJson(
        `/session/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(permissionID)}`,
        remember === undefined ? { response } : { response, remember },
        cwd
      );
      return Boolean(result);
    }
  }

  async *subscribeEvents(cwd: string, signal?: AbortSignal): AsyncIterable<OpencodeEvent> {
    const baseUrl = await this.getBaseUrl();
    const url = this.buildUrl("/event", baseUrl, cwd);

    this.logService.info(`[OpencodeClientService] Subscribing SSE: ${url}`);

    const res = await fetch(
      url,
      this.withDirectoryHeader(
        {
          method: "GET",
          headers: { Accept: "text/event-stream" },
          signal,
        },
        cwd
      )
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Failed to subscribe events (${res.status}): ${body}`);
    }

    if (!res.body) {
      throw new Error("SSE response body is missing");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const flush = (frame: string): OpencodeEvent | null => {
      // SSE frame: multiple lines. We only care about "data:" payload.
      const lines = frame.split(/\r?\n/);
      const dataLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trimStart());
        }
      }
      if (dataLines.length === 0) return null;

      const data = dataLines.join("\n");
      try {
        return JSON.parse(data) as OpencodeEvent;
      } catch (error) {
        this.logService.warn(`[OpencodeClientService] Failed to parse SSE data: ${String(error)}`);
        return null;
      }
    };

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        // Normalize CRLF to LF so we can split frames reliably.
        if (buffer.includes("\r\n")) {
          buffer = buffer.replace(/\r\n/g, "\n");
        }

        // Split frames by blank line.
        while (true) {
          const idx = buffer.indexOf("\n\n");
          if (idx === -1) break;
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const evt = flush(frame);
          if (evt) {
            yield evt;
          }
        }
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
    }
  }

  private async getJson<T>(pathname: string, cwd?: string): Promise<T> {
    const baseUrl = await this.getBaseUrl();
    const url = this.buildUrl(pathname, baseUrl, cwd);
    return this.fetchJson<T>(url, this.withDirectoryHeader({ method: "GET" }, cwd));
  }

  private async sendJson<T>(
    pathname: string,
    body: any,
    cwd?: string,
    method: "POST" | "PATCH" | "PUT" | "DELETE" = "POST"
  ): Promise<T> {
    const baseUrl = await this.getBaseUrl();
    const url = this.buildUrl(pathname, baseUrl, cwd);
    const headers = { "Content-Type": "application/json" };
    const init: RequestInit =
      method === "DELETE"
        ? { method, headers }
        : { method, headers, body: JSON.stringify(body ?? {}) };
    return this.fetchJson<T>(url, this.withDirectoryHeader(init, cwd));
  }

  private async fetchJson<T>(url: string, init: RequestInit): Promise<T> {
    const res = await fetch(url, init);
    const text = await res.text().catch(() => "");

    if (!res.ok) {
      throw new Error(`OpenCode API error (${res.status}): ${text || res.statusText}`);
    }

    if (!text) {
      return undefined as unknown as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      // Some endpoints may return non-JSON (rare). Keep as string.
      return text as unknown as T;
    }
  }

  private buildUrl(pathname: string, baseUrl: string, cwd?: string): string;
  private buildUrl(
    pathname: string,
    baseUrl: string,
    cwd: string | undefined,
    query: Record<string, string | undefined> | undefined
  ): string;
  private buildUrl(
    pathname: string,
    baseUrl: string,
    cwd?: string,
    query?: Record<string, string | undefined>
  ): string {
    const url = new URL(pathname, baseUrl);

    // Legacy/compat: many endpoints accept `?directory=...` (and SDK also supports header).
    if (cwd) {
      url.searchParams.set("directory", cwd);
    }

    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined) continue;
      url.searchParams.set(key, value);
    }

    return url.toString();
  }

  private withDirectoryHeader(init: RequestInit, cwd?: string): RequestInit {
    if (!cwd) return init;
    const headers = new Headers(init.headers ?? undefined);
    if (!headers.has("X-Opencode-Directory")) {
      headers.set("X-Opencode-Directory", cwd);
    }
    return { ...init, headers };
  }
}
