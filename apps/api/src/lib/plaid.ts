/**
 * Plaid Integration
 * 
 * Used for instant bank account linking via Plaid Link.
 * Account details are then passed to Synctera for ACH transfers.
 */

import { 
  Configuration, 
  PlaidApi, 
  PlaidEnvironments,
  Products,
  CountryCode,
  LinkTokenCreateRequest,
  ItemPublicTokenExchangeRequest,
  AuthGetRequest,
  InstitutionsGetByIdRequest,
} from 'plaid';
import { logger } from './logger.js';

// Environment configuration
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET = process.env.PLAID_SECRET;
const PLAID_ENV = process.env.PLAID_ENV || 'sandbox'; // sandbox, development, production

// Determine Plaid environment
const plaidEnv = PLAID_ENV === 'production' 
  ? PlaidEnvironments.production 
  : PLAID_ENV === 'development'
    ? PlaidEnvironments.development
    : PlaidEnvironments.sandbox;

// Types
export interface PlaidLinkToken {
  linkToken: string;
  expiration: string;
  requestId: string;
}

export interface PlaidAccountDetails {
  accountId: string;
  accountName: string;
  accountMask: string;
  accountType: string; // checking, savings
  accountSubtype: string;
  routingNumber: string;
  accountNumber: string;
  wireRoutingNumber?: string;
}

export interface PlaidInstitution {
  institutionId: string;
  name: string;
  logo?: string;
  primaryColor?: string;
}

export interface PlaidExchangeResult {
  accessToken: string;
  itemId: string;
  accounts: PlaidAccountDetails[];
  institution?: PlaidInstitution;
}

class PlaidClient {
  private client: PlaidApi | null = null;

  constructor() {
    if (PLAID_CLIENT_ID && PLAID_SECRET) {
      const configuration = new Configuration({
        basePath: plaidEnv,
        baseOptions: {
          headers: {
            'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
            'PLAID-SECRET': PLAID_SECRET,
          },
        },
      });
      this.client = new PlaidApi(configuration);
      logger.info({ env: PLAID_ENV }, 'Plaid client initialized');
    } else {
      logger.warn('Plaid credentials not configured');
    }
  }

  /**
   * Check if Plaid is configured
   */
  isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Create a Link token for Plaid Link initialization
   */
  async createLinkToken(
    userId: string,
    options?: {
      accessToken?: string; // For update mode
      redirectUri?: string; // For OAuth
      phoneNumber?: string; // Prefill phone number (E.164 format)
    }
  ): Promise<PlaidLinkToken> {
    if (!this.client) {
      throw new PlaidError('Plaid not configured', 'PLAID_NOT_CONFIGURED');
    }

    const request: LinkTokenCreateRequest = {
      user: {
        client_user_id: userId,
        // Prefill phone number if provided (must be E.164 format: +1XXXXXXXXXX)
        ...(options?.phoneNumber && { phone_number: options.phoneNumber }),
      },
      client_name: 'PaYa',
      products: [Products.Auth], // Auth gives us account/routing numbers
      country_codes: [CountryCode.Us],
      language: 'en',
      // Optional: for OAuth redirect flow
      ...(options?.redirectUri && { redirect_uri: options.redirectUri }),
      // Optional: for update mode (re-authenticate existing connection)
      ...(options?.accessToken && { access_token: options.accessToken }),
    };

    try {
      const response = await this.client.linkTokenCreate(request);
      
      return {
        linkToken: response.data.link_token,
        expiration: response.data.expiration,
        requestId: response.data.request_id,
      };
    } catch (error: any) {
      logger.error({ error: error.response?.data || error.message }, 'Plaid linkTokenCreate failed');
      throw new PlaidError(
        error.response?.data?.error_message || 'Failed to create link token',
        error.response?.data?.error_code || 'LINK_TOKEN_ERROR'
      );
    }
  }

