/**
 * Agents 和 Skills Handlers
 */

import type {
    GetAgentsRequest,
    GetAgentsResponse,
    GetSkillsRequest,
    GetSkillsResponse,
    ToggleAgentRequest,
    ToggleAgentResponse,
    DeleteAgentRequest,
    DeleteAgentResponse,
    ToggleSkillRequest,
    ToggleSkillResponse,
    DeleteSkillRequest,
    DeleteSkillResponse
} from '../../../shared/messages';
import type { HandlerContext } from './types';

/**
 * 获取 Agents 列表
 */
export async function handleGetAgents(
    request: GetAgentsRequest,
    context: HandlerContext
): Promise<GetAgentsResponse> {
    try {
        const { claudeAgentsService, logService } = context;

        logService.info('[handleGetAgents] 获取 Agents 列表...');

        const agents = await claudeAgentsService.getAgents();

        logService.info(`[handleGetAgents] 成功获取 ${agents.length} 个 Agents`);

        return {
            type: "get_agents_response",
            agents
        };

    } catch (error) {
        context.logService.error('[handleGetAgents] 错误:', error);

        return {
            type: "get_agents_response",
            agents: []
        };
    }
}

/**
 * 获取 Skills 列表
 */
export async function handleGetSkills(
    request: GetSkillsRequest,
    context: HandlerContext
): Promise<GetSkillsResponse> {
    try {
        const { claudeSkillsService, logService } = context;

        logService.info('[handleGetSkills] 获取 Skills 列表...');

        const skills = await claudeSkillsService.getSkills();

        logService.info(`[handleGetSkills] 成功获取 ${skills.length} 个 Skills`);

        return {
            type: "get_skills_response",
            skills
        };

    } catch (error) {
        context.logService.error('[handleGetSkills] 错误:', error);

        return {
            type: "get_skills_response",
            skills: []
        };
    }
}

/**
 * 启用/禁用 Agent
 */
export async function handleToggleAgent(
    request: ToggleAgentRequest,
    context: HandlerContext
): Promise<ToggleAgentResponse> {
    try {
        const { claudeAgentsService, logService } = context;
        const { agentName, enabled } = request;

        logService.info(`[handleToggleAgent] ${enabled ? '启用' : '禁用'} Agent: ${agentName}`);

        await claudeAgentsService.toggleAgent(agentName, enabled);

        return {
            type: "toggle_agent_response",
            success: true
        };

    } catch (error: any) {
        context.logService.error('[handleToggleAgent] 错误:', error);

        return {
            type: "toggle_agent_response",
            success: false,
            error: error.message || '操作失败'
        };
    }
}

/**
 * 删除 Agent
 */
export async function handleDeleteAgent(
    request: DeleteAgentRequest,
    context: HandlerContext
): Promise<DeleteAgentResponse> {
    try {
        const { claudeAgentsService, logService } = context;
        const { agentPath } = request;

        logService.info(`[handleDeleteAgent] 删除 Agent: ${agentPath}`);

        await claudeAgentsService.deleteAgent(agentPath);

        return {
            type: "delete_agent_response",
            success: true
        };

    } catch (error: any) {
        context.logService.error('[handleDeleteAgent] 错误:', error);

        return {
            type: "delete_agent_response",
            success: false,
            error: error.message || '删除失败'
        };
    }
}

/**
 * 启用/禁用 Skill
 */
export async function handleToggleSkill(
    request: ToggleSkillRequest,
    context: HandlerContext
): Promise<ToggleSkillResponse> {
    try {
        const { claudeSkillsService, logService } = context;
        const { skillId, enabled } = request;

        logService.info(`[handleToggleSkill] ${enabled ? '启用' : '禁用'} Skill: ${skillId}`);

        await claudeSkillsService.toggleSkill(skillId, enabled);

        return {
            type: "toggle_skill_response",
            success: true
        };

    } catch (error: any) {
        context.logService.error('[handleToggleSkill] 错误:', error);

        return {
            type: "toggle_skill_response",
            success: false,
            error: error.message || '操作失败'
        };
    }
}

/**
 * 删除 Skill
 */
export async function handleDeleteSkill(
    request: DeleteSkillRequest,
    context: HandlerContext
): Promise<DeleteSkillResponse> {
    try {
        const { claudeSkillsService, logService } = context;
        const { skillPath } = request;

        logService.info(`[handleDeleteSkill] 删除 Skill: ${skillPath}`);

        await claudeSkillsService.deleteSkill(skillPath);

        return {
            type: "delete_skill_response",
            success: true
        };

    } catch (error: any) {
        context.logService.error('[handleDeleteSkill] 错误:', error);

        return {
            type: "delete_skill_response",
            success: false,
            error: error.message || '删除失败'
        };
    }
}
