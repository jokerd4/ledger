import { registerAs } from '@nestjs/config';

export interface AppConfig {
  port: number;
  nodeEnv: string;
}

export const appConfig = registerAs(
  'app',
  (): AppConfig => ({
    port: Number(process.env.PORT)!,
    nodeEnv: process.env.NODE_ENV!,
  }),
);
