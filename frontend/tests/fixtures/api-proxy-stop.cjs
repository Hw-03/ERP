// Exercise JavaScript shutdown handlers on Windows, where kill(SIGTERM) is a
// forced termination. Loaded only by tests through the child's --require flag.
process.on('message', message => { if (message === 'stop') process.emit('SIGTERM'); });

// A missing fixture .env must fail locally, never probe the developer/employee servers.
const http = require('node:http');
const originalRequest = http.request;
http.request = function guardedRequest(options, ...args) {
  if (options && [3000, 3001, 8010, 8011].includes(Number(options.port))) {
    throw Object.assign(new Error('Protected port denied by isolated test'), { code: 'TEST_PROTECTED_PORT' });
  }
  return Reflect.apply(originalRequest, this, [options, ...args]);
};
