#!/usr/bin/env ts-node
/**
 * Automated Bug Report Generator
 * 
 * Runs all tests, captures failures, and generates a structured bug report
 * 
 * Usage: npm run test:report
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

interface BugReport {
  id: string;
  title: string;
  description: string;
  system: 'Frontend' | 'Backend' | 'Agents' | 'Payments' | 'Database' | 'Integration';
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  testFile: string;
  testName: string;
  error: string;
  stackTrace?: string;
  reproductionSteps?: string[];
  expectedBehavior?: string;
  actualBehavior?: string;
  screenshots?: string[];
  timestamp: string;
}

class BugReportGenerator {
  private bugs: BugReport[] = [];
  private testResultsDir = path.join(__dirname, '../test-results');
  private outputFile = path.join(__dirname, '../BUG_REPORT.md');

  async run() {
    console.log('🐛 Bug Report Generator Starting...\n');
    console.log('=' .repeat(80));
    
    // Step 1: Run integration tests
    console.log('\n📋 Step 1: Running integration tests...');
    await this.runIntegrationTests();
    
    // Step 2: Run E2E tests
    console.log('\n📋 Step 2: Running E2E tests...');
    await this.runE2ETests();
    
    // Step 3: Parse results
    console.log('\n📋 Step 3: Parsing test results...');
    await this.parseTestResults();
    
    // Step 4: Generate report
    console.log('\n📋 Step 4: Generating bug report...');
    await this.generateReport();
    
    console.log('\n' + '='.repeat(80));
    console.log(`\n✅ Bug report generated: ${this.outputFile}`);
    console.log(`📊 Total bugs found: ${this.bugs.length}\n`);
    
    this.printSummary();
  }

  private async runIntegrationTests() {
    try {
      execSync('npm run test:integration -- --json --outputFile=test-results/jest-results.json --testLocationInResults', {
        stdio: 'inherit',
        cwd: path.join(__dirname, '..'),
      });
      console.log('✅ Integration tests completed');
    } catch (error) {
      console.log('⚠️  Integration tests had failures (will be captured)');
    }
  }

  private async runE2ETests() {
    try {
      execSync('npm run test:e2e -- --reporter=json', {
        stdio: 'inherit',
        cwd: path.join(__dirname, '..'),
      });
      console.log('✅ E2E tests completed');
    } catch (error) {
      console.log('⚠️  E2E tests had failures (will be captured)');
    }
  }

  private async parseTestResults() {
    // Parse Jest results
    await this.parseJestResults();
    
    // Parse Playwright results
    await this.parsePlaywrightResults();
  }

  private async parseJestResults() {
    const jestResultsPath = path.join(this.testResultsDir, 'jest-results.json');
    
    if (!fs.existsSync(jestResultsPath)) {
      console.log('⚠️  No Jest results found');
      return;
    }

    try {
      const results = JSON.parse(fs.readFileSync(jestResultsPath, 'utf-8'));
      
      results.testResults?.forEach((testFile: any) => {
        testFile.assertionResults?.forEach((test: any) => {
          if (test.status === 'failed') {
            const bug = this.createBugFromJestFailure(testFile, test);
            this.bugs.push(bug);
          }
        });
      });
      
      console.log(`✅ Parsed ${this.bugs.length} bugs from Jest results`);
    } catch (error) {
      console.error('Error parsing Jest results:', error);
    }
  }

  private createBugFromJestFailure(testFile: any, test: any): BugReport {
    const filePath = testFile.name || '';
    const testName = test.fullName || test.title || 'Unknown test';
    const error = test.failureMessages?.[0] || 'Unknown error';
    
    // Determine system based on file path
    let system: BugReport['system'] = 'Integration';
    if (filePath.includes('message-flow')) system = 'Backend';
    if (filePath.includes('premium-services')) system = 'Payments';
    if (filePath.includes('agent-interactions')) system = 'Agents';
    
    // Determine severity based on error type
    let severity: BugReport['severity'] = 'Medium';
    if (error.includes('Timeout') || error.includes('timeout')) severity = 'High';
    if (error.includes('FATAL') || error.includes('Critical')) severity = 'Critical';
    if (error.includes('Payment') && error.includes('failed')) severity = 'High';
    
    // Extract stack trace
    const stackMatch = error.match(/at .+/g);
    const stackTrace = stackMatch ? stackMatch.slice(0, 5).join('\n') : undefined;
    
    return {
      id: `BUG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: this.generateBugTitle(testName, error),
      description: this.extractErrorDescription(error),
      system,
      severity,
      testFile: path.basename(filePath),
      testName,
      error: error.split('\n')[0],
      stackTrace,
      timestamp: new Date().toISOString(),
    };
  }

  private async parsePlaywrightResults() {
    const playwrightResultsPath = path.join(this.testResultsDir, 'results.json');
    
    if (!fs.existsSync(playwrightResultsPath)) {
      console.log('⚠️  No Playwright results found');
      return;
    }

    try {
      const results = JSON.parse(fs.readFileSync(playwrightResultsPath, 'utf-8'));
      
      results.suites?.forEach((suite: any) => {
        suite.specs?.forEach((spec: any) => {
          spec.tests?.forEach((test: any) => {
            if (test.status === 'failed' || test.status === 'timedOut') {
              const bug = this.createBugFromPlaywrightFailure(suite, spec, test);
              this.bugs.push(bug);
            }
          });
        });
      });
      
      console.log(`✅ Found ${this.bugs.length} total bugs (Jest + Playwright)`);
    } catch (error) {
      console.error('Error parsing Playwright results:', error);
    }
  }

  private createBugFromPlaywrightFailure(suite: any, spec: any, test: any): BugReport {
    const error = test.results?.[0]?.error?.message || 'Unknown error';
    const screenshots = test.results?.[0]?.attachments
      ?.filter((a: any) => a.contentType?.includes('image'))
      ?.map((a: any) => a.path) || [];
    
    return {
      id: `BUG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: spec.title || 'E2E Test Failure',
      description: error,
      system: 'Frontend',
      severity: test.status === 'timedOut' ? 'High' : 'Medium',
      testFile: path.basename(suite.file || ''),
      testName: spec.title,
      error: error.split('\n')[0],
      screenshots,
      timestamp: new Date().toISOString(),
    };
  }

  private generateBugTitle(testName: string, error: string): string {
    // Extract meaningful title from test name and error
    if (error.includes('Timeout')) return `Timeout: ${testName}`;
    if (error.includes('Payment')) return `Payment Issue: ${testName}`;
    if (error.includes('Agent')) return `Agent Communication: ${testName}`;
    return testName;
  }

  private extractErrorDescription(error: string): string {
    // Extract first meaningful line
    const lines = error.split('\n').filter(l => l.trim());
    return lines[0] || 'Unknown error';
  }

  private async generateReport() {
    const report = this.buildMarkdownReport();
    fs.writeFileSync(this.outputFile, report, 'utf-8');
  }

  private buildMarkdownReport(): string {
    const timestamp = new Date().toLocaleString();
    const totalBugs = this.bugs.length;
    
    // Group bugs by system
    const bySystem = this.groupBy(this.bugs, 'system');
    
    // Group by severity
    const bySeverity = this.groupBy(this.bugs, 'severity');
    
    let md = `# Bug Report

**Generated:** ${timestamp}  
**Total Bugs Found:** ${totalBugs}

---

## Executive Summary

`;

    // Summary by severity
    md += `### By Severity\n\n`;
    Object.entries(bySeverity).forEach(([severity, bugs]) => {
      const emoji = this.getSeverityEmoji(severity as any);
      md += `- ${emoji} **${severity}:** ${bugs.length} issue(s)\n`;
    });

    md += `\n### By System\n\n`;
    Object.entries(bySystem).forEach(([system, bugs]) => {
      const emoji = this.getSystemEmoji(system as any);
      md += `- ${emoji} **${system}:** ${bugs.length} issue(s)\n`;
    });

    md += `\n---\n\n`;

    // Detailed bugs by severity
    const severityOrder: BugReport['severity'][] = ['Critical', 'High', 'Medium', 'Low'];
    
    severityOrder.forEach(severity => {
      const bugsOfSeverity = this.bugs.filter(b => b.severity === severity);
      if (bugsOfSeverity.length === 0) return;
      
      md += `## ${this.getSeverityEmoji(severity)} ${severity} Priority Issues\n\n`;
      
      bugsOfSeverity.forEach((bug, index) => {
        md += this.formatBug(bug, index + 1);
      });
    });

    // Add recommendations
    md += this.generateRecommendations();

    return md;
  }

  private formatBug(bug: BugReport, index: number): string {
    let md = `### ${index}. ${bug.title}\n\n`;
    md += `**Bug ID:** \`${bug.id}\`  \n`;
    md += `**System:** ${this.getSystemEmoji(bug.system)} ${bug.system}  \n`;
    md += `**Severity:** ${this.getSeverityEmoji(bug.severity)} ${bug.severity}  \n`;
    md += `**Test:** \`${bug.testFile}\` - ${bug.testName}  \n`;
    md += `**Timestamp:** ${new Date(bug.timestamp).toLocaleString()}  \n\n`;

    md += `**Error:**\n\`\`\`\n${bug.error}\n\`\`\`\n\n`;

    if (bug.description && bug.description !== bug.error) {
      md += `**Description:**\n${bug.description}\n\n`;
    }

    if (bug.stackTrace) {
      md += `**Stack Trace:**\n\`\`\`\n${bug.stackTrace}\n\`\`\`\n\n`;
    }

    if (bug.screenshots && bug.screenshots.length > 0) {
      md += `**Screenshots:**\n`;
      bug.screenshots.forEach(screenshot => {
        md += `- ${screenshot}\n`;
      });
      md += `\n`;
    }

    md += `**Action Items:**\n`;
    md += this.generateActionItems(bug);
    md += `\n---\n\n`;

    return md;
  }

  private generateActionItems(bug: BugReport): string {
    const items: string[] = [];

    switch (bug.system) {
      case 'Frontend':
        items.push('- [ ] Review React component logic');
        items.push('- [ ] Check state management');
        items.push('- [ ] Verify wallet integration');
        break;
      case 'Backend':
        items.push('- [ ] Review API route implementation');
        items.push('- [ ] Check database queries');
        items.push('- [ ] Verify error handling');
        break;
      case 'Agents':
        items.push('- [ ] Review agent main.py');
        items.push('- [ ] Check Coral Server connection');
        items.push('- [ ] Verify LLM tool calls');
        break;
      case 'Payments':
        items.push('- [ ] Review x402 payment flow');
        items.push('- [ ] Check transaction signing');
        items.push('- [ ] Verify payment verification logic');
        break;
      case 'Database':
        items.push('- [ ] Review Prisma schema');
        items.push('- [ ] Check database migrations');
        items.push('- [ ] Verify query performance');
        break;
      case 'Integration':
        items.push('- [ ] Review integration between systems');
        items.push('- [ ] Check API contracts');
        items.push('- [ ] Verify data flow');
        break;
    }

    if (bug.error.includes('Timeout') || bug.error.includes('timeout')) {
      items.push('- [ ] Increase timeout values');
      items.push('- [ ] Optimize slow operations');
    }

    return items.join('\n');
  }

  private generateRecommendations(): string {
    if (this.bugs.length === 0) {
      return `## ✅ Recommendations\n\nAll tests passed! No bugs found.\n`;
    }

    let md = `## 💡 Recommendations\n\n`;

    const critical = this.bugs.filter(b => b.severity === 'Critical').length;
    const high = this.bugs.filter(b => b.severity === 'High').length;

    md += `### Priority Order\n\n`;
    md += `1. **Critical Issues (${critical})** - Fix immediately before deployment\n`;
    md += `2. **High Priority (${high})** - Fix before next release\n`;
    md += `3. **Medium/Low** - Schedule for future sprints\n\n`;

    md += `### Common Patterns\n\n`;
    
    const timeouts = this.bugs.filter(b => b.error.includes('Timeout')).length;
    if (timeouts > 0) {
      md += `- **${timeouts} timeout issues** - Consider optimizing agent response time or increasing timeouts\n`;
    }

    const payments = this.bugs.filter(b => b.system === 'Payments').length;
    if (payments > 0) {
      md += `- **${payments} payment issues** - Review x402 integration and transaction signing\n`;
    }

    const agents = this.bugs.filter(b => b.system === 'Agents').length;
    if (agents > 0) {
      md += `- **${agents} agent issues** - Check Coral Server connection and LLM configuration\n`;
    }

    md += `\n### Next Steps\n\n`;
    md += `1. Review this report with the team\n`;
    md += `2. Create GitHub issues for each bug\n`;
    md += `3. Assign priorities and owners\n`;
    md += `4. Re-run tests after fixes: \`npm run test:report\`\n`;

    return md;
  }

  private groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
    return array.reduce((result, item) => {
      const groupKey = String(item[key]);
      if (!result[groupKey]) result[groupKey] = [];
      result[groupKey].push(item);
      return result;
    }, {} as Record<string, T[]>);
  }

  private getSeverityEmoji(severity: BugReport['severity']): string {
    const map = {
      Critical: '🔴',
      High: '🟠',
      Medium: '🟡',
      Low: '🟢',
    };
    return map[severity] || '⚪';
  }

  private getSystemEmoji(system: BugReport['system']): string {
    const map = {
      Frontend: '🎨',
      Backend: '⚙️',
      Agents: '🤖',
      Payments: '💳',
      Database: '🗄️',
      Integration: '🔗',
    };
    return map[system] || '📦';
  }

  private printSummary() {
    console.log('Summary by Severity:');
    const bySeverity = this.groupBy(this.bugs, 'severity');
    Object.entries(bySeverity).forEach(([severity, bugs]) => {
      console.log(`  ${this.getSeverityEmoji(severity as any)} ${severity}: ${bugs.length}`);
    });

    console.log('\nSummary by System:');
    const bySystem = this.groupBy(this.bugs, 'system');
    Object.entries(bySystem).forEach(([system, bugs]) => {
      console.log(`  ${this.getSystemEmoji(system as any)} ${system}: ${bugs.length}`);
    });
  }
}

// Run the generator
const generator = new BugReportGenerator();
generator.run().catch(error => {
  console.error('Error generating bug report:', error);
  process.exit(1);
});

