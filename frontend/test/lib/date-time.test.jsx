import { toApiDateTime } from '../../src/components/ui/date-time-field.jsx'

describe('toApiDateTime', () => {
  it('envia o horário escolhido como um instante em UTC, que volta ao mesmo horário local', () => {
    const sent = toApiDateTime('2026-10-02T14:30')
    expect(sent).toMatch(/Z$/)
    const back = new Date(sent)
    expect([back.getFullYear(), back.getMonth() + 1, back.getDate(), back.getHours(), back.getMinutes()]).toEqual([2026, 10, 2, 14, 30])
  })

  it('deixa vazio e texto inválido como estão (a validação do formulário cuida deles)', () => {
    expect(toApiDateTime('')).toBe('')
    expect(toApiDateTime('amanhã')).toBe('amanhã')
  })
})
