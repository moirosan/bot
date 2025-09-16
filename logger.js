import winston from 'winston';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} ${level} ${message}`;
    })
  ),
  transports: [
    new winston.transports.File({
      filename: join(__dirname, 'logs', 'commands.log'),
      maxsize: 10 * 1024 * 1024, // 10 MB
      maxFiles: 1,
      tailable: true
    })
  ]
});