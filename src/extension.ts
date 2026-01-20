/**
 * VSCode Extension Entry Point
 */

import * as vscode from 'vscode';
import { InstantiationServiceBuilder } from './di/instantiationServiceBuilder';
import { registerServices, ILogService, IOpencodeAgentService, IWebViewService, IInlineDiffService } from './services/serviceRegistry';
import { VSCodeTransport } from './services/claude/transport/VSCodeTransport';

/**
 * Extension Activation
 */
export function activate(context: vscode.ExtensionContext) {
	// Claude SDK 每次 query 可能会添加 process 级别监听器（如 exit）
	// 理想情况应随 Query 生命周期释放；这里仅作为兜底避免告警刷屏
	const desiredMaxListeners = 100;
	if (process.getMaxListeners() < desiredMaxListeners) {
		process.setMaxListeners(desiredMaxListeners);
	}

	// 1. Create service builder
	const builder = new InstantiationServiceBuilder();

	// 2. Register all services
	registerServices(builder, context);

	// 3. Seal the builder and create DI container
	const instantiationService = builder.seal();

	// 4. Log activation
	instantiationService.invokeFunction(accessor => {
		const logService = accessor.get(ILogService);
		// 简化扩展激活日志
		logService.info('OpenCode GUI extension activated');
	});

	// 5. Connect services
	instantiationService.invokeFunction(accessor => {
		const logService = accessor.get(ILogService);
		const webViewService = accessor.get(IWebViewService);
		const opencodeAgentService = accessor.get(IOpencodeAgentService);
		const inlineDiffService = accessor.get(IInlineDiffService);

		// Register WebView View Provider
		const webviewProvider = vscode.window.registerWebviewViewProvider(
			'opencode.chatView',
			webViewService,
			{
				webviewOptions: {
					retainContextWhenHidden: true
				}
			}
		);

		// Connect WebView messages to OpenCode Agent Service
		webViewService.setMessageHandler((message) => {
			// 处理命令执行请求
			if (message.type === 'execute-command' && message.payload?.command) {
				vscode.commands.executeCommand(message.payload.command);
				return;
			}

			// 其他消息交给 OpenCode Agent Service 处理
			opencodeAgentService.fromClient(message);
		});

		// Create VSCode Transport
		const transport = instantiationService.createInstance(VSCodeTransport);

		// Set transport on OpenCode Agent Service
		opencodeAgentService.setTransport(transport);

		// Start message loop
		opencodeAgentService.start();

		// 访问服务即可触发初始化
		inlineDiffService.dispose; // 访问方法引用即可触发构造

		// Register disposables
		context.subscriptions.push(webviewProvider);
	});

	// 6. Register commands
	const showChatCommand = vscode.commands.registerCommand('opencodeGui.showChat', async () => {
		await vscode.commands.executeCommand('workbench.view.extension.opencode-chat-sidebar');
		await vscode.commands.executeCommand('opencode.chatView.focus');
	});

	// Ctrl+L: Add selection and file reference to chat
	const addSelectionToChat = vscode.commands.registerCommand('opencodeGui.addSelectionToChat', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return;
		}

		// 获取选中的文本
		const selection = editor.selection;
		const selectedText = editor.document.getText(selection);

		// 获取选中的行号（从 0 开始，需要 +1）
		const startLine = selection.start.line + 1;
		const endLine = selection.end.line + 1;

		// 获取文件路径
		const filePath = editor.document.uri.fsPath;
		const relativePath = vscode.workspace.asRelativePath(editor.document.uri, false);

		// 打开 OpenCode 侧边栏
		await vscode.commands.executeCommand('workbench.view.extension.opencode-chat-sidebar');

		// 发送消息到 webview
		instantiationService.invokeFunction(accessor => {
			const webViewService = accessor.get(IWebViewService);
			const logService = accessor.get(ILogService);

			logService.info(`[Extension] 添加选中内容到对话: ${relativePath}`);
			logService.debug(`[Extension] 选中文本长度: ${selectedText.length} 字符`);

			// 发送消息到 WebView
			webViewService.postMessage({
				type: 'add-selection',
				payload: {
					selectedText: selectedText,
					filePath: filePath,
					relativePath: relativePath,
					startLine: startLine,
					endLine: endLine
				}
			});
		});
	});

	// 右键菜单：添加文件/文件夹到 Chat（支持多选）
	const addFileToChat = vscode.commands.registerCommand(
		'opencodeGui.addFileToChat',
		async (resourceUri: vscode.Uri, selectedResources?: vscode.Uri[]) => {
			if (!resourceUri) {
				return;
			}

			// 打开 OpenCode 侧边栏
			await vscode.commands.executeCommand('workbench.view.extension.opencode-chat-sidebar');

			instantiationService.invokeFunction(accessor => {
				const webViewService = accessor.get(IWebViewService);
				const logService = accessor.get(ILogService);

				// 确定要处理的文件列表（支持多选）
				const resourcesToAdd = selectedResources && selectedResources.length > 0
					? selectedResources  // 使用多选的文件列表
					: [resourceUri];     // 单个文件

				// 收集所有文件的相对路径
				const relativePaths = resourcesToAdd.map(uri =>
					vscode.workspace.asRelativePath(uri, false)
				);

				logService.info(
					`[Extension] 从资源管理器添加到对话: ${relativePaths.length} 个文件`
				);
				logService.info(`[Extension] 文件列表: ${relativePaths.join(', ')}`);

				// 如果只有一个文件，使用原来的 add-selection 消息（向后兼容）
				if (relativePaths.length === 1) {
					logService.info(`[Extension] 发送单文件消息: add-selection`);
					webViewService.postMessage({
						type: 'add-selection',
						payload: {
							selectedText: '',
							filePath: resourcesToAdd[0].fsPath,
							relativePath: relativePaths[0]
						}
					});
				} else {
					// 多文件使用新的批量添加消息
					logService.info(`[Extension] 发送多文件消息: add-multiple-files`);
					webViewService.postMessage({
						type: 'add-multiple-files',
						payload: {
							relativePaths: relativePaths
						}
					});
				}
			});
		}
	);

	// @ 文件选择：使用 VSCode 原生 QuickPick
	const selectFileForChat = vscode.commands.registerCommand('opencodeGui.selectFile', async () => {
		// 打开 OpenCode 侧边栏
		await vscode.commands.executeCommand('workbench.view.extension.opencode-chat-sidebar');

		// 创建 QuickPick
		const quickPick = vscode.window.createQuickPick();
		quickPick.placeholder = '搜索文件...';
		quickPick.matchOnDescription = true;
		quickPick.matchOnDetail = true;

		// 获取工作区文件
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			vscode.window.showWarningMessage('未打开工作区');
			return;
		}

		// 显示加载状态
		quickPick.busy = true;
		quickPick.show();

		try {
			// 获取所有文件（排除 node_modules, .git 等）
			const files = await vscode.workspace.findFiles(
				'**/*',
				'{**/node_modules/**,**/.git/**,**/dist/**,**/build/**,**/.vscode/**,**/.idea/**}'
			);

			// 获取最近打开的文件
			const recentFiles = new Set<string>();
			for (const tab of vscode.window.tabGroups.all.flatMap(group => group.tabs)) {
				if (tab.input instanceof vscode.TabInputText) {
					recentFiles.add(tab.input.uri.fsPath);
				}
			}

			// 构建 QuickPick 项目列表
			const items: vscode.QuickPickItem[] = [];

			// 最近文件（放在顶部）
			const recentItems = files
				.filter(uri => recentFiles.has(uri.fsPath))
				.map(uri => ({
					label: `$(clock) ${vscode.workspace.asRelativePath(uri)}`,
					description: '最近打开',
					detail: uri.fsPath,
					uri: uri
				}));

			// 所有文件
			const allItems = files
				.filter(uri => !recentFiles.has(uri.fsPath))
				.map(uri => ({
					label: `$(file) ${vscode.workspace.asRelativePath(uri)}`,
					description: '',
					detail: uri.fsPath,
					uri: uri
				}));

			// 合并列表
			if (recentItems.length > 0) {
				items.push(...recentItems);
				if (allItems.length > 0) {
					items.push({ label: '───────────────', kind: vscode.QuickPickItemKind.Separator } as any);
				}
			}
			items.push(...allItems);

			quickPick.items = items;
			quickPick.busy = false;

			// 监听选择
			quickPick.onDidAccept(() => {
				const selected = quickPick.selectedItems[0];
				if (selected && 'uri' in selected) {
					const relativePath = vscode.workspace.asRelativePath((selected as any).uri);

					// 发送消息到 WebView
					instantiationService.invokeFunction(accessor => {
						const webViewService = accessor.get(IWebViewService);
						webViewService.postMessage({
							type: 'insert-file-reference',
							payload: {
								relativePath: relativePath
							}
						});
					});

					quickPick.hide();
				}
			});

			// 监听关闭
			quickPick.onDidHide(() => {
				quickPick.dispose();
			});

		} catch (error) {
			quickPick.hide();
			vscode.window.showErrorMessage(`获取文件列表失败: ${error}`);
		}
	});

	const revertLastChange = vscode.commands.registerCommand('opencodeGui.revertLastChange', async () => {
		await instantiationService.invokeFunction(async accessor => {
			const svc = accessor.get(IOpencodeAgentService);
			await svc.revertLastChange();
		});
	});

	const openOhMyConfig = vscode.commands.registerCommand('opencodeGui.openOhMyConfig', async () => {
		await instantiationService.invokeFunction(async accessor => {
			const svc = accessor.get(IOpencodeAgentService);
			await svc.openOhMyConfig();
		});
	});

	context.subscriptions.push(
		showChatCommand,
		addSelectionToChat,
		addFileToChat,
		selectFileForChat,
		revertLastChange,
		openOhMyConfig
	);

	// 注册完成

	// Return extension API (if needed to expose to other extensions)
	return {
		getInstantiationService: () => instantiationService
	};
}

/**
 * Extension Deactivation
 */
export function deactivate() {
	// Clean up resources
}
