# CodeGuard AI

CodeGuard AI is an instant AI-driven security and compliance auditing extension for teams and SaaS companies. It helps developers identify and fix security vulnerabilities and compliance issues during development.

## Features

- **Local Security Scanning**: Detect common vulnerabilities like SQL injections, XSS, and hardcoded secrets without your code leaving the machine
- **Compliance Checking**: Automatically verify code against GDPR, HIPAA, SOC2, and other compliance requirements
- **Team Collaboration**: Share security and compliance rulesets via a simple config file (`.codeguardrc`)
- **Auto-Fix Suggestions**: Get intelligent code fixes for detected issues
- **Secure by Default**: No outbound network traffic unless explicitly enabled

## Why CodeGuard AI?

- **Urgent Need**: Security and compliance are non-optional for modern development teams
- **Lightweight Solution**: No complex setup or external services required
- **Dev-Friendly**: Get security feedback during development, not after
- **Team-First Design**: Consistent security standards across your entire organization

## Extension Settings

This extension contributes the following settings:

* `codeguardai.enable`: Enable/disable this extension
* `codeguardai.securityRules`: Configure which security rules to check
* `codeguardai.complianceProfiles`: Select which compliance profiles to enforce (GDPR, HIPAA, SOC2, etc.)
* `codeguardai.teamMode`: Enable/disable team collaboration features

## Subscription Plans

### Free Tier
- Basic vulnerability detection
- Limited ruleset

### Pro Plan ($10-$15/user/month)
- Full security and compliance ruleset
- Team collaboration features
- Custom compliance profiles
- Priority support

### Enterprise Plan ($25/user/month or $500/team)
- SSO/SAML integration
- Private hosting option
- API access for automation
- Custom rulesets and policies

## Release Notes

### 0.1.0
- Initial preview release

---

## Development

### Requirements
- Node.js 18 or higher
- npm 9 or higher

### Setup
1. Clone the repository
2. Run `npm install`
3. Press F5 to start debugging

See the [VS Code Extension Development Guide](https://code.visualstudio.com/api/get-started/your-first-extension) for more information.
