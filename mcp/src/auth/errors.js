export class LoginRequiredError extends Error {
  constructor(message = 'Not authenticated with the quasar-graph backend. Run the "login" tool, then retry.') {
    super(message);
    this.name = 'LoginRequiredError';
  }
}

export class InvalidGrantError extends Error {
  constructor(message = 'OAuth grant was rejected by the backend.') {
    super(message);
    this.name = 'InvalidGrantError';
  }
}
