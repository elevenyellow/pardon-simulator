/**
 * Custom Jest Reporter
 * Captures test failures for bug report generation
 */

class BugReportReporter {
  constructor(globalConfig, options) {
    this._globalConfig = globalConfig;
    this._options = options;
  }

  onRunComplete(contexts, results) {
    const failures = [];
    
    results.testResults.forEach(testResult => {
      testResult.testResults.forEach(test => {
        if (test.status === 'failed') {
          failures.push({
            testFile: testResult.testFilePath,
            testName: test.fullName,
            error: test.failureMessages?.[0] || 'Unknown error',
            duration: test.duration,
          });
        }
      });
    });

    if (failures.length > 0) {
      console.log('\n' + '='.repeat(80));
      console.log('📋 Test Failures Summary:');
      console.log('='.repeat(80));
      failures.forEach((failure, index) => {
        console.log(`\n${index + 1}. ${failure.testName}`);
        console.log(`   File: ${failure.testFile}`);
        console.log(`   Error: ${failure.error.split('\n')[0]}`);
      });
      console.log('\n' + '='.repeat(80));
      console.log(`Total Failures: ${failures.length}`);
      console.log('='.repeat(80) + '\n');
    }
  }
}

module.exports = BugReportReporter;

