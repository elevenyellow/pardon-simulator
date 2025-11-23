/**
 * Test Retry Helper
 * Provides retry logic for flaky tests
 */

export interface RetryOptions {
  maxRetries?: number;
  retryDelay?: number;
  testName?: string;
}

/**
 * Retry a test function with exponential backoff
 * 
 * @param testFn - The test function to retry
 * @param options - Retry configuration options
 * @returns The result of the test function
 * @throws The error from the final attempt if all retries fail
 */
export async function retryTest<T>(
  testFn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 2, retryDelay = 5000, testName = 'Test' } = options;
  
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      console.log(`[RETRY] ${testName} - Attempt ${attempt}/${maxRetries + 1}`);
      return await testFn();
    } catch (error) {
      if (attempt > maxRetries) {
        console.error(`[RETRY] ${testName} - All ${maxRetries + 1} attempts failed`);
        throw error;
      }
      
      console.warn(`[RETRY] ${testName} - Attempt ${attempt} failed, retrying in ${retryDelay}ms...`);
      console.warn(`[RETRY] Error:`, error);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  
  throw new Error('Retry logic error'); // Should never reach here
}

