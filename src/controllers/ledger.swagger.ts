import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';

export function ApiExecutePayIn() {
  return applyDecorators(
    ApiOperation({
      summary: 'Execute canonical 14-posting Pay-In chain',
      description:
        'Processes incoming payment from payer, credits merchant, deducts platform fee (10%), distributes provider and affiliate commissions, sets aside rolling reserve (5%), and records net profit.',
    }),
    ApiResponse({
      status: 200,
      description: 'Payment executed successfully or retrieved from idempotency cache',
      schema: {
        example: {
          transactionId: 'a7b3c4d5-e6f7-4a8b-9c0d-1e2f3a4b5c6d',
          status: 'POSTED',
          idempotencyKey: 'payin_test_001',
          isCached: false,
          postingsCount: 14,
          affectedAccountsCount: 13,
        },
      },
    }),
    ApiResponse({
      status: 400,
      description: 'Validation error or insufficient funds on payer account',
      schema: {
        example: {
          statusCode: 400,
          message:
            'Insufficient funds on account CLIENT_ALICE_USD (11111111-1111-1111-1111-111111111111). Current balance: 5000, required delta: -10000, projected: -5000',
          error: 'Bad Request',
        },
      },
    }),
  );
}

export function ApiExecutePayOut() {
  return applyDecorators(
    ApiOperation({
      summary: 'Execute merchant payout (Pay-Out)',
      description:
        'Debits payout amount from merchant account, transfers to recipient via provider transit account, and deducts fixed platform fee ($2.00).',
    }),
    ApiResponse({
      status: 200,
      description: 'Payout executed successfully',
      schema: {
        example: {
          transactionId: 'b8c4d5e6-f7a8-4b9c-0d1e-2f3a4b5c6d7e',
          status: 'POSTED',
          idempotencyKey: 'payout_test_001',
          isCached: false,
          postingsCount: 3,
          affectedAccountsCount: 4,
        },
      },
    }),
    ApiResponse({
      status: 400,
      description: 'Insufficient funds on merchant account (overdraft prevention)',
      schema: {
        example: {
          statusCode: 400,
          message:
            'Insufficient funds on account MERCH_ALPHA_USD (22222222-2222-2222-2222-222222222222). Current balance: 1000, required delta: -5200, projected: -4200',
          error: 'Bad Request',
        },
      },
    }),
  );
}

export function ApiExecuteTransaction() {
  return applyDecorators(
    ApiOperation({
      summary: 'Execute arbitrary batch of double-entry postings',
      description:
        'Executes an arbitrary batch of double-entry postings. Validates zero-sum invariant (Debits = Credits), acquires locks in deterministic sorted order, and applies updates atomically.',
    }),
    ApiResponse({
      status: 200,
      description: 'Transaction posted successfully',
      schema: {
        example: {
          transactionId: 'c9d5e6f7-a8b9-4c0d-1e2f-3a4b5c6d7e8f',
          status: 'POSTED',
          idempotencyKey: 'tx_custom_001',
          isCached: false,
          postingsCount: 2,
          affectedAccountsCount: 2,
        },
      },
    }),
    ApiResponse({
      status: 400,
      description: 'Double-entry invariant violation or insufficient funds',
      schema: {
        example: {
          statusCode: 400,
          message: 'Double-entry invariant violated: sum of deltas is 500, expected 0',
          error: 'Bad Request',
        },
      },
    }),
  );
}

export function ApiGetAccount() {
  return applyDecorators(
    ApiOperation({
      summary: 'Get account details and current balance',
      description:
        'Retrieves account information by UUID or account number (e.g. MERCH_ALPHA_USD or REVENUE_USD_01). For bucketed accounts, also returns the consolidated group balance.',
    }),
    ApiParam({
      name: 'identifier',
      description: 'Account UUID or text account number (e.g. CLIENT_ALICE_USD)',
      example: 'CLIENT_ALICE_USD',
    }),
    ApiResponse({
      status: 200,
      description: 'Account details retrieved successfully',
      schema: {
        example: {
          id: '11111111-1111-1111-1111-111111111111',
          number: 'CLIENT_ALICE_USD',
          type: 'CLIENT',
          currency: 'USD',
          balance: '500000',
          allowNegative: false,
          bucketGroup: null,
          consolidatedGroupBalance: null,
          updatedAt: '2026-10-01T14:30:00.000Z',
        },
      },
    }),
    ApiResponse({
      status: 400,
      description: 'Account not found',
      schema: {
        example: {
          statusCode: 400,
          message: 'Account not found: NON_EXISTENT_ACC',
          error: 'Bad Request',
        },
      },
    }),
  );
}

