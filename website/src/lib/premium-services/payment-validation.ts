import fs from 'fs';
import path from 'path';

interface VariableServiceConfig {
  type: 'variable';
  min_amount: number;
  currency: string;
}

type ServiceConfig = number | VariableServiceConfig;

interface PremiumServicesConfig {
  [serviceType: string]: ServiceConfig;
}

let cachedConfig: PremiumServicesConfig | null = null;

/**
 * Load premium services pricing configuration
 * Loads once and caches for performance
 */
function loadPremiumServicesConfig(): PremiumServicesConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const configPath = path.join(process.cwd(), 'src/lib/premium-services/premium-services.json');
    const configData = fs.readFileSync(configPath, 'utf-8');
    cachedConfig = JSON.parse(configData);
    return cachedConfig as PremiumServicesConfig;
  } catch (error: any) {
    console.error('[Payment Validation] Failed to load premium services config:', error.message);
    // Return empty config - validation will fail gracefully
    return {};
  }
}

export interface PaymentValidationResult {
  valid: boolean;
  error?: string;
  expectedAmount?: number;
  minAmount?: number;
}

/**
 * Validate payment amount matches expected price for service type
 * 
 * @param serviceType - The premium service type (e.g., "connection_intro", "donation")
 * @param paymentAmount - The amount user is paying in USDC
 * @returns Validation result with details
 */
export function validatePaymentAmount(
  serviceType: string,
  paymentAmount: number
): PaymentValidationResult {
  const config = loadPremiumServicesConfig();
  
  // Check if service type exists
  if (!config[serviceType]) {
    return {
      valid: false,
      error: `Unknown service type: ${serviceType}`
    };
  }
  
  const serviceConfig = config[serviceType];
  
  // Handle fixed-price services (number)
  if (typeof serviceConfig === 'number') {
    const expectedAmount = serviceConfig;
    const tolerance = 0.0001; // Allow tiny floating point differences
    
    if (Math.abs(paymentAmount - expectedAmount) > tolerance) {
      return {
        valid: false,
        error: `Invalid amount for ${serviceType}. Expected: $${expectedAmount}, Got: $${paymentAmount}`,
        expectedAmount
      };
    }
    
    return { valid: true, expectedAmount };
  }
  
  // Handle variable-amount services (with minimum)
  if (serviceConfig.type === 'variable') {
    const minAmount = serviceConfig.min_amount;
    
    if (paymentAmount < minAmount) {
      return {
        valid: false,
        error: `Amount below minimum for ${serviceType}. Minimum: $${minAmount}, Got: $${paymentAmount}`,
        minAmount
      };
    }
    
    return { valid: true, minAmount };
  }
  
  // Unknown config format
  return {
    valid: false,
    error: `Invalid configuration for service type: ${serviceType}`
  };
}

/**
 * Get expected amount or minimum for a service (for logging/debugging)
 */
export function getServicePriceInfo(serviceType: string): {
  type: 'fixed' | 'variable' | 'unknown';
  amount?: number;
  minAmount?: number;
} {
  const config = loadPremiumServicesConfig();
  const serviceConfig = config[serviceType];
  
  if (!serviceConfig) {
    return { type: 'unknown' };
  }
  
  if (typeof serviceConfig === 'number') {
    return { type: 'fixed', amount: serviceConfig };
  }
  
  if (serviceConfig.type === 'variable') {
    return { type: 'variable', minAmount: serviceConfig.min_amount };
  }
  
  return { type: 'unknown' };
}

