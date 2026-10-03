// SCHEDULER_MODE (plano docs/superpowers/plans/2026-10-02-agendador-externo-sleep.md, Task 1).
const { resolverModoAgendador, iniciarTarefasDeFundo } = require('../../src/config/schedulerMode')

describe('resolverModoAgendador', () => {
  test('sem a variável (ou vazia), o agendador é interno, como sempre foi', () => {
    expect(resolverModoAgendador({})).toBe('internal')
    expect(resolverModoAgendador({ SCHEDULER_MODE: '   ' })).toBe('internal')
  })

  test('aceita external com espaços e maiúsculas', () => {
    expect(resolverModoAgendador({ SCHEDULER_MODE: ' External ' })).toBe('external')
    expect(resolverModoAgendador({ SCHEDULER_MODE: 'INTERNAL' })).toBe('internal')
  })

  test('valor inválido impede a subida, com a variável na mensagem', () => {
    expect(() => resolverModoAgendador({ SCHEDULER_MODE: 'cron' })).toThrow(/SCHEDULER_MODE/)
  })
})

describe('iniciarTarefasDeFundo', () => {
  test('em external não liga o node-cron', () => {
    const scheduler = { start: jest.fn() }
    expect(iniciarTarefasDeFundo({ modo: 'external', scheduler })).toBe(false)
    expect(scheduler.start).not.toHaveBeenCalled()
  })

  test('em internal liga o node-cron uma vez', () => {
    const scheduler = { start: jest.fn() }
    expect(iniciarTarefasDeFundo({ modo: 'internal', scheduler })).toBe(true)
    expect(scheduler.start).toHaveBeenCalledTimes(1)
  })
})
