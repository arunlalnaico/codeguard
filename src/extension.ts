import * as vscode from 'vscode';
import { initDiagnostics, clearDiagnostics, updateDiagnostics } from './utils/diagnosticsProvider';
import { CodeGuardCodeActionProvider, insertSanitizeFunction, showFixSuggestions } from './utils/codeActionProvider';
import { createDefaultConfigFile, loadConfigFile } from './utils/configManager';
import { updateSecurityRuleset, setRulesetUrl, getLastUpdateTimestamp } from './utils/rulesetManager';
// Add import for dashboard
import { DashboardPanel } from './dashboard/dashboardProvider';

// Store collected issues for dashboard
let allSecurityIssues: any[] = [];
let allComplianceIssues: any[] = [];

/**
 * This method is called when your extension is activated
 * @param context The extension context
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('Activating CodeGuard AI extension...');

    // Enable dev tools for WebViews when in development mode
    if (process.env.NODE_ENV === 'development' || process.env) {
        process.env.VSCODE_DEBUG_MODE = "true";
        console.log('Development mode detected - enabling WebView DevTools');
    }

    // Initialize diagnostics system
    initDiagnostics(context);

    // Register code action provider for quick fixes
    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(
            { scheme: 'file' },
            new CodeGuardCodeActionProvider(),
            {
                providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
            }
        )
    );

    // Register command to manually scan current file
    const scanCommand = vscode.commands.registerCommand('codeguard-ai.scanCurrentFile', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            vscode.window.showInformationMessage('Scanning for security and compliance issues...');
            await updateDiagnostics(editor.document);
            vscode.window.showInformationMessage('Scan complete');
        } else {
            vscode.window.showErrorMessage('No active editor found');
        }
    });
    context.subscriptions.push(scanCommand);

    // Register command to scan workspace
    const scanWorkspaceCommand = vscode.commands.registerCommand('codeguard-ai.scanWorkspace', async () => {
        vscode.window.showInformationMessage('Scanning workspace for security and compliance issues...');
        
        // Clear current issues
        allSecurityIssues = [];
        allComplianceIssues = [];
        
        // Get all text documents
        const documents = vscode.workspace.textDocuments;
        for (const document of documents) {
            if (document.uri.scheme === 'file') {
                await updateDiagnosticsAndCollectIssues(document);
            }
        }
        
        // Update dashboard if it exists
        if (DashboardPanel.currentPanel) {
            DashboardPanel.currentPanel.updateIssues(allSecurityIssues, allComplianceIssues);
            
            // Send scan completion message to the webview
            DashboardPanel.currentPanel._panel.webview.postMessage({
                type: 'scanComplete',
                securityIssues: allSecurityIssues,
                complianceIssues: allComplianceIssues
            });
        }
        
        vscode.window.showInformationMessage('Workspace scan complete');
    });
    context.subscriptions.push(scanWorkspaceCommand);

    // Register command to show dashboard
    const showDashboardCommand = vscode.commands.registerCommand('codeguard-ai.showDashboard', () => {
        DashboardPanel.createOrShow(context.extensionUri);
        
        // Update the dashboard with current issues
        if (DashboardPanel.currentPanel) {
            DashboardPanel.currentPanel.updateIssues(allSecurityIssues, allComplianceIssues);
        }
    });
    context.subscriptions.push(showDashboardCommand);

    // Register command to create default config
    const createConfigCommand = vscode.commands.registerCommand('codeguard-ai.createDefaultConfig', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder found');
            return;
        }

        const created = await createDefaultConfigFile(workspaceFolders[0]);
        if (created) {
            vscode.window.showInformationMessage('Created default CodeGuard AI configuration file');
        } else {
            vscode.window.showInformationMessage('CodeGuard AI configuration file already exists');
        }
    });
    context.subscriptions.push(createConfigCommand);

    // Register command to show the current configuration
    const showConfigCommand = vscode.commands.registerCommand('codeguard-ai.showConfig', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder found');
            return;
        }

        const config = await loadConfigFile(workspaceFolders[0]);
        if (config) {
            // Create and show the configuration in a new document
            const configUri = vscode.Uri.parse('untitled:CodeGuard AI Configuration.json');
            const configDocument = await vscode.workspace.openTextDocument(configUri);
            
            const edit = new vscode.WorkspaceEdit();
            edit.insert(configUri, new vscode.Position(0, 0), JSON.stringify(config, null, 2));
            
            await vscode.workspace.applyEdit(edit);
            await vscode.window.showTextDocument(configDocument, { preview: true });
        } else {
            vscode.window.showErrorMessage('No CodeGuard AI configuration file found. Run "Create Default Configuration" command to create one.');
        }
    });
    context.subscriptions.push(showConfigCommand);

    // Register command to insert sanitize function
    const insertSanitizeCommand = vscode.commands.registerCommand('codeguard-ai.insertSanitizeFunction', (document: vscode.TextDocument) => {
        insertSanitizeFunction(document);
    });
    context.subscriptions.push(insertSanitizeCommand);

    // Register command to show fix suggestions
    const showFixCommand = vscode.commands.registerCommand('codeguard-ai.showFixSuggestions', (document: vscode.TextDocument, diagnostic: vscode.Diagnostic) => {
        showFixSuggestions(document, diagnostic);
    });
    context.subscriptions.push(showFixCommand);

    // Register command to show detailed issue information
    const showIssueInfoCommand = vscode.commands.registerCommand('codeguard-ai.showIssueInfo', async (issueId: string) => {
        // Find the issue in our collections
        const securityIssue = allSecurityIssues.find(issue => issue.id === issueId);
        const complianceIssue = allComplianceIssues.find(issue => issue.id === issueId);
        const issue = securityIssue || complianceIssue;
        
        if (!issue) {
            vscode.window.showErrorMessage(`Issue with ID ${issueId} not found`);
            return;
        }
        
        // Create a detailed markdown document for the issue
        const issueUri = vscode.Uri.parse(`untitled:CodeGuard Issue - ${issue.rule.name}.md`);
        const issueDocument = await vscode.workspace.openTextDocument(issueUri);
        
        const edit = new vscode.WorkspaceEdit();
        
        // Build comprehensive markdown content
        let content = `# ${issue.rule.name}\n\n`;
        content += `**Severity**: ${issue.severity.toUpperCase()}\n\n`;
        content += `**Description**: ${issue.description}\n\n`;
        
        // Add location information
        content += `## Location\n\n`;
        content += `- **File**: ${issue.location.file}\n`;
        content += `- **Line**: ${issue.location.position.line + 1}\n`;
        content += `- **Character**: ${issue.location.position.character + 1}\n\n`;
        
        // Add rule information
        content += `## Rule Details\n\n`;
        content += `- **Rule ID**: ${issue.rule.id}\n`;
        content += `- **Category**: ${issue.rule.category}\n`;
        
        if (issue.rule.tags && issue.rule.tags.length > 0) {
            content += `- **Tags**: ${issue.rule.tags.join(', ')}\n`;
        }
        
        // Add compliance standards if applicable
        if (issue.rule.complianceStandards && issue.rule.complianceStandards.length > 0) {
            content += `\n## Compliance Standards\n\n`;
            for (const standard of issue.rule.complianceStandards) {
                content += `- **${standard.name}** (${standard.id.toUpperCase()})\n`;
            }
            content += `\n`;
        }
        
        // Add suggested fix if available
        if (issue.suggestedFix) {
            content += `## Suggested Fix\n\n\`\`\`\n${issue.suggestedFix}\n\`\`\`\n\n`;
        }
        
        // Add resources/recommendations based on rule type
        content += `## Recommendations\n\n`;
        
        if (issue.rule.category === 'security') {
            switch (issue.rule.id) {
                case 'SEC001':
                    content += `- Use parameterized queries instead of string concatenation\n`;
                    content += `- Apply proper input validation and sanitization\n`;
                    content += `- Consider using an ORM (Object-Relational Mapping) library\n`;
                    content += `- **Further Reading**: [OWASP SQL Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)\n`;
                    break;
                    
                case 'SEC002':
                    content += `- Use textContent instead of innerHTML when displaying user-generated content\n`;
                    content += `- Apply proper output encoding/escaping\n`;
                    content += `- Consider using a sanitization library like DOMPurify\n`;
                    content += `- **Further Reading**: [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)\n`;
                    break;
                    
                case 'SEC003':
                    content += `- Move secrets to environment variables or a secure vault\n`;
                    content += `- Use a configuration file that is not committed to source control\n`;
                    content += `- Consider using a secrets management service\n`;
                    content += `- **Further Reading**: [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)\n`;
                    break;
                    
                default:
                    content += `- Review the code for security vulnerabilities\n`;
                    content += `- Apply security best practices\n`;
                    content += `- **Further Reading**: [OWASP Top Ten](https://owasp.org/www-project-top-ten/)\n`;
            }
        } else if (issue.rule.category === 'compliance') {
            // Compliance-related recommendations based on standard
            if (issue.rule.complianceStandards && issue.rule.complianceStandards.length > 0) {
                const standardId = issue.rule.complianceStandards[0].id.toLowerCase();
                
                if (standardId.includes('gdpr')) {
                    content += `- Ensure personal data is properly protected\n`;
                    content += `- Implement data minimization practices\n`;
                    content += `- Add proper consent mechanisms\n`;
                    content += `- **Further Reading**: [GDPR Official Text](https://gdpr-info.eu/)\n`;
                } else if (standardId.includes('hipaa')) {
                    content += `- Ensure protected health information (PHI) is properly safeguarded\n`;
                    content += `- Implement access controls and audit logs\n`;
                    content += `- Encrypt sensitive data at rest and in transit\n`;
                    content += `- **Further Reading**: [HIPAA Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/index.html)\n`;
                } else if (standardId.includes('soc2')) {
                    content += `- Implement proper logging and monitoring\n`;
                    content += `- Ensure data integrity through appropriate controls\n`;
                    content += `- Document security procedures and policies\n`;
                    content += `- **Further Reading**: [SOC 2 Compliance Guide](https://www.aicpa.org/interestareas/frc/assuranceadvisoryservices/sorhome.html)\n`;
                } else {
                    content += `- Review compliance requirements for your specific standard\n`;
                    content += `- Implement appropriate controls and safeguards\n`;
                    content += `- Document your compliance efforts\n`;
                }
            } else {
                content += `- Review applicable compliance standards\n`;
                content += `- Implement appropriate controls based on regulatory requirements\n`;
                content += `- Consider consulting with a compliance expert\n`;
            }
        }
        
        edit.insert(issueUri, new vscode.Position(0, 0), content);
        
        // Apply the edit
        await vscode.workspace.applyEdit(edit);
        
        // Show the document to the user
        await vscode.window.showTextDocument(issueDocument, { preview: true });
    });
    context.subscriptions.push(showIssueInfoCommand);

    // Register command to update security ruleset
    const updateRulesetCommand = vscode.commands.registerCommand('codeguard-ai.updateSecurityRuleset', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder found');
            return;
        }

        // Get experimental rules setting
        const config = vscode.workspace.getConfiguration('codeguardai');
        const includeExperimental = config.get<boolean>('includeExperimentalRules') || false;

        const success = await updateSecurityRuleset(workspaceFolders[0], {
            includeExperimental: includeExperimental
        });

        // If successful, rescan the workspace
        if (success) {
            await vscode.commands.executeCommand('codeguard-ai.scanWorkspace');
        }
    });
    context.subscriptions.push(updateRulesetCommand);

    // Register command to set ruleset URL
    const setRulesetUrlCommand = vscode.commands.registerCommand('codeguard-ai.setRulesetUrl', async () => {
        const config = vscode.workspace.getConfiguration('codeguardai');
        const currentUrl = config.get<string>('rulesetUrl') || 'https://api.codeguard-ai.com/rulesets/security/latest';
        
        const url = await vscode.window.showInputBox({
            prompt: 'Enter the URL for downloading security rulesets',
            placeHolder: 'https://api.example.com/rulesets/security',
            value: currentUrl
        });
        
        if (url) {
            try {
                await setRulesetUrl(url);
                vscode.window.showInformationMessage(`Ruleset URL set to: ${url}`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to set ruleset URL: ${error}`);
            }
        }
    });
    context.subscriptions.push(setRulesetUrlCommand);

    // Register status bar item to show when scanning is in progress
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = '$(shield) CodeGuard AI';
    statusBarItem.tooltip = 'Click to open CodeGuard AI Dashboard';
    statusBarItem.command = 'codeguard-ai.showDashboard';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Hook into diagnostics provider to collect issues
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => updateDiagnosticsAndCollectIssues(event.document)),
        vscode.workspace.onDidOpenTextDocument(document => updateDiagnosticsAndCollectIssues(document)),
        vscode.workspace.onDidSaveTextDocument(document => updateDiagnosticsAndCollectIssues(document))
    );

    // Check for ruleset updates if auto-update is enabled
    const autoUpdateEnabled = vscode.workspace.getConfiguration('codeguardai').get<boolean>('autoUpdateRulesets');
    if (autoUpdateEnabled) {
        checkForRulesetUpdates();
    }

    context.subscriptions.push(
        vscode.window.registerWebviewPanelSerializer('codeguard-ai.dashboard', {
            async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
                webviewPanel.webview.onDidReceiveMessage(async (message) => {
                    if (message.command === 'openFile') {
                        const { file, line, character } = message;
                        const document = await vscode.workspace.openTextDocument(file);
                        const editor = await vscode.window.showTextDocument(document);
                        const position = new vscode.Position(line, character);
                        editor.selection = new vscode.Selection(position, position);
                        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
                    }
                });
            }
        })
    );

    console.log('CodeGuard AI extension activated');
}

/**
 * Checks if ruleset updates are needed and prompts the user to update if yes
 */
