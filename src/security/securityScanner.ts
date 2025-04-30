import * as vscode from 'vscode';
import { Issue, Rule } from '../models/types';

/**
 * Security rules for detecting common vulnerabilities
 */
export const securityRules: Rule[] = [
    {
        id: 'SEC001',
        name: 'SQL Injection',
        description: 'Detects potential SQL injection vulnerabilities',
        category: 'security',
        severity: 'critical',
        type: 'regex',
        enabled: true,
        tags: ['sql-injection', 'input-validation']
    },
    {
        id: 'SEC002',
        name: 'Cross-Site Scripting (XSS)',
        description: 'Detects potential XSS vulnerabilities',
        category: 'security',
        severity: 'critical',
        type: 'regex',
        enabled: true,
        tags: ['xss', 'input-validation', 'output-encoding']
    },
    {
        id: 'SEC003',
        name: 'Hardcoded Secrets',
        description: 'Detects hardcoded API keys, passwords, and other secrets',
        category: 'security',
        severity: 'high',
        type: 'regex',
        enabled: true,
        tags: ['secrets', 'credentials']
    },
    {
        id: 'SEC004',
        name: 'Insecure Direct Object Reference (IDOR)',
        description: 'Detects potential IDOR vulnerabilities',
        category: 'security',
        severity: 'high',
        type: 'regex',
        enabled: true,
        tags: ['idor', 'access-control']
    },
    {
        id: 'SEC005',
        name: 'Weak Cryptography',
        description: 'Detects the use of weak cryptographic algorithms',
        category: 'security',
        severity: 'high',
        type: 'regex',
        enabled: true,
        tags: ['cryptography', 'encryption']
    }
];

/**
 * Regular expression patterns associated with each security rule
 */
const securityPatterns: { [ruleId: string]: RegExp[] } = {
    'SEC001': [
        /(?:execute|run)(?:Query|Sql|Statement).*\$\{/i,
        /(?:execute|run)(?:Query|Sql|Statement).*\+/i,
        /(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP).*\$\{/i,
        /(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP).*\+/i,
        /(?:query|sql|statement).*\$\{/i,
        /(?:query|sql|statement).*\+/i
    ],
    'SEC002': [
        /\.innerHTML\s*=/i,
        /\.outerHTML\s*=/i,
        /document\.write/i,
        /\$\(.*\)\.html\(/i,
        /eval\(/i
    ],
    'SEC003': [
        /(?:const|let|var)\s+\w+\s*=\s*["'`](?:[A-Za-z0-9_-]{8,}|(?:sk|pk)_live_[A-Za-z0-9]+|(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{16,})["'`]/i,
        /password\s*:\s*["'`][^"'`]{4,}["'`]/i,
        /(?:api|access)[-_]?(?:key|token|secret)\s*:\s*["'`][^"'`]{8,}["'`]/i,
        /(?:key|token|credential|secret|password)\s*(?:=|:)\s*["'`][A-Za-z0-9+/]{8,}={0,2}["'`]/i
    ],
    'SEC004': [
        /req\.params\.(?:id|userId|accountId|recordId)/i,
        /req\.query\.(?:id|userId|accountId|recordId)/i,
        /(?:findById|getById|fetchById|retrieveById)\(/i,
        /(?:findOne|getOne|fetchOne|retrieveOne)\(\s*{\s*(?:_id|id|userId|accountId|recordId)/i
    ],
    'SEC005': [
        /createHash\(['"]md5['"]\)/i,
        /createHash\(['"]sha1['"]\)/i,
        /createCipher\(/i,
        /(?:crypto|cipher)\.(?:createHash|createCipher)\(["'](?:md5|sha1|des|3des|rc4)["']\)/i
    ]
};

/**
 * Scans a document for security issues
 * @param document The document to scan
 * @returns An array of detected security issues
 */
export async function scanDocumentForSecurityIssues(document: vscode.TextDocument): Promise<Issue[]> {
    const text = document.getText();
    const issues: Issue[] = [];
    const fileName = document.fileName;

    // For each security rule, check if the document content matches any patterns
    for (const rule of securityRules) {
        if (!rule.enabled) {
            continue;
        }

        const patterns = securityPatterns[rule.id];
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
                    suggestedFix: getSuggestedFixForSecurityRule(rule.id, match[0])
                };

                issues.push(issue);
            }
        }
    }

    return issues;
}

/**
 * Provides a suggested fix for a detected security issue
 * @param ruleId The ID of the security rule
 * @param matchedText The text that matched the rule pattern
 * @returns A suggested fix for the issue or undefined if no suggestion is available
 */
function getSuggestedFixForSecurityRule(ruleId: string, matchedText: string): string | undefined {
    switch (ruleId) {
        case 'SEC001':
            return `// SQL Injection Fix Suggestion:\n// Use parameterized queries instead of string concatenation\n// Example: db.executeQuery("SELECT * FROM users WHERE id = ?", [userId])`;
        
        case 'SEC002':
            return `// XSS Fix Suggestion:\n// Use textContent instead of innerHTML or sanitize the input\n// Example: element.textContent = userInput;\n// Or: element.innerHTML = sanitizeHtml(userInput);`;
        
        case 'SEC003':
            return `// Hardcoded Secrets Fix Suggestion:\n// Store secrets in environment variables or a secure vault\n// Example: const apiKey = process.env.API_KEY;`;
        
        case 'SEC004':
            return `// IDOR Fix Suggestion:\n// Implement proper access control and validate user permissions\n// Example: if (user.canAccess(profileId)) { return User.findById(profileId); }`;
        
        case 'SEC005':
            return `// Weak Cryptography Fix Suggestion:\n// Use modern cryptographic algorithms and libraries\n// Example: crypto.createHash('sha256').update(password).digest('hex');\n// Better: Use bcrypt or Argon2 for password hashing`;
        
        default:
            return undefined;
    }
}