export class DnwError extends Error {
  constructor(message: string, public next?: string) {
    super(message);
    this.name = 'DnwError';
  }
}
