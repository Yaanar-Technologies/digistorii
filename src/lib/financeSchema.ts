import { Pool, PoolClient } from "pg";

type Queryable = Pool | PoolClient;

export async function ensureFinanceSchema(client: Queryable, schema: string): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".finance_expenses (
      id BIGSERIAL PRIMARY KEY,
      category VARCHAR(50) NOT NULL,
      title VARCHAR(200) NOT NULL,
      amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
      expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
      payment_mode VARCHAR(50) DEFAULT 'Bank Transfer',
      reference_no VARCHAR(100),
      notes TEXT,
      created_by VARCHAR(100),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_finance_expenses_date ON "${schema}".finance_expenses(expense_date);
    CREATE INDEX IF NOT EXISTS idx_finance_expenses_category ON "${schema}".finance_expenses(category);

    CREATE TABLE IF NOT EXISTS "${schema}".finance_settlements (
      id BIGSERIAL PRIMARY KEY,
      channel VARCHAR(20) NOT NULL CHECK (channel IN ('razorpay', 'cod', 'pos')),
      settlement_ref VARCHAR(100),
      amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      fees NUMERIC(12,2) NOT NULL DEFAULT 0,
      tax NUMERIC(12,2) NOT NULL DEFAULT 0,
      net_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      settled_at DATE NOT NULL DEFAULT CURRENT_DATE,
      bank_reference VARCHAR(100),
      status VARCHAR(20) NOT NULL DEFAULT 'settled' CHECK (status IN ('pending', 'settled')),
      notes TEXT,
      created_by VARCHAR(100),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_finance_settlements_channel ON "${schema}".finance_settlements(channel);
    CREATE INDEX IF NOT EXISTS idx_finance_settlements_date ON "${schema}".finance_settlements(settled_at);
  `);
}
