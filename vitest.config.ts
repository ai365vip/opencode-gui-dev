/**
 * Vitest 测试配置 / Vitest Test Configuration
 * 基于 vscode-copilot-chat 的配置简化版
 */

import * as path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['**/*.spec.ts', '**/*.spec.tsx'],
		exclude: ['**/node_modules/**', '**/dist/**'],
		globals: true,
		environment: 'node',
	},
	resolve: {
		alias: {
			// Mock vscode module for tests
			vscode: path.resolve(__dirname, 'test/mocks/vscode.ts')
		}
	}
});
