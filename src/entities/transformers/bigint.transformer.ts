import { ValueTransformer } from 'typeorm';

export class BigIntTransformer implements ValueTransformer {
  to(data: bigint | number | string | null | undefined): string | null {
    if (data === null || data === undefined) {
      return null;
    }
    return data.toString();
  }

  from(data: string | number | null | undefined): bigint {
    if (data === null || data === undefined) {
      return 0n;
    }
    return BigInt(data);
  }
}
