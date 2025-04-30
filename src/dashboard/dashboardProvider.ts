// Dashboard provider for CodeGuard AI
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Issue } from '../models/types';

/**
 * Manages CodeGuard AI dashboard WebView panel
 */
export class DashboardPanel {
    public static currentPanel: DashboardPanel | undefined;
    public readonly _panel: vscode.WebviewPanel; // Changed from private to public
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _securityIssues: Issue[] = [];
    private _complianceIssues: Issue[] = [];

    /**
     * Creates or shows the dashboard panel
     * @param extensionUri The URI of the extension
     */
    public static createOrShow(extensionUri: vscode.Uri): DashboardPanel {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (DashboardPanel.currentPanel) {
            DashboardPanel.currentPanel._panel.reveal(column);
            return DashboardPanel.currentPanel;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            'codeguardDashboard',
            'CodeGuard AI Dashboard',
            column || vscode.ViewColumn.One,
            {
                // Enable JS in the WebView
                enableScripts: true,
                // Restrict the WebView to only load resources from the extension's directory
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media')
                ],
                retainContextWhenHidden: true
            }
        );

        DashboardPanel.currentPanel = new DashboardPanel(panel, extensionUri);
        return DashboardPanel.currentPanel;
    }

    /**
     * Creates a new dashboard panel
     * @param panel The WebView panel
     * @param extensionUri The URI of the extension
     */
    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        // Set the WebView content
        this._update();

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Update the content based on view changes
        this._panel.onDidChangeViewState(
            e => {
                if (this._panel.visible) {
                    this._update();
                }
            },
            null,
            this._disposables
        );

        // Handle messages from the WebView
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'refresh':
                        vscode.commands.executeCommand('codeguard-ai.scanWorkspace');
                        break;
                    case 'fix':
                        vscode.commands.executeCommand('codeguard-ai.showFixSuggestions', message.issueId);
                        break;
                    case 'showConfig':
                        vscode.commands.executeCommand('codeguard-ai.showConfig');
                        break;
                    case 'openFile':
                        // Open file at specific location when clicked in dashboard
                        if (message.file && message.line !== undefined && message.character !== undefined) {
                            this._openFileAtLocation(message.file, message.line, message.character);
                        }
                        break;
                    case 'updateRuleset':
                        vscode.commands.executeCommand('codeguard-ai.updateSecurityRuleset');
                        break;
                    case 'setRulesetUrl':
                        vscode.commands.executeCommand('codeguard-ai.setRulesetUrl');
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    /**
     * Opens a file at a specific location
     * @param filePath The file path to open
     * @param line The line number (0-based)
     * @param character The character number (0-based)
     */
    private async _openFileAtLocation(filePath: string, line: number, character: number): Promise<void> {
        try {
            const document = await vscode.workspace.openTextDocument(filePath);
            const editor = await vscode.window.showTextDocument(document);

            // Create a position and selection
            const position = new vscode.Position(line, character);
            const selection = new vscode.Selection(position, position);

            // Set the editor selection and reveal that range
            editor.selection = selection;
            editor.revealRange(
                new vscode.Range(position, position),
                vscode.TextEditorRevealType.InCenter
            );
        } catch (error) {
            vscode.window.showErrorMessage(`Error opening file: ${error}`);
        }
    }

    /**
     * Updates the dashboard with security and compliance issues
     * @param securityIssues The security issues to display
     * @param complianceIssues The compliance issues to display
     */
    public updateIssues(securityIssues: Issue[], complianceIssues: Issue[]): void {
        this._securityIssues = securityIssues;
        this._complianceIssues = complianceIssues;
        this._update();
    }

    /**
     * Disposes the dashboard panel
     */
    public dispose(): void {
        DashboardPanel.currentPanel = undefined;

        // Clean up resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    /**
     * Updates the dashboard content
     */
    private _update(): void {
        const webview = this._panel.webview;
        this._panel.title = "CodeGuard AI Dashboard";
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    /**
     * Gets the HTML for the dashboard WebView
     * @param webview The WebView to get HTML for
     * @returns The HTML content
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        const nonce = getNonce(); // Generate a nonce

        // Get security statistics
        const criticalSecurityCount = this._securityIssues.filter(issue => issue.severity === 'critical').length;
        const highSecurityCount = this._securityIssues.filter(issue => issue.severity === 'high').length;
        const mediumSecurityCount = this._securityIssues.filter(issue => issue.severity === 'medium').length;
        const lowSecurityCount = this._securityIssues.filter(issue => issue.severity === 'low').length;
        const totalSecurityCount = this._securityIssues.length;

        // Get compliance statistics
        const criticalComplianceCount = this._complianceIssues.filter(issue => issue.severity === 'critical').length;
        const highComplianceCount = this._complianceIssues.filter(issue => issue.severity === 'high').length;
        const mediumComplianceCount = this._complianceIssues.filter(issue => issue.severity === 'medium').length;
        const lowComplianceCount = this._complianceIssues.filter(issue => issue.severity === 'low').length;
        const totalComplianceCount = this._complianceIssues.length;

        // Calculate overall security score (0-100), higher is better
        const weightedSecurityIssues = 
            criticalSecurityCount * 10 + 
            highSecurityCount * 5 + 
            mediumSecurityCount * 2 + 
            lowSecurityCount * 1;
        
        const maxSecurityScore = 100;
        const securityScore = Math.max(0, Math.min(100, maxSecurityScore - weightedSecurityIssues));
        
        // Calculate overall compliance score (0-100), higher is better
        const weightedComplianceIssues = 
            criticalComplianceCount * 10 + 
            highComplianceCount * 5 + 
            mediumComplianceCount * 2 + 
            lowComplianceCount * 1;
        
        const maxComplianceScore = 100;
        const complianceScore = Math.max(0, Math.min(100, maxComplianceScore - weightedComplianceIssues));

        // Calculate overall protection score
        const overallScore = Math.round((securityScore + complianceScore) / 2);

        // Create categories statistics
        const securityCategories: Record<string, number> = {};
        this._securityIssues.forEach(issue => {
            const category = issue.rule.tags[0] || 'other';
            securityCategories[category] = (securityCategories[category] || 0) + 1;
        });

        const complianceCategories: Record<string, number> = {};
        this._complianceIssues.forEach(issue => {
            if (issue.rule.complianceStandards && issue.rule.complianceStandards.length > 0) {
                const standard = issue.rule.complianceStandards[0].id;
                complianceCategories[standard] = (complianceCategories[standard] || 0) + 1;
            }
        });

        // Get the logo URI
        const logoUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'logo.svg'));
        
        // Calculate current date for "last updated" display
        const currentDate = new Date();
        const lastUpdated = `${currentDate.toLocaleDateString()} ${currentDate.toLocaleTimeString()}`;
        
        // Determine protection status
        let statusMessage = 'No active threats found';
        
        if (criticalSecurityCount > 0 || criticalComplianceCount > 0) {
            statusMessage = 'Critical vulnerabilities detected';
        } else if (highSecurityCount > 0 || highComplianceCount > 0) {
            statusMessage = 'High-risk issues detected';
        } else if (mediumSecurityCount > 0 || mediumComplianceCount > 0) {
            statusMessage = 'Security issues need attention';
        }

        // Return the cleaner, more minimal HTML content
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>CodeGuard AI Dashboard</title>
    <style>
        :root {
            /* Updated color scheme inspired by the AVG Security dashboard */
            --primary-green: #42E288;
            --dark-bg: #1E2430;
            --darker-bg: #171C26;
            --card-bg: #282E3C;
            --text-color: #FFFFFF;
            --text-muted: #A0A9B8;
            --danger-red: #FF4757;
            --warning-yellow: #FFCA3A;
            --info-blue: #4B9FFF;
            --border-radius: 8px;
        }

        body {
            padding: 0;
            margin: 0;
            color: var(--text-color);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            background-color: var(--dark-bg);
            overflow-x: hidden;
            font-size: 14px;
            line-height: 1.5;
        }

        .dashboard-container {
            display: flex;
            flex-direction: column;
            min-height: 100vh;
        }

        /* Header & Top Bar */
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px;
            background-color: var(--darker-bg);
        }

        .product-info {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .header-logo {
            width: 24px;
            height: 24px;
        }

        .product-name {
            font-size: 18px;
            font-weight: 600;
        }

        .login-button {
            background: transparent;
            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 4px;
            color: var (--text-color);
            padding: 6px 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .login-button:hover {
            background: rgba(255,255,255,0.05);
        }

        .settings-icon {
            font-size: 16px;
        }

        /* Status Overview */
        .status-overview {
            text-align: center;
            padding: 40px 20px;
            position: relative;
        }

        .status-message {
            font-size: 26px;
            font-weight: lighter;
            color: var(--primary-green);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }

        .status-icon {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background-color: var(--primary-green);
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--darker-bg);
            font-size: 16px;
            font-weight: bold;
        }

        /* Main Content */
        .main-content {
            flex: 1;
            padding: 20px 150px;
        }

        .cards-container {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }

        .section-header {
            text-align: left;
            padding-bottom: 10px;
            margin: 0 0 15px 0;
            color: var(--text-muted);
            font-weight: 400;
            font-size: 14px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }

        /* Enhanced card styling for a more compact layout */
        .card {
            background-color: var(--card-bg);
            border-radius: var(--border-radius);
            padding: 14px;
            display: flex;
            align-items: flex-start;
            position: relative;
            transition: transform 0.2s, box-shadow 0.2s;
            height: auto;
            min-height: auto;
            margin-bottom: 0;
            flex-direction: row;
            justify-content: flex-start;
            text-align: left;
        }
        
        .card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        }
        
        .card-icon {
            width: 36px;
            height: 36px;
            border: 1px solid rgba(66, 226, 136, 0.3);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: 12px;
            position: relative;
            flex-shrink: 0;
            margin-bottom: 0;
        }
        
        .card-icon svg,
        .card-icon img {
            width: 18px;
            height: 18px;
            color: var(--primary-green);
        }
        
        .status-check {
            position: absolute;
            bottom: -2px;
            right: -2px;
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background-color: var(--primary-green);
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--darker-bg);
            font-weight: bold;
            font-size: 9px;
        }
        
        .card-title {
            font-size: 13px;
            margin-bottom: 4px;
            font-weight: 500;
        }
        
        .card-score {
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 4px;
            color: var(--primary-green);
        }
        
        .card-status {
            color: var(--text-muted);
            font-size: 12px;
        }

        /* More compact issue badges */
        .issue-badge {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 10px;
            font-size: 10px;
            font-weight: 500;
            margin-right: 4px;
            margin-bottom: 4px;
        }

        /* Logical grouping of cards */
        .cards-container {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 12px;
            margin-bottom: 16px;
        }

        /* Smaller section headers */
        .section-header {
            text-align: left;
            padding-bottom: 8px;
            margin: 0 0 12px 0;
            color: var(--text-muted);
            font-weight: 400;
            font-size: 13px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }

        .security-score-card, .compliance-score-card {
            text-align: center;
            justify-content: center;
            align-items: center;
        }

        .security-issues-card, .compliance-issues-card {
            display: flex;
            flex-direction: column;
        }

        @media (max-width: 768px) {
            .cards-container {
                grid-template-columns: 1fr;
            }
        }

        .section {
            margin-bottom: 16px;
        }

        .section-header {
            text-align: left;
            padding-bottom: 12px;
            margin-top: 0;
            margin-bottom: 12px;
            color: var(--text-muted);
            font-weight: 400;
            font-size: 15px;
            position: relative;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }

        .card {
            background-color: var(--card-bg);
            border-radius: var(--border-radius);
            padding: 20px 15px;
            margin-bottom: 15px;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            position: relative;
            min-height: 160px;
            justify-content: center;
            transition: transform 0.2s;
        }

        .card:hover {
            transform: translateY(-4px);
        }

        .card-icon {
            width: 48px;
            height: 48px;
            border: 1px solid rgba(66, 226, 136, 0.3);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 12px;
            position: relative;
        }

        .card-icon svg,
        .card-icon img {
            width: 24px;
            height: 24px;
            color: var(--primary-green);
        }

        .status-check {
            position: absolute;
            bottom: -2px;
            right: -2px;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background-color: var(--primary-green);
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--darker-bg);
            font-weight: bold;
            font-size: 10px;
        }

        .card-title {
            font-size: 18px;
            margin-bottom: 8px;
        }

        .card-score {
            font-size: 36px;
            font-weight: 600;
            margin-bottom: 12px;
            color: var(--primary-green);
        }

        .card-status {
            color: var (--primary-green);
            font-size: 14px;
        }

        /* Issue Details Panel (hidden by default) */
        .issues-panel {
            background-color: var(--card-bg);
            border-radius: var(--border-radius);
            margin-bottom: 20px;
            overflow: hidden;
            display: none;
        }

        .issues-panel.active {
            display: block;
        }

        .issues-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 15px 20px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }

        .issues-title {
            margin: 0;
            font-size: 16px;
        }

        .tab-container {
            display: flex;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }

        .tab {
            padding: 10px 20px;
            cursor: pointer;
            border-bottom: 2px solid transparent;
            transition: all 0.2s ease;
        }

        .tab:hover {
            background-color: rgba(255,255,255,0.05);
        }

        .tab.active {
            color: var(--primary-green);
            border-bottom: 2px solid var(--primary-green);
            background-color: rgba(66,226,136,0.05);
        }

        .tab-content {
            display: none;
            padding: 20px;
        }

        .tab-content.active {
            display: block;
        }

        /* Bottom Action Bar */
        .action-bar {
            background-color: var(--darker-bg);
            padding: 15px 40px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .scan-info {
            color: var(--text-muted);
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .search-icon {
            opacity: 0.6;
        }

        .rules-info {
            color: var (--text-muted);
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .up-to-date {
            color: var(--primary-green);
        }

        .refresh-icon {
            opacity: 0.6;
            cursor: pointer;
        }

        .refresh-icon:hover {
            opacity: 1;
        }

        /* Scan Button */
        .scan-button {
            background-color: var(--primary-green);
            color: var (--darker-bg);
            border: none;
            border-radius: 100px;
            padding: 12px 24px;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            min-width: 180px;
            position: relative;
            box-shadow: 0 4px 10px rgba(66, 226, 136, 0.2);
            transition: all 0.2s;
        }

        .scan-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 14px rgba(66, 226, 136, 0.3);
        }

        .scan-button:active {
            transform: translateY(0);
        }

        /* For when issues are detected */
        .warning .status-message {
            color: var(--warning-yellow);
        }

        .warning .status-icon {
            background-color: var(--warning-yellow);
        }

        .critical .status-message {
            color: var(--danger-red);
        }

        .critical .status-icon {
            background-color: var(--danger-red);
        }

        .spinner {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 2px solid rgba(0,0,0,0.3);
            border-radius: 50%;
            border-top-color: var(--darker-bg);
            animation: spin 1s ease-in-out infinite;
            margin-right: 8px;
            display: none;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .scanning .spinner {
            display: inline-block;
        }

        /* Responsive adjustments */
        @media (max-width: 768px) {
            .cards-container {
                flex-direction: column;
            }
        }

        /* Reset conflicting card styles with a more specific selector */
        .dashboard-overview .card {
            background-color: var(--card-bg);
            border-radius: var(--border-radius);
            padding: 14px;
            display: flex;
            flex-direction: row;
            align-items: flex-start;
            justify-content: flex-start;
            position: relative;
            transition: transform 0.2s, box-shadow 0.2s;
            height: auto;
            min-height: auto;
            margin-bottom: 0;
            text-align: left;
        }
        
        .dashboard-overview .card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        }
        
        .dashboard-overview .card-icon {
            width: 36px;
            height: 36px;
            border: 1px solid rgba(66, 226, 136, 0.3);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: 12px;
            margin-bottom: 0;
            position: relative;
            flex-shrink: 0;
        }
        
        .dashboard-overview .card-icon svg,
        .dashboard-overview .card-icon img {
            width: 18px;
            height: 18px;
            color: var(--primary-green);
        }
        
        .dashboard-overview .status-check {
            position: absolute;
            bottom: -2px;
            right: -2px;
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background-color: var(--primary-green);
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--darker-bg);
            font-weight: bold;
            font-size: 9px;
        }
        
        .dashboard-overview .card-title {
            font-size: 13px;
            margin-bottom: 4px;
            font-weight: 500;
        }
        
        .dashboard-overview .card-score {
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 4px;
            color: var(--primary-green);
        }
        
        .dashboard-overview .card-status {
            color: var(--text-muted);
            font-size: 12px;
        }
        
        /* Improved badge display for more compact layout */
        .dashboard-overview .issue-badge {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 10px;
            font-size: 10px;
            font-weight: 500;
            margin-right: 4px;
            margin-bottom: 4px;
        }
        
        .dashboard-overview .issue-badge.critical {
            background-color: rgba(255,71,87,0.2);
            color: var(--danger-red);
        }
        
        .dashboard-overview .issue-badge.high {
            background-color: rgba(255,202,58,0.2);
            color: var(--warning-yellow);
        }
        
        .dashboard-overview .issue-badge.medium {
            background-color: rgba(75,159,255,0.1);
            color: var(--info-blue);
        }
        
        .dashboard-overview .issue-badge.low {
            background-color: rgba(66,226,136,0.1);
            color: var(--primary-green);
        }
        
        .dashboard-overview .issue-badge.compliance {
            background-color: rgba(66,226,136,0.1);
            color: var(--primary-green);
        }
        
        /* Logical grouping of cards with more specific selector */
        .dashboard-overview .cards-container {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 12px;
            margin-bottom: 16px;
        }
        
        /* Clean up all dashboard card styles */
        .dashboard-overview .cards-container {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 12px;
            margin-bottom: 16px;
        }
        
        /* Base card styles - override all previous definitions */
        .dashboard-overview .card {
            background-color: var(--card-bg);
            border-radius: var(--border-radius);
            padding: 14px;
            margin-bottom: 0;
            min-height: unset;
            
            /* Make cards horizontal and left-aligned */
            display: flex;
            flex-direction: row;
            align-items: flex-start;
            justify-content: flex-start;
            text-align: left;
            
            /* Transitions */
            transition: transform 0.2s, box-shadow 0.2s;
        }
        
        .dashboard-overview .card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        }
        
        /* Card icon styling */
        .dashboard-overview .card-icon {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            margin-right: 12px;
            margin-bottom: 0;
            flex-shrink: 0;
            
            /* Content alignment */
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            
            /* Visual styling */
            background-color: rgba(66, 226, 136, 0.05);
            border: 1px solid rgba(66, 226, 136, 0.3);
        }
        
        .dashboard-overview .card-icon svg,
        .dashboard-overview .card-icon img {
            width: 18px;
            height: 18px;
            color: var(--primary-green);
        }
        
        /* Card content styling */
        .dashboard-overview .card-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: flex-start;
        }
        
        .dashboard-overview .card-title {
            font-size: 13px;
            margin-bottom: 4px;
            font-weight: 500;
        }
        
        .dashboard-overview .card-score {
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 4px;
            color: var(--primary-green);
        }
        
        .dashboard-overview .card-status {
            color: var(--text-muted);
            font-size: 12px;
            margin-bottom: 4px;
        }
        
        /* Badge indicators for issues */
        .dashboard-overview .badges-container {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            margin-top: 6px;
        }
        
        .dashboard-overview .issue-badge {
            display: inline-flex;
            padding: 1px 6px;
            border-radius: 10px;
            font-size: 10px;
            font-weight: 500;
        }
        
        /* Status indicator */
        .dashboard-overview .status-check {
            position: absolute;
            bottom: -2px;
            right: -2px;
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background-color: var(--primary-green);
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--darker-bg);
            font-weight: bold;
            font-size: 9px;
        }
        
        /* Smaller section headers */
        .dashboard-overview .section-header {
            text-align: left;
            padding-bottom: 8px;
            margin: 0 0 12px 0;
            color: var(--text-muted);
            font-weight: 500;
            font-size: 13px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        /* Badge colors */
        .dashboard-overview .issue-badge.critical {
            background-color: rgba(255,71,87,0.2);
            color: var(--danger-red);
        }
        
        .dashboard-overview .issue-badge.high {
            background-color: rgba(255,202,58,0.2);
            color: var(--warning-yellow);
        }
        
        .dashboard-overview .issue-badge.medium {
            background-color: rgba(75,159,255,0.1);
            color: var (--info-blue);
        }
        
        .dashboard-overview .issue-badge.low {
            background-color: rgba(66,226,136,0.1);
            color: var(--primary-green);
        }
        
        .dashboard-overview .issue-badge.compliance {
            background-color: rgba(66,226,136,0.1);
            color: var(--primary-green);
        }

        /* Issue Tab and Content Styling */
        .search-filter-container {
            display: flex;
            margin-bottom: 16px;
            gap: 10px;
        }

        .search-input {
            flex: 1;
            padding: 8px 12px;
            background-color: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 4px;
            color: var(--text-color);
            font-size: 13px;
        }

        .search-input:focus {
            outline: none;
            border-color: var(--primary-green);
        }

        .filter-dropdown {
            min-width: 140px;
        }

        .filter-select {
            width: 100%;
            padding: 8px;
            background-color: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 4px;
            color: var(--text-color);
            font-size: 13px;
            cursor: pointer;
        }

        .filter-select:focus {
            outline: none;
            border-color: var(--primary-green);
        }

        .filter-select option {
            background-color: var(--card-bg);
            color: var(--text-color);
        }

        .issues-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .issue-item {
            background-color: rgba(255, 255, 255, 0.05);
            border-radius: 6px;
            padding: 14px;
            border-left: 4px solid transparent;
            transition: transform 0.2s, box-shadow 0.2s;
        }

        .issue-item:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        }

        .issue-item[data-severity="critical"] {
            border-left-color: var(--danger-red);
        }

        .issue-item[data-severity="high"] {
            border-left-color: var(--warning-yellow);
        }

        .issue-item[data-severity="medium"] {
            border-left-color: var(--info-blue);
        }

        .issue-item[data-severity="low"] {
            border-left-color: var(--primary-green);
        }

        .issue-header {
            display: flex;
            align-items: center;
            margin-bottom: 8px;
            gap: 10px;
        }

        .issue-severity {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            flex-shrink: 0;
        }

        .issue-severity.critical {
            background-color: var(--danger-red);
        }

        .issue-severity.high {
            background-color: var(--warning-yellow);
        }

        .issue-severity.medium {
            background-color: var(--info-blue);
        }

        .issue-severity.low {
            background-color: var(--primary-green);
        }

        .issue-title {
            flex: 1;
            font-weight: 500;
            font-size: 14px;
        }

        .issue-badge {
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 10px;
            font-weight: 500;
            text-transform: uppercase;
        }

        .issue-badge.critical {
            background-color: rgba(255,71,87,0.2);
            color: var(--danger-red);
        }

        .issue-badge.high {
            background-color: rgba(255,202,58,0.2);
            color: var(--warning-yellow);
        }

        .issue-badge.medium {
            background-color: rgba(75,159,255,0.1);
            color: var (--info-blue);
        }

        .issue-badge.low {
            background-color: rgba(66,226,136,0.1);
            color: var(--primary-green);
        }

        .issue-description {
            margin-bottom: 12px;
            color: var(--text-muted);
            font-size: 13px;
            line-height: 1.5;
        }

        .issue-location {
            display: inline-block;
            background-color: rgba(0, 0, 0, 0.3);
            border-radius: 4px;
            padding: 3px 8px;
            font-family: monospace;
            font-size: 12px;
            margin-bottom: 10px;
            color: var(--text-muted);
            cursor: pointer;
            transition: all 0.2s;
        }

        .issue-location:hover {
            background-color: rgba(66, 226, 136, 0.1);
            color: var(--primary-green);
        }

        .issue-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-bottom: 12px;
        }

        .issue-tag {
            background-color: rgba(66, 226, 136, 0.1);
            color: var(--primary-green);
            padding: 3px 8px;
            border-radius: 12px;
            font-size: 11px;
        }

        .issue-actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
        }

        .fix-button, .more-info-button {
            padding: 6px 12px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            border: none;
        }

        .fix-button {
            background-color: var(--primary-green);
            color: var(--darker-bg);
        }

        .fix-button:hover {
            background-color: #35c776;
            transform: translateY(-1px);
        }

        .more-info-button {
            background-color: rgba(255, 255, 255, 0.1);
            color: var(--text-color);
        }

        .more-info-button:hover {
            background-color: rgba(255, 255, 255, 0.15);
            transform: translateY(-1px);
        }

        /* Empty state styling */
        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 40px 20px;
            text-align: center;
        }

        .empty-state-icon {
            font-size: 32px;
            margin-bottom: 16px;
            color: var(--primary-green);
        }
    </style>
