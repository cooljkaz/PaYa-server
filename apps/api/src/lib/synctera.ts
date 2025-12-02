/**
 * Synctera BaaS Integration
 * 
 * Handles all banking operations through Synctera's API:
 * - Customer (KYC) management
 * - Account management
 * - ACH transfers (load/redeem)
 */

import { logger } from './logger.js';

// Environment configuration
const SYNCTERA_API_KEY = process.env.SYNCTERA_API;
const SYNCTERA_BASE_URL = process.env.SYNCTERA_ENV === 'production'
  ? 'https://api.synctera.com/v0'
  : 'https://api-sandbox.synctera.com/v0';

// Types
export interface SyncteraCustomer {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone_number?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'PROSPECT' | 'DENIED';
  verification_status?: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
  created_time: string;
}

export interface SyncteraAccount {
  id: string;
  account_number?: string;
  routing_number?: string;
  account_type: 'CHECKING' | 'SAVINGS';
  status: 'ACTIVE' | 'INACTIVE' | 'CLOSED';
  balance: number;
  available_balance: number;
  currency: string;
  customer_ids: string[];
  created_time: string;
}

export interface SyncteraExternalAccount {
  id: string;
  account_owner_names: string[];
  bank_name?: string;
  routing_number: string;
  account_number: string;
  account_type: 'CHECKING' | 'SAVINGS';
  status: 'ACTIVE' | 'INACTIVE' | 'VERIFICATION_PENDING';
  customer_id: string;
  created_time: string;
}

export interface SyncteraACHTransaction {
  id: string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  direction: 'CREDIT' | 'DEBIT';
  originating_account_id: string;
  receiving_account_id: string;
  created_time: string;
  effective_date?: string;
}

export interface CreateCustomerInput {
  first_name: string;
  last_name: string;
  email?: string;
  phone_number: string;
  dob?: string; // YYYY-MM-DD
  ssn_last_4?: string;
  address?: {
    address_line_1: string;
    city: string;
    state: string;
    postal_code: string;
    country_code: string;
  };
}

export interface CreateExternalAccountInput {
  customer_id: string;
  account_owner_names: string[];
  routing_number: string;
  account_number: string;
  account_type: 'CHECKING' | 'SAVINGS';
}

export interface ACHTransferInput {
  amount: number; // in cents
  originating_account_id: string;
  receiving_account_id: string;
  currency?: string;
  memo?: string;
}

class SyncteraClient {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    if (!SYNCTERA_API_KEY) {
      logger.warn('SYNCTERA_API key not configured');
    }
    this.apiKey = SYNCTERA_API_KEY || '';
    this.baseUrl = SYNCTERA_BASE_URL;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const data = await response.json() as unknown;

      if (!response.ok) {
        const errorData = data as { message?: string; code?: string };
        logger.error({ 
          endpoint, 
          status: response.status, 
          error: data 
        }, 'Synctera API error');
        throw new SyncteraError(
          errorData.message || 'Synctera API error',
          response.status,
          errorData.code
        );
      }