export function ApiGetAccountStatement() {
  return applyDecorators(
    ApiOperation({
      summary: 'Get account transaction statement',
      description:
        'Returns an immutable audit log of postings for the specified account, indicating direction (DEBIT/CREDIT), parent transaction, and counterparty accounts.',
    }),
    ApiParam({
      name: 'id',
      description: 'Account UUID or text account number',
      example: 'CLIENT_ALICE_USD',
    }),
    ApiQuery({
      name: 'limit',
      required: false,
      description: 'Maximum number of recent postings to return (defaults to 50)',
      example: 50,
    }),
    ApiResponse({
      status: 200,
      description: 'Account statement retrieved successfully',
      schema: {
        example: [
          {
            posting_id: 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a',
            sequence_number: 1,
            transaction_id: 'a7b3c4d5-e6f7-4a8b-9c0d-1e2f3a4b5c6d',
            idempotency_key: 'payin_test_001',
            transaction_type: 'PAY_IN',
            debit_account_id: '11111111-1111-1111-1111-111111111111',
            debit_account_number: 'CLIENT_ALICE_USD',
            credit_account_id: '33333333-3333-3333-3333-333333333333',
            credit_account_number: 'PROV_MAIN_USD',
            amount: '10000',
            currency: 'USD',
            created_at: '2026-10-01T14:30:00.000Z',
            direction: 'DEBIT',
          },
        ],
      },
    }),
  );
}

export function ApiRunAudit() {
  return applyDecorators(
    ApiOperation({
      summary: 'Trigger global ledger reconciliation audit',
      description:
        'Reconciles materialized account balances against the immutable posting history using the invariant: Current Balance == Sum(Credits) - Sum(Debits). Detects any discrepancies down to the cent.',
    }),
    ApiResponse({
      status: 200,
      description: 'Reconciliation report generated',
      schema: {
        example: {
          checkedAt: '2026-10-01T14:35:00.000Z',
          totalAccountsChecked: 28,
          discrepanciesCount: 0,
          status: 'HEALTHY',
          discrepancies: [],
        },
      },
    }),
  );
}

export function ApiGetTransactionDetails() {
  return applyDecorators(
    ApiOperation({
      summary: 'Get transaction details and all associated postings',
      description:
        'Retrieves the full transaction record along with the ordered list of double-entry postings associated with it.',
    }),
    ApiParam({
      name: 'identifier',
      description: 'Transaction UUID or idempotency_key',
      example: 'PAYIN-TEST-001',
    }),
    ApiResponse({
      status: 200,
      description: 'Transaction details retrieved successfully',
      schema: {
        example: {
          id: 'c9d5e6f7-a8b9-4c0d-1e2f-3a4b5c6d7e8f',
          idempotencyKey: 'PAYIN-TEST-001',
          type: 'PAY_IN',
          status: 'POSTED',
          description: 'Test Pay-In from Alice',
          createdAt: '2026-10-01T14:35:00.000Z',
          postings: [
            {
              id: 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a',
              sequenceNumber: 1,
              debitAccountId: '11111111-1111-1111-1111-111111111111',
              debitAccountNumber: 'CLIENT_ALICE_USD',
              creditAccountId: '33333333-3333-3333-3333-333333333333',
              creditAccountNumber: 'PROV_MAIN_USD',
              amount: '10000',
              currency: 'USD',
              createdAt: '2026-10-01T14:35:00.000Z',
            }
          ]
        },
      },
    }),
    ApiResponse({
      status: 400,
      description: 'Transaction not found',
      schema: {
        example: {
          statusCode: 400,
          message: 'Transaction not found: PAYIN-TEST-001',
          error: 'Bad Request',
        },
      },
    }),
  );
}