async function checkForRulesetUpdates(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return;
    }

    try {
        // Check when the ruleset was last updated
        const lastUpdated = await getLastUpdateTimestamp(workspaceFolders[0]);
        
        if (!lastUpdated) {
            // No previous update, ask if user wants to download rules
            const download = await vscode.window.showInformationMessage(
                'Would you like to download the latest security ruleset definitions?',
                'Yes', 'No'
            );
            
            if (download === 'Yes') {
                vscode.commands.executeCommand('codeguard-ai.updateSecurityRuleset');
            }
        } else {
            const lastUpdateDate = new Date(lastUpdated);
            const now = new Date();
            const differenceInDays = Math.floor((now.getTime() - lastUpdateDate.getTime()) / (1000 * 3600 * 24));
            
            // Check if it's been more than 7 days since the last update
            if (differenceInDays > 7) {
                const update = await vscode.window.showInformationMessage(
                    `Your security ruleset is ${differenceInDays} days old. Would you like to check for updates?`,
                    'Yes', 'No', 'Don\'t Ask Again'
                );
                
                if (update === 'Yes') {
                    vscode.commands.executeCommand('codeguard-ai.updateSecurityRuleset');
                } else if (update === 'Don\'t Ask Again') {
                    // Disable auto-update setting
                    await vscode.workspace.getConfiguration('codeguardai').update(
                        'autoUpdateRulesets', 
                        false, 
                        vscode.ConfigurationTarget.Global
                    );
                }
            }
        }
    } catch (error) {
        console.error('Error checking for ruleset updates:', error);
    }
}