  /**
   * Exchange public token for access token and get account details
   */
  async exchangePublicToken(publicToken: string): Promise<PlaidExchangeResult> {
    if (!this.client) {
      throw new PlaidError('Plaid not configured', 'PLAID_NOT_CONFIGURED');
    }

    try {
      // Exchange public token for access token
      const exchangeRequest: ItemPublicTokenExchangeRequest = {
        public_token: publicToken,
      };
      const exchangeResponse = await this.client.itemPublicTokenExchange(exchangeRequest);
      const accessToken = exchangeResponse.data.access_token;
      const itemId = exchangeResponse.data.item_id;

      // Get account details with Auth (routing/account numbers)
      const authRequest: AuthGetRequest = {
        access_token: accessToken,
      };
      const authResponse = await this.client.authGet(authRequest);

      // Get institution details
      let institution: PlaidInstitution | undefined;
      if (authResponse.data.item.institution_id) {
        try {
          const instRequest: InstitutionsGetByIdRequest = {
            institution_id: authResponse.data.item.institution_id,
            country_codes: [CountryCode.Us],
            options: {
              include_optional_metadata: true,
            },
          };
          const instResponse = await this.client.institutionsGetById(instRequest);
          institution = {
            institutionId: instResponse.data.institution.institution_id,
            name: instResponse.data.institution.name,
            logo: instResponse.data.institution.logo || undefined,
            primaryColor: instResponse.data.institution.primary_color || undefined,
          };
        } catch (instError) {
          logger.warn({ error: instError }, 'Failed to get institution details');
        }
      }

      // Map accounts with their routing/account numbers
      const accounts: PlaidAccountDetails[] = authResponse.data.accounts.map(account => {
        // Find the matching numbers entry
        const numbers = authResponse.data.numbers.ach.find(
          n => n.account_id === account.account_id
        );

        return {
          accountId: account.account_id,
          accountName: account.name,
          accountMask: account.mask || '',
          accountType: account.type,
          accountSubtype: account.subtype || '',
          routingNumber: numbers?.routing || '',
          accountNumber: numbers?.account || '',
          wireRoutingNumber: numbers?.wire_routing || undefined,
        };
      });

      return {
        accessToken,
        itemId,
        accounts,
        institution,
      };
    } catch (error: any) {
      logger.error({ error: error.response?.data || error.message }, 'Plaid exchange failed');
      throw new PlaidError(
        error.response?.data?.error_message || 'Failed to exchange token',
        error.response?.data?.error_code || 'EXCHANGE_ERROR'
      );
    }
  }

  /**
   * Get accounts for an existing access token
   */
  async getAccounts(accessToken: string): Promise<PlaidAccountDetails[]> {
    if (!this.client) {
      throw new PlaidError('Plaid not configured', 'PLAID_NOT_CONFIGURED');
    }

    try {
      const authRequest: AuthGetRequest = {
        access_token: accessToken,
      };
      const authResponse = await this.client.authGet(authRequest);

      return authResponse.data.accounts.map(account => {
        const numbers = authResponse.data.numbers.ach.find(
          n => n.account_id === account.account_id
        );

        return {
          accountId: account.account_id,
          accountName: account.name,
          accountMask: account.mask || '',
          accountType: account.type,
          accountSubtype: account.subtype || '',
          routingNumber: numbers?.routing || '',
          accountNumber: numbers?.account || '',
          wireRoutingNumber: numbers?.wire_routing || undefined,
        };
      });
    } catch (error: any) {
      logger.error({ error: error.response?.data || error.message }, 'Plaid getAccounts failed');
      throw new PlaidError(
        error.response?.data?.error_message || 'Failed to get accounts',
        error.response?.data?.error_code || 'AUTH_ERROR'
      );
    }
  }

  /**
   * Remove an Item (unlink bank)
   */
  async removeItem(accessToken: string): Promise<void> {
    if (!this.client) {
      throw new PlaidError('Plaid not configured', 'PLAID_NOT_CONFIGURED');
    }

    try {
      await this.client.itemRemove({
        access_token: accessToken,
      });
    } catch (error: any) {
      logger.error({ error: error.response?.data || error.message }, 'Plaid removeItem failed');
      // Don't throw - removal is best effort
    }
  }
}

// Custom error class for Plaid errors
export class PlaidError extends Error {
  public code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'PlaidError';
    this.code = code;
  }
}

// Export singleton instance
export const plaid = new PlaidClient();
export default plaid;

