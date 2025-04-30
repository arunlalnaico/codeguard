import * as vscode from 'vscode';
import { ComplianceStandard, Issue, Rule } from '../models/types';

/**
 * Compliance standards supported by the extension
 */
export const complianceStandards: ComplianceStandard[] = [
    {
        id: 'gdpr',
        name: 'GDPR',
        version: '2018',
        description: 'General Data Protection Regulation (EU)'
    },
    {
        id: 'hipaa',
        name: 'HIPAA',
        version: '2013',
        description: 'Health Insurance Portability and Accountability Act (US)'
    },
    {
        id: 'soc2',
        name: 'SOC 2',
        version: 'Type II',
        description: 'Service Organization Control 2'
    },
    {
        id: 'pci-dss',
        name: 'PCI DSS',
        version: '3.2.1',
        description: 'Payment Card Industry Data Security Standard'
    },
    {
        id: 'iso27001',
        name: 'ISO 27001',
        version: '2013',
        description: 'Information Security Management'
    }
];

/**
 * Compliance rules for checking code against various standards
 */
export const complianceRules: Rule[] = [
    {
        id: 'COMP001',
        name: 'Unencrypted Personal Data',
        description: 'Detects potential storage or transmission of unencrypted personal data',
        category: 'compliance',
        severity: 'high',
        type: 'regex',
        enabled: true,
        tags: ['personal-data', 'encryption'],
        complianceStandards: [
            { id: 'gdpr', name: 'GDPR', version: '2018' },
            { id: 'hipaa', name: 'HIPAA', version: '2013' }
        ]
    },
    {
        id: 'COMP002',
        name: 'Missing Data Deletion',
        description: 'Detects code that stores user data without a clear deletion mechanism',
        category: 'compliance',
        severity: 'medium',
        type: 'regex',
        enabled: true,
        tags: ['data-retention', 'right-to-be-forgotten'],
        complianceStandards: [
            { id: 'gdpr', name: 'GDPR', version: '2018' }
        ]
    },
    {
        id: 'COMP003',
        name: 'Inadequate Logging',
        description: 'Detects insufficient logging for security-critical operations',
        category: 'compliance',
        severity: 'medium',
        type: 'regex',
        enabled: true,
        tags: ['audit-trail', 'logging'],
        complianceStandards: [
            { id: 'soc2', name: 'SOC 2', version: 'Type II' },
            { id: 'iso27001', name: 'ISO 27001', version: '2013' }
        ]
    },
    {
        id: 'COMP004',
        name: 'Insecure Authentication',
        description: 'Detects weak or insecure authentication mechanisms',
        category: 'compliance',
        severity: 'high',
        type: 'regex',
        enabled: true,
        tags: ['authentication', 'security'],
        complianceStandards: [
            { id: 'pci-dss', name: 'PCI DSS', version: '3.2.1' },
            { id: 'soc2', name: 'SOC 2', version: 'Type II' },
            { id: 'iso27001', name: 'ISO 27001', version: '2013' }
        ]
    },
    {
        id: 'COMP005',
        name: 'Potential Health Data Exposure',
        description: 'Detects code that might expose protected health information',
        category: 'compliance',
        severity: 'critical',
        type: 'regex',
        enabled: true,
        tags: ['phi', 'health-data'],
        complianceStandards: [
            { id: 'hipaa', name: 'HIPAA', version: '2013' }
        ]
    }
];

/**
 * Regular expression patterns associated with each compliance rule
 */