/**
 * Updates diagnostics and collects issues for the dashboard
 * @param document The document to scan
 */
async function updateDiagnosticsAndCollectIssues(document: vscode.TextDocument): Promise<void> {
    // This function will need to be implemented to extract issues from the diagnostics
    // For now, we'll use mock data
    
    // Call the regular diagnostics update
    await updateDiagnostics(document);
    
    // For demonstration, extract issues from the document
    // In a real implementation, you would get the issues from the scanner results
    const securityIssues = await scanDocumentForIssues(document, 'security');
    const complianceIssues = await scanDocumentForIssues(document, 'compliance');
    
    // Add to our collections, avoiding duplicates
    for (const issue of securityIssues) {
        if (!allSecurityIssues.some(i => i.id === issue.id)) {
            allSecurityIssues.push(issue);
        }
    }
    
    for (const issue of complianceIssues) {
        if (!allComplianceIssues.some(i => i.id === issue.id)) {
            allComplianceIssues.push(issue);
        }
    }
}

/**
 * Temporary function to scan a document for issues (to be replaced with actual scanner integration)
 * @param document The document to scan
 * @param type The type of issues to scan for
 * @returns An array of issues
 */
async function scanDocumentForIssues(document: vscode.TextDocument, type: 'security' | 'compliance'): Promise<any[]> {
    // Import the actual scanning functions
    const { scanDocumentForSecurityIssues } = await import('./security/securityScanner');
    const { scanDocumentForComplianceIssues } = await import('./compliance/complianceScanner');
    
    // This will be replaced with actual scanner calls
    if (type === 'security') {
        return await scanDocumentForSecurityIssues(document);
    } else {
        return await scanDocumentForComplianceIssues(document);
    }
}

/**
 * This method is called when your extension is deactivated
 */
export function deactivate() {
    // Clear all diagnostics when the extension is deactivated
    clearDiagnostics();
    
    // Also clean up the dashboard if it exists
    if (DashboardPanel.currentPanel) {
        DashboardPanel.currentPanel.dispose();
    }
}
