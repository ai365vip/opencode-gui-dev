/**
 * WebView 服务 / WebView Service
 *
 * 职责：
 * 1. 实现 vscode.WebviewViewProvider 接口
 * 2. 管理 WebView 实例和生命周期
 * 3. 生成 WebView HTML 内容
 * 4. 提供消息收发接口
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { createDecorator } from '../di/instantiation';
import { ILogService } from './logService';

export const IWebViewService = createDecorator<IWebViewService>('webViewService');

export interface IWebViewService extends vscode.WebviewViewProvider {
	readonly _serviceBrand: undefined;

	/**
	 * 获取当前的 WebView 实例
	 */
	getWebView(): vscode.Webview | undefined;
	getExtensionPath(): string;

	/**
	 * 发送消息到 WebView
	 */
	postMessage(message: any): void;

	/**
	 * 设置消息接收处理器
	 */
	setMessageHandler(handler: (message: any) => void): void;
}

/**
 * WebView 服务实现
 */
export class WebViewService implements IWebViewService {
	readonly _serviceBrand: undefined;

	private webview?: vscode.Webview;
	private messageHandler?: (message: any) => void;

	constructor(
		private readonly context: vscode.ExtensionContext,
		@ILogService private readonly logService: ILogService
	) {}

	/**
	 * 实现 WebviewViewProvider.resolveWebviewView
	 */
	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	): void | Thenable<void> {
		this.logService.info('开始解析 WebView 视图');

		// 配置 WebView 选项
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.file(path.join(this.context.extensionPath, 'dist')),
				vscode.Uri.file(path.join(this.context.extensionPath, 'resources'))
			]
		};

		// 保存 WebView 实例
		this.webview = webviewView.webview;

		// 连接消息处理器
		webviewView.webview.onDidReceiveMessage(
			message => {
				// 只记录重要消息类型，过滤高频常规消息
				const importantMessages = new Set(['launch_claude', 'interrupt_claude', 'close_channel']);
				if (importantMessages.has(message.type)) {
					this.logService.info(`[WebView → Extension] 收到消息: ${message.type}`);
				}
				if (this.messageHandler) {
					this.messageHandler(message);
				}
			},
			undefined,
			this.context.subscriptions
		);

		// 设置 WebView HTML（根据开发/生产模式切换）
		webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

		this.logService.info('WebView 视图解析完成');
	}

	/**
	 * 获取当前的 WebView 实例
	 */
	getWebView(): vscode.Webview | undefined {
		return this.webview;
	}

	getExtensionPath(): string {
		return this.context.extensionPath;
	}

	/**
	 * 发送消息到 WebView
	 */
	postMessage(message: any): void {
		if (!this.webview) {
			throw new Error('WebView not initialized');
		}
		this.webview.postMessage({
			type: 'from-extension',
			message: message
		});
	}

	/**
	 * 设置消息接收处理器
	 */
	setMessageHandler(handler: (message: any) => void): void {
		this.messageHandler = handler;
	}

	/**
	 * 生成 WebView HTML
	 */
	private getHtmlForWebview(webview: vscode.Webview): string {
		// 只有明确设置了 VITE_DEV_SERVER_URL 环境变量时才使用开发服务器
		// 这样即使在调试模式下也会使用构建好的文件
		const useDevServer = !!process.env.VITE_DEV_SERVER_URL;
		const nonce = this.getNonce();

		if (useDevServer) {
			this.logService.info('使用 Vite 开发服务器模式');
			return this.getDevHtml(webview, nonce);
		}

		this.logService.info('使用生产构建模式');
		const extensionUri = vscode.Uri.file(this.context.extensionPath);
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(extensionUri, 'dist', 'media', 'main.js')
		);
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(extensionUri, 'dist', 'media', 'style.css')
		);

		const csp = [
			`default-src 'none';`,
			`img-src ${webview.cspSource} https: data:;`,
			`style-src ${webview.cspSource} 'unsafe-inline' https://*.vscode-cdn.net;`,
			`font-src ${webview.cspSource} data:;`,
			`script-src ${webview.cspSource} 'nonce-${nonce}';`,
			`connect-src ${webview.cspSource} https:;`,
			`worker-src ${webview.cspSource} blob:;`,
		].join(' ');

		return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OpenCode Chat</title>
    <link href="${styleUri}" rel="stylesheet" />
