import { signal, computed, effect } from 'alien-signals';
import { EventEmitter } from '../utils/events';
import type { ConnectionManager } from './ConnectionManager';
import { Session, type SessionContext, type SessionOptions } from './Session';
import type { PermissionRequest } from './PermissionRequest';
import type { SessionSummary } from './types';

export interface PermissionEvent {
  session: Session;
  permissionRequest: PermissionRequest;
}

export class SessionStore {
  readonly sessions = signal<Session[]>([]);
  readonly activeSession = signal<Session | undefined>(undefined);
  readonly permissionRequested = new EventEmitter<PermissionEvent>();

  readonly sessionsByLastModified = computed(() =>
    [...this.sessions()].sort((a, b) => b.lastModifiedTime() - a.lastModifiedTime())
  );

  readonly connectionState = computed(() => this.connectionManager.state());

  private currentConnectionPromise?: Promise<void>;
  private effectCleanups: Array<() => void> = [];

  constructor(
    private readonly connectionManager: ConnectionManager,
    private readonly context: SessionContext
  ) {
    this.effectCleanups.push(
      effect(() => {
        if (this.connectionManager.connection()) {
          void this.listSessions().catch((error) => {
            console.warn('[SessionStore] listSessions failed:', error);
          });
        }
      })
    );

    this.effectCleanups.push(
      effect(() => {
        const session = this.activeSession();
        const defaultTitle = 'OpenCode';

        if (!session) {
          this.context.renameTab?.(defaultTitle);
          return;
        }

        if (session.isOffline()) {
          void session.loadFromServer().catch((error) => {
            console.warn('[SessionStore] loadFromServer failed:', error);
          });
        } else {
          void session.preloadConnection().catch((error) => {
            console.warn('[SessionStore] preloadConnection failed:', error);
          });
        }

        const url = new URL(window.location.toString());
        if (session.sessionId()) {
          url.searchParams.set('session', session.sessionId()!);
        } else {
          url.searchParams.delete('session');
        }
        window.history.replaceState({}, '', url.toString());

        const summary = session.summary();
        const title = summary && summary.length > 25 ? `${summary.slice(0, 24)}…` : summary;
        this.context.renameTab?.(title || defaultTitle);
      })
    );

    this.effectCleanups.push(
      effect(() => {
        const sessions = this.sessions();
        const seen = new Map<string, Session>();
        const deduped: Session[] = [];
        let changed = false;

        for (const session of sessions) {
          const id = session.sessionId();
          if (!id) {
            deduped.push(session);
            continue;
          }

          const duplicate = seen.get(id);
          if (duplicate && duplicate !== session) {
            this.mergeSessionMetadata(duplicate, session);
            if (this.activeSession() === session) {
              this.activeSession(duplicate);
            }
            changed = true;
            continue;
          }

          seen.set(id, session);
          deduped.push(session);
        }

        if (changed) {
          this.sessions([...deduped].sort((a, b) => b.lastModifiedTime() - a.lastModifiedTime()));
        }
      })
    );
  }

  onPermissionRequested(callback: (event: PermissionEvent) => void): () => void {
    return this.permissionRequested.add(callback);
  }

  async getConnection() {
    return this.connectionManager.get();
  }

  async createSession(options: SessionOptions = {}): Promise<Session> {
    const session = new Session(() => this.getConnection(), this.context, options);

    this.sessions([session, ...this.sessions()]);
    this.activeSession(session);

    this.attachPermissionListener(session);

    return session;
  }

  async listSessions(): Promise<void> {
    if (this.currentConnectionPromise) {
      return this.currentConnectionPromise;
    }

    this.currentConnectionPromise = (async () => {
      try {
        const connection = await this.getConnection();
        const response = await connection.listSessions();

        const existing = new Map(
          this.sessions()
            .filter((session) => !!session.sessionId())
            .map((session) => [session.sessionId() as string, session])
        );

        for (const summary of response.sessions ?? []) {
          if (!summary.isCurrentWorkspace) {
            continue;
          }

          const existingSession = existing.get(summary.id);
          if (existingSession) {
            existingSession.lastModifiedTime(summary.lastModified);
            existingSession.summary(summary.summary);
            existingSession.worktree(summary.worktree);
            existingSession.messageCount(summary.messageCount ?? 0);

            const pid = (summary as any)?.parentId;
            if (typeof pid === 'string' && pid.trim()) {
              existingSession.parentId(pid);
            }
            continue;
          }

          const session = Session.fromServer(
            summary as SessionSummary,
            () => this.getConnection(),
            this.context
          );

          this.attachPermissionListener(session);
          this.sessions([...this.sessions(), session]);
        }

        this.sessions(
          [...this.sessions()].sort((a, b) => b.lastModifiedTime() - a.lastModifiedTime())
        );
      } finally {
        this.currentConnectionPromise = undefined;
      }
    })();

    await this.currentConnectionPromise;
  }

  async openSessionById(sessionId: string): Promise<void> {
    const id = String(sessionId ?? '').trim();
    if (!id) return;

    const existing = this.sessions().find((s) => s.sessionId() === id);
    if (existing) {
      this.setActiveSession(existing);
      return;
    }

    const session = Session.fromServer(
      {
        id,
        parentId: undefined,
        lastModified: Date.now(),
        summary: id,
        worktree: undefined,
        messageCount: 0,
        isCurrentWorkspace: true
      },
      () => this.getConnection(),
      this.context
    );

    this.attachPermissionListener(session);
    this.sessions([session, ...this.sessions()]);
    this.setActiveSession(session);

    // Best-effort refresh for metadata (title/messageCount). Don't block UI on it.
    void this.listSessions().catch((error) => {
      console.warn('[SessionStore] listSessions failed after openSessionById:', error);
    });
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const id = String(sessionId ?? '').trim();
    if (!id) return false;

    const connection = await this.getConnection();
    const response = await connection.deleteSession(id);
    const success = Boolean((response as any)?.success ?? response);
    if (!success) return false;

    const remaining: Session[] = [];
    for (const session of this.sessions()) {
      if (session.sessionId() === id) {
        try {
          session.dispose();
        } catch {}
        continue;
      }
      remaining.push(session);
    }

    this.sessions(remaining);

    const active = this.activeSession();
    if (active?.sessionId() === id) {
      this.activeSession(remaining[0]);
    }

    return true;
  }

  setActiveSession(session: Session | undefined): void {
    this.activeSession(session);
  }

  dispose(): void {
    // 清理所有 effects
    for (const cleanup of this.effectCleanups) {
      cleanup();
    }
    this.effectCleanups = [];

    // 清理所有 sessions
    for (const session of this.sessions()) {
      session.dispose();
    }
  }

  private attachPermissionListener(session: Session): void {
    session.onPermissionRequested((request) => {
      this.permissionRequested.emit({
        session,
        permissionRequest: request
      });
      if (this.activeSession() !== session) {
        this.activeSession(session);
      }
    });
  }

  private mergeSessionMetadata(target: Session, source: Session): void {
    if (source.summary() && source.summary() !== target.summary()) {
      target.summary(source.summary());
    }

    if (!target.parentId() && source.parentId()) {
      target.parentId(source.parentId());
    }

    if (source.lastModifiedTime() > target.lastModifiedTime()) {
      target.lastModifiedTime(source.lastModifiedTime());
    }

    if (!target.worktree() && source.worktree()) {
      target.worktree(source.worktree());
    }
  }
}
