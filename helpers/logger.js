import { LOGS_DESTINATION } from '../config/config.js';
import pino from 'pino';

export default pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'UTC:yyyy-mm-dd HH:MM:ss.l',
      destination: LOGS_DESTINATION,
    },
  },
});