</head>
<body>
    <div id="app"></div>
    <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}

	private getDevHtml(webview: vscode.Webview, nonce: string): string {
		// 读取 dev server 地址（可通过环境变量覆盖）
		const devServer = process.env.VITE_DEV_SERVER_URL
			|| process.env.WEBVIEW_DEV_SERVER_URL
			|| `http://localhost:${process.env.VITE_DEV_PORT || 5173}`;

		let origin = '';
		let wsUrl = '';
		try {
			const u = new URL(devServer);
			origin = `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}`;
			const wsProtocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
			wsUrl = `${wsProtocol}//${u.hostname}${u.port ? `:${u.port}` : ''}`;
		} catch {
			origin = devServer; // 回退（尽量允许）
			wsUrl = 'ws://localhost:5173';
		}

		// Vite 开发场景的 CSP：允许连接 devServer 与 HMR 的 ws
		const csp = [
			`default-src 'none';`,
			`img-src ${webview.cspSource} https: data:;`,
			`style-src ${webview.cspSource} 'unsafe-inline' ${origin} https://*.vscode-cdn.net;`,
			`font-src ${webview.cspSource} data: ${origin};`,
			`script-src ${webview.cspSource} 'nonce-${nonce}' 'unsafe-eval' ${origin};`,
			`connect-src ${webview.cspSource} ${origin} ${wsUrl} https:;`,
			`worker-src ${webview.cspSource} blob:;`,
		].join(' ');

		const client = `${origin}/@vite/client`;
		const entry = `${origin}/src/main.ts`;

		return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <base href="${origin}/" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OpenCode Chat (Dev)</title>
    <style>
      #dev-fallback {
        display: none;
        padding: 12px;
        margin: 12px;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(0,0,0,0.2);
        color: rgba(255,255,255,0.9);
        font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
        font-size: 12px;
        line-height: 1.5;
      }
      #dev-fallback code {
        font-family: ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;
        background: rgba(255,255,255,0.08);
        padding: 1px 4px;
        border-radius: 4px;
      }
      #dev-fallback .title { font-weight: 600; margin-bottom: 6px; }
      #dev-fallback .hint { opacity: 0.85; }
    </style>
</head>
<body>
    <div id="dev-fallback">
      <div class="title">Vite Dev 模式未就绪</div>
      <div class="hint">当前 WebView 通过 <code>${origin}</code> 加载前端资源。如果页面空白，通常是 Vite 没启动或端口不匹配。</div>
      <div class="hint">在仓库根目录运行：</div>
      <div class="hint"><code>pnpm dev:webview</code>（端口需为 <code>${process.env.VITE_DEV_PORT || 5173}</code>）</div>
      <div class="hint">然后再启动调试：<code>OpenCode GUI: Run Dev (Vite)</code></div>
    </div>
    <div id="app"></div>
    <script type="module" nonce="${nonce}">
      (() => {
        const fallback = document.getElementById('dev-fallback')
        const app = document.getElementById('app')
        if (!fallback || !app) return

        const show = (extra) => {
          fallback.style.display = 'block'
          if (extra) {
            const div = document.createElement('div')
            div.className = 'hint'
            div.textContent = extra
            fallback.appendChild(div)
          }
        }
        const hide = () => { fallback.style.display = 'none' }

        const observer = new MutationObserver(() => {
          if (app.childElementCount > 0) {
            hide()
            observer.disconnect()
          }
        })
        observer.observe(app, { childList: true })

        window.addEventListener('error', (e) => {
          show(e?.message ? \`加载失败：\${e.message}\` : '加载失败：请打开开发者工具查看 Console 报错')
        })

        setTimeout(async () => {
          if (app.childElementCount > 0) return
          try {
            const res = await fetch('${client}', { method: 'GET' })
            if (!res.ok) throw new Error(String(res.status))
            show('Vite 已可访问，但应用未挂载：检查 WebView Console 是否有运行时错误')
          } catch {
            show()
          }
        }, 2000)
      })()
    </script>
    <script type="module" nonce="${nonce}" src="${client}"></script>
    <script type="module" nonce="${nonce}" src="${entry}"></script>
</body>
</html>`;
	}

	/**
	 * 生成随机 nonce
	 */
	private getNonce(): string {
		let text = '';
		const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		for (let i = 0; i < 32; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}
		return text;
	}
}
