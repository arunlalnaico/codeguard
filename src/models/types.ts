/**
 * Represents a security or compliance issue found in the code
 */
export interface Issue {
    id: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    message: string;
    description: string;
    rule: Rule;
    location: {
        file: string;
        position: {
            line: number;
            character: number;
        };
        endPosition?: {
            line: number;
            character: number;
        };
    };
    suggestedFix?: string;
}

/**
 * Represents a rule used to detect security or compliance issues
 */
export interface Rule {
    id: string;
    name: string;
    description: string;
    category: 'security' | 'compliance' | 'best-practice';
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    type: 'regex' | 'ast' | 'semantic';
    enabled: boolean;
    tags: string[];
    complianceStandards?: ComplianceStandard[];
}

/**
 * Represents a compliance standard (like GDPR, HIPAA, SOC2, etc.)
 */
export interface ComplianceStandard {
    id: string;
    name: string;
    version?: string;
    description?: string;
}

/**
 * Represents a ruleset configuration that can be shared across teams
 */
export interface RulesetConfig {
    version: string;
    name: string;
    description?: string;
    rules: {
        [ruleId: string]: {
            enabled: boolean;
            severity?: 'critical' | 'high' | 'medium' | 'low' | 'info';
            options?: Record<string, unknown>;
        };
    };
    complianceProfiles?: {
        [profileId: string]: {
            enabled: boolean;
            standards: string[];
        };
    };
    metadata?: {
        lastUpdated?: string;
        rulesetVersion?: string;
        source?: string;
        customRules?: number;
    };
}