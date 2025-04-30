import * as vscode from 'vscode';
import { Issue } from '../models/types';
import { scanDocumentForSecurityIssues } from '../security/securityScanner';
import { scanDocumentForComplianceIssues } from '../compliance/complianceScanner';
import { getEnabledStandards, loadConfigFile } from './configManager';

/**
 * Map of severities to VS Code diagnostic severities
 */
const severityMap: Record<string, vscode.DiagnosticSeverity> = {
    'critical': vscode.DiagnosticSeverity.Error,
    'high': vscode.DiagnosticSeverity.Error,
    'medium': vscode.DiagnosticSeverity.Warning,
    'low': vscode.DiagnosticSeverity.Information,
    'info': vscode.DiagnosticSeverity.Information
};

/**
 * Diagnostic collection for security issues
 */
let securityDiagnostics: vscode.DiagnosticCollection;

/**
 * Diagnostic collection for compliance issues
 */
let complianceDiagnostics: vscode.DiagnosticCollection;

/**
 * Initializes the diagnostics system
 * @param context The extension context
 */
export function initDiagnostics(context: vscode.ExtensionContext): void {
    // Create diagnostic collections
    securityDiagnostics = vscode.languages.createDiagnosticCollection('codeguard-security');
    complianceDiagnostics = vscode.languages.createDiagnosticCollection('codeguard-compliance');
    
    // Register the diagnostic collections with the context
    context.subscriptions.push(securityDiagnostics);
    context.subscriptions.push(complianceDiagnostics);
    
    // Set up text document change listeners
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(document => updateDiagnostics(document)),
        vscode.workspace.onDidChangeTextDocument(event => updateDiagnostics(event.document)),
        vscode.workspace.onDidSaveTextDocument(document => updateDiagnostics(document))
    );
    
    // Check all open documents
    vscode.workspace.textDocuments.forEach(document => updateDiagnostics(document));
}

/**
 * Updates diagnostics for a document
 * @param document The document to update diagnostics for
 */
export async function updateDiagnostics(document: vscode.TextDocument): Promise<void> {
    // Skip non-file documents and files that are too large
    if (document.uri.scheme !== 'file' || document.getText().length > 1000000) {
        return;
    }
    
    try {
        // Get workspace configuration
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        let enabledStandards: string[] = [];
        
        if (workspaceFolder) {
            const config = await loadConfigFile(workspaceFolder);
            if (config) {
                enabledStandards = getEnabledStandards(config);
            }
        }
        
        // Scan for security and compliance issues
        const securityIssues = await scanDocumentForSecurityIssues(document);
        const complianceIssues = await scanDocumentForComplianceIssues(document, enabledStandards);
        
        // Update diagnostics
        updateSecurityDiagnostics(document.uri, securityIssues);
        updateComplianceDiagnostics(document.uri, complianceIssues);
    } catch (error) {
        console.error('Error updating diagnostics:', error);
    }
}

/**
 * Updates security diagnostics for a document
 * @param uri The document URI
 * @param issues The security issues to display
 */
function updateSecurityDiagnostics(uri: vscode.Uri, issues: Issue[]): void {
    const diagnostics: vscode.Diagnostic[] = issues.map(issue => {
        const range = new vscode.Range(
            issue.location.position.line,
            issue.location.position.character,
            issue.location.endPosition?.line ?? issue.location.position.line,
            issue.location.endPosition?.character ?? issue.location.position.character + 1
        );
        
        const diagnostic = new vscode.Diagnostic(
            range,
            `${issue.message}: ${issue.description}`,
            severityMap[issue.severity] || vscode.DiagnosticSeverity.Warning
        );
        
        diagnostic.code = issue.rule.id;
        diagnostic.source = 'CodeGuard Security';
        diagnostic.relatedInformation = issue.suggestedFix ? [
            new vscode.DiagnosticRelatedInformation(
                new vscode.Location(uri, range),
                issue.suggestedFix
            )
        ] : undefined;
        
        return diagnostic;
    });
    
    securityDiagnostics.set(uri, diagnostics);
}

/**
 * Updates compliance diagnostics for a document
 * @param uri The document URI
 * @param issues The compliance issues to display
 */
function updateComplianceDiagnostics(uri: vscode.Uri, issues: Issue[]): void {
    const diagnostics: vscode.Diagnostic[] = issues.map(issue => {
        const range = new vscode.Range(
            issue.location.position.line,
            issue.location.position.character,
            issue.location.endPosition?.line ?? issue.location.position.line,
            issue.location.endPosition?.character ?? issue.location.position.character + 1
        );
        
        const diagnostic = new vscode.Diagnostic(
            range,
            `${issue.message}: ${issue.description}`,
            severityMap[issue.severity] || vscode.DiagnosticSeverity.Warning
        );
        
        diagnostic.code = issue.rule.id;
        diagnostic.source = 'CodeGuard Compliance';
        
        // Add compliance standards to the message
        if (issue.rule.complianceStandards && issue.rule.complianceStandards.length > 0) {
            const standards = issue.rule.complianceStandards.map(std => std.name).join(', ');
            diagnostic.message += ` (${standards})`;
        }
        
        diagnostic.relatedInformation = issue.suggestedFix ? [
            new vscode.DiagnosticRelatedInformation(
                new vscode.Location(uri, range),
                issue.suggestedFix
            )
        ] : undefined;
        
        return diagnostic;
    });
    
    complianceDiagnostics.set(uri, diagnostics);
}

/**
 * Clears all diagnostics
 */
export function clearDiagnostics(): void {
    securityDiagnostics.clear();
    complianceDiagnostics.clear();
}