/**
 * Claude 配置相关 Handlers
 */

import type {
    GetClaudeConfigRequest,
    GetClaudeConfigResponse,
    SaveClaudeConfigRequest,
    SaveClaudeConfigResponse,
    ClaudeConfigData
} from '../../../shared/messages';
import type { HandlerContext } from './types';

/**
 * 读取 Claude 配置
 */
export async function handleGetClaudeConfig(
    request: GetClaudeConfigRequest,
    context: HandlerContext
): Promise<GetClaudeConfigResponse> {
    try {
        const { claudeConfigService } = context;
        const { scope = 'merged', configType = 'settings' } = request;

        let config: any;

        // 根据 scope 读取不同级别的配置
        if (scope === 'user') {
            // 全局配置
            config = await claudeConfigService.getUserConfig();
        } else if (scope === 'project') {
            // 项目配置
            if (configType === 'mcp') {
                // 项目级 MCP 配置 (.mcp.json)
                config = await claudeConfigService.getCurrentProjectMcpConfig();
            } else {
                // 项目级设置 (.claude/settings.json)
                config = await claudeConfigService.getCurrentProjectConfig();
            }
        } else {
            // merged: 合并后的配置（项目覆盖全局）
            config = await claudeConfigService.getCurrentMergedConfig();
        }

        // 转换为响应格式
        const configData: ClaudeConfigData = {
            env: config.env,
            mcpServers: config.mcpServers,
            permissions: config.permissions,
            permissionMode: config.permissionMode,
            includeCoAuthoredBy: config.includeCoAuthoredBy,
            maxTurns: config.maxTurns,
            thinkingLevel: config.thinkingLevel,
            customSystemPrompt: config.customSystemPrompt,
            appendSystemPrompt: config.appendSystemPrompt,
            allowedTools: config.allowedTools,
            disallowedTools: config.disallowedTools,
            fallbackModel: config.fallbackModel,
            additionalDirectories: config.additionalDirectories
        };

        return {
            type: "get_claude_config_response",
            config: configData
        };

    } catch (error) {
        context.logService.error('[handleGetClaudeConfig] 错误:', error);

        // 返回默认配置
        return {
            type: "get_claude_config_response",
            config: {
                env: {},
                permissions: {
                    allow: [],
                    deny: []
                },
                permissionMode: 'default',
                includeCoAuthoredBy: false,
                additionalDirectories: []
            }
        };
    }
}

/**
 * 保存 Claude 配置
 */
export async function handleSaveClaudeConfig(
    request: SaveClaudeConfigRequest,
    context: HandlerContext
): Promise<SaveClaudeConfigResponse> {
    try {
        const { claudeConfigService, logService } = context;
        const { config, scope = 'user', configType = 'settings' } = request;

        logService.info(`[handleSaveClaudeConfig] 保存配置 scope=${scope}, type=${configType}`);

        // 先备份当前配置
        try {
            await claudeConfigService.backupConfig();
            logService.info('[handleSaveClaudeConfig] 配置已备份');
        } catch (backupError) {
            logService.warn('[handleSaveClaudeConfig] 备份失败，继续保存:', backupError);
        }

        // 根据 scope 和 configType 进行部分更新（合并而非覆盖）
        if (scope === 'user') {
            // 更新全局配置（部分更新，不覆盖其他字段）
            await claudeConfigService.updateUserConfig(config);
            logService.info('[handleSaveClaudeConfig] 全局配置更新成功');
        } else if (scope === 'project') {
            if (configType === 'mcp') {
                // 保存到项目 MCP 配置 ({workspace}/.mcp.json)
                // .mcp.json 是独立文件，只包含 mcpServers
                await claudeConfigService.saveCurrentProjectMcpConfig({
                    mcpServers: config.mcpServers
                });
                logService.info('[handleSaveClaudeConfig] 项目 MCP 配置保存成功');
            } else {
                // 更新项目配置（部分更新，不覆盖其他字段）
                await claudeConfigService.updateCurrentProjectConfig(config);
                logService.info('[handleSaveClaudeConfig] 项目配置更新成功');
            }
        } else {
            throw new Error(`不支持的 scope: ${scope}`);
        }

        return {
            type: "save_claude_config_response",
            success: true
        };

    } catch (error) {
        context.logService.error('[handleSaveClaudeConfig] 错误:', error);

        return {
            type: "save_claude_config_response",
            success: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}
