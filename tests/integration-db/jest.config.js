// Suíte contra um Postgres real (`npm run test:db`). Separada do `npm test`, que usa pool mockado.
// Precisa de TEST_DATABASE_URL apontando para um banco descartável; sem ela, a suíte é pulada.
module.exports = {
  rootDir: '../..',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/integration-db/**/*.test.js'],
  testTimeout: 60000,
}
