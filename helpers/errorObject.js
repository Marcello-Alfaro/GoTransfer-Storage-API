export default class ErrorObject extends Error {
  constructor(message, status, errors = []) {
    super(message);
    this.status = status;
    this.isOperational = true;
    this.errors = errors;

    Error.captureStackTrace(this, this.constructor);
  }
}
