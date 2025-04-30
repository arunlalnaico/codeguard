import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { RulesetConfig } from '../models/types';
import { CONFIG_FILENAME, loadConfigFile } from './configManager';

// Default URL for downloading security ruleset definitions
const DEFAULT_RULESET_URL = 'https://api.codeguard-ai.com/rulesets/security/latest';

/**
 * Interface for ruleset download options
 */
interface RulesetDownloadOptions {
    url?: string;
    includeExperimental?: boolean;
    timeout?: number;
    proxy?: string;
    headers?: Record<string, string>;
}

/**
 * Interface for downloaded ruleset data
 */
interface RemoteRulesetData {
    version: string;
    rules: {
        [ruleId: string]: {
            description: string;
            severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
            patterns: string[];
            category: string;
            tags: string[];
            enabled: boolean;
            suggestedFix?: string;
        };
    };
    metadata?: {
        updatedAt: string;
        compatibleVersions: string[];
    };
}

/**
 * Get the URL for downloading security rulesets
 * @returns The configured ruleset URL or the default URL
 */
function getRulesetUrl(): string {
    const config = vscode.workspace.getConfiguration('codeguardai');
    return config.get<string>('rulesetUrl') || DEFAULT_RULESET_URL;
}

/**
 * Downloads security ruleset definitions from a remote server
 * @param options Download options
 * @returns A promise that resolves to the downloaded ruleset data or undefined if download failed
 */
export async function downloadSecurityRuleset(options?: RulesetDownloadOptions): Promise<RemoteRulesetData | undefined> {
    return new Promise((resolve, reject) => {
        try {
            const url = options?.url || getRulesetUrl();
            const timeout = options?.timeout || 10000; // 10 seconds default timeout
            
            // Parse URL to determine protocol
            const parsedUrl = new URL(url);
            const protocol = parsedUrl.protocol === 'https:' ? https : http;
            
            // Prepare request options
            const requestOptions: http.RequestOptions = {
                timeout: timeout,
                headers: {
                    'User-Agent': 'CodeGuard-AI-VSCode-Extension',
                    'Accept': 'application/json',
                    ...options?.headers
                }
            };
            
            // Add proxy if provided
            if (options?.proxy) {
                if (options.proxy) {
                    const HttpsProxyAgent = require('https-proxy-agent');
                    requestOptions.agent = new HttpsProxyAgent(options.proxy);
                }
            }
            
            // Add query parameters
            if (options?.includeExperimental) {
                parsedUrl.searchParams.append('experimental', 'true');
            }
            
            // Make the HTTP request
            const req = protocol.get(parsedUrl.toString(), requestOptions, (res) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`Server responded with status code ${res.statusCode}`));
                    return;
                }
                
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const ruleset = JSON.parse(data) as RemoteRulesetData;
                        resolve(ruleset);
                    } catch (error) {
                        reject(new Error(`Failed to parse ruleset data: ${error}`));
                    }
                });
            });
            
            req.on('error', (error) => {
                reject(new Error(`Failed to download ruleset: ${error.message}`));
            });
            
            req.on('timeout', () => {
                req.destroy();
                reject(new Error(`Request timed out after ${timeout}ms`));
            });
        } catch (error) {
            reject(new Error(`Failed to initiate download: ${error}`));
        }
    });
}

/**
 * Merges downloaded ruleset with local configuration
 * @param remoteRuleset The downloaded ruleset data
 * @param localConfig The local ruleset configuration
 * @returns The merged ruleset configuration
 */
