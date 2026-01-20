/**
 * 工作区服务 / Workspace Service
 */

import * as vscode from 'vscode';
import { createDecorator } from '../di/instantiation';

export const IWorkspaceService = createDecorator<IWorkspaceService>('workspaceService');

export interface IWorkspaceService {
	readonly _serviceBrand: undefined;

	/**
	 * 获取所有工作区文件夹
	 */
	getWorkspaceFolders(): readonly vscode.WorkspaceFolder[] | undefined;

	/**
	 * 根据 URI 获取对应的工作区文件夹
	 */
	getWorkspaceFolder(uri: vscode.Uri): vscode.WorkspaceFolder | undefined;

	/**
	 * 获取默认（第一个）工作区文件夹
	 */
	getDefaultWorkspaceFolder(): vscode.WorkspaceFolder | undefined;

	/**
	 * 工作区变更事件
	 */
	onDidChangeWorkspaceFolders: vscode.Event<vscode.WorkspaceFoldersChangeEvent>;
}

export class WorkspaceService implements IWorkspaceService {
	readonly _serviceBrand: undefined;

	getWorkspaceFolders(): readonly vscode.WorkspaceFolder[] | undefined {
		return vscode.workspace.workspaceFolders;
	}

	getWorkspaceFolder(uri: vscode.Uri): vscode.WorkspaceFolder | undefined {
		return vscode.workspace.getWorkspaceFolder(uri);
	}

	getDefaultWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
		const folders = vscode.workspace.workspaceFolders;
		return folders && folders.length > 0 ? folders[0] : undefined;
	}

	get onDidChangeWorkspaceFolders(): vscode.Event<vscode.WorkspaceFoldersChangeEvent> {
		return vscode.workspace.onDidChangeWorkspaceFolders;
	}
}
