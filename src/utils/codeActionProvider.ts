import * as vscode from 'vscode';
import { Issue } from '../models/types';

/**
 * Code action provider for CodeGuard AI issues
 */
export class CodeGuardCodeActionProvider implements vscode.CodeActionProvider {
    /**
     * Provide code actions for the given document and range
     * @param document The document in which the command was invoked
     * @param range The range for which the command was invoked
     * @param context Context carrying additional information
     * @param token A cancellation token
     * @returns Code actions for the given document and range
     */
    public provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<(vscode.Command | vscode.CodeAction)[]> {
        // Create code actions only for CodeGuard diagnostics
        const actions: vscode.CodeAction[] = [];
        
        for (const diagnostic of context.diagnostics) {
            // Check if the diagnostic is from CodeGuard
            if (
                diagnostic.source === 'CodeGuard Security' || 
                diagnostic.source === 'CodeGuard Compliance'
            ) {
                // Create code actions for this diagnostic
                this.createFixActions(diagnostic, document, range, actions);
            }
        }
        
        return actions;
    }
    
    /**
     * Create code fix actions for a diagnostic
     * @param diagnostic The diagnostic to create actions for
     * @param document The document containing the diagnostic
     * @param range The range of the diagnostic
     * @param actions Array to add the created actions to
     */
    private createFixActions(
        diagnostic: vscode.Diagnostic,
        document: vscode.TextDocument,
        range: vscode.Range,
        actions: vscode.CodeAction[]
    ): void {
        // Check for related information with fix suggestions
        if (diagnostic.relatedInformation && diagnostic.relatedInformation.length > 0) {
            const fixInfo = diagnostic.relatedInformation[0];
            
            // For SQL Injection (SEC001)
            if (diagnostic.code === 'SEC001') {
                this.createSqlInjectionFix(diagnostic, document, range, actions);
            }
            
            // For XSS vulnerabilities (SEC002)
            else if (diagnostic.code === 'SEC002') {
                this.createXssFix(diagnostic, document, range, actions);
            }
            
            // For hardcoded secrets (SEC003)
            else if (diagnostic.code === 'SEC003') {
                this.createHardcodedSecretsFix(diagnostic, document, range, actions);
            }
            
            // Add generic "Show fix suggestions" action for all issues
            const showSuggestionsAction = new vscode.CodeAction(
                'Show fix suggestions',
                vscode.CodeActionKind.QuickFix
            );
            
            showSuggestionsAction.command = {
                command: 'codeguard-ai.showFixSuggestions',
                title: 'Show fix suggestions',
                arguments: [document, diagnostic]
            };
            
            showSuggestionsAction.diagnostics = [diagnostic];
            showSuggestionsAction.isPreferred = true;
            
            actions.push(showSuggestionsAction);
        }
    }
    