export function mergeRulesets(remoteRuleset: RemoteRulesetData, localConfig: RulesetConfig): RulesetConfig {
    // Create a copy of the local config to modify
    const mergedConfig: RulesetConfig = {
        ...localConfig,
        version: localConfig.version,
        name: localConfig.name,
        description: localConfig.description,
        rules: { ...localConfig.rules }
    };
    
    // Merge rules from remote ruleset
    Object.entries(remoteRuleset.rules).forEach(([ruleId, ruleData]) => {
        // If the rule exists locally, preserve its enabled state and severity
        if (mergedConfig.rules[ruleId]) {
            mergedConfig.rules[ruleId] = {
                ...mergedConfig.rules[ruleId],
                // Preserve local overrides
                enabled: mergedConfig.rules[ruleId].enabled,
                severity: mergedConfig.rules[ruleId].severity || ruleData.severity,
                // Add any new options from the remote ruleset
                options: {
                    ...ruleData,
                    ...mergedConfig.rules[ruleId].options
                }
            };
        } else {
            // Add new rule with default enabled state
            mergedConfig.rules[ruleId] = {
                enabled: ruleData.enabled,
                severity: ruleData.severity,
                options: {
                    patterns: ruleData.patterns,
                    category: ruleData.category,
                    tags: ruleData.tags,
                    suggestedFix: ruleData.suggestedFix
                }
            };
        }
    });
    
    // Add metadata about the update
    if (!mergedConfig.metadata) {
        mergedConfig.metadata = {};
    }
    
    mergedConfig.metadata.lastUpdated = new Date().toISOString();
    mergedConfig.metadata.rulesetVersion = remoteRuleset.version;
    
    return mergedConfig;
}

/**
 * Updates the local ruleset configuration file with downloaded rules
 * @param workspaceFolder The workspace folder containing the config file
 * @param options Download options
 * @returns A promise that resolves to true if update was successful, false otherwise
 */
export async function updateSecurityRuleset(
    workspaceFolder: vscode.WorkspaceFolder,
    options?: RulesetDownloadOptions
): Promise<boolean> {
    try {
        // Check if config file exists
        const configPath = path.join(workspaceFolder.uri.fsPath, CONFIG_FILENAME);
        if (!fs.existsSync(configPath)) {
            vscode.window.showErrorMessage(`No ${CONFIG_FILENAME} file found. Create one first.`);
            return false;
        }
        
        // Show progress indicator
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Downloading security ruleset",
            cancellable: true
        }, async (progress, token) => {
            try {
                // Download ruleset
                progress.report({ message: "Connecting to ruleset server..." });
                
                if (token.isCancellationRequested) {
                    return false;
                }
                
                const remoteRuleset = await downloadSecurityRuleset(options);
                if (!remoteRuleset) {
                    vscode.window.showErrorMessage("Failed to download security ruleset.");
                    return false;
                }
                
                progress.report({ message: "Merging with local configuration...", increment: 50 });
                
                if (token.isCancellationRequested) {
                    return false;
                }
                
                // Load and merge with local config
                const localConfig = await loadConfigFile(workspaceFolder);
                if (!localConfig) {
                    vscode.window.showErrorMessage("Failed to load local configuration.");
                    return false;
                }
                
                const mergedConfig = mergeRulesets(remoteRuleset, localConfig);
                
                progress.report({ message: "Saving updated ruleset...", increment: 75 });
                
                if (token.isCancellationRequested) {
                    return false;
                }
                
                // Write merged config back to file
                fs.writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2), 'utf-8');
                
                progress.report({ message: "Security ruleset updated successfully", increment: 100 });
                
                const securityRuleCount = Object.keys(remoteRuleset.rules).filter(id => id.startsWith('SEC')).length;
                vscode.window.showInformationMessage(`Successfully updated ${securityRuleCount} security rules. Ruleset version: ${remoteRuleset.version}`);
                
                return true;
            } catch (error) {
                vscode.window.showErrorMessage(`Error updating security ruleset: ${error}`);
                return false;
            }
        });
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to update security ruleset: ${error}`);
        return false;
    }
}

/**
 * Gets the local configuration setting for the ruleset update URL
 * @returns The configured URL or undefined if not set
 */
export function getConfiguredRulesetUrl(): string | undefined {
    const config = vscode.workspace.getConfiguration('codeguardai');
    return config.get<string>('rulesetUrl');
}

/**
 * Sets the URL for downloading rulesets
 * @param url The URL to set
 * @returns A promise that resolves when the setting is updated
 */
export async function setRulesetUrl(url: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('codeguardai');
    await config.update('rulesetUrl', url, vscode.ConfigurationTarget.Global);
}

/**
 * Gets the timestamp of the last ruleset update
 * @param workspaceFolder The workspace folder
 * @returns A promise that resolves to the timestamp or undefined if not available
 */
export async function getLastUpdateTimestamp(workspaceFolder: vscode.WorkspaceFolder): Promise<string | undefined> {
    try {
        const config = await loadConfigFile(workspaceFolder);
        return config?.metadata?.lastUpdated;
    } catch (error) {
        return undefined;
    }
}