const compliancePatterns: { [ruleId: string]: RegExp[] } = {
    'COMP001': [
        /(?:personal|user|customer)Data.*(?:store|save|write|post|send|transmit)/i,
        /(?:email|address|phone|ssn|social.*security|dob|birth|passport)/i
    ],
    'COMP002': [
        /(?:user|customer|profile|account).*(?:create|add|insert|new)/i,
        /(?:database|db|store|repository)\.(?:save|create|add|insert)/i
    ],
    'COMP003': [
        /(?:login|authenticate|authorize|permission|access|delete|payment)/i,
        /(?:admin|superuser|root|privilege)/i
    ],
    'COMP004': [
        /(?:login|authenticate|signin).*(?:password|credential)/i,
        /(?:jwt|token|session).*(?:create|generate|issue)/i,
        /(?:basic\s+auth|auth\s*:\s*['"`]Basic)/i
    ],
    'COMP005': [
        /(?:patient|medical|health|diagnosis|treatment|prescription|doctor)/i,
        /(?:hipaa|phi|protected.*health.*information)/i
    ]
};

/**
 * Scans a document for compliance issues
 * @param document The document to scan
 * @param enabledStandards Array of enabled compliance standard IDs
 * @returns An array of detected compliance issues
 */
export async function scanDocumentForComplianceIssues(
    document: vscode.TextDocument, 
    enabledStandards: string[] = []
): Promise<Issue[]> {
    const text = document.getText();
    const issues: Issue[] = [];
    const fileName = document.fileName;

    // If no standards are explicitly enabled, check against all standards
    const standardsToCheck = enabledStandards.length > 0 
        ? enabledStandards 
        : complianceStandards.map(std => std.id);

    // Filter compliance rules based on enabled standards
    const relevantRules = complianceRules.filter(rule => {
        if (!rule.enabled) {
            return false;
        }
        
        // If the rule doesn't have compliance standards defined, include it
        if (!rule.complianceStandards || rule.complianceStandards.length === 0) {
            return true;
        }
        
        // Check if any of the rule's standards are in the enabled standards list
        return rule.complianceStandards.some(std => 
            standardsToCheck.includes(std.id)
        );
    });

    // For each relevant compliance rule, check if the document content matches any patterns
    for (const rule of relevantRules) {
        const patterns = compliancePatterns[rule.id];
        if (!patterns) {
            continue;
        }

        for (const pattern of patterns) {
            const matches = text.matchAll(new RegExp(pattern, 'g'));
            
            for (const match of matches) {
                if (match.index === undefined) {
                    continue;
                }

                // Find the line and character position of the match
                const lines = text.substring(0, match.index).split('\n');
                const line = lines.length - 1;
                const character = lines[lines.length - 1].length;
                
                const matchLength = match[0].length;
                const matchLines = match[0].split('\n');
                const endLine = line + matchLines.length - 1;
                const endCharacter = matchLines.length > 1 
                    ? matchLines[matchLines.length - 1].length 
                    : character + matchLength;

                const issue: Issue = {
                    id: `${rule.id}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                    severity: rule.severity,
                    message: `${rule.name} detected`,
                    description: rule.description,
                    rule: rule,
                    location: {
                        file: fileName,
                        position: { line, character },
                        endPosition: { line: endLine, character: endCharacter }
                    },
                    suggestedFix: getSuggestedFixForComplianceRule(rule.id, match[0])
                };

                issues.push(issue);
            }
        }
    }

    return issues;
}

/**
 * Provides a suggested fix for a detected compliance issue
 * @param ruleId The ID of the compliance rule
 * @param matchedText The text that matched the rule pattern
 * @returns A suggested fix for the issue or undefined if no suggestion is available
 */
function getSuggestedFixForComplianceRule(ruleId: string, matchedText: string): string | undefined {
    switch (ruleId) {
        case 'COMP001':
            return `// Personal Data Protection Fix Suggestion:\n// Ensure all personal data is encrypted\n// Example: const encryptedData = encrypt(userData, encryptionKey)`;
        
        case 'COMP002':
            return `// Data Retention Fix Suggestion:\n// Implement a data deletion mechanism\n// Example: Add a 'deleteAccount' function and document data retention periods`;
        
        case 'COMP003':
            return `// Logging Fix Suggestion:\n// Add proper logging for security-critical operations\n// Example: logger.info('User authentication', { userId, timestamp, success: true })`;
        
        case 'COMP004':
            return `// Authentication Security Fix Suggestion:\n// Use secure authentication methods\n// Example: Implement multi-factor authentication or OAuth-based login`;
        
        case 'COMP005':
            return `// Health Data Protection Fix Suggestion:\n// Ensure PHI (Protected Health Information) is properly secured\n// Example: Implement access controls and encryption for health data`;
        
        default:
            return undefined;
    }
}