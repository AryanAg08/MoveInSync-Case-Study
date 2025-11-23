import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';

const logger = winston.createLogger({ transports: [ new winston.transports.Console() ] });

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  const traceId = uuidv4();
  logger.error({ traceId, path: req.path, message: err?.message, stack: err?.stack });
  const status = err?.statusCode || 500;
  const message = status >= 500 ? 'Internal server error' : err.message;
  res.status(status).json({ error: message, traceId });
}
