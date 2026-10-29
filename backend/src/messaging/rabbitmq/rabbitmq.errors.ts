export class PermanentRabbitMqMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = PermanentRabbitMqMessageError.name;
  }
}
