/**
 * 文件系统服务 / FileSystem Service
 * 文件操作封装
 */

import * as vscode from 'vscode';
import { createDecorator } from '../di/instantiation';

export const IFileSystemService = createDecorator<IFileSystemService>('fileSystemService');

export interface IFileSystemService {
	readonly _serviceBrand: undefined;

	readFile(uri: vscode.Uri): Thenable<Uint8Array>;
	writeFile(uri: vscode.Uri, content: Uint8Array): Thenable<void>;
	delete(uri: vscode.Uri, options?: { recursive?: boolean; useTrash?: boolean }): Thenable<void>;
	rename(source: vscode.Uri, target: vscode.Uri, options?: { overwrite?: boolean }): Thenable<void>;
	createDirectory(uri: vscode.Uri): Thenable<void>;
	readDirectory(uri: vscode.Uri): Thenable<[string, vscode.FileType][]>;
	stat(uri: vscode.Uri): Thenable<vscode.FileStat>;
}

export class FileSystemService implements IFileSystemService {
	readonly _serviceBrand: undefined;

	readFile(uri: vscode.Uri): Thenable<Uint8Array> {
		return vscode.workspace.fs.readFile(uri);
	}

	writeFile(uri: vscode.Uri, content: Uint8Array): Thenable<void> {
		return vscode.workspace.fs.writeFile(uri, content);
	}

	delete(uri: vscode.Uri, options?: { recursive?: boolean; useTrash?: boolean }): Thenable<void> {
		return vscode.workspace.fs.delete(uri, options);
	}

	rename(source: vscode.Uri, target: vscode.Uri, options?: { overwrite?: boolean }): Thenable<void> {
		return vscode.workspace.fs.rename(source, target, options);
	}

	createDirectory(uri: vscode.Uri): Thenable<void> {
		return vscode.workspace.fs.createDirectory(uri);
	}

	readDirectory(uri: vscode.Uri): Thenable<[string, vscode.FileType][]> {
		return vscode.workspace.fs.readDirectory(uri);
	}

	stat(uri: vscode.Uri): Thenable<vscode.FileStat> {
		return vscode.workspace.fs.stat(uri);
	}
}