      return data as T;
    } catch (error) {
      if (error instanceof SyncteraError) {
        throw error;
      }
      logger.error({ endpoint, error }, 'Synctera request failed');
      throw new SyncteraError('Failed to connect to Synctera', 500);
    }
  }

  /**
   * Check if Synctera is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  // ==================== CUSTOMER MANAGEMENT ====================

  /**
   * Create a personal customer (required for KYC)
   */
  async createCustomer(input: CreateCustomerInput): Promise<SyncteraCustomer> {
    return this.request<SyncteraCustomer>('/customers', {
      method: 'POST',
      body: JSON.stringify({
        ...input,
        customer_type: 'PERSONAL',
        status: 'PROSPECT',
      }),
    });
  }

  /**
   * Get customer by ID
   */
  async getCustomer(customerId: string): Promise<SyncteraCustomer> {
    return this.request<SyncteraCustomer>(`/customers/${customerId}`);
  }

  /**
   * Update customer information
   */
  async updateCustomer(
    customerId: string, 
    updates: Partial<CreateCustomerInput>
  ): Promise<SyncteraCustomer> {
    return this.request<SyncteraCustomer>(`/customers/${customerId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  /**
   * Trigger KYC verification for customer
   */
  async verifyCustomer(customerId: string): Promise<{ verification_id: string }> {
    return this.request<{ verification_id: string }>('/verifications/verify', {
      method: 'POST',
      body: JSON.stringify({
        customer_id: customerId,
        verification_type: 'IDENTITY',
      }),
    });
  }

  // ==================== ACCOUNT MANAGEMENT ====================

  /**
   * Create an internal wallet account for the customer (their PaYa wallet backing account)
   * Account type is defined by SYNCTERA_ACCOUNT_TEMPLATE_ID (should be a simple checking/wallet account)
   */
  async createAccount(customerId: string): Promise<SyncteraAccount> {
    if (!process.env.SYNCTERA_ACCOUNT_TEMPLATE_ID) {
      throw new SyncteraError('SYNCTERA_ACCOUNT_TEMPLATE_ID not configured', 500);
    }
    
    return this.request<SyncteraAccount>('/accounts', {
      method: 'POST',
      body: JSON.stringify({
        customer_ids: [customerId],
        account_template_id: process.env.SYNCTERA_ACCOUNT_TEMPLATE_ID,
      }),
    });
  }

  /**
   * Get account details
   */
  async getAccount(accountId: string): Promise<SyncteraAccount> {
    return this.request<SyncteraAccount>(`/accounts/${accountId}`);
  }

  /**
   * Get account balance
   */
  async getAccountBalance(accountId: string): Promise<{ balance: number; available_balance: number }> {
    const account = await this.getAccount(accountId);
    return {
      balance: account.balance,
      available_balance: account.available_balance,
    };
  }

  // ==================== EXTERNAL ACCOUNTS (User's Bank) ====================

  /**
   * Link an external bank account (for ACH transfers)
   */
  async createExternalAccount(input: CreateExternalAccountInput): Promise<SyncteraExternalAccount> {
    return this.request<SyncteraExternalAccount>('/external_accounts', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  /**
   * Get external account details
   */
  async getExternalAccount(accountId: string): Promise<SyncteraExternalAccount> {
    return this.request<SyncteraExternalAccount>(`/external_accounts/${accountId}`);
  }

  /**
   * List external accounts for a customer
   */
  async listExternalAccounts(customerId: string): Promise<{ external_accounts: SyncteraExternalAccount[] }> {
    return this.request<{ external_accounts: SyncteraExternalAccount[] }>(
      `/external_accounts?customer_id=${customerId}`
    );
  }

  /**
   * Initiate micro-deposit verification for external account
   */
  async initiateMicroDeposits(externalAccountId: string): Promise<{ verification_id: string }> {
    return this.request<{ verification_id: string }>('/external_accounts/micro_deposits', {
      method: 'POST',
      body: JSON.stringify({
        external_account_id: externalAccountId,
      }),
    });
  }

  /**
   * Verify micro-deposits
   */
  async verifyMicroDeposits(
    externalAccountId: string,
    amounts: [number, number] // Two micro-deposit amounts in cents
  ): Promise<SyncteraExternalAccount> {
    return this.request<SyncteraExternalAccount>(
      `/external_accounts/${externalAccountId}/micro_deposits/verify`,
      {
        method: 'POST',
        body: JSON.stringify({ amounts }),
      }
    );
  }

  // ==================== ACH TRANSFERS ====================

  /**
   * Initiate ACH pull (load money from external bank to PaYa account)
   * Direction: DEBIT from external, CREDIT to internal
   */
  async initiateACHPull(input: ACHTransferInput): Promise<SyncteraACHTransaction> {
    return this.request<SyncteraACHTransaction>('/ach', {
      method: 'POST',
      body: JSON.stringify({
        amount: input.amount,
        currency: input.currency || 'USD',
        originating_account_id: input.originating_account_id, // External account
        receiving_account_id: input.receiving_account_id, // Internal PaYa account
        dc_sign: 'DEBIT', // Debit from external
        memo: input.memo,
      }),
    });
  }

  /**
   * Initiate ACH push (redeem money from PaYa account to external bank)
   * Direction: DEBIT from internal, CREDIT to external
   */
  async initiateACHPush(input: ACHTransferInput): Promise<SyncteraACHTransaction> {
    return this.request<SyncteraACHTransaction>('/ach', {
      method: 'POST',
      body: JSON.stringify({
        amount: input.amount,
        currency: input.currency || 'USD',
        originating_account_id: input.originating_account_id, // Internal PaYa account
        receiving_account_id: input.receiving_account_id, // External account
        dc_sign: 'CREDIT', // Credit to external
        memo: input.memo,
      }),
    });
  }

  /**
   * Get ACH transaction status
   */
  async getACHTransaction(transactionId: string): Promise<SyncteraACHTransaction> {
    return this.request<SyncteraACHTransaction>(`/ach/${transactionId}`);
  }

  /**
   * List ACH transactions for an account
   */
  async listACHTransactions(accountId: string): Promise<{ ach_transactions: SyncteraACHTransaction[] }> {
    return this.request<{ ach_transactions: SyncteraACHTransaction[] }>(
      `/ach?account_id=${accountId}`
    );
  }

  // ==================== WEBHOOKS ====================

  /**
   * Verify webhook signature (call this in your webhook handler)
   */
  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    return signature === expectedSignature;
  }
}

// Custom error class for Synctera errors
export class SyncteraError extends Error {
  public statusCode: number;
  public code?: string;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.name = 'SyncteraError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

// Export singleton instance
export const synctera = new SyncteraClient();
export default synctera;

