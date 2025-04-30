import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { RulesetConfig } from '../models/types';

/**
 * Default name for the CodeGuard AI configuration file
 */
export const CONFIG_FILENAME = '.codeguardrc';

/**
 * Finds and loads the CodeGuard configuration file in the workspace
 * @param workspaceFolder The workspace folder to search in
 * @returns A Promise resolving to the parsed configuration or undefined if not found
 */
export async function loadConfigFile(workspaceFolder: vscode.WorkspaceFolder): Promise<RulesetConfig | undefined> {
    try {
        const configPath = path.join(workspaceFolder.uri.fsPath, CONFIG_FILENAME);
        
        // Check if the config file exists
        if (!fs.existsSync(configPath)) {
            return undefined;
        }
        
        // Read and parse the config file
        const configContent = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(configContent) as RulesetConfig;
    } catch (error) {
        console.error('Error loading CodeGuard config file:', error);
        return undefined;
    }
}

/**
 * Creates a default configuration file in the specified workspace folder
 * @param workspaceFolder The workspace folder to create the config file in
 * @returns A Promise resolving to true if the file was created, false otherwise
 */
export async function createDefaultConfigFile(workspaceFolder: vscode.WorkspaceFolder): Promise<boolean> {
    try {
        const configPath = path.join(workspaceFolder.uri.fsPath, CONFIG_FILENAME);
        
        // Check if the config file already exists
        if (fs.existsSync(configPath)) {
            return false;
        }
        
        // Create a default configuration
        const defaultConfig: RulesetConfig = {
            version: '1.0.0',
            name: 'Default CodeGuard AI Ruleset',
            description: 'Default security and compliance rules for CodeGuard AI',
            rules: {
                // Enable all security rules by default
                'SEC001': { enabled: true, severity: 'critical' },
                'SEC002': { enabled: true, severity: 'critical' },
                'SEC003': { enabled: true, severity: 'high' },
                'SEC004': { enabled: true, severity: 'high' },
                'SEC005': { enabled: true, severity: 'high' },
                
                // Enable all compliance rules by default
                'COMP001': { enabled: true, severity: 'high' },
                'COMP002': { enabled: true, severity: 'medium' },
                'COMP003': { enabled: true, severity: 'medium' },
                'COMP004': { enabled: true, severity: 'high' },
                'COMP005': { enabled: true, severity: 'critical' }
            },
            complianceProfiles: {
                'gdpr': { enabled: true, standards: ['gdpr'] },
                'hipaa': { enabled: true, standards: ['hipaa'] },
                'soc2': { enabled: true, standards: ['soc2'] },
                'pci-dss': { enabled: true, standards: ['pci-dss'] },
                'iso27001': { enabled: true, standards: ['iso27001'] }
            }
        };
        
        // Write the default configuration to the file
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
        return true;
    } catch (error) {
        console.error('Error creating default config file:', error);
        return false;
    }
}

/**
 * Gets the enabled standards from the configuration
 * @param config The ruleset configuration
 * @returns An array of enabled standard IDs
 */
export function getEnabledStandards(config: RulesetConfig): string[] {
    if (!config.complianceProfiles) {
        return [];
    }
    
    const enabledStandards: string[] = [];
    
    // Collect all enabled standards from the compliance profiles
    Object.entries(config.complianceProfiles).forEach(([profileId, profile]) => {
        if (profile.enabled && profile.standards) {
            enabledStandards.push(...profile.standards);
        }
    });
    
    // Remove duplicates
    return [...new Set(enabledStandards)];
}

/**
 * Checks if a rule is enabled in the configuration
 * @param config The ruleset configuration
 * @param ruleId The ID of the rule to check
 * @returns True if the rule is enabled, false otherwise
 */
export function isRuleEnabled(config: RulesetConfig, ruleId: string): boolean {
    if (!config.rules || !config.rules[ruleId]) {
        return true; // Default to enabled if not specified in config
    }
    
    return config.rules[ruleId].enabled;
}

/**
 * Gets the severity override for a rule from the configuration
 * @param config The ruleset configuration
 * @param ruleId The ID of the rule to check
 * @returns The severity override or undefined if not specified
 */
export function getRuleSeverity(
    config: RulesetConfig, 
    ruleId: string
): 'critical' | 'high' | 'medium' | 'low' | 'info' | undefined {
    if (!config.rules || !config.rules[ruleId]) {
        return undefined;
    }
    
    return config.rules[ruleId].severity;
}