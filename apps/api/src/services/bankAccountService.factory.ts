/**
 * Bank Account Service Factory
 * 
 * Creates the appropriate bank account service based on environment configuration.
 * 
 * Environment Variables:
 * - BANK_SERVICE_MODE: 'real' | 'fake' (defaults to 'real' in production)
 * - NODE_ENV: 'development' | 'staging' | 'production'
 * 
 * Logic:
 * - If BANK_SERVICE_MODE='fake' → use FakeBankAccountService
 * - If BANK_SERVICE_MODE='real' → use RealBankAccountService
 * - If NODE_ENV='staging' or 'development' → allow fake service
 * - Otherwise → use RealBankAccountService
 */

import { RealBankAccountService } from './bankAccountService.real.js';
import { FakeBankAccountService } from './bankAccountService.fake.js';
import type { IBankAccountService } from './bankAccountService.js';

let serviceInstance: IBankAccountService | null = null;

/**
 * Get the bank account service instance
 * Creates singleton based on environment configuration
 */
export function getBankAccountService(): IBankAccountService {
  if (serviceInstance) {
    return serviceInstance;
  }

  const mode = process.env.BANK_SERVICE_MODE;
  const nodeEnv = process.env.NODE_ENV;

  // Explicit mode override
  if (mode === 'fake') {
    serviceInstance = new FakeBankAccountService();
    console.log('[BankAccountService] Using FAKE service (BANK_SERVICE_MODE=fake)');
    return serviceInstance;
  }

  if (mode === 'real') {
    serviceInstance = new RealBankAccountService();
    console.log('[BankAccountService] Using REAL service (BANK_SERVICE_MODE=real)');
    return serviceInstance;
  }

  // Default: Use real service in production, allow fake in staging/dev
  if (nodeEnv === 'production') {
    serviceInstance = new RealBankAccountService();
    console.log('[BankAccountService] Using REAL service (production mode)');
  } else {
    // In staging/dev, check if fake service is available
    const fakeService = new FakeBankAccountService();
    if (fakeService.isAvailable()) {
      serviceInstance = fakeService;
      console.log('[BankAccountService] Using FAKE service (staging/development mode)');
    } else {
      serviceInstance = new RealBankAccountService();
      console.log('[BankAccountService] Using REAL service (fallback)');
    }
  }

  return serviceInstance;
}

/**
 * Reset the service instance (useful for testing)
 */
export function resetBankAccountService(): void {
  serviceInstance = null;
}

/**
 * Check if fake bank accounts are available
 */
export function isFakeBankAccountServiceAvailable(): boolean {
  const fakeService = new FakeBankAccountService();
  return fakeService.isAvailable();
}

