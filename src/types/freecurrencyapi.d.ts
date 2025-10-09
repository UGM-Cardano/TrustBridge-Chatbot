// Type declarations for @everapi/freecurrencyapi-js
declare module '@everapi/freecurrencyapi-js' {
  export interface FreecurrencyApiOptions {
    base_currency?: string;
    currencies?: string;
  }

  export interface FreecurrencyApiResponse {
    data: Record<string, number>;
  }

  export default class Freecurrencyapi {
    constructor(apiKey: string);
    latest(options?: FreecurrencyApiOptions): Promise<FreecurrencyApiResponse>;
    historical(options?: FreecurrencyApiOptions & { date: string }): Promise<FreecurrencyApiResponse>;
    currencies(): Promise<{ data: Record<string, { name: string; code: string }> }>;
    status(): Promise<{ quotas: Record<string, number> }>;
  }
}
