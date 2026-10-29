export class InvalidEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = InvalidEventError.name;
  }
}
