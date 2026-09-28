export class MarketplaceAdapter {
  constructor(integration) {
    this.integration = integration;
  }

  /**
   * Verify the authenticity of the incoming request.
   * To be implemented by specific marketplace adapters.
   * @param {Request} req
   * @param {string} rawBody
   * @returns {Promise<boolean>}
   */
  async verifyRequest(req, rawBody) {
    throw new Error("Not implemented");
  }

  /**
   * Extract the external event ID from the payload.
   * @param {Object} payload
   * @returns {string}
   */
  getEventId(payload) {
    throw new Error("Not implemented");
  }

  /**
   * Extract the event type from the payload.
   * @param {Object} payload
   * @returns {string}
   */
  getEventType(payload) {
    throw new Error("Not implemented");
  }

  /**
   * Extract the idempotency key for this event.
   * Often this is just the eventId, but sometimes it requires a combination of fields.
   * @param {Object} payload
   * @returns {string}
   */
  getIdempotencyKey(payload) {
    return this.getEventId(payload);
  }

  /**
   * Parse the raw event payload into a safe JSON object.
   * @param {string} rawBody
   * @returns {Object}
   */
  parseEvent(rawBody) {
    return JSON.parse(rawBody);
  }

  /**
   * Normalize the provider-specific order into the internal representation.
   * @param {Object} payload
   * @returns {Object} NormalizedOrder
   */
  normalizeOrder(payload) {
    throw new Error("Not implemented");
  }

  /**
   * Determines if the event indicates an order is paid/ready for processing.
   * @param {Object} payload
   * @returns {boolean}
   */
  isOrderPaidEvent(payload) {
    throw new Error("Not implemented");
  }
}