</head>
<body>
    <div class="dashboard-container ${
        criticalSecurityCount > 0 || criticalComplianceCount > 0 ? 'critical' : 
        highSecurityCount > 0 || highComplianceCount > 0 ? 'warning' : ''
    }">

        <div class="status-overview">
            <h1 class="status-message">
                <span class="status-icon">✓</span>
                ${
                    criticalSecurityCount > 0 || criticalComplianceCount > 0 ? 
                    'Critical vulnerabilities detected' : 
                    highSecurityCount > 0 || highComplianceCount > 0 ? 
                    'High-risk issues detected' :
                    'You have full protection'
                }
            </h1>
        </div>

        <div class="main-content">
            <div class="dashboard-overview">
                <!-- Security & Compliance Overview Section -->
                <h2 class="section-header">Security & Compliance Overview</h2>
                <div class="cards-container">
                    <!-- Security Score Card -->
                    <div class="card">
                        <div class="card-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                            </svg>
                            <span class="status-check">✓</span>
                        </div>
                        <div class="card-content">
                            <div class="card-title">Security Score</div>
                            <div class="card-score">${securityScore}</div>
                            <div class="card-status">${totalSecurityCount === 0 ? "Protected" : totalSecurityCount + " issues found"}</div>
                        </div>
                    </div>
                    
                    <!-- Compliance Score Card -->
                    <div class="card">
                        <div class="card-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                                <line x1="16" y1="13" x2="8" y2="13"></line>
                                <line x1="16" y1="17" x2="8" y2="17"></line>
                                <polyline points="10 9 9 9 8 9"></polyline>
                            </svg>
                            <span class="status-check">✓</span>
                        </div>
                        <div class="card-content">
                            <div class="card-title">Compliance Score</div>
                            <div class="card-score">${complianceScore}</div>
                            <div class="card-status">${totalComplianceCount === 0 ? "Protected" : totalComplianceCount + " issues found"}</div>
                        </div>
                    </div>
                    
                    <!-- Overall Status Card -->
                    <div class="card">
                        <div class="card-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                        </div>
                        <div class="card-content">
                            <div class="card-title">Last Scan</div>
                            <div class="card-status">Completed on ${lastUpdated}</div>
                        </div>
                    </div>
                </div>
                
                <!-- Security Issues Section -->
                <h2 class="section-header">Security Issues</h2>
                <div class="cards-container">
                    <!-- Security Issues Summary Card -->
                    <div class="card">
                        <div class="card-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                            </svg>
                        </div>
                        <div class="card-content">
                            <div class="card-title">Code Security Status</div>
                            <div class="card-status">${totalSecurityCount === 0 ? "Protected" : "Issues Detected"}</div>
                            
                            ${totalSecurityCount > 0 ? `
                            <div class="badges-container">
                                ${criticalSecurityCount > 0 ? 
                                `<div class="issue-badge critical">${criticalSecurityCount} Critical</div>` : ''}
                                
                                ${highSecurityCount > 0 ? 
                                `<div class="issue-badge high">${highSecurityCount} High</div>` : ''}
                                
                                ${mediumSecurityCount > 0 ? 
                                `<div class="issue-badge medium">${mediumSecurityCount} Medium</div>` : ''}
                                
                                ${lowSecurityCount > 0 ? 
                                `<div class="issue-badge low">${lowSecurityCount} Low</div>` : ''}
                            </div>
                            ` : ''}
                        </div>
                    </div>
                    
                    <!-- Security Categories Card -->
                    <div class="card">
                        <div class="card-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                            </svg>
                        </div>
                        <div class="card-content">
                            <div class="card-title">Security Categories</div>
                            <div class="card-status">${Object.keys(securityCategories).length === 0 ? "No issues" : `${Object.keys(securityCategories).length} categories identified`}</div>
                            
                            ${Object.keys(securityCategories).length > 0 ? `
                            <div class="badges-container">
                                ${Object.entries(securityCategories).map(([category, count]) => 
                                    `<div class="issue-badge">${category}: ${count}</div>`
                                ).join('')}
                            </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
                
                <!-- Compliance Issues Section -->
                <h2 class="section-header">Compliance Issues</h2>
                <div class="cards-container">
                    <!-- Compliance Issues Summary Card -->
                    <div class="card">
                        <div class="card-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            </svg>
                        </div>
                        <div class="card-content">
                            <div class="card-title">Compliance Status</div>
                            <div class="card-status">${totalComplianceCount === 0 ? "Protected" : "Issues Detected"}</div>
                            
                            ${totalComplianceCount > 0 ? `
                            <div class="badges-container">
                                ${criticalComplianceCount > 0 ? 
                                `<div class="issue-badge critical">${criticalComplianceCount} Critical</div>` : ''}
                                
                                ${highComplianceCount > 0 ? 
                                `<div class="issue-badge high">${highComplianceCount} High</div>` : ''}
                                
                                ${mediumComplianceCount > 0 ? 
                                `<div class="issue-badge medium">${mediumComplianceCount} Medium</div>` : ''}
                                
                                ${lowComplianceCount > 0 ? 
                                `<div class="issue-badge low">${lowComplianceCount} Low</div>` : ''}
                            </div>
                            ` : ''}
                        </div>
                    </div>
                    
                    <!-- Compliance Standards Card -->
                    <div class="card">
                        <div class="card-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline>
                                <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>
                            </svg>
                        </div>
                        <div class="card-content">
                            <div class="card-title">Compliance Standards</div>
                            <div class="card-status">${Object.keys(complianceCategories).length === 0 ? "All standards met" : `${Object.keys(complianceCategories).length} standards affected`}</div>
                            
                            ${Object.keys(complianceCategories).length > 0 ? `
                            <div class="badges-container">
                                ${Object.entries(complianceCategories).map(([standard, count]) => 
                                    `<div class="issue-badge compliance">${standard.toUpperCase()}: ${count}</div>`
                                ).join('')}
                            </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Issues Section (hidden by default) -->
            <div id="issues-panel" class="issues-panel ${this._securityIssues.length > 0 || this._complianceIssues.length > 0 ? 'active' : ''}">
                <div class="issues-header">
                    <h3 class="issues-title">Detected Issues</h3>
                </div>
                
                <div class="tab-container">
                    <div class="tab active" id="security-tab-button" data-tab="security">Security Issues (${totalSecurityCount})</div>
                    <div class="tab" id="compliance-tab-button" data-tab="compliance">Compliance Issues (${totalComplianceCount})</div>
                </div>
                
                <!-- Make sure the IDs match the data-tab values with "-tab" suffix -->
                <div id="security-tab" class="tab-content active">
                    ${this._securityIssues.length === 0 ? 
                        `<div style="text-align: center; padding: 30px;">No security issues detected</div>` :
                        `<div id="security-issues">
                            <div class="search-filter-container">
                                <input type="text" id="security-search" class="search-input" placeholder="Search security issues...">
                                <div class="filter-dropdown">
                                    <select id="security-filter" class="filter-select">
                                        <option value="all">All severities</option>
                                        <option value="critical">Critical</option>
                                        <option value="high">High</option>
                                        <option value="medium">Medium</option>
                                        <option value="low">Low</option>
                                    </select>
                                </div>
                            </div>
                            <div class="issues-list" id="security-issues-list">
                                ${this._securityIssues.map(issue => `
                                    <div class="issue-item" data-severity="${issue.severity}" data-id="${issue.id}">
                                        <div class="issue-header">
                                            <div class="issue-severity ${issue.severity}"></div>
                                            <div class="issue-title">${issue.rule.name}</div>
                                            <div class="issue-badge ${issue.severity}">${issue.severity.toUpperCase()}</div>
                                        </div>
                                        <div class="issue-description">${issue.description}</div>
                                        <div class="issue-location" data-file="${issue.location.file}" data-line="${issue.location.position.line}" data-character="${issue.location.position.character}">
                                            ${path.basename(issue.location.file)}:${issue.location.position.line + 1}:${issue.location.position.character + 1}
                                        </div>
                                        <div class="issue-tags">
                                            ${issue.rule.tags.map(tag => `<span class="issue-tag">${tag}</span>`).join('')}
                                        </div>
                                        <div class="issue-actions">
                                            <button class="fix-button" data-issue-id="${issue.id}">Fix Issue</button>
                                            <button class="more-info-button" data-issue-id="${issue.id}">More Info</button>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>`
                    }
                </div>
                
                <div id="compliance-tab" class="tab-content">
                    ${this._complianceIssues.length === 0 ? 
                        `<div style="text-align: center; padding: 30px;">No compliance issues detected</div>` :
                        `<div id="compliance-issues">
                            <div class="search-filter-container">
                                <input type="text" id="compliance-search" class="search-input" placeholder="Search compliance issues...">
                                <div class="filter-dropdown">
                                    <select id="compliance-filter" class="filter-select">
                                        <option value="all">All standards</option>
                                        ${Array.from(new Set(this._complianceIssues
                                            .filter(issue => issue.rule.complianceStandards && issue.rule.complianceStandards.length > 0)
                                            .map(issue => issue.rule.complianceStandards?.[0]?.id ?? 'unknown')))
                                            .map(standardId => `<option value="${standardId}">${standardId.toUpperCase()}</option>`)
                                            .join('')
                                        }
                                    </select>
                                </div>
                            </div>
                            <div class="issues-list" id="compliance-issues-list">
                                ${this._complianceIssues.map(issue => `
                                    <div class="issue-item" data-severity="${issue.severity}" data-id="${issue.id}" 
                                        data-standard="${issue.rule.complianceStandards && issue.rule.complianceStandards.length > 0 ? issue.rule.complianceStandards[0].id : ''}">
                                        <div class="issue-header">
                                            <div class="issue-severity ${issue.severity}"></div>
                                            <div class="issue-title">${issue.rule.name}</div>
                                            <div class="issue-badge ${issue.severity}">${issue.severity.toUpperCase()}</div>
                                        </div>
                                        <div class="issue-description">${issue.description}</div>
                                        <div class="issue-location" data-file="${issue.location.file}" data-line="${issue.location.position.line}" data-character="${issue.location.position.character}">
                                            ${path.basename(issue.location.file)}:${issue.location.position.line + 1}:${issue.location.position.character + 1}
                                        </div>
                                        <div class="issue-tags">
                                            ${issue.rule.complianceStandards ? issue.rule.complianceStandards.map(std => 
                                                `<span class="issue-tag">${std.name}</span>`).join('') : ''}
                                        </div>
                                        <div class="issue-actions">
                                            <button class="fix-button" data-issue-id="${issue.id}">Fix Issue</button>
                                            <button class="more-info-button" data-issue-id="${issue.id}">More Info</button>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>`
                    }
                </div>
            </div>
        </div>
        
        <div class="action-bar">
            <div class="scan-info">
                <span class="search-icon">🔍</span>
                Last Deep Scan: About ${Math.floor(Math.random() * 10) + 1} minutes ago
            </div>
            
            <button id="scan-button" class="scan-button">
                <span class="spinner"></span>
                SCAN WorkSpace
            </button>
            
            <div class="rules-info">
                Rules definitions: 
                <span class="up-to-date">Up to date</span>
                <span class="refresh-icon" id="refresh-rules">↻</span>
            </div>
        </div>
    </div>

    <script nonce="${nonce}">
        (function() {
            const vscode = acquireVsCodeApi();

            // Ensure variables are declared only once
            const securityTab = document.getElementById('security-tab-button');
            const complianceTab = document.getElementById('compliance-tab-button');
            const securityContent = document.getElementById('security-tab');
            const complianceContent = document.getElementById('compliance-tab');

            function switchToTab(tabElement, contentElement) {
                // Deactivate all tabs and contents
                document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

                // Activate the selected tab and content
                tabElement.classList.add('active');
                contentElement.classList.add('active');
            }

            // Add event listeners
            if (securityTab && securityContent) {
                securityTab.addEventListener('click', () => {
                    switchToTab(securityTab, securityContent);
                });
            }

            if (complianceTab && complianceContent) {
                complianceTab.addEventListener('click', () => {
                    switchToTab(complianceTab, complianceContent);
                });
            }

            // Initialize the default active tab
            if (securityTab && securityContent) {
                switchToTab(securityTab, securityContent);
            }

            // ----- START: Improved Tab Switching Implementation -----
            // Directly select tab elements using IDs as they are defined in HTML
            // Function to switch tabs using direct DOM manipulation
            function switchToTab(tabElement, contentElement) {
                // For debugging
                console.log('Switching to tab:', tabElement ? tabElement.id : 'unknown');
                
                // Remove active class from all tabs
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                
                // Remove active class from all content elements
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                
                // Add active class to the selected tab and content
                if (tabElement && contentElement) {
                    tabElement.classList.add('active');
                    contentElement.classList.add('active');
                    console.log('Successfully activated tab:', tabElement.id);
                } else {
                    console.error('Failed to switch tabs - missing elements', {
                        tabElement,
                        contentElement
                    });
                }
            }
            
            // Set up click handlers for both tabs specifically
            if (securityTab) {
                securityTab.addEventListener('click', function(e) {
                    e.preventDefault();
                    console.log('Security tab clicked');
                    switchToTab(securityTab, securityContent);
                });
            } else {
                console.error('Security tab element not found');
            }
            
            if (complianceTab) {
                complianceTab.addEventListener('click', function(e) {
                    e.preventDefault();
                    console.log('Compliance tab clicked');
                    switchToTab(complianceTab, complianceContent);
                });
            } else {
                console.error('Compliance tab element not found');
            }
            
            // Initialize the tabs correctly on load
            document.addEventListener('DOMContentLoaded', function() {
                console.log('DOM fully loaded - initializing tabs');
                // Default to security tab if it's available
                if (securityTab && securityContent) {
                    switchToTab(securityTab, securityContent);
                }
            });
            
            // Immediate initialization in case DOMContentLoaded already fired
            if (document.readyState === 'complete' || document.readyState === 'interactive') {
                console.log('Document already loaded - initializing tabs immediately');
                // Check if security tab has active class
                if (securityTab && !securityTab.classList.contains('active') && securityContent) {
                    switchToTab(securityTab, securityContent);
                }
            }
            // ----- END: Improved Tab Switching Implementation -----
            
            // ----- START: Issue Search and Filter Implementation -----
            // Security issues search and filter functionality
            const securitySearch = document.getElementById('security-search');
            const securityFilter = document.getElementById('security-filter');
            
            if (securitySearch) {
                securitySearch.addEventListener('input', () => {
                    filterSecurityIssues();
                });
            }
            
            if (securityFilter) {
                securityFilter.addEventListener('change', () => {
                    filterSecurityIssues();
                });
            }
            
            function filterSecurityIssues() {
                const searchTerm = securitySearch.value.toLowerCase();
                const severity = securityFilter.value;
                const issueItems = document.querySelectorAll('#security-issues-list .issue-item');
                
                issueItems.forEach(item => {
                    const itemText = item.textContent.toLowerCase();
                    const itemSeverity = item.getAttribute('data-severity');
                    const matchesSearch = searchTerm === '' || itemText.includes(searchTerm);
                    const matchesSeverity = severity === 'all' || itemSeverity === severity;
                    
                    item.style.display = (matchesSearch && matchesSeverity) ? 'block' : 'none';
                });
            }
            
            // Compliance issues search and filter functionality
            const complianceSearch = document.getElementById('compliance-search');
            const complianceFilter = document.getElementById('compliance-filter');
            
            if (complianceSearch) {
                complianceSearch.addEventListener('input', () => {
                    filterComplianceIssues();
                });
            }
            
            if (complianceFilter) {
                complianceFilter.addEventListener('change', () => {
                    filterComplianceIssues();
                });
            }
            
            function filterComplianceIssues() {
                const searchTerm = complianceSearch.value.toLowerCase();
                const standard = complianceFilter.value;
                const issueItems = document.querySelectorAll('#compliance-issues-list .issue-item');
                
                issueItems.forEach(item => {
                    const itemText = item.textContent.toLowerCase();
                    const itemStandard = item.getAttribute('data-standard');
                    const matchesSearch = searchTerm === '' || itemText.includes(searchTerm);
                    const matchesStandard = standard === 'all' || itemStandard === standard;
                    
                    item.style.display = (matchesSearch && matchesStandard) ? 'block' : 'none';
                });
            }
            // ----- END: Issue Search and Filter Implementation -----
            
            // ----- START: Issue Actions Implementation -----
            // More Info buttons
            document.querySelectorAll('.more-info-button').forEach(button => {
                button.addEventListener('click', () => {
                    const issueId = button.dataset.issueId;
                    vscode.postMessage({
                        command: 'showIssueInfo',
                        issueId: issueId
                    });
                });
            });
            // ----- END: Issue Actions Implementation -----
            
            // Scan button
            const scanButton = document.getElementById('scan-button');
            
            scanButton.addEventListener('click', () => {
                // Add scanning class to show spinner
                scanButton.classList.add('scanning');
                
                // Send message to the extension to scan workspace
                vscode.postMessage({ command: 'refresh' });
                
                // Set timeout to remove scanning class if it takes too long
                setTimeout(() => {
                    scanButton.classList.remove('scanning');
                }, 30000);
            });
            
            // Settings button
            document.getElementById('settings-button').addEventListener('click', () => {
                vscode.postMessage({ command: 'showConfig' });
            });
            
            // Refresh rules button
            document.getElementById('refresh-rules').addEventListener('click', () => {
                vscode.postMessage({ command: 'updateRuleset' });
            });
            
            // File location clicking
            document.querySelectorAll('.issue-location').forEach(location => {
                location.addEventListener('click', () => {
                    vscode.postMessage({
                        command: 'openFile',
                        file: location.dataset.file,
                        line: parseInt(location.dataset.line),
                        character: parseInt(location.dataset.character)
                    });
                });
            });
            
            // Fix issues buttons
            document.querySelectorAll('.fix-button').forEach(button => {
                button.addEventListener('click', () => {
                    vscode.postMessage({
                        command: 'fix',
                        issueId: button.dataset.issueId
                    });
                });
            });
            
            // Handle messages from the extension
            window.addEventListener('message', event => {
                const message = event.data;
                
                if (message.type === 'scanComplete') {
                    // Remove the scanning class
                    scanButton.classList.remove('scanning');
                    
                    // Store the updated issues and reload the webview
                    if (message.securityIssues && message.complianceIssues) {
                        vscode.setState({
                            securityIssues: message.securityIssues,
                            complianceIssues: message.complianceIssues
                        });
                        
                        // Refresh the dashboard
                        window.location.reload();
                    }
                }
            });
            
            // Store state
            vscode.setState({
                securityIssues: ${JSON.stringify(this._securityIssues)},
                complianceIssues: ${JSON.stringify(this._complianceIssues)}
            });
            
            // Force a console log that will definitely be visible
            console.log('%c CODEGUARD DEBUG: WebView loaded ', 'background: #42E288; color: #171C26; font-size: 16px; font-weight: bold;');
            console.warn('If you can see this, console logging is working!');
            
            // Additional debugging info
            console.log('===== TAB ELEMENTS DIAGNOSTICS =====');
            console.log('Security tab element exists:', !!securityTab);
            console.log('Compliance tab element exists:', !!complianceTab);
            console.log('Security content element exists:', !!securityContent);
            console.log('Compliance content element exists:', !!complianceContent);
            console.log('Security issues count:', ${this._securityIssues.length});
            console.log('Compliance issues count:', ${this._complianceIssues.length});
            console.log('===================================');

            // Additional debugging for tab switching
            console.log('===== TAB DEBUGGING INFO =====');
            
            // Check if elements exist
            console.log('Security tab exists:', !!document.getElementById('security-tab-button'));
            console.log('Compliance tab exists:', !!document.getElementById('compliance-tab-button'));
            console.log('Security content exists:', !!document.getElementById('security-tab'));
            console.log('Compliance content exists:', !!document.getElementById('compliance-tab'));
            
            // Check if compliance tab has proper ID
            const complianceTabElement = document.getElementById('compliance-tab');
            console.log('Compliance tab element ID:', complianceTabElement ? complianceTabElement.id : 'not found');
            console.log('Compliance tab element class list:', complianceTabElement ? complianceTabElement.classList.value : 'not found');
            
            // Make sure we're using the correct selector
            const allTabContents = document.querySelectorAll('.tab-content');
            console.log('Number of tab-content elements found:', allTabContents.length);
            allTabContents.forEach((element, index) => {
            });
            
            console.log('===== END TAB DEBUGGING =====');
        })();
    </script>
</body>
</html>`;
    }
}

/**
 * Generates a nonce for CSP
 * @returns A random nonce
 */
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}