/**
 * hermes.config.js — Protocol declaration for hermes-agent
 * Registers this repo in the Hermes ecosystem protocol.
 */
module.exports = {
  repo: 'hermes-agent',
  layer: 'agent',
  signals: ['hermes:online', 'hermes:scan', 'hermes:pulse', 'hermes:act', 'hermes:wake'],
  actions: ['scan', 'classify', 'push_file', 'create_issue', 'heartbeat'],
  endpoints: {}
};