    /**
     * Create fixes for SQL injection vulnerabilities
     */
    private createSqlInjectionFix(
        diagnostic: vscode.Diagnostic,
        document: vscode.TextDocument,
        range: vscode.Range,
        actions: vscode.CodeAction[]
    ): void {
        const text = document.getText(range);
        
        // Basic parameterized query fix for SQL injection
        if (text.includes('+') || text.includes('${')) {
            const action = new vscode.CodeAction(
                'Convert to parameterized query',
                vscode.CodeActionKind.QuickFix
            );
            
            action.edit = new vscode.WorkspaceEdit();
            
            // Simple replacement example for Node.js/MySQL style
            if (text.includes('query(')) {
                const newText = text.replace(
                    /query\s*\(\s*(['"`])(.*?)\s*\+\s*(.*?)(['"`])/g,
                    'query($1$2?$4, [$3])'
                ).replace(
                    /query\s*\(\s*(['"`])(.*?)\$\{(.*?)\}(.*?)(['"`])/g,
                    'query($1$2?$4$5, [$3])'
                );
                
                action.edit.replace(document.uri, range, newText);
                action.diagnostics = [diagnostic];
                actions.push(action);
            }
        }
    }
    
    /**
     * Create fixes for XSS vulnerabilities
     */
    private createXssFix(
        diagnostic: vscode.Diagnostic,
        document: vscode.TextDocument,
        range: vscode.Range,
        actions: vscode.CodeAction[]
    ): void {
        const text = document.getText(range);
        
        // Replace innerHTML with textContent
        if (text.includes('innerHTML')) {
            const action = new vscode.CodeAction(
                'Use textContent instead of innerHTML',
                vscode.CodeActionKind.QuickFix
            );
            
            action.edit = new vscode.WorkspaceEdit();
            action.edit.replace(
                document.uri, 
                range, 
                text.replace(/innerHTML\s*=/, 'textContent =')
            );
            
            action.diagnostics = [diagnostic];
            actions.push(action);
        }
        
        // Add sanitization function
        const sanitizeAction = new vscode.CodeAction(
            'Add sanitization function',
            vscode.CodeActionKind.QuickFix
        );
        
        sanitizeAction.command = {
            command: 'codeguard-ai.insertSanitizeFunction',
            title: 'Add sanitization function',
            arguments: [document]
        };
        
        sanitizeAction.diagnostics = [diagnostic];
        actions.push(sanitizeAction);
    }
    
    /**
     * Create fixes for hardcoded secrets
     */
    private createHardcodedSecretsFix(
        diagnostic: vscode.Diagnostic,
        document: vscode.TextDocument,
        range: vscode.Range,
        actions: vscode.CodeAction[]
    ): void {
        const text = document.getText(range);
        
        // Extract variable name and value
        const match = /(?:const|let|var)\s+(\w+)\s*=\s*(['"`])([^'"`]+)(['"`])/i.exec(text);
        
        if (match) {
            const [, variableName, , value] = match;
            
            // Create action to use environment variable
            const action = new vscode.CodeAction(
                `Use environment variable for "${variableName}"`,
                vscode.CodeActionKind.QuickFix
            );
            
            action.edit = new vscode.WorkspaceEdit();
            action.edit.replace(
                document.uri,
                range,
                `const ${variableName} = process.env.${variableName.toUpperCase()} || ""; // Set in environment variables`
            );
            
            action.diagnostics = [diagnostic];
            actions.push(action);
        }
    }
}

/**
 * Inserts a sanitization function into the document
 * @param document The document to insert the function into
 */
export async function insertSanitizeFunction(document: vscode.TextDocument): Promise<void> {
    const edit = new vscode.WorkspaceEdit();
    
    // Find an appropriate location to insert the function
    // For simplicity, we're adding it at the end of the document
    const lastLine = document.lineCount - 1;
    const lastLineRange = document.lineAt(lastLine).range;
    
    const sanitizeFunction = `

/**
 * Sanitizes HTML content to prevent XSS attacks
 * @param unsafe The unsafe HTML string
 * @returns A sanitized HTML string
 */
function sanitizeHtml(unsafe) {
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
`;
    
    edit.insert(document.uri, lastLineRange.end, sanitizeFunction);
    
    // Apply the edit
    await vscode.workspace.applyEdit(edit);
    
    // Show a message to the user
    vscode.window.showInformationMessage('Added sanitizeHtml function to the document');
}

/**
 * Shows detailed fix suggestions for an issue
 * @param document The document containing the issue
 * @param diagnostic The diagnostic representing the issue
 */
export async function showFixSuggestions(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic
): Promise<void> {
    // If there are related information with fix suggestions, show them
    if (diagnostic.relatedInformation && diagnostic.relatedInformation.length > 0) {
        const fixInfo = diagnostic.relatedInformation[0];
        
        // Create and show the fix suggestions in a new document
        const fixUri = vscode.Uri.parse(`untitled:CodeGuard Fix - ${diagnostic.code}.md`);
        const fixDocument = await vscode.workspace.openTextDocument(fixUri);
        
        const edit = new vscode.WorkspaceEdit();
        
        // Create markdown content with detailed fix suggestions
        const content = `# CodeGuard AI Fix Suggestions

## Issue: ${diagnostic.message}

${fixInfo.message}

### Code with issue:
\`\`\`
${document.getText(diagnostic.range)}
\`\`\`

### Additional resources:
${getResourcesForDiagnostic(diagnostic)}
`;
        
        edit.insert(fixUri, new vscode.Position(0, 0), content);
        
        // Apply the edit
        await vscode.workspace.applyEdit(edit);
        
        // Show the document to the user
        await vscode.window.showTextDocument(fixDocument, { preview: true });
    } else {
        vscode.window.showInformationMessage('No fix suggestions available for this issue');
    }
}

/**
 * Returns additional resources for a diagnostic
 * @param diagnostic The diagnostic to get resources for
 * @returns A markdown string with resource links
 */
function getResourcesForDiagnostic(diagnostic: vscode.Diagnostic): string {
    // Return resources based on the diagnostic code
    switch (diagnostic.code) {
        case 'SEC001':
            return `- [OWASP SQL Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)
- [Node.js MySQL Parameterized Queries](https://github.com/mysqljs/mysql#escaping-query-values)`;
        
        case 'SEC002':
            return `- [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [DOMPurify Library](https://github.com/cure53/DOMPurify)`;
        
        case 'SEC003':
            return `- [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [dotenv npm package](https://www.npmjs.com/package/dotenv)`;
        
        case 'SEC004':
            return `- [OWASP IDOR Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html)`;
        
        case 'SEC005':
            return `- [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)`;
        
        case 'COMP001':
            return `- [GDPR Article 32 - Security of processing](https://gdpr-info.eu/art-32-gdpr/)
- [HIPAA Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/index.html)`;
        
        case 'COMP002':
            return `- [GDPR Article 17 - Right to be forgotten](https://gdpr-info.eu/art-17-gdpr/)`;
        
        case 'COMP003':
            return `- [SOC 2 Logging Best Practices](https://www.vanta.com/blog/soc-2-logging-requirements)`;
        
        case 'COMP004':
            return `- [NIST Authentication Guidelines](https://pages.nist.gov/800-63-3/sp800-63b.html)`;
        
        case 'COMP005':
            return `- [HIPAA Privacy Rule](https://www.hhs.gov/hipaa/for-professionals/privacy/index.html)`;
        
        default:
            return `- [OWASP Top Ten](https://owasp.org/www-project-top-ten/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)`;
    }
}