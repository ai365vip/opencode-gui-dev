/**
 * 配置服务 / Configuration Service
 * 访问 VSCode 配置
 */

import * as vscode from 'vscode';
import { createDecorator } from '../di/instantiation';

export const IConfigurationService = createDecorator<IConfigurationService>('configurationService');

export interface IConfigurationService {
	readonly _serviceBrand: undefined;

	/**
	 * 获取配置值
	 * @param section 配置路径，支持 "scope.key" 格式（如 "claudix.environmentVariables"）
	 * @param defaultValue 默认值
	 */
	getValue<T>(section: string, defaultValue?: T): T | undefined;

	/**
	 * 更新配置值
	 * @param section 配置路径，支持 "scope.key" 格式
	 * @param value 新值
	 * @param target 配置目标（Global, Workspace, WorkspaceFolder）
	 */
	updateValue(section: string, value: any, target?: vscode.ConfigurationTarget): Thenable<void>;

	/**
	 * 配置变更事件
	 */
	onDidChangeConfiguration: vscode.Event<vscode.ConfigurationChangeEvent>;
}

export class ConfigurationService implements IConfigurationService {
	readonly _serviceBrand: undefined;

	get onDidChangeConfiguration(): vscode.Event<vscode.ConfigurationChangeEvent> {
		return vscode.workspace.onDidChangeConfiguration;
	}

	getValue<T>(section: string, defaultValue?: T): T | undefined {
		// 支持 "scope.key" 格式，例如 "claudix.environmentVariables"
		const parts = section.split('.');
		if (parts.length > 1) {
			const scope = parts[0];
			const key = parts.slice(1).join('.');
			const config = vscode.workspace.getConfiguration(scope);
			return config.get<T>(key, defaultValue as T);
		}

		// 单级配置，例如 "editor.fontSize"
		const config = vscode.workspace.getConfiguration();
		return config.get<T>(section, defaultValue as T);
	}

	updateValue(section: string, value: any, target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global): Thenable<void> {
		// 支持 "scope.key" 格式
		const parts = section.split('.');
		if (parts.length > 1) {
			const scope = parts[0];
			const key = parts.slice(1).join('.');
			const config = vscode.workspace.getConfiguration(scope);
			return config.update(key, value, target);
		}

		// 单级配置
		const config = vscode.workspace.getConfiguration();
		return config.update(section, value, target);
	}
}
